import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
    categoriaPractica,
    type CategoriaPractica,
} from '@/modules/facturacion/categorias-practica'
import { esMatriculaClinica } from '@/modules/facturacion/promedi-rules'
import { resolverImportesLiquidacion } from './subitem'
import type { BusquedaLiquidacionInput } from './schemas'
import {
    esSubitemLiquidable,
    type EstadoLoteLiquidacion,
    type LiquidacionDescartes,
    type LiquidacionLinea,
    type LiquidacionProfesional,
    type LiquidacionResumen,
    type ProfesionalEfectorItem,
} from './types'

// Matriculas con las que la clinica se factura a si misma. Ver MATRICULAS_CLINICA en
// promedi-rules: son las mismas que imprime la columna "Mat." del sistema anterior.
const NOMBRE_POR_MATRICULA_FIJA: Record<number, string> = {
    9995: 'CLINICA SAN RAFAEL',
    9110: 'SAN RAFAEL S.A. MP CMS',
    6: 'ASOSIACION ANESTESISTA',
    995: 'PROFESIONAL AYUDANTE',
    2675: 'ANA MARIA VEGA',
}

type ClaveOrden = string

function claveOrden(puestoNumero: number, ordenNumero: number): ClaveOrden {
    return `${puestoNumero}:${ordenNumero}`
}

function tieneNumeroAutorizacionValido(valor: string | null | undefined): boolean {
    return typeof valor === 'string' && valor.trim().length > 0
}

function resolverNumeroAutorizacion(
    numeroItem: string | null | undefined,
    numeroOrden: string | null | undefined
): string | null {
    if (tieneNumeroAutorizacionValido(numeroItem)) return numeroItem!.trim()
    if (tieneNumeroAutorizacionValido(numeroOrden)) return numeroOrden!.trim()
    return null
}

function aNumero(valor: Prisma.Decimal | number | null | undefined): number {
    if (valor === null || valor === undefined) return 0
    const n = Number(valor)
    return Number.isFinite(n) ? n : 0
}

function aNumeroONull(valor: Prisma.Decimal | number | null | undefined): number | null {
    if (valor === null || valor === undefined) return null
    const n = Number(valor)
    return Number.isFinite(n) ? n : null
}

function redondear2(valor: number): number {
    return Math.round((valor + Number.EPSILON) * 100) / 100
}

/** Limite [desde, hasta) en UTC, con `hasta` inclusivo del lado del usuario. */
function rangoFechas(desde: string, hasta: string): { desde: Date; hasta: Date } {
    const inicio = new Date(`${desde}T00:00:00.000Z`)
    const finExclusivo = new Date(`${hasta}T00:00:00.000Z`)
    finExclusivo.setUTCDate(finExclusivo.getUTCDate() + 1)
    return { desde: inicio, hasta: finExclusivo }
}

function descartesVacios(): LiquidacionDescartes {
    return {
        gastosDeLaClinica: { lineas: 0, importe: 0 },
        sinEfector: { lineas: 0, importe: 0 },
        anestesia: { lineas: 0, importe: 0 },
        patologia: { lineas: 0, importe: 0 },
        fueraDeCategoria: { lineas: 0, importe: 0 },
    }
}

function sumarDescarte(
    descartes: LiquidacionDescartes,
    clave: keyof LiquidacionDescartes,
    importe: number
): void {
    descartes[clave].lineas += 1
    descartes[clave].importe = redondear2(descartes[clave].importe + importe)
}

function resumenVacio(
    params: BusquedaLiquidacionInput,
    obraSocial: { id: number; nombre: string } | null
): LiquidacionResumen {
    return {
        profesionales: [],
        totalHonorarios: 0,
        totalGastos: 0,
        total: 0,
        cantidadPracticas: 0,
        esProvisorio: false,
        totalPendiente: 0,
        practicasPendientes: 0,
        descartes: descartesVacios(),
        conteoCategorias: {},
        filtros: {
            desde: params.desde,
            hasta: params.hasta,
            obraSocial,
            categorias: params.categorias ?? [],
            matricula: params.matricula ?? null,
            estadosLote: params.estadosLote,
            tipoIngreso: params.tipoIngreso ?? null,
        },
        lotesConsiderados: [],
    }
}

/**
 * Arma la liquidacion de honorarios por profesional efector.
 *
 * Fuente: practicas que ya entraron a un lote de tipo PRACTICAS en estado PEN o CON.
 * Una orden cuenta una sola vez aunque su ingreso aparezca en varios lotes (un mismo
 * ingreso se reparte entre lotes segun la categoria de sus practicas), y no cuenta si
 * el unico lote que la tomaria la tiene excluida.
 *
 * Atribucion: cada fila de OrdenPractica va al efector de esa fila
 * (`efectorMatricula`), no al prescriptor de la orden. Las filas cuyo efector es la
 * propia clinica quedan afuera — no hay profesional a quien liquidarlas.
 */
