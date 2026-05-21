import { prisma } from '@/lib/db'
import type { CirugiaProgramadaListItem, PracticaCirugiaInput } from './types'
import { generarCodigoBarras } from '@/modules/orden/types'

interface GuardarCirugiaParams {
    pacienteId: number
    fechaCirugia: string
    horaCirugia?: string | null
    camaId?: number | null
    internacionId?: number | null
    numeroAutorizacion?: string | null
    observaciones?: string | null
    practicas: PracticaCirugiaInput[]
    diferenciales?: {
        esFeriado: boolean
        esNocturna: boolean
        mismaViaPatologia: boolean
        diferentesViasPatologia: boolean
        diferentesViasDiferentesPatologia: boolean
    }
}

interface ListarCirugiasParams {
    historico?: boolean
    q?: string
    pagina: number
    porPagina: number
}

export type ActualizacionAutorizacionCirugia =
    | { practicaId: number; numeroAutorizacion: string }
    | {
        puestoNumero: number
        ordenNumero: number
        item: number
        numeroAutorizacion: string
    }

function parseDateOnlyAsLocalDate(value: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
    if (!match) return new Date(value)

    const [, yearRaw, monthRaw, dayRaw] = match
    if (!yearRaw || !monthRaw || !dayRaw) return new Date(value)

    const year = Number.parseInt(yearRaw, 10)
    const month = Number.parseInt(monthRaw, 10) - 1
    const day = Number.parseInt(dayRaw, 10)
    return new Date(year, month, day, 0, 0, 0, 0)
}

function normalizarNumeroAutorizacion(value: string | null | undefined): string | null {
    const normalized = value?.trim() ?? ''
    return normalized.length > 0 ? normalized : null
}

function resolverNumeroAutorizacionOrdenItem(
    numeroItem: string | null | undefined,
    numeroOrden: string | null | undefined,
    numeroPractica: string | null | undefined,
    puestoNumero: number,
    ordenNumero: number,
    item: number
): string | null {
    const generado = generarCodigoBarras(puestoNumero, ordenNumero, item)
    const candidatos = [
        normalizarNumeroAutorizacion(numeroItem),
        normalizarNumeroAutorizacion(numeroOrden),
        normalizarNumeroAutorizacion(numeroPractica),
    ]

    for (const candidato of candidatos) {
        if (!candidato) continue
        if (candidato === generado) continue
        return candidato
    }

    return null
}

export async function guardarCirugiaProgramada(data: GuardarCirugiaParams) {
    const cirugia = await prisma.cirugiaProgramada.create({
        data: {
            pacienteId: data.pacienteId,
            numeroAutorizacion: data.numeroAutorizacion ?? null,
            fechaCirugia: parseDateOnlyAsLocalDate(data.fechaCirugia),
            horaCirugia: data.horaCirugia ?? null,
            camaId: data.camaId ?? null,
            internacionId: data.internacionId ?? null,
            observaciones: data.observaciones ?? null,
            practicas: {
                create: data.practicas.map((p) => ({
                    codigo: p.codigo.trim().slice(0, 20),
                    descripcion: p.descripcion.trim().slice(0, 500),
                    cantidad: p.cantidad,
                    numeroAutorizacion: null,
                })),
            },
            diferenciales: data.diferenciales
                ? {
                    create: {
                        tipo: 'QUIRURGICA',
                        descripcion: 'Diferenciales de cirugía programada',
                        esFeriado: data.diferenciales.esFeriado,
                        esNocturna: data.diferenciales.esNocturna,
                        mismaViaPatologia: data.diferenciales.mismaViaPatologia,
                        diferentesViasPatologia: data.diferenciales.diferentesViasPatologia,
                        diferentesViasDiferentesPatologia: data.diferenciales.diferentesViasDiferentesPatologia,
                    },
                }
                : undefined,
        },
        include: { practicas: true, diferenciales: true },
    })

    return cirugia
}

