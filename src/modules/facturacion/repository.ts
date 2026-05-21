import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import type {
    ActualizarAutorizacionInput,
    ActualizarContextoFacturacionInput,
    ActualizarLoteFacturacionInput,
    ActualizarPrestacionFacturacionInput,
    BusquedaFacturacionInput,
    BusquedaLotesInput,
    CargarOrdenesFacturacionInput,
    CrearLoteFacturacionInput,
    CrearLoteIPSTxtInput,
    CrearDescartableFacturacionInput,
    CrearMedicacionFacturacionInput,
    CrearPracticaFacturacionInput,
} from './schemas'
import type {
    AdmisionFacturacionListItem,
    EstadoLote,
    FacturacionContexto,
    LoteFacturacionDetalle,
    LoteFacturacionItemDetalle,
    LoteFacturacionListItem,
    LoteIPSTxtItemDetalle,
    OrdenAutorizadaLote,
    OrdenFacturacionResultado,
    PrestacionFacturableItem,
} from './types'
import { crearOrdenAmbulatorio, crearOrdenesAmbulatoriasPorPractica } from '@/modules/orden/service'
import type { CrearOrdenInput } from '@/modules/orden/schemas'
import { calcularImporteFacturable, resolverReglaFacturacion } from './cobertura'
import { aplicarDiferencialesAValores, tieneDiferencialesActivos } from './diferenciales'

const MS_POR_DIA = 24 * 60 * 60 * 1000
const MATRICULA_AMBULATORIO_DEFAULT = 9110
const MATRICULA_ANESTESISTA_INT_DEFAULT = 6
const MATRICULA_AYUDANTE_INT_DEFAULT = 995
const CODIGOS_HA_OBLIGATORIO = new Set(['169006'])
const CODIGOS_HE_CON_OPCION_HA = new Set(['420303'])

function normalizarCodigoPractica(codigoPractica: string): string {
    return codigoPractica.trim().slice(0, 8).toUpperCase()
}

