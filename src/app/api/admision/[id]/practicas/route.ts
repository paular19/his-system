import { type NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiForbidden, apiNotFound, apiOk, manejarErrorApi } from '@/lib/utils/response'
import * as admisionService from '@/modules/admision/service'
import { prisma } from '@/lib/db'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/admision/[id]/practicas
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'ADMISION', 'LEER')) {
      return apiForbidden()
    }

    const { id } = await params
    const ingresoId = parseInt(id, 10)
    if (isNaN(ingresoId) || ingresoId <= 0) {
      return apiNotFound('Ingreso')
    }

    if (request.nextUrl.searchParams.get('soloPendientesIds') === '1') {
      const practicasPendientes = await prisma.practica.findMany({
        where: {
          ingresoId,
          NOT: { estado: 'X' },
          ordenPractica: {
            none: {
              orden: {
                estado: { not: 'X' },
              },
            },
          },
        },
        select: { id: true },
        orderBy: { id: 'asc' },
      })

      return apiOk(practicasPendientes.map((p) => p.id))
    }

    const practicas = await admisionService.obtenerPracticasIngreso(ingresoId)
    return apiOk(practicas)
  } catch (error) {
    return manejarErrorApi(error)
  }
}
