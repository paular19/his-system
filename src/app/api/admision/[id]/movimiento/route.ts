import { type NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { extraerIP } from '@/lib/security/audit'
import {
  apiCreado,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  manejarErrorApi,
} from '@/lib/utils/response'
import { MovimientoIngresoSchema } from '@/modules/admision/schemas'
import * as admisionService from '@/modules/admision/service'
import { ZodError } from 'zod'

interface RouteParams {
  params: Promise<{ id: string }>
}

// POST /api/admision/[id]/movimiento
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'ADMISION', 'CREAR')) {
      return apiForbidden()
    }

    const { id } = await params
    const ingresoId = parseInt(id, 10)
    if (isNaN(ingresoId) || ingresoId <= 0) {
      return apiNotFound('Ingreso')
    }

    const body: unknown = await request.json()
    const data = MovimientoIngresoSchema.parse({ ...body, ingresoId })

    const movimiento = await admisionService.registrarMovimiento(
      data,
      usuario.codigoUsuario,
      extraerIP(request)
    )

    return apiCreado(movimiento)
  } catch (error) {
    if (error instanceof ZodError) return apiValidationError(error)
    return manejarErrorApi(error)
  }
}
