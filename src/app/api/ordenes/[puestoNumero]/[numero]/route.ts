import { type NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiOk, apiForbidden, apiNotFound, manejarErrorApi } from '@/lib/utils/response'
import { obtenerOrden } from '@/modules/orden/repository'

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
