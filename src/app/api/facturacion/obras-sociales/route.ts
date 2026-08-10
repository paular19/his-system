import { type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiForbidden, apiOk, manejarErrorApi } from '@/lib/utils/response'
import { filtrarObrasSocialesPrincipales } from '@/lib/utils/coseguros'
import NodeCache from 'node-cache';
const cache = new NodeCache({ stdTTL: 300 }); // Cache de 5 minutos

type ObraSocialItem = { id: number; nombre: string }

function buildCacheKey(q: string | undefined, porPagina: number): string {
    return `obras-sociales:${q?.toLowerCase() ?? ''}:${porPagina}`;
}

export async function GET(request: NextRequest) {
    try {
        const usuario = await getUsuarioSesion()
        if (!tienePermiso(usuario.rol, 'FACTURACION', 'LEER')) return apiForbidden()

        const { searchParams } = request.nextUrl
        const q = searchParams.get('q')?.trim()
        const porPagina = Math.min(500, Math.max(1, Number(searchParams.get('porPagina') ?? 200)))
        const cacheKey = buildCacheKey(q, porPagina)

        const cachedItems = cache.get<ObraSocialItem[]>(cacheKey);
        if (cachedItems) {
            return apiOk({ items: cachedItems, total: cachedItems.length });
        }

        const itemsRaw = await prisma.obraSocial.findMany({
            where: {
                estado: 'A',
                ...(q
                    ? { nombre: { contains: q, mode: 'insensitive' as const } }
                    : {}),
            },
            orderBy: { nombre: 'asc' },
            take: porPagina,
            select: { id: true, nombre: true },
        })
        const items = filtrarObrasSocialesPrincipales(itemsRaw)

        cache.set(cacheKey, items)
        return apiOk({ items, total: items.length })
    } catch (error) {
        return manejarErrorApi(error)
    }
}

