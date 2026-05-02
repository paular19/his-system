import { prisma } from '@/lib/db'

export const COSEGUROS_IPSS = [
    'EMPRENDER',
    'TOTAL A / B',
    'UTM',
    'UPCN',
    'INTEGRAL',
    'ATSA',
    'ADP',
    'PREVISER',
    'SOEM',
    'SOEME',
    'NOVAMED',
]

export function normalizarNombreObraSocial(nombre: string): string {
    return nombre
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

export async function asegurarCosegurosIPSS(): Promise<Array<{ id: number; nombre: string }>> {
    const existentes = await prisma.obraSocial.findMany({
        where: {
            OR: COSEGUROS_IPSS.map((nombre) => ({
                nombre: { contains: nombre, mode: 'insensitive' as const },
            })),
        },
        select: { id: true, nombre: true, estado: true },
    })

    const mapa = new Map<string, { id: number; nombre: string }>()
    for (const os of existentes) {
        const clave = normalizarNombreObraSocial(os.nombre)
        if (!mapa.has(clave)) mapa.set(clave, os)
    }

    const faltantes = COSEGUROS_IPSS.filter(
        (nombre) => !mapa.has(normalizarNombreObraSocial(nombre))
    )

    if (faltantes.length > 0) {
        const agg = await prisma.obraSocial.aggregate({ _max: { id: true } })
        let nextId = (agg._max.id ?? 0) + 1

        for (const nombre of faltantes) {
            try {
                const creada = await prisma.obraSocial.create({
                    data: {
                        id: nextId,
                        nombre,
                        requiereCoseguro: 'N',
                        estado: 'A',
                        fechaEstado: new Date(),
                    },
                    select: { id: true, nombre: true },
                })
                mapa.set(normalizarNombreObraSocial(nombre), creada)
                nextId += 1
            } catch {
                const encontrado = await prisma.obraSocial.findFirst({
                    where: { nombre: { contains: nombre, mode: 'insensitive' } },
                    select: { id: true, nombre: true },
                })
                if (encontrado) mapa.set(normalizarNombreObraSocial(nombre), encontrado)
                else nextId += 1
            }
        }
    }

    const resultado: Array<{ id: number; nombre: string }> = []
    for (const nombre of COSEGUROS_IPSS) {
        const os = mapa.get(normalizarNombreObraSocial(nombre))
        if (os) resultado.push({ id: os.id, nombre: os.nombre })
    }

    return resultado.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}