export async function obtenerLiquidacionProfesionales(
    params: BusquedaLiquidacionInput
): Promise<LiquidacionResumen> {
    const { desde, hasta } = rangoFechas(params.desde, params.hasta)
    const categoriasFiltro = new Set(params.categorias ?? [])

    const obraSocial = params.obraSocialId
        ? await prisma.obraSocial.findUnique({
            where: { id: params.obraSocialId },
            select: { id: true, nombre: true },
        })
        : null

    const lotes = await prisma.loteFacturacion.findMany({
        where: {
            tipo: 'PRACTICAS',
            estado: { in: params.estadosLote },
            ...(params.obraSocialId ? { obraSocialId: params.obraSocialId } : {}),
        },
        orderBy: [{ numero: 'asc' }],
        select: {
            id: true,
            numero: true,
            estado: true,
            periodo: true,
            items: {
                where: { incluido: true },
                select: { ingresoId: true },
            },
            ordenesExcluidas: {
                select: { puestoNumero: true, ordenNumero: true },
            },
        },
    })

    if (lotes.length === 0) return resumenVacio(params, obraSocial)

    // Por ingreso, los lotes que lo incluyen. Una orden se atribuye al primer lote que
    // la tome (no la tenga excluida); si todos la excluyen, la orden no se liquida.
    const lotesPorIngreso = new Map<number, typeof lotes>()
    for (const lote of lotes) {
        for (const item of lote.items) {
            const existentes = lotesPorIngreso.get(item.ingresoId) ?? []
            existentes.push(lote)
            lotesPorIngreso.set(item.ingresoId, existentes)
        }
    }

    const excluidasPorLote = new Map<number, Set<ClaveOrden>>(
        lotes.map((lote) => [
            lote.id,
            new Set(lote.ordenesExcluidas.map((o) => claveOrden(o.puestoNumero, o.ordenNumero))),
        ])
    )

    const ingresoIds = Array.from(lotesPorIngreso.keys())
    if (ingresoIds.length === 0) return resumenVacio(params, obraSocial)

    const ordenes = await prisma.orden.findMany({
        where: {
            ingresoId: { in: ingresoIds },
            // Anuladas fuera: el estado arranca con 'X'.
            NOT: [{ estado: { contains: 'X', mode: 'insensitive' } }],
            items: { some: { fecha: { gte: desde, lt: hasta } } },
            // Char(3) sin padding: 'INT' y 'AMB' entran justos, no hace falta trim.
            ...(params.tipoIngreso ? { ingreso: { tipoIngresoCodigo: params.tipoIngreso } } : {}),
        },
        select: {
            puestoNumero: true,
            numero: true,
            ingresoId: true,
            numeroAutorizacion: true,
            ingreso: {
                select: {
                    id: true,
                    tipoIngresoCodigo: true,
                    numeroIngreso: true,
                    numeroAfiliado: true,
                    paciente: { select: { nombreCompleto: true } },
                },
            },
            profesional: { select: { nombre: true } },
            items: {
                select: {
                    item: true,
                    codigoPractica: true,
                    modulo: true,
                    efectorMatricula: true,
                    cantidad: true,
                    fecha: true,
                    numeroAutorizacion: true,
                    importeTotal: true,
                    // Necesarios para no confundir anestesia y patologia con HE:
                    // ver resolverSubitemLiquidacion.
                    titularModular: true,
                    clasificacionAgrupacion: true,
                    // Seguro desde OrdenPractica: la FK compuesta solo rompe el query
                    // engine cuando se carga desde Practica (ver CLAUDE.md, trampa 1).
                    nomencladorPractica: {
                        select: {
                            descripcion: true,
                            valorEspecialista: true,
                            valorAyudante: true,
                            valorAnestesista: true,
                            valorGastos: true,
                        },
                    },
                },
            },
        },
    })

    const descartes = descartesVacios()
    const conteoCategorias: Partial<Record<CategoriaPractica, number>> = {}
    const lineasPorMatricula = new Map<number, LiquidacionLinea[]>()
    const lotesUsados = new Map<number, { id: number; numero: number; estado: EstadoLoteLiquidacion; periodo: string | null }>()

    for (const orden of ordenes) {
        const ingreso = orden.ingreso
        if (!ingreso) continue

        const clave = claveOrden(orden.puestoNumero, orden.numero)
        const loteQueLaToma = (lotesPorIngreso.get(ingreso.id) ?? []).find(
            (lote) => !excluidasPorLote.get(lote.id)?.has(clave)
        )
        // Excluida de todos los lotes que contienen el ingreso: no se facturo, no se liquida.
        if (!loteQueLaToma) continue

        const loteEstado = loteQueLaToma.estado as EstadoLoteLiquidacion
        lotesUsados.set(loteQueLaToma.id, {
            id: loteQueLaToma.id,
            numero: loteQueLaToma.numero,
            estado: loteEstado,
            periodo: loteQueLaToma.periodo,
        })

        for (const it of orden.items) {
            if (it.fecha < desde || it.fecha >= hasta) continue

            const importe = aNumero(it.importeTotal)
            // Char(8): "720329" y "720329  " conviven para el mismo codigo (CLAUDE.md, trampa 2).
            const codigo = it.codigoPractica.trim()
            const categoria = categoriaPractica(codigo)

            const { subitem, importeHonorarios, importeGastos } = resolverImportesLiquidacion({
                codigoPractica: codigo,
                modulo: it.modulo,
                titularModular: it.titularModular,
                clasificacionAgrupacion: it.clasificacionAgrupacion,
                efectorMatricula: it.efectorMatricula,
                profesional: orden.profesional?.nombre ?? null,
                importeTotal: importe,
                cantidad: aNumero(it.cantidad),
                valoresNomenclador: it.nomencladorPractica
                    ? {
                        valorEspecialista: aNumeroONull(it.nomencladorPractica.valorEspecialista),
                        valorAyudante: aNumeroONull(it.nomencladorPractica.valorAyudante),
                        valorAnestesista: aNumeroONull(it.nomencladorPractica.valorAnestesista),
                        valorGastos: aNumeroONull(it.nomencladorPractica.valorGastos),
                    }
                    : null,
            })

            if (!esSubitemLiquidable(subitem)) {
                sumarDescarte(descartes, subitem === 'HP' ? 'patologia' : 'anestesia', importe)
                continue
            }

            if (it.efectorMatricula == null) {
                sumarDescarte(descartes, 'sinEfector', importe)
                continue
            }

            // La clinica se factura a si misma los gastos y algunas guardias. Eso no es
            // honorario de nadie, asi que no entra a la liquidacion de profesionales.
            if (esMatriculaClinica(it.efectorMatricula)) {
                sumarDescarte(descartes, 'gastosDeLaClinica', importe)
                continue
            }

            if (params.matricula && it.efectorMatricula !== params.matricula) continue

            // El conteo por categoria se arma antes del filtro: los chips tienen que
            // mostrar cuanto hay de cada cosa, no cuanto quedo despues de filtrar.
            if (categoria) {
                conteoCategorias[categoria] = (conteoCategorias[categoria] ?? 0) + 1
            }

            if (categoriasFiltro.size > 0 && (!categoria || !categoriasFiltro.has(categoria))) {
                sumarDescarte(descartes, 'fueraDeCategoria', importe)
                continue
            }

            const linea: LiquidacionLinea = {
                ingresoId: ingreso.id,
                tipoIngresoCodigo: ingreso.tipoIngresoCodigo,
                numeroIngreso: ingreso.numeroIngreso,
                paciente: ingreso.paciente?.nombreCompleto ?? 'Sin paciente',
                numeroAfiliado: ingreso.numeroAfiliado,
                numeroAutorizacion: resolverNumeroAutorizacion(
                    it.numeroAutorizacion,
                    orden.numeroAutorizacion
                ),
                fecha: it.fecha,
                codigoPractica: codigo,
                descripcionPractica: it.nomencladorPractica?.descripcion?.trim() ?? null,
                categoria,
                subitem,
                cantidad: aNumero(it.cantidad),
                importeHonorarios,
                importeGastos,
                importeTotal: importe,
                ordenPuestoNumero: orden.puestoNumero,
                ordenNumero: orden.numero,
                ordenItem: it.item,
                loteId: loteQueLaToma.id,
                loteNumero: loteQueLaToma.numero,
                loteEstado,
                lotePeriodo: loteQueLaToma.periodo,
            }

            const existentes = lineasPorMatricula.get(it.efectorMatricula) ?? []
            existentes.push(linea)
            lineasPorMatricula.set(it.efectorMatricula, existentes)
        }
    }

    const matriculas = Array.from(lineasPorMatricula.keys())
    const nombrePorMatricula = await resolverNombresPorMatricula(matriculas)

    const profesionales: LiquidacionProfesional[] = matriculas.map((matricula) => {
        const lineas = (lineasPorMatricula.get(matricula) ?? []).sort(compararLineas)
        const totalHonorarios = redondear2(lineas.reduce((acc, l) => acc + l.importeHonorarios, 0))
        const totalGastos = redondear2(lineas.reduce((acc, l) => acc + l.importeGastos, 0))
        const resuelto = nombrePorMatricula.get(matricula)

        return {
            matricula,
            nombre: resuelto?.nombre ?? NOMBRE_POR_MATRICULA_FIJA[matricula] ?? `PROFESIONAL MAT ${matricula}`,
            profesionalId: resuelto?.id ?? null,
            lineas,
            totalHonorarios,
            totalGastos,
            total: redondear2(totalHonorarios + totalGastos),
        }
    })

    profesionales.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

    const totalHonorarios = redondear2(profesionales.reduce((acc, p) => acc + p.totalHonorarios, 0))
    const totalGastos = redondear2(profesionales.reduce((acc, p) => acc + p.totalGastos, 0))

    const lineasPendientes = profesionales.flatMap((p) => p.lineas.filter((l) => l.loteEstado === 'PEN'))
    const totalPendiente = redondear2(lineasPendientes.reduce((acc, l) => acc + l.importeTotal, 0))

    return {
        profesionales,
        totalHonorarios,
        totalGastos,
        total: redondear2(totalHonorarios + totalGastos),
        cantidadPracticas: profesionales.reduce((acc, p) => acc + p.lineas.length, 0),
        esProvisorio: lineasPendientes.length > 0,
        totalPendiente,
        practicasPendientes: lineasPendientes.length,
        descartes,
        conteoCategorias,
        filtros: {
            desde: params.desde,
            hasta: params.hasta,
            obraSocial,
            categorias: params.categorias ?? [],
            matricula: params.matricula ?? null,
            estadosLote: params.estadosLote,
            tipoIngreso: params.tipoIngreso ?? null,
        },
        lotesConsiderados: Array.from(lotesUsados.values()).sort((a, b) => a.numero - b.numero),
    }
}