function normalizarTextoComparacion(value: string | null | undefined): string {
    return (value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
}

function normalizarTextoSoloAlfanumerico(value: string | null | undefined): string {
    return normalizarTextoComparacion(value).replace(/[^A-Z0-9]/g, '')
}

function esObraSocialOsecac(nombre: string | null | undefined): boolean {
    const limpio = normalizarTextoSoloAlfanumerico(nombre)
    return limpio.includes('OSECAC') || limpio.includes('OBRASOCIALEMPLEADOSDECOMERCIO')
}

function descripcionEsAnestesista(descripcion: string | null | undefined): boolean {
    const text = normalizarTextoComparacion(descripcion)
    return text.includes('ANEST') || text.includes('[ANE')
}

function descripcionEsAyudante(descripcion: string | null | undefined): boolean {
    const text = normalizarTextoComparacion(descripcion)
    return text.includes('AYUD') || text.includes('×AYU') || text.includes(' AYU')
}

function descripcionEsGasto(descripcion: string | null | undefined): boolean {
    const text = normalizarTextoComparacion(descripcion)
    return text.includes('GTO') || text.includes('GASTO') || text.includes('GASTOS')
}

function esCodigoHaObligatorio(codigoPractica: string | null | undefined): boolean {
    if (!codigoPractica) return false
    return CODIGOS_HA_OBLIGATORIO.has(normalizarCodigoPractica(codigoPractica))
}

function esCodigoHeConOpcionHa(codigoPractica: string | null | undefined): boolean {
    if (!codigoPractica) return false
    return CODIGOS_HE_CON_OPCION_HA.has(normalizarCodigoPractica(codigoPractica))
}

type DesgloseValores = {
    valorEspecialista: number | null
    valorAyudante: number | null
    valorAnestesista: number | null
    valorGastos: number | null
}

function aplicarOverrideEspecialAnestesistaPorCodigo(
    codigoPractica: string | null | undefined,
    desglose: DesgloseValores
): DesgloseValores {
    if (esCodigoHaObligatorio(codigoPractica)) {
        return {
            ...desglose,
            valorEspecialista: null,
            valorAnestesista: desglose.valorAnestesista ?? desglose.valorEspecialista,
        }
    }

    if (esCodigoHeConOpcionHa(codigoPractica)) {
        return {
            ...desglose,
            valorAnestesista: desglose.valorAnestesista ?? desglose.valorEspecialista,
        }
    }

    return desglose
}

function resolverMatriculaEfectorFacturacion(params: {
    tipoIngresoCodigo: string | null
    codigoPractica: string | null | undefined
    descripcionPractica: string | null | undefined
    matriculaEspecialista: number | null | undefined
    matriculaAnestesista: number | null | undefined
}): number {
    const esInternacion = (params.tipoIngresoCodigo ?? '').trim().toUpperCase() === 'INT'
    const esCodigoAnestesista = esCodigoHaObligatorio(params.codigoPractica)
    const esGasto = descripcionEsGasto(params.descripcionPractica)
    const esAnestesista =
        esCodigoAnestesista ||
        descripcionEsAnestesista(params.descripcionPractica) ||
        (typeof params.matriculaAnestesista === 'number' && params.matriculaAnestesista > 0)
    const esAyudante = descripcionEsAyudante(params.descripcionPractica)

    // Regla transversal: gastos siempre con matricula 9110.
    if (esGasto) return MATRICULA_AMBULATORIO_DEFAULT

    // Regla pedida: toda practica ambulatoria sale con 9110 por default.
    if (!esInternacion) return MATRICULA_AMBULATORIO_DEFAULT

    if (esInternacion && esAnestesista) return MATRICULA_ANESTESISTA_INT_DEFAULT
    if (esInternacion && esAyudante) return MATRICULA_AYUDANTE_INT_DEFAULT
    if (params.matriculaAnestesista) return params.matriculaAnestesista
    if (params.matriculaEspecialista) return params.matriculaEspecialista
    return MATRICULA_AYUDANTE_INT_DEFAULT
}

async function obtenerValoresPracticas(codigosPractica: string[]): Promise<Map<string, number>> {
    const codigos = Array.from(
        new Set(codigosPractica.map(normalizarCodigoPractica).filter(Boolean))
    )

    if (codigos.length === 0) return new Map()

    const prestaciones = await prisma.nomencladorPrestacion.findMany({
        where: { codigo: { in: codigos } },
        select: { codigo: true, valor: true },
    })

    const result = new Map(
        prestaciones.map((prestacion) => [normalizarCodigoPractica(prestacion.codigo), Number(prestacion.valor ?? 0)])
    )

    // Fallback: para códigos sin precio en el nomenclador, buscar el último precio
    // unitario conocido en prácticas ya facturadas con el mismo código.
    const sinPrecio = codigos.filter((c) => !result.has(c) || result.get(c) === 0)
    if (sinPrecio.length > 0) {
        const codigosConEspacio = sinPrecio.map((c) => c.padEnd(8, ' '))
        const historicos = await prisma.practica.findMany({
            where: {
                codigoPractica: { in: codigosConEspacio },
                importeTotal: { not: null, gt: 0 },
                cantidad: { gt: 0 },
            },
            orderBy: { id: 'desc' },
            select: { codigoPractica: true, importeTotal: true, cantidad: true },
            take: sinPrecio.length * 10,
        })

        for (const h of historicos) {
            const clave = normalizarCodigoPractica(h.codigoPractica)
            if (!result.has(clave) || result.get(clave) === 0) {
                const precioUnitario = Number(h.importeTotal) / Number(h.cantidad)
                if (precioUnitario > 0) result.set(clave, precioUnitario)
            }
        }
    }

    return result
}

export async function obtenerValorPractica(codigoPractica: string): Promise<number> {
    const valores = await obtenerValoresPracticas([codigoPractica])
    return valores.get(normalizarCodigoPractica(codigoPractica)) ?? 0
}

function precioFicticioMedicacion(nombre: string): number {
    const base = nombre.trim().length || 1
    return 3500 + (base % 15) * 180
}

function precioFicticioDescartable(nombre: string): number {
    const base = nombre.trim().length || 1
    return 1200 + (base % 12) * 90
}

function tieneNumeroAutorizacionValido(numeroAutorizacion: string | null | undefined): boolean {
    return typeof numeroAutorizacion === 'string' && numeroAutorizacion.trim().length > 0
}

function resolverNumeroAutorizacion(
    numeroAutorizacionItem: string | null | undefined,
    numeroAutorizacionOrden: string | null | undefined
): string | null {
    if (tieneNumeroAutorizacionValido(numeroAutorizacionItem)) return numeroAutorizacionItem!.trim()
    if (tieneNumeroAutorizacionValido(numeroAutorizacionOrden)) return numeroAutorizacionOrden!.trim()
    return null
}

function generarCodigoBarrasOrdenItem(puestoNumero: number, ordenNumero: number, item: number): string {
    return `${puestoNumero.toString().padStart(4, '0')}${ordenNumero.toString().padStart(8, '0')}${item.toString().padStart(3, '0')}`
}

function resolverNumeroAutorizacionOrdenItem(
    numeroAutorizacionItem: string | null | undefined,
    numeroAutorizacionOrden: string | null | undefined,
    puestoNumero: number,
    ordenNumero: number,
    item: number
): string | null {
    const authItem = numeroAutorizacionItem?.trim() ?? null
    const authOrden = numeroAutorizacionOrden?.trim() ?? null
    const codigoBarrasGenerado = generarCodigoBarrasOrdenItem(puestoNumero, ordenNumero, item)

    // If the item auth is only the autogenerated barcode, prefer the real order auth.
    if (authItem && authItem === codigoBarrasGenerado && tieneNumeroAutorizacionValido(authOrden)) {
        return authOrden
    }

    return resolverNumeroAutorizacion(authItem, authOrden)
}

function buildEspecialistaOrdenWhere(params: {
    medico?: string
    matricula?: number
}): Prisma.OrdenWhereInput {
    const andFilters: Prisma.OrdenWhereInput[] = []

    if (params.matricula) {
        andFilters.push({
            OR: [
                { profesional: { matricula: params.matricula } },
                { items: { some: { efectorMatricula: params.matricula } } },
            ],
        })
    }

    const medico = params.medico?.trim()
    if (medico) {
        andFilters.push({
            profesional: {
                nombre: {
                    contains: medico,
                    mode: 'insensitive',
                },
            },
        })
    }

    if (andFilters.length === 0) return {}
    return { AND: andFilters }
}

function buildOrdenAutorizadaWhere(): Prisma.OrdenWhereInput {
    return {
        OR: [
            {
                AND: [
                    { numeroAutorizacion: { not: null } },
                    { numeroAutorizacion: { not: '' } },
                ],
            },
            {
                items: {
                    some: {
                        AND: [
                            { numeroAutorizacion: { not: null } },
                            { numeroAutorizacion: { not: '' } },
                        ],
                    },
                },
            },
        ],
    }
}

function periodoToDateRange(periodo: string): { desde: Date; hasta: Date } {
    const [yearStr, monthStr] = periodo.split('-')
    const year = Number(yearStr)
    const month = Number(monthStr)
    const desde = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
    const hasta = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
    return { desde, hasta }
}

function fechaClave(value: Date): string {
    return value.toISOString().slice(0, 10)
}

function normalizarCodigoPracticaFacturacion(codigo: string): string {
    return codigo.trim().slice(0, 8).toUpperCase()
}

export async function buscarAdmisionesFacturacion(
    params: BusquedaFacturacionInput
): Promise<{ items: AdmisionFacturacionListItem[]; total: number }> {
    const { q, tipoIngresoCodigo, codigoPractica, pagina, porPagina } = params
    const skip = (pagina - 1) * porPagina

    const where: Prisma.IngresoWhereInput = {
        estado: { in: ['A', 'E'] },
    }

    if (tipoIngresoCodigo) where.tipoIngresoCodigo = tipoIngresoCodigo

    if (q) {
        const esNumerico = /^\d+$/.test(q)
        if (esNumerico) {
            const n = parseInt(q, 10)
            where.OR = [
                { numeroIngreso: n },
                { paciente: { numeroDocumento: n } },
                { nombre: { contains: q, mode: 'insensitive' } },
            ]
        } else {
            where.OR = [
                { nombre: { contains: q, mode: 'insensitive' } },
                { paciente: { nombreCompleto: { contains: q, mode: 'insensitive' } } },
            ]
        }
    }

    if (codigoPractica) {
        where.AND = [
            {
                OR: [
                    { practicas: { some: { codigoPractica: { contains: codigoPractica, mode: 'insensitive' } } } },
                    {
                        ordenes: {
                            some: {
                                items: { some: { codigoPractica: { contains: codigoPractica, mode: 'insensitive' } } },
                            },
                        },
                    },
                ],
            },
        ]
    }

    const [total, items] = await Promise.all([
        prisma.ingreso.count({ where }),
        prisma.ingreso.findMany({
            where,
            skip,
            take: porPagina,
            orderBy: [{ fechaIngreso: 'desc' }, { id: 'desc' }],
            select: {
                id: true,
                tipoIngresoCodigo: true,
                numeroIngreso: true,
                estado: true,
                fechaIngreso: true,
                fechaEgreso: true,
                paciente: {
                    select: {
                        id: true,
                        nombreCompleto: true,
                        numeroDocumento: true,
                    },
                },
                obraSocial: { select: { id: true, nombre: true } },
                plan: { select: { id: true, descripcion: true } },
            },
        }),
    ])

    return { items: items as AdmisionFacturacionListItem[], total }
}

export async function obtenerContextoFacturacion(ingresoId: number): Promise<FacturacionContexto | null> {
    const ingreso = await prisma.ingreso.findUnique({
        where: { id: ingresoId },
        select: {
            id: true,
            camaId: true,
            tipoIngresoCodigo: true,
            numeroIngreso: true,
            estado: true,
            fechaIngreso: true,
            fechaEgreso: true,
            nombre: true,
            descripcionPatologia: true,
            numeroAfiliado: true,
            observaciones: true,
            obraSocialId: true,
            planId: true,
            obraSocialCoseguroId: true,
            planCoseguroId: true,
            paciente: {
                select: {
                    id: true,
                    apellido: true,
                    nombre: true,
                    nombreCompleto: true,
                    numeroDocumento: true,
                    celular1: true,
                    email: true,
                    domicilio: true,
                },
            },
            obraSocial: { select: { id: true, nombre: true } },
            plan: { select: { id: true, descripcion: true } },
            practicas: {
                orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
                select: {
                    id: true,
                    fecha: true,
                    codigoPractica: true,
                    cantidad: true,
                    convenioId: true,
                    numeroAutorizacion: true,
                    matriculaEspecialista: true,
                    matriculaAnestesista: true,
                    importeTotal: true,
                    puestoNumero: true,
                    ordenNumero: true,
                    ordenItem: true,
                    nomencladorPractica: { select: { descripcion: true, valorEspecialista: true, valorAyudante: true, valorAnestesista: true, valorGastos: true } },
                },
            },
            medicaciones: {
                orderBy: [{ fechaInicio: 'desc' }, { id: 'desc' }],
                select: {
                    id: true,
                    fechaInicio: true,
                    nombre: true,
                    dosis: true,
                    viaAdministracion: true,
                    frecuencia: true,
                },
            },
            descartables: {
                orderBy: [{ fechaInicio: 'desc' }, { id: 'desc' }],
                select: {
                    id: true,
                    fechaInicio: true,
                    nombre: true,
                    cantidad: true,
                    observaciones: true,
                },
            },
            ordenes: {
                orderBy: [{ fechaEmision: 'desc' }, { numero: 'desc' }],
                select: {
                    puestoNumero: true,
                    numero: true,
                    estado: true,
                    numeroAutorizacion: true,
                    fechaEmision: true,
                    profesional: { select: { matricula: true } },
                    items: {
                        orderBy: { item: 'asc' },
                        select: {
                            item: true,
                            practicaId: true,
                            efectorMatricula: true,
                            fecha: true,
                            convenioId: true,
                            codigoPractica: true,
                            cantidad: true,
                            numeroAutorizacion: true,
                            importeTotal: true,
                            practica: { select: { matriculaEspecialista: true, matriculaAnestesista: true } },
                            nomencladorPractica: {
                                select: {
                                    descripcion: true,
                                    valorEspecialista: true,
                                    valorAyudante: true,
                                    valorAnestesista: true,
                                },
                            },
                        },
                    },
                },
            },
            cirugiasProgramadas: {
                orderBy: [{ fechaCirugia: 'desc' }, { id: 'desc' }],
                select: {
                    id: true,
                    fechaCirugia: true,
                    diferenciales: {
                        select: {
                            esFeriado: true,
                            esNocturna: true,
                            mismaViaPatologia: true,
                            diferentesViasPatologia: true,
                            diferentesViasDiferentesPatologia: true,
                        },
                    },
                    practicas: {
                        select: {
                            id: true,
                            codigo: true,
                            cantidad: true,
                        },
                    },
                },
            },
        },
    })

    if (!ingreso) return null

    const profesionales = await prisma.profesional.findMany({
        where: { estado: 'A' },
        select: { id: true, nombre: true, matricula: true },
        orderBy: { nombre: 'asc' },
    })

    const reglaFacturacion = resolverReglaFacturacion(
        ingreso?.obraSocial?.nombre ?? '',
        Boolean(ingreso?.obraSocialCoseguroId)
    )

    const obraSocialCoseguro = ingreso.obraSocialCoseguroId
        ? await prisma.obraSocial.findUnique({
            where: { id: ingreso.obraSocialCoseguroId },
            select: { id: true, nombre: true },
        })
        : null

    const prestaciones: PrestacionFacturableItem[] = []
    const matriculaPorOrden = new Map<string, number | null>()
    const autorizacionPorOrden = new Map<string, string | null>()
    const autorizacionPorOrdenItem = new Map<string, string | null>()
    const puestoPorNumeroOrden = new Map<number, number>()
    const ordenVinculadaPorPractica = new Map<
        number,
        {
            puestoNumero: number
            numero: number
            item: number
            numeroAutorizacion: string | null
            estado: string | null
            matriculaEspecialista: number | null
            matriculaAnestesista: number | null
        }
    >()
    const practicasPendientesPorClave = new Map<
        string,
        Array<{ id: number; cantidad: number; fecha: Date }>
    >()
    const valoresPractica = await obtenerValoresPracticas(
        ingreso.practicas.map((p) => p.codigoPractica)
    )
    const cirugiaPracticas = new Map<string, { cirugiaId: number; diferenciales: NonNullable<PrestacionFacturableItem['diferenciales']> }>()

    for (const cirugia of ingreso.cirugiasProgramadas) {
        const diferenciales = cirugia.diferenciales.length > 0
            ? {
                esFeriado: cirugia.diferenciales.some((d) => d.esFeriado),
                esNocturna: cirugia.diferenciales.some((d) => d.esNocturna),
                mismaViaPatologia: cirugia.diferenciales.some((d) => d.mismaViaPatologia),
                diferentesViasPatologia: cirugia.diferenciales.some((d) => d.diferentesViasPatologia),
                diferentesViasDiferentesPatologia: cirugia.diferenciales.some((d) => d.diferentesViasDiferentesPatologia),
            }
            : null
        if (!diferenciales || !tieneDiferencialesActivos(diferenciales)) continue

        for (const practica of cirugia.practicas) {
            const clave = `${normalizarCodigoPracticaFacturacion(practica.codigo)}:${Number(practica.cantidad)}:${fechaClave(cirugia.fechaCirugia)}`
            cirugiaPracticas.set(clave, {
                cirugiaId: cirugia.id,
                diferenciales: diferenciales as NonNullable<PrestacionFacturableItem['diferenciales']>,
            })
        }
    }

    for (const p of ingreso.practicas) {
        if (p.ordenNumero) continue
        const clave = `${p.convenioId}:${normalizarCodigoPractica(p.codigoPractica)}:${Number(p.cantidad)}`
        const actuales = practicasPendientesPorClave.get(clave) ?? []
        actuales.push({ id: p.id, cantidad: Number(p.cantidad), fecha: p.fecha })
        practicasPendientesPorClave.set(clave, actuales)

        const claveCodigo = `${p.convenioId}:${normalizarCodigoPractica(p.codigoPractica)}:*`
        const actualesCodigo = practicasPendientesPorClave.get(claveCodigo) ?? []
        actualesCodigo.push({ id: p.id, cantidad: Number(p.cantidad), fecha: p.fecha })
        practicasPendientesPorClave.set(claveCodigo, actualesCodigo)
    }

    for (const o of ingreso.ordenes) {
        const claveOrden = `${o.puestoNumero}:${o.numero}`
        matriculaPorOrden.set(claveOrden, o.profesional?.matricula ?? null)
        autorizacionPorOrden.set(claveOrden, resolverNumeroAutorizacion(null, o.numeroAutorizacion))
        if (!puestoPorNumeroOrden.has(o.numero)) {
            puestoPorNumeroOrden.set(o.numero, o.puestoNumero)
        }
        for (const it of o.items) {
            autorizacionPorOrdenItem.set(
                `${o.puestoNumero}:${o.numero}:${it.item}`,
                resolverNumeroAutorizacionOrdenItem(
                    it.numeroAutorizacion,
                    o.numeroAutorizacion,
                    o.puestoNumero,
                    o.numero,
                    it.item
                )
            )

            let practicaIdAsociada = it.practicaId

            // Fallback legacy: when the order item is not linked via PraID,
            // try to pair with a single pending practice with same convenio/codigo/cantidad.
            if (!practicaIdAsociada) {
                const clave = `${it.convenioId}:${normalizarCodigoPractica(it.codigoPractica)}:${Number(it.cantidad)}`
                const claveCodigo = `${it.convenioId}:${normalizarCodigoPractica(it.codigoPractica)}:*`
                const candidatasExactas = practicasPendientesPorClave.get(clave) ?? []
                const candidatasCodigo = practicasPendientesPorClave.get(claveCodigo) ?? []

                const candidatas =
                    candidatasExactas.length > 0 ? candidatasExactas : candidatasCodigo

                if (candidatas.length > 0) {
                    const ordenadas = [...candidatas].sort((a, b) => {
                        const penalidadCantidadA = a.cantidad === Number(it.cantidad) ? 0 : 1
                        const penalidadCantidadB = b.cantidad === Number(it.cantidad) ? 0 : 1
                        if (penalidadCantidadA !== penalidadCantidadB) {
                            return penalidadCantidadA - penalidadCantidadB
                        }
                        const diffA = Math.abs(a.fecha.getTime() - it.fecha.getTime())
                        const diffB = Math.abs(b.fecha.getTime() - it.fecha.getTime())
                        return diffA - diffB
                    })
                    const mejor = ordenadas[0]
                    practicaIdAsociada = mejor?.id ?? null

                    if (mejor) {
                        practicasPendientesPorClave.set(
                            clave,
                            (practicasPendientesPorClave.get(clave) ?? []).filter((c) => c.id !== mejor.id)
                        )
                        practicasPendientesPorClave.set(
                            claveCodigo,
                            (practicasPendientesPorClave.get(claveCodigo) ?? []).filter((c) => c.id !== mejor.id)
                        )
                    }
                }
            }

            if (!practicaIdAsociada) continue

            ordenVinculadaPorPractica.set(practicaIdAsociada, {
                puestoNumero: o.puestoNumero,
                numero: o.numero,
                item: it.item,
                numeroAutorizacion: resolverNumeroAutorizacionOrdenItem(
                    it.numeroAutorizacion,
                    o.numeroAutorizacion,
                    o.puestoNumero,
                    o.numero,
                    it.item
                ),
                estado: o.estado,
                matriculaEspecialista:
                    it.practica?.matriculaEspecialista ??
                    (it.efectorMatricula && (
                        it.nomencladorPractica?.valorEspecialista != null ||
                        it.nomencladorPractica?.valorAyudante != null
                    )
                        ? it.efectorMatricula
                        : null),
                matriculaAnestesista:
                    it.practica?.matriculaAnestesista ??
                    (it.efectorMatricula && it.nomencladorPractica?.valorAnestesista != null
                        ? it.efectorMatricula
                        : null),
            })
        }
    }

    for (const p of ingreso.practicas) {
        const vinculoPorItem = ordenVinculadaPorPractica.get(p.id)
        const tieneVinculoExplicitoEnDB = Boolean(p.ordenNumero || p.puestoNumero)
        // Importante: una orden autorizada no implica "facturada".
        // Solo tomamos vínculo de orden cuando está persistido explícitamente en Practica.
        const ordenPuestoNumero =
            p.puestoNumero ??
            (p.ordenNumero ? (puestoPorNumeroOrden.get(p.ordenNumero) ?? null) : null)
        const ordenNumero = p.ordenNumero ?? null
        const ordenItem = p.ordenItem ?? null
        const claveOrden =
            ordenPuestoNumero && ordenNumero ? `${ordenPuestoNumero}:${ordenNumero}` : null
        const claveOrdenItem =
            ordenPuestoNumero && ordenNumero && ordenItem
                ? `${ordenPuestoNumero}:${ordenNumero}:${ordenItem}`
                : null
        const matriculaProfesional =
            ordenPuestoNumero && ordenNumero
                ? (matriculaPorOrden.get(`${ordenPuestoNumero}:${ordenNumero}`) ?? null)
                : null
        const esInternacion = ingreso.tipoIngresoCodigo === 'INT'

        // Buscar si esta práctica pertenece a una cirugía programada
        const clavePractica = `${normalizarCodigoPracticaFacturacion(p.codigoPractica)}:${Number(p.cantidad)}:${fechaClave(p.fecha)}`
        const diferencialCirugia = cirugiaPracticas.get(clavePractica) ?? null
        const esCodigoAnestesista = esCodigoHaObligatorio(p.codigoPractica)
        const matriculaEspecialista =
            esCodigoAnestesista
                ? null
                : (p.matriculaEspecialista ??
                    vinculoPorItem?.matriculaEspecialista ??
                    (esInternacion && p.nomencladorPractica?.valorAyudante != null
                        ? MATRICULA_AYUDANTE_INT_DEFAULT
                        : null))
        const matriculaAnestesista =
            p.matriculaAnestesista ??
            vinculoPorItem?.matriculaAnestesista ??
            (esInternacion && (p.nomencladorPractica?.valorAnestesista != null || esCodigoAnestesista)
                ? MATRICULA_ANESTESISTA_INT_DEFAULT
                : null)

        const precioNomenclador = valoresPractica.get(normalizarCodigoPractica(p.codigoPractica)) ?? 0
        const coberturaBase = calcularImporteFacturable(
            precioNomenclador,
            Number(p.cantidad),
            reglaFacturacion
        )
        const desgloseBase = p.nomencladorPractica
            ? aplicarOverrideEspecialAnestesistaPorCodigo(p.codigoPractica, {
                valorEspecialista: p.nomencladorPractica.valorEspecialista != null ? Number(p.nomencladorPractica.valorEspecialista) : null,
                valorAyudante: p.nomencladorPractica.valorAyudante != null ? Number(p.nomencladorPractica.valorAyudante) : null,
                valorAnestesista: p.nomencladorPractica.valorAnestesista != null ? Number(p.nomencladorPractica.valorAnestesista) : null,
                valorGastos: p.nomencladorPractica.valorGastos != null ? Number(p.nomencladorPractica.valorGastos) : null,
            })
            : null
        const desgloseConDiferencial = desgloseBase
            ? aplicarDiferencialesAValores(desgloseBase, diferencialCirugia?.diferenciales ?? null)
            : null
        const totalUnitarioDesglose = desgloseConDiferencial
            ? (desgloseConDiferencial.valorEspecialista ?? 0) +
            (desgloseConDiferencial.valorAyudante ?? 0) +
            (desgloseConDiferencial.valorAnestesista ?? 0) +
            (desgloseConDiferencial.valorGastos ?? 0)
            : null
        const importeFromDb = p.importeTotal != null ? Number(String(p.importeTotal)) : null
        const cant = Number(p.cantidad)
        const precioUnitario = totalUnitarioDesglose !== null
            ? totalUnitarioDesglose
            : (coberturaBase.precioUnitarioFacturable > 0
                ? coberturaBase.precioUnitarioFacturable
                : (importeFromDb !== null && cant > 0 ? importeFromDb / cant : coberturaBase.precioUnitarioFacturable))
        const importeTotalCalculado = totalUnitarioDesglose !== null
            ? Number((totalUnitarioDesglose * cant).toFixed(2))
            : coberturaBase.importeTotalFacturable
        prestaciones.push({
            uid: `PRACTICA:${p.id}`,
            tipo: 'PRACTICA',
            referencia: `PRA-${p.id}`,
            fecha: p.fecha,
            descripcion: p.nomencladorPractica?.descripcion ?? p.codigoPractica.trim(),
            cantidad: cant,
            precioUnitario,
            importeTotal: diferencialCirugia ? importeTotalCalculado : (importeFromDb ?? coberturaBase.importeTotalFacturable),
            // Una práctica queda facturada solo con vínculo explícito a orden en la propia tabla.
            facturada: Boolean(p.ordenNumero),
            matriculaProfesional: matriculaProfesional ?? matriculaEspecialista ?? matriculaAnestesista,
            matriculaEspecialista,
            matriculaAnestesista,
            ordenPuestoNumero,
            ordenNumero,
            convenioId: p.convenioId,
            codigoPractica: p.codigoPractica.trim(),
            esPracticaCirugia: Boolean(diferencialCirugia),
            diferenciales: diferencialCirugia?.diferenciales ?? null,
            numeroAutorizacion: tieneVinculoExplicitoEnDB
                ? resolverNumeroAutorizacion(
                    p.numeroAutorizacion,
                    resolverNumeroAutorizacion(
                        vinculoPorItem?.numeroAutorizacion,
                        resolverNumeroAutorizacion(
                            claveOrdenItem ? autorizacionPorOrdenItem.get(claveOrdenItem) : null,
                            claveOrden ? autorizacionPorOrden.get(claveOrden) : null
                        )
                    )
                )
                : (p.numeroAutorizacion?.trim() || null),
            origen: {
                ingresoId: ingreso.id,
                practicaId: p.id,
                ordenPuestoNumero: ordenPuestoNumero ?? undefined,
                ordenNumero: ordenNumero ?? undefined,
                ordenItem: ordenItem ?? undefined,
                cirugiaProgramadaId: diferencialCirugia?.cirugiaId,
            },
            desglose: desgloseConDiferencial ? {
                valorEspecialista: desgloseConDiferencial.valorEspecialista,
                valorAyudante: desgloseConDiferencial.valorAyudante,
                valorAnestesista: desgloseConDiferencial.valorAnestesista,
                valorGastos: desgloseConDiferencial.valorGastos,
                valorTotal: null,
            } : p.nomencladorPractica ? {
                ...aplicarOverrideEspecialAnestesistaPorCodigo(p.codigoPractica, {
                    valorEspecialista: p.nomencladorPractica.valorEspecialista != null ? Number(p.nomencladorPractica.valorEspecialista) : null,
                    valorAyudante: p.nomencladorPractica.valorAyudante != null ? Number(p.nomencladorPractica.valorAyudante) : null,
                    valorAnestesista: p.nomencladorPractica.valorAnestesista != null ? Number(p.nomencladorPractica.valorAnestesista) : null,
                    valorGastos: p.nomencladorPractica.valorGastos != null ? Number(p.nomencladorPractica.valorGastos) : null,
                }),
                valorTotal: null,
            } : undefined,
        })
    }

    // Solo considerar como "ítem facturado" lo que esté enlazado explícitamente
    // desde Practica (evita duplicar con órdenes solo autorizadas).
    const itemsOrdenFacturados = new Set<string>()
    for (const p of ingreso.practicas) {
        if (!p.ordenNumero || !p.ordenItem) continue
        const puesto = p.puestoNumero ?? (puestoPorNumeroOrden.get(p.ordenNumero) ?? null)
        if (!puesto) continue
        itemsOrdenFacturados.add(`${puesto}:${p.ordenNumero}:${p.ordenItem}`)
    }

    for (const o of ingreso.ordenes) {
        if (o.estado === 'X') continue
        for (const it of o.items) {
            const claveItem = `${o.puestoNumero}:${o.numero}:${it.item}`
            if (!itemsOrdenFacturados.has(claveItem)) continue

            const numeroAutorizacion = resolverNumeroAutorizacionOrdenItem(
                it.numeroAutorizacion,
                o.numeroAutorizacion,
                o.puestoNumero,
                o.numero,
                it.item
            )
            if (!tieneNumeroAutorizacionValido(numeroAutorizacion)) continue

            const matriculaEspecialistaItem =
                it.practica?.matriculaEspecialista ??
                (it.efectorMatricula && (
                    it.nomencladorPractica?.valorEspecialista != null ||
                    it.nomencladorPractica?.valorAyudante != null
                )
                    ? it.efectorMatricula
                    : (ingreso.tipoIngresoCodigo === 'INT' && it.nomencladorPractica?.valorAyudante != null
                        ? MATRICULA_AYUDANTE_INT_DEFAULT
                        : null))
            const matriculaAnestesistaItem =
                it.practica?.matriculaAnestesista ??
                (it.efectorMatricula && it.nomencladorPractica?.valorAnestesista != null
                    ? it.efectorMatricula
                    : (ingreso.tipoIngresoCodigo === 'INT' && it.nomencladorPractica?.valorAnestesista != null
                        ? MATRICULA_ANESTESISTA_INT_DEFAULT
                        : null))

            prestaciones.push({
                uid: `ORDEN_ITEM:${o.puestoNumero}:${o.numero}:${it.item}`,
                tipo: 'ORDEN_ITEM',
                referencia: `${o.puestoNumero.toString().padStart(4, '0')}-${o.numero.toString().padStart(8, '0')}-${it.item.toString().padStart(2, '0')}`,
                fecha: it.fecha,
                descripcion: it.nomencladorPractica?.descripcion ?? it.codigoPractica.trim(),
                cantidad: Number(it.cantidad),
                precioUnitario:
                    Number(it.cantidad) > 0
                        ? Number(String(it.importeTotal ?? 0)) / Number(it.cantidad)
                        : Number(String(it.importeTotal ?? 0)),
                importeTotal: Number(String(it.importeTotal ?? 0)),
                facturada: true,
                matriculaProfesional: o.profesional?.matricula ?? null,
                matriculaEspecialista: matriculaEspecialistaItem,
                matriculaAnestesista: matriculaAnestesistaItem,
                ordenPuestoNumero: o.puestoNumero,
                ordenNumero: o.numero,
                convenioId: it.convenioId,
                codigoPractica: it.codigoPractica.trim(),
                numeroAutorizacion,
                origen: {
                    ingresoId: ingreso.id,
                    ordenPuestoNumero: o.puestoNumero,
                    ordenNumero: o.numero,
                    ordenItem: it.item,
                },
            })
        }
    }

    for (const m of ingreso.medicaciones) {
        const detalle = [m.dosis, m.viaAdministracion, m.frecuencia].filter(Boolean).join(' · ')
        prestaciones.push({
            uid: `MEDICACION:${m.id}`,
            tipo: 'MEDICACION',
            referencia: `MED-${m.id}`,
            fecha: m.fechaInicio,
            descripcion: detalle ? `${m.nombre} (${detalle})` : m.nombre,
            cantidad: 1,
            precioUnitario: precioFicticioMedicacion(m.nombre),
            importeTotal: precioFicticioMedicacion(m.nombre),
            facturada: false,
            matriculaProfesional: null,
            matriculaEspecialista: null,
            matriculaAnestesista: null,
            ordenPuestoNumero: null,
            ordenNumero: null,
            convenioId: null,
            codigoPractica: null,
            numeroAutorizacion: null,
            origen: { ingresoId: ingreso.id, medicacionId: m.id },
        })
    }

    for (const d of ingreso.descartables) {
        const detalle = d.observaciones ? `${d.nombre} (${d.observaciones})` : d.nombre
        const precioUnitario = precioFicticioDescartable(d.nombre)
        const cantidad = Number(d.cantidad)
        prestaciones.push({
            uid: `DESCARTABLE:${d.id}`,
            tipo: 'DESCARTABLE',
            referencia: `DES-${d.id}`,
            fecha: d.fechaInicio,
            descripcion: detalle,
            cantidad,
            precioUnitario,
            importeTotal: Number((precioUnitario * cantidad).toFixed(2)),
            facturada: false,
            matriculaProfesional: null,
            matriculaEspecialista: null,
            matriculaAnestesista: null,
            ordenPuestoNumero: null,
            ordenNumero: null,
            convenioId: null,
            codigoPractica: null,
            numeroAutorizacion: null,
            origen: { ingresoId: ingreso.id, descartableId: d.id },
        })
    }

    if (ingreso.tipoIngresoCodigo === 'INT' && ingreso.fechaIngreso) {
        const desde = new Date(ingreso.fechaIngreso)
        const hasta = ingreso.fechaEgreso ? new Date(ingreso.fechaEgreso) : new Date()
        const diferenciaDias = Math.max(1, Math.ceil((hasta.getTime() - desde.getTime()) / MS_POR_DIA))

        prestaciones.push({
            uid: `DIA_INTERNACION:${ingreso.id}`,
            tipo: 'DIA_INTERNACION',
            referencia: `DIA-INT-${ingreso.id}`,
            fecha: desde,
            descripcion: `Dias de internacion (${diferenciaDias})`,
            cantidad: diferenciaDias,
            precioUnitario: null,
            importeTotal: null,
            facturada: false,
            matriculaProfesional: null,
            matriculaEspecialista: null,
            matriculaAnestesista: null,
            ordenPuestoNumero: null,
            ordenNumero: null,
            convenioId: null,
            codigoPractica: null,
            numeroAutorizacion: null,
            origen: { ingresoId: ingreso.id },
        })
    }

    prestaciones.sort((a, b) => b.fecha.getTime() - a.fecha.getTime())

    return {
        ingreso: {
            id: ingreso.id,
            tipoIngresoCodigo: ingreso.tipoIngresoCodigo,
            numeroIngreso: ingreso.numeroIngreso,
            estado: ingreso.estado,
            fechaIngreso: ingreso.fechaIngreso,
            fechaEgreso: ingreso.fechaEgreso,
            nombre: ingreso.nombre,
            descripcionPatologia: ingreso.descripcionPatologia,
            numeroAfiliado: ingreso.numeroAfiliado,
            observaciones: ingreso.observaciones,
            obraSocialId: ingreso.obraSocialId,
            planId: ingreso.planId,
            obraSocialCoseguroId: ingreso.obraSocialCoseguroId,
        },
        paciente: ingreso.paciente,
        obraSocial: ingreso.obraSocial,
        obraSocialCoseguro,
        plan: ingreso.plan,
        reglaFacturacion,
        profesionales,
        prestaciones,
    }
}

export async function crearPracticaFacturacion(
    data: CrearPracticaFacturacionInput,
    usuario: string
): Promise<{ id: number }> {
    const codigo = data.codigoPractica.trim().slice(0, 8)
    const cantidad = Number(data.cantidad)
    const ingreso = await prisma.ingreso.findUnique({
        where: { id: data.ingresoId },
        select: {
            obraSocialId: true,
            planId: true,
            obraSocialCoseguroId: true,
            obraSocial: { select: { nombre: true } },
        },
    })

    if (!ingreso) throw new Error('Ingreso no encontrado')

    const regla = resolverReglaFacturacion(
        ingreso.obraSocial?.nombre,
        Boolean(ingreso.obraSocialCoseguroId)
    )

    let importeTotal: number
    if (data.importeBaseUnitario != null && data.importeBaseUnitario > 0) {
        const cobertura = calcularImporteFacturable(data.importeBaseUnitario, cantidad, regla)
        importeTotal = cobertura.importeTotalFacturable
    } else {
        const valorPractica = await obtenerValorPractica(codigo)
        const cobertura = calcularImporteFacturable(valorPractica, cantidad, regla)
        importeTotal = cobertura.importeTotalFacturable
    }

    const practica = await prisma.practica.create({
        data: {
            ingresoId: data.ingresoId,
            convenioId: data.convenioId,
            codigoPractica: codigo.toUpperCase().padEnd(8, ' '),
            convenioValorId: 0,
            fecha: data.fecha,
            cantidad,
            numeroAutorizacion: data.numeroAutorizacion ?? null,
            obraSocialId: ingreso.obraSocialId ?? null,
            planId: ingreso.planId ?? null,
            facturable: true,
            importeTotal,
            usuarioRegistro: usuario.trim().slice(0, 10) || 'SISTEMA',
        },
        select: { id: true },
    })

    return practica
}

export async function crearMedicacionFacturacion(
    data: CrearMedicacionFacturacionInput,
    usuario: string
): Promise<{ id: number }> {
    const medicacion = await prisma.medicacionIngreso.create({
        data: {
            ingresoId: data.ingresoId,
            nombre: data.nombre,
            dosis: data.dosis ?? null,
            viaAdministracion: data.viaAdministracion ?? null,
            frecuencia: data.frecuencia ?? null,
            fechaInicio: data.fechaInicio,
            fechaFin: data.fechaFin ?? null,
            observaciones: data.observaciones ?? null,
            profesionalId: data.profesionalId ?? null,
            estado: 'A',
            usuario: usuario.trim().slice(0, 10) || 'SISTEMA',
            fechaEstado: new Date(),
        },
        select: { id: true },
    })

    return medicacion
}

export async function crearDescartableFacturacion(
    data: CrearDescartableFacturacionInput,
    usuario: string
): Promise<{ id: number }> {
    const descartable = await prisma.descartableIngreso.create({
        data: {
            ingresoId: data.ingresoId,
            nombre: data.nombre,
            cantidad: data.cantidad,
            observaciones: data.observaciones ?? null,
            fechaInicio: new Date(),
            profesionalId: data.profesionalId ?? null,
            estado: 'A',
            usuario: usuario.trim().slice(0, 10) || 'SISTEMA',
            fechaEstado: new Date(),
        },
        select: { id: true },
    })

    return descartable
}

export async function actualizarContextoFacturacion(
    ingresoId: number,
    data: ActualizarContextoFacturacionInput,
    usuario: string
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        if (data.ingreso) {
            await tx.ingreso.update({
                where: { id: ingresoId },
                data: {
                    nombre: data.ingreso.nombre,
                    descripcionPatologia: data.ingreso.descripcionPatologia,
                    numeroAfiliado: data.ingreso.numeroAfiliado,
                    observaciones: data.ingreso.observaciones,
                    obraSocialId: data.ingreso.obraSocialId,
                    planId: data.ingreso.planId,
                    fechaEstado: new Date(),
                    usuario: usuario.trim().slice(0, 10) || 'SISTEMA',
                },
            })
        }

        if (data.paciente) {
            const ingreso = await tx.ingreso.findUnique({
                where: { id: ingresoId },
                select: { pacienteId: true },
            })

            if (ingreso?.pacienteId) {
                await tx.paciente.update({
                    where: { id: ingreso.pacienteId },
                    data: {
                        apellido: data.paciente.apellido,
                        nombre: data.paciente.nombre,
                        nombreCompleto: data.paciente.nombreCompleto,
                        numeroDocumento: data.paciente.numeroDocumento,
                        celular1: data.paciente.celular1,
                        email: data.paciente.email,
                        domicilio: data.paciente.domicilio,
                        fechaModificacion: new Date(),
                    },
                })
            }
        }
    })
}

