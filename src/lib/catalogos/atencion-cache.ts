import 'server-only'

import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/db'
import { asegurarCosegurosIPSS, filtrarObrasSocialesPrincipales } from '@/lib/utils/coseguros'

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

const getProfesionalesActivosCached = unstable_cache(
    async (): Promise<CatalogoProfesional[]> => {
        try {
            await asegurarProfesionalGuardia9092()
            return await prisma.profesional.findMany({
                where: { estado: 'A' },
                select: { id: true, nombre: true, matricula: true },
                orderBy: { nombre: 'asc' },
            })
        } catch (error) {
            console.error('[catalogos] No se pudo cargar profesionales activos', error)
            return []
        }
    },
    ['catalogo-profesionales-activos-v2'],
    { revalidate: 300, tags: ['catalogo-profesionales'] }
)

const getObrasSocialesActivasCached = unstable_cache(
    async (): Promise<CatalogoObraSocial[]> => {
        try {
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
        } catch (error) {
            console.error('[catalogos] No se pudo cargar obras sociales', error)
            return []
        }
    },
    ['catalogo-obras-sociales-v1'],
    { revalidate: 300, tags: ['catalogo-obras-sociales'] }
)

const getPlanesObraSocialActivosCached = unstable_cache(
    async (): Promise<CatalogoPlan[]> => {
        try {
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
        } catch (error) {
            console.error('[catalogos] No se pudo cargar planes de obra social', error)
            return []
        }
    },
    ['catalogo-planes-obras-sociales-v1'],
    { revalidate: 300, tags: ['catalogo-planes-obras-sociales'] }
)

const getCosegurosIPSSCached = unstable_cache(
    async (): Promise<CatalogoCoseguro[]> => {
        try {
            return await asegurarCosegurosIPSS()
        } catch (error) {
            console.error('[catalogos] No se pudo cargar coseguros IPSS', error)
            return []
        }
    },
    ['catalogo-coseguros-ipss-v1'],
    { revalidate: 300, tags: ['catalogo-coseguros-ipss'] }
)

const getSubtiposAdmisionCached = unstable_cache(
    async (): Promise<CatalogoSubtipoAdmision[]> => {
        try {
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
        } catch (error) {
            console.error('[catalogos] No se pudo cargar subtipos de admision', error)
            return []
        }
    },
    ['catalogo-subtipos-admision-v2'],
    { revalidate: 300, tags: ['catalogo-subtipos-admision'] }
)

export async function getProfesionalesActivosCatalogo(): Promise<CatalogoProfesional[]> {
    return getProfesionalesActivosCached()
}

export async function getCatalogoCoberturaAtencion(): Promise<{
    obraSociales: CatalogoObraSocial[]
    planes: CatalogoPlan[]
    coseguros: CatalogoCoseguro[]
}> {
    const [obraSociales, planes, coseguros] = await Promise.all([
        getObrasSocialesActivasCached(),
        getPlanesObraSocialActivosCached(),
        getCosegurosIPSSCached(),
    ])

    return { obraSociales, planes, coseguros }
}

export async function getCatalogoCoberturaAtencionBasico(): Promise<{
    obraSociales: CatalogoObraSocial[]
    coseguros: CatalogoCoseguro[]
}> {
    const [obraSociales, coseguros] = await Promise.all([
        getObrasSocialesActivasCached(),
        getCosegurosIPSSCached(),
    ])

    return { obraSociales, coseguros }
}

export async function getSubtiposAdmisionCatalogo(): Promise<CatalogoSubtipoAdmision[]> {
    return getSubtiposAdmisionCached()
}
