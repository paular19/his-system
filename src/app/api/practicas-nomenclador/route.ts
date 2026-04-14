import { type NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiOk, apiForbidden, manejarErrorApi } from '@/lib/utils/response'
import { buscarPracticas } from '@/modules/orden/repository'

// GET /api/practicas-nomenclador?q=consulta&convenioId=1
export async function GET(request: NextRequest) {
  try {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'AMBULATORIO', 'LEER')) {
      return apiForbidden()
    }

    const { searchParams } = request.nextUrl
    const q = searchParams.get('q') ?? ''
    const convenioId = searchParams.get('convenioId')
      ? parseInt(searchParams.get('convenioId')!, 10)
      : undefined

    if (q.length < 2) return apiOk([])

    const practicas = await buscarPracticas(q, convenioId)
    return apiOk(practicas)
  } catch (err) {
    return manejarErrorApi(err)
  }
}
