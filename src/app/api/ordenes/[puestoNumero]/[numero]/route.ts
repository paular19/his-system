import { type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import {
  apiOk,
  apiError,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  manejarErrorApi,
} from '@/lib/utils/response'
import { obtenerOrden } from '@/modules/orden/repository'
import { cambiarProfesionalOrdenAmbulatorio } from '@/modules/orden/service'
import { CambiarProfesionalOrdenSchema } from '@/modules/orden/schemas'

interface RouteParams {
  params: Promise<{ puestoNumero: string; numero: string }>
}

// GET /api/ordenes/[puestoNumero]/[numero]
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'AMBULATORIO', 'LEER')) {
      return apiForbidden()
    }

    const { puestoNumero: pStr, numero: nStr } = await params
    const puestoNumero = parseInt(pStr, 10)
    const numero = parseInt(nStr, 10)

    if (isNaN(puestoNumero) || isNaN(numero)) {
      return apiNotFound('Orden')
    }

    const orden = await obtenerOrden(puestoNumero, numero)
    if (!orden) return apiNotFound('Orden')

    return apiOk(orden)
  } catch (err) {
    return manejarErrorApi(err)
  }
}

// PATCH /api/ordenes/[puestoNumero]/[numero] — cambia el profesional que suscribe
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const usuario = await getUsuarioSesion()
    const puedeModificar =
      tienePermiso(usuario.rol, 'AMBULATORIO', 'MODIFICAR') ||
      tienePermiso(usuario.rol, 'ADMISION', 'MODIFICAR') ||
      tienePermiso(usuario.rol, 'FACTURACION', 'MODIFICAR')

    if (!puedeModificar) return apiForbidden()

    const { puestoNumero: pStr, numero: nStr } = await params
    const puestoNumero = parseInt(pStr, 10)
    const numero = parseInt(nStr, 10)

    if (isNaN(puestoNumero) || isNaN(numero)) {
      return apiNotFound('Orden')
    }

    const body = await request.json().catch(() => null)
    const parsed = CambiarProfesionalOrdenSchema.safeParse(body)
    if (!parsed.success) return apiValidationError(parsed.error)

    const ip = request.headers.get('x-forwarded-for') ?? undefined

    const resultado = await cambiarProfesionalOrdenAmbulatorio(
      {
        puestoNumero,
        numero,
        profesionalId: parsed.data.profesionalId,
        actualizarEfectorEspecialista: parsed.data.actualizarEfectorEspecialista,
      },
      usuario.codigoUsuario,
      ip
    )

    revalidatePath(`/ambulatorio/${puestoNumero}/${numero}`)

    return apiOk(resultado)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al cambiar el profesional'
    if (/anulada|facturada|no existe|no encontrada/i.test(message)) {
      return apiError(message, 409)
    }
    return manejarErrorApi(err)
  }
}