function compararLineas(a: LiquidacionLinea, b: LiquidacionLinea): number {
    const porPaciente = a.paciente.localeCompare(b.paciente, 'es')
    if (porPaciente !== 0) return porPaciente
    const porFecha = a.fecha.getTime() - b.fecha.getTime()
    if (porFecha !== 0) return porFecha
    if (a.ordenNumero !== b.ordenNumero) return a.ordenNumero - b.ordenNumero
    return a.ordenItem - b.ordenItem
}

/**
 * Profesional.matricula no tiene indice unico, asi que la consulta puede traer varias
 * filas para la misma matricula. Se toma la de menor id y se ignoran las demas.
 */
async function resolverNombresPorMatricula(
    matriculas: number[]
): Promise<Map<number, { id: number; nombre: string }>> {
    const resultado = new Map<number, { id: number; nombre: string }>()
    if (matriculas.length === 0) return resultado

    const profesionales = await prisma.profesional.findMany({
        where: { matricula: { in: matriculas } },
        orderBy: { id: 'asc' },
        select: { id: true, nombre: true, matricula: true },
    })

    for (const p of profesionales) {
        if (p.matricula == null || resultado.has(p.matricula)) continue
        resultado.set(p.matricula, { id: p.id, nombre: p.nombre.trim() })
    }

    return resultado
}

