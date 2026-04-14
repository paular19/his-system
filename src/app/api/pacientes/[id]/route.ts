import { type NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { extraerIP } from '@/lib/security/audit'
import {
  apiOk,
  apiNoAutorizado,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  manejarErrorApi,
} from '@/lib/utils/response'
import { ActualizarPacienteSchema } from '@/modules/pacientes/schemas'
import * as pacientesService from '@/modules/pacientes/service'
import { ZodError } from 'zod'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/pacientes/[id] - Obtener paciente por ID
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'PACIENTES', 'LEER')) {
      return apiForbidden()
    }

    const { id } = await params
    const pacienteId = parseInt(id, 10)
    if (isNaN(pacienteId) || pacienteId <= 0) {
      return apiNotFound('Paciente')
    }

    const paciente = await pacientesService.obtenerPaciente(
      pacienteId,
      usuario.clerkId,
      extraerIP(request)
    )

    return apiOk(paciente)
  } catch (error) {
    return manejarErrorApi(error)
  }
}

// PUT /api/pacientes/[id] - Actualizar paciente
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'PACIENTES', 'MODIFICAR')) {
      return apiForbidden()
    }

    const { id } = await params
    const pacienteId = parseInt(id, 10)
    if (isNaN(pacienteId) || pacienteId <= 0) {
      return apiNotFound('Paciente')
    }

    const body: unknown = await request.json()
    const data = ActualizarPacienteSchema.parse(body)

    const actualizado = await pacientesService.actualizarPaciente(
      pacienteId,
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