export async function cargarOrdenesDesdePrestaciones(
    data: CargarOrdenesFacturacionInput,
    usuario: string
): Promise<OrdenFacturacionResultado> {
    const ingreso = await prisma.ingreso.findUnique({
        where: { id: data.ingresoId },
        select: {
            id: true,
            pacienteId: true,
            tipoIngresoCodigo: true,
            nombre: true,
            numeroAfiliado: true,
            obraSocialId: true,
            planId: true,
            obraSocialCoseguroId: true,
            planCoseguroId: true,
            descripcionPatologia: true,
            profesionalTratanteId: true,
            profesionalGuardiaId: true,
            obraSocial: { select: { nombre: true } },
        },
    })

    if (!ingreso) throw new Error('Ingreso no encontrado')
    if (!ingreso.obraSocialId) {
        throw new Error('El ingreso no tiene obra social cargada')
    }

    const profesionalId =
        data.profesionalId ?? ingreso.profesionalTratanteId ?? ingreso.profesionalGuardiaId
    if (!profesionalId) throw new Error('Debe indicar un profesional para generar la orden')

    let prestacionesOrigen = data.prestaciones

    if (data.facturarTodo || prestacionesOrigen.length === 0) {
        const practicasPendientes = await prisma.practica.findMany({
            where: {
                ingresoId: data.ingresoId,
                facturable: true,
                ordenNumero: null,
                AND: [
                    { numeroAutorizacion: { not: null } },
                    { numeroAutorizacion: { not: '' } },
                ],
            },
            orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
            select: {
                id: true,
                convenioId: true,
                codigoPractica: true,
                cantidad: true,
                ordenItem: true,
                numeroAutorizacion: true,
                matriculaEspecialista: true,
                matriculaAnestesista: true,
                nomencladorPractica: { select: { descripcion: true } },
            },
        })

        prestacionesOrigen = practicasPendientes.map((p) => ({
            practicaId: p.id,
            convenioId: p.convenioId,
            codigoPractica: p.codigoPractica.trim(),
            descripcionPractica: p.nomencladorPractica?.descripcion ?? p.codigoPractica.trim(),
            cantidad: Number(p.cantidad),
            numeroAutorizacion: p.numeroAutorizacion,
            matriculaEspecialista: p.matriculaEspecialista,
            matriculaAnestesista: p.matriculaAnestesista,
            grupoOrden: p.ordenItem && p.ordenItem > 0 ? p.ordenItem : 1,
            titularModular: data.titularModular ?? null,
        }))
    }

    const prestacionesPreparadas = prestacionesOrigen.map((p, idx) => ({
        ...p,
        practicaId: p.practicaId ?? null,
        grupoOrden: Number.isFinite(Number(p.grupoOrden)) && Number(p.grupoOrden) > 0
            ? Math.floor(Number(p.grupoOrden))
            : 1,
        ordenIndice: idx,
        numeroAutorizacion:
            typeof p.numeroAutorizacion === 'string' ? p.numeroAutorizacion.trim() : p.numeroAutorizacion,
    }))

    const prestacionesSinAutorizacion = prestacionesPreparadas.filter(
        (p) => !tieneNumeroAutorizacionValido(p.numeroAutorizacion)
    )
    if (prestacionesSinAutorizacion.length > 0) {
        throw new Error('No se puede facturar sin número de autorización. Confirmá la orden primero.')
    }

    if (prestacionesPreparadas.length === 0) {
        throw new Error('No hay practicas pendientes para facturar en este ingreso')
    }

    const reglaFacturacion = resolverReglaFacturacion(
        ingreso.obraSocial?.nombre,
        Boolean(ingreso.obraSocialCoseguroId)
    )

    const ordenInputBase: Omit<CrearOrdenInput, 'items'> = {
        ingresoId: ingreso.id,
        pacienteId: ingreso.pacienteId ?? undefined,
        nombrePaciente: (ingreso.nombre ?? '').slice(0, 50) || 'SIN NOMBRE',
        numeroAfiliado: ingreso.numeroAfiliado ?? '',
        obraSocialId: ingreso.obraSocialId,
        // planId: ingreso.planId, // No se incluye en CrearOrdenInput
        obraSocialCoseguroId: ingreso.obraSocialCoseguroId ?? undefined,
        // planCoseguroId: ingreso.planCoseguroId, // No se incluye en CrearOrdenInput
        profesionalId,
        tipoOrdenCodigo: 'PRA',
        descripcionPatologia: ingreso.descripcionPatologia ?? undefined,
    }

    async function construirItemsOrden(prestaciones: typeof prestacionesPreparadas) {
        return Promise.all(prestaciones.map(async (p: any) => {
            const codigo = p.codigoPractica.trim().slice(0, 8)
            const cantidad = Number(p.cantidad)

            let importeTotalFinal: number
            if (p.importeTotal != null && p.importeTotal > 0) {
                // Use client-provided importe (already accounts for component selection)
                importeTotalFinal = p.importeTotal
            } else {
                const unitario = await obtenerValorPractica(codigo)
                const cobertura = calcularImporteFacturable(unitario, cantidad, reglaFacturacion)
                importeTotalFinal = cobertura.importeTotalFacturable
            }

            const unitarioParaCargo = await obtenerValorPractica(codigo)
            const coberturaParaCargo = calcularImporteFacturable(unitarioParaCargo, cantidad, reglaFacturacion)
            const matriculaEfector = resolverMatriculaEfectorFacturacion({
                tipoIngresoCodigo: ingreso?.tipoIngresoCodigo ?? '',
                codigoPractica: p.codigoPractica,
                descripcionPractica: p.descripcionPractica,
                matriculaEspecialista: p.matriculaEspecialista ?? null,
                matriculaAnestesista: p.matriculaAnestesista ?? null,
            })

            return {
                convenioId: p.convenioId,
                codigoPractica: codigo,
                descripcionPractica: p.descripcionPractica,
                cantidad,
                numeroAutorizacion: p.numeroAutorizacion?.trim() ?? null,
                tipoFacturacion: 'H',
                efectorMatricula: matriculaEfector,
                titularModular: (typeof p.titularModular === 'string' ? p.titularModular : (data.titularModular ?? undefined)),
                importeTotal: importeTotalFinal,
                porcentajeCargoPac:
                    coberturaParaCargo.porcentajeCargoPaciente > 0
                        ? coberturaParaCargo.porcentajeCargoPaciente
                        : undefined,
            }
        }))
    }

    if (data.modo === 'INDIVIDUAL') {
        const ordenInput: CrearOrdenInput = {
            ...ordenInputBase,
            items: await construirItemsOrden(prestacionesPreparadas),
        }
        const ordenes = await crearOrdenesAmbulatoriasPorPractica(ordenInput, usuario)
        await Promise.all(
            prestacionesPreparadas.map((prestacion, idx) => {
                const ref = ordenes[idx]
                if (!ref || !prestacion.practicaId) return Promise.resolve()
                return prisma.practica.update({
                    where: { id: prestacion.practicaId },
                    data: {
                        puestoNumero: ref.puestoNumero,
                        ordenNumero: ref.numero,
                        ordenItem: 1,
                    },
                })
            })
        )
        return { modo: 'INDIVIDUAL', ordenes }
    }

    if (data.modo === 'AGRUPADA') {
        const grupos = new Map<number, typeof prestacionesPreparadas>()
        for (const prestacion of prestacionesPreparadas) {
            const key = prestacion.grupoOrden
            const arr = grupos.get(key) ?? []
            arr.push(prestacion)
            grupos.set(key, arr)
        }

        const ordenes: Array<{ puestoNumero: number; numero: number }> = []
        const gruposOrdenados = Array.from(grupos.entries()).sort((a, b) => a[0] - b[0])

        for (const [, prestacionesGrupo] of gruposOrdenados) {
            const items = await construirItemsOrden(
                [...prestacionesGrupo].sort((a, b) => a.ordenIndice - b.ordenIndice)
            )
            const orden = await crearOrdenAmbulatorio({ ...ordenInputBase, items }, usuario)
            ordenes.push({ puestoNumero: orden.puestoNumero, numero: orden.numero })

            await Promise.all(
                prestacionesGrupo.map((prestacion, idx) => {
                    if (!prestacion.practicaId) return Promise.resolve()
                    return prisma.practica.update({
                        where: { id: prestacion.practicaId },
                        data: {
                            puestoNumero: orden.puestoNumero,
                            ordenNumero: orden.numero,
                            ordenItem: idx + 1,
                        },
                    })
                })
            )
        }

        return { modo: 'AGRUPADA', ordenes }
    }

    const orden = await crearOrdenAmbulatorio({
        ...ordenInputBase,
        items: await construirItemsOrden(prestacionesPreparadas),
    }, usuario)
    await Promise.all(
        prestacionesPreparadas.map((prestacion, idx) => {
            if (!prestacion.practicaId) return Promise.resolve()
            return prisma.practica.update({
                where: { id: prestacion.practicaId },
                data: {
                    puestoNumero: orden.puestoNumero,
                    ordenNumero: orden.numero,
                    ordenItem: idx + 1,
                },
            })
        })
    )
    return {
        modo: 'MASIVA',
        ordenes: [{ puestoNumero: orden.puestoNumero, numero: orden.numero }],
    }
}

