import { prisma } from '@/lib/db'
import { claveNomenclador, obtenerDescripcionesNomenclador } from '@/lib/nomenclador'
import { Prisma } from '@prisma/client'
import type {
    ActualizarAutorizacionInput,
    ActualizarContextoFacturacionInput,
    ActualizarDiferencialesCirugiaFacturacionInput,
    ActualizarLoteFacturacionInput,
    ActualizarPrestacionFacturacionInput,
    BusquedaFacturacionInput,
    BusquedaLotesInput,
    CargarOrdenesFacturacionInput,
    CrearOrdenDesdePracticaFacturacionInput,
    CrearLoteFacturacionInput,
    CrearLoteIPSTxtInput,
    CrearDescartableFacturacionInput,
    CrearMedicacionFacturacionInput,
    CrearMedicamentoCatalogoInput,
    CrearPracticaFacturacionInput,
    EliminarPrestacionFacturacionInput,
    RenumerarOrdenFacturacionInput,
} from './schemas'
import type {
    AdmisionFacturacionListItem,
    EstadoLote,
    FacturacionContexto,
    LoteFacturacionDetalle,
    LoteFacturacionItemDetalle,
    MedicacionLoteDetalle,
    LoteFacturacionListItem,
    LotePracticaFacturadaProfesionalItem,
    LoteIPSTxtItemDetalle,
    OrdenAutorizadaLote,
    OrdenFacturacionResultado,
    PrestacionFacturableItem,
} from './types'
import { categoriaPractica, type CategoriaPractica } from './categorias-practica'
import {
    claveOrdenLote,
    repartirOrdenesDeIngreso,
    type OrdenParaReparto,
} from './reparto-lotes'
import { calcularImporteFacturable, resolverReglaFacturacion } from './cobertura'
import {
    aplicarDiferencialesAValores,
    esCodigoAccesorioCirugia,
    tieneDiferencialesActivos,
} from './diferenciales'
import { puedeEditarPrestacionEnLote } from './editability'
import { crearOrdenAmbulatorio } from '@/modules/orden/service'
import { claveDiaArgentina } from '@/lib/utils/argentina-date'
import { obtenerTokensBusquedaFlexible } from '@/lib/utils/busqueda-flexible'
import { recalcularImportePorCambioCantidad } from '@/lib/facturacion/importes'
import {
    aplicaPromediPorObra,
    porcentajePromediPorObra,
    resolverReglaPromedi,
    resolverSubitemPromedi,
    subitemEntraEnPromedi,
    CODIGOS_PROMEDI_BASE,
} from './promedi-rules'
import { fusionarObservacionesConMeta } from '@/modules/internacion/observaciones-meta'
import { resolverObraSocialParticularId } from '@/lib/obra-social-particular'

const MATRICULA_AMBULATORIO_DEFAULT = 9110
const NOMBRE_MATRICULA_9110_DEFAULT = 'CLINICA SAN RAFAEL'
const MATRICULA_GASTOS_INTERNACION_DEFAULT = 9995
const NOMBRE_MATRICULA_9995_DEFAULT = 'GASTOS INTERNACION'
const MATRICULA_ANESTESISTA_INT_DEFAULT = 6
const MATRICULA_AYUDANTE_INT_DEFAULT = 995
const MATRICULA_PATOLOGIA_DEFAULT = 2675
const NOMBRE_MATRICULA_2675_DEFAULT = 'ANA MARIA VEGA'
const NOMBRE_MATRICULA_6_DEFAULT = 'ASOSIACION ANESTESISTA'
const NOMBRE_MATRICULA_995_DEFAULT = 'PROFESIONAL AYUDANTE'
const CODIGOS_HA_OBLIGATORIO = new Set(['169006'])
const CODIGOS_HE_CON_OPCION_HA = new Set(['420303'])

function normalizarCodigoPractica(codigoPractica: string): string {
    return codigoPractica.trim().slice(0, 8).toUpperCase()
}

function resolverImporteTotalTrasEdicion(params: {
    cantidadAnterior: number
    importeAnterior: number
    cantidadNueva: number
    importeEnviado: number
}): number {
    const cambioCantidad = Math.abs(params.cantidadAnterior - params.cantidadNueva) > 0.0001
    const conservaImporteAnterior = Math.abs(params.importeAnterior - params.importeEnviado) < 0.005

    if (!cambioCantidad || !conservaImporteAnterior) {
        return params.importeEnviado
    }

    return recalcularImportePorCambioCantidad(
        params.cantidadAnterior,
        params.importeAnterior,
        params.cantidadNueva
    )
}

// Una practica de cirugia se ejecuta una vez pero se cobra repartida en varias
// ordenes (especialista, gastos, ayudante), cada una con su OrdenPrac. Ahi el
// importe de la practica no es el de ningun item suelto: es la suma de todos.
async function recalcularImportePracticaDesdeItems(
    tx: Prisma.TransactionClient,
    practicaId: number
): Promise<void> {
    const items = await tx.ordenPractica.findMany({
        where: { practicaId },
        select: { importeTotal: true },
    })
    if (items.length === 0) return

    const total = items.reduce((sum, it) => sum + Number(it.importeTotal ?? 0), 0)
    await tx.practica.update({
        where: { id: practicaId },
        data: { importeTotal: Number(total.toFixed(2)) },
    })
}

