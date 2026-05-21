import { type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiForbidden, apiOk, manejarErrorApi } from '@/lib/utils/response'

function sanitizeQuery(value: string): string {
    return value.trim().slice(0, 100)
}

// GET /api/catalogos/descartables-uti?q=abocath
export async function GET(request: NextRequest) {
    try {
        const usuario = await getUsuarioSesion()

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

        const dataCatalogo = await prisma.catalogoDescartableUti.findMany({
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
        })

        const fallbackUsados = await prisma.descartableIngreso.findMany({
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
        })

        const merged = new Map<number, { id: number; nombre: string }>()
        for (const item of dataCatalogo) {
            merged.set(item.id, item)
        }

        const syntheticBase = 1_000_000
        fallbackUsados.forEach((item, index) => {
            const alreadyPresent = dataCatalogo.some((c) => c.nombre.toLowerCase() === item.nombre.toLowerCase())
            if (!alreadyPresent) {
                merged.set(syntheticBase + index, { id: syntheticBase + index, nombre: item.nombre })
            }
        })

        const data = Array.from(merged.values())
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
            .slice(0, take)

        return apiOk(data)
    } catch (err) {
        return manejarErrorApi(err)
    }
}