export async function actualizarNumeroAutorizacion(
    data: ActualizarAutorizacionInput
): Promise<void> {
    if (data.tipo === 'PRACTICA') {
        await prisma.practica.update({
            where: { id: data.practicaId },
            data: { numeroAutorizacion: data.numeroAutorizacion ?? null },
        })
        return
    }

    await prisma.ordenPractica.update({
        where: {
            puestoNumero_ordenNumero_item: {
                puestoNumero: data.puestoNumero,
                ordenNumero: data.ordenNumero,
                item: data.item,
            },
        },
        data: { numeroAutorizacion: data.numeroAutorizacion ?? null },
    })
}

async function resolverPracticaDesdeInput(
    codigoPractica: string,
    descripcionPractica: string | null | undefined,
    convenioIdActual: number
): Promise<{ convenioId: number; codigoPractica: string }> {
    const codigo = codigoPractica.trim().slice(0, 8)
    const exacto = await prisma.nomencladorPractica.findFirst({
        where: {
            convenioId: convenioIdActual,
            codigo: { startsWith: codigo },
        },
        select: { convenioId: true, codigo: true },
    })
    if (exacto) return { convenioId: exacto.convenioId, codigoPractica: exacto.codigo.trim() }

    if (descripcionPractica?.trim()) {
        const porDescripcion = await prisma.nomencladorPractica.findFirst({
            where: { descripcion: { contains: descripcionPractica.trim(), mode: 'insensitive' } },
            select: { convenioId: true, codigo: true },
            orderBy: [{ convenioId: 'asc' }, { codigo: 'asc' }],
        })
        if (porDescripcion) {
            return { convenioId: porDescripcion.convenioId, codigoPractica: porDescripcion.codigo.trim() }
        }
    }

    return { convenioId: convenioIdActual, codigoPractica: codigo }
}

