import { type NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { extraerIP } from '@/lib/security/audit'
import {
  apiOk,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  manejarErrorApi,
} from '@/lib/utils/response'
import { ActualizarIngresoSchema } from '@/modules/admision/schemas'
import * as admisionService from '@/modules/admision/service'
import { ZodError } from 'zod'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/admision/[id]
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

    const ingreso = await admisionService.obtenerIngreso(
      ingresoId,
      usuario.clerkId,
      extraerIP(request)
    )

    return apiOk(ingreso)
  } catch (error) {
    return manejarErrorApi(error)
  }
}

// PUT /api/admision/[id]
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'ADMISION', 'MODIFICAR')) {
      return apiForbidden()
    }

    const { id } = await params
    const ingresoId = parseInt(id, 10)
    if (isNaN(ingresoId) || ingresoId <= 0) {
      return apiNotFound('Ingreso')
    }

    const body: unknown = await request.json()
    const data = ActualizarIngresoSchema.parse(body)

    const actualizado = await admisionService.actualizarIngreso(
      ingresoId,
      data,
      usuario.codigoUsuario,
      extraerIP(request)
    )

    return apiOk(actualizado)
  } catch (error) {
    if (error instanceof ZodError) return apiValidationError(error)
    return manejarErrorApi(error)
  }
}
