import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { prisma } from '@/lib/db'
import { apiForbidden, apiError } from '@/lib/utils/response'

function construirRangoFecha(fechaRaw: string | null) {
    const fecha = fechaRaw?.trim()
    if (!fecha) return null
    const inicio = new Date(`${fecha}T00:00:00`)
    if (Number.isNaN(inicio.getTime())) return null
    const fin = new Date(inicio)
    fin.setDate(fin.getDate() + 1)
    return { inicio, fin }
}

export async function GET(request: Request) {
    try {
        const usuario = await getUsuarioSesion()
        const puedeLeer =
            tienePermiso(usuario.rol, 'INTERNACION', 'LEER') ||
            tienePermiso(usuario.rol, 'ADMISION', 'LEER')

        if (!puedeLeer) return apiForbidden()

        const { searchParams } = new URL(request.url)
        const fechaRaw = searchParams.get('fecha')
        const horaRaw = searchParams.get('hora')?.trim() || null

        const rango = construirRangoFecha(fechaRaw)

        const [camasDisponibles, cirugiasConCama] = await Promise.all([
            prisma.cama.findMany({
                where: { estado: 'DISPONIBLE' },
                select: {
                    id: true,
                    identificador: true,
                    sector: true,
                    habitacion: true,
                    estado: true,
                },
                orderBy: [{ sector: 'asc' }, { identificador: 'asc' }],
            }),
            prisma.cirugiaProgramada.findMany({
                where: {
                    camaId: { not: null },
                    ...(rango
                        ? {
                            fechaCirugia: {
                                gte: rango.inicio,
                                lt: rango.fin,
                            },
                        }
                        : {}),
                    ...(horaRaw ? { horaCirugia: horaRaw } : {}),
                },
                select: { camaId: true },
            }),
        ])

        const camasReservadas = new Set(
            cirugiasConCama
                .map((c) => c.camaId)
                .filter((id): id is number => typeof id === 'number' && id > 0)
        )

        const camas = camasDisponibles
            .filter((cama) => !camasReservadas.has(cama.id))
            .map((cama) => ({
                id: cama.id,
                identificador: cama.identificador,
                sector: cama.sector,
                habitacion: cama.habitacion,
            }))

        return NextResponse.json({ camas })
    } catch (error) {
        console.error('[GET /api/cirugia/camas-disponibles]', error)
        return apiError('Error al obtener camas disponibles')
    }
}