export async function actualizarPrestacionFacturacion(
    data: ActualizarPrestacionFacturacionInput
): Promise<void> {
    if (data.tipo === 'PRACTICA') {
        const actual = await prisma.practica.findUnique({
            where: { id: data.practicaId },
            select: { convenioId: true },
        })
        if (!actual) throw new Error('Práctica no encontrada')

        const resolved = await resolverPracticaDesdeInput(
            data.codigoPractica,
            data.descripcionPractica,
            actual.convenioId
        )

        await prisma.practica.update({
            where: { id: data.practicaId },
            data: {
                fecha: data.fecha,
                convenioId: resolved.convenioId,
                codigoPractica: resolved.codigoPractica.trim(),
                cantidad: data.cantidad,
                numeroAutorizacion: data.numeroAutorizacion ?? null,
                importeTotal: data.importeTotal,
                matriculaEspecialista: data.matriculaEspecialista ?? null,
                matriculaAnestesista: data.matriculaAnestesista ?? null,
                // Unlink from any existing order so it's treated as pending again
                puestoNumero: null,
                ordenNumero: null,
                ordenItem: null,
            },
        })
        return
    }

    const actualItem = await prisma.ordenPractica.findUnique({
        where: {
            puestoNumero_ordenNumero_item: {
                puestoNumero: data.puestoNumero,
                ordenNumero: data.ordenNumero,
                item: data.item,
            },
        },
        select: { convenioId: true },
    })
    if (!actualItem) throw new Error('Ítem de orden no encontrado')

    const resolved = await resolverPracticaDesdeInput(
        data.codigoPractica,
        data.descripcionPractica,
        actualItem.convenioId
    )

    await prisma.ordenPractica.update({
        where: {
            puestoNumero_ordenNumero_item: {
                puestoNumero: data.puestoNumero,
                ordenNumero: data.ordenNumero,
                item: data.item,
            },
        },
        data: {
            fecha: data.fecha,
            convenioId: resolved.convenioId,
            codigoPractica: resolved.codigoPractica.trim(),
            cantidad: data.cantidad,
            numeroAutorizacion: data.numeroAutorizacion ?? null,
            importeTotal: data.importeTotal,
        },
    })

    if (data.matriculaProfesional) {
        const profesional = await prisma.profesional.findFirst({
            where: { matricula: data.matriculaProfesional },
            select: { id: true },
        })
        if (profesional) {
            await prisma.orden.update({
                where: {
                    puestoNumero_numero: {
                        puestoNumero: data.puestoNumero,
                        numero: data.ordenNumero,
                    },
                },
                data: { profesionalId: profesional.id },
            })
        }
    }

    const orden = await prisma.orden.findUnique({
        where: { puestoNumero_numero: { puestoNumero: data.puestoNumero, numero: data.ordenNumero } },
        select: { items: { select: { importeTotal: true } } },
    })
    if (orden) {
        const total = orden.items.reduce((sum, it) => sum + Number(it.importeTotal ?? 0), 0)
        await prisma.orden.update({
            where: { puestoNumero_numero: { puestoNumero: data.puestoNumero, numero: data.ordenNumero } },
            data: { importeTotal: total },
        })
    }
}

