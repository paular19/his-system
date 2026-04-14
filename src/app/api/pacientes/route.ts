import { type NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { registrarAudit, extraerIP } from '@/lib/security/audit'
import {
  apiOk,
  apiCreado,
  apiNoAutorizado,
  apiForbidden,
  apiValidationError,
  manejarErrorApi,
} from '@/lib/utils/response'
import { CrearPacienteSchema, BusquedaPacienteSchema } from '@/modules/pacientes/schemas'
import * as pacientesService from '@/modules/pacientes/service'
import { ZodError } from 'zod'

// GET /api/pacientes - Listar / buscar pacientes
export async function GET(request: NextRequest) {
  try {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'PACIENTES', 'LEER')) {
      return apiForbidden()
    }

    const { searchParams } = request.nextUrl
    const params = BusquedaPacienteSchema.parse({
      q: searchParams.get('q') ?? undefined,
      numeroDocumento: searchParams.get('numeroDocumento') ?? undefined,
      apellido: searchParams.get('apellido') ?? undefined,
      nombre: searchParams.get('nombre') ?? undefined,
      historiaClinica: searchParams.get('historiaClinica') ?? undefined,
      pagina: searchParams.get('pagina') ?? 1,
      porPagina: searchParams.get('porPagina') ?? 20,
    })

    const resultado = await pacientesService.buscarPacientes(params)
    return apiOk(resultado)
  } catch (error) {
    if (error instanceof ZodError) return apiValidationError(error)
    return manejarErrorApi(error)
  }
}

// POST /api/pacientes - Crear paciente
export async function POST(request: NextRequest) {
  try {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'PACIENTES', 'CREAR')) {
      await registrarAudit({
        usuario: usuario.clerkId,
        accion: 'ACCESO_NEGADO',
        entidad: 'Paciente',
        detalle: 'Intento de crear paciente sin permisos',
        direccionIp: extraerIP(request),
      })
      return apiForbidden()
    }

    const body: unknown = await request.json()
    const data = CrearPacienteSchema.parse(body)

    const paciente = await pacientesService.crearPaciente(
      data,
      usuario.codigoUsuario,
      extraerIP(request)
    )

    return apiCreado(paciente)
  } catch (error) {
    if (error instanceof ZodError) return apiValidationError(error)
    return manejarErrorApi(error)
  }
}
