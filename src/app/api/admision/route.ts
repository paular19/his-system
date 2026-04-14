import { type NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { registrarAudit, extraerIP } from '@/lib/security/audit'
import {
  apiOk,
  apiCreado,
  apiForbidden,
  apiValidationError,
  manejarErrorApi,
} from '@/lib/utils/response'
import { CrearIngresoSchema, BusquedaIngresoSchema } from '@/modules/admision/schemas'
import * as admisionService from '@/modules/admision/service'
import { ZodError } from 'zod'

// GET /api/admision — Listar / buscar ingresos
export async function GET(request: NextRequest) {
  try {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'ADMISION', 'LEER')) {
      return apiForbidden()
    }

    const { searchParams } = request.nextUrl
    const params = BusquedaIngresoSchema.parse({
      q: searchParams.get('q') ?? undefined,
      tipoIngresoCodigo: searchParams.get('tipoIngresoCodigo') ?? undefined,
      estado: searchParams.get('estado') ?? undefined,
      fechaDesde: searchParams.get('fechaDesde') ?? undefined,
      fechaHasta: searchParams.get('fechaHasta') ?? undefined,
      pagina: searchParams.get('pagina') ?? 1,
      porPagina: searchParams.get('porPagina') ?? 20,
    })

    const resultado = await admisionService.buscarIngresos(params)
    return apiOk(resultado)
  } catch (error) {
    if (error instanceof ZodError) return apiValidationError(error)
    return manejarErrorApi(error)
  }
}

// POST /api/admision — Crear ingreso
export async function POST(request: NextRequest) {
  try {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'ADMISION', 'CREAR')) {
      await registrarAudit({
        usuario: usuario.clerkId,
        accion: 'ACCESO_NEGADO',
        entidad: 'Ingreso',
        detalle: 'Intento de crear ingreso sin permisos',
        direccionIp: extraerIP(request),
      })
      return apiForbidden()
    }

    const body: unknown = await request.json()
    const data = CrearIngresoSchema.parse(body)

    const ingreso = await admisionService.crearIngreso(
      data,
      usuario.codigoUsuario,
      extraerIP(request)
    )

    return apiCreado(ingreso)
  } catch (error) {
    if (error instanceof ZodError) return apiValidationError(error)
    return manejarErrorApi(error)
  }
}