function normalizarTextoComparacion(value: string | null | undefined): string {
    return (value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
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
    const codigoNormalizado = normalizarCodigoPractica(codigoPractica)
    return codigoNormalizado.startsWith('16') || CODIGOS_HA_OBLIGATORIO.has(codigoNormalizado)
}

function esCodigoPatologiaPorDefecto(codigoPractica: string | null | undefined): boolean {
    if (!codigoPractica) return false
    return normalizarCodigoPractica(codigoPractica).startsWith('15')
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

type IncluyeCodigoSeleccion = {
    especialista: boolean
    patologia: boolean
    anestesista: boolean
    gastos: boolean
    ayudantes: number
}

function incluyeTieneEspecialista(seleccion: IncluyeCodigoSeleccion | null | undefined): boolean {
    if (!seleccion) return false
    return seleccion.especialista || seleccion.patologia
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

function normalizarIncluyeCodigo(incluyeCodigo: string | null | undefined): string | null {
    const normalized = (incluyeCodigo ?? '').trim().toUpperCase()
    if (!normalized || normalized === 'COMPLETA') return null

    const parts = normalized
        .split('+')
        .map((part) => part.trim())
        .filter((part) => /^(GA|HE|HA|HP|A[1-3])$/.test(part))

    if (parts.length === 0) return null
    return Array.from(new Set(parts)).join('+')
}

function expandirModulosCompatibles(incluyeCodigo: string | null | undefined): string[] {
    const incluyeNormalizado = normalizarIncluyeCodigo(incluyeCodigo)
    if (!incluyeNormalizado) return []

    const tokens = incluyeNormalizado.split('+').filter(Boolean)
    const compatibles = new Set<string>([incluyeNormalizado, ...tokens])

    if (tokens.includes('HP')) compatibles.add('HE')
    if (tokens.includes('HE')) compatibles.add('HP')

    return Array.from(compatibles)
}

function combinarIncluyeCodigos(
    actual: string | null | undefined,
    siguiente: string | null | undefined
): string | null {
    const a = desglosarIncluyeCodigo(actual)
    const b = desglosarIncluyeCodigo(siguiente)
    if (!a && !b) return null

    const especialista = Boolean(a?.especialista || b?.especialista)
    const patologia = Boolean(a?.patologia || b?.patologia)
    const anestesista = Boolean(a?.anestesista || b?.anestesista)
    const gastos = Boolean(a?.gastos || b?.gastos)
    const ayudantes = Math.min(3, (a?.ayudantes ?? 0) + (b?.ayudantes ?? 0))

    const tokens: string[] = []
    if (gastos) tokens.push('GA')
    if (especialista) tokens.push('HE')
    if (patologia) tokens.push('HP')
    if (anestesista) tokens.push('HA')
    for (let i = 1; i <= ayudantes; i += 1) {
        tokens.push(`A${i}`)
    }

    return tokens.length > 0 ? tokens.join('+') : null
}

function combinarMatricula(
    actual: number | null | undefined,
    siguiente: number | null | undefined
): number | null {
    const a = actual ?? null
    const b = siguiente ?? null
    if (a == null) return b
    if (b == null) return a

    // Prefer real interviniente matriculas over known fallback defaults.
    const defaults = new Set([
        MATRICULA_AMBULATORIO_DEFAULT,
        MATRICULA_GASTOS_INTERNACION_DEFAULT,
        MATRICULA_AYUDANTE_INT_DEFAULT,
        MATRICULA_ANESTESISTA_INT_DEFAULT,
    ])
    if (defaults.has(a) && !defaults.has(b)) return b
    return a
}

function desglosarIncluyeCodigo(incluyeCodigo: string | null | undefined): IncluyeCodigoSeleccion | null {
    const normalized = normalizarIncluyeCodigo(incluyeCodigo)
    if (!normalized) return null

    const parts = normalized.split('+')
    return {
        especialista: parts.includes('HE'),
        patologia: parts.includes('HP'),
        anestesista: parts.includes('HA'),
        gastos: parts.includes('GA'),
        ayudantes: parts.filter((part) => /^A[1-3]$/.test(part)).length,
    }
}

/**
 * Componente que cobra un item de orden (GA/HE/HA/HP/A1..).
 *
 * `OprModulo` recien se escribe desde que una practica partida por subitem genera una
 * fila de Practica por componente. En las ordenes anteriores el componente esta solo en
 * `OprClasAgrup`, y mirando unicamente el modulo una cirugia repartida por rol pasaba por
 * practica entera: se mostraba con todos los subitems y al facturar el importe se
 * recalculaba sobre el nomenclador completo.
 *
 * Pero `OprClasAgrup` no siempre marca un reparto: en muchas ordenes es la etiqueta del
 * titular ("DERECHOS", "HONORARIO PATOLOGO") sobre una linea que igual cobra la practica
 * entera. Medido sobre las ordenes vivas sin modulo: 410 items valen exactamente su
 * componente (reparto real), 96 valen el total del nomenclador con etiqueta parcial, y
 * 133 no coinciden con ninguno de los dos. Tomar la etiqueta al pie de la letra en esos
 * 229 haria cobrar de menos, asi que el respaldo pide que el importe guardado confirme
 * el componente; si no lo confirma, la linea sigue siendo la practica completa.
 */
function incluyeCodigoDeItemOrden(it: {
    modulo: string | null
    clasificacionAgrupacion?: string | null
    importeTotal?: Prisma.Decimal | number | null
    cantidad?: Prisma.Decimal | number | null
    codigoPractica?: string
    nomencladorPractica?: {
        valorEspecialista: Prisma.Decimal | number | null
        valorAyudante: Prisma.Decimal | number | null
        valorAnestesista: Prisma.Decimal | number | null
        valorGastos: Prisma.Decimal | number | null
    } | null
}): string | null {
    const desdeModulo = normalizarIncluyeCodigo(it.modulo)
    if (desdeModulo) return desdeModulo

    const desdeClasificacion = normalizarIncluyeCodigo(it.clasificacionAgrupacion)
    if (!desdeClasificacion || !it.nomencladorPractica) return null

    const desglose: DesgloseValores = {
        valorEspecialista: decimalANumero(it.nomencladorPractica.valorEspecialista as Prisma.Decimal | null),
        valorAyudante: decimalANumero(it.nomencladorPractica.valorAyudante as Prisma.Decimal | null),
        valorAnestesista: decimalANumero(it.nomencladorPractica.valorAnestesista as Prisma.Decimal | null),
        valorGastos: decimalANumero(it.nomencladorPractica.valorGastos as Prisma.Decimal | null),
    }
    const valorComponente = calcularTotalUnitarioDesglose(desglose, desdeClasificacion)
    if (valorComponente <= 0) return null

    // El componente ya es toda la practica: el respaldo no cambia el importe, solo nombra
    // la linea.
    const valorCompleto = calcularTotalUnitarioDesglose(desglose, null)
    if (Math.abs(valorCompleto - valorComponente) < 0.05) return desdeClasificacion

    const importe = decimalANumero(it.importeTotal as Prisma.Decimal | null)
    const cantidad = decimalANumero(it.cantidad as Prisma.Decimal | null) ?? 1
    if (importe == null || cantidad <= 0) return null

    return Math.abs(importe / cantidad - valorComponente) < 0.05 ? desdeClasificacion : null
}

function esSeleccionSoloGastos(seleccion: IncluyeCodigoSeleccion | null | undefined): boolean {
    if (!seleccion) return false
    return seleccion.gastos && !incluyeTieneEspecialista(seleccion) && !seleccion.anestesista && seleccion.ayudantes === 0
}

function esTituloAnestesista(titularModular: string | null | undefined): boolean {
    return normalizarTextoComparacion(titularModular).includes('ANEST')
}

function decimalANumero(valor: Prisma.Decimal | null | undefined): number | null {
    if (valor == null) return null
    const numero = Number(valor)
    return Number.isFinite(numero) ? numero : null
}

function esTituloPatologia(titularModular: string | null | undefined): boolean {
    return normalizarTextoComparacion(titularModular).includes('PATOLOG')
}

function esIngresoInternacion(tipoIngresoCodigo: string | null | undefined): boolean {
    return (tipoIngresoCodigo ?? '').trim().toUpperCase() === 'INT'
}

function resolverMatriculaGastoPorTipoIngreso(tipoIngresoCodigo: string | null | undefined): number {
    if (esIngresoInternacion(tipoIngresoCodigo)) {
        return MATRICULA_GASTOS_INTERNACION_DEFAULT
    }
    return MATRICULA_AMBULATORIO_DEFAULT
}

function resolverMatriculaGastoEditable(
    tipoIngresoCodigo: string | null | undefined,
    ...candidatas: Array<number | null | undefined>
): number {
    for (const candidata of candidatas) {
        if (typeof candidata === 'number' && Number.isFinite(candidata) && candidata > 0) {
            return candidata
        }
    }
    return resolverMatriculaGastoPorTipoIngreso(tipoIngresoCodigo)
}

function resolverMatriculaEspecialistaPorPatologia(
    matriculaActual: number | null | undefined,
    incluye: IncluyeCodigoSeleccion | null | undefined,
    codigoPractica: string | null | undefined
): number | null {
    if (incluye?.patologia || esCodigoPatologiaPorDefecto(codigoPractica)) {
        return MATRICULA_PATOLOGIA_DEFAULT
    }
    const matricula = matriculaActual ?? null
    return matricula && matricula > 0 ? matricula : null
}

function requiereActualizarPatologiaOrden(params: {
    incluyeCodigo: string | null | undefined
    codigoPractica: string
}): boolean {
    const seleccion = desglosarIncluyeCodigo(params.incluyeCodigo)
    return Boolean(seleccion?.patologia || esCodigoPatologiaPorDefecto(params.codigoPractica))
}

function dataOrdenPracticaPatologia(): {
    clasificacionAgrupacion: string
    titularModular: string
    efectorMatricula: number
    modulo: string
} {
    return {
        clasificacionAgrupacion: 'HP',
        titularModular: 'HONORARIO PATOLOGO',
        efectorMatricula: MATRICULA_PATOLOGIA_DEFAULT,
        modulo: 'HP',
    }
}

function esDesgloseSoloGastos(desglose: {
    valorEspecialista: number | Prisma.Decimal | null | undefined
    valorAyudante: number | Prisma.Decimal | null | undefined
    valorAnestesista: number | Prisma.Decimal | null | undefined
    valorGastos: number | Prisma.Decimal | null | undefined
} | null | undefined): boolean {
    if (!desglose) return false
    const tieneEspecialista = desglose.valorEspecialista != null
    const tieneAyudante = desglose.valorAyudante != null
    const tieneAnestesista = desglose.valorAnestesista != null
    const tieneGastos = desglose.valorGastos != null
    return tieneGastos && !tieneEspecialista && !tieneAyudante && !tieneAnestesista
}

function resolverNombreEfectorFallback(params: {
    titularModular: string | null | undefined
    descripcionPatologia: string | null | undefined
    matricula: number
}): string {
    if (params.matricula === MATRICULA_AMBULATORIO_DEFAULT) return NOMBRE_MATRICULA_9110_DEFAULT
    if (params.matricula === MATRICULA_GASTOS_INTERNACION_DEFAULT) return NOMBRE_MATRICULA_9995_DEFAULT
    if (params.matricula === MATRICULA_PATOLOGIA_DEFAULT) return NOMBRE_MATRICULA_2675_DEFAULT
    if (esTituloAnestesista(params.titularModular)) return 'ASOSIACION ANESTESISTA'
    if (esTituloPatologia(params.titularModular) && (params.descripcionPatologia ?? '').trim().length > 0) {
        return (params.descripcionPatologia ?? '').trim()
    }
    return `PROFESIONAL MAT ${params.matricula}`
}

function resolverProfesionalLote(params: {
    tipoIngresoCodigo: string | null | undefined
    profesional: { id: number; nombre: string; matricula: number | null } | null
    efectorMatriculas: Array<number | null | undefined>
}): { id: number; nombre: string; matricula: number | null } | null {
    const esAmbulatorio = !esIngresoInternacion(params.tipoIngresoCodigo)
    const tieneMatricula9110 = params.efectorMatriculas.some(
        (matricula) => matricula === MATRICULA_AMBULATORIO_DEFAULT
    )

    if (esAmbulatorio && tieneMatricula9110) {
        return {
            id: params.profesional?.id ?? -MATRICULA_AMBULATORIO_DEFAULT,
            nombre: NOMBRE_MATRICULA_9110_DEFAULT,
            matricula: MATRICULA_AMBULATORIO_DEFAULT,
        }
    }

    return params.profesional
}

function aplicarIncluyeCodigoADesglose(
    desglose: DesgloseValores,
    incluyeCodigo: string | null | undefined,
    codigoPractica?: string | null
): DesgloseValores {
    const seleccion = desglosarIncluyeCodigo(incluyeCodigo)
    if (!seleccion) return desglose

    const valorEspecialistaCompatible =
        desglose.valorEspecialista ??
        ((esCodigoHaObligatorio(codigoPractica) || esCodigoHeConOpcionHa(codigoPractica))
            ? desglose.valorAnestesista
            : null)

    return {
        valorEspecialista: incluyeTieneEspecialista(seleccion) ? valorEspecialistaCompatible : null,
        valorAyudante: seleccion.ayudantes > 0 ? desglose.valorAyudante : null,
        valorAnestesista: seleccion.anestesista ? desglose.valorAnestesista : null,
        valorGastos: seleccion.gastos ? desglose.valorGastos : null,
    }
}

function calcularTotalUnitarioDesglose(
    desglose: DesgloseValores,
    incluyeCodigo: string | null | undefined
): number {
    const seleccion = desglosarIncluyeCodigo(incluyeCodigo)
    if (!seleccion) {
        return (
            (desglose.valorEspecialista ?? 0) +
            (desglose.valorAyudante ?? 0) +
            (desglose.valorAnestesista ?? 0) +
            (desglose.valorGastos ?? 0)
        )
    }

    return (
        (incluyeTieneEspecialista(seleccion) ? (desglose.valorEspecialista ?? 0) : 0) +
        (seleccion.ayudantes > 0 ? (desglose.valorAyudante ?? 0) * seleccion.ayudantes : 0) +
        (seleccion.anestesista ? (desglose.valorAnestesista ?? 0) : 0) +
        (seleccion.gastos ? (desglose.valorGastos ?? 0) : 0)
    )
}

function serializarIncluyeSeleccion(seleccion: IncluyeCodigoSeleccion): string | null {
    const tokens: string[] = []
    if (seleccion.gastos) tokens.push('GA')
    if (seleccion.especialista) tokens.push('HE')
    if (seleccion.patologia) tokens.push('HP')
    if (seleccion.anestesista) tokens.push('HA')
    for (let i = 1; i <= Math.min(3, seleccion.ayudantes); i += 1) {
        tokens.push(`A${i}`)
    }
    return tokens.length > 0 ? tokens.join('+') : null
}

function inferirIncluyeCodigoDesdeImporte(params: {
    desglose: DesgloseValores | null
    precioUnitarioDesdeDb: number | null
    matriculaEspecialista?: number | null
    matriculaAnestesista?: number | null
}): string | null {
    if (!params.desglose || params.precioUnitarioDesdeDb == null || params.precioUnitarioDesdeDb <= 0) {
        return null
    }

    const objetivo = Number(params.precioUnitarioDesdeDb.toFixed(2))
    const tol = 0.01
    const totalCompleta = Number(calcularTotalUnitarioDesglose(params.desglose, null).toFixed(2))

    // Si ya coincide con la práctica completa, no inferir subitem.
    if (Math.abs(totalCompleta - objetivo) <= tol) return null

    const posiblesEspecialista = params.desglose.valorEspecialista != null ? [false, true] : [false]
    const posiblesAnestesista = params.desglose.valorAnestesista != null ? [false, true] : [false]
    const posiblesGastos = params.desglose.valorGastos != null ? [false, true] : [false]
    const maxAyudantes = params.desglose.valorAyudante != null ? 3 : 0

    const candidatos: Array<{ incluye: string; especialista: boolean; anestesista: boolean }> = []

    for (const especialista of posiblesEspecialista) {
        for (const anestesista of posiblesAnestesista) {
            for (const gastos of posiblesGastos) {
                for (let ayudantes = 0; ayudantes <= maxAyudantes; ayudantes += 1) {
                    if (!especialista && !anestesista && !gastos && ayudantes === 0) continue

                    const incluye = serializarIncluyeSeleccion({
                        especialista,
                        patologia: false,
                        anestesista,
                        gastos,
                        ayudantes,
                    })
                    if (!incluye) continue

                    const total = Number(
                        calcularTotalUnitarioDesglose(params.desglose, incluye).toFixed(2)
                    )
                    if (Math.abs(total - objetivo) <= tol) {
                        candidatos.push({ incluye, especialista, anestesista })
                    }
                }
            }
        }
    }

    const unicos = Array.from(new Set(candidatos.map((c) => c.incluye)))
    if (unicos.length === 1) return normalizarIncluyeCodigo(unicos[0])
    if (unicos.length === 0) return null

    // Empate: el importe guardado no alcanza para distinguir el componente.
    // Pasa cuando el override de codigo espeja el valor del especialista sobre
    // el anestesista (420303): los dos quedan en el mismo numero y "HE" y "HA"
    // matchean igual. Sin desempate la practica cae en "completa" y termina
    // cobrando los dos honorarios — el doble del nomenclador.
    // Se desempata con las matriculas cargadas en la practica: si solo hay
    // especialista, la practica cobra HE; si solo hay anestesista, HA.
    const soloEspecialista =
        params.matriculaEspecialista != null && params.matriculaAnestesista == null
    const soloAnestesista =
        params.matriculaAnestesista != null && params.matriculaEspecialista == null
    if (!soloEspecialista && !soloAnestesista) return null

    const compatibles = Array.from(
        new Set(
            candidatos
                .filter((c) =>
                    soloEspecialista
                        ? c.especialista && !c.anestesista
                        : c.anestesista && !c.especialista
                )
                .map((c) => c.incluye)
        )
    )
    if (compatibles.length !== 1) return null
    return normalizarIncluyeCodigo(compatibles[0])
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

async function obtenerFallbackDesglosePorCodigo(codigosPractica: string[]): Promise<Map<string, DesgloseValores>> {
    const codigos = Array.from(
        new Set(codigosPractica.map(normalizarCodigoPractica).filter(Boolean))
    )
    if (codigos.length === 0) return new Map()

    const rows = await prisma.nomencladorPractica.findMany({
        where: {
            AND: [
                {
                    OR: codigos.map((codigo) => ({ codigo: { startsWith: codigo } })),
                },
                {
                    OR: [
                        { valorEspecialista: { not: null } },
                        { valorAyudante: { not: null } },
                        { valorAnestesista: { not: null } },
                        { valorGastos: { not: null } },
                    ],
                },
            ],
        },
        select: {
            codigo: true,
            valorEspecialista: true,
            valorAyudante: true,
            valorAnestesista: true,
            valorGastos: true,
            convenioId: true,
        },
        orderBy: [{ codigo: 'asc' }, { convenioId: 'asc' }],
    })

    const rowsPorCodigo = new Map<string, typeof rows>()
    for (const row of rows) {
        const codigo = normalizarCodigoPractica(row.codigo)
        if (!codigos.includes(codigo)) continue

        const actuales = rowsPorCodigo.get(codigo) ?? []
        actuales.push(row)
        rowsPorCodigo.set(codigo, actuales)
    }

    const map = new Map<string, DesgloseValores>()

    for (const codigo of codigos) {
        const candidatos = rowsPorCodigo.get(codigo) ?? []
        if (candidatos.length === 0) continue

        // Si el mismo código tiene valores distintos entre convenios, no asumir uno arbitrario.
        // Se deja sin fallback para evitar desvíos de importes contra nomenclador.
        const primer = candidatos[0]
        if (!primer) continue
        const todosIguales = candidatos.every((c) => (
            Number(c.valorEspecialista ?? 0) === Number(primer.valorEspecialista ?? 0) &&
            Number(c.valorAyudante ?? 0) === Number(primer.valorAyudante ?? 0) &&
            Number(c.valorAnestesista ?? 0) === Number(primer.valorAnestesista ?? 0) &&
            Number(c.valorGastos ?? 0) === Number(primer.valorGastos ?? 0)
        ))
        if (!todosIguales) continue

        map.set(codigo, {
            valorEspecialista: primer.valorEspecialista != null ? Number(primer.valorEspecialista) : null,
            valorAyudante: primer.valorAyudante != null ? Number(primer.valorAyudante) : null,
            valorAnestesista: primer.valorAnestesista != null ? Number(primer.valorAnestesista) : null,
            valorGastos: primer.valorGastos != null ? Number(primer.valorGastos) : null,
        })
    }

    return map
}

export async function obtenerValorPractica(codigoPractica: string): Promise<number> {
    const valores = await obtenerValoresPracticas([codigoPractica])
    return valores.get(normalizarCodigoPractica(codigoPractica)) ?? 0
}

function tieneNumeroAutorizacionValido(numeroAutorizacion: string | null | undefined): boolean {
    return typeof numeroAutorizacion === 'string' && numeroAutorizacion.trim().length > 0
}

function practicaMarcadaComoFacturada(estado: string | null | undefined): boolean {
    return (estado ?? '').trim().toUpperCase() === 'F'
}

type VinculoOrdenPractica = {
    estado: string | null
    puestoNumero: number | null
    ordenNumero: number | null
    ordenItem: number | null
} | null | undefined

// Un item de orden cuenta como facturado solo si la practica vinculada apunta a
// ESTA orden. Una misma practica puede quedar referenciada por varias ordenes
// (renumeraciones, ordenes regeneradas), pero facturada esta en una sola: la que
// guarda en Practica.puestoNumero/ordenNumero. Sin este chequeo, las ordenes
// viejas se arrastran junto con la vigente y duplican el importe.
/**
 * La practica del item esta facturada EN ESTA ORDEN.
 *
 * El puntero de vuelta (Practica.puesto/orden/item) es uno solo y marca la unica
 * orden que alguien facturo explicitamente. Una practica repartida por rol tiene
 * un item en cada orden: si alcanzara con que la practica este marcada, facturar
 * una orden daria por facturadas a las otras, que nadie facturo.
 *
 * Que cada orden se facture sola lo resuelve `separarItemEnPracticaPropia`, que al
 * facturar le da al item su propia Practica con su propio puntero. Aca no hay nada
 * que relajar.
 *
 * Anular la facturacion deja la practica en 'A' y corta el vinculo, con lo cual
 * esto vuelve a dar false.
 */
function practicaFacturadaEnOrden(
    practica: VinculoOrdenPractica,
    orden: { puestoNumero: number; numero: number }
): boolean {
    if (!practicaMarcadaComoFacturada(practica?.estado)) return false
    if (!practica?.puestoNumero || !practica.ordenNumero || !practica.ordenItem) return false
    return practica.puestoNumero === orden.puestoNumero && practica.ordenNumero === orden.numero
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

function tieneAutorizacionBloqueanteOrdenItem(
    numeroAutorizacionItem: string | null | undefined,
    numeroAutorizacionOrden: string | null | undefined,
    puestoNumero: number,
    ordenNumero: number,
    item: number
): boolean {
    const authOrden = numeroAutorizacionOrden?.trim() ?? null
    if (tieneNumeroAutorizacionValido(authOrden)) return true

    const authItem = numeroAutorizacionItem?.trim() ?? null
    if (!tieneNumeroAutorizacionValido(authItem)) return false

    const codigoBarrasGenerado = generarCodigoBarrasOrdenItem(puestoNumero, ordenNumero, item)
    return authItem !== codigoBarrasGenerado
}

type PrestacionPreparadaFacturacion = {
    practicaId: number | null
    convenioId: number
    codigoPractica: string
    cantidad: number
    incluyeCodigo?: string | null
    numeroAutorizacion?: string | null
    ordenIndice: number
}

type VinculoOrdenExistenteFacturacion = {
    puestoNumero: number
    ordenNumero: number
    item: number
}

function incluyeCodigoCompatibleParaVinculo(
    incluyePrestacion: string | null | undefined,
    incluyeOrdenItem: string | null | undefined,
    codigoPractica: string
): boolean {
    const p = normalizarIncluyeCodigo(incluyePrestacion)
    const o = normalizarIncluyeCodigo(incluyeOrdenItem)
    if (p === o) return true

    // Legacy compatibility: when either side has no explicit subitem,
    // do not block the authorization link by include-code mismatch.
    if (!p || !o) return true

    const pTokens = p.split('+').filter(Boolean)
    const oTokens = o.split('+').filter(Boolean)
    const pSet = new Set(pTokens)
    const oSet = new Set(oTokens)

    // Modular compatibility: allow a combined include (GA+HE+HA+A1)
    // to match any authorized component item (GA / HE / HA / A1), and vice versa.
    const pIncluyeO = oTokens.every((token) => pSet.has(token))
    const oIncluyeP = pTokens.every((token) => oSet.has(token))
    if (pIncluyeO || oIncluyeP) return true

    // Patologia compatibility: treat HE and HP as equivalent specialist components.
    const normalizarPatologia = (token: string) => (token === 'HE' || token === 'HP' ? 'HX' : token)
    const pPat = new Set(pTokens.map(normalizarPatologia))
    const oPat = new Set(oTokens.map(normalizarPatologia))
    const pPatIncluyeO = Array.from(oPat).every((token) => pPat.has(token))
    const oPatIncluyeP = Array.from(pPat).every((token) => oPat.has(token))
    if (pPatIncluyeO || oPatIncluyeP) return true

    // Compatibilidad histórica HE/HA para códigos especiales.
    if (esCodigoHaObligatorio(codigoPractica) || esCodigoHeConOpcionHa(codigoPractica)) {
        const normalizarHistorico = (token: string) => (token === 'HE' || token === 'HA' ? 'HX' : token)
        const pHist = new Set(pTokens.map(normalizarHistorico))
        const oHist = new Set(oTokens.map(normalizarHistorico))

        const pHistIncluyeO = Array.from(oHist).every((token) => pHist.has(token))
        const oHistIncluyeP = Array.from(pHist).every((token) => oHist.has(token))
        return pHistIncluyeO || oHistIncluyeP
    }

    return false
}

async function resolverVinculosOrdenExistenteFacturacion(
    ingresoId: number,
    prestaciones: PrestacionPreparadaFacturacion[]
): Promise<Map<number, VinculoOrdenExistenteFacturacion>> {
    const prestacionesConPractica = prestaciones.filter((p) => Boolean(p.practicaId))
    if (prestacionesConPractica.length === 0) return new Map()

    const practicaIds = Array.from(
        new Set(prestacionesConPractica.map((p) => p.practicaId).filter((id): id is number => Boolean(id)))
    )
    if (practicaIds.length === 0) return new Map()

    const [practicasSeleccionadas, ordenesIngreso, practicasYaVinculadas] = await Promise.all([
        prisma.practica.findMany({
            where: { id: { in: practicaIds } },
            select: { id: true, fecha: true },
        }),
        prisma.orden.findMany({
            where: {
                ingresoId,
                // Solo ordenes vigentes: una orden anulada desde internacion no es
                // destino valido de facturacion. Antes se aceptaban tambien las
                // anuladas y despues se las revivia, resto de cuando anular la
                // facturacion anulaba la orden.
                ...buildOrdenNoAnuladaWhere(),
            },
            select: {
                puestoNumero: true,
                numero: true,
                numeroAutorizacion: true,
                items: {
                    select: {
                        item: true,
                        practicaId: true,
                        convenioId: true,
                        codigoPractica: true,
                        cantidad: true,
                        modulo: true,
                        fecha: true,
                        numeroAutorizacion: true,
                    },
                },
            },
        }),
        prisma.practica.findMany({
            where: {
                ingresoId,
                id: { notIn: practicaIds },
                ordenNumero: { not: null },
                ordenItem: { not: null },
                puestoNumero: { not: null },
            },
            select: {
                puestoNumero: true,
                ordenNumero: true,
                ordenItem: true,
            },
        }),
    ])

    const fechaPorPractica = new Map(practicasSeleccionadas.map((p) => [p.id, p.fecha]))

    type CandidatoOrdenItem = {
        key: string
        puestoNumero: number
        ordenNumero: number
        item: number
        practicaId: number | null
        convenioId: number
        codigoPractica: string
        cantidad: number
        incluyeCodigo: string | null
        fecha: Date
        numeroAutorizacion: string | null
    }

    const candidatos: CandidatoOrdenItem[] = []
    for (const orden of ordenesIngreso) {
        for (const it of orden.items) {
            const numeroAutorizacion = resolverNumeroAutorizacionOrdenItem(
                it.numeroAutorizacion,
                orden.numeroAutorizacion,
                orden.puestoNumero,
                orden.numero,
                it.item
            )
            if (!tieneNumeroAutorizacionValido(numeroAutorizacion)) continue

            candidatos.push({
                key: `${orden.puestoNumero}:${orden.numero}:${it.item}`,
                puestoNumero: orden.puestoNumero,
                ordenNumero: orden.numero,
                item: it.item,
                practicaId: it.practicaId,
                convenioId: it.convenioId,
                codigoPractica: normalizarCodigoPractica(it.codigoPractica),
                cantidad: Number(it.cantidad),
                incluyeCodigo: normalizarIncluyeCodigo(it.modulo),
                fecha: it.fecha,
                numeroAutorizacion,
            })
        }
    }

    const usados = new Set<string>(
        practicasYaVinculadas
            .filter((p) => Boolean(p.puestoNumero && p.ordenNumero && p.ordenItem))
            .map((p) => `${p.puestoNumero}:${p.ordenNumero}:${p.ordenItem}`)
    )

    const resultado = new Map<number, VinculoOrdenExistenteFacturacion>()

    const coberturaSubitemsPorOrden = (
        prestacion: PrestacionPreparadaFacturacion,
        candidato: CandidatoOrdenItem
    ): number => {
        const incluyePrestacion = normalizarIncluyeCodigo(prestacion.incluyeCodigo)
        if (!incluyePrestacion) return 0

        const requeridos = incluyePrestacion.split('+').filter(Boolean)
        if (requeridos.length === 0) return 0

        const codigoPrestacion = normalizarCodigoPractica(prestacion.codigoPractica)
        const auth = prestacion.numeroAutorizacion?.trim() ?? null
        const presentes = new Set<string>()

        for (const c of candidatos) {
            if (c.puestoNumero !== candidato.puestoNumero || c.ordenNumero !== candidato.ordenNumero) continue
            if (c.convenioId !== prestacion.convenioId) continue
            if (c.codigoPractica !== codigoPrestacion) continue
            if (tieneNumeroAutorizacionValido(auth) && c.numeroAutorizacion !== auth) continue

            const incluyeCandidato = normalizarIncluyeCodigo(c.incluyeCodigo)
            if (!incluyeCandidato) continue
            for (const token of incluyeCandidato.split('+')) {
                if (token) presentes.add(token)
            }
        }

        return requeridos.filter((token) => presentes.has(token)).length
    }

    // 1) Priorizar vínculo explícito por PraID en OrdenPrac
    for (const prestacion of prestacionesConPractica) {
        const practicaId = prestacion.practicaId
        if (!practicaId || resultado.has(practicaId)) continue

        const exactos = candidatos.filter(
            (c) =>
                c.practicaId === practicaId &&
                !usados.has(c.key) &&
                incluyeCodigoCompatibleParaVinculo(
                    prestacion.incluyeCodigo,
                    c.incluyeCodigo,
                    prestacion.codigoPractica
                )
        )
        const fechaPractica = fechaPorPractica.get(practicaId)?.getTime() ?? Number.POSITIVE_INFINITY
        const exacto = [...exactos].sort((a, b) => {
            const penalidadCantidadA = a.cantidad === Number(prestacion.cantidad) ? 0 : 1
            const penalidadCantidadB = b.cantidad === Number(prestacion.cantidad) ? 0 : 1
            if (penalidadCantidadA !== penalidadCantidadB) return penalidadCantidadA - penalidadCantidadB

            const coberturaA = coberturaSubitemsPorOrden(prestacion, a)
            const coberturaB = coberturaSubitemsPorOrden(prestacion, b)
            if (coberturaA !== coberturaB) return coberturaB - coberturaA

            const diffA = Math.abs(a.fecha.getTime() - fechaPractica)
            const diffB = Math.abs(b.fecha.getTime() - fechaPractica)
            return diffA - diffB
        })[0]
        if (!exacto) continue

        usados.add(exacto.key)
        resultado.set(practicaId, {
            puestoNumero: exacto.puestoNumero,
            ordenNumero: exacto.ordenNumero,
            item: exacto.item,
        })
    }

    // 2) Fallback legacy por convenio + código (+ subitem) + cercanía de cantidad/fecha
    for (const prestacion of prestacionesConPractica) {
        const practicaId = prestacion.practicaId
        if (!practicaId || resultado.has(practicaId)) continue

        const codigoPractica = normalizarCodigoPractica(prestacion.codigoPractica)
        const auth = prestacion.numeroAutorizacion?.trim() ?? null

        const compatibles = candidatos.filter(
            (c) =>
                !usados.has(c.key) &&
                c.convenioId === prestacion.convenioId &&
                c.codigoPractica === codigoPractica &&
                incluyeCodigoCompatibleParaVinculo(
                    prestacion.incluyeCodigo,
                    c.incluyeCodigo,
                    prestacion.codigoPractica
                )
        )
        if (compatibles.length === 0) continue

        const compatiblesPorAuth =
            tieneNumeroAutorizacionValido(auth)
                ? compatibles.filter((c) => c.numeroAutorizacion === auth)
                : compatibles
        const pool = compatiblesPorAuth.length > 0 ? compatiblesPorAuth : compatibles
        const fechaPractica = fechaPorPractica.get(practicaId)?.getTime() ?? Number.POSITIVE_INFINITY

        const elegido = [...pool].sort((a, b) => {
            const penalidadCantidadA = a.cantidad === Number(prestacion.cantidad) ? 0 : 1
            const penalidadCantidadB = b.cantidad === Number(prestacion.cantidad) ? 0 : 1
            if (penalidadCantidadA !== penalidadCantidadB) return penalidadCantidadA - penalidadCantidadB

            const coberturaA = coberturaSubitemsPorOrden(prestacion, a)
            const coberturaB = coberturaSubitemsPorOrden(prestacion, b)
            if (coberturaA !== coberturaB) return coberturaB - coberturaA

            const diffA = Math.abs(a.fecha.getTime() - fechaPractica)
            const diffB = Math.abs(b.fecha.getTime() - fechaPractica)
            return diffA - diffB
        })[0]

        if (!elegido) continue

        usados.add(elegido.key)
        resultado.set(practicaId, {
            puestoNumero: elegido.puestoNumero,
            ordenNumero: elegido.ordenNumero,
            item: elegido.item,
        })
    }

    return resultado
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

function buildOrdenNoAnuladaWhere(): Prisma.OrdenWhereInput {
    return {
        NOT: [
            {
                estado: {
                    contains: 'X',
                    mode: 'insensitive',
                },
            },
        ],
    }
}

function normalizarEstadoOrdenFacturacion(value: string | null | undefined): string {
    const normalized = (value ?? '').trim().toUpperCase()
    return normalized.length > 0 ? normalized : 'A'
}

function esEstadoOrdenAnuladaFacturacion(value: string | null | undefined): boolean {
    return normalizarEstadoOrdenFacturacion(value).startsWith('X')
}

function buildPracticaNoAnuladaWhere(): Prisma.PracticaWhereInput {
    return {
        NOT: [
            {
                estado: {
                    contains: 'X',
                    mode: 'insensitive',
                },
            },
        ],
    }
}

function buildOrdenFacturadaWhere(): Prisma.OrdenWhereInput {
    const practicaFacturada: Prisma.PracticaWhereInput = {
        estado: 'F',
        puestoNumero: { not: null },
        ordenNumero: { not: null },
        ordenItem: { not: null },
    }

    return {
        OR: [
            {
                AND: [
                    { numeroAutorizacion: { not: null } },
                    { numeroAutorizacion: { not: '' } },
                    { items: { some: { practica: { is: practicaFacturada } } } },
                ],
            },
            {
                items: {
                    some: {
                        AND: [
                            { numeroAutorizacion: { not: null } },
                            { numeroAutorizacion: { not: '' } },
                            { practica: { is: practicaFacturada } },
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

// Un lote sin periodo no filtra por fecha: levanta todo lo pendiente. Estos tres
// helpers son la unica forma de leer el periodo de un lote, para que "sin periodo"
// signifique lo mismo al crearlo, al mostrarlo y al aplicarle el promedi.
function rangoPeriodoOpcional(periodo: string | null | undefined): { desde: Date; hasta: Date } | null {
    if (!periodo) return null
    return periodoToDateRange(periodo)
}

function fechaEntraEnPeriodo(fecha: Date, rango: { desde: Date; hasta: Date } | null): boolean {
    if (!rango) return true
    return fecha >= rango.desde && fecha < rango.hasta
}

function whereFechaEmisionPeriodo(periodo: string | null | undefined): Prisma.OrdenWhereInput {
    const rango = rangoPeriodoOpcional(periodo)
    return rango ? { fechaEmision: { gte: rango.desde, lt: rango.hasta } } : {}
}

function fechaClave(value: Date): string {
    return claveDiaArgentina(value) ?? value.toISOString().slice(0, 10)
}

function claveCirugiaPractica(codigo: string, cantidad: number, fecha: Date): string {
    return `${normalizarCodigoPracticaFacturacion(codigo)}:${Number(cantidad)}:${fechaClave(fecha)}`
}

function claveCirugiaPracticaSinFecha(codigo: string, cantidad: number): string {
    return `${normalizarCodigoPracticaFacturacion(codigo)}:${Number(cantidad)}`
}

function parsePracticaSecundariaIdDesdeDescripcion(
    descripcion: string | null | undefined
): number | null {
    if (!descripcion) return null
    const match = /SECUNDARIA:(\d+)/.exec(descripcion)
    if (!match || !match[1]) return null
    const id = Number.parseInt(match[1], 10)
    return Number.isFinite(id) && id > 0 ? id : null
}

function buildDescripcionDiferencialCirugiaFacturacion(
    practicaSecundariaId: number | null | undefined
): string {
    if (practicaSecundariaId && Number.isFinite(practicaSecundariaId) && practicaSecundariaId > 0) {
        return `Diferenciales de cirugía configurados en facturación [SECUNDARIA:${practicaSecundariaId}]`
    }
    return 'Diferenciales de cirugía configurados en facturación'
}

function resolverInfoCirugiaConFallback<T extends { cirugiaId: number }>(
    porClaveCompleta: Map<string, T>,
    porClaveSinFecha: Map<string, T[]>,
    codigo: string,
    cantidad: number,
    fecha: Date
): T | null {
    const matchExacto = porClaveCompleta.get(claveCirugiaPractica(codigo, cantidad, fecha))
    if (matchExacto) return matchExacto

    const candidatos = porClaveSinFecha.get(claveCirugiaPracticaSinFecha(codigo, cantidad)) ?? []
    if (candidatos.length === 1) {
        return candidatos[0] ?? null
    }

    // Puede haber múltiples filas repetidas (mismo código/cantidad)
    // dentro de una misma cirugía; en ese caso no es ambiguo.
    if (candidatos.length > 1) {
        const porCirugia = new Map<number, T>()
        for (const candidato of candidatos) {
            if (!porCirugia.has(candidato.cirugiaId)) {
                porCirugia.set(candidato.cirugiaId, candidato)
            }
        }
        if (porCirugia.size === 1) {
            const unico = porCirugia.values().next().value
            return unico ?? null
        }
    }

    // Ultimo fallback: solo por codigo. La cantidad se edita despues de cargar
    // la cirugia (4 radioscopias que terminan siendo 3) y la cirugia queda con
    // el valor viejo, asi que la practica pierde el vinculo en silencio y se
    // muestra fuera del grupo de la cirugia. Igual que arriba, solo resuelve
    // cuando todos los candidatos son de la misma cirugia; si hay mas de una
    // es ambiguo y se devuelve null.
    const candidatosPorCodigo = candidatosPorCodigoEnMapa(porClaveSinFecha, codigo)
    if (candidatosPorCodigo.length > 0) {
        const cirugias = new Set(candidatosPorCodigo.map((candidato) => candidato.cirugiaId))
        if (cirugias.size === 1) {
            return candidatosPorCodigo[0] ?? null
        }
    }

    return null
}

/**
 * Junta los candidatos de todas las cantidades de un mismo codigo. Las claves
 * de `porClaveSinFecha` son `CODIGO:cantidad`, asi que alcanza con recorrerlas
 * por prefijo: el mapa tiene una entrada por practica de cirugia del ingreso.
 */
function candidatosPorCodigoEnMapa<T extends { cirugiaId: number }>(
    porClaveSinFecha: Map<string, T[]>,
    codigo: string
): T[] {
    const prefijo = `${normalizarCodigoPracticaFacturacion(codigo)}:`
    const candidatos: T[] = []
    for (const [clave, valores] of porClaveSinFecha) {
        if (clave.startsWith(prefijo)) {
            candidatos.push(...valores)
        }
    }
    return candidatos
}

function normalizarCodigoPracticaFacturacion(codigo: string): string {
    return codigo.trim().slice(0, 8).toUpperCase()
}

export async function buscarAdmisionesFacturacion(
    params: BusquedaFacturacionInput
): Promise<{ items: AdmisionFacturacionListItem[]; total: number }> {
    const {
        q,
        pacienteNombre,
        historiaClinica,
        numeroDocumento,
        numeroIngreso,
        numeroOrden,
        soloFacturadas,
        obraSocialId,
        tipoIngresoCodigo,
        codigoPractica,
        fechaIngreso,
        fechaDesde,
        fechaHasta,
        pagina,
        porPagina,
    } = params
    const skip = (pagina - 1) * porPagina

    const where: Prisma.IngresoWhereInput = {
        estado: { in: ['A', 'E'] },
    }

    const andFilters: Prisma.IngresoWhereInput[] = []

    if (tipoIngresoCodigo) {
        andFilters.push({ tipoIngresoCodigo: tipoIngresoCodigo.trim().toUpperCase() })
    }

    if (pacienteNombre) {
        const tokens = obtenerTokensBusquedaFlexible(pacienteNombre)
        const tokensBusqueda = tokens.length > 0 ? tokens : [pacienteNombre]
        andFilters.push({
            AND: tokensBusqueda.map((token) => ({
                OR: [
                    { nombre: { contains: token, mode: 'insensitive' } },
                    { paciente: { nombreCompleto: { contains: token, mode: 'insensitive' } } },
                ],
            })),
        })
    }

    if (typeof historiaClinica === 'number' && Number.isFinite(historiaClinica)) {
        andFilters.push({ paciente: { historiaClinica } })
    }

    if (typeof numeroDocumento === 'number' && Number.isFinite(numeroDocumento)) {
        andFilters.push({ paciente: { numeroDocumento } })
    }

    if (typeof numeroIngreso === 'number' && Number.isFinite(numeroIngreso)) {
        andFilters.push({ numeroIngreso })
    }

    if (typeof numeroOrden === 'number' && Number.isFinite(numeroOrden)) {
        andFilters.push({
            ordenes: {
                some: {
                    ...buildOrdenNoAnuladaWhere(),
                    numero: numeroOrden,
                    items: { some: {} },
                },
            },
        })
    }

    if (typeof obraSocialId === 'number' && Number.isFinite(obraSocialId)) {
        andFilters.push({ obraSocialId })
    }

    if (soloFacturadas) {
        andFilters.push({
            ordenes: {
                some: {
                    ...buildOrdenNoAnuladaWhere(),
                    ...buildOrdenFacturadaWhere(),
                },
            },
        })
    }

    if (q) {
        const esNumerico = /^\d+$/.test(q)
        if (esNumerico) {
            const n = parseInt(q, 10)
            andFilters.push({
                OR: [
                    { numeroIngreso: n },
                    { paciente: { numeroDocumento: n } },
                    { paciente: { historiaClinica: n } },
                    { nombre: { contains: q, mode: 'insensitive' } },
                ],
            })
        } else {
            const tokens = obtenerTokensBusquedaFlexible(q)
            const tokensBusqueda = tokens.length > 0 ? tokens : [q]
            andFilters.push({
                AND: tokensBusqueda.map((token) => ({
                    OR: [
                        { nombre: { contains: token, mode: 'insensitive' } },
                        { paciente: { nombreCompleto: { contains: token, mode: 'insensitive' } } },
                    ],
                })),
            })
        }
    }

    if (fechaDesde || fechaHasta) {
        const filtroFecha: Prisma.DateTimeFilter = {}

        if (fechaDesde) {
            const desde = new Date(`${fechaDesde}T00:00:00.000Z`)
            if (!Number.isNaN(desde.getTime())) {
                filtroFecha.gte = desde
            }
        }

        if (fechaHasta) {
            const hasta = new Date(`${fechaHasta}T23:59:59.999Z`)
            if (!Number.isNaN(hasta.getTime())) {
                filtroFecha.lte = hasta
            }
        }

        if (Object.keys(filtroFecha).length > 0) {
            andFilters.push({ fechaIngreso: filtroFecha })
        }
    } else if (fechaIngreso) {
        const desde = new Date(`${fechaIngreso}T00:00:00.000Z`)
        const hasta = new Date(`${fechaIngreso}T23:59:59.999Z`)
        if (!Number.isNaN(desde.getTime()) && !Number.isNaN(hasta.getTime())) {
            andFilters.push({
                fechaIngreso: {
                    gte: desde,
                    lte: hasta,
                },
            })
        }
    }

    if (codigoPractica) {
        andFilters.push({
            OR: [
                {
                    practicas: {
                        some: {
                            ...buildPracticaNoAnuladaWhere(),
                            codigoPractica: { contains: codigoPractica, mode: 'insensitive' },
                        },
                    },
                },
                {
                    ordenes: {
                        some: {
                            ...buildOrdenNoAnuladaWhere(),
                            items: { some: { codigoPractica: { contains: codigoPractica, mode: 'insensitive' } } },
                        },
                    },
                },
            ],
        })
    }

    if (andFilters.length > 0) {
        where.AND = andFilters
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
                        historiaClinica: true,
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
    const ingresoBase = await prisma.ingreso.findUnique({
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
        },
    })

    if (!ingresoBase) return null

    const [practicasBase, medicaciones, descartables, ordenes, ordenesEstadoIngreso, cirugiasProgramadas] = await Promise.all([
        prisma.practica.findMany({
            where: {
                ingresoId,
                OR: [{ estado: 'A' }, { estado: 'F' }, { estado: null }],
            },
            orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
            select: {
                id: true,
                estado: true,
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
                ordenPractica: {
                    select: {
                        puestoNumero: true,
                        ordenNumero: true,
                        item: true,
                        orden: {
                            select: {
                                estado: true,
                            },
                        },
                    },
                },
            },
        }),
        prisma.medicacionIngreso.findMany({
            where: { ingresoId, estado: { not: 'X' } },
            orderBy: [{ fechaInicio: 'desc' }, { id: 'desc' }],
            select: {
                id: true,
                fechaInicio: true,
                nombre: true,
                dosis: true,
                viaAdministracion: true,
                frecuencia: true,
                importe: true,
                cantidad: true,
            },
        }),
        prisma.descartableIngreso.findMany({
            where: { ingresoId, estado: { not: 'X' } },
            orderBy: [{ fechaInicio: 'desc' }, { id: 'desc' }],
            select: {
                id: true,
                fechaInicio: true,
                nombre: true,
                cantidad: true,
                observaciones: true,
                importe: true,
            },
        }),
        prisma.orden.findMany({
            where: {
                ingresoId,
                ...buildOrdenNoAnuladaWhere(),
            },
            orderBy: [{ fechaEmision: 'desc' }, { numero: 'desc' }],
            select: {
                puestoNumero: true,
                numero: true,
                estado: true,
                numeroAutorizacion: true,
                descripcionPatologia: true,
                fechaEmision: true,
                profesional: { select: { matricula: true } },
                items: {
                    orderBy: { item: 'asc' },
                    select: {
                        item: true,
                        practicaId: true,
                        efectorMatricula: true,
                        titularModular: true,
                        fecha: true,
                        convenioId: true,
                        codigoPractica: true,
                        modulo: true,
                        clasificacionAgrupacion: true,
                        cantidad: true,
                        numeroAutorizacion: true,
                        importeTotal: true,
                        practica: {
                            select: {
                                matriculaEspecialista: true,
                                matriculaAnestesista: true,
                                numeroAutorizacion: true,
                            },
                        },
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
        }),
        prisma.orden.findMany({
            where: { ingresoId },
            select: {
                puestoNumero: true,
                numero: true,
                estado: true,
            },
        }),
        prisma.cirugiaProgramada.findMany({
            where: { internacionId: ingresoId },
            orderBy: [{ fechaCirugia: 'desc' }, { id: 'desc' }],
            select: {
                id: true,
                fechaCirugia: true,
                diferenciales: {
                    select: {
                        descripcion: true,
                        esFeriado: true,
                        esNocturna: true,
                        mismaViaPatologia: true,
                        mismaViaMismaPatologia: true,
                        diferentesViasPatologia: true,
                        diferentesViasDiferentesPatologia: true,
                        dobleCirugia: true,
                        practicaBaseId: true,
                        unidadesConDiferencial: true,
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
        }),
    ])

    const clavesOrdenesActivas = new Set<string>()
    const puestosPorNumeroOrdenActivo = new Map<number, Set<number>>()
    const estadoOrdenPorClave = new Map<string, string | null>()
    const puestosPorNumeroOrdenIngreso = new Map<number, Set<number>>()
    for (const orden of ordenesEstadoIngreso) {
        const clave = `${orden.puestoNumero}:${orden.numero}`
        estadoOrdenPorClave.set(clave, orden.estado)
        const puestos = puestosPorNumeroOrdenIngreso.get(orden.numero) ?? new Set<number>()
        puestos.add(orden.puestoNumero)
        puestosPorNumeroOrdenIngreso.set(orden.numero, puestos)
    }

    for (const orden of ordenes) {
        clavesOrdenesActivas.add(`${orden.puestoNumero}:${orden.numero}`)
        const puestos = puestosPorNumeroOrdenActivo.get(orden.numero) ?? new Set<number>()
        puestos.add(orden.puestoNumero)
        puestosPorNumeroOrdenActivo.set(orden.numero, puestos)
    }

    const resolverPuestoOrdenActivo = (
        ordenNumero: number,
        puestoNumero: number | null
    ): number | null => {
        if (typeof puestoNumero === 'number' && Number.isFinite(puestoNumero) && puestoNumero > 0) {
            return puestoNumero
        }

        const puestos = puestosPorNumeroOrdenIngreso.get(ordenNumero)
        if (!puestos || puestos.size !== 1) return null

        for (const puesto of puestos) {
            const estado = estadoOrdenPorClave.get(`${puesto}:${ordenNumero}`)
            if (esEstadoOrdenAnuladaFacturacion(estado)) {
                return null
            }
            return puesto
        }
        return null
    }

    const practicasSinOrdenAnulada = practicasBase.filter((practica) => {
        const tieneVinculosHistoricos = practica.ordenPractica.length > 0
        const tieneVinculoHistoricoNoAnulado = practica.ordenPractica.some(
            (vinculo) => !esEstadoOrdenAnuladaFacturacion(vinculo.orden?.estado)
        )

        // Evita que prácticas huérfanas reaparezcan cuando su único historial
        // de vínculo corresponde a órdenes anuladas.
        if (practica.ordenNumero == null) {
            if (tieneVinculosHistoricos && !tieneVinculoHistoricoNoAnulado) {
                return false
            }
            return true
        }

        const puesto = resolverPuestoOrdenActivo(practica.ordenNumero, practica.puestoNumero)
        if (puesto == null) return false
        return clavesOrdenesActivas.has(`${puesto}:${practica.ordenNumero}`)
    })

    const conveniosPractica = Array.from(new Set(practicasSinOrdenAnulada.map((p) => p.convenioId)))
    const nomencladorRows = conveniosPractica.length
        ? await prisma.nomencladorPractica.findMany({
            where: { convenioId: { in: conveniosPractica } },
            select: {
                convenioId: true,
                codigo: true,
                descripcion: true,
                valorEspecialista: true,
                valorAyudante: true,
                valorAnestesista: true,
                valorGastos: true,
            },
        })
        : []

    const nomencladorPorClave = new Map<string, {
        descripcion: string
        valorEspecialista: Prisma.Decimal | null
        valorAyudante: Prisma.Decimal | null
        valorAnestesista: Prisma.Decimal | null
        valorGastos: Prisma.Decimal | null
    }>()

    for (const n of nomencladorRows) {
        nomencladorPorClave.set(`${n.convenioId}:${n.codigo.trim()}`, {
            descripcion: n.descripcion,
            valorEspecialista: n.valorEspecialista,
            valorAyudante: n.valorAyudante,
            valorAnestesista: n.valorAnestesista,
            valorGastos: n.valorGastos,
        })
    }

    const practicas = practicasSinOrdenAnulada.map((p) => ({
        ...p,
        nomencladorPractica: nomencladorPorClave.get(`${p.convenioId}:${p.codigoPractica.trim()}`) ?? null,
    }))

    const ingreso = {
        ...ingresoBase,
        practicas,
        medicaciones,
        descartables,
        ordenes,
        cirugiasProgramadas,
    }

    const profesionalesBase = await prisma.profesional.findMany({
        where: { estado: 'A' },
        select: { id: true, nombre: true, matricula: true },
        orderBy: { nombre: 'asc' },
    })

    const matriculasProfesionales = new Set(
        profesionalesBase
            .map((profesional) => profesional.matricula)
            .filter((matricula): matricula is number => typeof matricula === 'number' && matricula > 0)
    )
    const profesionalesExtra: Array<{ id: number; nombre: string; matricula: number | null }> = []
    let profesionalExtraId = -1

    for (const orden of ingreso.ordenes) {
        for (const item of orden.items) {
            const matriculaEfector = item.efectorMatricula
            if (!matriculaEfector || matriculaEfector <= 0) continue
            if (matriculasProfesionales.has(matriculaEfector)) continue

            profesionalesExtra.push({
                id: profesionalExtraId,
                nombre: resolverNombreEfectorFallback({
                    titularModular: item.titularModular,
                    descripcionPatologia: orden.descripcionPatologia,
                    matricula: matriculaEfector,
                }),
                matricula: matriculaEfector,
            })
            profesionalExtraId -= 1
            matriculasProfesionales.add(matriculaEfector)
        }
    }

    if (!matriculasProfesionales.has(MATRICULA_AMBULATORIO_DEFAULT)) {
        profesionalesExtra.push({
            id: profesionalExtraId,
            nombre: NOMBRE_MATRICULA_9110_DEFAULT,
            matricula: MATRICULA_AMBULATORIO_DEFAULT,
        })
        profesionalExtraId -= 1
        matriculasProfesionales.add(MATRICULA_AMBULATORIO_DEFAULT)
    }

    if (!matriculasProfesionales.has(MATRICULA_ANESTESISTA_INT_DEFAULT)) {
        profesionalesExtra.push({
            id: profesionalExtraId,
            nombre: NOMBRE_MATRICULA_6_DEFAULT,
            matricula: MATRICULA_ANESTESISTA_INT_DEFAULT,
        })
        profesionalExtraId -= 1
        matriculasProfesionales.add(MATRICULA_ANESTESISTA_INT_DEFAULT)
    }

    if (!matriculasProfesionales.has(MATRICULA_AYUDANTE_INT_DEFAULT)) {
        profesionalesExtra.push({
            id: profesionalExtraId,
            nombre: NOMBRE_MATRICULA_995_DEFAULT,
            matricula: MATRICULA_AYUDANTE_INT_DEFAULT,
        })
        profesionalExtraId -= 1
        matriculasProfesionales.add(MATRICULA_AYUDANTE_INT_DEFAULT)
    }

    if (!matriculasProfesionales.has(MATRICULA_GASTOS_INTERNACION_DEFAULT)) {
        profesionalesExtra.push({
            id: profesionalExtraId,
            nombre: NOMBRE_MATRICULA_9995_DEFAULT,
            matricula: MATRICULA_GASTOS_INTERNACION_DEFAULT,
        })
        profesionalExtraId -= 1
        matriculasProfesionales.add(MATRICULA_GASTOS_INTERNACION_DEFAULT)
    }

    if (!matriculasProfesionales.has(MATRICULA_PATOLOGIA_DEFAULT)) {
        profesionalesExtra.push({
            id: profesionalExtraId,
            nombre: NOMBRE_MATRICULA_2675_DEFAULT,
            matricula: MATRICULA_PATOLOGIA_DEFAULT,
        })
        profesionalExtraId -= 1
        matriculasProfesionales.add(MATRICULA_PATOLOGIA_DEFAULT)
    }

    const profesionales = [...profesionalesBase, ...profesionalesExtra]
        .map((profesional) => (
            profesional.matricula === MATRICULA_AMBULATORIO_DEFAULT
                ? { ...profesional, nombre: NOMBRE_MATRICULA_9110_DEFAULT }
                : profesional.matricula === MATRICULA_GASTOS_INTERNACION_DEFAULT
                    ? { ...profesional, nombre: NOMBRE_MATRICULA_9995_DEFAULT }
                : profesional.matricula === MATRICULA_ANESTESISTA_INT_DEFAULT
                    ? { ...profesional, nombre: NOMBRE_MATRICULA_6_DEFAULT }
                    : profesional.matricula === MATRICULA_AYUDANTE_INT_DEFAULT
                        ? { ...profesional, nombre: NOMBRE_MATRICULA_995_DEFAULT }
                        : profesional.matricula === MATRICULA_PATOLOGIA_DEFAULT
                            ? { ...profesional, nombre: NOMBRE_MATRICULA_2675_DEFAULT }
                        : profesional
        ))
        .sort((a, b) =>
            a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
        )

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
    const practicasConEstadoFacturado = new Set<number>()
    const clavesOrdenActivasIngreso = new Set(ingreso.ordenes.map((o) => `${o.puestoNumero}:${o.numero}`))
    const matriculaPorOrden = new Map<string, number | null>()
    const autorizacionPorOrden = new Map<string, string | null>()
    const autorizacionPorOrdenItem = new Map<string, string | null>()
    const incluyeCodigoPorOrdenItem = new Map<string, string | null>()
    const puestoPorNumeroOrden = new Map<number, number>()
    const autorizacionesVinculadasPorPractica = new Map<
        number,
        Array<{
            ordenPuestoNumero: number
            ordenNumero: number
            ordenItem: number
            numeroAutorizacion: string | null
            incluyeCodigo: string | null
            // Importe del item de esa orden: una practica repartida por rol
            // (especialista / gastos / ayudante) vale distinto en cada una.
            importeTotal: number | null
            matriculaProfesional: number | null
            matriculaEspecialista: number | null
            matriculaAnestesista: number | null
            matriculaAyudante: number | null
        }>
    >()
    const ordenVinculadaPorPractica = new Map<
        number,
        {
            puestoNumero: number
            numero: number
            item: number
            incluyeCodigo: string | null
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
    const desgloseFallbackPorCodigo = await obtenerFallbackDesglosePorCodigo(
        ingreso.practicas.map((p) => p.codigoPractica)
    )
    const cirugiaPracticas = new Map<string, { cirugiaId: number; diferenciales: NonNullable<PrestacionFacturableItem['diferenciales']> }>()
    const cirugiaPracticasPorCodigoCantidad = new Map<
        string,
        Array<{ cirugiaId: number; diferenciales: NonNullable<PrestacionFacturableItem['diferenciales']> }>
    >()
    const diferencialesPorPracticaId = new Map<number, NonNullable<PrestacionFacturableItem['diferenciales']>>()
    const practicaBaseAutomaticaPorCirugia = new Map<number, number>()
    const practicaSecundariaAutomaticaPorCirugia = new Map<number, number>()

    const resolverImporteTotalReferenciaCirugia = (practicaIngreso: typeof ingreso.practicas[number]): number => {
        const cantidad = Math.max(1, Number(practicaIngreso.cantidad) || 1)
        const codigoNormalizado = normalizarCodigoPractica(practicaIngreso.codigoPractica)
        const desgloseReferencia: DesgloseValores | null = practicaIngreso.nomencladorPractica
            ? {
                valorEspecialista:
                    practicaIngreso.nomencladorPractica.valorEspecialista != null
                        ? Number(practicaIngreso.nomencladorPractica.valorEspecialista)
                        : null,
                valorAyudante:
                    practicaIngreso.nomencladorPractica.valorAyudante != null
                        ? Number(practicaIngreso.nomencladorPractica.valorAyudante)
                        : null,
                valorAnestesista:
                    practicaIngreso.nomencladorPractica.valorAnestesista != null
                        ? Number(practicaIngreso.nomencladorPractica.valorAnestesista)
                        : null,
                valorGastos:
                    practicaIngreso.nomencladorPractica.valorGastos != null
                        ? Number(practicaIngreso.nomencladorPractica.valorGastos)
                        : null,
            }
            : (desgloseFallbackPorCodigo.get(codigoNormalizado) ?? null)

        const desgloseBaseReferencia = desgloseReferencia
            ? aplicarOverrideEspecialAnestesistaPorCodigo(practicaIngreso.codigoPractica, desgloseReferencia)
            : null
        const totalUnitarioReferencia = desgloseBaseReferencia
            ? calcularTotalUnitarioDesglose(desgloseBaseReferencia, null)
            : null

        if (totalUnitarioReferencia !== null && totalUnitarioReferencia > 0) {
            return Number((totalUnitarioReferencia * cantidad).toFixed(2))
        }

        return practicaIngreso.importeTotal != null
            ? Number(String(practicaIngreso.importeTotal))
            : 0
    }

    for (const cirugia of ingreso.cirugiasProgramadas) {
        const practicaBaseId =
            cirugia.diferenciales.find((d) => d.practicaBaseId != null)?.practicaBaseId ?? null
        const mismaViaPatologia = cirugia.diferenciales.some((d) => d.mismaViaPatologia)
        const mismaViaMismaPatologia = cirugia.diferenciales.some((d) => d.mismaViaMismaPatologia)
        const diferentesViasPatologia = cirugia.diferenciales.some((d) => d.diferentesViasPatologia)
        const diferentesViasDiferentesPatologia = cirugia.diferenciales.some((d) => d.diferentesViasDiferentesPatologia)
        const dobleCirugia = cirugia.diferenciales.some((d) => d.dobleCirugia)
        // Doble cirugia sin tipo de via cargado se asume misma via / misma
        // patologia (30% gastos, 0% especialista). Antes caia en el campo de
        // distinta via y cobraba 50% + 75%.
        const fallbackMismaViaMismaPatologia =
            dobleCirugia &&
            !mismaViaPatologia &&
            !mismaViaMismaPatologia &&
            !diferentesViasPatologia &&
            !diferentesViasDiferentesPatologia
        const practicaSecundariaId =
            cirugia.diferenciales
                .map((d) => parsePracticaSecundariaIdDesdeDescripcion(d.descripcion))
                .find((id) => id != null) ??
            null
        // Cirugia multiple cargada como cantidad de una sola practica (dos
        // resecciones = una practica con cantidad 2). No hay practica
        // secundaria que elegir: el diferencial va a N unidades y el resto se
        // factura al 100%.
        const unidadesConDiferencial =
            cirugia.diferenciales
                .map((d) => d.unidadesConDiferencial)
                .find((unidades) => unidades != null && unidades > 0) ?? null

        const diferenciales: NonNullable<PrestacionFacturableItem['diferenciales']> = {
            esFeriado: cirugia.diferenciales.some((d) => d.esFeriado),
            esNocturna: cirugia.diferenciales.some((d) => d.esNocturna),
            mismaViaPatologia,
            mismaViaMismaPatologia: mismaViaMismaPatologia || fallbackMismaViaMismaPatologia,
            diferentesViasPatologia,
            diferentesViasDiferentesPatologia,
            dobleCirugia,
            practicaBaseId,
            practicaSecundariaId,
            esPracticaBase: false,
            esPracticaSecundaria: false,
            aplicaDiferencial: false,
            unidadesConDiferencial,
        }

        for (const practica of cirugia.practicas) {
            const infoCirugia = {
                cirugiaId: cirugia.id,
                diferenciales,
            }

            const clave = claveCirugiaPractica(practica.codigo, Number(practica.cantidad), cirugia.fechaCirugia)
            cirugiaPracticas.set(clave, infoCirugia)

            const claveSinFecha = claveCirugiaPracticaSinFecha(practica.codigo, Number(practica.cantidad))
            const actuales = cirugiaPracticasPorCodigoCantidad.get(claveSinFecha) ?? []
            actuales.push(infoCirugia)
            cirugiaPracticasPorCodigoCantidad.set(claveSinFecha, actuales)
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

    const candidatasBasePorCirugia = new Map<
        number,
        { practicaId: number; importeReferencia: number }
    >()

    for (const practicaIngreso of ingreso.practicas) {
        const infoCirugia = resolverInfoCirugiaConFallback(
            cirugiaPracticas,
            cirugiaPracticasPorCodigoCantidad,
            practicaIngreso.codigoPractica,
            Number(practicaIngreso.cantidad),
            practicaIngreso.fecha
        )
        if (!infoCirugia?.diferenciales?.dobleCirugia) continue

        const importeReferencia = resolverImporteTotalReferenciaCirugia(practicaIngreso)

        const actual = candidatasBasePorCirugia.get(infoCirugia.cirugiaId)
        if (
            !actual ||
            importeReferencia > actual.importeReferencia ||
            (importeReferencia === actual.importeReferencia && practicaIngreso.id < actual.practicaId)
        ) {
            candidatasBasePorCirugia.set(infoCirugia.cirugiaId, {
                practicaId: practicaIngreso.id,
                importeReferencia,
            })
        }
    }

    for (const [cirugiaId, candidata] of candidatasBasePorCirugia) {
        practicaBaseAutomaticaPorCirugia.set(cirugiaId, candidata.practicaId)
    }

    const candidatasSecundariaPorCirugia = new Map<
        number,
        { practicaId: number; importeReferencia: number }
    >()

    for (const practicaIngreso of ingreso.practicas) {
        const infoCirugia = resolverInfoCirugiaConFallback(
            cirugiaPracticas,
            cirugiaPracticasPorCodigoCantidad,
            practicaIngreso.codigoPractica,
            Number(practicaIngreso.cantidad),
            practicaIngreso.fecha
        )
        if (!infoCirugia?.diferenciales?.dobleCirugia) continue

        const practicaBaseId = practicaBaseAutomaticaPorCirugia.get(infoCirugia.cirugiaId) ?? null
        if (practicaBaseId != null && practicaIngreso.id === practicaBaseId) continue

        const importeReferencia = resolverImporteTotalReferenciaCirugia(practicaIngreso)

        const actual = candidatasSecundariaPorCirugia.get(infoCirugia.cirugiaId)
        if (
            !actual ||
            importeReferencia > actual.importeReferencia ||
            (importeReferencia === actual.importeReferencia && practicaIngreso.id < actual.practicaId)
        ) {
            candidatasSecundariaPorCirugia.set(infoCirugia.cirugiaId, {
                practicaId: practicaIngreso.id,
                importeReferencia,
            })
        }
    }

    for (const [cirugiaId, candidata] of candidatasSecundariaPorCirugia) {
        practicaSecundariaAutomaticaPorCirugia.set(cirugiaId, candidata.practicaId)
    }

    // practicaBaseId / practicaSecundariaId apuntan a UNA fila de Practica, pero
    // una practica de cirugia esta partida en cuatro (GA, HE, HA, A1), cada una
    // con su propio id. Comparando por id el diferencial de doble cirugia caia
    // solo en la fila elegida -siempre la de gastos, que es la de mayor importe-
    // y el especialista, el anestesista y el ayudante de la practica secundaria
    // se facturaban al 100%. La identidad de la practica es (convenio, codigo),
    // no el id, asi que el match va por ahi.
    const claveIdentidadPorPracticaId = new Map<number, string>()
    for (const p of ingreso.practicas) {
        claveIdentidadPorPracticaId.set(
            p.id,
            `${p.convenioId}:${normalizarCodigoPractica(p.codigoPractica)}`
        )
    }

    // Sin doble cirugia el diferencial (feriado, nocturna, via) va solo a la
    // practica quirurgica. Los codigos accesorios que igual se cargan dentro de
    // la cirugia -cama, descartable, derecho de quirofano, interconsulta,
    // radioscopia, anatomia patologica- se facturan al valor de nomenclador.
    //
    // Si el administrador eligio la practica principal en el panel, esa
    // seleccion manda; si no, se toma todo lo de la cirugia que no sea
    // accesorio. En doble cirugia no aplica: ahi el diferencial ya queda
    // acotado a la practica secundaria.
    const codigoPorPracticaId = new Map<number, string>()
    for (const practicaIngreso of ingreso.practicas) {
        codigoPorPracticaId.set(
            practicaIngreso.id,
            normalizarCodigoPractica(practicaIngreso.codigoPractica)
        )
    }

    const codigosConDiferencialPorCirugia = new Map<number, Set<string>>()
    for (const cirugia of ingreso.cirugiasProgramadas) {
        if (cirugia.diferenciales.some((d) => d.dobleCirugia)) continue

        const practicaBaseId =
            cirugia.diferenciales.find((d) => d.practicaBaseId != null)?.practicaBaseId ?? null
        const codigoElegido =
            practicaBaseId != null ? (codigoPorPracticaId.get(practicaBaseId) ?? null) : null

        const codigos = new Set<string>()
        if (codigoElegido) {
            codigos.add(codigoElegido)
        } else {
            for (const practica of cirugia.practicas) {
                const codigo = normalizarCodigoPractica(practica.codigo)
                if (esCodigoAccesorioCirugia(codigo)) continue
                codigos.add(codigo)
            }
        }

        codigosConDiferencialPorCirugia.set(cirugia.id, codigos)
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
            incluyeCodigoPorOrdenItem.set(
                `${o.puestoNumero}:${o.numero}:${it.item}`,
                incluyeCodigoDeItemOrden(it)
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

            const numeroAutorizacionVinculo = resolverNumeroAutorizacionOrdenItem(
                it.numeroAutorizacion,
                o.numeroAutorizacion,
                o.puestoNumero,
                o.numero,
                it.item
            )
            const incluyeCodigoVinculo = incluyeCodigoDeItemOrden(it)
            const incluyeVinculo = desglosarIncluyeCodigo(incluyeCodigoVinculo)
            const desgloseVinculo = {
                valorEspecialista: it.nomencladorPractica?.valorEspecialista ?? null,
                valorAyudante: it.nomencladorPractica?.valorAyudante ?? null,
                valorAnestesista: it.nomencladorPractica?.valorAnestesista ?? null,
                valorGastos: it.nomencladorPractica?.valorGastos ?? null,
            }
            const esSoloAyudanteVinculo = Boolean(
                incluyeVinculo &&
                incluyeVinculo.ayudantes > 0 &&
                !incluyeTieneEspecialista(incluyeVinculo) &&
                !incluyeVinculo.anestesista &&
                !incluyeVinculo.gastos
            )
            const incluyeTieneAyudanteVinculo = Boolean(incluyeVinculo && incluyeVinculo.ayudantes > 0)
            const permiteFallbackAyudanteVinculo = !incluyeVinculo || esSoloAyudanteVinculo
            const permiteFallbackAnestesistaVinculo = !incluyeVinculo || Boolean(incluyeVinculo.anestesista)
            const esCodigoAnestesistaVinculo = esCodigoHaObligatorio(it.codigoPractica)
            const esGastoVinculo =
                esSeleccionSoloGastos(incluyeVinculo) ||
                (!incluyeVinculo && (
                    descripcionEsGasto(it.nomencladorPractica?.descripcion ?? null) ||
                    esDesgloseSoloGastos(desgloseVinculo)
                ))
            // Una practica de cirugia se reparte en varias ordenes (una por rol) y
            // cada OrdenPrac guarda a quien se le paga en `efectorMatricula`. La
            // matricula de la Practica es una sola para todas: si sale de ahi, las
            // tres filas muestran la misma y editar una arrastra a las otras. Manda
            // el item; la practica queda de respaldo.
            const efectorEsEspecialistaVinculo = Boolean(
                it.efectorMatricula && (
                    incluyeTieneEspecialista(incluyeVinculo) ||
                    incluyeTieneAyudanteVinculo ||
                    (!incluyeVinculo && !esCodigoAnestesistaVinculo && (
                        it.nomencladorPractica?.valorEspecialista != null ||
                        it.nomencladorPractica?.valorAyudante != null
                    ))
                )
            )
            const efectorEsAnestesistaVinculo = Boolean(
                it.efectorMatricula && (
                    esCodigoAnestesistaVinculo ||
                    Boolean(incluyeVinculo?.anestesista) ||
                    (!incluyeVinculo && it.nomencladorPractica?.valorAnestesista != null)
                )
            )
            const matriculaEspecialistaVinculo = esGastoVinculo
                ? resolverMatriculaGastoEditable(
                    ingreso.tipoIngresoCodigo,
                    it.efectorMatricula,
                    it.practica?.matriculaEspecialista
                )
                : (esCodigoAnestesistaVinculo
                    ? null
                    : resolverMatriculaEspecialistaPorPatologia(
                        (efectorEsEspecialistaVinculo ? it.efectorMatricula : null) ??
                            it.practica?.matriculaEspecialista ??
                            (ingreso.tipoIngresoCodigo === 'INT' &&
                                it.nomencladorPractica?.valorAyudante != null &&
                                permiteFallbackAyudanteVinculo
                                ? MATRICULA_AYUDANTE_INT_DEFAULT
                                : null),
                        incluyeVinculo,
                        it.codigoPractica
                    ))
            const matriculaAnestesistaVinculo = esGastoVinculo
                ? resolverMatriculaGastoEditable(
                    ingreso.tipoIngresoCodigo,
                    it.efectorMatricula,
                    it.practica?.matriculaAnestesista
                )
                : ((efectorEsAnestesistaVinculo ? it.efectorMatricula : null) ??
                    it.practica?.matriculaAnestesista ??
                    (ingreso.tipoIngresoCodigo === 'INT' &&
                        (it.nomencladorPractica?.valorAnestesista != null || esCodigoAnestesistaVinculo) &&
                        (permiteFallbackAnestesistaVinculo || esCodigoAnestesistaVinculo)
                        ? MATRICULA_ANESTESISTA_INT_DEFAULT
                        : null))
            const matriculaAyudanteVinculo = incluyeTieneAyudanteVinculo
                ? (esGastoVinculo
                    ? resolverMatriculaGastoEditable(
                        ingreso.tipoIngresoCodigo,
                        it.efectorMatricula,
                        it.practica?.matriculaEspecialista
                    )
                    : ((efectorEsEspecialistaVinculo ? it.efectorMatricula : null) ??
                        it.practica?.matriculaEspecialista ??
                        MATRICULA_AYUDANTE_INT_DEFAULT))
                : null

            const vinculadasActuales = autorizacionesVinculadasPorPractica.get(practicaIdAsociada) ?? []
            if (!vinculadasActuales.some(
                (v) =>
                    v.ordenPuestoNumero === o.puestoNumero &&
                    v.ordenNumero === o.numero &&
                    v.ordenItem === it.item
            )) {
                vinculadasActuales.push({
                    ordenPuestoNumero: o.puestoNumero,
                    ordenNumero: o.numero,
                    ordenItem: it.item,
                    numeroAutorizacion: numeroAutorizacionVinculo,
                    incluyeCodigo: incluyeCodigoVinculo,
                    importeTotal: decimalANumero(it.importeTotal),
                    matriculaProfesional: o.profesional?.matricula ?? null,
                    matriculaEspecialista: matriculaEspecialistaVinculo,
                    matriculaAnestesista: matriculaAnestesistaVinculo,
                    matriculaAyudante: matriculaAyudanteVinculo,
                })
                autorizacionesVinculadasPorPractica.set(practicaIdAsociada, vinculadasActuales)
            }

            const nuevoVinculo = {
                puestoNumero: o.puestoNumero,
                numero: o.numero,
                item: it.item,
                incluyeCodigo: incluyeCodigoVinculo,
                numeroAutorizacion: numeroAutorizacionVinculo,
                estado: o.estado,
                matriculaEspecialista: (() => {
                    const incluye = desglosarIncluyeCodigo(incluyeCodigoDeItemOrden(it))
                    const esGasto = esSeleccionSoloGastos(incluye) || (!incluye && descripcionEsGasto(it.nomencladorPractica?.descripcion ?? null))
                    if (esGasto) {
                        return resolverMatriculaGastoEditable(
                            ingreso.tipoIngresoCodigo,
                            it.practica?.matriculaEspecialista,
                            it.efectorMatricula
                        )
                    }
                    const incluyeSoloAyudante = Boolean(
                        incluye &&
                        incluye.ayudantes > 0 &&
                        !incluyeTieneEspecialista(incluye) &&
                        !incluye.anestesista &&
                        !incluye.gastos
                    )
                    if (incluyeSoloAyudante) {
                        return MATRICULA_AYUDANTE_INT_DEFAULT
                    }
                    const tieneHE = incluyeTieneEspecialista(incluye)
                    const tituloPatologia = esTituloPatologia(it.titularModular)
                    const desdeEfector = it.efectorMatricula && (
                        tituloPatologia ||
                        tieneHE ||
                        (!incluye && (
                            it.nomencladorPractica?.valorEspecialista != null ||
                            it.nomencladorPractica?.valorAyudante != null
                        ))
                    )
                        ? it.efectorMatricula
                        : null
                    const desdePractica = it.practica?.matriculaEspecialista ?? null
                    const matriculaBase = combinarMatricula(desdePractica, desdeEfector)
                    return resolverMatriculaEspecialistaPorPatologia(matriculaBase, incluye, it.codigoPractica)
                })(),
                matriculaAnestesista: (() => {
                    const incluye = desglosarIncluyeCodigo(incluyeCodigoDeItemOrden(it))
                    const esGasto = esSeleccionSoloGastos(incluye) || (!incluye && descripcionEsGasto(it.nomencladorPractica?.descripcion ?? null))
                    if (esGasto) {
                        return resolverMatriculaGastoEditable(
                            ingreso.tipoIngresoCodigo,
                            it.practica?.matriculaAnestesista,
                            it.efectorMatricula
                        )
                    }
                    const tieneHA = Boolean(incluye?.anestesista)
                    const tituloAnestesista = esTituloAnestesista(it.titularModular)
                    const matriculaDesdeEfector =
                        it.efectorMatricula && (
                            tituloAnestesista ||
                            tieneHA ||
                            (!incluye && it.nomencladorPractica?.valorAnestesista != null) ||
                            esCodigoHaObligatorio(it.codigoPractica)
                        )
                            ? it.efectorMatricula
                            : null

                    const desdePractica = it.practica?.matriculaAnestesista ?? null
                    return combinarMatricula(
                        combinarMatricula(desdePractica, matriculaDesdeEfector),
                        tituloAnestesista ? MATRICULA_ANESTESISTA_INT_DEFAULT : null
                    )
                })(),
            }

            const vinculoExistente = ordenVinculadaPorPractica.get(practicaIdAsociada)
            if (!vinculoExistente) {
                ordenVinculadaPorPractica.set(practicaIdAsociada, nuevoVinculo)
                continue
            }

            const incluyeExistente = desglosarIncluyeCodigo(vinculoExistente.incluyeCodigo)
            const incluyeNuevo = desglosarIncluyeCodigo(nuevoVinculo.incluyeCodigo)
            const priorizarNuevoEspecialista = Boolean(incluyeNuevo?.especialista && !incluyeExistente?.especialista)
            const priorizarNuevoAnestesista = Boolean(incluyeNuevo?.anestesista && !incluyeExistente?.anestesista)

            ordenVinculadaPorPractica.set(practicaIdAsociada, {
                ...vinculoExistente,
                incluyeCodigo: combinarIncluyeCodigos(vinculoExistente.incluyeCodigo, nuevoVinculo.incluyeCodigo),
                numeroAutorizacion:
                    resolverNumeroAutorizacion(vinculoExistente.numeroAutorizacion, nuevoVinculo.numeroAutorizacion),
                matriculaEspecialista: priorizarNuevoEspecialista
                    ? combinarMatricula(nuevoVinculo.matriculaEspecialista, vinculoExistente.matriculaEspecialista)
                    : combinarMatricula(vinculoExistente.matriculaEspecialista, nuevoVinculo.matriculaEspecialista),
                matriculaAnestesista: priorizarNuevoAnestesista
                    ? combinarMatricula(nuevoVinculo.matriculaAnestesista, vinculoExistente.matriculaAnestesista)
                    : combinarMatricula(vinculoExistente.matriculaAnestesista, nuevoVinculo.matriculaAnestesista),
            })
        }
    }

    type ResumenDuplicadoCirugia = {
        count: number
        hasLinked: boolean
    }
    const resumenDuplicadosCirugia = new Map<string, ResumenDuplicadoCirugia>()

    const buildClaveDuplicadoCirugia = (
        practica: typeof ingreso.practicas[number],
        cirugiaId: number
    ): string => {
        const codigo = normalizarCodigoPractica(practica.codigoPractica)
        const cantidad = Number(practica.cantidad)
        const fecha = fechaClave(practica.fecha)
        const importe = practica.importeTotal != null ? Number(String(practica.importeTotal)).toFixed(2) : 'NULL'
        return `${cirugiaId}:${codigo}:${cantidad}:${fecha}:${importe}`
    }

    for (const p of ingreso.practicas) {
        const infoCirugia = resolverInfoCirugiaConFallback(
            cirugiaPracticas,
            cirugiaPracticasPorCodigoCantidad,
            p.codigoPractica,
            Number(p.cantidad),
            p.fecha
        )

        if (!infoCirugia) continue

        const ordenPuestoNumero =
            p.puestoNumero ??
            (p.ordenNumero ? (puestoPorNumeroOrden.get(p.ordenNumero) ?? null) : null)
        const linkedActivo = Boolean(
            (autorizacionesVinculadasPorPractica.get(p.id)?.length ?? 0) > 0 ||
            (
                ordenPuestoNumero &&
                p.ordenNumero &&
                clavesOrdenActivasIngreso.has(`${ordenPuestoNumero}:${p.ordenNumero}`)
            )
        )

        const clave = buildClaveDuplicadoCirugia(p, infoCirugia.cirugiaId)
        const actual = resumenDuplicadosCirugia.get(clave)
        if (!actual) {
            resumenDuplicadosCirugia.set(clave, { count: 1, hasLinked: linkedActivo })
            continue
        }

        actual.count += 1
        actual.hasLinked = actual.hasLinked || linkedActivo
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
        const incluyeCodigoPracticaBase = normalizarIncluyeCodigo(
            vinculoPorItem?.incluyeCodigo ??
            (claveOrdenItem ? incluyeCodigoPorOrdenItem.get(claveOrdenItem) : null)
        )

        // Buscar si esta práctica pertenece a una cirugía programada
        const diferencialCirugia = resolverInfoCirugiaConFallback(
            cirugiaPracticas,
            cirugiaPracticasPorCodigoCantidad,
            p.codigoPractica,
            Number(p.cantidad),
            p.fecha
        )
        const autorizacionesVinculadas = [...(autorizacionesVinculadasPorPractica.get(p.id) ?? [])]
            .sort((a, b) => {
                if (a.ordenPuestoNumero !== b.ordenPuestoNumero) return a.ordenPuestoNumero - b.ordenPuestoNumero
                if (a.ordenNumero !== b.ordenNumero) return a.ordenNumero - b.ordenNumero
                return a.ordenItem - b.ordenItem
            })

        if (diferencialCirugia) {
            const linkedActivo = Boolean(
                autorizacionesVinculadas.length > 0 ||
                (
                    ordenPuestoNumero &&
                    ordenNumero &&
                    clavesOrdenActivasIngreso.has(`${ordenPuestoNumero}:${ordenNumero}`)
                )
            )
            const clave = buildClaveDuplicadoCirugia(p, diferencialCirugia.cirugiaId)
            const resumen = resumenDuplicadosCirugia.get(clave)

            if (resumen && resumen.count > 1 && resumen.hasLinked && !linkedActivo) {
                continue
            }
        }

        const practicaBaseIdEfectiva = diferencialCirugia
            ? (
                diferencialCirugia.diferenciales.practicaBaseId ??
                practicaBaseAutomaticaPorCirugia.get(diferencialCirugia.cirugiaId) ??
                null
            )
            : null
        const practicaSecundariaIdEfectiva = diferencialCirugia
            ? (
                diferencialCirugia.diferenciales.practicaSecundariaId ??
                practicaSecundariaAutomaticaPorCirugia.get(diferencialCirugia.cirugiaId) ??
                null
            )
            : null
        // Ver claveIdentidadPorPracticaId: el match va por (convenio, codigo)
        // para que el diferencial alcance a los cuatro componentes de la
        // practica, no solo a la fila cuyo id quedo guardado. Si base y
        // secundaria comparten codigo la clave no las distingue, asi que ahi se
        // vuelve a comparar por id.
        const claveBaseDobleCirugia = practicaBaseIdEfectiva != null
            ? (claveIdentidadPorPracticaId.get(practicaBaseIdEfectiva) ?? null)
            : null
        const claveSecundariaDobleCirugia = practicaSecundariaIdEfectiva != null
            ? (claveIdentidadPorPracticaId.get(practicaSecundariaIdEfectiva) ?? null)
            : null
        const clavesDobleCirugiaDistinguibles = Boolean(
            claveBaseDobleCirugia &&
            claveSecundariaDobleCirugia &&
            claveBaseDobleCirugia !== claveSecundariaDobleCirugia
        )
        const clavePractica = claveIdentidadPorPracticaId.get(p.id) ?? null

        const esPracticaBaseDobleCirugia = Boolean(
            diferencialCirugia?.diferenciales?.dobleCirugia &&
            practicaBaseIdEfectiva != null &&
            (clavesDobleCirugiaDistinguibles
                ? clavePractica === claveBaseDobleCirugia
                : practicaBaseIdEfectiva === p.id)
        )
        const esPracticaSecundariaDobleCirugia = Boolean(
            diferencialCirugia?.diferenciales?.dobleCirugia &&
            practicaSecundariaIdEfectiva != null &&
            (clavesDobleCirugiaDistinguibles
                ? clavePractica === claveSecundariaDobleCirugia
                : practicaSecundariaIdEfectiva === p.id)
        )
        const diferencialesCirugiaRaw = diferencialCirugia?.diferenciales ?? null
        const diferencialesCirugiaCalculados = (() => {
            if (!diferencialesCirugiaRaw) return null

            // En doble cirugía solo aplica diferencial a la práctica secundaria seleccionada.
            if (diferencialesCirugiaRaw.dobleCirugia) {
                return esPracticaSecundariaDobleCirugia ? diferencialesCirugiaRaw : null
            }

            // Sin doble cirugía va solo a la práctica quirúrgica (ver
            // codigosConDiferencialPorCirugia): la cama, el descartable y demás
            // accesorios no llevan recargo aunque estén dentro de la cirugía.
            const codigosConDiferencial = diferencialCirugia
                ? codigosConDiferencialPorCirugia.get(diferencialCirugia.cirugiaId)
                : null
            if (!codigosConDiferencial) return diferencialesCirugiaRaw

            return codigosConDiferencial.has(normalizarCodigoPractica(p.codigoPractica))
                ? diferencialesCirugiaRaw
                : null
        })()
        const aplicarDiferencialesCirugia = tieneDiferencialesActivos(diferencialesCirugiaCalculados)

        const precioNomenclador = valoresPractica.get(normalizarCodigoPractica(p.codigoPractica)) ?? 0
        const coberturaBase = calcularImporteFacturable(
            precioNomenclador,
            Number(p.cantidad),
            reglaFacturacion
        )
        const desgloseNomenclador: DesgloseValores | null = p.nomencladorPractica
            ? {
                valorEspecialista: p.nomencladorPractica.valorEspecialista != null ? Number(p.nomencladorPractica.valorEspecialista) : null,
                valorAyudante: p.nomencladorPractica.valorAyudante != null ? Number(p.nomencladorPractica.valorAyudante) : null,
                valorAnestesista: p.nomencladorPractica.valorAnestesista != null ? Number(p.nomencladorPractica.valorAnestesista) : null,
                valorGastos: p.nomencladorPractica.valorGastos != null ? Number(p.nomencladorPractica.valorGastos) : null,
            }
            : (desgloseFallbackPorCodigo.get(normalizarCodigoPractica(p.codigoPractica)) ?? null)

        const desgloseBase = desgloseNomenclador
            ? aplicarOverrideEspecialAnestesistaPorCodigo(p.codigoPractica, desgloseNomenclador)
            : null
        const desgloseConDiferencial = desgloseBase
            ? aplicarDiferencialesAValores(
                desgloseBase,
                aplicarDiferencialesCirugia ? diferencialesCirugiaCalculados : null
            )
            : null
        const importeFromDb = p.importeTotal != null ? Number(String(p.importeTotal)) : null
        const cant = Number(p.cantidad)
        const precioUnitarioDesdeDb = importeFromDb !== null && cant > 0 ? Number((importeFromDb / cant).toFixed(2)) : null
        // La inferencia va contra el desglose SIN diferencial: Practica.importeTotal
        // guarda el importe base de nomenclador, no el facturado. Si se compara
        // contra el desglose ya recargado, ninguna fila matchea su componente y
        // todas caen en "practica completa", asi que un feriado multiplicaba el
        // total por la cantidad de filas (GA, HE, HA, A1) en vez de recargarlas.
        const incluyeCodigoInferido = !incluyeCodigoPracticaBase
            ? inferirIncluyeCodigoDesdeImporte({
                desglose: desgloseBase,
                precioUnitarioDesdeDb,
                matriculaEspecialista: p.matriculaEspecialista,
                matriculaAnestesista: p.matriculaAnestesista,
            })
            : null
        // Cargas viejas de cirugia guardaron el componente SIN multiplicar por la
        // cantidad, asi que el unitario da la enesima parte y no matchea nada. Se
        // reintenta contra el importe crudo: si ahi si matchea un componente, la fila
        // es ese componente con el importe guardado como unitario.
        const incluyeCodigoInferidoSinPartir = !incluyeCodigoPracticaBase && !incluyeCodigoInferido && cant > 1
            ? inferirIncluyeCodigoDesdeImporte({
                desglose: desgloseBase,
                precioUnitarioDesdeDb: importeFromDb,
                matriculaEspecialista: p.matriculaEspecialista,
                matriculaAnestesista: p.matriculaAnestesista,
            })
            : null
        const incluyeCodigoPractica = normalizarIncluyeCodigo(
            incluyeCodigoPracticaBase ?? incluyeCodigoInferido ?? incluyeCodigoInferidoSinPartir
        )
        // Sin componente reconocido y con un importe guardado que tampoco es el de la
        // practica completa, no hay forma de saber que cobra la fila. Antes caia en
        // "completa" y facturaba (esp+ayu+ane+gto) x cantidad: inventaba hacia arriba.
        const importeGuardadoIndeterminado = Boolean(
            !incluyeCodigoPractica &&
            importeFromDb !== null &&
            precioUnitarioDesdeDb !== null &&
            desgloseBase &&
            Math.abs(
                Number(calcularTotalUnitarioDesglose(desgloseBase, null).toFixed(2)) -
                precioUnitarioDesdeDb
            ) > 0.01
        )

        const esCodigoAnestesista = esCodigoHaObligatorio(p.codigoPractica)
        const incluyeSeleccionPractica = desglosarIncluyeCodigo(incluyeCodigoPractica)
        const incluyeSoloAyudantePractica = Boolean(
            incluyeSeleccionPractica &&
            incluyeSeleccionPractica.ayudantes > 0 &&
            !incluyeTieneEspecialista(incluyeSeleccionPractica) &&
            !incluyeSeleccionPractica.anestesista &&
            !incluyeSeleccionPractica.gastos
        )
        const permiteFallbackAyudante = !incluyeSeleccionPractica || incluyeSoloAyudantePractica
        const permiteFallbackAnestesista =
            !incluyeSeleccionPractica ||
            Boolean(incluyeSeleccionPractica.anestesista) ||
            esCodigoAnestesista
        const matriculaEspecialista =
            esCodigoAnestesista
                ? null
                : resolverMatriculaEspecialistaPorPatologia(
                    vinculoPorItem?.matriculaEspecialista ??
                        p.matriculaEspecialista ??
                        (esInternacion && p.nomencladorPractica?.valorAyudante != null
                            && permiteFallbackAyudante
                            ? MATRICULA_AYUDANTE_INT_DEFAULT
                            : null),
                    incluyeSeleccionPractica,
                    p.codigoPractica
                )
        const matriculaAnestesista =
            vinculoPorItem?.matriculaAnestesista ??
            p.matriculaAnestesista ??
            (esInternacion && (p.nomencladorPractica?.valorAnestesista != null || esCodigoAnestesista)
                && permiteFallbackAnestesista
                ? MATRICULA_ANESTESISTA_INT_DEFAULT
                : null)

        const desgloseFiltradoPorIncluye = desgloseConDiferencial
            ? aplicarIncluyeCodigoADesglose(desgloseConDiferencial, incluyeCodigoPractica, p.codigoPractica)
            : null
        const totalUnitarioDesglose = desgloseFiltradoPorIncluye
            ? calcularTotalUnitarioDesglose(desgloseFiltradoPorIncluye, incluyeCodigoPractica)
            : null

        // Cirugia multiple cargada como cantidad: dos resecciones son una
        // practica con cantidad 2, no dos practicas, asi que no hay secundaria
        // que elegir. El diferencial va a N unidades y el resto se factura al
        // 100%, y eso se reparte en cada componente por separado — con misma
        // via, la fila de gastos cobra una unidad entera + una al 30%, y la de
        // especialista una entera + una en cero.
        const unidadesConDiferencialCirugia =
            aplicarDiferencialesCirugia && !diferencialesCirugiaRaw?.dobleCirugia
                ? (diferencialesCirugiaCalculados?.unidadesConDiferencial ?? null)
                : null
        const unidadesConDiferencialPractica =
            unidadesConDiferencialCirugia != null && unidadesConDiferencialCirugia > 0
                ? Math.min(unidadesConDiferencialCirugia, cant)
                : null
        const unidadesSinDiferencialPractica =
            unidadesConDiferencialPractica != null
                ? cant - unidadesConDiferencialPractica
                : null
        const desgloseBaseFiltradoPorIncluye = desgloseBase
            ? aplicarIncluyeCodigoADesglose(desgloseBase, incluyeCodigoPractica, p.codigoPractica)
            : null
        const totalUnitarioSinDiferencial = desgloseBaseFiltradoPorIncluye
            ? calcularTotalUnitarioDesglose(desgloseBaseFiltradoPorIncluye, incluyeCodigoPractica)
            : null
        const partirPorUnidades = Boolean(
            unidadesSinDiferencialPractica != null &&
            unidadesSinDiferencialPractica > 0 &&
            totalUnitarioDesglose !== null &&
            totalUnitarioSinDiferencial !== null &&
            // Si el componente de la fila no cambia con el diferencial no hay
            // nada que repartir: anunciarlo igual llena la grilla de "1 de 2 al
            // 100%" en filas cuyo importe es el mismo con o sin diferencial.
            Math.abs(totalUnitarioDesglose - totalUnitarioSinDiferencial) > 0.005
        )
        const totalUnitarioCirugiaReferencia = desgloseBase
            ? calcularTotalUnitarioDesglose(desgloseBase, null)
            : null
        const importeTotalCirugiaReferencia = totalUnitarioCirugiaReferencia !== null
            ? Number((totalUnitarioCirugiaReferencia * cant).toFixed(2))
            : (importeFromDb ?? null)
        const precioUnitarioSinPartir = totalUnitarioDesglose !== null
            ? totalUnitarioDesglose
            : (incluyeCodigoPractica && precioUnitarioDesdeDb !== null
                ? precioUnitarioDesdeDb
                : (coberturaBase.precioUnitarioFacturable > 0
                    ? coberturaBase.precioUnitarioFacturable
                    : (precioUnitarioDesdeDb ?? coberturaBase.precioUnitarioFacturable)))
        const importeTotalCalculado = partirPorUnidades
            ? Number((
                totalUnitarioSinDiferencial! * unidadesSinDiferencialPractica! +
                totalUnitarioDesglose! * unidadesConDiferencialPractica!
            ).toFixed(2))
            : (totalUnitarioDesglose !== null
                ? Number((totalUnitarioDesglose * cant).toFixed(2))
                : coberturaBase.importeTotalFacturable)
        // Partida, la fila deja de tener un unitario uniforme: las unidades al
        // 100% y las que llevan diferencial valen distinto. Se muestra el
        // promedio para que unitario x cantidad siga cerrando contra el total.
        const precioUnitario = partirPorUnidades && cant > 0
            ? Number((importeTotalCalculado / cant).toFixed(2))
            : precioUnitarioSinPartir
        const importeTotalFacturacion = importeGuardadoIndeterminado
            ? importeFromDb!
            : (diferencialCirugia
                ? importeTotalCalculado
                : (incluyeCodigoPractica && totalUnitarioDesglose !== null
                    ? importeTotalCalculado
                    : (importeFromDb ?? coberturaBase.importeTotalFacturable)))
        const descripcionBase = p.nomencladorPractica?.descripcion ?? p.codigoPractica.trim()
        const incluyeSeleccion = incluyeSeleccionPractica
        const esGastoPractica =
            esSeleccionSoloGastos(incluyeSeleccion) ||
            (!incluyeSeleccion && (
                descripcionEsGasto(descripcionBase) ||
                esDesgloseSoloGastos(desgloseFiltradoPorIncluye ?? desgloseConDiferencial ?? desgloseBase)
            ))
        const matriculaEspecialistaFinal = esGastoPractica
            ? resolverMatriculaGastoEditable(
                ingreso.tipoIngresoCodigo,
                p.matriculaEspecialista,
                vinculoPorItem?.matriculaEspecialista
            )
            : matriculaEspecialista
        const matriculaAnestesistaFinal = esGastoPractica
            ? resolverMatriculaGastoEditable(
                ingreso.tipoIngresoCodigo,
                p.matriculaAnestesista,
                vinculoPorItem?.matriculaAnestesista
            )
            : matriculaAnestesista
        const diferencialesPractica = diferencialCirugia
            ? {
                ...diferencialCirugia.diferenciales,
                practicaBaseId: practicaBaseIdEfectiva,
                practicaSecundariaId: practicaSecundariaIdEfectiva,
                esPracticaBase: esPracticaBaseDobleCirugia,
                esPracticaSecundaria: esPracticaSecundariaDobleCirugia,
                aplicaDiferencial: aplicarDiferencialesCirugia,
                // El valor guardado va crudo para que el panel lo muestre aunque
                // todavia no haya diferencial activo que aplicar; el reparto
                // efectivo de esta fila viaja en unidadesSinDiferencial.
                unidadesConDiferencial: diferencialCirugia.diferenciales.unidadesConDiferencial ?? null,
                unidadesSinDiferencial: partirPorUnidades ? unidadesSinDiferencialPractica : null,
            }
            : null
        if (diferencialesPractica) {
            diferencialesPorPracticaId.set(p.id, diferencialesPractica)
        }

        const numeroAutorizacionPractica = tieneVinculoExplicitoEnDB
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
            : (p.numeroAutorizacion?.trim() || null)

        const ordenActivaVinculada = Boolean(
            ordenPuestoNumero &&
            ordenNumero &&
            clavesOrdenActivasIngreso.has(`${ordenPuestoNumero}:${ordenNumero}`)
        )

        const practicaFacturada = Boolean(
            practicaMarcadaComoFacturada(p.estado) &&
            tieneVinculoExplicitoEnDB &&
            ordenActivaVinculada &&
            tieneNumeroAutorizacionValido(numeroAutorizacionPractica)
        )
        if (practicaFacturada) {
            practicasConEstadoFacturado.add(p.id)
        }

        prestaciones.push({
            uid: `PRACTICA:${p.id}`,
            tipo: 'PRACTICA',
            referencia: `PRA-${p.id}`,
            fecha: p.fecha,
            descripcion: incluyeCodigoPractica
                ? `${descripcionBase} [${incluyeCodigoPractica}]`
                : descripcionBase,
            cantidad: cant,
            precioUnitario,
            importeTotal: importeTotalFacturacion,
            importeTotalOriginal: importeFromDb,
            importeTotalCirugiaReferencia,
            // Una práctica queda facturada solo cuando fue marcada explícitamente
            // por acción de FACTURAR y conserva vínculo + autorización.
            facturada: practicaFacturada,
            matriculaProfesional: null,
            matriculaEspecialista: matriculaEspecialistaFinal,
            matriculaAnestesista: matriculaAnestesistaFinal,
            ordenPuestoNumero,
            ordenNumero,
            convenioId: p.convenioId,
            codigoPractica: p.codigoPractica.trim(),
            incluyeCodigo: incluyeCodigoPractica,
            esPracticaCirugia: Boolean(diferencialCirugia),
            diferenciales: diferencialesPractica,
            numeroAutorizacion: numeroAutorizacionPractica,
            autorizacionesVinculadas: autorizacionesVinculadas.length > 0
                ? autorizacionesVinculadas
                : undefined,
            origen: {
                ingresoId: ingreso.id,
                practicaId: p.id,
                ordenPuestoNumero: ordenPuestoNumero ?? undefined,
                ordenNumero: ordenNumero ?? undefined,
                ordenItem: ordenItem ?? undefined,
                cirugiaProgramadaId: diferencialCirugia?.cirugiaId,
            },
            desglose: desgloseFiltradoPorIncluye ? {
                valorEspecialista: desgloseFiltradoPorIncluye.valorEspecialista,
                valorAyudante: desgloseFiltradoPorIncluye.valorAyudante,
                valorAnestesista: desgloseFiltradoPorIncluye.valorAnestesista,
                valorGastos: desgloseFiltradoPorIncluye.valorGastos,
                valorTotal: precioUnitario,
            } : desgloseNomenclador ? {
                ...aplicarIncluyeCodigoADesglose(
                    aplicarOverrideEspecialAnestesistaPorCodigo(p.codigoPractica, desgloseNomenclador),
                    incluyeCodigoPractica,
                    p.codigoPractica
                ),
                valorTotal: precioUnitario,
            } : undefined,
        })
    }

    // Solo considerar como "ítem facturado" lo que esté enlazado explícitamente
    // desde Practica (evita duplicar con órdenes solo autorizadas).
    //
    // El enlace es el puntero puesto/orden/item de la practica, y apunta a una sola
    // orden: la que se facturo. Una practica repartida por rol tiene un item en cada
    // orden, y las que nadie facturo tienen que seguir pendientes — dar por facturado
    // todo item que comparta la practica las hacia desaparecer de pendientes sin que
    // nadie las hubiera facturado. Cada orden se factura sola separandola en su propia
    // practica (`separarItemEnPracticaPropia`), no relajando esto.
    const itemsOrdenFacturados = new Set<string>()
    for (const p of ingreso.practicas) {
        if (!practicasConEstadoFacturado.has(p.id)) continue
        if (!p.ordenNumero || !p.ordenItem) continue
        const puesto = p.puestoNumero ?? (puestoPorNumeroOrden.get(p.ordenNumero) ?? null)
        if (!puesto) continue
        itemsOrdenFacturados.add(`${puesto}:${p.ordenNumero}:${p.ordenItem}`)
    }

    for (const o of ingreso.ordenes) {
        if (esEstadoOrdenAnuladaFacturacion(o.estado)) continue
        for (const it of o.items) {
            const claveItem = `${o.puestoNumero}:${o.numero}:${it.item}`
            if (!itemsOrdenFacturados.has(claveItem)) continue
            const incluyeCodigoItem = incluyeCodigoDeItemOrden(it)

            // La autorizacion se pide en el item o en la orden, pero una orden de
            // cirugia puede quedar con `OprNumAut` vacio y llevar la autorizacion solo
            // en la practica. Sin este ultimo recurso la orden facturada no salia en
            // ninguna de las dos vistas: ni en pendientes, por estar facturada, ni aca.
            const numeroAutorizacion = resolverNumeroAutorizacionOrdenItem(
                it.numeroAutorizacion,
                o.numeroAutorizacion,
                o.puestoNumero,
                o.numero,
                it.item
            ) ?? (it.practica?.numeroAutorizacion?.trim() || null)
            if (!tieneNumeroAutorizacionValido(numeroAutorizacion)) continue

            const incluye = desglosarIncluyeCodigo(incluyeCodigoDeItemOrden(it))
            const esGastoItem =
                esSeleccionSoloGastos(incluye) ||
                (!incluye && (
                    descripcionEsGasto(it.nomencladorPractica?.descripcion ?? null) ||
                    esDesgloseSoloGastos({
                        valorEspecialista: it.nomencladorPractica?.valorEspecialista ?? null,
                        valorAyudante: it.nomencladorPractica?.valorAyudante ?? null,
                        valorAnestesista: it.nomencladorPractica?.valorAnestesista ?? null,
                        valorGastos: it.nomencladorPractica?.valorGastos ?? null,
                    })
                ))
            const tieneHE = incluyeTieneEspecialista(incluye)
            const tieneHA = Boolean(incluye?.anestesista)
            const incluyeSoloAyudante = Boolean(
                incluye &&
                incluye.ayudantes > 0 &&
                !incluyeTieneEspecialista(incluye) &&
                !incluye.anestesista &&
                !incluye.gastos
            )
            const tituloPatologia = esTituloPatologia(it.titularModular)
            const tituloAnestesista = esTituloAnestesista(it.titularModular)

            const matriculaEspecialistaEfector =
                it.efectorMatricula && (
                    tituloPatologia ||
                    tieneHE ||
                    (!incluye && (
                        it.nomencladorPractica?.valorEspecialista != null ||
                        it.nomencladorPractica?.valorAyudante != null
                    ))
                )
                    ? it.efectorMatricula
                    : null
            const fallbackAyudanteDefault =
                incluyeSoloAyudante
                    ? MATRICULA_AYUDANTE_INT_DEFAULT
                    : (
                        ingreso.tipoIngresoCodigo === 'INT' &&
                        it.nomencladorPractica?.valorAyudante != null &&
                        (!incluye || (incluye.ayudantes > 0 && !incluyeTieneEspecialista(incluye) && !incluye.anestesista))
                    )
                        ? MATRICULA_AYUDANTE_INT_DEFAULT
                        : null
            const matriculaEspecialistaItem = esGastoItem
                ? resolverMatriculaGastoEditable(
                    ingreso.tipoIngresoCodigo,
                    it.efectorMatricula,
                    it.practica?.matriculaEspecialista
                )
                : (incluyeSoloAyudante
                    ? MATRICULA_AYUDANTE_INT_DEFAULT
                    : resolverMatriculaEspecialistaPorPatologia(
                        matriculaEspecialistaEfector ?? it.practica?.matriculaEspecialista ?? fallbackAyudanteDefault,
                        incluye,
                        it.codigoPractica
                    ))

            const matriculaAnestesistaEfector =
                it.efectorMatricula && (
                    tituloAnestesista ||
                    tieneHA ||
                    (!incluye && it.nomencladorPractica?.valorAnestesista != null) ||
                    esCodigoHaObligatorio(it.codigoPractica)
                )
                    ? it.efectorMatricula
                    : null
            const fallbackAnestesistaDefault =
                ingreso.tipoIngresoCodigo === 'INT' &&
                    (
                        it.nomencladorPractica?.valorAnestesista != null ||
                        esCodigoHaObligatorio(it.codigoPractica)
                    ) &&
                    (!incluye || incluye.anestesista || esCodigoHaObligatorio(it.codigoPractica))
                    ? MATRICULA_ANESTESISTA_INT_DEFAULT
                    : (tituloAnestesista ? MATRICULA_ANESTESISTA_INT_DEFAULT : null)
            const matriculaAnestesistaItem = esGastoItem
                ? resolverMatriculaGastoEditable(
                    ingreso.tipoIngresoCodigo,
                    it.efectorMatricula,
                    it.practica?.matriculaAnestesista
                )
                : (matriculaAnestesistaEfector ?? it.practica?.matriculaAnestesista ?? fallbackAnestesistaDefault)
            const diferencialesOrdenItem =
                it.practicaId != null ? (diferencialesPorPracticaId.get(it.practicaId) ?? null) : null

            prestaciones.push({
                uid: `ORDEN_ITEM:${o.puestoNumero}:${o.numero}:${it.item}`,
                tipo: 'ORDEN_ITEM',
                referencia: `${o.puestoNumero.toString().padStart(4, '0')}-${o.numero.toString().padStart(8, '0')}-${it.item.toString().padStart(2, '0')}`,
                fecha: it.fecha,
                descripcion: incluyeCodigoItem
                    ? `${it.nomencladorPractica?.descripcion ?? it.codigoPractica.trim()} [${incluyeCodigoItem}]`
                    : (it.nomencladorPractica?.descripcion ?? it.codigoPractica.trim()),
                cantidad: Number(it.cantidad),
                precioUnitario:
                    Number(it.cantidad) > 0
                        ? Number(String(it.importeTotal ?? 0)) / Number(it.cantidad)
                        : Number(String(it.importeTotal ?? 0)),
                importeTotal: Number(String(it.importeTotal ?? 0)),
                facturada: true,
                matriculaProfesional: null,
                matriculaEspecialista: matriculaEspecialistaItem,
                matriculaAnestesista: matriculaAnestesistaItem,
                ordenPuestoNumero: o.puestoNumero,
                ordenNumero: o.numero,
                convenioId: it.convenioId,
                codigoPractica: it.codigoPractica.trim(),
                incluyeCodigo: incluyeCodigoItem,
                numeroAutorizacion,
                esPracticaCirugia: Boolean(diferencialesOrdenItem),
                diferenciales: diferencialesOrdenItem,
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
        const cantidadMedicacion = Number(m.cantidad ?? 1) || 1
        prestaciones.push({
            uid: `MEDICACION:${m.id}`,
            tipo: 'MEDICACION',
            referencia: `MED-${m.id}`,
            fecha: m.fechaInicio,
            descripcion: detalle ? `${m.nombre} (${detalle})` : m.nombre,
            cantidad: cantidadMedicacion,
            precioUnitario: Number(m.importe ?? 0),
            importeTotal: Number((Number(m.importe ?? 0) * cantidadMedicacion).toFixed(2)),
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
        const precioUnitario = Number(d.importe ?? 0)
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

export type MedicamentoCatalogoItem = {
    id: number
    nombre: string
    /** Precio de una ampolla. `null` = sin confirmar, no se autocompleta. */
    precio: number | null
}

/** Lista del combo de medicacion de facturacion: solo los activos. */
export async function listarMedicamentosCatalogo(): Promise<MedicamentoCatalogoItem[]> {
    const filas = await prisma.catalogoMedicamentoFacturacion.findMany({
        where: { estado: 'A' },
        orderBy: { nombre: 'asc' },
        select: { id: true, nombre: true, precio: true },
    })

    return filas.map((f) => ({
        id: f.id,
        nombre: f.nombre,
        precio: f.precio == null ? null : Number(f.precio),
    }))
}

/**
 * Alta en el catalogo. Devuelve `null` si el nombre ya existe (el unique de
 * CMFNombre), para que la UI avise en lugar de romper con un 500.
 */
export async function crearMedicamentoCatalogo(
    data: CrearMedicamentoCatalogoInput,
    usuario: string
): Promise<MedicamentoCatalogoItem | null> {
    try {
        const creado = await prisma.catalogoMedicamentoFacturacion.create({
            data: {
                nombre: data.nombre,
                precio: data.precio ?? null,
                estado: 'A',
                usuario: usuario.trim().slice(0, 10) || 'SISTEMA',
                fechaEstado: new Date(),
            },
            select: { id: true, nombre: true, precio: true },
        })

        return {
            id: creado.id,
            nombre: creado.nombre,
            precio: creado.precio == null ? null : Number(creado.precio),
        }
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return null
        }
        throw error
    }
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
            importe: data.importe ?? null,
            cantidad: data.cantidad,
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
            importe: data.importe ?? null,
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
            // El panel edita solo el texto libre: se repone el bloque meta guardado.
            let observaciones = data.ingreso.observaciones
            if (observaciones !== undefined) {
                const ingresoActual = await tx.ingreso.findUnique({
                    where: { id: ingresoId },
                    select: { observaciones: true },
                })
                observaciones = fusionarObservacionesConMeta(
                    ingresoActual?.observaciones,
                    observaciones
                )
            }

            await tx.ingreso.update({
                where: { id: ingresoId },
                data: {
                    nombre: data.ingreso.nombre,
                    descripcionPatologia: data.ingreso.descripcionPatologia,
                    numeroAfiliado: data.ingreso.numeroAfiliado,
                    observaciones,
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

/**
 * Da al item de una orden su propia Practica.
 *
 * El estado de facturado vive en la practica (`estado='F'` mas un unico puntero
 * puesto/orden/item), asi que mientras varias ordenes compartan el registro no hay
 * donde guardar que una esta facturada y otra no. Una cirugia repartida por rol
 * genera justamente eso: una practica con un item en cada orden.
 *
 * Separa el item indicado en una practica propia con el importe de ese item, le
 * reapunta el OrdenPrac, y deja a la original con lo que le queda (su importe pasa
 * a ser la suma de sus items restantes). Devuelve el id a facturar. Si la practica
 * ya vive en una sola orden no toca nada y devuelve el mismo id.
 */
async function separarItemEnPracticaPropia(
    practicaId: number,
    puestoNumero: number,
    ordenNumero: number,
    item: number
): Promise<number> {
    return prisma.$transaction(async (tx) => {
        const items = await tx.ordenPractica.findMany({
            where: { practicaId },
            select: { puestoNumero: true, ordenNumero: true, item: true, importeTotal: true },
        })
        if (items.length < 2) return practicaId

        const objetivo = items.find(
            (it) =>
                it.puestoNumero === puestoNumero &&
                it.ordenNumero === ordenNumero &&
                it.item === item
        )
        if (!objetivo) return practicaId

        const original = await tx.practica.findUnique({ where: { id: practicaId } })
        if (!original) return practicaId

        const { id: _id, ...campos } = original
        const nueva = await tx.practica.create({
            data: {
                ...campos,
                importeTotal: objetivo.importeTotal,
                // El vinculo lo escribe el circuito de facturacion, no esta separacion.
                puestoNumero: null,
                ordenNumero: null,
                ordenItem: null,
            },
        })

        await tx.ordenPractica.update({
            where: {
                puestoNumero_ordenNumero_item: { puestoNumero, ordenNumero, item },
            },
            data: { practicaId: nueva.id },
        })

        await recalcularImportePracticaDesdeItems(tx, practicaId)

        return nueva.id
    })
}

export async function cargarOrdenesDesdePrestaciones(
    data: CargarOrdenesFacturacionInput,
    usuario: string
): Promise<OrdenFacturacionResultado> {
    void usuario
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
    // Un ingreso sin obra social es un paciente particular, no un dato faltante:
    // la orden se emite igual contra la OS PARTICULAR. Aca el OSID del ingreso no
    // se usa mas abajo, asi que alcanza con no cortar.

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
            },
        })

        const descripcionesNomenclador = await obtenerDescripcionesNomenclador(practicasPendientes)

        prestacionesOrigen = practicasPendientes.map((p) => ({
            practicaId: p.id,
            convenioId: p.convenioId,
            codigoPractica: p.codigoPractica.trim(),
            descripcionPractica:
                descripcionesNomenclador.get(claveNomenclador(p.convenioId, p.codigoPractica)) ??
                p.codigoPractica.trim(),
            cantidad: Number(p.cantidad),
            incluyeCodigo: null,
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

    // Cuando se factura una orden concreta de una practica repartida por rol, esa
    // orden necesita su propia practica: el estado de facturado es uno solo por
    // practica y si no se separa, facturar una marcaria tambien a las otras. Se
    // hace antes de vincular, para que el resto del circuito la trate como
    // cualquier practica de una sola orden.
    for (const prestacion of prestacionesPreparadas) {
        const { practicaId, ordenPuestoNumero, ordenNumero, ordenItem } = prestacion
        if (!practicaId || !ordenPuestoNumero || !ordenNumero || !ordenItem) continue

        prestacion.practicaId = await separarItemEnPracticaPropia(
            practicaId,
            ordenPuestoNumero,
            ordenNumero,
            ordenItem
        )
    }

    const vinculosOrdenExistente = await resolverVinculosOrdenExistenteFacturacion(
        data.ingresoId,
        prestacionesPreparadas.map((p) => ({
            practicaId: p.practicaId,
            convenioId: p.convenioId,
            codigoPractica: p.codigoPractica,
            cantidad: Number(p.cantidad),
            incluyeCodigo: p.incluyeCodigo,
            numeroAutorizacion: p.numeroAutorizacion,
            ordenIndice: p.ordenIndice,
        }))
    )

    const prestacionesConOrdenExistente = prestacionesPreparadas.filter(
        (p) => Boolean(p.practicaId && vinculosOrdenExistente.has(p.practicaId))
    )
    const prestacionesParaGenerarOrden = prestacionesPreparadas.filter(
        (p) => !(p.practicaId && vinculosOrdenExistente.has(p.practicaId))
    )

    // Facturar es todo o nada: si una sola practica del lote no resuelve orden
    // autorizada, la tanda entera se rechaza. Antes este chequeo estaba al final,
    // despues de haber vinculado y recalculado importes de las que si resolvian:
    // el usuario veia el error, volvia a tildar todo y refacturaba, y cada reintento
    // dejaba otra tanda de ordenes escritas a medias. Se valida antes de escribir.
    if (prestacionesParaGenerarOrden.length > 0) {
        const pendientes = Array.from(
            new Set(
                prestacionesParaGenerarOrden.map((p) => {
                    const codigo = p.codigoPractica.trim()
                    const incluye = normalizarIncluyeCodigo(p.incluyeCodigo)
                    return incluye ? `${codigo} [${incluye}]` : codigo
                })
            )
        )
        throw new Error(
            `No se puede facturar sin orden autorizada vinculada para: ${pendientes.join(', ')}.`
        )
    }

    if (prestacionesConOrdenExistente.length > 0) {
        // Facturar no cambia el estado de ninguna orden. Las ordenes se anulan solo
        // desde la ficha de internacion; anular en facturacion se limita a cortar el
        // vinculo para que la practica vuelva a pendientes. Aca antes se revivian
        // (estado X -> A) todas las ordenes anuladas del ingreso que mencionaran
        // alguna de las practicas a facturar: resto de cuando anular la facturacion
        // tambien anulaba la orden. Como una practica puede estar mencionada por
        // varias ordenes, eso resucitaba duplicados y revertia anulaciones hechas a
        // proposito desde internacion.
        const updatesPractica = prestacionesConOrdenExistente.flatMap((prestacion) => {
            const practicaId = prestacion.practicaId as number
            const vinculo = vinculosOrdenExistente.get(practicaId)
            if (!vinculo) return []

            return [
                prisma.practica.update({
                    where: { id: practicaId },
                    data: {
                        puestoNumero: vinculo.puestoNumero,
                        ordenNumero: vinculo.ordenNumero,
                        ordenItem: vinculo.item,
                        estado: 'F',
                    },
                }),
            ]
        })
        if (updatesPractica.length > 0) {
            await prisma.$transaction(updatesPractica)
        }

        const updatesOrdenPractica = prestacionesConOrdenExistente.flatMap((prestacion) => {
            const practicaId = prestacion.practicaId as number
            const vinculo = vinculosOrdenExistente.get(practicaId)
            if (!vinculo) return []

            const modulosCompatibles = expandirModulosCompatibles(prestacion.incluyeCodigo)
            const codigoNormalizado = normalizarCodigoPractica(prestacion.codigoPractica)
            const actualizarPatologia = requiereActualizarPatologiaOrden({
                incluyeCodigo: prestacion.incluyeCodigo,
                codigoPractica: prestacion.codigoPractica,
            })
            const dataPatologia = dataOrdenPracticaPatologia()

            if (modulosCompatibles.length > 1) {
                const ops: Prisma.PrismaPromise<Prisma.BatchPayload>[] = [
                    prisma.ordenPractica.updateMany({
                        where: {
                            puestoNumero: vinculo.puestoNumero,
                            ordenNumero: vinculo.ordenNumero,
                            convenioId: prestacion.convenioId,
                            codigoPractica: { startsWith: codigoNormalizado },
                            modulo: { in: modulosCompatibles },
                            OR: [
                                { practicaId: null },
                                { practicaId },
                            ],
                        },
                        data: { practicaId },
                    }),
                ]

                if (actualizarPatologia) {
                    ops.push(
                        prisma.ordenPractica.updateMany({
                            where: {
                                puestoNumero: vinculo.puestoNumero,
                                ordenNumero: vinculo.ordenNumero,
                                convenioId: prestacion.convenioId,
                                codigoPractica: { startsWith: codigoNormalizado },
                                practicaId,
                                OR: [
                                    { modulo: { contains: 'HE' } },
                                    { modulo: { contains: 'HP' } },
                                    { modulo: null },
                                    { clasificacionAgrupacion: { in: ['HE', 'HP'] } },
                                ],
                            },
                            data: dataPatologia,
                        })
                    )
                }

                return ops
            }

            const ops: Prisma.PrismaPromise<Prisma.BatchPayload>[] = [
                prisma.ordenPractica.updateMany({
                    where: {
                        puestoNumero: vinculo.puestoNumero,
                        ordenNumero: vinculo.ordenNumero,
                        item: vinculo.item,
                        OR: [
                            { practicaId: null },
                            { practicaId },
                        ],
                    },
                    data: { practicaId },
                }),
            ]

            if (actualizarPatologia) {
                ops.push(
                    prisma.ordenPractica.updateMany({
                        where: {
                            puestoNumero: vinculo.puestoNumero,
                            ordenNumero: vinculo.ordenNumero,
                            item: vinculo.item,
                            practicaId,
                            OR: [
                                { modulo: { contains: 'HE' } },
                                { modulo: { contains: 'HP' } },
                                { modulo: null },
                                { clasificacionAgrupacion: { in: ['HE', 'HP'] } },
                            ],
                        },
                        data: dataPatologia,
                    })
                )
            }

            return ops
        })
        if (updatesOrdenPractica.length > 0) {
            await prisma.$transaction(updatesOrdenPractica)
        }

        await prisma.$transaction(async (tx) => {
            const ordenesARecalcular = new Set<string>()
            const redondear2 = (value: number) => Number(value.toFixed(2))

            for (const prestacion of prestacionesConOrdenExistente) {
                const practicaId = prestacion.practicaId as number
                const vinculo = vinculosOrdenExistente.get(practicaId)
                if (!vinculo) continue

                const totalObjetivo = Number(prestacion.importeTotal ?? 0)
                if (!Number.isFinite(totalObjetivo) || totalObjetivo <= 0) continue

                ordenesARecalcular.add(`${vinculo.puestoNumero}:${vinculo.ordenNumero}`)

                const modulosCompatibles = expandirModulosCompatibles(prestacion.incluyeCodigo)
                const codigoNormalizado = normalizarCodigoPractica(prestacion.codigoPractica)

                if (modulosCompatibles.length > 1) {
                    const itemsCompatibles = await tx.ordenPractica.findMany({
                        where: {
                            puestoNumero: vinculo.puestoNumero,
                            ordenNumero: vinculo.ordenNumero,
                            convenioId: prestacion.convenioId,
                            codigoPractica: { startsWith: codigoNormalizado },
                            modulo: { in: modulosCompatibles },
                            practicaId,
                        },
                        select: {
                            item: true,
                            importeTotal: true,
                        },
                        orderBy: { item: 'asc' },
                    })

                    if (itemsCompatibles.length === 0) continue

                    const sumaActual = itemsCompatibles.reduce(
                        (sum, it) => sum + Number(it.importeTotal ?? 0),
                        0
                    )

                    if (sumaActual > 0) {
                        let acumulado = 0
                        for (let i = 0; i < itemsCompatibles.length; i += 1) {
                            const it = itemsCompatibles[i]!
                            const esUltimo = i === itemsCompatibles.length - 1
                            const nuevoImporte = esUltimo
                                ? redondear2(totalObjetivo - acumulado)
                                : redondear2((Number(it.importeTotal ?? 0) / sumaActual) * totalObjetivo)
                            acumulado += nuevoImporte

                            await tx.ordenPractica.updateMany({
                                where: {
                                    puestoNumero: vinculo.puestoNumero,
                                    ordenNumero: vinculo.ordenNumero,
                                    item: it.item,
                                    practicaId,
                                },
                                data: { importeTotal: nuevoImporte },
                            })
                        }
                    } else {
                        const cantidadItems = itemsCompatibles.length
                        let acumulado = 0
                        for (let i = 0; i < itemsCompatibles.length; i += 1) {
                            const it = itemsCompatibles[i]!
                            const esUltimo = i === itemsCompatibles.length - 1
                            const nuevoImporte = esUltimo
                                ? redondear2(totalObjetivo - acumulado)
                                : redondear2(totalObjetivo / cantidadItems)
                            acumulado += nuevoImporte

                            await tx.ordenPractica.updateMany({
                                where: {
                                    puestoNumero: vinculo.puestoNumero,
                                    ordenNumero: vinculo.ordenNumero,
                                    item: it.item,
                                    practicaId,
                                },
                                data: { importeTotal: nuevoImporte },
                            })
                        }
                    }

                    continue
                }

                await tx.ordenPractica.updateMany({
                    where: {
                        puestoNumero: vinculo.puestoNumero,
                        ordenNumero: vinculo.ordenNumero,
                        item: vinculo.item,
                        practicaId,
                    },
                    data: { importeTotal: totalObjetivo },
                })
            }

            for (const key of ordenesARecalcular) {
                const [puestoStr, numeroStr] = key.split(':')
                const puestoNumero = Number(puestoStr)
                const ordenNumero = Number(numeroStr)
                if (!Number.isFinite(puestoNumero) || !Number.isFinite(ordenNumero)) continue

                const orden = await tx.orden.findUnique({
                    where: { puestoNumero_numero: { puestoNumero, numero: ordenNumero } },
                    select: { items: { select: { importeTotal: true } } },
                })
                if (!orden) continue

                const total = orden.items.reduce((sum, it) => sum + Number(it.importeTotal ?? 0), 0)
                await tx.orden.update({
                    where: { puestoNumero_numero: { puestoNumero, numero: ordenNumero } },
                    data: { importeTotal: total },
                })
            }
        })
    }

    const entradasOrdenesVinculadas: Array<[string, { puestoNumero: number; numero: number }]> = []
    for (const prestacion of prestacionesConOrdenExistente) {
        const practicaId = prestacion.practicaId as number
        const vinculo = vinculosOrdenExistente.get(practicaId)
        if (!vinculo) continue
        entradasOrdenesVinculadas.push([
            `${vinculo.puestoNumero}:${vinculo.ordenNumero}`,
            { puestoNumero: vinculo.puestoNumero, numero: vinculo.ordenNumero },
        ])
    }

    const ordenesVinculadas = Array.from(
        new Map(entradasOrdenesVinculadas).values()
    )

    return {
        modo: data.modo,
        ordenes: ordenesVinculadas,
    }
}

export async function actualizarNumeroAutorizacion(
    data: ActualizarAutorizacionInput
): Promise<void> {
    const numeroAutorizacion =
        typeof data.numeroAutorizacion === 'string' && data.numeroAutorizacion.trim().length > 0
            ? data.numeroAutorizacion.trim()
            : null

    if (data.tipo === 'PRACTICA') {
        await prisma.practica.update({
            where: { id: data.practicaId },
            data: { numeroAutorizacion },
        })
        return
    }

    if (data.tipo === 'ORDEN') {
        await prisma.$transaction(async (tx) => {
            await tx.orden.update({
                where: {
                    puestoNumero_numero: {
                        puestoNumero: data.puestoNumero,
                        numero: data.ordenNumero,
                    },
                },
                data: {
                    numeroAutorizacion,
                    estado: numeroAutorizacion ? 'A' : undefined,
                    fechaEstado: numeroAutorizacion ? new Date() : undefined,
                },
            })

            await tx.ordenPractica.updateMany({
                where: {
                    puestoNumero: data.puestoNumero,
                    ordenNumero: data.ordenNumero,
                },
                data: { numeroAutorizacion },
            })

            const itemsOrden = await tx.ordenPractica.findMany({
                where: {
                    puestoNumero: data.puestoNumero,
                    ordenNumero: data.ordenNumero,
                    practicaId: { not: null },
                },
                select: { practicaId: true },
            })

            const practicaIds = Array.from(
                new Set(
                    itemsOrden
                        .map((item) => item.practicaId)
                        .filter((id): id is number => typeof id === 'number')
                )
            )

            if (practicaIds.length > 0) {
                await tx.practica.updateMany({
                    where: { id: { in: practicaIds } },
                    data: { numeroAutorizacion },
                })
            }
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
        data: { numeroAutorizacion },
    })
}

async function resolverPracticaDesdeInput(
    codigoPractica: string,
    descripcionPractica: string | null | undefined,
    convenioIdActual: number
): Promise<{ convenioId: number; codigoPractica: string }> {
    const codigo = codigoPractica.trim().slice(0, 8)
    const candidatosCodigo = await prisma.nomencladorPractica.findMany({
        where: {
            convenioId: convenioIdActual,
            codigo: { startsWith: codigo },
        },
        select: { convenioId: true, codigo: true },
    })
    const codigoNormalizado = normalizarCodigoPractica(codigo)
    const exacto = candidatosCodigo.find(
        (c) => normalizarCodigoPractica(c.codigo) === codigoNormalizado
    )
    if (exacto) return { convenioId: exacto.convenioId, codigoPractica: exacto.codigo.trim() }
    if (candidatosCodigo.length === 1) {
        const unico = candidatosCodigo[0]
        if (!unico) return { convenioId: convenioIdActual, codigoPractica: codigo }
        return { convenioId: unico.convenioId, codigoPractica: unico.codigo.trim() }
    }

    if (descripcionPractica?.trim()) {
        const porDescripcionConvenioActual = await prisma.nomencladorPractica.findFirst({
            where: {
                convenioId: convenioIdActual,
                descripcion: { contains: descripcionPractica.trim(), mode: 'insensitive' },
            },
            select: { convenioId: true, codigo: true },
            orderBy: [{ codigo: 'asc' }],
        })
        if (porDescripcionConvenioActual) {
            return {
                convenioId: porDescripcionConvenioActual.convenioId,
                codigoPractica: porDescripcionConvenioActual.codigo.trim(),
            }
        }

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

// Baja logica: se marca 'X' (anulada), no 'S'. 'S' es suspension clinica y hay
// vistas que la muestran a proposito (orden/repository levanta A y S). No se borra
// la fila para no perder el rastro de lo que se habia cargado.
export async function eliminarPrestacionFacturacion(
    data: EliminarPrestacionFacturacionInput,
    usuario: string
): Promise<void> {
    const comun = {
        estado: 'X',
        usuario: usuario.trim().slice(0, 10) || 'SISTEMA',
        fechaEstado: new Date(),
    }

    if (data.tipo === 'MEDICACION') {
        await prisma.medicacionIngreso.update({
            where: { id: data.medicacionId },
            data: comun,
        })
        return
    }

    await prisma.descartableIngreso.update({
        where: { id: data.descartableId },
        data: comun,
    })
}

export async function actualizarPrestacionFacturacion(
    data: ActualizarPrestacionFacturacionInput
): Promise<void> {
    if (data.tipo === 'MEDICACION') {
        // El importe llega total y se guarda unitario, igual que el descartable.
        const cantidadMedicacion = data.cantidad > 0 ? data.cantidad : 1
        await prisma.medicacionIngreso.update({
            where: { id: data.medicacionId },
            data: {
                fechaInicio: data.fecha,
                cantidad: Math.round(cantidadMedicacion),
                importe: Number((data.importeTotal / cantidadMedicacion).toFixed(2)),
            },
        })
        return
    }

    if (data.tipo === 'DESCARTABLE') {
        // El importe se guarda unitario: la grilla muestra unitario x cantidad.
        const cantidad = data.cantidad > 0 ? data.cantidad : 1
        await prisma.descartableIngreso.update({
            where: { id: data.descartableId },
            data: {
                fechaInicio: data.fecha,
                cantidad: Math.round(cantidad),
                importe: Number((data.importeTotal / cantidad).toFixed(2)),
            },
        })
        return
    }

    if ((data.tipo === 'ORDEN' || data.tipo === 'ORDEN_ITEM') && data.loteId) {
        const orden = await prisma.orden.findUnique({
            where: {
                puestoNumero_numero: {
                    puestoNumero: data.puestoNumero,
                    numero: data.ordenNumero,
                },
            },
            select: { ingresoId: true },
        })
        const itemLote = orden?.ingresoId
            ? await prisma.loteFacturacionItem.findFirst({
                where: {
                    loteId: data.loteId,
                    ingresoId: orden.ingresoId,
                },
                select: {
                    id: true,
                    lote: {
                        select: { estado: true },
                    },
                },
            })
            : null

        if (!itemLote || !puedeEditarPrestacionEnLote(itemLote.lote.estado)) {
            throw new Error('Sólo se pueden editar órdenes de un lote pendiente')
        }
    }

    if (data.tipo === 'ORDEN') {
        const orden = await prisma.orden.findUnique({
            where: {
                puestoNumero_numero: {
                    puestoNumero: data.puestoNumero,
                    numero: data.ordenNumero,
                },
            },
            select: { ingresoId: true },
        })
        if (!orden) throw new Error('Orden no encontrada')

        await prisma.$transaction(async (tx) => {
            await tx.orden.update({
                where: {
                    puestoNumero_numero: {
                        puestoNumero: data.puestoNumero,
                        numero: data.ordenNumero,
                    },
                },
                data: {
                    fechaEmision: data.fechaEmision,
                    descripcion: data.descripcion ?? null,
                    numeroAutorizacion: data.numeroAutorizacion ?? null,
                },
            })

            // Solo pisa el efector de todos los items si vino explicito en el payload.
            if (data.matriculaEjecutante != null) {
                await tx.ordenPractica.updateMany({
                    where: {
                        puestoNumero: data.puestoNumero,
                        ordenNumero: data.ordenNumero,
                    },
                    data: { efectorMatricula: data.matriculaEjecutante },
                })
            }

            if (data.matriculaProfesional != null) {
                const profesional = await tx.profesional.findFirst({
                    where: { matricula: data.matriculaProfesional },
                    orderBy: { id: 'asc' },
                    select: { id: true },
                })

                if (!profesional) {
                    throw new Error(
                        `No hay un profesional cargado con la matricula ${data.matriculaProfesional}`
                    )
                }

                await tx.orden.update({
                    where: {
                        puestoNumero_numero: {
                            puestoNumero: data.puestoNumero,
                            numero: data.ordenNumero,
                        },
                    },
                    data: { profesionalId: profesional.id },
                })
            }
        })

        if (orden.ingresoId) {
            await recalcularTotalesLotesPendientesPracticasPorIngreso(orden.ingresoId)
        }
        return
    }

    const incluyeCodigoNormalizado = normalizarIncluyeCodigo(data.incluyeCodigo)
    const incluyeSeleccion = desglosarIncluyeCodigo(incluyeCodigoNormalizado)
    const esPatologia = Boolean(
        incluyeSeleccion?.patologia || esCodigoPatologiaPorDefecto(data.codigoPractica)
    )
    const matriculaEspecialistaFinal = resolverMatriculaEspecialistaPorPatologia(
        data.matriculaEspecialista ?? null,
        incluyeSeleccion,
        data.codigoPractica
    )

    if (data.tipo === 'PRACTICA') {
        const aplicarOrdenCompleta = Boolean(data.aplicarOrdenCompleta)
        const actual = await prisma.practica.findUnique({
            where: { id: data.practicaId },
            select: {
                convenioId: true,
                cantidad: true,
                importeTotal: true,
                puestoNumero: true,
                ordenNumero: true,
                ordenItem: true,
            },
        })
        if (!actual) throw new Error('Práctica no encontrada')

        // Repartida entre varias ordenes: el importe de cada una se edita en su
        // propia fila. Desde aca no se toca ninguno, o el reparto se pierde.
        const practicaRepartida =
            (await prisma.ordenPractica.count({ where: { practicaId: data.practicaId } })) > 1

        const resolved = await resolverPracticaDesdeInput(
            data.codigoPractica,
            data.descripcionPractica,
            actual.convenioId
        )
        const importeTotalFinal = resolverImporteTotalTrasEdicion({
            cantidadAnterior: Number(actual.cantidad),
            importeAnterior: Number(actual.importeTotal ?? 0),
            cantidadNueva: data.cantidad,
            importeEnviado: data.importeTotal,
        })

        let ingresoIdParaRecalculo: number | null = null

        await prisma.$transaction(async (tx) => {
            let ordenItemVinculado: {
                puestoNumero: number
                ordenNumero: number
                item: number
                numeroAutorizacion: string | null
                orden: {
                    ingresoId: number | null
                    numeroAutorizacion: string | null
                }
            } | null = null

            if (actual.puestoNumero && actual.ordenNumero && actual.ordenItem) {
                ordenItemVinculado = await tx.ordenPractica.findUnique({
                    where: {
                        puestoNumero_ordenNumero_item: {
                            puestoNumero: actual.puestoNumero,
                            ordenNumero: actual.ordenNumero,
                            item: actual.ordenItem,
                        },
                    },
                    select: {
                        puestoNumero: true,
                        ordenNumero: true,
                        item: true,
                        numeroAutorizacion: true,
                        orden: {
                            select: {
                                ingresoId: true,
                                numeroAutorizacion: true,
                            },
                        },
                    },
                })
            }

            if (!ordenItemVinculado) {
                ordenItemVinculado = await tx.ordenPractica.findFirst({
                    where: { practicaId: data.practicaId },
                    orderBy: [{ fecha: 'desc' }],
                    select: {
                        puestoNumero: true,
                        ordenNumero: true,
                        item: true,
                        numeroAutorizacion: true,
                        orden: {
                            select: {
                                ingresoId: true,
                                numeroAutorizacion: true,
                            },
                        },
                    },
                })
            }

            let ordenPuestoNumeroObjetivo =
                data.ordenPuestoNumero ??
                actual.puestoNumero ??
                ordenItemVinculado?.puestoNumero ??
                null
            let ordenNumeroObjetivo =
                data.ordenNumero ??
                actual.ordenNumero ??
                ordenItemVinculado?.ordenNumero ??
                null

            const usarActualizacionGlobal =
                aplicarOrdenCompleta && Boolean(ordenPuestoNumeroObjetivo && ordenNumeroObjetivo)

            if (aplicarOrdenCompleta && !usarActualizacionGlobal) {
                throw new Error('No se pudo determinar la orden para aplicar edición global')
            }

            const numeroAutorizacionOrden =
                data.numeroAutorizacion?.trim()
                    ? data.numeroAutorizacion.trim().slice(0, 15)
                    : null

            const conservarRepartoPractica = practicaRepartida && !usarActualizacionGlobal

            const dataPractica: Prisma.PracticaUncheckedUpdateManyInput = {
                fecha: data.fecha,
                convenioId: resolved.convenioId,
                codigoPractica: resolved.codigoPractica.trim(),
                cantidad: data.cantidad,
                numeroAutorizacion: data.numeroAutorizacion ?? null,
                // Repartida: el total sale de la suma de los items, mas abajo, y la
                // matricula vive en cada OrdenPrac. La Practica tiene una sola para
                // todas las ordenes: bajarla aca pisaba al profesional de las otras
                // (cambiar el ayudante dejaba al anestesista con esa matricula).
                ...(conservarRepartoPractica
                    ? {}
                    : {
                        importeTotal: importeTotalFinal,
                        matriculaEspecialista: matriculaEspecialistaFinal,
                        matriculaAnestesista: data.matriculaAnestesista ?? null,
                    }),
            }

            if (usarActualizacionGlobal && ordenPuestoNumeroObjetivo && ordenNumeroObjetivo) {
                const practicaIdsGlobal = new Set<number>([data.practicaId])

                const practicasConOrdenExplicita = await tx.practica.findMany({
                    where: {
                        puestoNumero: ordenPuestoNumeroObjetivo,
                        ordenNumero: ordenNumeroObjetivo,
                    },
                    select: { id: true },
                })
                for (const pr of practicasConOrdenExplicita) {
                    practicaIdsGlobal.add(pr.id)
                }

                const practicasVinculadasPorItem = await tx.ordenPractica.findMany({
                    where: {
                        puestoNumero: ordenPuestoNumeroObjetivo,
                        ordenNumero: ordenNumeroObjetivo,
                        practicaId: { not: null },
                    },
                    select: { practicaId: true },
                })
                for (const it of practicasVinculadasPorItem) {
                    if (typeof it.practicaId === 'number') {
                        practicaIdsGlobal.add(it.practicaId)
                    }
                }

                await tx.practica.updateMany({
                    where: {
                        id: { in: Array.from(practicaIdsGlobal) },
                    },
                    data: dataPractica,
                })
            } else {
                await tx.practica.update({
                    where: { id: data.practicaId },
                    data: dataPractica,
                })
            }

            if (ordenPuestoNumeroObjetivo && ordenNumeroObjetivo) {
                const codigoResueltoNormalizado = normalizarCodigoPractica(resolved.codigoPractica)

                if (esPatologia && !usarActualizacionGlobal) {
                    await tx.ordenPractica.updateMany({
                        where: {
                            puestoNumero: ordenPuestoNumeroObjetivo,
                            ordenNumero: ordenNumeroObjetivo,
                            codigoPractica: { startsWith: codigoResueltoNormalizado },
                        },
                        data: {
                            modulo: 'HP',
                            clasificacionAgrupacion: 'HP',
                            titularModular: 'HONORARIO PATOLOGO',
                            efectorMatricula: MATRICULA_PATOLOGIA_DEFAULT,
                        },
                    })
                }

                const ordenCabecera = await tx.orden.findUnique({
                    where: {
                        puestoNumero_numero: {
                            puestoNumero: ordenPuestoNumeroObjetivo,
                            numero: ordenNumeroObjetivo,
                        },
                    },
                    select: {
                        ingresoId: true,
                        numeroAutorizacion: true,
                    },
                })

                if (ordenCabecera) {
                    const itemsObjetivo = usarActualizacionGlobal
                        ? await tx.ordenPractica.findMany({
                            where: {
                                puestoNumero: ordenPuestoNumeroObjetivo,
                                ordenNumero: ordenNumeroObjetivo,
                            },
                            select: {
                                item: true,
                                numeroAutorizacion: true,
                            },
                            orderBy: [{ item: 'asc' }],
                        })
                        : (ordenItemVinculado
                            ? [{
                                item: ordenItemVinculado.item,
                                numeroAutorizacion: ordenItemVinculado.numeroAutorizacion,
                            }]
                            : [])

                    let actualizarImportesOrden = false

                    for (const itemObjetivo of itemsObjetivo) {
                        const dataOrdenPractica: Prisma.OrdenPracticaUncheckedUpdateInput = {
                            modulo: incluyeCodigoNormalizado,
                            clasificacionAgrupacion: esPatologia ? 'HP' : null,
                            titularModular: esPatologia ? 'HONORARIO PATOLOGO' : null,
                            efectorMatricula: esPatologia
                                ? MATRICULA_PATOLOGIA_DEFAULT
                                : (data.matriculaEspecialista ?? undefined),
                            fecha: data.fecha,
                            convenioId: resolved.convenioId,
                            codigoPractica: resolved.codigoPractica.trim(),
                            cantidad: data.cantidad,
                            numeroAutorizacion: numeroAutorizacionOrden,
                            // Repartida: cada orden conserva su parte; el importe de
                            // cada item se edita desde la fila de esa orden.
                            ...(conservarRepartoPractica ? {} : { importeTotal: importeTotalFinal }),
                        }
                        actualizarImportesOrden = true

                        await tx.ordenPractica.update({
                            where: {
                                puestoNumero_ordenNumero_item: {
                                    puestoNumero: ordenPuestoNumeroObjetivo,
                                    ordenNumero: ordenNumeroObjetivo,
                                    item: itemObjetivo.item,
                                },
                            },
                            data: dataOrdenPractica,
                        })
                    }

                    if (data.matriculaProfesional) {
                        const profesional = await tx.profesional.findFirst({
                            where: { matricula: data.matriculaProfesional },
                            select: { id: true },
                        })

                        if (profesional) {
                            await tx.orden.update({
                                where: {
                                    puestoNumero_numero: {
                                        puestoNumero: ordenPuestoNumeroObjetivo,
                                        numero: ordenNumeroObjetivo,
                                    },
                                },
                                data: { profesionalId: profesional.id },
                            })
                        }
                    }

                    if (conservarRepartoPractica) {
                        await recalcularImportePracticaDesdeItems(tx, data.practicaId)
                    }

                    if (actualizarImportesOrden) {
                        const itemsOrden = await tx.ordenPractica.findMany({
                            where: {
                                puestoNumero: ordenPuestoNumeroObjetivo,
                                ordenNumero: ordenNumeroObjetivo,
                            },
                            select: { importeTotal: true },
                        })
                        const total = itemsOrden.reduce((sum, it) => sum + Number(it.importeTotal ?? 0), 0)
                        await tx.orden.update({
                            where: {
                                puestoNumero_numero: {
                                    puestoNumero: ordenPuestoNumeroObjetivo,
                                    numero: ordenNumeroObjetivo,
                                },
                            },
                            data: { importeTotal: total },
                        })
                        ingresoIdParaRecalculo = ordenCabecera.ingresoId
                    }
                }
            }
        })

        if (ingresoIdParaRecalculo) {
            await recalcularTotalesLotesPendientesPracticasPorIngreso(ingresoIdParaRecalculo)
        }
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
        select: {
            convenioId: true,
            numeroAutorizacion: true,
            cantidad: true,
            importeTotal: true,
            practicaId: true,
        },
    })
    if (!actualItem) throw new Error('Ítem de orden no encontrado')

    // Si la practica esta repartida en varias ordenes, el importe editado vale
    // solo para este item: la practica se recalcula sumando todos.
    const itemsDeLaPractica = actualItem.practicaId != null
        ? await prisma.ordenPractica.count({ where: { practicaId: actualItem.practicaId } })
        : 0
    const practicaRepartida = itemsDeLaPractica > 1

    const resolved = await resolverPracticaDesdeInput(
        data.codigoPractica,
        data.descripcionPractica,
        actualItem.convenioId
    )
    const importeTotalFinal = resolverImporteTotalTrasEdicion({
        cantidadAnterior: Number(actualItem.cantidad),
        importeAnterior: Number(actualItem.importeTotal ?? 0),
        cantidadNueva: data.cantidad,
        importeEnviado: data.importeTotal,
    })

    const aplicarOrdenCompleta = Boolean(data.aplicarOrdenCompleta)
    let ingresoIdParaRecalculo: number | null = null

    await prisma.$transaction(async (tx) => {
        const ordenCabecera = await tx.orden.findUnique({
            where: {
                puestoNumero_numero: {
                    puestoNumero: data.puestoNumero,
                    numero: data.ordenNumero,
                },
            },
            select: {
                ingresoId: true,
                numeroAutorizacion: true,
            },
        })

        if (!ordenCabecera) {
            throw new Error('Orden no encontrada')
        }

        if (aplicarOrdenCompleta) {
            const practicaIdsGlobal = new Set<number>()

            const practicasConOrdenExplicita = await tx.practica.findMany({
                where: {
                    puestoNumero: data.puestoNumero,
                    ordenNumero: data.ordenNumero,
                },
                select: { id: true },
            })
            for (const pr of practicasConOrdenExplicita) {
                practicaIdsGlobal.add(pr.id)
            }

            const practicasVinculadasPorItem = await tx.ordenPractica.findMany({
                where: {
                    puestoNumero: data.puestoNumero,
                    ordenNumero: data.ordenNumero,
                    practicaId: { not: null },
                },
                select: { practicaId: true },
            })
            for (const it of practicasVinculadasPorItem) {
                if (typeof it.practicaId === 'number') {
                    practicaIdsGlobal.add(it.practicaId)
                }
            }

            await tx.practica.updateMany({
                where: {
                    id: { in: Array.from(practicaIdsGlobal) },
                },
                data: {
                    fecha: data.fecha,
                    convenioId: resolved.convenioId,
                    codigoPractica: resolved.codigoPractica.trim(),
                    cantidad: data.cantidad,
                    numeroAutorizacion: data.numeroAutorizacion ?? null,
                    importeTotal: importeTotalFinal,
                    matriculaEspecialista: matriculaEspecialistaFinal,
                    matriculaAnestesista: data.matriculaAnestesista ?? null,
                },
            })
        } else if (actualItem.practicaId != null) {
            // Editar un subitem desde facturacion tambien baja el cambio a SU
            // practica vinculada. Facturacion es la fuente de verdad del importe:
            // si no se propaga, la practica queda con el valor viejo y la
            // diferencia no la ve nadie. Antes esto solo pasaba con
            // `aplicarOrdenCompleta`, que ademas pisaba TODAS las practicas de la
            // orden, asi que en la practica nunca se usaba.
            await tx.practica.update({
                where: { id: actualItem.practicaId },
                data: {
                    fecha: data.fecha,
                    convenioId: resolved.convenioId,
                    codigoPractica: resolved.codigoPractica.trim(),
                    cantidad: data.cantidad,
                    numeroAutorizacion: data.numeroAutorizacion ?? null,
                    // Repartida: el importe sale de la suma de los items, mas abajo,
                    // y la matricula queda en cada item. La Practica tiene una sola
                    // y bajarla aca pisaba el efector que ven las demas ordenes:
                    // cambiar el ayudante de una dejaba al especialista y a gastos
                    // mostrando esa misma matricula.
                    ...(practicaRepartida
                        ? {}
                        : {
                            importeTotal: importeTotalFinal,
                            matriculaEspecialista: matriculaEspecialistaFinal,
                            matriculaAnestesista: data.matriculaAnestesista ?? null,
                        }),
                },
            })
        }

        const itemsObjetivo = aplicarOrdenCompleta
            ? await tx.ordenPractica.findMany({
                where: {
                    puestoNumero: data.puestoNumero,
                    ordenNumero: data.ordenNumero,
                },
                select: {
                    item: true,
                    numeroAutorizacion: true,
                },
                orderBy: [{ item: 'asc' }],
            })
            : [{ item: data.item, numeroAutorizacion: actualItem.numeroAutorizacion }]

        let actualizarImportesOrden = false

        for (const itemObjetivo of itemsObjetivo) {
            const dataOrdenPractica: Prisma.OrdenPracticaUncheckedUpdateInput = {
                modulo: data.modulo ?? incluyeCodigoNormalizado,
                clasificacionAgrupacion: esPatologia ? 'HP' : null,
                titularModular: esPatologia ? 'HONORARIO PATOLOGO' : null,
                efectorMatricula: esPatologia
                    ? MATRICULA_PATOLOGIA_DEFAULT
                    : (data.matriculaEjecutante !== undefined
                        ? data.matriculaEjecutante
                        : (data.matriculaEspecialista ?? undefined)),
                fecha: data.fecha,
                convenioId: resolved.convenioId,
                codigoPractica: resolved.codigoPractica.trim(),
                cantidad: data.cantidad,
                numeroAutorizacion: data.numeroAutorizacion ?? null,
                importeTotal: importeTotalFinal,
            }
            actualizarImportesOrden = true

            await tx.ordenPractica.update({
                where: {
                    puestoNumero_ordenNumero_item: {
                        puestoNumero: data.puestoNumero,
                        ordenNumero: data.ordenNumero,
                        item: itemObjetivo.item,
                    },
                },
                data: dataOrdenPractica,
            })
        }

        if (practicaRepartida && actualItem.practicaId != null) {
            await recalcularImportePracticaDesdeItems(tx, actualItem.practicaId)
        }

        if (data.matriculaProfesional) {
            const profesional = await tx.profesional.findFirst({
                where: { matricula: data.matriculaProfesional },
                select: { id: true },
            })
            if (profesional) {
                await tx.orden.update({
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

        if (actualizarImportesOrden) {
            const itemsOrden = await tx.ordenPractica.findMany({
                where: {
                    puestoNumero: data.puestoNumero,
                    ordenNumero: data.ordenNumero,
                },
                select: { importeTotal: true },
            })

            const total = itemsOrden.reduce((sum, it) => sum + Number(it.importeTotal ?? 0), 0)
            await tx.orden.update({
                where: {
                    puestoNumero_numero: {
                        puestoNumero: data.puestoNumero,
                        numero: data.ordenNumero,
                    },
                },
                data: { importeTotal: total },
            })

            ingresoIdParaRecalculo = ordenCabecera.ingresoId
        }
    })

    if (ingresoIdParaRecalculo) {
        await recalcularTotalesLotesPendientesPracticasPorIngreso(ingresoIdParaRecalculo)
    }
}

async function recalcularTotalesLotesPendientesPracticasPorIngreso(ingresoId: number): Promise<void> {
    const itemsPendientes = await prisma.loteFacturacionItem.findMany({
        where: {
            ingresoId,
            lote: {
                estado: 'PEN',
                tipo: 'PRACTICAS',
            },
        },
        select: {
            loteId: true,
        },
    })

    if (itemsPendientes.length === 0) return

    const loteIds = Array.from(new Set(itemsPendientes.map((item) => item.loteId)))
    for (const loteId of loteIds) {
        await recalcularImportesLoteConExclusiones(loteId)
    }
}

export async function actualizarDiferencialesCirugiaFacturacion(
    data: ActualizarDiferencialesCirugiaFacturacionInput
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const cirugia = await tx.cirugiaProgramada.findFirst({
            where: {
                id: data.cirugiaProgramadaId,
                internacionId: data.ingresoId,
            },
            select: {
                id: true,
                fechaCirugia: true,
                practicas: {
                    select: {
                        codigo: true,
                        cantidad: true,
                    },
                },
            },
        })

        if (!cirugia) {
            throw new Error('Cirugía no encontrada para el ingreso indicado')
        }

        if (data.dobleCirugia && cirugia.practicas.length < 2) {
            throw new Error('Doble cirugía requiere al menos 2 prácticas quirúrgicas en la cirugía')
        }

        if (data.dobleCirugia && !data.practicaBaseId) {
            throw new Error('Debe seleccionar la práctica principal para usar doble cirugía')
        }

        if (data.dobleCirugia && !data.practicaSecundariaId) {
            throw new Error('Debe seleccionar la cirugía secundaria para usar doble cirugía')
        }

        if (
            data.dobleCirugia &&
            data.practicaBaseId &&
            data.practicaSecundariaId &&
            data.practicaBaseId === data.practicaSecundariaId
        ) {
            throw new Error('La cirugía principal y secundaria deben ser prácticas distintas')
        }

        // Repartir por unidades solo tiene sentido si la practica quirurgica
        // trae cantidad: con cantidad 2 se puede dejar una al 100% y mandar la
        // otra al diferencial, con cantidad 1 no hay nada que repartir.
        if (data.unidadesConDiferencial != null && data.unidadesConDiferencial > 0) {
            if (data.dobleCirugia) {
                throw new Error(
                    'Doble cirugía reparte entre dos prácticas distintas: no se combina con el reparto por cantidad'
                )
            }

            const cantidadQuirurgicaMaxima = cirugia.practicas
                .filter((practica) => !esCodigoAccesorioCirugia(practica.codigo))
                .reduce((maxima, practica) => Math.max(maxima, Number(practica.cantidad) || 0), 0)

            if (cantidadQuirurgicaMaxima < 2) {
                throw new Error(
                    'La práctica quirúrgica de esta cirugía tiene cantidad 1: no hay unidades para repartir'
                )
            }

            if (data.unidadesConDiferencial >= cantidadQuirurgicaMaxima) {
                throw new Error(
                    `Al menos una unidad tiene que facturarse al 100%: como máximo ${cantidadQuirurgicaMaxima - 1} con diferencial`
                )
            }
        }

        const validarPracticaEnCirugia = async (
            practicaId: number,
            etiqueta: 'principal' | 'secundaria'
        ) => {
            const practica = await tx.practica.findFirst({
                where: {
                    id: practicaId,
                    ingresoId: data.ingresoId,
                },
                select: {
                    id: true,
                    codigoPractica: true,
                    cantidad: true,
                    fecha: true,
                },
            })

            if (!practica) {
                throw new Error(`La práctica ${etiqueta} seleccionada no pertenece al ingreso`)
            }

            const clavesCirugia = new Set(
                cirugia.practicas.map((p) =>
                    claveCirugiaPractica(p.codigo, Number(p.cantidad), cirugia.fechaCirugia)
                )
            )
            const clavePractica = claveCirugiaPractica(
                practica.codigoPractica,
                Number(practica.cantidad),
                practica.fecha
            )

            const coincideExacto = clavesCirugia.has(clavePractica)
            const coincidePorCodigoCantidad = (() => {
                if (coincideExacto) return true

                const claveSinFecha = claveCirugiaPracticaSinFecha(
                    practica.codigoPractica,
                    Number(practica.cantidad)
                )
                return cirugia.practicas.some(
                    (p) =>
                        claveCirugiaPracticaSinFecha(p.codigo, Number(p.cantidad)) === claveSinFecha
                )
            })()

            if (!coincidePorCodigoCantidad) {
                throw new Error(`La práctica ${etiqueta} seleccionada no corresponde a la cirugía indicada`)
            }
        }

        if (data.practicaBaseId) {
            await validarPracticaEnCirugia(data.practicaBaseId, 'principal')
        }

        if (data.practicaSecundariaId) {
            await validarPracticaEnCirugia(data.practicaSecundariaId, 'secundaria')
        }

        const payload = {
            descripcion: buildDescripcionDiferencialCirugiaFacturacion(
                data.dobleCirugia ? (data.practicaSecundariaId ?? null) : null
            ),
            esFeriado: data.esFeriado,
            esNocturna: data.esNocturna,
            mismaViaPatologia: data.mismaViaPatologia,
            mismaViaMismaPatologia: data.mismaViaMismaPatologia,
            diferentesViasPatologia: data.diferentesViasPatologia,
            diferentesViasDiferentesPatologia: data.diferentesViasDiferentesPatologia,
            dobleCirugia: data.dobleCirugia,
            // Sin doble cirugia la practica base ya no es descartable: identifica
            // la practica quirurgica a la que se le suma el feriado / nocturna.
            practicaBaseId: data.practicaBaseId ?? null,
            // Solo aplica cuando la cirugia multiple viene como cantidad de una
            // sola practica. Con doble cirugia hay dos practicas distintas y el
            // reparto lo resuelve practicaSecundariaId.
            unidadesConDiferencial: data.dobleCirugia
                ? null
                : (data.unidadesConDiferencial ?? null),
        }

        const existentes = await tx.cirugiaDiferencial.count({
            where: { cirugiaId: cirugia.id },
        })

        if (existentes === 0) {
            await tx.cirugiaDiferencial.create({
                data: {
                    cirugiaId: cirugia.id,
                    tipo: 'QUIRURGICA',
                    ...payload,
                },
            })
            return
        }

        await tx.cirugiaDiferencial.updateMany({
            where: { cirugiaId: cirugia.id },
            data: payload,
        })
    })
}

/**
 * Anula la FACTURACION de una orden: desvincula sus practicas y las devuelve a
 * pendientes, dejando la orden intacta.
 *
 * Antes esto anulaba la orden (`estado: 'X'`) y ademas marcaba las practicas como
 * anuladas. Eso tenia dos efectos no deseados:
 *
 * 1. La orden desaparecia de ambulatorio (pasaba a la solapa "anuladas") aunque
 *    seguia siendo una autorizacion valida.
 * 2. Si una practica estaba vinculada a varias ordenes activas, anularla las
 *    vaciaba a todas de golpe.
 *
 * Ahora solo se corta el vinculo de facturacion: la orden sigue vigente y las
 * practicas vuelven a aparecer como pendientes, listas para refacturar.
 */
export async function anularOrdenFacturacion(
    puestoNumero: number,
    numero: number
): Promise<{ practicasDevueltas: number }> {
    return prisma.$transaction(async (tx) => {
        const [practicasExplicitas, practicasPorOrdenItem] = await Promise.all([
            tx.practica.findMany({
                where: { puestoNumero, ordenNumero: numero },
                select: { id: true },
            }),
            tx.ordenPractica.findMany({
                where: {
                    puestoNumero,
                    ordenNumero: numero,
                    practicaId: { not: null },
                },
                select: { practicaId: true },
            }),
        ])

        const practicaIds = Array.from(
            new Set([
                ...practicasExplicitas.map((p) => p.id),
                ...practicasPorOrdenItem
                    .map((item) => item.practicaId)
                    .filter((id): id is number => typeof id === 'number'),
            ])
        )

        if (practicaIds.length === 0) return { practicasDevueltas: 0 }

        // Se corta el vinculo puesto/orden/item y se vuelve al estado activo: asi
        // `practicaFacturada` da false y la practica reaparece en pendientes. El
        // vinculo por OrdenPractica.practicaId se conserva para que al refacturar
        // se reenganche con la misma orden.
        const resultado = await tx.practica.updateMany({
            where: { id: { in: practicaIds } },
            data: { puestoNumero: null, ordenNumero: null, ordenItem: null, estado: 'A' },
        })

        return { practicasDevueltas: resultado.count }
    })
}

export async function crearOrdenDesdePracticaFacturacion(
    data: CrearOrdenDesdePracticaFacturacionInput,
    usuario: string
): Promise<{ puestoNumero: number; numero: number }> {
    const practica = await prisma.practica.findUnique({
        where: { id: data.practicaId },
        select: {
            id: true,
            ingresoId: true,
            convenioId: true,
            codigoPractica: true,
            cantidad: true,
            fecha: true,
            numeroAutorizacion: true,
            importeTotal: true,
            puestoNumero: true,
            ordenNumero: true,
            ordenItem: true,
            nomencladorPractica: { select: { descripcion: true } },
        },
    })

    if (!practica) throw new Error('Práctica no encontrada')
    if (practica.ingresoId !== data.ingresoId) {
        throw new Error('La práctica no pertenece al ingreso seleccionado')
    }
    if (practica.puestoNumero && practica.ordenNumero) {
        throw new Error('La práctica ya tiene una orden vinculada')
    }

    const ingreso = await prisma.ingreso.findUnique({
        where: { id: data.ingresoId },
        select: {
            id: true,
            pacienteId: true,
            nombre: true,
            numeroAfiliado: true,
            obraSocialId: true,
            obraSocialCoseguroId: true,
            planCoseguroId: true,
            descripcionPatologia: true,
            profesionalTratanteId: true,
            profesionalGuardiaId: true,
            paciente: { select: { nombreCompleto: true } },
        },
    })

    if (!ingreso) throw new Error('Ingreso no encontrado')
    // Sin OS el paciente es particular: la orden necesita un OSID (Orden.OSID es
    // NOT NULL) y se emite contra la OS PARTICULAR, sin tocar el ingreso.
    const obraSocialOrdenId = ingreso.obraSocialId ?? await resolverObraSocialParticularId()

    const profesionalId =
        data.profesionalId ?? ingreso.profesionalTratanteId ?? ingreso.profesionalGuardiaId ?? null
    if (!profesionalId) {
        throw new Error('No hay profesional asignado. Seleccioná uno para generar la orden.')
    }

    const descripcionPractica =
        practica.nomencladorPractica?.descripcion ?? practica.codigoPractica.trim()

    const orden = await crearOrdenAmbulatorio(
        {
            ingresoId: ingreso.id,
            pacienteId: ingreso.pacienteId ?? undefined,
            nombrePaciente: ingreso.paciente?.nombreCompleto ?? ingreso.nombre ?? 'PACIENTE',
            numeroAfiliado: ingreso.numeroAfiliado ?? '',
            obraSocialId: obraSocialOrdenId,
            obraSocialCoseguroId: ingreso.obraSocialCoseguroId ?? undefined,
            planCoseguroId: ingreso.planCoseguroId ?? undefined,
            profesionalId,
            tipoOrdenCodigo: 'PRA',
            descripcionPatologia: ingreso.descripcionPatologia ?? undefined,
            items: [
                {
                    practicaId: practica.id,
                    convenioId: practica.convenioId,
                    codigoPractica: practica.codigoPractica.trim(),
                    descripcionPractica,
                    cantidad: Number(practica.cantidad),
                    tipoFacturacion: 'H',
                    fecha: practica.fecha,
                    numeroAutorizacion: practica.numeroAutorizacion,
                    importeTotal: practica.importeTotal != null ? Number(practica.importeTotal) : undefined,
                },
            ],
        },
        usuario
    )

    await prisma.practica.update({
        where: { id: practica.id },
        data: {
            puestoNumero: orden.puestoNumero,
            ordenNumero: orden.numero,
            ordenItem: 1,
        },
    })

    return { puestoNumero: orden.puestoNumero, numero: orden.numero }
}

export async function renumerarOrdenFacturacion(
    data: RenumerarOrdenFacturacionInput
): Promise<{ puestoNumero: number; numero: number }> {
    if (data.puestoNumero === data.nuevoPuestoNumero && data.numero === data.nuevoNumero) {
        return { puestoNumero: data.nuevoPuestoNumero, numero: data.nuevoNumero }
    }

    return prisma.$transaction(async (tx) => {
        const ordenActual = await tx.orden.findUnique({
            where: {
                puestoNumero_numero: {
                    puestoNumero: data.puestoNumero,
                    numero: data.numero,
                },
            },
            select: {
                puestoNumero: true,
                numero: true,
                ingresoId: true,
                estado: true,
                descripcion: true,
                fechaEmision: true,
                fechaPedido: true,
                numeroAutorizacion: true,
                pacienteId: true,
                nombrePaciente: true,
                numeroAfiliado: true,
                obraSocialId: true,
                planId: true,
                obraSocialCoseguroId: true,
                planCoseguroId: true,
                profesionalId: true,
                tipoOrdenCodigo: true,
                patologiaId: true,
                descripcionPatologia: true,
                importeTotal: true,
                importeCargoPac: true,
                titularModular: true,
                imprimirPorDuplicado: true,
                fechaEstado: true,
                usuarioRegistro: true,
                items: {
                    orderBy: { item: 'asc' },
                    select: {
                        item: true,
                        practicaId: true,
                        convenioId: true,
                        codigoPractica: true,
                        convenioValorId: true,
                        tipoDiferencialCodigo: true,
                        numeroAutorizacion: true,
                        fecha: true,
                        cantidad: true,
                        cantidadModuloIntegral: true,
                        importeTotal: true,
                        importeCargoPaciente: true,
                        porcentajeCargoPac: true,
                        tipoFacturacion: true,
                        clasificacionAgrupacion: true,
                        modulo: true,
                        titularModular: true,
                        imprimirPorDuplicado: true,
                        efectorMatricula: true,
                    },
                },
            },
        })

        if (!ordenActual) throw new Error('Orden no encontrada')

        const yaExisteDestino = await tx.orden.findUnique({
            where: {
                puestoNumero_numero: {
                    puestoNumero: data.nuevoPuestoNumero,
                    numero: data.nuevoNumero,
                },
            },
            select: { numero: true },
        })
        if (yaExisteDestino) {
            throw new Error('Ya existe una orden con el nuevo puesto y número')
        }

        await tx.orden.create({
            data: {
                puestoNumero: data.nuevoPuestoNumero,
                numero: data.nuevoNumero,
                ingresoId: ordenActual.ingresoId,
                descripcion: ordenActual.descripcion,
                fechaEmision: ordenActual.fechaEmision,
                fechaPedido: ordenActual.fechaPedido,
                numeroAutorizacion: ordenActual.numeroAutorizacion,
                pacienteId: ordenActual.pacienteId,
                nombrePaciente: ordenActual.nombrePaciente,
                numeroAfiliado: ordenActual.numeroAfiliado,
                obraSocialId: ordenActual.obraSocialId,
                planId: ordenActual.planId,
                obraSocialCoseguroId: ordenActual.obraSocialCoseguroId,
                planCoseguroId: ordenActual.planCoseguroId,
                profesionalId: ordenActual.profesionalId,
                tipoOrdenCodigo: ordenActual.tipoOrdenCodigo,
                patologiaId: ordenActual.patologiaId,
                descripcionPatologia: ordenActual.descripcionPatologia,
                importeTotal: ordenActual.importeTotal,
                importeCargoPac: ordenActual.importeCargoPac,
                titularModular: ordenActual.titularModular,
                imprimirPorDuplicado: ordenActual.imprimirPorDuplicado,
                estado: ordenActual.estado,
                fechaEstado: ordenActual.fechaEstado,
                usuarioRegistro: ordenActual.usuarioRegistro,
            },
        })

        if (ordenActual.items.length > 0) {
            await tx.ordenPractica.createMany({
                data: ordenActual.items.map((it) => ({
                    puestoNumero: data.nuevoPuestoNumero,
                    ordenNumero: data.nuevoNumero,
                    item: it.item,
                    practicaId: it.practicaId,
                    convenioId: it.convenioId,
                    codigoPractica: it.codigoPractica,
                    convenioValorId: it.convenioValorId,
                    tipoDiferencialCodigo: it.tipoDiferencialCodigo,
                    numeroAutorizacion: it.numeroAutorizacion,
                    fecha: it.fecha,
                    cantidad: it.cantidad,
                    cantidadModuloIntegral: it.cantidadModuloIntegral,
                    importeTotal: it.importeTotal,
                    importeCargoPaciente: it.importeCargoPaciente,
                    porcentajeCargoPac: it.porcentajeCargoPac,
                    tipoFacturacion: it.tipoFacturacion,
                    clasificacionAgrupacion: it.clasificacionAgrupacion,
                    modulo: it.modulo,
                    titularModular: it.titularModular,
                    imprimirPorDuplicado: it.imprimirPorDuplicado,
                    efectorMatricula: it.efectorMatricula,
                })),
            })
        }

        await tx.practica.updateMany({
            where: {
                puestoNumero: data.puestoNumero,
                ordenNumero: data.numero,
            },
            data: {
                puestoNumero: data.nuevoPuestoNumero,
                ordenNumero: data.nuevoNumero,
            },
        })

        await tx.orden.delete({
            where: {
                puestoNumero_numero: {
                    puestoNumero: data.puestoNumero,
                    numero: data.numero,
                },
            },
        })

        return { puestoNumero: data.nuevoPuestoNumero, numero: data.nuevoNumero }
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
    items: { select: { importePromedi: true }, take: 1, where: { importePromedi: { not: null } } },
    itemsIPSTxt: { select: { importePromedi: true }, take: 1, where: { importePromedi: { not: null } } },
    tipoIngresoCodigo: true,
    rangoDesde: true,
    rangoHasta: true,
    obraSocial: { select: { id: true, nombre: true } },
    plan: { select: { id: true, descripcion: true } },
} satisfies Prisma.LoteFacturacionSelect

function mapLoteRow(row: Prisma.LoteFacturacionGetPayload<{ select: typeof LOTE_SELECT }>): LoteFacturacionListItem {
    const promediAplicado =
        row.items.some((it) => it.importePromedi !== null) ||
        row.itemsIPSTxt.some((it) => it.importePromedi !== null)

    return {
        ...row,
        tipo: row.tipo as LoteFacturacionListItem['tipo'],
        estado: row.estado as EstadoLote,
        importeTotal: Number(row.importeTotal),
        promediAplicado,
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

export async function buscarPracticasFacturadasProfesionalEnLotes(
    params: BusquedaLotesInput
): Promise<{ items: LotePracticaFacturadaProfesionalItem[]; total: number }> {
    const { periodo, estado, obraSocialId, tipo, medico, matricula, pagina, porPagina } = params

    if (!medico && !matricula) {
        return { items: [], total: 0 }
    }

    if (tipo && tipo !== 'PRACTICAS') {
        return { items: [], total: 0 }
    }

    const whereLote: Prisma.LoteFacturacionWhereInput = {
        tipo: 'PRACTICAS',
    }
    if (periodo) whereLote.periodo = periodo
    if (estado) whereLote.estado = estado
    if (obraSocialId) whereLote.obraSocialId = obraSocialId

    const lotes = await prisma.loteFacturacion.findMany({
        where: whereLote,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        select: {
            id: true,
            numero: true,
            estado: true,
            periodo: true,
            fecha: true,
            obraSocial: { select: { id: true, nombre: true } },
            plan: { select: { id: true, descripcion: true } },
            items: {
                where: { incluido: true },
                select: {
                    ingresoId: true,
                    ingreso: {
                        select: {
                            id: true,
                            tipoIngresoCodigo: true,
                            numeroIngreso: true,
                            paciente: { select: { id: true, nombreCompleto: true, numeroDocumento: true } },
                        },
                    },
                },
            },
        },
    })

    if (lotes.length === 0) {
        return { items: [], total: 0 }
    }

    const ingresoIds = Array.from(
        new Set(
            lotes
                .flatMap((lote) => lote.items.map((item) => item.ingresoId))
                .filter((id): id is number => Number.isFinite(id))
        )
    )

    if (ingresoIds.length === 0) {
        return { items: [], total: 0 }
    }

    const especialistaWhere = buildEspecialistaOrdenWhere({ medico, matricula })
    const ordenes = await prisma.orden.findMany({
        where: {
            ingresoId: { in: ingresoIds },
            ...buildOrdenNoAnuladaWhere(),
            AND: [buildOrdenAutorizadaWhere(), especialistaWhere],
        },
        select: {
            ingresoId: true,
            puestoNumero: true,
            numero: true,
            fechaEmision: true,
            numeroAutorizacion: true,
            profesional: {
                select: {
                    id: true,
                    nombre: true,
                    matricula: true,
                },
            },
            items: {
                select: {
                    item: true,
                    codigoPractica: true,
                    efectorMatricula: true,
                    cantidad: true,
                    numeroAutorizacion: true,
                    importeTotal: true,
                    nomencladorPractica: { select: { descripcion: true } },
                },
            },
        },
    })

    const ordenesPorIngreso = new Map<number, typeof ordenes>()
    for (const orden of ordenes) {
        const ingresoId = orden.ingresoId
        if (!ingresoId) continue
        const existentes = ordenesPorIngreso.get(ingresoId) ?? []
        existentes.push(orden)
        ordenesPorIngreso.set(ingresoId, existentes)
    }

    const filas: LotePracticaFacturadaProfesionalItem[] = []

    for (const lote of lotes) {
        const rangoLote = rangoPeriodoOpcional(lote.periodo)

        for (const itemLote of lote.items) {
            const ingreso = itemLote.ingreso
            const ordenesIngreso = (ordenesPorIngreso.get(ingreso.id) ?? []).filter(
                (orden) => fechaEntraEnPeriodo(orden.fechaEmision, rangoLote)
            )

            for (const orden of ordenesIngreso) {
                const ordenConAutorizacion = tieneNumeroAutorizacionValido(orden.numeroAutorizacion)
                const itemsAutorizados = orden.items
                    .map((it) => ({
                        item: it,
                        numeroAutorizacion: resolverNumeroAutorizacion(it.numeroAutorizacion, orden.numeroAutorizacion),
                    }))
                    .filter((it) => ordenConAutorizacion || tieneNumeroAutorizacionValido(it.numeroAutorizacion))

                const profesionalLote = resolverProfesionalLote({
                    tipoIngresoCodigo: ingreso.tipoIngresoCodigo,
                    profesional: orden.profesional,
                    efectorMatriculas: itemsAutorizados.map((it) => it.item.efectorMatricula),
                })

                for (const autorizado of itemsAutorizados) {
                    const it = autorizado.item

                    filas.push({
                        loteId: lote.id,
                        loteNumero: lote.numero,
                        loteEstado: lote.estado as EstadoLote,
                        lotePeriodo: lote.periodo,
                        loteFecha: lote.fecha,
                        loteObraSocial: lote.obraSocial,
                        lotePlan: lote.plan,
                        ingresoId: ingreso.id,
                        tipoIngresoCodigo: ingreso.tipoIngresoCodigo,
                        numeroIngreso: ingreso.numeroIngreso,
                        paciente: ingreso.paciente,
                        profesional: profesionalLote,
                        ordenPuestoNumero: orden.puestoNumero,
                        ordenNumero: orden.numero,
                        ordenFechaEmision: orden.fechaEmision,
                        item: it.item,
                        codigoPractica: it.codigoPractica.trim(),
                        descripcionPractica: it.nomencladorPractica?.descripcion ?? null,
                        cantidad: Number(it.cantidad),
                        numeroAutorizacion: autorizado.numeroAutorizacion,
                        importeTotal: Number(it.importeTotal ?? 0),
                    })
                }
            }
        }
    }

    filas.sort((a, b) => {
        const byLoteFecha = b.loteFecha.getTime() - a.loteFecha.getTime()
        if (byLoteFecha !== 0) return byLoteFecha

        const byIngreso = a.numeroIngreso - b.numeroIngreso
        if (byIngreso !== 0) return byIngreso

        const byOrdenFecha = b.ordenFechaEmision.getTime() - a.ordenFechaEmision.getTime()
        if (byOrdenFecha !== 0) return byOrdenFecha

        return a.item - b.item
    })

    const total = filas.length
    const skip = (pagina - 1) * porPagina
    const items = filas.slice(skip, skip + porPagina)

    return { items, total }
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

    const ordenFacturadaWhere: Prisma.OrdenWhereInput = {
        AND: [
            buildOrdenNoAnuladaWhere(),
            whereFechaEmisionPeriodo(lote.periodo),
            buildOrdenFacturadaWhere(),
            especialistaWhere,
        ],
    }
    // Un lote de medicamentos factura la medicacion cargada directamente en el
    // ingreso: no hay orden de por medio. Pedir una orden facturada dejaba el lote
    // vacio aunque tuviera importe, porque estos ingresos no tienen ninguna.
    const esLoteMedicamentos = lote.tipo === 'MEDICAMENTOS'
    const rangoMedicacionLote = rangoPeriodoOpcional(lote.periodo)
    const whereMedicacionLote: Prisma.MedicacionIngresoWhereInput = {
        estado: { notIn: ['S', 'X'] },
        ...(rangoMedicacionLote
            ? { fechaInicio: { gte: rangoMedicacionLote.desde, lt: rangoMedicacionLote.hasta } }
            : {}),
    }
    const whereIngresoFiltro: Prisma.IngresoWhereInput = esLoteMedicamentos
        ? { medicaciones: { some: whereMedicacionLote } }
        : { ordenes: { some: ordenFacturadaWhere } }
    const ordenesExcluidas = await prisma.loteFacturacionOrdenExcluida.findMany({
        where: { loteId: id },
        select: { puestoNumero: true, ordenNumero: true },
    })
    const clavesOrdenesExcluidas = new Set(
        ordenesExcluidas.map((orden) => `${orden.puestoNumero}:${orden.ordenNumero}`)
    )

    const itemsLote = await prisma.loteFacturacionItem.findMany({
        where: {
            loteId: id,
            ingreso: whereIngresoFiltro,
        },
        orderBy: [{ ingreso: { fechaIngreso: 'asc' } }, { id: 'asc' }],
        select: {
            id: true,
            loteId: true,
            ingresoId: true,
            incluido: true,
            importeTotal: true,
            importePromedi: true,
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
                    // Los dos selects van siempre: hacerlos condicionales convierte
                    // el tipo de Prisma en una union y rompe el calculo de abajo.
                    ordenes: {
                        where: ordenFacturadaWhere,
                        select: {
                            puestoNumero: true,
                            numero: true,
                            numeroAutorizacion: true,
                            items: {
                                select: {
                                    importeTotal: true,
                                    numeroAutorizacion: true,
                                    practica: {
                                        select: {
                                            estado: true,
                                            puestoNumero: true,
                                            ordenNumero: true,
                                            ordenItem: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                    medicaciones: {
                        where: whereMedicacionLote,
                        select: { importe: true, cantidad: true },
                    },
                },
            },
        },
    })

    const items = itemsLote.map((item) => {
        const { ordenes, medicaciones, ...ingreso } = item.ingreso

        if (esLoteMedicamentos) {
            const importeMedicacion = (medicaciones ?? []).reduce(
                (total, med) => total + Number(med.importe ?? 0) * (Number(med.cantidad ?? 1) || 1),
                0
            )

            return {
                ...item,
                ingreso,
                importeTotal: Number(importeMedicacion.toFixed(2)),
                importePromedi: item.importePromedi !== null ? Number(item.importePromedi) : null,
                paciente: ingreso.paciente,
            }
        }

        const importeTotal = ordenes
            .filter((orden) => !clavesOrdenesExcluidas.has(`${orden.puestoNumero}:${orden.numero}`))
            .flatMap((orden) => {
            const ordenConAutorizacion = tieneNumeroAutorizacionValido(orden.numeroAutorizacion)
            return orden.items.filter((ordenItem) =>
                practicaFacturadaEnOrden(ordenItem.practica, orden) &&
                (ordenConAutorizacion || tieneNumeroAutorizacionValido(ordenItem.numeroAutorizacion))
            )
        }).reduce((total, ordenItem) => total + Number(ordenItem.importeTotal ?? 0), 0)

        return {
            ...item,
            ingreso,
            importeTotal,
            importePromedi: item.importePromedi !== null ? Number(item.importePromedi) : null,
            paciente: ingreso.paciente,
        }
    }) as LoteFacturacionItemDetalle[]

    return {
        ...mapLoteRow(lote),
        importeTotal: items
            .filter((item) => item.incluido)
            .reduce((total, item) => total + item.importeTotal, 0),
        items,
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

/**
 * Ordenes que ya factura otro lote pendiente o confirmado del mismo tipo y periodo.
 *
 * El lote no guarda sus ordenes: se derivan de sus ingresos incluidos y despues se le
 * restan las de LoteFacturacionOrdenExcluida. Hay que reproducir esa derivacion para
 * saber que quedo tomado.
 */
async function obtenerOrdenesTomadasEnLotes(
    tipo: string,
    periodo: string | null | undefined,
    excluirLoteId?: number
): Promise<Set<string>> {
    // Que lotes pueden haberse llevado una orden que este lote quiere tomar:
    // - si el lote nuevo tiene periodo, los de ese mismo periodo y los que no tienen
    //   ninguno (esos barren cualquier fecha, incluida la de este periodo);
    // - si el lote nuevo no tiene periodo, cualquiera: va a mirar todas las fechas.
    const wherePeriodo: Prisma.LoteFacturacionWhereInput = periodo
        ? { OR: [{ periodo }, { periodo: null }] }
        : {}

    const lotes = await prisma.loteFacturacion.findMany({
        where: {
            tipo,
            estado: { in: ['PEN', 'CON'] },
            ...wherePeriodo,
            ...(excluirLoteId ? { id: { not: excluirLoteId } } : {}),
        },
        select: {
            periodo: true,
            ordenesExcluidas: { select: { puestoNumero: true, ordenNumero: true } },
            items: {
                where: { incluido: true },
                select: {
                    ingreso: {
                        select: {
                            ordenes: {
                                where: {
                                    AND: [
                                        buildOrdenNoAnuladaWhere(),
                                        buildOrdenFacturadaWhere(),
                                    ],
                                },
                                select: { puestoNumero: true, numero: true, fechaEmision: true },
                            },
                        },
                    },
                },
            },
        },
    })

    const tomadas = new Set<string>()
    for (const lote of lotes) {
        // Cada lote se llevo solo las ordenes de SU periodo. El filtro va por lote y no
        // en la query porque cada uno tiene un rango distinto (o ninguno).
        const rangoLote = rangoPeriodoOpcional(lote.periodo)
        const excluidas = new Set(
            lote.ordenesExcluidas.map((o) => claveOrdenLote(o.puestoNumero, o.ordenNumero))
        )
        for (const item of lote.items) {
            for (const orden of item.ingreso.ordenes) {
                if (!fechaEntraEnPeriodo(orden.fechaEmision, rangoLote)) continue
                const clave = claveOrdenLote(orden.puestoNumero, orden.numero)
                if (!excluidas.has(clave)) tomadas.add(clave)
            }
        }
    }

    return tomadas
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
    // Sin periodo no hay filtro de fecha: el lote levanta todo lo que quedo pendiente,
    // sin importar de que mes sea.
    const whereFechaOrden = whereFechaEmisionPeriodo(data.periodo)
    const rangoMedicacion = rangoPeriodoOpcional(data.periodo)
    const whereFechaMedicacion = rangoMedicacion
        ? { fechaInicio: { gte: rangoMedicacion.desde, lt: rangoMedicacion.hasta } }
        : {}

    // Build where for ingreso resolution
    const whereIngreso: Prisma.IngresoWhereInput = {
        estado: { in: ['A', 'E'] },
    }
    // En PRACTICAS un mismo paciente puede ir en varios lotes a la vez, porque cada lote
    // factura categorias distintas. El reparto se resuelve por orden mas abajo, asi que
    // aca no se bloquea al ingreso entero. En MEDICAMENTOS no hay ordenes que repartir,
    // se mantiene el bloqueo.
    if (data.tipo === 'MEDICAMENTOS') {
        whereIngreso.lotesItems = {
            none: {
                lote: {
                    estado: { in: ['PEN', 'CON'] },
                    tipo: data.tipo,
                },
            },
        }
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

    // Filter ingresos that have at least one billed prestacion of the right type
    if (data.tipo === 'PRACTICAS') {
        whereIngreso.ordenes = {
            some: {
                ...buildOrdenNoAnuladaWhere(),
                ...whereFechaOrden,
                ...buildOrdenFacturadaWhere(),
            },
        }
    } else {
        whereIngreso.medicaciones = {
            some: {
                estado: { notIn: ['S', 'X'] },
                ...whereFechaMedicacion,
            },
        }
    }

    const ingresos = await prisma.ingreso.findMany({
        where: whereIngreso,
        select: {
            id: true,
            ordenes: data.tipo === 'PRACTICAS'
                ? {
                    where: {
                        ...buildOrdenNoAnuladaWhere(),
                        ...whereFechaOrden,
                    },
                    select: {
                        puestoNumero: true,
                        numero: true,
                        numeroAutorizacion: true,
                        items: {
                            select: {
                                importeTotal: true,
                                numeroAutorizacion: true,
                                codigoPractica: true,
                                practica: {
                                    select: {
                                        estado: true,
                                        puestoNumero: true,
                                        ordenNumero: true,
                                        ordenItem: true,
                                    },
                                },
                            },
                        },
                    },
                }
                : false,
            medicaciones: data.tipo === 'MEDICAMENTOS'
                ? {
                    where: { estado: { notIn: ['S', 'X'] }, ...whereFechaMedicacion },
                    select: { nombre: true, importe: true, cantidad: true },
                }
                : false,
        },
    })

    // Ordenes que ya factura otro lote pendiente o confirmado del mismo periodo.
    const ordenesTomadas =
        data.tipo === 'PRACTICAS'
            ? await obtenerOrdenesTomadasEnLotes(data.tipo, data.periodo)
            : new Set<string>()

    const categoriasSeleccionadas = new Set<CategoriaPractica>(data.categorias ?? [])
    // Ordenes que quedan fuera del lote: las de otra categoria y las ya tomadas. Se
    // guardan para que el detalle del lote las descuente igual que las exclusiones manuales.
    const ordenesExcluidas: Array<{ puestoNumero: number; ordenNumero: number }> = []

    // Compute importe per ingreso
    const itemsData = ingresos.flatMap((ing) => {
        let importe = 0
        if (data.tipo === 'PRACTICAS' && ing.ordenes) {
            const ordenes = ing.ordenes as unknown as Array<{
                puestoNumero: number
                numero: number
                numeroAutorizacion: string | null
                items: Array<{
                    importeTotal: unknown
                    numeroAutorizacion: string | null
                    codigoPractica: string | null
                    practica: {
                        estado: string | null
                        puestoNumero: number | null
                        ordenNumero: number | null
                        ordenItem: number | null
                    } | null
                }>
            }>

            const ordenesParaReparto: OrdenParaReparto[] = []
            for (const o of ordenes) {
                const ordenConAutorizacion = tieneNumeroAutorizacionValido(o.numeroAutorizacion)
                const itemsFacturados = o.items.filter((it) =>
                    practicaFacturadaEnOrden(it.practica, o) &&
                    (ordenConAutorizacion || tieneNumeroAutorizacionValido(it.numeroAutorizacion))
                )
                // Sin practicas facturadas la orden no aparece en el detalle: no hay nada
                // que excluir ni que sumar.
                if (itemsFacturados.length === 0) continue

                const categorias = [
                    ...new Set(
                        itemsFacturados
                            .map((it) => categoriaPractica(it.codigoPractica?.trim()))
                            .filter((c): c is CategoriaPractica => c !== null)
                    ),
                ]

                ordenesParaReparto.push({
                    puestoNumero: o.puestoNumero,
                    ordenNumero: o.numero,
                    categorias,
                    importe: itemsFacturados.reduce(
                        (s: number, i) => s + Number(i.importeTotal ?? 0),
                        0
                    ),
                })
            }

            const reparto = repartirOrdenesDeIngreso(
                ordenesParaReparto,
                categoriasSeleccionadas,
                ordenesTomadas
            )
            // Si no le quedo ninguna orden libre de la categoria pedida, el ingreso no entra.
            if (!reparto.entra) return []
            importe = reparto.importe
            ordenesExcluidas.push(...reparto.ordenesExcluidas)
        }
        if (data.tipo === 'MEDICAMENTOS' && ing.medicaciones) {
            importe += (ing.medicaciones as Array<{ importe: unknown; cantidad: number | null }>).reduce(
                (s, m) => s + Number(m.importe ?? 0) * (Number(m.cantidad ?? 1) || 1),
                0
            )
        }
        return { ingresoId: ing.id, importeTotal: importe, incluido: true }
    })

    const totalLote = itemsData.reduce((s, it) => s + it.importeTotal, 0)

    // ordenesExcluidas solo acumula ingresos que entraron al lote. Se deduplica por las
    // dudas: (puestoNumero, ordenNumero) es unico en LoteFacturacionOrdenExcluida.
    const clavesExcluidas = new Set<string>()
    const exclusionesData = ordenesExcluidas.filter((o) => {
        const clave = claveOrdenLote(o.puestoNumero, o.ordenNumero)
        if (clavesExcluidas.has(clave)) return false
        clavesExcluidas.add(clave)
        return true
    })

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
            ...(exclusionesData.length > 0
                ? { ordenesExcluidas: { create: exclusionesData } }
                : {}),
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

export async function toggleOrdenLote(
    loteId: number,
    puestoNumero: number,
    ordenNumero: number,
    incluida: boolean
): Promise<void> {
    const orden = await prisma.orden.findUnique({
        where: { puestoNumero_numero: { puestoNumero, numero: ordenNumero } },
        select: { ingresoId: true },
    })
    const itemLote = orden?.ingresoId
        ? await prisma.loteFacturacionItem.findFirst({
            where: {
                loteId,
                ingresoId: orden.ingresoId,
                lote: { estado: 'PEN' },
            },
            select: { id: true },
        })
        : null
    if (!itemLote) throw new Error('Sólo se pueden modificar órdenes de un lote pendiente')

    if (incluida) {
        await prisma.loteFacturacionOrdenExcluida.deleteMany({
            where: { loteId, puestoNumero, ordenNumero },
        })
    } else {
        await prisma.loteFacturacionOrdenExcluida.upsert({
            where: {
                loteId_puestoNumero_ordenNumero: { loteId, puestoNumero, ordenNumero },
            },
            create: { loteId, puestoNumero, ordenNumero },
            update: {},
        })
    }

    await recalcularImportesLoteConExclusiones(loteId)
}

async function recalcularImportesLoteConExclusiones(loteId: number): Promise<void> {
    const loteActualizado = await obtenerLote(loteId)
    if (!loteActualizado) return

    await prisma.$transaction([
        ...loteActualizado.items.map((item) => prisma.loteFacturacionItem.update({
            where: { id: item.id },
            data: { importeTotal: item.importeTotal },
        })),
        prisma.loteFacturacion.update({
            where: { id: loteId },
            data: { importeTotal: loteActualizado.importeTotal },
        })
    ])
}

function fechaPrimeraPractica(items: Array<{ fecha: Date }>): number {
    let minima = Number.POSITIVE_INFINITY
    for (const item of items) {
        const valor = item.fecha.getTime()
        if (valor < minima) minima = valor
    }
    return minima
}

export async function obtenerMedicacionesLoteIngreso(
    ingresoId: number,
    periodo?: string | null
): Promise<MedicacionLoteDetalle[]> {
    const rango = rangoPeriodoOpcional(periodo)

    const medicaciones = await prisma.medicacionIngreso.findMany({
        where: {
            ingresoId,
            estado: { notIn: ['S', 'X'] },
            ...(rango ? { fechaInicio: { gte: rango.desde, lt: rango.hasta } } : {}),
        },
        orderBy: [{ fechaInicio: 'asc' }, { id: 'asc' }],
        select: {
            id: true,
            nombre: true,
            fechaInicio: true,
            importe: true,
            cantidad: true,
        },
    })

    return medicaciones.map((med) => {
        const cantidad = Number(med.cantidad ?? 1) || 1
        const precioUnitario = Number(med.importe ?? 0)
        return {
            id: med.id,
            nombre: med.nombre,
            fecha: med.fechaInicio,
            cantidad,
            precioUnitario,
            importeTotal: Number((precioUnitario * cantidad).toFixed(2)),
        }
    })
}

export async function obtenerOrdenesAutorizadasIngreso(
    ingresoId: number,
    filtros?: { medico?: string; matricula?: number; periodo?: string; loteId?: number }
): Promise<OrdenAutorizadaLote[]> {
    const ingreso = await prisma.ingreso.findUnique({
        where: { id: ingresoId },
        select: { tipoIngresoCodigo: true },
    })

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

    const cirugiasProgramadas = await prisma.cirugiaProgramada.findMany({
        where: { internacionId: ingresoId },
        orderBy: [{ fechaCirugia: 'desc' }, { id: 'desc' }],
        select: {
            id: true,
            fechaCirugia: true,
            diferenciales: {
                select: {
                    esFeriado: true,
                    esNocturna: true,
                    mismaViaPatologia: true,
                    mismaViaMismaPatologia: true,
                    diferentesViasPatologia: true,
                    diferentesViasDiferentesPatologia: true,
                    dobleCirugia: true,
                },
            },
            practicas: {
                select: {
                    codigo: true,
                    cantidad: true,
                },
            },
        },
    })

    const cirugiaPracticasPorClave = new Map<
        string,
        {
            cirugiaId: number
            diferenciales: {
                esFeriado: boolean
                esNocturna: boolean
                mismaViaPatologia: boolean
                mismaViaMismaPatologia: boolean
                diferentesViasPatologia: boolean
                diferentesViasDiferentesPatologia: boolean
                dobleCirugia: boolean
            }
        }
    >()
    const cirugiaPracticasPorCodigoCantidad = new Map<
        string,
        Array<{
            cirugiaId: number
            diferenciales: {
                esFeriado: boolean
                esNocturna: boolean
                mismaViaPatologia: boolean
                mismaViaMismaPatologia: boolean
                diferentesViasPatologia: boolean
                diferentesViasDiferentesPatologia: boolean
                dobleCirugia: boolean
            }
        }>
    >()

    for (const cirugia of cirugiasProgramadas) {
        const diferenciales = {
            esFeriado: cirugia.diferenciales.some((d) => d.esFeriado),
            esNocturna: cirugia.diferenciales.some((d) => d.esNocturna),
            mismaViaPatologia: cirugia.diferenciales.some((d) => d.mismaViaPatologia),
            mismaViaMismaPatologia: cirugia.diferenciales.some((d) => d.mismaViaMismaPatologia),
            diferentesViasPatologia: cirugia.diferenciales.some((d) => d.diferentesViasPatologia),
            diferentesViasDiferentesPatologia: cirugia.diferenciales.some(
                (d) => d.diferentesViasDiferentesPatologia
            ),
            dobleCirugia: cirugia.diferenciales.some((d) => d.dobleCirugia),
        }

        for (const practica of cirugia.practicas) {
            const infoCirugia = {
                cirugiaId: cirugia.id,
                diferenciales,
            }
            const clave = claveCirugiaPractica(practica.codigo, Number(practica.cantidad), cirugia.fechaCirugia)
            cirugiaPracticasPorClave.set(clave, infoCirugia)

            const claveSinFecha = claveCirugiaPracticaSinFecha(practica.codigo, Number(practica.cantidad))
            const actuales = cirugiaPracticasPorCodigoCantidad.get(claveSinFecha) ?? []
            actuales.push(infoCirugia)
            cirugiaPracticasPorCodigoCantidad.set(claveSinFecha, actuales)
        }
    }

    const ordenes = await prisma.orden.findMany({
        where: {
            ingresoId,
            ...buildOrdenNoAnuladaWhere(),
            AND: [
                buildOrdenFacturadaWhere(),
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
            profesional: {
                select: {
                    id: true,
                    nombre: true,
                    matricula: true,
                },
            },
            items: {
                // Las practicas de una orden se listan por fecha de realizacion: una orden
                // puede tener items con fecha distinta a la de emision.
                orderBy: [{ fecha: 'asc' }, { item: 'asc' }],
                select: {
                    item: true,
                    fecha: true,
                    codigoPractica: true,
                    modulo: true,
                    clasificacionAgrupacion: true,
                    efectorMatricula: true,
                    cantidad: true,
                    numeroAutorizacion: true,
                    importeTotal: true,
                    practica: {
                        select: {
                            estado: true,
                            puestoNumero: true,
                            ordenNumero: true,
                            ordenItem: true,
                        },
                    },
                    nomencladorPractica: {
                        select: {
                            descripcion: true,
                            valorEspecialista: true,
                            valorAnestesista: true,
                            valorAyudante: true,
                            valorGastos: true,
                        },
                    },
                },
            },
        },
    })

    const matriculasEjecutantes = Array.from(new Set(
        ordenes.flatMap((orden) => orden.items.map((item) => item.efectorMatricula))
            .filter((matricula): matricula is number => typeof matricula === 'number' && matricula > 0)
    ))
    const profesionalesEjecutantes = matriculasEjecutantes.length > 0
        ? await prisma.profesional.findMany({
            where: { matricula: { in: matriculasEjecutantes } },
            select: { id: true, nombre: true, matricula: true },
        })
        : []
    const profesionalPorMatricula = new Map(
        profesionalesEjecutantes
            .filter((profesional) => profesional.matricula !== null)
            .map((profesional) => [profesional.matricula as number, profesional])
    )
    const ordenesExcluidas = filtros?.loteId
        ? await prisma.loteFacturacionOrdenExcluida.findMany({
            where: { loteId: filtros.loteId },
            select: { puestoNumero: true, ordenNumero: true },
        })
        : []
    const clavesOrdenesExcluidas = new Set(
        ordenesExcluidas.map((orden) => `${orden.puestoNumero}:${orden.ordenNumero}`)
    )

    return ordenes
        .map((o) => {
            const itemsConEfector = o.items
                .filter(
                    (it) =>
                        practicaFacturadaEnOrden(it.practica, o) &&
                        tieneNumeroAutorizacionValido(
                            resolverNumeroAutorizacion(it.numeroAutorizacion, o.numeroAutorizacion)
                        )
                )
                .map((it) => ({
                    ...(function () {
                        const cirugiaMatch = resolverInfoCirugiaConFallback(
                            cirugiaPracticasPorClave,
                            cirugiaPracticasPorCodigoCantidad,
                            it.codigoPractica,
                            Number(it.cantidad),
                            it.fecha
                        )
                        const diferenciales = cirugiaMatch?.diferenciales ?? null
                        const esCirugiaMultiple = Boolean(
                            diferenciales?.dobleCirugia ||
                                diferenciales?.mismaViaPatologia ||
                                diferenciales?.mismaViaMismaPatologia ||
                                diferenciales?.diferentesViasPatologia ||
                                diferenciales?.diferentesViasDiferentesPatologia
                        )
                        const etiquetasCirugia: string[] = []
                        if (diferenciales?.mismaViaPatologia) {
                            etiquetasCirugia.push('Misma vía / distinta patología')
                        }
                        if (diferenciales?.mismaViaMismaPatologia) {
                            etiquetasCirugia.push('Misma vía / misma patología')
                        }
                        if (diferenciales?.diferentesViasPatologia) {
                            etiquetasCirugia.push('Distintas vías / misma patología')
                        }
                        if (diferenciales?.diferentesViasDiferentesPatologia) {
                            etiquetasCirugia.push('Distintas vías / distinta patología')
                        }
                        if (diferenciales?.dobleCirugia) {
                            etiquetasCirugia.push('Doble cirugía')
                        }
                        return {
                            esPracticaCirugia: Boolean(cirugiaMatch),
                            esCirugiaMultiple,
                            cirugiaProgramadaId: cirugiaMatch?.cirugiaId ?? null,
                            etiquetasCirugia,
                        }
                    })(),
                    item: it.item,
                    fecha: it.fecha,
                    codigoPractica: it.codigoPractica,
                    modulo: it.modulo?.trim() || null,
                    clasificacionAgrupacion: it.clasificacionAgrupacion?.trim() || null,
                    efectorMatricula: it.efectorMatricula,
                    descripcion: it.nomencladorPractica?.descripcion ?? null,
                    valoresNomenclador: it.nomencladorPractica
                        ? {
                            valorEspecialista: decimalANumero(it.nomencladorPractica.valorEspecialista),
                            valorAnestesista: decimalANumero(it.nomencladorPractica.valorAnestesista),
                            valorAyudante: decimalANumero(it.nomencladorPractica.valorAyudante),
                            valorGastos: decimalANumero(it.nomencladorPractica.valorGastos),
                        }
                        : null,
                    cantidad: Number(it.cantidad),
                    numeroAutorizacion: resolverNumeroAutorizacion(it.numeroAutorizacion, o.numeroAutorizacion),
                    importeTotal: Number(it.importeTotal ?? 0),
                }))

            const matriculaEjecutante = itemsConEfector.find((it) => it.efectorMatricula)?.efectorMatricula ?? null
            const profesionalEjecutante = matriculaEjecutante
                ? profesionalPorMatricula.get(matriculaEjecutante) ?? {
                    id: -matriculaEjecutante,
                    nombre: resolverNombreEfectorFallback({
                        titularModular: null,
                        descripcionPatologia: null,
                        matricula: matriculaEjecutante,
                    }),
                    matricula: matriculaEjecutante,
                }
                : null

            const items = itemsConEfector
            const esCirugia = items.some((it) => Boolean(it.esPracticaCirugia))
            const esCirugiaMultiple = items.some((it) => Boolean(it.esCirugiaMultiple))
            const etiquetasCirugia = Array.from(
                new Set(items.flatMap((it) => it.etiquetasCirugia ?? []))
            )

            return {
                puestoNumero: o.puestoNumero,
                numero: o.numero,
                incluidaEnLote: !clavesOrdenesExcluidas.has(`${o.puestoNumero}:${o.numero}`),
                fechaEmision: o.fechaEmision,
                descripcion: o.descripcion,
                numeroAutorizacion: o.numeroAutorizacion,
                importeTotal: Number(o.importeTotal ?? 0),
                esCirugia,
                esCirugiaMultiple,
                etiquetasCirugia,
                profesional: profesionalEjecutante,
                items,
            }
        })
        .filter((orden) => orden.items.length > 0)
        // Entre ordenes tambien manda la fecha de realizacion: una orden emitida antes
        // puede tener practicas posteriores a las de otra emitida despues.
        .sort((a, b) => {
            const porFecha = fechaPrimeraPractica(a.items) - fechaPrimeraPractica(b.items)
            if (porFecha !== 0) return porFecha
            const porEmision = a.fechaEmision.getTime() - b.fechaEmision.getTime()
            if (porEmision !== 0) return porEmision
            return a.numero - b.numero
        })
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

    const obraSocialId = data.obraSocialId ?? (
        await prisma.obraSocial.findFirst({
            where: { nombre: { contains: 'IPS', mode: 'insensitive' } },
            select: { id: true },
            orderBy: { id: 'asc' },
        })
    )?.id

    if (!obraSocialId) {
        throw new Error('No se encontró la obra social IPS configurada para importar la planilla.')
    }

    const lote = await prisma.loteFacturacion.create({
        data: {
            numero,
            fecha: data.fecha,
            periodo: data.periodo,
            tipo: 'PRACTICAS',
            origen: 'IPS_TXT',
            obraSocialId,
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

const CODIGOS_PROMEDI_BASE_ARRAY = Array.from(CODIGOS_PROMEDI_BASE)

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
        const PORCENTAJE_PROMEDI_IPS = 0.36

        const { totalPromedi, cantidadItems } = await prisma.$transaction(async (tx) => {
            const servicioCodigoNumericoSql = Prisma.sql`
                COALESCE(NULLIF(regexp_replace(trim("LipServCod"), '[^0-9]', '', 'g'), ''), '0')::integer
            `

            const codigoEntraEnResumenSql = Prisma.sql`(
                ${servicioCodigoNumericoSql} IN (${Prisma.join(CODIGOS_PROMEDI_BASE_ARRAY)})
                OR ${servicioCodigoNumericoSql} BETWEEN 10101 AND 130304
                OR ${servicioCodigoNumericoSql} BETWEEN 720201 AND 722238
            )`

            // Lo que no esta alcanzado por la regla no se factura en el resumen.
            await tx.$executeRaw`
                UPDATE "LoteIPSTxtItem"
                SET "LipImpPromedi" = 0
                WHERE "LotID" = ${loteId}
            `

            // Solo aplica el porcentaje a los códigos exactos y rangos permitidos por la regla.
            await tx.$executeRaw`
                UPDATE "LoteIPSTxtItem"
                SET "LipImpPromedi" = ROUND("LipImpTotal" * ${PORCENTAJE_PROMEDI_IPS}, 2)
                WHERE "LotID" = ${loteId}
                  AND ${codigoEntraEnResumenSql}
            `

            const [sumResult, conteo] = await Promise.all([
                tx.loteIPSTxtItem.aggregate({
                    where: { loteId },
                    _sum: { importePromedi: true },
                }),
                tx.$queryRaw<{ count: bigint }[]>`
                    SELECT COUNT(*)::bigint AS count
                    FROM "LoteIPSTxtItem"
                    WHERE "LotID" = ${loteId}
                      AND ${codigoEntraEnResumenSql}
                `,
            ])
            const itemsCount = Number(conteo[0]?.count ?? 0)

            const total = redondear2Repo(Number(sumResult._sum.importePromedi ?? 0))

            return { totalPromedi: total, cantidadItems: itemsCount }
        })

        return { importeTotal: totalPromedi, cantidadItems }
    }

    // ACIDSAL tiene regla propia: mismos codigos alcanzados que IPS, pero al 13%.
    const reglaPromedi = resolverReglaPromedi(lote.obraSocial?.nombre)
    if (reglaPromedi === null || lote.tipo !== 'PRACTICAS') {
        throw new Error('PROMEDI solo aplica a lotes IPS TXT o lotes de prácticas con obra social de regla PROMEDI')
    }

    const loteItems = await prisma.loteFacturacionItem.findMany({
        where: { loteId },
        select: { id: true, ingresoId: true, incluido: true },
    })

    if (loteItems.length === 0) {
        return { importeTotal: 0, cantidadItems: 0 }
    }

    const ingresoIds = Array.from(new Set(loteItems.map((it) => it.ingresoId)))
    const ordenesExcluidas = await prisma.loteFacturacionOrdenExcluida.findMany({
        where: { loteId },
        select: { puestoNumero: true, ordenNumero: true },
    })
    const clavesOrdenesExcluidas = new Set(
        ordenesExcluidas.map((orden) => `${orden.puestoNumero}:${orden.ordenNumero}`)
    )

    const ordenes = await prisma.orden.findMany({
        where: {
            ingresoId: { in: ingresoIds },
            ...buildOrdenNoAnuladaWhere(),
            ...whereFechaEmisionPeriodo(lote.periodo),
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
            puestoNumero: true,
            numero: true,
            numeroAutorizacion: true,
            profesional: { select: { nombre: true } },
            items: {
                select: {
                    codigoPractica: true,
                    modulo: true,
                    efectorMatricula: true,
                    importeTotal: true,
                    numeroAutorizacion: true,
                    practica: {
                        select: {
                            estado: true,
                            puestoNumero: true,
                            ordenNumero: true,
                            ordenItem: true,
                        },
                    },
                    nomencladorPractica: {
                        select: {
                            valorEspecialista: true,
                            valorAnestesista: true,
                            valorAyudante: true,
                            valorGastos: true,
                        },
                    },
                },
            },
        },
    })

    const importePorIngreso = new Map<number, number>()
    const porcentajePromedi = porcentajePromediPorObra(reglaPromedi)

    for (const orden of ordenes) {
        if (clavesOrdenesExcluidas.has(`${orden.puestoNumero}:${orden.numero}`)) continue
        for (const item of orden.items) {
            if (!practicaFacturadaEnOrden(item.practica, orden)) continue
            const numeroAutorizacion = resolverNumeroAutorizacion(item.numeroAutorizacion, orden.numeroAutorizacion)
            if (!tieneNumeroAutorizacionValido(numeroAutorizacion)) continue
            if (!orden.ingresoId) continue

            const importeBase = Number(item.importeTotal ?? 0)
            // Al resumen solo entran las practicas alcanzadas por la regla de promedi.
            // El resto (oxigeno, radiografias, ecografias, guardia, 431101, y en OSECAC
            // ademas 70116 y 70607) no se factura en este lote.
            const aplicaCodigo = aplicaPromediPorObra(item.codigoPractica, reglaPromedi)
            // Y dentro de esos codigos, solo impacta el subitem de gastos (GA).
            // Unica excepcion: el 400101, que impacta todos los subitems.
            const subitem = resolverSubitemPromedi({
                codigoPractica: item.codigoPractica,
                modulo: item.modulo,
                efectorMatricula: item.efectorMatricula,
                profesional: orden.profesional?.nombre,
                importeTotal: importeBase,
                valoresNomenclador: item.nomencladorPractica
                    ? {
                        valorEspecialista: decimalANumero(item.nomencladorPractica.valorEspecialista),
                        valorAnestesista: decimalANumero(item.nomencladorPractica.valorAnestesista),
                        valorAyudante: decimalANumero(item.nomencladorPractica.valorAyudante),
                        valorGastos: decimalANumero(item.nomencladorPractica.valorGastos),
                    }
                    : null,
            })
            const aplica = aplicaCodigo && subitemEntraEnPromedi(item.codigoPractica, subitem)
            const importeFacturable = aplica
                ? redondear2Repo(importeBase * porcentajePromedi)
                : 0

            const actual = importePorIngreso.get(orden.ingresoId) ?? 0
            importePorIngreso.set(orden.ingresoId, redondear2Repo(actual + importeFacturable))
        }
    }

    const updatesItems = loteItems.map((it) =>
        prisma.loteFacturacionItem.update({
            where: { id: it.id },
            data: { importePromedi: redondear2Repo(importePorIngreso.get(it.ingresoId) ?? 0) },
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
