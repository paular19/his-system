import { type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { getUsuarioSesionLectura } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiForbidden, apiOk, manejarErrorApi } from '@/lib/utils/response'
import NodeCache from 'node-cache'

type CatalogoItem = { id: number; nombre: string }

const cache = new NodeCache({ stdTTL: 90 })

function sanitizeQuery(value: string): string {
    return value.trim().slice(0, 100)
}

function buildCacheKey(q: string, take: number): string {
    return `catalogo-medicamentos-uti:${q.toLowerCase()}:${take}`
}

// GET /api/catalogos/medicamentos-uti?q=ibup
export async function GET(request: NextRequest) {
    try {
        const usuario = await getUsuarioSesionLectura()

        const puedeConsultar =
            tienePermiso(usuario.rol, 'ADMISION', 'LEER') ||
            tienePermiso(usuario.rol, 'INTERNACION', 'LEER') ||
            tienePermiso(usuario.rol, 'AMBULATORIO', 'LEER')

        if (!puedeConsultar) {
            return apiForbidden()
        }

        const { searchParams } = request.nextUrl
        const q = sanitizeQuery(searchParams.get('q') ?? '')
        const takeRaw = Number.parseInt(searchParams.get('limit') ?? '20', 10)
        const take = Number.isFinite(takeRaw) ? Math.min(Math.max(takeRaw, 1), 100) : 20

        if (q.length < 2) {
            return apiOk([])
        }

        const cacheKey = buildCacheKey(q, take)
        const cached = cache.get<CatalogoItem[]>(cacheKey)
        if (cached) {
            return apiOk(cached)
        }

        const [dataCatalogo, fallbackUsados] = await Promise.all([
            prisma.catalogoMedicamentoUti.findMany({
                where: {
                    estado: 'A',
                    nombre: {
                        contains: q,
                        mode: 'insensitive',
                    },
                },
                orderBy: { nombre: 'asc' },
                take,
                select: { id: true, nombre: true },
            }),
            prisma.medicacionIngreso.findMany({
                where: {
                    nombre: {
                        contains: q,
                        mode: 'insensitive',
                    },
                },
                orderBy: { nombre: 'asc' },
                take,
                select: { nombre: true },
                distinct: ['nombre'],
            }),
        ])

        const merged = new Map<number, { id: number; nombre: string }>()
        for (const item of dataCatalogo) {
            merged.set(item.id, item)
        }

        const nombresCatalogo = new Set(dataCatalogo.map((item) => item.nombre.toLowerCase()))

        const syntheticBase = 2_000_000
        fallbackUsados.forEach((item, index) => {
            const alreadyPresent = nombresCatalogo.has(item.nombre.toLowerCase())
            if (!alreadyPresent) {
                merged.set(syntheticBase + index, { id: syntheticBase + index, nombre: item.nombre })
            }
        })

        const data = Array.from(merged.values())
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
            .slice(0, take)

        cache.set(cacheKey, data)

        return apiOk(data)
    } catch (err) {
        return manejarErrorApi(err)
    }
}
