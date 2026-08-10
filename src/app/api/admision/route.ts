import { type NextRequest } from 'next/server'
import { getUsuarioSesionLectura } from '@/lib/auth'
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
    const usuario = await getUsuarioSesionLectura()
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
  const inicio = performance.now()
  try {
    const usuario = await getUsuarioSesionLectura()
    const despuesAuth = performance.now()
    const body: unknown = await request.json()
    const data = CrearIngresoSchema.parse(body)
    const puedeCrear =
      tienePermiso(usuario.rol, 'ADMISION', 'CREAR') ||
      (data.tipoIngresoCodigo === 'INT' && tienePermiso(usuario.rol, 'INTERNACION', 'CREAR'))

    if (!puedeCrear) {
      await registrarAudit({
        usuario: usuario.clerkId,
        accion: 'ACCESO_NEGADO',
        entidad: 'Ingreso',
        detalle: 'Intento de crear ingreso sin permisos',
        direccionIp: extraerIP(request),
      })
      return apiForbidden()
    }

    const despuesParse = performance.now()

    const ingreso = await admisionService.crearIngreso(
      data,
      usuario.codigoUsuario,
      extraerIP(request)
    )
    const despuesCrear = performance.now()

    const response = apiCreado({ id: ingreso.id })
    response.headers.set('x-ingreso-id', String(ingreso.id))
    response.headers.set(
      'server-timing',
      [
        `auth;dur=${(despuesAuth - inicio).toFixed(1)}`,
        `parse;dur=${(despuesParse - despuesAuth).toFixed(1)}`,
        `create;dur=${(despuesCrear - despuesParse).toFixed(1)}`,
        `total;dur=${(despuesCrear - inicio).toFixed(1)}`,
      ].join(', ')
    )
    response.headers.set('x-admision-auth-ms', String(Math.round(despuesAuth - inicio)))
    response.headers.set('x-admision-parse-ms', String(Math.round(despuesParse - despuesAuth)))
    response.headers.set('x-admision-create-ms', String(Math.round(despuesCrear - despuesParse)))
    response.headers.set('x-admision-total-ms', String(Math.round(despuesCrear - inicio)))
    return response
  } catch (error) {
    if (error instanceof ZodError) return apiValidationError(error)
    return manejarErrorApi(error)
  }
}
