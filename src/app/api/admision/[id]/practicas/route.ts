import { type NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiForbidden, apiNotFound, apiOk, manejarErrorApi } from '@/lib/utils/response'
import * as admisionService from '@/modules/admision/service'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/admision/[id]/practicas
export async function GET(_request: NextRequest, { params }: RouteParams) {
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

    const practicas = await admisionService.obtenerPracticasIngreso(ingresoId)
    return apiOk(practicas)
  } catch (error) {
    return manejarErrorApi(error)
  }
}