export async function listarCirugiasProgramadas(
    params: ListarCirugiasParams
): Promise<{ items: CirugiaProgramadaListItem[]; total: number }> {
    const skip = (params.pagina - 1) * params.porPagina
    const startOfTodayUtc = new Date()
    startOfTodayUtc.setUTCHours(0, 0, 0, 0)
    const termino = params.q?.trim()
    const dni = termino ? Number.parseInt(termino, 10) : NaN

    const where = {
        AND: [
            params.historico
                ? { fechaCirugia: { lt: startOfTodayUtc } }
                : { fechaCirugia: { gte: startOfTodayUtc } },
            termino
                ? {
                    OR: [
                        { paciente: { nombreCompleto: { contains: termino, mode: 'insensitive' as const } } },
                        Number.isFinite(dni) ? { paciente: { numeroDocumento: dni } } : {},
                    ],
                }
                : {},
        ],
    }

    const [rows, total] = await Promise.all([
        prisma.cirugiaProgramada.findMany({
            where,
            include: {
                paciente: {
                    select: {
                        id: true,
                        nombreCompleto: true,
                        numeroDocumento: true,
                        historiaClinica: true,
                        obraSocial: { select: { nombre: true } },
                        plan: { select: { descripcion: true } },
                    },
                },
                internacion: {
                    select: {
                        id: true,
                        tipoIngresoCodigo: true,
                        camaId: true,
                        practicas: {
                            select: {
                                id: true,
                                codigoPractica: true,
                                numeroAutorizacion: true,
                                puestoNumero: true,
                                ordenNumero: true,
                                ordenItem: true,
                                ordenPractica: {
                                    select: {
                                        puestoNumero: true,
                                        ordenNumero: true,
                                        item: true,
                                        modulo: true,
                                        numeroAutorizacion: true,
                                        orden: {
                                            select: {
                                                numeroAutorizacion: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                practicas: {
                    select: {
                        id: true,
                        codigo: true,
                        descripcion: true,
                        cantidad: true,
                        numeroAutorizacion: true,
                    },
                },
                _count: { select: { practicas: true } },
            },
            orderBy: [{ fechaCirugia: 'asc' }, { id: 'desc' }],
            skip,
            take: params.porPagina,
        }),
        prisma.cirugiaProgramada.count({ where }),
    ])

    return {
        total,
        items: rows.map((row) => ({
            id: row.id,
            fechaCirugia: row.fechaCirugia,
            horaCirugia: row.horaCirugia,
            numeroAutorizacion: row.numeroAutorizacion,
            internacionId: row.internacionId,
            internacionTipoIngresoCodigo: row.internacion?.tipoIngresoCodigo ?? null,
            internacionCamaId: row.internacion?.camaId ?? null,
            createdAt: row.createdAt,
            paciente: {
                id: row.paciente.id,
                nombreCompleto: row.paciente.nombreCompleto,
                numeroDocumento: row.paciente.numeroDocumento,
                historiaClinica: row.paciente.historiaClinica,
                obraSocial: row.paciente.obraSocial?.nombre ?? null,
                plan: row.paciente.plan?.descripcion ?? null,
            },
            practicasCantidad: row._count.practicas,
            practicas: row.practicas.map((p) => {
                const codigoCirugia = p.codigo.trim()
                const ordenesAutorizacion = new Map<
                    string,
                    {
                        puestoNumero: number
                        ordenNumero: number
                        item: number
                        modulo: string | null
                        numeroAutorizacion: string | null
                    }
                >()

                const practicasInternacion = row.internacion?.practicas ?? []
                for (const practicaInternacion of practicasInternacion) {
                    if (practicaInternacion.codigoPractica.trim() !== codigoCirugia) continue

                    if (Array.isArray(practicaInternacion.ordenPractica) && practicaInternacion.ordenPractica.length > 0) {
                        for (const ordenItem of practicaInternacion.ordenPractica) {
                            const clave = `${ordenItem.puestoNumero}-${ordenItem.ordenNumero}-${ordenItem.item}`
                            ordenesAutorizacion.set(clave, {
                                puestoNumero: ordenItem.puestoNumero,
                                ordenNumero: ordenItem.ordenNumero,
                                item: ordenItem.item,
                                modulo: ordenItem.modulo?.trim() ?? null,
                                numeroAutorizacion: resolverNumeroAutorizacionOrdenItem(
                                    ordenItem.numeroAutorizacion,
                                    ordenItem.orden?.numeroAutorizacion,
                                    practicaInternacion.numeroAutorizacion,
                                    ordenItem.puestoNumero,
                                    ordenItem.ordenNumero,
                                    ordenItem.item
                                ),
                            })
                        }
                        continue
                    }

                    if (
                        practicaInternacion.puestoNumero != null &&
                        practicaInternacion.ordenNumero != null &&
                        Number(practicaInternacion.puestoNumero) > 0
                    ) {
                        const itemOrden =
                            practicaInternacion.ordenItem != null && Number(practicaInternacion.ordenItem) > 0
                                ? Number(practicaInternacion.ordenItem)
                                : 1
                        const clave = `${Number(practicaInternacion.puestoNumero)}-${Number(practicaInternacion.ordenNumero)}-${itemOrden}`
                        ordenesAutorizacion.set(clave, {
                            puestoNumero: Number(practicaInternacion.puestoNumero),
                            ordenNumero: Number(practicaInternacion.ordenNumero),
                            item: itemOrden,
                            modulo: null,
                            numeroAutorizacion: resolverNumeroAutorizacionOrdenItem(
                                practicaInternacion.numeroAutorizacion,
                                null,
                                null,
                                Number(practicaInternacion.puestoNumero),
                                Number(practicaInternacion.ordenNumero),
                                itemOrden
                            ),
                        })
                    }
                }

                return {
                    id: p.id,
                    codigo: p.codigo,
                    descripcion: p.descripcion,
                    cantidad: p.cantidad,
                    numeroAutorizacion: p.numeroAutorizacion,
                    ordenesAutorizacion: Array.from(ordenesAutorizacion.values()),
                }
            }),
        })),
    }
}

export async function obtenerCirugiaProgramadaConPracticas(id: number) {
    return prisma.cirugiaProgramada.findUnique({
        where: { id },
        include: {
            paciente: {
                select: {
                    id: true,
                    nombreCompleto: true,
                    numeroDocumento: true,
                    historiaClinica: true,
                },
            },
            practicas: true,
            diferenciales: true,
            internacion: {
                select: {
                    id: true,
                    practicas: {
                        select: {
                            id: true,
                            codigoPractica: true,
                            numeroAutorizacion: true,
                            ordenPractica: {
                                select: {
                                    numeroAutorizacion: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    })
}

export async function actualizarNumerosAutorizacionPracticas(
    cirugiaId: number,
    actualizaciones: ActualizacionAutorizacionCirugia[]
) {
    return prisma.$transaction(async (tx) => {
        const cirugia = await tx.cirugiaProgramada.findUnique({
            where: { id: cirugiaId },
            select: { id: true, internacionId: true },
        })

        if (!cirugia) {
            throw new Error('Cirugía no encontrada')
        }

        const cabecerasOrdenActualizadas = new Set<string>()

        for (const actualizacion of actualizaciones) {
            if ('practicaId' in actualizacion) {
                const practica = await tx.cirugiaPractica.findUnique({
                    where: { id: actualizacion.practicaId },
                    select: { id: true, cirugiaId: true },
                })

                if (!practica || practica.cirugiaId !== cirugiaId) {
                    throw new Error('La práctica no pertenece a la cirugía seleccionada')
                }

                await tx.cirugiaPractica.update({
                    where: { id: actualizacion.practicaId },
                    data: { numeroAutorizacion: actualizacion.numeroAutorizacion },
                })
                continue
            }

            const ordenItem = await tx.ordenPractica.findUnique({
                where: {
                    puestoNumero_ordenNumero_item: {
                        puestoNumero: actualizacion.puestoNumero,
                        ordenNumero: actualizacion.ordenNumero,
                        item: actualizacion.item,
                    },
                },
                select: {
                    practicaId: true,
                    orden: { select: { ingresoId: true } },
                },
            })

            if (!ordenItem) {
                throw new Error('Ítem de orden no encontrado')
            }

            if (
                cirugia.internacionId != null &&
                (ordenItem.orden?.ingresoId == null || ordenItem.orden.ingresoId !== cirugia.internacionId)
            ) {
                throw new Error('El ítem de orden no corresponde a la internación de esta cirugía')
            }

            await tx.ordenPractica.update({
                where: {
                    puestoNumero_ordenNumero_item: {
                        puestoNumero: actualizacion.puestoNumero,
                        ordenNumero: actualizacion.ordenNumero,
                        item: actualizacion.item,
                    },
                },
                data: { numeroAutorizacion: actualizacion.numeroAutorizacion },
            })

            const claveCabecera = `${actualizacion.puestoNumero}-${actualizacion.ordenNumero}`
            if (!cabecerasOrdenActualizadas.has(claveCabecera)) {
                await tx.orden.update({
                    where: {
                        puestoNumero_numero: {
                            puestoNumero: actualizacion.puestoNumero,
                            numero: actualizacion.ordenNumero,
                        },
                    },
                    data: {
                        numeroAutorizacion: actualizacion.numeroAutorizacion,
                    },
                })
                cabecerasOrdenActualizadas.add(claveCabecera)
            }

            if (typeof ordenItem.practicaId === 'number' && ordenItem.practicaId > 0) {
                await tx.practica.update({
                    where: { id: ordenItem.practicaId },
                    data: { numeroAutorizacion: actualizacion.numeroAutorizacion },
                })
            }
        }

        return { ok: true }
    }, { timeout: 30000, maxWait: 10000 })
}

export async function obtenerCamasDisponibles(fechaCirugia: string, sector?: string) {
    const fecha = new Date(fechaCirugia)
    const camas = await prisma.cama.findMany({
        where: {
            estado: 'A',
            ...(sector ? { sector } : {}),
        },
        select: {
            id: true,
            identificador: true,
            sector: true,
            habitacion: true,
            estado: true,
        },
    })

    return camas
}
