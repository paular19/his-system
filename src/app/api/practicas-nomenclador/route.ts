import { type NextRequest } from 'next/server'
import { getUsuarioSesionLectura } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiOk, apiForbidden, manejarErrorApi } from '@/lib/utils/response'
import { buscarPracticas } from '@/modules/orden/repository'
import NodeCache from 'node-cache'

const cache = new NodeCache({ stdTTL: 90 })

function sanitizeQuery(value: string): string {
  return value.trim().slice(0, 100)
}

function buildCacheKey(q: string, convenioId?: number): string {
  return `practicas-nomenclador:${q.toLowerCase()}:${convenioId ?? 'all'}`
}

// GET /api/practicas-nomenclador?q=consulta&convenioId=1
export async function GET(request: NextRequest) {
  try {
    const usuario = await getUsuarioSesionLectura()
    if (!tienePermiso(usuario.rol, 'AMBULATORIO', 'LEER')) {
      return apiForbidden()
    }

    const { searchParams } = request.nextUrl
    const q = sanitizeQuery(searchParams.get('q') ?? '')
    const convenioRaw = searchParams.get('convenioId')
    const convenioNumber = convenioRaw ? parseInt(convenioRaw, 10) : undefined
    const convenioId = Number.isFinite(convenioNumber) ? convenioNumber : undefined

    if (q.length < 2) return apiOk([])

    const cacheKey = buildCacheKey(q, convenioId)
    const cached = cache.get<Awaited<ReturnType<typeof buscarPracticas>>>(cacheKey)
    if (cached) return apiOk(cached)

    const practicas = await buscarPracticas(q, convenioId)
    cache.set(cacheKey, practicas)
    return apiOk(practicas)
  } catch (err) {
    return manejarErrorApi(err)
  }
}