export async function anularOrdenFacturacion(puestoNumero: number, numero: number): Promise<void> {
    await prisma.$transaction(async (tx) => {
        // Unlink Practica records that were source of this order
        await tx.practica.updateMany({
            where: { puestoNumero, ordenNumero: numero },
            data: { puestoNumero: null, ordenNumero: null, ordenItem: null },
        })
        // Cancel the order
        await tx.orden.update({
            where: { puestoNumero_numero: { puestoNumero, numero } },
            data: { estado: 'X', fechaEstado: new Date() },
        })
    })
}

// ============================================
// LOTES DE FACTURACIÓN
// ============================================

const LOTE_SELECT = {
    id: true,
    numero: true,
    fecha: true,
    periodo: true,
    tipo: true,
    estado: true,
    origen: true,
    sedeId: true,
    descripcion: true,
    concepto: true,
    importeTotal: true,
    tipoIngresoCodigo: true,
    rangoDesde: true,
    rangoHasta: true,
    obraSocial: { select: { id: true, nombre: true } },
    plan: { select: { id: true, descripcion: true } },
} satisfies Prisma.LoteFacturacionSelect

function mapLoteRow(row: Prisma.LoteFacturacionGetPayload<{ select: typeof LOTE_SELECT }>): LoteFacturacionListItem {
    return {
        ...row,
        tipo: row.tipo as LoteFacturacionListItem['tipo'],
        estado: row.estado as EstadoLote,
        importeTotal: Number(row.importeTotal),
    }
}

export async function buscarLotes(
    params: BusquedaLotesInput
): Promise<{ items: LoteFacturacionListItem[]; total: number }> {
    const { periodo, estado, obraSocialId, tipo, medico, matricula, pagina, porPagina } = params
    const skip = (pagina - 1) * porPagina

    const where: Prisma.LoteFacturacionWhereInput = {}
    if (periodo) where.periodo = periodo
    if (estado) where.estado = estado
    if (obraSocialId) where.obraSocialId = obraSocialId
    if (tipo) where.tipo = tipo
    if (medico || matricula) {
        const especialistaWhere = buildEspecialistaOrdenWhere({ medico, matricula })
        const periodoOrdenWhere: Prisma.OrdenWhereInput = periodo
            ? (() => {
                const { desde, hasta } = periodoToDateRange(periodo)
                return { fechaEmision: { gte: desde, lt: hasta } }
            })()
            : {}
        where.items = {
            some: {
                ingreso: {
                    ordenes: {
                        some: {
                            AND: [buildOrdenAutorizadaWhere(), especialistaWhere, periodoOrdenWhere],
                        },
                    },
                },
            },
        }
    }

    const [total, rows] = await Promise.all([
        prisma.loteFacturacion.count({ where }),
        prisma.loteFacturacion.findMany({
            where,
            skip,
            take: porPagina,
            orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
            select: LOTE_SELECT,
        }),
    ])

    return { items: rows.map(mapLoteRow), total }
}