/** Profesionales que aparecen como efectores, para poblar el selector del filtro. */
export async function listarProfesionalesEfectores(): Promise<ProfesionalEfectorItem[]> {
    const matriculasEfectoras = await prisma.ordenPractica.groupBy({
        by: ['efectorMatricula'],
        where: { efectorMatricula: { not: null } },
    })

    const matriculas = matriculasEfectoras
        .map((m) => m.efectorMatricula)
        .filter((m): m is number => m != null && !esMatriculaClinica(m))

    if (matriculas.length === 0) return []

    const nombres = await resolverNombresPorMatricula(matriculas)

    return matriculas
        .map((matricula) => ({
            matricula,
            nombre: nombres.get(matricula)?.nombre
                ?? NOMBRE_POR_MATRICULA_FIJA[matricula]
                ?? `PROFESIONAL MAT ${matricula}`,
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/** Obras sociales con lotes de practicas, que son las unicas que pueden dar resultado. */
export async function listarObrasSocialesConLotes(): Promise<Array<{ id: number; nombre: string }>> {
    const lotes = await prisma.loteFacturacion.findMany({
        where: { tipo: 'PRACTICAS', estado: { in: ['PEN', 'CON'] }, obraSocialId: { not: null } },
        distinct: ['obraSocialId'],
        select: { obraSocial: { select: { id: true, nombre: true } } },
    })

    return lotes
        .map((l) => l.obraSocial)
        .filter((os): os is { id: number; nombre: string } => os != null)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}
