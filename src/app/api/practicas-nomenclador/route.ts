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

function buildCacheKey(q: string, convenioId?: number, lite = false): string {
  return `practicas-nomenclador:${q.toLowerCase()}:${convenioId ?? 'all'}:${lite ? 'lite' : 'full'}`
}

// GET /api/practicas-nomenclador?q=consulta&convenioId=1
export async function GET(request: NextRequest) {
  try {
    const usuario = await getUsuarioSesionLectura()
    const puedeBuscarPorAmbulatorio = tienePermiso(usuario.rol, 'AMBULATORIO', 'LEER')
    const puedeBuscarPorCotizador = tienePermiso(usuario.rol, 'COTIZADOR', 'LEER')
    if (!puedeBuscarPorAmbulatorio && !puedeBuscarPorCotizador) {
      return apiForbidden()
    }

    const { searchParams } = request.nextUrl
    const q = sanitizeQuery(searchParams.get('q') ?? '')
    const convenioRaw = searchParams.get('convenioId')
    const convenioNumber = convenioRaw ? parseInt(convenioRaw, 10) : undefined
    const convenioId = Number.isFinite(convenioNumber) ? convenioNumber : undefined
    const lite = searchParams.get('lite') === '1'
    const exactoCodigo = searchParams.get('exact') === '1'
    const fallbackRaw = searchParams.get('fallback')
    const fallbackGlobal = fallbackRaw != null ? fallbackRaw === '1' : !lite
    const limitRaw = searchParams.get('limit')
    const limitNumber = limitRaw ? parseInt(limitRaw, 10) : NaN
    const limit = Number.isFinite(limitNumber) ? Math.max(1, Math.min(limitNumber, 50)) : 20

    if (q.length < 2) return apiOk([])

    const cacheKey = `${buildCacheKey(q, convenioId, lite)}:${exactoCodigo ? 'exact' : 'mixed'}:${fallbackGlobal ? 'fb1' : 'fb0'}:${limit}`
    const cached = cache.get<Awaited<ReturnType<typeof buscarPracticas>>>(cacheKey)
    if (cached) return apiOk(cached)

    const practicas = await buscarPracticas(q, convenioId, {
      sinEnriquecer: lite,
      exactoCodigo,
      limite: limit,
      fallbackGlobal,
    })
    cache.set(cacheKey, practicas)
    return apiOk(practicas)
  } catch (err) {
    return manejarErrorApi(err)
  }
}