export async function obtenerLote(
    id: number,
    filtros?: { medico?: string; matricula?: number }
): Promise<LoteFacturacionDetalle | null> {
    const lote = await prisma.loteFacturacion.findUnique({
        where: { id },
        select: {
            ...LOTE_SELECT,
            itemsIPSTxt: {
                orderBy: [{ afiliadoNom: 'asc' }, { id: 'asc' }],
            },
        },
    })

    if (!lote) return null

    const especialistaWhere = buildEspecialistaOrdenWhere({
        medico: filtros?.medico,
        matricula: filtros?.matricula,
    })

    const [desde, hasta] = [periodoToDateRange(lote.periodo).desde, periodoToDateRange(lote.periodo).hasta]
    const whereIngresoFiltro: Prisma.IngresoWhereInput =
        filtros?.medico || filtros?.matricula
            ? {
                ordenes: {
                    some: {
                        AND: [
                            { estado: { not: 'X' } },
                            { fechaEmision: { gte: desde, lt: hasta } },
                            buildOrdenAutorizadaWhere(),
                            especialistaWhere,
                        ],
                    },
                },
            }
            : {}

    const itemsLote = await prisma.loteFacturacionItem.findMany({
        where: {
            loteId: id,
            ...(filtros?.medico || filtros?.matricula ? { ingreso: whereIngresoFiltro } : {}),
        },
        orderBy: [{ ingreso: { fechaIngreso: 'asc' } }, { id: 'asc' }],
        select: {
            id: true,
            loteId: true,
            ingresoId: true,
            incluido: true,
            importeTotal: true,
            ingreso: {
                select: {
                    id: true,
                    tipoIngresoCodigo: true,
                    numeroIngreso: true,
                    estado: true,
                    fechaIngreso: true,
                    fechaEgreso: true,
                    nombre: true,
                    numeroAfiliado: true,
                    descripcionPatologia: true,
                    paciente: { select: { id: true, nombreCompleto: true, numeroDocumento: true } },
                },
            },
        },
    })

    return {
        ...mapLoteRow(lote),
        items: itemsLote.map((item) => ({
            ...item,
            importeTotal: Number(item.importeTotal),
            paciente: item.ingreso.paciente,
        })) as LoteFacturacionItemDetalle[],
        itemsIPSTxt: lote.itemsIPSTxt.map((it) => ({
            ...it,
            impEsp: Number(it.impEsp),
            impAyu: Number(it.impAyu),
            impAne: Number(it.impAne),
            impGto: Number(it.impGto),
            impTotal: Number(it.impTotal),
            importePromedi: it.importePromedi !== null ? Number(it.importePromedi) : null,
        })) as LoteIPSTxtItemDetalle[],
    }
}

export async function crearLote(
    data: CrearLoteFacturacionInput,
    usuario: string
): Promise<{ id: number; numero: number }> {
    const now = new Date()
    const usuarioCod = usuario.trim().slice(0, 10) || 'SISTEMA'

    // Determine next numero
    const ultimo = await prisma.loteFacturacion.findFirst({
        orderBy: { numero: 'desc' },
        select: { numero: true },
    })
    const numero = (ultimo?.numero ?? 0) + 1
    const { desde, hasta } = periodoToDateRange(data.periodo)

    // Build where for ingreso resolution
    const whereIngreso: Prisma.IngresoWhereInput = {
        estado: { in: ['A', 'E'] },
    }
    if (data.tipoIngresoCodigo) whereIngreso.tipoIngresoCodigo = data.tipoIngresoCodigo
    if (data.clienteTipo === 'PARTICULAR') {
        whereIngreso.obraSocialId = null
    } else {
        if (!data.obraSocialId) {
            throw new Error('Debe seleccionar una obra social cuando el cliente es obra social')
        }
        whereIngreso.obraSocialId = data.obraSocialId
    }
    if (data.rangoDesde || data.rangoHasta) {
        whereIngreso.numeroIngreso = {
            ...(data.rangoDesde ? { gte: data.rangoDesde } : {}),
            ...(data.rangoHasta ? { lte: data.rangoHasta } : {}),
        }
    }
    // If no obraSocialId, could be particular (no OS). If obraSocialId is set, filter by it.

    // Filter ingresos that have at least one authorized prestacion of the right type
    if (data.tipo === 'PRACTICAS') {
        whereIngreso.ordenes = {
            some: {
                estado: { not: 'X' },
                fechaEmision: { gte: desde, lt: hasta },
                OR: [
                    {
                        AND: [
                            { numeroAutorizacion: { not: null } },
                            { numeroAutorizacion: { not: '' } },
                        ],
                    },
                    {
                        items: {
                            some: {
                                AND: [
                                    { numeroAutorizacion: { not: null } },
                                    { numeroAutorizacion: { not: '' } },
                                ],
                            },
                        },
                    },
                ],
            },
        }
    } else {
        whereIngreso.medicaciones = {
            some: {
                estado: { not: 'S' },
                fechaInicio: { gte: desde, lt: hasta },
            },
        }
    }

    const ingresos = await prisma.ingreso.findMany({
        where: whereIngreso,
        select: {
            id: true,
            ordenes: data.tipo === 'PRACTICAS'
                ? {
                    where: { estado: { not: 'X' }, fechaEmision: { gte: desde, lt: hasta } },
                    select: {
                        numeroAutorizacion: true,
                        items: {
                            select: { importeTotal: true, numeroAutorizacion: true },
                        },
                    },
                }
                : false,
            medicaciones: data.tipo === 'MEDICAMENTOS'
                ? {
                    where: { estado: { not: 'S' }, fechaInicio: { gte: desde, lt: hasta } },
                    select: { nombre: true },
                }
                : false,
        },
    })

    // Compute importe per ingreso
    const itemsData = ingresos.map((ing) => {
        let importe = 0
        if (data.tipo === 'PRACTICAS' && ing.ordenes) {
            const ordenes = ing.ordenes as unknown as Array<{
                numeroAutorizacion: string | null
                items: Array<{ importeTotal: unknown; numeroAutorizacion: string | null }>
            }>

            const itemsAutorizados = ordenes.flatMap((o) => {
                const ordenConAutorizacion = tieneNumeroAutorizacionValido(o.numeroAutorizacion)
                return o.items.filter((it) =>
                    ordenConAutorizacion || tieneNumeroAutorizacionValido(it.numeroAutorizacion)
                )
            })

            importe += itemsAutorizados
                .reduce((s: number, i) => s + Number(i.importeTotal ?? 0), 0)
        }
        if (data.tipo === 'MEDICAMENTOS' && ing.medicaciones) {
            importe += (ing.medicaciones as Array<{ nombre: string }>).reduce(
                (s, m) => s + precioFicticioMedicacion(m.nombre),
                0
            )
        }
        return { ingresoId: ing.id, importeTotal: importe, incluido: true }
    })

    const totalLote = itemsData.reduce((s, it) => s + it.importeTotal, 0)

    const lote = await prisma.loteFacturacion.create({
        data: {
            numero,
            fecha: data.fecha,
            periodo: data.periodo,
            tipo: data.tipo,
            obraSocialId: data.obraSocialId ?? null,
            planId: data.planId ?? null,
            tipoIngresoCodigo: data.tipoIngresoCodigo ?? null,
            rangoDesde: data.rangoDesde ?? null,
            rangoHasta: data.rangoHasta ?? null,
            sedeId: data.sedeId ?? null,
            descripcion: data.descripcion ?? null,
            concepto: data.concepto ?? null,
            importeTotal: totalLote,
            estado: 'PEN',
            fechaEstado: now,
            usuario: usuarioCod,
            items: { create: itemsData },
        },
        select: { id: true, numero: true },
    })

    return lote
}

export async function actualizarLote(
    id: number,
    data: ActualizarLoteFacturacionInput,
    usuario: string
): Promise<void> {
    const usuarioCod = usuario.trim().slice(0, 10) || 'SISTEMA'
    const result = await prisma.loteFacturacion.updateMany({
        where: { id, estado: 'PEN' },
        data: {
            fecha: data.fecha,
            periodo: data.periodo,
            tipoIngresoCodigo: data.tipoIngresoCodigo,
            descripcion: data.descripcion,
            concepto: data.concepto,
            sedeId: data.sedeId,
            rangoDesde: data.rangoDesde,
            rangoHasta: data.rangoHasta,
            fechaEstado: new Date(),
            usuario: usuarioCod,
        },
    })

    if (result.count === 0) {
        throw new Error('Solo se puede editar un lote pendiente')
    }
}

export async function cambiarEstadoLote(
    id: number,
    estado: 'CON' | 'ANU',
    usuario: string
): Promise<void> {
    const usuarioCod = usuario.trim().slice(0, 10) || 'SISTEMA'
    await prisma.loteFacturacion.update({
        where: { id },
        data: { estado, fechaEstado: new Date(), usuario: usuarioCod },
    })
}

export async function toggleItemLote(
    loteId: number,
    itemId: number,
    incluido: boolean
): Promise<void> {
    // Only allow toggle when lote is PEN
    const lote = await prisma.loteFacturacion.findUnique({ where: { id: loteId }, select: { estado: true } })
    if (!lote || lote.estado !== 'PEN') throw new Error('Solo se puede editar un lote pendiente')

    const updated = await prisma.loteFacturacionItem.updateMany({
        where: { id: itemId, loteId },
        data: { incluido },
    })

    if (updated.count === 0) throw new Error('Item de lote no encontrado')

    // Recompute importeTotal of the lote
    const items = await prisma.loteFacturacionItem.findMany({
        where: { loteId, incluido: true },
        select: { importeTotal: true },
    })
    const total = items.reduce((s, it) => s + Number(it.importeTotal), 0)
    await prisma.loteFacturacion.update({ where: { id: loteId }, data: { importeTotal: total } })
}

export async function obtenerOrdenesAutorizadasIngreso(
    ingresoId: number,
    filtros?: { medico?: string; matricula?: number; periodo?: string }
): Promise<OrdenAutorizadaLote[]> {
    const especialistaWhere = buildEspecialistaOrdenWhere({
        medico: filtros?.medico,
        matricula: filtros?.matricula,
    })

    const periodoWhere: Prisma.OrdenWhereInput = filtros?.periodo
        ? (() => {
            const { desde, hasta } = periodoToDateRange(filtros.periodo)
            return { fechaEmision: { gte: desde, lt: hasta } }
        })()
        : {}

    const ordenes = await prisma.orden.findMany({
        where: {
            ingresoId,
            estado: { not: 'X' },
            AND: [
                buildOrdenAutorizadaWhere(),
                especialistaWhere,
                periodoWhere,
            ],
        },
        orderBy: { fechaEmision: 'asc' },
        select: {
            puestoNumero: true,
            numero: true,
            fechaEmision: true,
            descripcion: true,
            numeroAutorizacion: true,
            importeTotal: true,
            items: {
                select: {
                    item: true,
                    codigoPractica: true,
                    cantidad: true,
                    numeroAutorizacion: true,
                    importeTotal: true,
                    nomencladorPractica: { select: { descripcion: true } },
                },
            },
        },
    })

    return ordenes.map((o) => ({
        puestoNumero: o.puestoNumero,
        numero: o.numero,
        fechaEmision: o.fechaEmision,
        descripcion: o.descripcion,
        numeroAutorizacion: o.numeroAutorizacion,
        importeTotal: Number(o.importeTotal ?? 0),
        items: o.items
            .filter(
                (it) =>
                    tieneNumeroAutorizacionValido(
                        resolverNumeroAutorizacion(it.numeroAutorizacion, o.numeroAutorizacion)
                    )
            )
            .map((it) => ({
                item: it.item,
                codigoPractica: it.codigoPractica,
                descripcion: it.nomencladorPractica?.descripcion ?? null,
                cantidad: Number(it.cantidad),
                numeroAutorizacion: resolverNumeroAutorizacion(it.numeroAutorizacion, o.numeroAutorizacion),
                importeTotal: Number(it.importeTotal ?? 0),
            })),
    }))
}

