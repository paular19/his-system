import 'server-only'

import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/db'
import { asegurarCosegurosIPSS } from '@/lib/catalogos/coseguros-ipss'
import { filtrarObrasSocialesPrincipales } from '@/lib/utils/coseguros'

export type CatalogoProfesional = {
    id: number
    nombre: string
    matricula: number | null
}

export type CatalogoObraSocial = {
    id: number
    nombre: string
    requiereCoseguro: boolean
}

export type CatalogoPlan = {
    id: number
    nombre: string
    obraSocialId: number | null
}

export type CatalogoCoseguro = {
    id: number
    nombre: string
}

export type CatalogoSubtipoAdmision = {
    codigo: string
    descripcion: string
}

const CODIGOS_SUBTIPO_ADMISION = ['RAY', 'GUA', 'CUR', 'SUT', 'ECG', 'ECO', 'QAM', 'DER', 'TUR'] as const
const MATRICULA_GUARDIA_RODOLFO_SABIO = 9092
const NOMBRE_GUARDIA_RODOLFO_SABIO = 'DR RODOLFO SABIO'

function normalizarTexto(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

async function asegurarProfesionalGuardia9092(): Promise<void> {
    try {
        const existente = await prisma.profesional.findFirst({
            where: { matricula: MATRICULA_GUARDIA_RODOLFO_SABIO },
            select: { id: true, nombre: true, estado: true },
        })

        if (!existente) {
            await prisma.profesional.create({
                data: {
                    nombre: NOMBRE_GUARDIA_RODOLFO_SABIO,
                    matricula: MATRICULA_GUARDIA_RODOLFO_SABIO,
                    estado: 'A',
                    fechaEstado: new Date(),
                    usuario: 'SISTEMA',
                },
            })
            return
        }

        const nombreNormalizado = normalizarTexto(existente.nombre)
        const requiereActualizacionNombre = !nombreNormalizado.includes('RODOLFO SABIO')
        const requiereActivar = existente.estado !== 'A'

        if (requiereActualizacionNombre || requiereActivar) {
            await prisma.profesional.update({
                where: { id: existente.id },
                data: {
                    nombre: requiereActualizacionNombre ? NOMBRE_GUARDIA_RODOLFO_SABIO : existente.nombre,
                    estado: 'A',
                    fechaEstado: new Date(),
                    usuario: 'SISTEMA',
                },
            })
        }
    } catch (error) {
        console.error('[catalogos] No se pudo asegurar Dr. Rodolfo Sabio MP 9092', error)
    }
}

/**
 * Los catalogos se sirven con unstable_cache. Si una lectura falla y devuelve
 * lista vacia, esa lista queda cacheada como si fuera una respuesta valida y la
 * pantalla sigue vacia hasta que revalide (hasta 5 minutos), aunque la base ya
 * se haya recuperado. Por eso el error se propaga desde adentro del cache -asi
 * no se guarda nada- y recien se degrada a lista vacia en el wrapper: el pedido
 * siguiente reintenta contra la base.
 */
async function sinCachearFallo<T>(
    nombre: string,
    cargar: () => Promise<T[]>
): Promise<T[]> {
    try {
        return await cargar()
    } catch (error) {
        console.error(`[catalogos] No se pudo cargar ${nombre}`, error)
        return []
    }
}

const getProfesionalesActivosCached = unstable_cache(
    async (): Promise<CatalogoProfesional[]> => {
        await asegurarProfesionalGuardia9092()
        return prisma.profesional.findMany({
            where: { estado: 'A' },
            select: { id: true, nombre: true, matricula: true },
            orderBy: { nombre: 'asc' },
        })
    },
    ['catalogo-profesionales-activos-v2'],
    { revalidate: 300, tags: ['catalogo-profesionales'] }
)

const getObrasSocialesActivasCached = unstable_cache(
    async (): Promise<CatalogoObraSocial[]> => {
        const rows = await prisma.obraSocial.findMany({
            where: { estado: 'A' },
            select: { id: true, nombre: true, requiereCoseguro: true },
            orderBy: { nombre: 'asc' },
        })

        return filtrarObrasSocialesPrincipales(rows).map((os) => ({
            id: os.id,
            nombre: os.nombre,
            requiereCoseguro: os.requiereCoseguro === 'S',
        }))
    },
    ['catalogo-obras-sociales-v1'],
    { revalidate: 300, tags: ['catalogo-obras-sociales'] }
)

const getPlanesObraSocialActivosCached = unstable_cache(
    async (): Promise<CatalogoPlan[]> => {
        const rows = await prisma.planObraSocial.findMany({
            where: { estado: 'A' },
            select: { id: true, descripcion: true, obraSocialId: true },
            orderBy: { descripcion: 'asc' },
        })

        return rows.map((plan) => ({
            id: plan.id,
            nombre: plan.descripcion,
            obraSocialId: plan.obraSocialId,
        }))
    },
    ['catalogo-planes-obras-sociales-v1'],
    { revalidate: 300, tags: ['catalogo-planes-obras-sociales'] }
)

const getCosegurosIPSSCached = unstable_cache(
    async (): Promise<CatalogoCoseguro[]> => {
        return asegurarCosegurosIPSS()
    },
    ['catalogo-coseguros-ipss-v1'],
    { revalidate: 300, tags: ['catalogo-coseguros-ipss'] }
)

const getSubtiposAdmisionCached = unstable_cache(
    async (): Promise<CatalogoSubtipoAdmision[]> => {
        const ordenSubtipos = new Map<string, number>(
            CODIGOS_SUBTIPO_ADMISION.map((codigo, index) => [codigo, index])
        )

        const rows = await prisma.subtipoAdmision.findMany({
            where: {
                estado: 'A',
                codigo: { in: [...CODIGOS_SUBTIPO_ADMISION] },
            },
            select: { codigo: true, descripcion: true },
        })

        return rows.sort(
            (a, b) => (ordenSubtipos.get(a.codigo) ?? 999) - (ordenSubtipos.get(b.codigo) ?? 999)
        )
    },
    ['catalogo-subtipos-admision-v2'],
    { revalidate: 300, tags: ['catalogo-subtipos-admision'] }
)

export async function getProfesionalesActivosCatalogo(): Promise<CatalogoProfesional[]> {
    return sinCachearFallo('profesionales activos', getProfesionalesActivosCached)
}

export async function getCatalogoCoberturaAtencion(): Promise<{
    obraSociales: CatalogoObraSocial[]
    planes: CatalogoPlan[]
    coseguros: CatalogoCoseguro[]
}> {
    const [obraSociales, planes, coseguros] = await Promise.all([
        sinCachearFallo('obras sociales', getObrasSocialesActivasCached),
        sinCachearFallo('planes de obra social', getPlanesObraSocialActivosCached),
        sinCachearFallo('coseguros IPSS', getCosegurosIPSSCached),
    ])

    return { obraSociales, planes, coseguros }
}

export async function getCatalogoCoberturaAtencionBasico(): Promise<{
    obraSociales: CatalogoObraSocial[]
    coseguros: CatalogoCoseguro[]
}> {
    const [obraSociales, coseguros] = await Promise.all([
        sinCachearFallo('obras sociales', getObrasSocialesActivasCached),
        sinCachearFallo('coseguros IPSS', getCosegurosIPSSCached),
    ])

    return { obraSociales, coseguros }
}

export async function getSubtiposAdmisionCatalogo(): Promise<CatalogoSubtipoAdmision[]> {
    return sinCachearFallo('subtipos de admision', getSubtiposAdmisionCached)
}
