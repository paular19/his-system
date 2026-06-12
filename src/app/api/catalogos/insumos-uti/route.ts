import { type NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiForbidden, apiOk, manejarErrorApi } from '@/lib/utils/response'
import { obtenerCatalogoInsumosUti } from '@/lib/catalogos/insumos-uti'

function sanitizeQuery(value: string): string {
  return value.trim().slice(0, 100)
}

// GET /api/catalogos/insumos-uti?q=abocath&limit=50
export async function GET(request: NextRequest) {
  try {
    const usuario = await getUsuarioSesion()

    const puedeConsultar =
      tienePermiso(usuario.rol, 'ADMISION', 'LEER') ||
      tienePermiso(usuario.rol, 'INTERNACION', 'LEER') ||
      tienePermiso(usuario.rol, 'AMBULATORIO', 'LEER') ||
      tienePermiso(usuario.rol, 'FACTURACION', 'LEER')

    if (!puedeConsultar) {
      return apiForbidden()
    }

    const { searchParams } = request.nextUrl
    const q = sanitizeQuery(searchParams.get('q') ?? '')
    const takeRaw = Number.parseInt(searchParams.get('limit') ?? '100', 10)
    const take = Number.isFinite(takeRaw) ? Math.min(Math.max(takeRaw, 1), 5000) : 100

    const catalogo = obtenerCatalogoInsumosUti()
    const data = q
      ? catalogo.filter((item) => item.nombre.toLowerCase().includes(q.toLowerCase())).slice(0, take)
      : catalogo.slice(0, take)

    return apiOk(data)
  } catch (err) {
    return manejarErrorApi(err)
  }
}