// ============================================
// IPS TXT — PLANILLA DE PRESTACIONES
// ============================================

function redondear2Repo(valor: number): number {
    return Math.round((valor + Number.EPSILON) * 100) / 100
}

export async function crearLoteIPSTxt(
    data: CrearLoteIPSTxtInput,
    usuario: string
): Promise<{ id: number; numero: number }> {
    const now = new Date()
    const usuarioCod = usuario.trim().slice(0, 10) || 'SISTEMA'

    const ultimo = await prisma.loteFacturacion.findFirst({
        orderBy: { numero: 'desc' },
        select: { numero: true },
    })
    const numero = (ultimo?.numero ?? 0) + 1

    const totalBruto = data.items.reduce((s, it) => s + it.impTotal, 0)

    const lote = await prisma.loteFacturacion.create({
        data: {
            numero,
            fecha: data.fecha,
            periodo: data.periodo,
            tipo: 'PRACTICAS',
            origen: 'IPS_TXT',
            obraSocialId: data.obraSocialId,
            planId: data.planId ?? null,
            descripcion: data.descripcion ?? `Planilla IPS - ${data.periodo}`,
            concepto: 'PROMEDI IPS',
            importeTotal: totalBruto,
            estado: 'PEN',
            fechaEstado: now,
            usuario: usuarioCod,
            itemsIPSTxt: {
                create: data.items.map((it) => ({
                    afiliadoDoc: it.afiliadoDoc,
                    afiliadoNom: it.afiliadoNom,
                    nroOrden: it.nroOrden,
                    fechaRealiz: it.fechaRealiz ? new Date(it.fechaRealiz) : null,
                    servicioCodigo: it.servicioCodigo,
                    servicioNombre: it.servicioNombre,
                    cantidad: it.cantidad,
                    impEsp: it.impEsp,
                    impAyu: it.impAyu,
                    impAne: it.impAne,
                    impGto: it.impGto,
                    impTotal: it.impTotal,
                })),
            },
        },
        select: { id: true, numero: true },
    })

    return lote
}

const CODIGOS_PROMEDI_BASE = new Set([430101, 431001, 400101, 431002, 431103, 430130])
const CODIGOS_EXCLUIDOS_PROMEDI_OSECAC = new Set([70116, 70607])

function parseCodigoPromedi(codigo: string | null | undefined): number | null {
    const parsed = parseInt((codigo ?? '').trim(), 10)
    if (isNaN(parsed)) return null
    return parsed
}

function codigoEnRangoBasePromedi(codigo: number): boolean {
    if (codigo >= 10101 && codigo <= 130304) return true
    if (codigo >= 720201 && codigo <= 722238) return true
    return false
}

function aplicaPromediIPS(codigoPractica: string | null | undefined): boolean {
    const codigo = parseCodigoPromedi(codigoPractica)
    if (codigo === null) return false
    return CODIGOS_PROMEDI_BASE.has(codigo) || codigoEnRangoBasePromedi(codigo)
}

function aplicaPromediOsecac(codigoPractica: string | null | undefined): boolean {
    const codigo = parseCodigoPromedi(codigoPractica)
    if (codigo === null) return false
    if (CODIGOS_EXCLUIDOS_PROMEDI_OSECAC.has(codigo)) return false
    return CODIGOS_PROMEDI_BASE.has(codigo) || codigoEnRangoBasePromedi(codigo)
}

export async function aplicarPromediLote(
    loteId: number,
    usuario: string
): Promise<{ importeTotal: number; cantidadItems: number }> {
    const lote = await prisma.loteFacturacion.findUnique({
        where: { id: loteId },
        select: {
            id: true,
            estado: true,
            origen: true,
            tipo: true,
            periodo: true,
            obraSocial: { select: { nombre: true } },
        },
    })

    if (!lote) throw new Error('Lote no encontrado')
    if (lote.estado !== 'PEN') throw new Error('Solo se puede aplicar PROMEDI a un lote pendiente')

    const usuarioCod = usuario.trim().slice(0, 10) || 'SISTEMA'

    if (lote.origen === 'IPS_TXT') {
        const items = await prisma.loteIPSTxtItem.findMany({
            where: { loteId },
            select: { id: true, impTotal: true, servicioCodigo: true },
        })

        const PORCENTAJE_PROMEDI_IPS = 0.40

        await prisma.$transaction(
            items.map((item) => {
                const importePromedi = aplicaPromediIPS(item.servicioCodigo)
                    ? redondear2Repo(Number(item.impTotal) * PORCENTAJE_PROMEDI_IPS)
                    : redondear2Repo(Number(item.impTotal))
                return prisma.loteIPSTxtItem.update({
                    where: { id: item.id },
                    data: { importePromedi },
                })
            })
        )

        const totalPromedi = redondear2Repo(
            items.reduce((s, it) => {
                const importe = aplicaPromediIPS(it.servicioCodigo)
                    ? redondear2Repo(Number(it.impTotal) * PORCENTAJE_PROMEDI_IPS)
                    : redondear2Repo(Number(it.impTotal))
                return s + importe
            }, 0)
        )

        await prisma.loteFacturacion.update({
            where: { id: loteId },
            data: {
                importeTotal: totalPromedi,
                estado: 'CON',
                fechaEstado: new Date(),
                usuario: usuarioCod,
            },
        })

        return { importeTotal: totalPromedi, cantidadItems: items.length }
    }

    const esOsecac = esObraSocialOsecac(lote.obraSocial?.nombre)
    if (!esOsecac || lote.tipo !== 'PRACTICAS') {
        throw new Error('PROMEDI solo aplica a lotes IPS TXT o lotes de practicas OSECAC')
    }

    const { desde, hasta } = periodoToDateRange(lote.periodo)

    const loteItems = await prisma.loteFacturacionItem.findMany({
        where: { loteId },
        select: { id: true, ingresoId: true, incluido: true },
    })

    if (loteItems.length === 0) {
        await prisma.loteFacturacion.update({
            where: { id: loteId },
            data: { importeTotal: 0, estado: 'CON', fechaEstado: new Date(), usuario: usuarioCod },
        })
        return { importeTotal: 0, cantidadItems: 0 }
    }

    const ingresoIds = Array.from(new Set(loteItems.map((it) => it.ingresoId)))
    const ordenes = await prisma.orden.findMany({
        where: {
            ingresoId: { in: ingresoIds },
            estado: { not: 'X' },
            fechaEmision: { gte: desde, lt: hasta },
            OR: [
                {
                    AND: [
                        { numeroAutorizacion: { not: null } },
                        { numeroAutorizacion: { not: '' } },
                    ],
                },
                {
                    items: {
                        some: {
                            AND: [
                                { numeroAutorizacion: { not: null } },
                                { numeroAutorizacion: { not: '' } },
                            ],
                        },
                    },
                },
            ],
        },
        select: {
            ingresoId: true,
            numeroAutorizacion: true,
            items: {
                select: {
                    codigoPractica: true,
                    importeTotal: true,
                    numeroAutorizacion: true,
                },
            },
        },
    })

    const importePorIngreso = new Map<number, number>()
    const PORCENTAJE_PROMEDI_OSECAC = 0.20

    for (const orden of ordenes) {
        const ordenConAutorizacion = tieneNumeroAutorizacionValido(orden.numeroAutorizacion)
        for (const item of orden.items) {
            if (!ordenConAutorizacion && !tieneNumeroAutorizacionValido(item.numeroAutorizacion)) continue
            if (!orden.ingresoId) continue

            const importeItem = Number(item.importeTotal ?? 0)
            const importeFacturable = aplicaPromediOsecac(item.codigoPractica)
                ? redondear2Repo(importeItem * PORCENTAJE_PROMEDI_OSECAC)
                : redondear2Repo(importeItem)

            const actual = importePorIngreso.get(orden.ingresoId) ?? 0
            importePorIngreso.set(orden.ingresoId, redondear2Repo(actual + importeFacturable))
        }
    }

    const updatesItems = loteItems.map((it) =>
        prisma.loteFacturacionItem.update({
            where: { id: it.id },
            data: { importeTotal: redondear2Repo(importePorIngreso.get(it.ingresoId) ?? 0) },
        })
    )

    const totalPromedi = redondear2Repo(
        loteItems.reduce((s, it) => {
            const importe = redondear2Repo(importePorIngreso.get(it.ingresoId) ?? 0)
            return it.incluido ? s + importe : s
        }, 0)
    )

    await prisma.$transaction([
        ...updatesItems,
        prisma.loteFacturacion.update({
            where: { id: loteId },
            data: {
                importeTotal: totalPromedi,
                estado: 'CON',
                fechaEstado: new Date(),
                usuario: usuarioCod,
            },
        }),
    ])

    return { importeTotal: totalPromedi, cantidadItems: loteItems.length }
}

export async function obtenerItemsIPSTxt(loteId: number): Promise<LoteIPSTxtItemDetalle[]> {
    const items = await prisma.loteIPSTxtItem.findMany({
        where: { loteId },
        orderBy: [{ afiliadoNom: 'asc' }, { id: 'asc' }],
    })

    return items.map((it) => ({
        id: it.id,
        loteId: it.loteId,
        afiliadoDoc: it.afiliadoDoc,
        afiliadoNom: it.afiliadoNom,
        nroOrden: it.nroOrden,
        fechaRealiz: it.fechaRealiz,
        servicioCodigo: it.servicioCodigo,
        servicioNombre: it.servicioNombre,
        cantidad: it.cantidad,
        impEsp: Number(it.impEsp),
        impAyu: Number(it.impAyu),
        impAne: Number(it.impAne),
        impGto: Number(it.impGto),
        impTotal: Number(it.impTotal),
        importePromedi: it.importePromedi !== null ? Number(it.importePromedi) : null,
    }))
}
