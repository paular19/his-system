'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, CalendarDays, ChevronDown, ChevronRight, CheckCircle, FileSpreadsheet, ListFilter, Loader2, Plus, Search, Upload, X, XCircle } from 'lucide-react'
import type { AdmisionFacturacionListItem, FacturacionContexto, PrestacionFacturableItem } from '@/modules/facturacion/types'
import { crearPedidoLaboratorioAction } from '@/modules/orden/actions'
import {
    ComponenteSelector,
    type ComponenteValores,
    type ComponenteSeleccion,
    calcularTotalSeleccionado,
    seleccionPorDefecto,
    descripcionComponentes,
} from '@/components/ui/componente-selector'
import { ProfesionalSelect } from '@/components/ui/profesional-select'
import { resumenDiferenciales } from '@/modules/facturacion/diferenciales'
import { obtenerSubitemsSeleccionados, valorUnitarioPorSubitem } from '@/lib/practicas-subitems'
import { fechaHoraAInputLocal, formatearFechaHoraArgentina } from '@/lib/utils/argentina-date'
import { normalizarClasificacionAgrupacion } from '@/modules/orden/clasificacion'
import { normalizarTextoBusquedaFlexible } from '@/lib/utils/busqueda-flexible'
import { recalcularImportePorCambioCantidad } from '@/lib/facturacion/importes'
import { limpiarObservacionesAdmision } from '@/modules/admision/utils'

type AutorizacionVinculadaExtendida = {
    ordenPuestoNumero: number
    ordenNumero: number
    ordenItem: number
    numeroAutorizacion: string | null
    incluyeCodigo?: string | null
    matriculaProfesional?: number | null
    matriculaEspecialista?: number | null
    matriculaAnestesista?: number | null
    matriculaAyudante?: number | null
}

interface NomencladorItem {
    convenioId: number
    codigo: string
    descripcion: string
    valor: number | null
    valorEspecialista: number | null
    valorAyudante: number | null
    valorAnestesista: number | null
    valorGastos: number | null
}

type ApiResponse<T> = {
    ok: boolean
    data?: T
    error?: string
}

type PrestacionOrdenInput = {
    practicaId?: number
    convenioId: number
    codigoPractica: string
    descripcionPractica: string
    cantidad: number
    incluyeCodigo?: string | null
    numeroAutorizacion?: string | null
    importeTotal?: number
    matriculaEspecialista?: number | null
    matriculaAnestesista?: number | null
    grupoOrden?: number | null
}

type ConfirmacionPendiente = {
    titulo: string
    mensaje: string
    detalle: string[]
    resolver: (confirmado: boolean) => void
}

type DiferencialesCirugiaEditState = {
    esFeriado: boolean
    esNocturna: boolean
    mismaViaPatologia: boolean
    mismaViaMismaPatologia: boolean
    diferentesViasPatologia: boolean
    diferentesViasDiferentesPatologia: boolean
    dobleCirugia: boolean
    practicaBaseId: string
    practicaSecundariaId: string
}

type CirugiaPracticaEditable = {
    practicaId: number
    practicaIdsAgrupadas: number[]
    claveAgrupacion: string
    descripcion: string
    importeTotal: number
    importeTotalReferencia: number
    esPracticaBase: boolean
    esPracticaSecundaria: boolean
    aplicaDiferencial: boolean
}

type CirugiaEditableGroup = {
    cirugiaId: number
    practicas: CirugiaPracticaEditable[]
    diferenciales: PrestacionFacturableItem['diferenciales']
}

type ClasificacionToken = 'GA' | 'HE' | 'HA' | 'HP' | 'A1' | 'A2' | 'A3'
type CriterioBusquedaPaciente = 'NOMBRE' | 'HC' | 'DNI'
type BusquedaFacturacionState = {
    criterioBusquedaPaciente: CriterioBusquedaPaciente
    busquedaPaciente: string
    usarFiltroFechaIngreso: boolean
    fechaDesdeIngreso: string
    fechaHastaIngreso: string
    usarFiltroTipoIngreso: boolean
    tipoIngresoCodigo: string
    obraSocialId: string
    numeroIngreso: string
    numeroOrden: string
    codigoPractica: string
}

type ObraSocialFiltroItem = {
    id: number
    nombre: string
}

type ClasificacionPorComponenteState = Partial<Record<keyof ComponenteSeleccion, string[]>>

type ClasificacionPorComponenteUi = Partial<Record<
    keyof ComponenteSeleccion,
    Array<{ index: number; label: string; value: string }>
>>

const ORDEN_COMPONENTES_CLASIFICACION: Array<keyof ComponenteSeleccion> = [
    'especialista',
    'ayudante',
    'anestesista',
    'gastos',
]

function toDateInput(value: Date | string | null | undefined): string {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    return fechaHoraAInputLocal(d)
}

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        maximumFractionDigits: 2,
    }).format(value)
}

function formatOrderNumber(puestoNumero: number | null | undefined, ordenNumero: number | null | undefined): string {
    if (!puestoNumero || !ordenNumero) return '—'
    return `${puestoNumero.toString().padStart(4, '0')}-${ordenNumero.toString().padStart(8, '0')}`
}

const normalizarTextoBusqueda = normalizarTextoBusquedaFlexible

function parseEnteroPositivo(value: string | null | undefined): number | null {
    if (!value) return null
    const parsed = Number.parseInt(value, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return null
    return parsed
}

function normalizarCriterioBusqueda(value: string | null | undefined): CriterioBusquedaPaciente {
    const criterio = (value ?? '').trim().toUpperCase()
    if (criterio === 'HC') return 'HC'
    if (criterio === 'DNI') return 'DNI'
    return 'NOMBRE'
}

function coincideBusquedaDirectaPaciente(
    admision: AdmisionFacturacionListItem,
    criterio: CriterioBusquedaPaciente,
    termino: string
): boolean {
    const terminoLimpio = termino.trim()
    if (!terminoLimpio) return false

    if (criterio === 'NOMBRE') {
        const nombrePaciente = normalizarTextoBusqueda(admision.paciente?.nombreCompleto)
        const nombreBusqueda = normalizarTextoBusqueda(terminoLimpio)
        return Boolean(nombrePaciente && nombrePaciente.includes(nombreBusqueda))
    }

    const numeroBuscado = parseEnteroPositivo(terminoLimpio)
    if (!numeroBuscado || !admision.paciente) return false
    if (criterio === 'HC') return admision.paciente.historiaClinica === numeroBuscado
    return admision.paciente.numeroDocumento === numeroBuscado
}

function resolverEstadoBusquedaDesdeQuery(searchParams: { get(name: string): string | null }): BusquedaFacturacionState {
    const historiaClinica = parseEnteroPositivo(searchParams.get('historiaClinica'))
    const numeroDocumento = parseEnteroPositivo(searchParams.get('numeroDocumento'))
    const pacienteNombre = (searchParams.get('pacienteNombre') ?? '').trim()
    const criterioParam = normalizarCriterioBusqueda(searchParams.get('criterio'))

    const criterioBusquedaPaciente: CriterioBusquedaPaciente = historiaClinica
        ? 'HC'
        : numeroDocumento
            ? 'DNI'
            : pacienteNombre
                ? 'NOMBRE'
                : criterioParam

    const busquedaPaciente = (() => {
        if (historiaClinica) return String(historiaClinica)
        if (numeroDocumento) return String(numeroDocumento)
        if (pacienteNombre) return pacienteNombre
        return (
            searchParams.get('qPaciente') ??
            searchParams.get('q') ??
            ''
        )
    })()

    const fechaIngresoLegacy = (searchParams.get('fechaIngreso') ?? '').trim()
    const fechaDesdeIngreso = (searchParams.get('fechaDesde') ?? fechaIngresoLegacy).trim()
    const fechaHastaIngreso = (searchParams.get('fechaHasta') ?? fechaIngresoLegacy).trim()

    return {
        criterioBusquedaPaciente,
        busquedaPaciente,
        usarFiltroFechaIngreso:
            searchParams.get('filtrarFecha') === '1' ||
            Boolean(fechaDesdeIngreso || fechaHastaIngreso),
        fechaDesdeIngreso,
        fechaHastaIngreso,
        usarFiltroTipoIngreso:
            searchParams.get('filtrarTipoIngreso') === '1' ||
            Boolean(searchParams.get('tipoIngresoCodigo')),
        tipoIngresoCodigo: (searchParams.get('tipoIngresoCodigo') ?? '').trim().toUpperCase(),
        obraSocialId: (searchParams.get('obraSocialId') ?? '').trim(),
        numeroIngreso: (searchParams.get('numeroIngreso') ?? '').trim(),
        numeroOrden: (searchParams.get('numeroOrden') ?? '').trim(),
        codigoPractica: (searchParams.get('codigoPractica') ?? '').trim().toUpperCase(),
    }
}

function buildBusquedaStateKey(state: BusquedaFacturacionState): string {
    return [
        state.criterioBusquedaPaciente,
        state.busquedaPaciente.trim(),
        state.usarFiltroFechaIngreso ? '1' : '0',
        state.fechaDesdeIngreso,
        state.fechaHastaIngreso,
        state.usarFiltroTipoIngreso ? '1' : '0',
        state.tipoIngresoCodigo,
        state.obraSocialId,
        state.numeroIngreso,
        state.numeroOrden,
        state.codigoPractica,
    ].join('|')
}

/**
 * Devuelve el porcentaje FINAL que se paga de cada componente, no un recargo.
 * 100 = sin cambios, 30 = se paga el 30%, 120 = se paga un 20% de mas.
 * Tiene que quedar alineado con aplicarDiferencialesAValores.
 */
function calcularPorcentajesDiferencial(diferenciales: PrestacionFacturableItem['diferenciales'] | null | undefined): {
    especialista: number
    gastos: number
} {
    if (!diferenciales) return { especialista: 100, gastos: 100 }
    if (diferenciales.aplicaDiferencial === false) return { especialista: 100, gastos: 100 }

    const esPrincipalDobleCirugia = Boolean(diferenciales.dobleCirugia && diferenciales.esPracticaBase)
    if (esPrincipalDobleCirugia) return { especialista: 100, gastos: 100 }

    const mismaVia = Boolean(diferenciales.mismaViaPatologia || diferenciales.mismaViaMismaPatologia)
    const distintaVia = Boolean(
        diferenciales.diferentesViasPatologia || diferenciales.diferentesViasDiferentesPatologia
    )

    const factorGastos = mismaVia ? 0.3 : distintaVia ? 0.5 : 1
    const factorEspecialista = mismaVia ? 0 : distintaVia ? 0.75 : 1
    const factorHorario =
        1 +
        (diferenciales.esFeriado ? 0.2 : 0) +
        (diferenciales.esNocturna ? 0.2 : 0)

    return {
        especialista: Math.round(factorEspecialista * factorHorario * 100),
        gastos: Math.round(factorGastos * factorHorario * 100),
    }
}

/**
 * El diferencial de cirugia solo recalcula gastos y honorario de especialista
 * (ver aplicarDiferencialesAValores: ayudante y anestesista quedan en null).
 * Una fila facturada de HA o A1 no queda desactualizada si se cambia el
 * diferencial, asi que no tiene por que congelarlo.
 *
 * Sin incluyeCodigo la practica es completa, o sea que arrastra gastos y
 * especialista: esa si cuenta.
 */
function componenteAfectadoPorDiferencial(incluyeCodigo: string | null | undefined): boolean {
    const normalizado = (incluyeCodigo ?? '').trim().toUpperCase()
    if (!normalizado) return true
    return normalizado
        .split('+')
        .map((parte) => parte.trim())
        .some((parte) => parte === 'GA' || parte === 'HE' || parte === 'HP')
}

function etiquetasCamposDiferencial(
    diferenciales: PrestacionFacturableItem['diferenciales'] | null | undefined
): string[] {
    if (!diferenciales) return []

    const porcentajes = calcularPorcentajesDiferencial(diferenciales)
    if (porcentajes.especialista === 100 && porcentajes.gastos === 100) {
        return ['Base 100%']
    }

    const etiquetas: string[] = []
    if (porcentajes.especialista !== 100) etiquetas.push(`Especialista y ayudante al ${porcentajes.especialista}%`)
    if (porcentajes.gastos !== 100) etiquetas.push(`Gastos al ${porcentajes.gastos}%`)
    return etiquetas
}

function etiquetasCamposDiferencialCirugia(draft: DiferencialesCirugiaEditState): string[] {
    const mismaVia = draft.mismaViaPatologia || draft.mismaViaMismaPatologia
    const distintaVia = draft.diferentesViasPatologia || draft.diferentesViasDiferentesPatologia

    const factorGastos = mismaVia ? 0.3 : distintaVia ? 0.5 : 1
    const factorEspecialista = mismaVia ? 0 : distintaVia ? 0.75 : 1
    const factorHorario = 1 + (draft.esFeriado ? 0.2 : 0) + (draft.esNocturna ? 0.2 : 0)

    const porcentajeEspecialista = Math.round(factorEspecialista * factorHorario * 100)
    const porcentajeGastos = Math.round(factorGastos * factorHorario * 100)

    const etiquetas: string[] = []
    if (porcentajeEspecialista !== 100) etiquetas.push(`Especialista y ayudante al ${porcentajeEspecialista}%`)
    if (porcentajeGastos !== 100) etiquetas.push(`Gastos al ${porcentajeGastos}%`)
    return etiquetas
}

function tieneNumeroAutorizacionValido(numeroAutorizacion: string | null | undefined): boolean {
    return typeof numeroAutorizacion === 'string' && numeroAutorizacion.trim().length > 0
}

function practicaTieneOrdenGenerada(p: PrestacionFacturableItem): boolean {
    return p.tipo === 'PRACTICA' && !p.facturada && (p.autorizacionesVinculadas?.length ?? 0) > 0
}

function practicaTieneAutorizacionConOrden(p: PrestacionFacturableItem): boolean {
    if (!practicaTieneOrdenGenerada(p)) return false
    return (
        tieneNumeroAutorizacionValido(p.numeroAutorizacion) ||
        (p.autorizacionesVinculadas ?? []).some((aut) => tieneNumeroAutorizacionValido(aut.numeroAutorizacion))
    )
}

function esPrestacionSeleccionableParaFacturar(p: PrestacionFacturableItem): boolean {
    return (
        p.tipo === 'PRACTICA' &&
        Boolean(p.codigoPractica) &&
        p.convenioId !== null &&
        !p.facturada &&
        practicaTieneOrdenGenerada(p) &&
        practicaTieneAutorizacionConOrden(p)
    )
}

function tieneDesglose(d: { valorEspecialista: number | null, valorAyudante: number | null, valorAnestesista: number | null, valorGastos: number | null }): boolean {
    return d.valorEspecialista !== null || d.valorAyudante !== null || d.valorAnestesista !== null || d.valorGastos !== null
}

function normalizarCodigoPractica(value: string | null | undefined): string {
    return (value ?? '').trim().slice(0, 8).toUpperCase()
}

function esCodigoHeConOpcionHa(codigoPractica: string | null | undefined): boolean {
    return normalizarCodigoPractica(codigoPractica) === '420303'
}

function esCodigoHaObligatorio(codigoPractica: string | null | undefined): boolean {
    return normalizarCodigoPractica(codigoPractica).startsWith('16')
}

function esCodigoPatologiaPorDefecto(codigoPractica: string | null | undefined): boolean {
    return normalizarCodigoPractica(codigoPractica).startsWith('15')
}

function clasificacionEspecialistaPorDefecto(codigoPractica: string | null | undefined): Extract<ClasificacionToken, 'HE' | 'HA' | 'HP'> {
    if (esCodigoHaObligatorio(codigoPractica)) return 'HA'
    if (esCodigoPatologiaPorDefecto(codigoPractica)) return 'HP'
    return 'HE'
}

function obtenerDesgloseSelector(p: PrestacionFacturableItem): ComponenteValores | null {
    if (!p.desglose) {
        if (p.precioUnitario == null) return null
        return {
            valorEspecialista: null,
            valorAyudante: null,
            valorAnestesista: null,
            valorGastos: null,
            valorTotal: p.precioUnitario,
        }
    }
    if (!esCodigoHeConOpcionHa(p.codigoPractica) && !esCodigoHaObligatorio(p.codigoPractica)) {
        return p.desglose
    }

    if (p.desglose.valorEspecialista != null && p.desglose.valorAnestesista != null) return p.desglose

    return {
        ...p.desglose,
        valorEspecialista: p.desglose.valorEspecialista ?? p.desglose.valorAnestesista,
        valorAnestesista: p.desglose.valorAnestesista ?? p.desglose.valorEspecialista,
    }
}

function parseIncluyeCodigoSeleccion(incluyeCodigo: string | null | undefined): ComponenteSeleccion | null {
    const normalized = (incluyeCodigo ?? '').trim().toUpperCase()
    if (!normalized || normalized === 'COMPLETA') return null

    const parts = normalized
        .split('+')
        .map((part) => part.trim())
        .filter((part) => /^(GA|HE|HA|HP|A[1-3])$/.test(part))

    if (parts.length === 0) return null

    return {
        especialista: parts.filter((part) => part === 'HE' || part === 'HP').length,
        ayudante: Math.min(3, parts.filter((part) => /^A[1-3]$/.test(part)).length),
        anestesista: parts.filter((part) => part === 'HA').length,
        gastos: parts.filter((part) => part === 'GA').length,
    }
}

function normalizarCantidadSeleccion(cantidad: number, maximo?: number): number {
    if (!Number.isFinite(cantidad) || cantidad <= 0) return 0
    const normalizada = Math.floor(cantidad)
    return typeof maximo === 'number' ? Math.min(normalizada, maximo) : normalizada
}

function cantidadSeleccionadaComponente(
    seleccion: ComponenteSeleccion,
    componente: keyof ComponenteSeleccion
): number {
    const limite = componente === 'ayudante' ? 3 : undefined
    return normalizarCantidadSeleccion(Number(seleccion[componente] ?? 0), limite)
}

function clasificacionPorDefectoComponente(
    componente: keyof ComponenteSeleccion,
    posicion: number,
    codigoPractica?: string | null
): ClasificacionToken {
    if (componente === 'ayudante') {
        const idx = Math.min(Math.max(1, posicion + 1), 3)
        return `A${idx}` as ClasificacionToken
    }
    if (componente === 'anestesista') return 'HA'
    if (componente === 'gastos') return 'GA'
    return clasificacionEspecialistaPorDefecto(codigoPractica)
}

function normalizarClasificacionToken(
    value: string | null | undefined,
    fallback: ClasificacionToken
): string {
    const raw = (value ?? '').trim().toUpperCase().replace(/\s+/g, '')
    if (/^(GA|HE|HA|HP|A[1-3])$/.test(raw)) return raw

    const normalizada = normalizarClasificacionAgrupacion(raw)
    if (normalizada && /^(GA|HE|HA|HP|A[1-3])$/.test(normalizada)) {
        return normalizada
    }

    return fallback
}

function normalizarClasificacionInput(value: string | null | undefined): string {
    return (value ?? '').trim().toUpperCase().replace(/\s+/g, '')
}

function construirClasificacionesPorComponenteUI(
    seleccion: ComponenteSeleccion,
    estadoActual?: ClasificacionPorComponenteState,
    codigoPractica?: string | null
): {
    clasificacionesPorComponente: ClasificacionPorComponenteUi
    indexMap: Record<number, { componente: keyof ComponenteSeleccion; posicion: number; fallback: ClasificacionToken }>
} {
    const clasificacionesPorComponente: ClasificacionPorComponenteUi = {}
    const indexMap: Record<number, { componente: keyof ComponenteSeleccion; posicion: number; fallback: ClasificacionToken }> = {}
    let globalIndex = 0

    for (const componente of ORDEN_COMPONENTES_CLASIFICACION) {
        const cantidad = cantidadSeleccionadaComponente(seleccion, componente)
        if (cantidad <= 0) continue

        const actuales = estadoActual?.[componente] ?? []
        const filas: Array<{ index: number; label: string; value: string }> = []

        for (let posicion = 0; posicion < cantidad; posicion += 1) {
            const fallback = clasificacionPorDefectoComponente(componente, posicion, codigoPractica)
            const valorActual = actuales[posicion]
            const tieneValorActual = valorActual !== undefined && valorActual !== null
            const rawValue = normalizarClasificacionInput(valorActual)
            const value = tieneValorActual ? rawValue : fallback
            const index = globalIndex

            filas.push({
                index,
                label: cantidad > 1 ? `#${posicion + 1}` : 'Sigla',
                value,
            })

            indexMap[index] = { componente, posicion, fallback }
            globalIndex += 1
        }

        if (filas.length > 0) {
            clasificacionesPorComponente[componente] = filas
        }
    }

    return { clasificacionesPorComponente, indexMap }
}

function resumenSubitemsIncluidos(incluyeCodigo: string | null | undefined): string {
    const seleccion = parseIncluyeCodigoSeleccion(incluyeCodigo)
    if (!seleccion) return ''

    const cantidadPatologia = (incluyeCodigo ?? '')
        .trim()
        .toUpperCase()
        .split('+')
        .map((part) => part.trim())
        .filter((part) => part === 'HP').length

    const partes: string[] = []
    if (seleccion.gastos > 0) partes.push(`GA x${seleccion.gastos}`)
    if (cantidadPatologia > 0) {
        partes.push(`HP x${cantidadPatologia}`)
        const cantidadHe = Math.max(0, seleccion.especialista - cantidadPatologia)
        if (cantidadHe > 0) partes.push(`HE x${cantidadHe}`)
    } else if (seleccion.especialista > 0) {
        partes.push(`HE x${seleccion.especialista}`)
    }
    if (seleccion.anestesista > 0) partes.push(`HA x${seleccion.anestesista}`)
    if (seleccion.ayudante > 0) partes.push(`Ayudante x${seleccion.ayudante}`)

    return partes.length > 0 ? partes.join(' · ') : ''
}

function incluyeTieneAyudante(incluyeCodigo: string | null | undefined): boolean {
    const seleccion = parseIncluyeCodigoSeleccion(incluyeCodigo)
    return Boolean(seleccion && seleccion.ayudante > 0)
}

function incluyeTieneEspecialista(incluyeCodigo: string | null | undefined): boolean {
    const seleccion = parseIncluyeCodigoSeleccion(incluyeCodigo)
    return Boolean(seleccion && seleccion.especialista > 0)
}

function incluyeTieneAnestesista(incluyeCodigo: string | null | undefined): boolean {
    const seleccion = parseIncluyeCodigoSeleccion(incluyeCodigo)
    return Boolean(seleccion && seleccion.anestesista > 0)
}

function incluyeTienePatologia(incluyeCodigo: string | null | undefined): boolean {
    const normalized = (incluyeCodigo ?? '').trim().toUpperCase()
    if (!normalized || normalized === 'COMPLETA') return false
    return normalized
        .split('+')
        .map((part) => part.trim())
        .some((part) => part === 'HP')
}

function descripcionEsAyudante(value: string | null | undefined): boolean {
    const text = (value ?? '').toUpperCase()
    return text.includes('AYUD') || text.includes('[A1') || text.includes('[A2') || text.includes('[A3')
}

function descripcionEsAnestesista(value: string | null | undefined): boolean {
    const text = (value ?? '').toUpperCase()
    return text.includes('ANEST') || text.includes('[HA')
}

function mostrarCampoMatriculaAyudante(
    p: PrestacionFacturableItem,
    desglose: ComponenteValores | null
): boolean {
    return (
        incluyeTieneAyudante(p.incluyeCodigo) ||
        (desglose?.valorAyudante ?? null) !== null ||
        (!p.incluyeCodigo && descripcionEsAyudante(p.descripcion))
    )
}

function mostrarCampoMatriculaAnestesista(
    p: PrestacionFacturableItem,
    desglose: ComponenteValores | null
): boolean {
    return (
        incluyeTieneAnestesista(p.incluyeCodigo) ||
        (desglose?.valorAnestesista ?? null) !== null ||
        (!p.incluyeCodigo && descripcionEsAnestesista(p.descripcion))
    )
}

function construirIncluyeCodigoDesdeSeleccion(
    valores: ComponenteValores | null,
    seleccion: ComponenteSeleccion | null | undefined,
    incluyeCodigoActual?: string | null,
    clasificacionesPorComponente?: ClasificacionPorComponenteState,
    codigoPractica?: string | null
): string | null {
    if (!valores || !seleccion) return null

    const espDisp = valores.valorEspecialista != null
    const ayuDisp = valores.valorAyudante != null
    const aneDisp = valores.valorAnestesista != null
    const gasDisp = valores.valorGastos != null

    const esCompleta =
        (espDisp ? seleccion.especialista === 1 : seleccion.especialista === 0) &&
        (ayuDisp ? seleccion.ayudante === 1 : seleccion.ayudante === 0) &&
        (aneDisp ? seleccion.anestesista === 1 : seleccion.anestesista === 0) &&
        (gasDisp ? seleccion.gastos === 1 : seleccion.gastos === 0)

    const hayClasificacionPersonalizada = ORDEN_COMPONENTES_CLASIFICACION.some((componente) => {
        const valoresComponente = clasificacionesPorComponente?.[componente] ?? []
        return valoresComponente.some((v) => (v ?? '').trim().length > 0)
    })

    if (hayClasificacionPersonalizada) {
        const codigosPersonalizados: string[] = []

        const agregarCodigos = (componente: keyof ComponenteSeleccion, cantidad: number) => {
            const valoresComponente = clasificacionesPorComponente?.[componente] ?? []
            for (let i = 0; i < cantidad; i += 1) {
                const fallback = clasificacionPorDefectoComponente(componente, i, codigoPractica)
                codigosPersonalizados.push(normalizarClasificacionToken(valoresComponente[i], fallback))
            }
        }

        if (gasDisp) agregarCodigos('gastos', normalizarCantidadSeleccion(seleccion.gastos))
        if (espDisp) agregarCodigos('especialista', normalizarCantidadSeleccion(seleccion.especialista))
        if (aneDisp) agregarCodigos('anestesista', normalizarCantidadSeleccion(seleccion.anestesista))
        if (ayuDisp) agregarCodigos('ayudante', normalizarCantidadSeleccion(seleccion.ayudante, 3))

        if (codigosPersonalizados.length > 0) {
            return codigosPersonalizados.join('+')
        }
    }

    if (esCompleta) {
        const actual = (incluyeCodigoActual ?? '').trim().toUpperCase()
        return actual && actual !== 'COMPLETA' ? actual : null
    }

    const codigos: string[] = []
    if (gasDisp) {
        const cantidadGastos = normalizarCantidadSeleccion(seleccion.gastos)
        for (let i = 0; i < cantidadGastos; i += 1) codigos.push('GA')
    }
    if (espDisp) {
        const cantidadEspecialista = normalizarCantidadSeleccion(seleccion.especialista)
        const codigoEspecialistaDefault = clasificacionEspecialistaPorDefecto(codigoPractica)
        for (let i = 0; i < cantidadEspecialista; i += 1) codigos.push(codigoEspecialistaDefault)
    }
    if (aneDisp) {
        const cantidadAnestesista = normalizarCantidadSeleccion(seleccion.anestesista)
        for (let i = 0; i < cantidadAnestesista; i += 1) codigos.push('HA')
    }
    if (seleccion.ayudante > 0 && ayuDisp) {
        const cantidadAyudantes = normalizarCantidadSeleccion(seleccion.ayudante, 3)
        for (let i = 1; i <= cantidadAyudantes; i += 1) {
            codigos.push(`A${i}`)
        }
    }

    return codigos.length > 0 ? codigos.join('+') : null
}

type EditState = {
    fecha: string
    codigoPractica: string
    descripcion: string
    cantidad: string
    numeroAutorizacion: string
    importeTotal: string
    matriculaAyudante: string
    matriculaEspecialista: string
    matriculaAnestesista: string
}

function parseMatricula(value: string | number | null | undefined): number | null {
    if (typeof value === 'number') {
        return Number.isFinite(value) && value > 0 ? value : null
    }
    if (typeof value !== 'string') return null
    const parsed = Number.parseInt(value.trim(), 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function obtenerNumeroOrdenPrestacion(
    p: PrestacionFacturableItem,
    autorizacionesVinculadasOrdenadas: AutorizacionVinculadaExtendida[]
): string {
    if (p.ordenPuestoNumero && p.ordenNumero) {
        return formatOrderNumber(p.ordenPuestoNumero, p.ordenNumero)
    }

    if (p.origen.ordenPuestoNumero && p.origen.ordenNumero) {
        return formatOrderNumber(p.origen.ordenPuestoNumero, p.origen.ordenNumero)
    }

    const aut = autorizacionesVinculadasOrdenadas[0]
    if (aut) {
        return formatOrderNumber(aut.ordenPuestoNumero, aut.ordenNumero)
    }

    return '—'
}

function obtenerDestinoOrdenPrestacion(
    p: PrestacionFacturableItem,
    autorizacionesVinculadasOrdenadas: AutorizacionVinculadaExtendida[]
): string | null {
    const ordenPuestoNumero =
        p.ordenPuestoNumero ??
        p.origen.ordenPuestoNumero ??
        autorizacionesVinculadasOrdenadas[0]?.ordenPuestoNumero ??
        null
    const ordenNumero =
        p.ordenNumero ??
        p.origen.ordenNumero ??
        autorizacionesVinculadasOrdenadas[0]?.ordenNumero ??
        null

    if (!ordenPuestoNumero || !ordenNumero) return null
    return `/dashboard/ambulatorio/${ordenPuestoNumero}/${ordenNumero}`
}

type ItemOrdenRelacionado = {
    ordenPuestoNumero: number
    ordenNumero: number
    ordenItem: number
}

function keyItemOrdenRelacionado(item: ItemOrdenRelacionado): string {
    return `${item.ordenPuestoNumero}:${item.ordenNumero}:${item.ordenItem}`
}

function obtenerItemsOrdenRelacionados(
    p: PrestacionFacturableItem,
    autorizacionesVinculadasOrdenadas: AutorizacionVinculadaExtendida[]
): ItemOrdenRelacionado[] {
    const items: ItemOrdenRelacionado[] = []

    if (p.origen.ordenPuestoNumero && p.origen.ordenNumero && p.origen.ordenItem) {
        items.push({
            ordenPuestoNumero: p.origen.ordenPuestoNumero,
            ordenNumero: p.origen.ordenNumero,
            ordenItem: p.origen.ordenItem,
        })
    }

    for (const aut of autorizacionesVinculadasOrdenadas) {
        items.push({
            ordenPuestoNumero: aut.ordenPuestoNumero,
            ordenNumero: aut.ordenNumero,
            ordenItem: aut.ordenItem,
        })
    }

    const unicos = new Map<string, ItemOrdenRelacionado>()
    for (const item of items) {
        unicos.set(keyItemOrdenRelacionado(item), item)
    }

    return Array.from(unicos.values()).sort((a, b) => {
        if (a.ordenPuestoNumero !== b.ordenPuestoNumero) {
            return a.ordenPuestoNumero - b.ordenPuestoNumero
        }
        if (a.ordenNumero !== b.ordenNumero) {
            return a.ordenNumero - b.ordenNumero
        }
        return a.ordenItem - b.ordenItem
    })
}

function obtenerMatriculaEjecutanteNumero(
    p: PrestacionFacturableItem,
    draft: EditState,
    autorizacionesVinculadasOrdenadas: AutorizacionVinculadaExtendida[]
): number | null {
    const matriculaEspecialistaDraft = parseMatricula(draft.matriculaEspecialista)
    if (matriculaEspecialistaDraft) return matriculaEspecialistaDraft

    if (p.matriculaEspecialista && p.matriculaEspecialista > 0) {
        return p.matriculaEspecialista
    }

    const matriculaAyudanteDraft = parseMatricula(draft.matriculaAyudante)
    if (matriculaAyudanteDraft) return matriculaAyudanteDraft

    if (p.matriculaAnestesista && p.matriculaAnestesista > 0) {
        return p.matriculaAnestesista
    }

    if (p.matriculaProfesional && p.matriculaProfesional > 0) {
        return p.matriculaProfesional
    }

    const aut = autorizacionesVinculadasOrdenadas[0]
    if (!aut) return null
    if (aut.matriculaEspecialista && aut.matriculaEspecialista > 0) return aut.matriculaEspecialista
    if (aut.matriculaAyudante && aut.matriculaAyudante > 0) return aut.matriculaAyudante
    if (aut.matriculaAnestesista && aut.matriculaAnestesista > 0) return aut.matriculaAnestesista
    if (aut.matriculaProfesional && aut.matriculaProfesional > 0) return aut.matriculaProfesional

    return null
}

function obtenerMatriculaEjecutante(
    p: PrestacionFacturableItem,
    draft: EditState,
    autorizacionesVinculadasOrdenadas: AutorizacionVinculadaExtendida[]
): string {
    const matricula = obtenerMatriculaEjecutanteNumero(p, draft, autorizacionesVinculadasOrdenadas)
    return matricula ? `MP ${matricula}` : '—'
}

function obtenerOrdenParaOrdenamiento(
    p: PrestacionFacturableItem
): { puestoNumero: number; ordenNumero: number } | null {
    if (p.ordenPuestoNumero && p.ordenNumero) {
        return { puestoNumero: p.ordenPuestoNumero, ordenNumero: p.ordenNumero }
    }

    if (p.origen.ordenPuestoNumero && p.origen.ordenNumero) {
        return {
            puestoNumero: p.origen.ordenPuestoNumero,
            ordenNumero: p.origen.ordenNumero,
        }
    }

    const vinculadas = p.autorizacionesVinculadas ?? []
    if (vinculadas.length === 0) return null

    let primera = vinculadas[0]
    if (!primera) return null

    for (const actual of vinculadas) {
        if (actual.ordenPuestoNumero < primera.ordenPuestoNumero) {
            primera = actual
            continue
        }
        if (
            actual.ordenPuestoNumero === primera.ordenPuestoNumero &&
            actual.ordenNumero < primera.ordenNumero
        ) {
            primera = actual
        }
    }

    return {
        puestoNumero: primera.ordenPuestoNumero,
        ordenNumero: primera.ordenNumero,
    }
}

function esPrestacionCirugiaMultiple(p: PrestacionFacturableItem): boolean {
    const diferenciales = p.diferenciales
    if (!diferenciales) return false
    return Boolean(
        diferenciales.dobleCirugia ||
        diferenciales.mismaViaPatologia ||
        diferenciales.mismaViaMismaPatologia ||
        diferenciales.diferentesViasPatologia ||
        diferenciales.diferentesViasDiferentesPatologia
    )
}

type OrdenRelacionada = {
    ordenPuestoNumero: number
    ordenNumero: number
}

function keyOrdenRelacionada(orden: OrdenRelacionada): string {
    return `${orden.ordenPuestoNumero}:${orden.ordenNumero}`
}

function obtenerOrdenesRelacionadasPrestacion(p: PrestacionFacturableItem): OrdenRelacionada[] {
    const ordenes: OrdenRelacionada[] = []

    const ordenDirecta = obtenerOrdenParaOrdenamiento(p)
    if (ordenDirecta) {
        ordenes.push({
            ordenPuestoNumero: ordenDirecta.puestoNumero,
            ordenNumero: ordenDirecta.ordenNumero,
        })
    }

    for (const aut of p.autorizacionesVinculadas ?? []) {
        ordenes.push({
            ordenPuestoNumero: aut.ordenPuestoNumero,
            ordenNumero: aut.ordenNumero,
        })
    }

    const unicas = new Map<string, OrdenRelacionada>()
    for (const orden of ordenes) {
        unicas.set(keyOrdenRelacionada(orden), orden)
    }

    return Array.from(unicas.values()).sort((a, b) => {
        if (a.ordenPuestoNumero !== b.ordenPuestoNumero) {
            return a.ordenPuestoNumero - b.ordenPuestoNumero
        }
        return a.ordenNumero - b.ordenNumero
    })
}

function prioridadTipoPrestacionParaGrilla(p: PrestacionFacturableItem): number {
    if (p.tipo === 'PRACTICA') return 0
    if (p.tipo === 'MEDICACION') return 1
    if (p.tipo === 'DESCARTABLE') return 2
    return 3
}

type AutorizacionVinculada = NonNullable<PrestacionFacturableItem['autorizacionesVinculadas']>[number]

function keyAutorizacionVinculada(aut: AutorizacionVinculada): string {
    return `${aut.ordenPuestoNumero}:${aut.ordenNumero}:${aut.ordenItem}`
}

function keyAutorizacionOrden(puestoNumero: number, ordenNumero: number): string {
    return `ORD:${puestoNumero}:${ordenNumero}`
}

function obtenerNumeroAutorizacionOrdenDesdeItems(
    items: PrestacionFacturableItem[],
    puestoNumero: number,
    ordenNumero: number
): string {
    for (const item of items) {
        if (tieneNumeroAutorizacionValido(item.numeroAutorizacion)) {
            return item.numeroAutorizacion!.trim()
        }

        for (const aut of item.autorizacionesVinculadas ?? []) {
            if (
                aut.ordenPuestoNumero === puestoNumero &&
                aut.ordenNumero === ordenNumero &&
                tieneNumeroAutorizacionValido(aut.numeroAutorizacion)
            ) {
                return aut.numeroAutorizacion!.trim()
            }
        }
    }

    return ''
}

function buildAutorizacionesVinculadasEditState(p: PrestacionFacturableItem): Record<string, string> {
    const state: Record<string, string> = {}
    for (const aut of p.autorizacionesVinculadas ?? []) {
        state[keyAutorizacionVinculada(aut)] = aut.numeroAutorizacion ?? ''
    }
    return state
}

const MATRICULA_AYUDANTE_DEFAULT = 995
const MATRICULA_PATOLOGIA_DEFAULT = 2675
const ADMISIONES_POR_PAGINA_DEFAULT = 12
const PRESTACIONES_POR_PAGINA_DEFAULT = 12
const CRITERIOS_BUSQUEDA_PACIENTE: Array<{ value: CriterioBusquedaPaciente; label: string; placeholder: string }> = [
    { value: 'NOMBRE', label: 'Nombre paciente', placeholder: 'Ej: Perez, Ana' },
    { value: 'HC', label: 'Nro HC', placeholder: 'Ej: 10234' },
    { value: 'DNI', label: 'Nro DNI', placeholder: 'Ej: 28456789' },
]
const TIPOS_INGRESO_FILTRO = ['INT', 'AMB', 'GUA']

function incluyeSoloAyudante(incluyeCodigo: string | null | undefined): boolean {
    const seleccion = parseIncluyeCodigoSeleccion(incluyeCodigo)
    if (!seleccion) return false
    return (
        seleccion.ayudante > 0 &&
        seleccion.especialista === 0 &&
        seleccion.anestesista === 0 &&
        seleccion.gastos === 0
    )
}

function buildEditState(p: PrestacionFacturableItem): EditState {
    const soloAyudante = incluyeSoloAyudante(p.incluyeCodigo)
    const tieneAyudante = incluyeTieneAyudante(p.incluyeCodigo) || (!p.incluyeCodigo && descripcionEsAyudante(p.descripcion))
    const tieneEspecialista = incluyeTieneEspecialista(p.incluyeCodigo)
    const tienePatologia = incluyeTienePatologia(p.incluyeCodigo) || esCodigoPatologiaPorDefecto(p.codigoPractica)
    return {
        fecha: toDateInput(p.fecha),
        codigoPractica: p.codigoPractica ?? '',
        descripcion: p.descripcion,
        cantidad: String(p.cantidad ?? 1),
        numeroAutorizacion: p.numeroAutorizacion ?? '',
        importeTotal: String(p.importeTotal ?? 0),
        matriculaAyudante: tieneAyudante ? String(MATRICULA_AYUDANTE_DEFAULT) : '',
        matriculaEspecialista: (!soloAyudante || tieneEspecialista)
            ? (p.matriculaEspecialista
                ? String(p.matriculaEspecialista)
                : (tienePatologia ? String(MATRICULA_PATOLOGIA_DEFAULT) : ''))
            : '',
        matriculaAnestesista: p.matriculaAnestesista ? String(p.matriculaAnestesista) : '',
    }
}

function actualizarCantidadPrestacion(draft: EditState, cantidadNuevaRaw: string): EditState {
    const cantidadAnterior = Number(draft.cantidad)
    const cantidadNueva = Number(cantidadNuevaRaw)
    const importeAnterior = Number(draft.importeTotal)

    if (cantidadNuevaRaw === '' || !Number.isFinite(cantidadNueva) || cantidadNueva <= 0) {
        return { ...draft, cantidad: cantidadNuevaRaw }
    }

    return {
        ...draft,
        cantidad: cantidadNuevaRaw,
        importeTotal: String(recalcularImportePorCambioCantidad(
            cantidadAnterior,
            importeAnterior,
            cantidadNueva
        )),
    }
}

function buildDiferencialesCirugiaState(cirugia: CirugiaEditableGroup): DiferencialesCirugiaEditState {
    const resolverIdAgrupado = (practicaId: number | null | undefined): number | null => {
        if (!practicaId) return null
        const match = cirugia.practicas.find((practica) =>
            practica.practicaId === practicaId || practica.practicaIdsAgrupadas.includes(practicaId)
        )
        return match?.practicaId ?? null
    }

    const baseIdActual = resolverIdAgrupado(cirugia.diferenciales?.practicaBaseId ?? null)
    const secundariaIdActual = resolverIdAgrupado(cirugia.diferenciales?.practicaSecundariaId ?? null)
    const baseIdPorMayorTotal =
        [...cirugia.practicas]
            .sort((a, b) => b.importeTotalReferencia - a.importeTotalReferencia)[0]?.practicaId ??
        cirugia.practicas[0]?.practicaId ??
        null
    const secundariaIdPorMayorTotal =
        [...cirugia.practicas]
            .sort((a, b) => b.importeTotalReferencia - a.importeTotalReferencia)
            .find((practica) => practica.practicaId !== (baseIdActual ?? baseIdPorMayorTotal))?.practicaId ??
        null
    const dobleCirugia = Boolean(cirugia.diferenciales?.dobleCirugia)
    const baseIdFinal = dobleCirugia ? (baseIdActual ?? baseIdPorMayorTotal) : baseIdActual
    const secundariaIdFinal =
        dobleCirugia
            ? ((secundariaIdActual && secundariaIdActual !== baseIdFinal
                ? secundariaIdActual
                : secundariaIdPorMayorTotal) ?? null)
            : secundariaIdActual

    return {
        esFeriado: Boolean(cirugia.diferenciales?.esFeriado),
        esNocturna: Boolean(cirugia.diferenciales?.esNocturna),
        mismaViaPatologia: Boolean(cirugia.diferenciales?.mismaViaPatologia),
        mismaViaMismaPatologia: Boolean(cirugia.diferenciales?.mismaViaMismaPatologia),
        diferentesViasPatologia: Boolean(cirugia.diferenciales?.diferentesViasPatologia),
        diferentesViasDiferentesPatologia: Boolean(cirugia.diferenciales?.diferentesViasDiferentesPatologia),
        dobleCirugia,
        practicaBaseId: baseIdFinal ? String(baseIdFinal) : '',
        practicaSecundariaId: secundariaIdFinal ? String(secundariaIdFinal) : '',
    }
}

type FacturacionPanelProps = {
    vista?: 'PENDIENTES' | 'FACTURADAS'
}

export function FacturacionPanel({ vista = 'PENDIENTES' }: FacturacionPanelProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const estadoBusquedaInicial = resolverEstadoBusquedaDesdeQuery(searchParams)

    const [criterioBusquedaPaciente, setCriterioBusquedaPaciente] = useState<CriterioBusquedaPaciente>(
        estadoBusquedaInicial.criterioBusquedaPaciente
    )
    const [busquedaPaciente, setBusquedaPaciente] = useState(estadoBusquedaInicial.busquedaPaciente)
    const [usarFiltroFechaIngreso, setUsarFiltroFechaIngreso] = useState(estadoBusquedaInicial.usarFiltroFechaIngreso)
    const [fechaDesdeIngreso, setFechaDesdeIngreso] = useState(estadoBusquedaInicial.fechaDesdeIngreso)
    const [fechaHastaIngreso, setFechaHastaIngreso] = useState(estadoBusquedaInicial.fechaHastaIngreso)
    const [usarFiltroTipoIngreso, setUsarFiltroTipoIngreso] = useState(estadoBusquedaInicial.usarFiltroTipoIngreso)
    const [tipoIngresoCodigo, setTipoIngresoCodigo] = useState(estadoBusquedaInicial.tipoIngresoCodigo)
    const [obraSocialId, setObraSocialId] = useState(estadoBusquedaInicial.obraSocialId)
    const [numeroIngreso, setNumeroIngreso] = useState(estadoBusquedaInicial.numeroIngreso)
    const [numeroOrden, setNumeroOrden] = useState(estadoBusquedaInicial.numeroOrden)
    const [codigoPractica, setCodigoPractica] = useState(estadoBusquedaInicial.codigoPractica)

    const [buscando, setBuscando] = useState(false)
    const [admisiones, setAdmisiones] = useState<AdmisionFacturacionListItem[]>([])
    const [totalAdmisiones, setTotalAdmisiones] = useState(0)
    const [paginaAdmisiones, setPaginaAdmisiones] = useState(1)
    const [porPaginaAdmisiones] = useState(ADMISIONES_POR_PAGINA_DEFAULT)
    const [selectedIngresoId, setSelectedIngresoId] = useState<number | null>(() =>
        parseEnteroPositivo(searchParams.get('ingresoId'))
    )
    const [, setAutoSeleccionBusquedaDirecta] = useState(false)
    const [mostrarCoincidenciasBusqueda, setMostrarCoincidenciasBusqueda] = useState(true)
    const ultimoEstadoBusquedaAutoRef = useRef('')

    const [cargandoContexto, setCargandoContexto] = useState(false)
    const [contexto, setContexto] = useState<FacturacionContexto | null>(null)

    const [editandoFicha, setEditandoFicha] = useState(false)
    const [guardandoFicha, setGuardandoFicha] = useState(false)

    const [guardandoPractica, setGuardandoPractica] = useState(false)
    const [guardandoMedicacion, setGuardandoMedicacion] = useState(false)
    const [guardandoDescartable, setGuardandoDescartable] = useState(false)
    const [cargandoOrdenes, setCargandoOrdenes] = useState(false)

    const [mensaje, setMensaje] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [opcionesObraSociales, setOpcionesObraSociales] = useState<ObraSocialFiltroItem[]>([])
    const [cargandoObraSociales, setCargandoObraSociales] = useState(false)

    const [seleccion, setSeleccion] = useState<Record<string, boolean>>({})

    const [formIngresoNombre, setFormIngresoNombre] = useState('')
    const [formDescripcionPatologia, setFormDescripcionPatologia] = useState('')
    const [formNumeroAfiliado, setFormNumeroAfiliado] = useState('')
    const [formObservaciones, setFormObservaciones] = useState('')
    const [formPacienteNombreCompleto, setFormPacienteNombreCompleto] = useState('')
    const [formPacienteCelular, setFormPacienteCelular] = useState('')
    const [formPacienteEmail, setFormPacienteEmail] = useState('')
    const [formPacienteDomicilio, setFormPacienteDomicilio] = useState('')

    const [expandNuevaPractica, setExpandNuevaPractica] = useState(false)
    const [expandPedidoLaboratorio, setExpandPedidoLaboratorio] = useState(false)
    const [expandNuevaMedicacion, setExpandNuevaMedicacion] = useState(false)
    const [expandNuevoDescartable, setExpandNuevoDescartable] = useState(false)

    // Nueva práctica — búsqueda nomenclador + componentes
    const [npBusqueda, setNpBusqueda] = useState('')
    const [npResultados, setNpResultados] = useState<NomencladorItem[]>([])
    const [npBuscando, setNpBuscando] = useState(false)
    const [npSeleccionada, setNpSeleccionada] = useState<NomencladorItem | null>(null)
    const [npComponentes, setNpComponentes] = useState<ComponenteSeleccion>({
        especialista: 0, ayudante: 0, anestesista: 0, gastos: 0,
    })
    const [nuevaPracticaFecha, setNuevaPracticaFecha] = useState(() => toDateInput(new Date()))
    const [nuevaPracticaAutorizacion, setNuevaPracticaAutorizacion] = useState('')
    const [numeroProtocoloLaboratorio, setNumeroProtocoloLaboratorio] = useState('')
    const [diagnosticoLaboratorio, setDiagnosticoLaboratorio] = useState('')
    const [guardandoPedidoLaboratorio, setGuardandoPedidoLaboratorio] = useState(false)
    const npDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const [nuevaMedicacionNombre, setNuevaMedicacionNombre] = useState('')
    const [nuevaMedicacionFecha, setNuevaMedicacionFecha] = useState(() => toDateInput(new Date()))

    const [nuevoDescartableNombre, setNuevoDescartableNombre] = useState('')
    const [opcionesInsumosUti, setOpcionesInsumosUti] = useState<Array<{ id: number; nombre: string }>>([])
    const [cargandoInsumosUti, setCargandoInsumosUti] = useState(false)

    const [editRows, setEditRows] = useState<Record<string, EditState>>({})
    const [editAutorizacionesVinculadas, setEditAutorizacionesVinculadas] = useState<Record<string, Record<string, string>>>({})
    const [editAutorizacionOrden, setEditAutorizacionOrden] = useState<Record<string, string>>({})
    const [guardandoAutorizacionOrdenKey, setGuardandoAutorizacionOrdenKey] = useState<string | null>(null)
    const [rowEditMode, setRowEditMode] = useState<Record<string, boolean>>({})
    const [aplicarOrdenCompletaPorFila, setAplicarOrdenCompletaPorFila] = useState<Record<string, boolean>>({})
    const [detallePrestacionesExpand, setDetallePrestacionesExpand] = useState<Record<string, boolean>>({})
    const [guardandoRowUid, setGuardandoRowUid] = useState<string | null>(null)
    const [ordenesExpand, setOrdenesExpand] = useState<Record<string, boolean>>({})
    const [ordenesPendientesExpand, setOrdenesPendientesExpand] = useState<Record<string, boolean>>({})
    const [filtroPrestaciones, setFiltroPrestaciones] = useState('')
    const [paginaPrestaciones, setPaginaPrestaciones] = useState(1)
    const [porPaginaPrestaciones, setPorPaginaPrestaciones] = useState(PRESTACIONES_POR_PAGINA_DEFAULT)
    const [anulando, setAnulando] = useState<string | null>(null)
    const [guardandoDiferencialCirugiaId, setGuardandoDiferencialCirugiaId] = useState<number | null>(null)
    const [mostrarImportadorNomenclador, setMostrarImportadorNomenclador] = useState(false)
    const [creandoOrdenPracticaUid, setCreandoOrdenPracticaUid] = useState<string | null>(null)
    const [confirmacion, setConfirmacion] = useState<ConfirmacionPendiente | null>(null)

    // Component selection per practice uid
    const [compSeleccion, setCompSeleccion] = useState<Record<string, ComponenteSeleccion>>({})
    const [clasificacionPorComponenteUid, setClasificacionPorComponenteUid] = useState<Record<string, ClasificacionPorComponenteState>>({})
    const [diferencialesCirugiaEdit, setDiferencialesCirugiaEdit] = useState<Record<number, DiferencialesCirugiaEditState>>({})

    // Auto-dismiss success toast after 3.5 s
    useEffect(() => {
        if (!mensaje) return
        const t = setTimeout(() => setMensaje(null), 3500)
        return () => clearTimeout(t)
    }, [mensaje])

    useEffect(() => {
        let activo = true

        const cargarInsumos = async () => {
            setCargandoInsumosUti(true)
            try {
                const res = await fetch('/api/catalogos/insumos-uti?limit=5000')
                const json = await res.json()
                if (!activo) return
                setOpcionesInsumosUti(Array.isArray(json.data) ? json.data : [])
            } catch {
                if (activo) setOpcionesInsumosUti([])
            } finally {
                if (activo) setCargandoInsumosUti(false)
            }
        }

        void cargarInsumos()
        return () => {
            activo = false
        }
    }, [])

    useEffect(() => {
        let activo = true

        const cargarObrasSociales = async () => {
            setCargandoObraSociales(true)
            try {
                const res = await fetch('/api/facturacion/obras-sociales?porPagina=300')
                const json = (await res.json()) as ApiResponse<{ items: ObraSocialFiltroItem[] }>
                if (!activo) return
                setOpcionesObraSociales(Array.isArray(json.data?.items) ? json.data.items : [])
            } catch {
                if (activo) setOpcionesObraSociales([])
            } finally {
                if (activo) setCargandoObraSociales(false)
            }
        }

        void cargarObrasSociales()
        return () => {
            activo = false
        }
    }, [])

    const prestacionesSeleccionables = useMemo(() => {
        if (!contexto) return []
        return contexto.prestaciones.filter((p) => esPrestacionSeleccionableParaFacturar(p))
    }, [contexto])

    const prestacionesSeleccionadas = useMemo(() => {
        if (!contexto) return []
        return contexto.prestaciones.filter((p) => seleccion[p.uid])
    }, [contexto, seleccion])

    const totalPacienteFacturado = useMemo(() => {
        if (!contexto) return 0
        return contexto.prestaciones
            .filter((p) => p.tipo === 'ORDEN_ITEM')
            .reduce((sum, p) => sum + Number(p.importeTotal ?? 0), 0)
    }, [contexto])

    const totalPacientePendiente = useMemo(() => {
        if (!contexto) return 0
        return contexto.prestaciones
            .filter((p) => p.tipo === 'PRACTICA' && !p.facturada)
            .reduce((sum, p) => sum + Number(p.importeTotal ?? 0), 0)
    }, [contexto])

    const ordenesConItems = useMemo(() => {
        if (!contexto) return []
        const rows = contexto.prestaciones.filter((p) => p.tipo === 'ORDEN_ITEM')
        const map = new Map<string, PrestacionFacturableItem[]>()
        for (const row of rows) {
            const key = `${row.ordenPuestoNumero ?? 0}:${row.ordenNumero ?? 0}`
            if (!map.has(key)) map.set(key, [])
            map.get(key)?.push(row)
        }
        return Array.from(map.entries()).map(([key, items]) => {
            const [puestoStr, numeroStr] = key.split(':')
            const puesto = Number(puestoStr ?? 0)
            const numero = Number(numeroStr ?? 0)
            const total = items.reduce((sum, i) => sum + Number(i.importeTotal ?? 0), 0)
            const itemAyudante = items.find((it) => incluyeTieneAyudante(it.incluyeCodigo))
            return {
                key,
                puesto,
                numero,
                matriculaAyudante: itemAyudante ? MATRICULA_AYUDANTE_DEFAULT : null,
                matriculaEspecialista: items[0]?.matriculaEspecialista ?? null,
                matriculaAnestesista: items[0]?.matriculaAnestesista ?? null,
                total,
                items: items.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()),
            }
        })
    }, [contexto])

    const prestacionesNoOrdenadas = useMemo(() => {
        if (!contexto) return []
        return contexto.prestaciones.filter((p) => {
            if (p.tipo === 'ORDEN_ITEM') return false
            if (p.tipo === 'PRACTICA') return !p.facturada
            return true
        })
    }, [contexto])

    const prestacionesNoOrdenadasFiltradas = useMemo(() => {
        const termino = normalizarTextoBusqueda(filtroPrestaciones)
        if (!termino) return prestacionesNoOrdenadas

        return prestacionesNoOrdenadas.filter((p) => {
            const codigo = normalizarTextoBusqueda(p.codigoPractica)
            const descripcion = normalizarTextoBusqueda(p.descripcion)
            const autorizacion = normalizarTextoBusqueda(p.numeroAutorizacion)
            const tipo = normalizarTextoBusqueda(p.tipo)
            const autorizacionesVinculadas = normalizarTextoBusqueda(
                (p.autorizacionesVinculadas ?? [])
                    .map((aut) => `${aut.numeroAutorizacion ?? ''} ${aut.ordenPuestoNumero}-${aut.ordenNumero}`)
                    .join(' ')
            )

            return (
                codigo.includes(termino) ||
                descripcion.includes(termino) ||
                autorizacion.includes(termino) ||
                tipo.includes(termino) ||
                autorizacionesVinculadas.includes(termino)
            )
        })
    }, [filtroPrestaciones, prestacionesNoOrdenadas])

    const prestacionesNoOrdenadasFiltradasOrdenadas = useMemo(() => {
        return [...prestacionesNoOrdenadasFiltradas].sort((a, b) => {
            const ordenA = obtenerOrdenParaOrdenamiento(a)
            const ordenB = obtenerOrdenParaOrdenamiento(b)

            if (ordenA && ordenB) {
                if (ordenA.puestoNumero !== ordenB.puestoNumero) {
                    return ordenA.puestoNumero - ordenB.puestoNumero
                }
                if (ordenA.ordenNumero !== ordenB.ordenNumero) {
                    return ordenA.ordenNumero - ordenB.ordenNumero
                }

                const prioridadTipoA = prioridadTipoPrestacionParaGrilla(a)
                const prioridadTipoB = prioridadTipoPrestacionParaGrilla(b)
                if (prioridadTipoA !== prioridadTipoB) {
                    return prioridadTipoA - prioridadTipoB
                }

                const fechaA = new Date(a.fecha).getTime()
                const fechaB = new Date(b.fecha).getTime()
                if (fechaA !== fechaB) return fechaA - fechaB

                return (a.descripcion ?? '').localeCompare(b.descripcion ?? '', 'es', { sensitivity: 'base' })
            }

            if (ordenA && !ordenB) return -1
            if (!ordenA && ordenB) return 1

            const fechaA = new Date(a.fecha).getTime()
            const fechaB = new Date(b.fecha).getTime()
            if (fechaA !== fechaB) return fechaB - fechaA

            return (a.descripcion ?? '').localeCompare(b.descripcion ?? '', 'es', { sensitivity: 'base' })
        })
    }, [prestacionesNoOrdenadasFiltradas])

    const gruposPrestacionesNoOrdenadasFiltradas = useMemo(() => {
        const grupos: Array<{
            key: string
            ordenPuestoNumero: number | null
            ordenNumero: number | null
            cirugiaProgramadaId: number | null
            esCirugia: boolean
            esCirugiaMultiple: boolean
            etiquetasCirugia: string[]
            ordenesRelacionadas: OrdenRelacionada[]
            items: PrestacionFacturableItem[]
        }> = []

        const indicePorKey = new Map<string, number>()

        for (const p of prestacionesNoOrdenadasFiltradasOrdenadas) {
            const orden = obtenerOrdenParaOrdenamiento(p)
            const cirugiaProgramadaId =
                p.tipo === 'PRACTICA' && p.esPracticaCirugia
                    ? (p.origen.cirugiaProgramadaId ?? null)
                    : null
            const key = cirugiaProgramadaId
                ? `CIR:${cirugiaProgramadaId}`
                : (orden
                    ? `ORD:${orden.puestoNumero}:${orden.ordenNumero}`
                    : `SIN:${p.uid}`)
            const ordenesRelacionadas = obtenerOrdenesRelacionadasPrestacion(p)
            const etiquetasCirugiaPrestacion = resumenDiferenciales(p.diferenciales)

            const idx = indicePorKey.get(key)
            if (idx == null) {
                indicePorKey.set(key, grupos.length)
                grupos.push({
                    key,
                    ordenPuestoNumero: cirugiaProgramadaId ? null : (orden?.puestoNumero ?? null),
                    ordenNumero: cirugiaProgramadaId ? null : (orden?.ordenNumero ?? null),
                    cirugiaProgramadaId,
                    esCirugia: Boolean(cirugiaProgramadaId || p.esPracticaCirugia),
                    esCirugiaMultiple: esPrestacionCirugiaMultiple(p),
                    etiquetasCirugia: etiquetasCirugiaPrestacion,
                    ordenesRelacionadas,
                    items: [p],
                })
                continue
            }

            const grupo = grupos[idx]
            if (!grupo) continue

            grupo.items.push(p)
            grupo.esCirugia = grupo.esCirugia || Boolean(cirugiaProgramadaId || p.esPracticaCirugia)
            grupo.esCirugiaMultiple = grupo.esCirugiaMultiple || esPrestacionCirugiaMultiple(p)

            const etiquetas = new Set([...grupo.etiquetasCirugia, ...etiquetasCirugiaPrestacion])
            grupo.etiquetasCirugia = Array.from(etiquetas)

            const ordenesMap = new Map<string, OrdenRelacionada>()
            for (const actual of grupo.ordenesRelacionadas) {
                ordenesMap.set(keyOrdenRelacionada(actual), actual)
            }
            for (const actual of ordenesRelacionadas) {
                ordenesMap.set(keyOrdenRelacionada(actual), actual)
            }
            grupo.ordenesRelacionadas = Array.from(ordenesMap.values()).sort((a, b) => {
                if (a.ordenPuestoNumero !== b.ordenPuestoNumero) {
                    return a.ordenPuestoNumero - b.ordenPuestoNumero
                }
                return a.ordenNumero - b.ordenNumero
            })
        }

        return grupos
    }, [prestacionesNoOrdenadasFiltradasOrdenadas])

    const totalPaginasPrestaciones = Math.max(1, Math.ceil(gruposPrestacionesNoOrdenadasFiltradas.length / porPaginaPrestaciones))
    const paginaPrestacionesActual = Math.min(paginaPrestaciones, totalPaginasPrestaciones)

    const gruposPrestacionesNoOrdenadasPaginadas = useMemo(() => {
        const desde = (paginaPrestacionesActual - 1) * porPaginaPrestaciones
        return gruposPrestacionesNoOrdenadasFiltradas.slice(desde, desde + porPaginaPrestaciones)
    }, [paginaPrestacionesActual, porPaginaPrestaciones, gruposPrestacionesNoOrdenadasFiltradas])

    const cirugiasEditables = useMemo(() => {
        if (!contexto) return []

        const limpiarDescripcionCirugia = (descripcion: string): string => {
            return descripcion.replace(/\s*\[[^\]]*\]\s*$/g, '').trim()
        }

        const map = new Map<number, CirugiaEditableGroup>()

        for (const p of contexto.prestaciones) {
            if (p.tipo !== 'PRACTICA') continue
            if (!p.esPracticaCirugia) continue
            if (!p.origen.cirugiaProgramadaId) continue
            if (!p.origen.practicaId) continue

            const cirugiaId = p.origen.cirugiaProgramadaId
            const descripcionLimpia = limpiarDescripcionCirugia(p.descripcion)
            const claveAgrupacion = `${(p.codigoPractica ?? '').trim().toUpperCase()}::${normalizarTextoBusqueda(descripcionLimpia)}`
            const importeFilaOriginal = Number(p.importeTotalOriginal ?? p.importeTotal ?? 0)
            const practica: CirugiaPracticaEditable = {
                practicaId: p.origen.practicaId,
                practicaIdsAgrupadas: [p.origen.practicaId],
                claveAgrupacion,
                descripcion: descripcionLimpia,
                importeTotal: Number(p.importeTotal ?? 0),
                importeTotalReferencia: Number(
                    p.importeTotalOriginal ??
                    p.importeTotal ??
                    0
                ),
                esPracticaBase: Boolean(p.diferenciales?.esPracticaBase),
                esPracticaSecundaria: Boolean(p.diferenciales?.esPracticaSecundaria),
                aplicaDiferencial: Boolean(p.diferenciales?.aplicaDiferencial),
            }

            const existente = map.get(cirugiaId)
            if (!existente) {
                map.set(cirugiaId, {
                    cirugiaId,
                    practicas: [practica],
                    diferenciales: p.diferenciales ?? null,
                })
                continue
            }

            const indexExistente = existente.practicas.findIndex((actual) => actual.claveAgrupacion === claveAgrupacion)
            if (indexExistente === -1) {
                existente.practicas.push(practica)
            } else {
                const actual = existente.practicas[indexExistente]
                if (actual) {
                    actual.practicaIdsAgrupadas = Array.from(new Set([...actual.practicaIdsAgrupadas, p.origen.practicaId]))
                    actual.importeTotal += Number(p.importeTotal ?? 0)
                    actual.importeTotalReferencia = Number((actual.importeTotalReferencia + importeFilaOriginal).toFixed(2))
                    actual.esPracticaBase = actual.esPracticaBase || Boolean(p.diferenciales?.esPracticaBase)
                    actual.esPracticaSecundaria = actual.esPracticaSecundaria || Boolean(p.diferenciales?.esPracticaSecundaria)
                    actual.aplicaDiferencial = actual.aplicaDiferencial || Boolean(p.diferenciales?.aplicaDiferencial)
                    actual.practicaId = Math.min(actual.practicaId, p.origen.practicaId)
                }
            }

            if (!existente.diferenciales && p.diferenciales) {
                existente.diferenciales = p.diferenciales
            }
        }

        return Array.from(map.values())
            .map((cirugia) => ({
                ...cirugia,
                practicas: [...cirugia.practicas]
                    .sort((a, b) => {
                        if (b.importeTotalReferencia !== a.importeTotalReferencia) {
                            return b.importeTotalReferencia - a.importeTotalReferencia
                        }
                        return a.practicaId - b.practicaId
                    }),
            }))
            .sort((a, b) => b.cirugiaId - a.cirugiaId)
    }, [contexto])

    // El congelamiento es por cirugia y por componente, no por ingreso.
    //
    // Solo bloquea una practica facturada que el diferencial efectivamente
    // modificaria: gastos (GA) u honorario de especialista (HE/HP). Si lo
    // facturado fue el anestesista, un ayudante, o una practica de otra cirugia
    // u otra orden del ingreso, el diferencial sigue siendo editable porque no
    // cambia esos importes.
    const cirugiasCongeladas = useMemo(() => {
        const congeladas = new Set<number>()
        if (!contexto) return congeladas
        for (const p of contexto.prestaciones) {
            if (p.tipo !== 'PRACTICA') continue
            if (!p.facturada) continue
            const cirugiaId = p.origen.cirugiaProgramadaId
            if (!cirugiaId) continue
            if (!componenteAfectadoPorDiferencial(p.incluyeCodigo)) continue
            congeladas.add(cirugiaId)
        }
        return congeladas
    }, [contexto])

    useEffect(() => {
        const next: Record<number, DiferencialesCirugiaEditState> = {}
        for (const cirugia of cirugiasEditables) {
            next[cirugia.cirugiaId] = buildDiferencialesCirugiaState(cirugia)
        }
        setDiferencialesCirugiaEdit(next)
    }, [cirugiasEditables])

    const profesionalesConMatricula = useMemo(() => {
        return (contexto?.profesionales ?? []).filter(
            (profesional): profesional is { id: number; nombre: string; matricula: number } =>
                typeof profesional.matricula === 'number' && profesional.matricula > 0
        )
    }, [contexto])

    const matriculaPorProfesionalId = useMemo(() => {
        const map = new Map<number, number>()
        for (const profesional of profesionalesConMatricula) {
            map.set(profesional.id, profesional.matricula)
        }
        return map
    }, [profesionalesConMatricula])

    const profesionalIdPorMatricula = useMemo(() => {
        const map = new Map<number, number>()
        for (const profesional of profesionalesConMatricula) {
            if (!map.has(profesional.matricula)) {
                map.set(profesional.matricula, profesional.id)
            }
        }
        return map
    }, [profesionalesConMatricula])

    const profesionalPorMatricula = useMemo(() => {
        const map = new Map<number, { id: number; nombre: string; matricula: number }>()
        for (const profesional of profesionalesConMatricula) {
            if (!map.has(profesional.matricula)) {
                map.set(profesional.matricula, profesional)
            }
        }
        return map
    }, [profesionalesConMatricula])

    const resolveSelectedProfesionalId = (matriculaValue: string): string => {
        const matricula = Number.parseInt(matriculaValue, 10)
        if (!Number.isFinite(matricula) || matricula <= 0) return ''
        const profesionalId = profesionalIdPorMatricula.get(matricula)
        return profesionalId ? String(profesionalId) : ''
    }

    const applyProfesionalSelection = (
        uid: string,
        draft: EditState,
        field: 'matriculaAyudante' | 'matriculaEspecialista' | 'matriculaAnestesista',
        profesionalIdRaw: string
    ) => {
        const profesionalId = Number.parseInt(profesionalIdRaw, 10)
        const matricula = Number.isFinite(profesionalId) ? matriculaPorProfesionalId.get(profesionalId) : null
        const matriculaFinal = matricula ? String(matricula) : ''
        setEditRows((prev) => ({
            ...prev,
            [uid]: {
                ...draft,
                [field]: matriculaFinal,
            },
        }))
    }

    function cargarFormDesdeContexto(data: FacturacionContexto) {
        setFormIngresoNombre(data.ingreso.nombre ?? '')
        setFormDescripcionPatologia(data.ingreso.descripcionPatologia ?? '')
        setFormNumeroAfiliado(data.ingreso.numeroAfiliado ?? '')
        setFormObservaciones(limpiarObservacionesAdmision(data.ingreso.observaciones) ?? '')
        setFormPacienteNombreCompleto(data.paciente?.nombreCompleto ?? '')
        setFormPacienteCelular(data.paciente?.celular1 ?? '')
        setFormPacienteEmail(data.paciente?.email ?? '')
        setFormPacienteDomicilio(data.paciente?.domicilio ?? '')
    }

    function initEditRows(data: FacturacionContexto) {
        const state: Record<string, EditState> = {}
        const authState: Record<string, Record<string, string>> = {}
        const selMap: Record<string, ComponenteSeleccion> = {}
        for (const p of data.prestaciones) {
            state[p.uid] = buildEditState(p)
            if (p.tipo === 'PRACTICA' && !p.facturada && (p.autorizacionesVinculadas?.length ?? 0) > 0) {
                authState[p.uid] = buildAutorizacionesVinculadasEditState(p)
            }
            if (p.tipo === 'PRACTICA') {
                const seleccionDesdeIncluye = parseIncluyeCodigoSeleccion(p.incluyeCodigo)
                const desgloseSelector = obtenerDesgloseSelector(p)
                if (seleccionDesdeIncluye) {
                    selMap[p.uid] = seleccionDesdeIncluye
                } else if (desgloseSelector && tieneDesglose(desgloseSelector)) {
                    selMap[p.uid] = seleccionPorDefecto(desgloseSelector)
                }
            }
        }
        setEditRows(state)
        setEditAutorizacionesVinculadas(authState)
        setCompSeleccion(selMap)
        setClasificacionPorComponenteUid({})
    }

    function obtenerBusquedaStateActual(
        overrides?: Partial<BusquedaFacturacionState>
    ): BusquedaFacturacionState {
        return {
            criterioBusquedaPaciente: overrides?.criterioBusquedaPaciente ?? criterioBusquedaPaciente,
            busquedaPaciente: overrides?.busquedaPaciente ?? busquedaPaciente,
            usarFiltroFechaIngreso: overrides?.usarFiltroFechaIngreso ?? usarFiltroFechaIngreso,
            fechaDesdeIngreso: overrides?.fechaDesdeIngreso ?? fechaDesdeIngreso,
            fechaHastaIngreso: overrides?.fechaHastaIngreso ?? fechaHastaIngreso,
            usarFiltroTipoIngreso: overrides?.usarFiltroTipoIngreso ?? usarFiltroTipoIngreso,
            tipoIngresoCodigo: overrides?.tipoIngresoCodigo ?? tipoIngresoCodigo,
            obraSocialId: overrides?.obraSocialId ?? obraSocialId,
            numeroIngreso: overrides?.numeroIngreso ?? numeroIngreso,
            numeroOrden: overrides?.numeroOrden ?? numeroOrden,
            codigoPractica: overrides?.codigoPractica ?? codigoPractica,
        }
    }

    function construirQueryEstado(
        ingresoId: number | null,
        snapshot?: BusquedaFacturacionState
    ): string {
        const state = snapshot ?? obtenerBusquedaStateActual()
        const urlParams = new URLSearchParams()
        const terminoPaciente = state.busquedaPaciente.trim()
        const codigoTipo = state.tipoIngresoCodigo.trim().toUpperCase()
        const obraSocialIdFiltro = state.obraSocialId.trim()
        const numeroIngresoFiltro = state.numeroIngreso.trim()
        const numeroOrdenFiltro = state.numeroOrden.trim()
        const codigoPracticaFiltro = state.codigoPractica.trim().toUpperCase()

        if (terminoPaciente) {
            urlParams.set('criterio', state.criterioBusquedaPaciente)
            urlParams.set('qPaciente', terminoPaciente)
        }

        if (state.usarFiltroFechaIngreso) {
            urlParams.set('filtrarFecha', '1')
            if (state.fechaDesdeIngreso) urlParams.set('fechaDesde', state.fechaDesdeIngreso)
            if (state.fechaHastaIngreso) urlParams.set('fechaHasta', state.fechaHastaIngreso)
        }

        if (state.usarFiltroTipoIngreso) {
            urlParams.set('filtrarTipoIngreso', '1')
            if (codigoTipo) urlParams.set('tipoIngresoCodigo', codigoTipo)
        }

        if (obraSocialIdFiltro) urlParams.set('obraSocialId', obraSocialIdFiltro)
        if (numeroIngresoFiltro) urlParams.set('numeroIngreso', numeroIngresoFiltro)
        if (numeroOrdenFiltro) urlParams.set('numeroOrden', numeroOrdenFiltro)
        if (codigoPracticaFiltro) urlParams.set('codigoPractica', codigoPracticaFiltro)
        if (ingresoId) urlParams.set('ingresoId', String(ingresoId))

        return urlParams.toString()
    }

    function actualizarQueryEstado(ingresoId: number | null, snapshot?: BusquedaFacturacionState) {
        const qs = construirQueryEstado(ingresoId, snapshot)
        router.replace(qs ? `${pathname}?${qs}` : pathname)
    }

    function limpiarBusqueda() {
        const stateLimpio: BusquedaFacturacionState = {
            criterioBusquedaPaciente: 'NOMBRE',
            busquedaPaciente: '',
            usarFiltroFechaIngreso: false,
            fechaDesdeIngreso: '',
            fechaHastaIngreso: '',
            usarFiltroTipoIngreso: false,
            tipoIngresoCodigo: '',
            obraSocialId: '',
            numeroIngreso: '',
            numeroOrden: '',
            codigoPractica: '',
        }

        setCriterioBusquedaPaciente(stateLimpio.criterioBusquedaPaciente)
        setBusquedaPaciente(stateLimpio.busquedaPaciente)
        setUsarFiltroFechaIngreso(stateLimpio.usarFiltroFechaIngreso)
        setFechaDesdeIngreso(stateLimpio.fechaDesdeIngreso)
        setFechaHastaIngreso(stateLimpio.fechaHastaIngreso)
        setUsarFiltroTipoIngreso(stateLimpio.usarFiltroTipoIngreso)
        setTipoIngresoCodigo(stateLimpio.tipoIngresoCodigo)
        setObraSocialId(stateLimpio.obraSocialId)
        setNumeroIngreso(stateLimpio.numeroIngreso)
        setNumeroOrden(stateLimpio.numeroOrden)
        setCodigoPractica(stateLimpio.codigoPractica)
        setAutoSeleccionBusquedaDirecta(false)
        setMostrarCoincidenciasBusqueda(true)
        setSelectedIngresoId(null)
        setContexto(null)
        setSeleccion({})
        setAdmisiones([])
        setTotalAdmisiones(0)
        setPaginaAdmisiones(1)
        router.replace(pathname)
    }

    async function buscarAdmisiones(
        overrides?: Partial<BusquedaFacturacionState>,
        options?: {
            actualizarUrl?: boolean
            pagina?: number
            preservarSeleccionActual?: boolean
            forzarMostrarCoincidencias?: boolean
            permitirAutoSeleccion?: boolean
        }
    ) {
        setError(null)
        setMensaje(null)
        setBuscando(true)
        try {
            const snapshot = obtenerBusquedaStateActual(overrides)
            const paginaObjetivo = options?.pagina ?? paginaAdmisiones
            const terminoPaciente = snapshot.busquedaPaciente.trim()
            const codigoTipo = snapshot.tipoIngresoCodigo.trim().toUpperCase()
            const obraSocialIdFiltro = snapshot.obraSocialId.trim()
            const numeroIngresoFiltro = snapshot.numeroIngreso.trim()
            const numeroOrdenFiltro = snapshot.numeroOrden.trim()
            const codigoPracticaFiltro = snapshot.codigoPractica.trim().toUpperCase()
            const params = new URLSearchParams()

            if (terminoPaciente) {
                if (snapshot.criterioBusquedaPaciente === 'NOMBRE') {
                    params.set('pacienteNombre', terminoPaciente)
                } else {
                    const numero = parseEnteroPositivo(terminoPaciente)
                    if (!numero) {
                        throw new Error(
                            snapshot.criterioBusquedaPaciente === 'HC'
                                ? 'El número de HC debe ser numérico y mayor a 0.'
                                : 'El número de DNI debe ser numérico y mayor a 0.'
                        )
                    }
                    params.set(
                        snapshot.criterioBusquedaPaciente === 'HC' ? 'historiaClinica' : 'numeroDocumento',
                        String(numero)
                    )
                }
            }

            if (snapshot.usarFiltroTipoIngreso && codigoTipo) {
                params.set('tipoIngresoCodigo', codigoTipo)
            }

            const obraSocialIdNumerico = parseEnteroPositivo(obraSocialIdFiltro)
            if (obraSocialIdFiltro && !obraSocialIdNumerico) {
                throw new Error('La obra social seleccionada no es válida.')
            }
            if (obraSocialIdNumerico) {
                params.set('obraSocialId', String(obraSocialIdNumerico))
            }

            const numeroIngresoNumerico = parseEnteroPositivo(numeroIngresoFiltro)
            if (numeroIngresoFiltro && !numeroIngresoNumerico) {
                throw new Error('El número de ingreso debe ser numérico y mayor a 0.')
            }
            if (numeroIngresoNumerico) {
                params.set('numeroIngreso', String(numeroIngresoNumerico))
            }

            const numeroOrdenNumerico = parseEnteroPositivo(numeroOrdenFiltro)
            if (numeroOrdenFiltro && !numeroOrdenNumerico) {
                throw new Error('El número de orden debe ser numérico y mayor a 0.')
            }
            if (numeroOrdenNumerico) {
                params.set('numeroOrden', String(numeroOrdenNumerico))
            }

            if (snapshot.usarFiltroFechaIngreso) {
                const tieneDesde = Boolean(snapshot.fechaDesdeIngreso)
                const tieneHasta = Boolean(snapshot.fechaHastaIngreso)
                if (!tieneDesde && !tieneHasta) {
                    throw new Error('Debe seleccionar al menos una fecha para aplicar el filtro.')
                }
                if (snapshot.fechaDesdeIngreso && snapshot.fechaHastaIngreso && snapshot.fechaDesdeIngreso > snapshot.fechaHastaIngreso) {
                    throw new Error('La fecha desde no puede ser mayor a la fecha hasta.')
                }
                if (snapshot.fechaDesdeIngreso) params.set('fechaDesde', snapshot.fechaDesdeIngreso)
                if (snapshot.fechaHastaIngreso) params.set('fechaHasta', snapshot.fechaHastaIngreso)
            }

            if (codigoPracticaFiltro) params.set('codigoPractica', codigoPracticaFiltro)
            if (esVistaFacturadas) params.set('soloFacturadas', '1')
            params.set('pagina', String(paginaObjetivo))
            params.set('porPagina', String(porPaginaAdmisiones))

            const res = await fetch(`/api/facturacion/busqueda?${params.toString()}`)
            const json = (await res.json()) as ApiResponse<{ items: AdmisionFacturacionListItem[]; total: number }>
            if (!res.ok || !json.ok || !json.data) throw new Error(json.error ?? 'No se pudo buscar')

            setAdmisiones(json.data.items)
            setTotalAdmisiones(json.data.total)
            setPaginaAdmisiones(paginaObjetivo)

            let ingresoSugeridoId: number | null = selectedIngresoId
            let autoSeleccion = false
            const permitirAutoSeleccion = options?.permitirAutoSeleccion ?? paginaObjetivo === 1

            if (terminoPaciente && permitirAutoSeleccion) {
                const candidatoDirecto = json.data.items.find((item) =>
                    coincideBusquedaDirectaPaciente(item, snapshot.criterioBusquedaPaciente, terminoPaciente)
                )
                if (candidatoDirecto) {
                    ingresoSugeridoId = candidatoDirecto.id
                    autoSeleccion = true
                } else if (json.data.items.length === 1) {
                    ingresoSugeridoId = json.data.items[0]?.id ?? null
                    autoSeleccion = true
                }
            }

            const mantenerSeleccion =
                ingresoSugeridoId !== null &&
                json.data.items.some((item) => item.id === ingresoSugeridoId)
            const preservarSeleccionActual = Boolean(options?.preservarSeleccionActual)

            if (!mantenerSeleccion) {
                if (!preservarSeleccionActual) {
                    ingresoSugeridoId = null
                    setSelectedIngresoId(null)
                    setContexto(null)
                    setSeleccion({})
                }
            } else if (ingresoSugeridoId !== selectedIngresoId) {
                setSelectedIngresoId(ingresoSugeridoId)
            }

            setAutoSeleccionBusquedaDirecta(autoSeleccion)
            setMostrarCoincidenciasBusqueda(options?.forzarMostrarCoincidencias ?? !autoSeleccion)
            if (options?.actualizarUrl !== false) {
                actualizarQueryEstado(ingresoSugeridoId, snapshot)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error de busqueda')
        } finally {
            setBuscando(false)
        }
    }

    async function cargarContexto(ingresoId: number, options?: { silent?: boolean; preserveUiState?: boolean }) {
        const silent = Boolean(options?.silent)
        const preserveUiState = Boolean(options?.preserveUiState)
        setError(null)
        if (!silent) {
            setCargandoContexto(true)
        }
        try {
            const res = await fetch(`/api/facturacion/contexto?ingresoId=${ingresoId}`)
            const json = (await res.json()) as ApiResponse<FacturacionContexto>
            if (!res.ok || !json.ok || !json.data) throw new Error(json.error ?? 'No se pudo cargar el contexto')

            setContexto(json.data)
            cargarFormDesdeContexto(json.data)
            initEditRows(json.data)
            if (!preserveUiState) {
                setEditAutorizacionOrden({})
                setOrdenesExpand({})
                setOrdenesPendientesExpand({})
                setFiltroPrestaciones('')
                setPaginaPrestaciones(1)
                setRowEditMode({})
                setAplicarOrdenCompletaPorFila({})
                setDetallePrestacionesExpand({})
                setEditandoFicha(false)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al cargar contexto')
            setContexto(null)
        } finally {
            if (!silent) {
                setCargandoContexto(false)
            }
        }
    }

    async function guardarFicha() {
        if (!contexto) return
        setGuardandoFicha(true)
        setMensaje(null)
        setError(null)
        try {
            const payload = {
                ingreso: {
                    nombre: formIngresoNombre || null,
                    descripcionPatologia: formDescripcionPatologia || null,
                    numeroAfiliado: formNumeroAfiliado || null,
                    observaciones: formObservaciones || null,
                },
                paciente: {
                    nombreCompleto: formPacienteNombreCompleto || '',
                    celular1: formPacienteCelular || null,
                    email: formPacienteEmail || null,
                    domicilio: formPacienteDomicilio || null,
                },
            }

            const res = await fetch(`/api/facturacion/admision/${contexto.ingreso.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })

            const json = (await res.json()) as ApiResponse<{ ingresoId: number }>
            if (!res.ok || !json.ok) throw new Error(json.error ?? 'No se pudieron guardar los cambios')

            setMensaje('Ficha de facturación actualizada')
            setEditandoFicha(false)
            await cargarContexto(contexto.ingreso.id)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al guardar')
        } finally {
            setGuardandoFicha(false)
        }
    }

    async function crearPractica() {
        if (!contexto) return
        if (!npSeleccionada && !npBusqueda.trim()) return

        setGuardandoPractica(true)
        setError(null)
        setMensaje(null)
        try {
            const codigoPractica = npSeleccionada?.codigo ?? npBusqueda.trim().slice(0, 8).toUpperCase()
            const descripcionPractica = npSeleccionada?.descripcion ?? npBusqueda.trim()
            const convenioPractica = npSeleccionada?.convenioId ?? contexto.ingreso.obraSocialId ?? 0

            let importeBaseUnitario: number | null = null
            if (npSeleccionada) {
                const vals: ComponenteValores = {
                    valorEspecialista: npSeleccionada.valorEspecialista,
                    valorAyudante: npSeleccionada.valorAyudante,
                    valorAnestesista: npSeleccionada.valorAnestesista,
                    valorGastos: npSeleccionada.valorGastos,
                    valorTotal: npSeleccionada.valor,
                }
                const t = calcularTotalSeleccionado(vals, npComponentes)
                importeBaseUnitario = t > 0 ? t : null
            }

            const subitemsSeleccionados = npSeleccionada
                ? obtenerSubitemsSeleccionados(
                    {
                        valorEspecialista: npSeleccionada.valorEspecialista,
                        valorAyudante: npSeleccionada.valorAyudante,
                        valorAnestesista: npSeleccionada.valorAnestesista,
                        valorGastos: npSeleccionada.valorGastos,
                    },
                    npComponentes
                )
                : []

            const importesPorEntrada = subitemsSeleccionados.length > 0 && npSeleccionada
                ? subitemsSeleccionados.map((subitem) =>
                    valorUnitarioPorSubitem(subitem, {
                        valorEspecialista: npSeleccionada.valorEspecialista,
                        valorAyudante: npSeleccionada.valorAyudante,
                        valorAnestesista: npSeleccionada.valorAnestesista,
                        valorGastos: npSeleccionada.valorGastos,
                    })
                )
                : [importeBaseUnitario]

            for (const importeEntrada of importesPorEntrada) {
                const res = await fetch('/api/facturacion/prestaciones/practicas', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ingresoId: contexto.ingreso.id,
                        convenioId: convenioPractica,
                        codigoPractica,
                        descripcionPractica,
                        cantidad: 1,
                        fecha: new Date(nuevaPracticaFecha).toISOString(),
                        numeroAutorizacion: nuevaPracticaAutorizacion.trim() || null,
                        importeBaseUnitario: importeEntrada,
                    }),
                })
                const json = (await res.json()) as ApiResponse<{ id: number }>
                if (!res.ok || !json.ok) throw new Error(json.error ?? 'No se pudo crear la practica')
            }

            setNpBusqueda('')
            setNpResultados([])
            setNpSeleccionada(null)
            setNpComponentes({ especialista: 0, ayudante: 0, anestesista: 0, gastos: 0 })
            setNuevaPracticaAutorizacion('')
            setExpandNuevaPractica(false)
            setMensaje('Práctica agregada')
            await cargarContexto(contexto.ingreso.id)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al crear practica')
        } finally {
            setGuardandoPractica(false)
        }
    }

    async function crearPedidoLaboratorio() {
        if (!contexto) return

        const numeroProtocolo = numeroProtocoloLaboratorio.trim()
        const diagnostico = diagnosticoLaboratorio.trim()

        if (!numeroProtocolo) {
            setError('Ingresá el número de protocolo')
            return
        }

        if (!diagnostico) {
            setError('Ingresá el diagnóstico')
            return
        }

        setGuardandoPedidoLaboratorio(true)
        setError(null)
        setMensaje(null)
        try {
            const result = await crearPedidoLaboratorioAction({
                ingresoId: contexto.ingreso.id,
                numeroProtocolo,
                diagnostico,
            })

            if ('error' in result && result.error) {
                setError(result.error)
                return
            }

            setNumeroProtocoloLaboratorio('')
            setDiagnosticoLaboratorio('')
            setExpandPedidoLaboratorio(false)

            if ('puestoNumero' in result && 'numero' in result) {
                if (typeof window !== 'undefined') {
                    window.open(`/dashboard/ambulatorio/${result.puestoNumero}/${result.numero}`, '_blank', 'noopener,noreferrer')
                }
                setMensaje(`Pedido generado: ${formatOrderNumber(result.puestoNumero, result.numero)} (abierto en nueva pestaña)`)
                return
            }

            setMensaje('Pedido de laboratorio generado')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al generar pedido de laboratorio')
        } finally {
            setGuardandoPedidoLaboratorio(false)
        }
    }

    function buscarNomenclador(q: string) {
        setNpBusqueda(q)
        setNpSeleccionada(null)
        if (npDebounceRef.current) clearTimeout(npDebounceRef.current)
        if (q.trim().length < 2) { setNpResultados([]); return }
        npDebounceRef.current = setTimeout(async () => {
            setNpBuscando(true)
            try {
                const qs = new URLSearchParams({ q: q.trim() })
                if (contexto?.ingreso.obraSocialId) qs.set('convenioId', String(contexto.ingreso.obraSocialId))
                const res = await fetch(`/api/practicas-nomenclador?${qs.toString()}`)
                const json = await res.json()
                setNpResultados(Array.isArray(json.data) ? json.data : [])
            } catch { setNpResultados([]) }
            finally { setNpBuscando(false) }
        }, 350)
    }

    function seleccionarDesdeBusqueda(p: NomencladorItem) {
        setNpSeleccionada(p)
        setNpBusqueda(p.descripcion)
        setNpResultados([])
        const vals: ComponenteValores = {
            valorEspecialista: p.valorEspecialista,
            valorAyudante: p.valorAyudante,
            valorAnestesista: p.valorAnestesista,
            valorGastos: p.valorGastos,
            valorTotal: p.valor,
        }
        setNpComponentes(seleccionPorDefecto(vals))
    }

    async function crearMedicacion() {
        if (!contexto) return
        setGuardandoMedicacion(true)
        setError(null)
        setMensaje(null)
        try {
            const res = await fetch('/api/facturacion/prestaciones/medicaciones', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ingresoId: contexto.ingreso.id,
                    nombre: nuevaMedicacionNombre.trim(),
                    dosis: null,
                    viaAdministracion: null,
                    frecuencia: null,
                    fechaInicio: new Date(nuevaMedicacionFecha).toISOString(),
                    observaciones: null,
                }),
            })

            const json = (await res.json()) as ApiResponse<{ id: number }>
            if (!res.ok || !json.ok) throw new Error(json.error ?? 'No se pudo crear la medicacion')

            setNuevaMedicacionNombre('')
            setExpandNuevaMedicacion(false)
            setMensaje('Medicación agregada')
            await cargarContexto(contexto.ingreso.id)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al crear medicacion')
        } finally {
            setGuardandoMedicacion(false)
        }
    }

    async function crearDescartable() {
        if (!contexto) return
        setGuardandoDescartable(true)
        setError(null)
        setMensaje(null)
        try {
            const res = await fetch('/api/facturacion/prestaciones/descartables', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ingresoId: contexto.ingreso.id,
                    nombre: nuevoDescartableNombre.trim(),
                    cantidad: 1,
                    observaciones: null,
                }),
            })

            const json = (await res.json()) as ApiResponse<{ id: number }>
            if (!res.ok || !json.ok) throw new Error(json.error ?? 'No se pudo crear el descartable')

            setNuevoDescartableNombre('')
            setExpandNuevoDescartable(false)
            setMensaje('Descartable agregado')
            await cargarContexto(contexto.ingreso.id)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al crear descartable')
        } finally {
            setGuardandoDescartable(false)
        }
    }

    async function facturarPaciente() {
        if (!contexto) return
        // Ensure latest selector/sigla edits are committed before building payload.
        flushSync(() => {})
        setCargandoOrdenes(true)
        setError(null)
        setMensaje(null)
        try {
            // Si el usuario interactuó con la selección, respetar estrictamente lo tildado.
            // Si nunca tocó selección, usar todas las seleccionables (facturar todo).
            const huboSeleccionExplicita = Object.keys(seleccion).length > 0
            const source = huboSeleccionExplicita
                ? prestacionesSeleccionadas
                : prestacionesSeleccionables

            const prestaciones: PrestacionOrdenInput[] = source
                .filter(
                    (p) =>
                        p.tipo === 'PRACTICA' &&
                        p.codigoPractica &&
                        p.convenioId !== null &&
                        !p.facturada &&
                        practicaTieneOrdenGenerada(p) &&
                        practicaTieneAutorizacionConOrden(p)
                )
                .map((p) => {
                    const draft = editRows[p.uid]
                    const importeTotal = draft ? Number(draft.importeTotal) : (p.importeTotal ?? undefined)
                    const baseDesc = draft?.descripcion ?? p.descripcion
                    const desgloseSelector = obtenerDesgloseSelector(p)
                    const sel =
                        compSeleccion[p.uid] ??
                        parseIncluyeCodigoSeleccion(p.incluyeCodigo) ??
                        (desgloseSelector && tieneDesglose(desgloseSelector)
                            ? seleccionPorDefecto(desgloseSelector)
                            : null)
                    const incluyeCodigo = construirIncluyeCodigoDesdeSeleccion(
                        desgloseSelector,
                        sel,
                        p.incluyeCodigo,
                        clasificacionPorComponenteUid[p.uid],
                        p.codigoPractica
                    )
                    const incluyeCodigoFinal = incluyeCodigo ?? p.incluyeCodigo
                    const usaMatriculaAyudante =
                        incluyeSoloAyudante(incluyeCodigoFinal) ||
                        (!incluyeCodigo && !p.incluyeCodigo && descripcionEsAyudante(baseDesc))
                    const usaMatriculaPatologia =
                        !usaMatriculaAyudante &&
                        (incluyeTienePatologia(incluyeCodigoFinal) || esCodigoPatologiaPorDefecto(p.codigoPractica))
                    const matriculaEspecialistaDraft =
                        draft?.matriculaEspecialista ? Number(draft.matriculaEspecialista) : null
                    const descripcionPractica = sel && incluyeCodigo
                        ? baseDesc + descripcionComponentes(sel)
                        : baseDesc
                    return {
                        practicaId: p.origen.practicaId,
                        convenioId: p.convenioId as number,
                        codigoPractica: (p.codigoPractica as string).trim(),
                        descripcionPractica,
                        cantidad: draft ? Number(draft.cantidad) : p.cantidad,
                        incluyeCodigo,
                        numeroAutorizacion: draft?.numeroAutorizacion?.trim() ?? p.numeroAutorizacion?.trim() ?? null,
                        importeTotal: importeTotal && importeTotal > 0 ? importeTotal : undefined,
                        matriculaEspecialista: draft
                            ? (usaMatriculaAyudante
                                ? MATRICULA_AYUDANTE_DEFAULT
                                : (matriculaEspecialistaDraft ?? (usaMatriculaPatologia ? MATRICULA_PATOLOGIA_DEFAULT : null)))
                            : (p.matriculaEspecialista ?? (usaMatriculaPatologia ? MATRICULA_PATOLOGIA_DEFAULT : null)),
                        matriculaAnestesista: draft
                            ? (draft.matriculaAnestesista ? Number(draft.matriculaAnestesista) : null)
                            : (p.matriculaAnestesista ?? null),
                    }
                })

            if (prestaciones.length === 0) {
                if (huboSeleccionExplicita) {
                    throw new Error('No hay prácticas seleccionadas para facturar')
                }
                throw new Error('No hay prácticas pendientes con orden y autorización para facturar')
            }

            const res = await fetch('/api/facturacion/ordenes/cargar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ingresoId: contexto.ingreso.id,
                    facturarTodo: false,
                    prestaciones,
                }),
            })
            const json = (await res.json()) as ApiResponse<{ ordenes: Array<{ puestoNumero: number; numero: number }> }>
            if (!res.ok || !json.ok || !json.data) throw new Error(json.error ?? 'No se pudieron generar ordenes')

            setMensaje(
                `Facturación registrada para paciente. Prácticas procesadas: ${prestaciones.length}.`
            )
            setSeleccion({})
            await cargarContexto(contexto.ingreso.id)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al facturar paciente')
        } finally {
            setCargandoOrdenes(false)
        }
    }

    async function guardarAutorizacionOrden(
        puestoNumero: number,
        ordenNumero: number,
        valor: string,
        options?: { silent?: boolean }
    ) {
        if (!contexto) return

        const authKey = keyAutorizacionOrden(puestoNumero, ordenNumero)
        const numeroAutorizacion = valor.trim() || null

        setGuardandoAutorizacionOrdenKey(authKey)
        setError(null)
        if (!options?.silent) setMensaje(null)

        try {
            const res = await fetch('/api/facturacion/autorizaciones', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tipo: 'ORDEN' as const,
                    puestoNumero,
                    ordenNumero,
                    numeroAutorizacion,
                }),
            })

            const json = (await res.json()) as ApiResponse<{ ok: boolean }>
            if (!res.ok || !json.ok) {
                throw new Error(json.error ?? 'No se pudo actualizar el número de autorización de la orden')
            }

            if (!options?.silent) {
                setMensaje(`Autorización actualizada para orden ${formatOrderNumber(puestoNumero, ordenNumero)}`)
            }

            await cargarContexto(contexto.ingreso.id, { silent: true })
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al actualizar autorización de la orden')
        } finally {
            setGuardandoAutorizacionOrdenKey(null)
        }
    }

    function habilitarEdicionFila(p: PrestacionFacturableItem) {
        setEditRows((prev) => ({ ...prev, [p.uid]: prev[p.uid] ?? buildEditState(p) }))
        if (p.tipo === 'PRACTICA' && !p.facturada && (p.autorizacionesVinculadas?.length ?? 0) > 0) {
            setEditAutorizacionesVinculadas((prev) => ({
                ...prev,
                [p.uid]: prev[p.uid] ?? buildAutorizacionesVinculadasEditState(p),
            }))
        }
        setRowEditMode((prev) => ({ ...prev, [p.uid]: true }))
        setDetallePrestacionesExpand((prev) => ({ ...prev, [p.uid]: true }))
    }

    function cancelarEdicionFila(p: PrestacionFacturableItem) {
        setEditRows((prev) => ({ ...prev, [p.uid]: buildEditState(p) }))

        if (p.tipo === 'PRACTICA') {
            setEditAutorizacionesVinculadas((prev) => {
                const next = { ...prev }
                if (!p.facturada && (p.autorizacionesVinculadas?.length ?? 0) > 0) {
                    next[p.uid] = buildAutorizacionesVinculadasEditState(p)
                } else {
                    delete next[p.uid]
                }
                return next
            })
        }

        if (p.tipo === 'PRACTICA') {
            const seleccionDesdeIncluye = parseIncluyeCodigoSeleccion(p.incluyeCodigo)
            const desgloseSelector = obtenerDesgloseSelector(p)

            setCompSeleccion((prev) => {
                const next = { ...prev }
                if (seleccionDesdeIncluye) {
                    next[p.uid] = seleccionDesdeIncluye
                } else if (desgloseSelector && tieneDesglose(desgloseSelector)) {
                    next[p.uid] = seleccionPorDefecto(desgloseSelector)
                } else {
                    delete next[p.uid]
                }
                return next
            })

            setClasificacionPorComponenteUid((prev) => {
                const next = { ...prev }
                delete next[p.uid]
                return next
            })
        }

        setAplicarOrdenCompletaPorFila((prev) => {
            const next = { ...prev }
            delete next[p.uid]
            return next
        })

        setRowEditMode((prev) => ({ ...prev, [p.uid]: false }))
    }

    function pedirConfirmacion(params: {
        titulo: string
        mensaje: string
        detalle?: string[]
    }): Promise<boolean> {
        return new Promise((resolve) => {
            setConfirmacion({
                titulo: params.titulo,
                mensaje: params.mensaje,
                detalle: params.detalle ?? [],
                resolver: resolve,
            })
        })
    }

    function responderConfirmacion(confirmado: boolean) {
        confirmacion?.resolver(confirmado)
        setConfirmacion(null)
    }

    async function guardarPrestacion(p: PrestacionFacturableItem) {
        const draft = editRows[p.uid]
        if (!draft) return
        if (p.tipo !== 'PRACTICA' && p.tipo !== 'ORDEN_ITEM') return

        const cantidadAnterior = Number(p.cantidad)
        const cantidadNueva = Number(draft.cantidad || 1)
        const cambiaCantidad =
            Number.isFinite(cantidadNueva) && Math.abs(cantidadNueva - cantidadAnterior) > 0.0001

        const importeAnterior = Number(p.importeTotal ?? 0)
        const importeNuevo = Number(draft.importeTotal || 0)
        const cambiaImporte = Math.abs(importeNuevo - importeAnterior) > 0.009
        const ordenParaEdicionGlobal = obtenerOrdenParaOrdenamiento(p)
        const aplicarOrdenCompleta = Boolean(
            aplicarOrdenCompletaPorFila[p.uid] && ordenParaEdicionGlobal
        )

        // Ensure latest selector/sigla edits are committed before reading state.
        flushSync(() => {})

        if (p.tipo === 'PRACTICA' && p.facturada) {
            const ok = await pedirConfirmacion({
                titulo: 'Esta práctica ya fue facturada',
                mensaje:
                    `Al guardar se desvinculará de la orden ${formatOrderNumber(p.ordenPuestoNumero, p.ordenNumero)} ` +
                    'y volverá a quedar pendiente de facturación.',
                detalle: cambiaCantidad
                    ? [`Cantidad: ${cantidadAnterior} → ${cantidadNueva}`]
                    : [],
            })
            if (!ok) return
        }

        // Editar un item ya facturado recalcula lo que se cobra. Antes esto se
        // guardaba sin aviso: asi fue como en el ingreso 192 se bajaron los dias
        // de 5 a 2 sin que nadie lo notara hasta meses despues.
        if (p.tipo === 'ORDEN_ITEM' && (cambiaCantidad || cambiaImporte)) {
            const detalle: string[] = []
            if (cambiaCantidad) detalle.push(`Cantidad: ${cantidadAnterior} → ${cantidadNueva}`)
            if (cambiaImporte) {
                detalle.push(`Importe: ${formatCurrency(importeAnterior)} → ${formatCurrency(importeNuevo)}`)
            }

            const ok = await pedirConfirmacion({
                titulo: 'Estás modificando una prestación ya facturada',
                mensaje:
                    `Pertenece a la orden ${formatOrderNumber(p.origen.ordenPuestoNumero ?? null, p.origen.ordenNumero ?? null)}. ` +
                    'Al confirmar se recalculan los montos de la orden y del lote, y el cambio se propaga a la práctica vinculada.',
                detalle,
            })
            if (!ok) return
        }

        setGuardandoRowUid(p.uid)
        setError(null)
        try {
            let numeroAutorizacionPractica = draft.numeroAutorizacion || null

            const desgloseSelector = obtenerDesgloseSelector(p)
            const sel =
                compSeleccion[p.uid] ??
                parseIncluyeCodigoSeleccion(p.incluyeCodigo) ??
                (desgloseSelector && tieneDesglose(desgloseSelector)
                    ? seleccionPorDefecto(desgloseSelector)
                    : null)
            const incluyeCodigo = sel
                ? construirIncluyeCodigoDesdeSeleccion(
                    desgloseSelector,
                    sel,
                    p.incluyeCodigo,
                    clasificacionPorComponenteUid[p.uid],
                    draft.codigoPractica || p.codigoPractica
                )
                : (p.incluyeCodigo ?? null)
            const incluyeCodigoFinal = incluyeCodigo ?? null

            if (p.tipo === 'PRACTICA' && !p.facturada && (p.autorizacionesVinculadas?.length ?? 0) > 0) {
                const draftPorOrden = editAutorizacionesVinculadas[p.uid] ?? buildAutorizacionesVinculadasEditState(p)
                const updates = p.autorizacionesVinculadas!.map((aut) => {
                    const key = keyAutorizacionVinculada(aut)
                    return {
                        ...aut,
                        numeroAutorizacion: (draftPorOrden[key] ?? aut.numeroAutorizacion ?? '').trim() || null,
                    }
                })

                await Promise.all(
                    updates.map(async (aut) => {
                        const res = await fetch('/api/facturacion/autorizaciones', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                tipo: 'ORDEN_ITEM' as const,
                                puestoNumero: aut.ordenPuestoNumero,
                                ordenNumero: aut.ordenNumero,
                                item: aut.ordenItem,
                                numeroAutorizacion: aut.numeroAutorizacion,
                            }),
                        })

                        const json = (await res.json()) as ApiResponse<{ ok: boolean }>
                        if (!res.ok || !json.ok) {
                            throw new Error(
                                json.error ??
                                `No se pudo guardar autorización para ${formatOrderNumber(aut.ordenPuestoNumero, aut.ordenNumero)} item ${aut.ordenItem}`
                            )
                        }
                    })
                )

                if (!tieneNumeroAutorizacionValido(numeroAutorizacionPractica)) {
                    numeroAutorizacionPractica =
                        updates.find((aut) => tieneNumeroAutorizacionValido(aut.numeroAutorizacion))?.numeroAutorizacion ?? null
                }
            }

            const usaMatriculaAyudante =
                incluyeSoloAyudante(incluyeCodigoFinal) ||
                (!incluyeCodigoFinal && descripcionEsAyudante(draft.descripcion || p.descripcion))
            const usaMatriculaPatologia =
                !usaMatriculaAyudante &&
                (incluyeTienePatologia(incluyeCodigoFinal) || esCodigoPatologiaPorDefecto(draft.codigoPractica || p.codigoPractica))
            const common = {
                fecha: new Date(draft.fecha || p.fecha).toISOString(),
                codigoPractica: (draft.codigoPractica || p.codigoPractica || '').trim(),
                descripcionPractica: draft.descripcion,
                cantidad: Number(draft.cantidad || 1),
                incluyeCodigo: incluyeCodigoFinal,
                numeroAutorizacion:
                    p.tipo === 'PRACTICA'
                        ? numeroAutorizacionPractica
                        : (draft.numeroAutorizacion || null),
                importeTotal: Number(draft.importeTotal || 0),
                matriculaProfesional: null,
                matriculaEspecialista: usaMatriculaAyudante
                    ? MATRICULA_AYUDANTE_DEFAULT
                    : (draft.matriculaEspecialista
                        ? Number(draft.matriculaEspecialista)
                        : (usaMatriculaPatologia ? MATRICULA_PATOLOGIA_DEFAULT : null)),
                matriculaAnestesista: draft.matriculaAnestesista ? Number(draft.matriculaAnestesista) : null,
            }

            if (!common.codigoPractica) throw new Error('Código de práctica requerido')

            const payload =
                p.tipo === 'PRACTICA' && p.origen.practicaId
                    ? {
                        tipo: 'PRACTICA' as const,
                        practicaId: p.origen.practicaId,
                        aplicarOrdenCompleta,
                        ordenPuestoNumero: aplicarOrdenCompleta ? ordenParaEdicionGlobal?.puestoNumero : undefined,
                        ordenNumero: aplicarOrdenCompleta ? ordenParaEdicionGlobal?.ordenNumero : undefined,
                        ...common,
                    }
                    : {
                        tipo: 'ORDEN_ITEM' as const,
                        aplicarOrdenCompleta,
                        puestoNumero: p.origen.ordenPuestoNumero,
                        ordenNumero: p.origen.ordenNumero,
                        item: p.origen.ordenItem,
                        ...common,
                    }

            const res = await fetch('/api/facturacion/prestaciones/editar', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })

            const json = (await res.json()) as ApiResponse<{ ok: boolean }>
            if (!res.ok || !json.ok) throw new Error(json.error ?? 'No se pudo guardar prestación')

            setRowEditMode((prev) => ({ ...prev, [p.uid]: false }))
            setAplicarOrdenCompletaPorFila((prev) => {
                const next = { ...prev }
                delete next[p.uid]
                return next
            })
            if (contexto) await cargarContexto(contexto.ingreso.id, { silent: true })
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al guardar prestación')
        } finally {
            setGuardandoRowUid(null)
        }
    }

    async function crearOrdenDesdePractica(p: PrestacionFacturableItem) {
        if (!contexto) return
        if (p.tipo !== 'PRACTICA' || !p.origen.practicaId) return

        setCreandoOrdenPracticaUid(p.uid)
        setError(null)
        try {
            const res = await fetch('/api/facturacion/ordenes/crear-desde-practica', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ingresoId: contexto.ingreso.id,
                    practicaId: p.origen.practicaId,
                }),
            })

            const json = (await res.json()) as ApiResponse<{ puestoNumero: number; numero: number }>
            if (!res.ok || !json.ok || !json.data) {
                throw new Error(json.error ?? 'No se pudo crear la orden para la práctica')
            }

            setMensaje(`Orden creada desde facturación: ${formatOrderNumber(json.data.puestoNumero, json.data.numero)}`)
            await cargarContexto(contexto.ingreso.id)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al crear orden desde práctica')
        } finally {
            setCreandoOrdenPracticaUid(null)
        }
    }

    async function guardarDiferencialesCirugia(cirugia: CirugiaEditableGroup) {
        if (!contexto) return
        if (cirugiasCongeladas.has(cirugia.cirugiaId)) {
            setError('Los diferenciales de esta cirugía están congelados porque ya se facturaron sus prácticas.')
            return
        }

        const draft = diferencialesCirugiaEdit[cirugia.cirugiaId] ?? buildDiferencialesCirugiaState(cirugia)
        const practicaBaseId = draft.practicaBaseId
            ? Number.parseInt(draft.practicaBaseId, 10)
            : (cirugia.practicas
                .slice()
                .sort((a, b) => b.importeTotalReferencia - a.importeTotalReferencia)[0]?.practicaId ??
                cirugia.practicas[0]?.practicaId ??
                null)
        const practicaSecundariaId = draft.practicaSecundariaId
            ? Number.parseInt(draft.practicaSecundariaId, 10)
            : (cirugia.practicas
                .slice()
                .sort((a, b) => b.importeTotalReferencia - a.importeTotalReferencia)
                .find((p) => p.practicaId !== practicaBaseId)?.practicaId ??
                null)

        if (draft.dobleCirugia && (!practicaBaseId || !cirugia.practicas.some((p) => p.practicaId === practicaBaseId))) {
            setError('Debe seleccionar la práctica principal para aplicar doble cirugía')
            return
        }

        if (draft.dobleCirugia && (!practicaSecundariaId || !cirugia.practicas.some((p) => p.practicaId === practicaSecundariaId))) {
            setError('Debe seleccionar la práctica secundaria para aplicar doble cirugía')
            return
        }

        if (draft.dobleCirugia && practicaBaseId && practicaSecundariaId && practicaBaseId === practicaSecundariaId) {
            setError('La práctica principal y la secundaria deben ser distintas')
            return
        }

        setGuardandoDiferencialCirugiaId(cirugia.cirugiaId)
        setError(null)
        try {
            const res = await fetch('/api/facturacion/diferenciales', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ingresoId: contexto.ingreso.id,
                    cirugiaProgramadaId: cirugia.cirugiaId,
                    practicaBaseId: draft.dobleCirugia ? practicaBaseId : null,
                    practicaSecundariaId: draft.dobleCirugia ? practicaSecundariaId : null,
                    esFeriado: draft.esFeriado,
                    esNocturna: draft.esNocturna,
                    mismaViaPatologia: draft.mismaViaPatologia,
                    mismaViaMismaPatologia: draft.mismaViaMismaPatologia,
                    diferentesViasPatologia: draft.diferentesViasPatologia,
                    diferentesViasDiferentesPatologia: draft.diferentesViasDiferentesPatologia,
                    dobleCirugia: draft.dobleCirugia,
                }),
            })

            const json = (await res.json()) as ApiResponse<{ ok: boolean }>
            if (!res.ok || !json.ok) throw new Error(json.error ?? 'No se pudieron guardar los diferenciales de cirugía')

            setMensaje('Diferenciales de cirugía actualizados')
            await cargarContexto(contexto.ingreso.id, { silent: true, preserveUiState: true })
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al guardar diferenciales de cirugía')
        } finally {
            setGuardandoDiferencialCirugiaId(null)
        }
    }

    async function anularOrden(puestoNumero: number, numero: number) {
        if (!contexto) return
        const ok = window.confirm(
            `¿Anular la facturación de la Orden ${puestoNumero}-${numero}?\nLa orden sigue vigente: las prácticas vinculadas vuelven a pendientes y se pueden volver a facturar.`
        )
        if (!ok) return

        const key = `${puestoNumero}:${numero}`
        setAnulando(key)
        setError(null)
        try {
            const res = await fetch('/api/facturacion/ordenes/anular', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ puestoNumero, numero }),
            })
            const json = (await res.json()) as ApiResponse<{ ok: boolean; practicasDevueltas?: number }>
            if (!res.ok || !json.ok) throw new Error(json.error ?? 'No se pudo anular la facturación')

            const devueltas = json.data?.practicasDevueltas ?? 0
            setMensaje(
                `Facturación de la orden ${puestoNumero}-${numero} anulada. ` +
                `${devueltas} práctica(s) volvieron a pendientes.`
            )
            await cargarContexto(contexto.ingreso.id)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al anular orden')
        } finally {
            setAnulando(null)
        }
    }

    useEffect(() => {
        const estadoDesdeUrl = resolverEstadoBusquedaDesdeQuery(searchParams)
        const ingresoIdDesdeUrl = parseEnteroPositivo(searchParams.get('ingresoId'))

        setCriterioBusquedaPaciente(estadoDesdeUrl.criterioBusquedaPaciente)
        setBusquedaPaciente(estadoDesdeUrl.busquedaPaciente)
        setUsarFiltroFechaIngreso(estadoDesdeUrl.usarFiltroFechaIngreso)
        setFechaDesdeIngreso(estadoDesdeUrl.fechaDesdeIngreso)
        setFechaHastaIngreso(estadoDesdeUrl.fechaHastaIngreso)
        setUsarFiltroTipoIngreso(estadoDesdeUrl.usarFiltroTipoIngreso)
        setTipoIngresoCodigo(estadoDesdeUrl.tipoIngresoCodigo)
        setObraSocialId(estadoDesdeUrl.obraSocialId)
        setNumeroIngreso(estadoDesdeUrl.numeroIngreso)
        setNumeroOrden(estadoDesdeUrl.numeroOrden)
        setCodigoPractica(estadoDesdeUrl.codigoPractica)
        setSelectedIngresoId(ingresoIdDesdeUrl)
        setPaginaAdmisiones(1)

        const estadoKey = buildBusquedaStateKey(estadoDesdeUrl)
        if (estadoKey === ultimoEstadoBusquedaAutoRef.current) return
        ultimoEstadoBusquedaAutoRef.current = estadoKey

        void buscarAdmisiones(estadoDesdeUrl, { actualizarUrl: false, pagina: 1 })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams])

    useEffect(() => {
        if (selectedIngresoId) {
            cargarContexto(selectedIngresoId)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedIngresoId])

    useEffect(() => {
        setPaginaPrestaciones(1)
    }, [filtroPrestaciones, porPaginaPrestaciones, selectedIngresoId])

    const criterioPacienteActivo =
        CRITERIOS_BUSQUEDA_PACIENTE.find((criterio) => criterio.value === criterioBusquedaPaciente) ??
        CRITERIOS_BUSQUEDA_PACIENTE.find((criterio) => criterio.value === 'NOMBRE') ??
        {
            value: 'NOMBRE' as const,
            label: 'Nombre paciente',
            placeholder: 'Ej: Perez, Ana',
        }
    const mostrarListaCoincidencias = mostrarCoincidenciasBusqueda
    const totalPaginasAdmisiones = Math.max(1, Math.ceil(totalAdmisiones / porPaginaAdmisiones))
    const paginaAdmisionesActual = Math.min(paginaAdmisiones, totalPaginasAdmisiones)
    const esVistaFacturadas = vista === 'FACTURADAS'
    const hrefVistaPendientes = searchParams.toString()
        ? `/facturacion?${searchParams.toString()}`
        : '/facturacion'
    const hrefVistaFacturadas = searchParams.toString()
        ? `/facturacion/facturadas?${searchParams.toString()}`
        : '/facturacion/facturadas'

    return (
        <div className="p-6 space-y-4">
            <div className="his-card p-4 md:p-5">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                            <Search className="h-3.5 w-3.5" /> Buscar admisión
                        </div>
                        <p className="mt-2 text-sm text-gray-600">Buscá admisiones por paciente, documento, tipo o número de ingreso, número de orden o código de práctica.</p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <Link
                            href={esVistaFacturadas ? hrefVistaPendientes : hrefVistaFacturadas}
                            className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-xs font-medium shadow-sm transition-colors ${
                                esVistaFacturadas
                                    ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                                    : 'border-green-600 bg-green-600 text-white hover:bg-green-700'
                            }`}
                        >
                            {esVistaFacturadas ? 'Ver pendientes' : 'Ver facturadas'}
                        </Link>
                        <Link
                            href="/facturacion/lotes"
                            className="inline-flex h-9 items-center justify-center rounded-md bg-indigo-600 px-3 text-xs font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
                        >
                            Generar lote
                        </Link>
                        <Link
                            href="/facturacion/lotes?nuevo=ips"
                            className="inline-flex h-9 items-center justify-center rounded-md border border-green-600 bg-green-50 px-3 text-xs font-medium text-green-700 shadow-sm transition-colors hover:bg-green-100"
                        >
                            📄 Importar Planilla IPS
                        </Link>
                        <button
                            type="button"
                            onClick={() => setMostrarImportadorNomenclador(true)}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-blue-600 bg-blue-50 px-3 text-xs font-medium text-blue-700 shadow-sm transition-colors hover:bg-blue-100"
                        >
                            <Upload className="h-3.5 w-3.5" /> Actualizar Nomenclador
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
                    <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3 xl:col-span-6">
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
                            <Search className="h-3.5 w-3.5" /> Búsqueda directa de paciente
                        </div>

                        <div className="mb-2 flex flex-wrap gap-2">
                            {CRITERIOS_BUSQUEDA_PACIENTE.map((criterio) => {
                                const activo = criterio.value === criterioBusquedaPaciente
                                return (
                                    <button
                                        key={criterio.value}
                                        type="button"
                                        onClick={() => setCriterioBusquedaPaciente(criterio.value)}
                                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                                            activo
                                                ? 'border-blue-600 bg-blue-600 text-white'
                                                : 'border-blue-200 bg-white text-blue-700 hover:bg-blue-100'
                                        }`}
                                    >
                                        {criterio.label}
                                    </button>
                                )
                            })}
                        </div>

                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-400" />
                            <input
                                value={busquedaPaciente}
                                onChange={(e) => setBusquedaPaciente(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        void buscarAdmisiones(undefined, { pagina: 1 })
                                    }
                                }}
                                placeholder={criterioPacienteActivo.placeholder}
                                className="h-9 w-full rounded-md border border-blue-200 bg-white pl-8 pr-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                            />
                        </div>
                    </div>

                    <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 xl:col-span-6">
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                            <ListFilter className="h-3.5 w-3.5" /> Filtros de listado
                        </div>

                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-xs text-emerald-900">
                                <input
                                    type="checkbox"
                                    className="h-3.5 w-3.5 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-400"
                                    checked={usarFiltroFechaIngreso}
                                    onChange={(e) => setUsarFiltroFechaIngreso(e.target.checked)}
                                />
                                Filtrar por fecha de ingreso
                            </label>

                            {usarFiltroFechaIngreso && (
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <label className="space-y-1">
                                        <span className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">Desde</span>
                                        <div className="relative">
                                            <CalendarDays className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500" />
                                            <input
                                                type="date"
                                                value={fechaDesdeIngreso}
                                                onChange={(e) => setFechaDesdeIngreso(e.target.value)}
                                                className="h-8 w-full rounded-md border border-emerald-200 bg-white pl-7 pr-2 text-xs text-gray-900 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                                            />
                                        </div>
                                    </label>

                                    <label className="space-y-1">
                                        <span className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">Hasta</span>
                                        <div className="relative">
                                            <CalendarDays className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500" />
                                            <input
                                                type="date"
                                                value={fechaHastaIngreso}
                                                onChange={(e) => setFechaHastaIngreso(e.target.value)}
                                                className="h-8 w-full rounded-md border border-emerald-200 bg-white pl-7 pr-2 text-xs text-gray-900 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                                            />
                                        </div>
                                    </label>
                                </div>
                            )}

                            <label className="flex items-center gap-2 text-xs text-emerald-900">
                                <input
                                    type="checkbox"
                                    className="h-3.5 w-3.5 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-400"
                                    checked={usarFiltroTipoIngreso}
                                    onChange={(e) => setUsarFiltroTipoIngreso(e.target.checked)}
                                />
                                Filtrar por tipo de ingreso
                            </label>

                            {usarFiltroTipoIngreso && (
                                <div className="flex flex-wrap gap-2">
                                    {TIPOS_INGRESO_FILTRO.map((tipo) => {
                                        const activo = tipoIngresoCodigo === tipo
                                        return (
                                            <label
                                                key={tipo}
                                                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                                                    activo
                                                        ? 'border-emerald-600 bg-emerald-600 text-white'
                                                        : 'border-emerald-200 bg-white text-emerald-800'
                                                }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="h-3.5 w-3.5"
                                                    checked={activo}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setTipoIngresoCodigo(tipo)
                                                        } else {
                                                            setTipoIngresoCodigo('')
                                                        }
                                                    }}
                                                />
                                                {tipo}
                                            </label>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <label className="space-y-1 xl:col-span-3">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Obra social (opcional)</span>
                        <select
                            value={obraSocialId}
                            onChange={(e) => setObraSocialId(e.target.value)}
                            className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        >
                            <option value="">Todas</option>
                            {opcionesObraSociales.map((obraSocial) => (
                                <option key={obraSocial.id} value={String(obraSocial.id)}>
                                    {obraSocial.nombre}
                                </option>
                            ))}
                        </select>
                        {cargandoObraSociales && (
                            <span className="text-[11px] text-gray-500">Cargando obras sociales...</span>
                        )}
                    </label>

                    <label className="space-y-1 xl:col-span-3">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Número de ingreso (opcional)</span>
                        <input
                            type="number"
                            min="1"
                            step="1"
                            value={numeroIngreso}
                            onChange={(e) => setNumeroIngreso(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    void buscarAdmisiones(undefined, { pagina: 1 })
                                }
                            }}
                            placeholder="Ej: 12345"
                            className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                    </label>

                    <label className="space-y-1 xl:col-span-3">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Número de orden (opcional)</span>
                        <input
                            value={numeroOrden}
                            onChange={(e) => setNumeroOrden(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    void buscarAdmisiones(undefined, { pagina: 1 })
                                }
                            }}
                            placeholder="Ej: 230"
                            className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                    </label>

                    <label className="space-y-1 xl:col-span-3">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Código de práctica (opcional)</span>
                        <input
                            value={codigoPractica}
                            onChange={(e) => setCodigoPractica(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    void buscarAdmisiones(undefined, { pagina: 1 })
                                }
                            }}
                            placeholder="Ej: 420303"
                            className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                    </label>

                    <div className="flex items-end gap-2 xl:col-span-3">
                        <button
                            onClick={() => {
                                void buscarAdmisiones(undefined, { pagina: 1 })
                            }}
                            className="inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-3 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={buscando}
                        >
                            {buscando ? 'Buscando...' : 'Aplicar búsqueda'}
                        </button>
                        <button
                            type="button"
                            onClick={limpiarBusqueda}
                            className="inline-flex h-9 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                        >
                            Limpiar
                        </button>
                        <div className="inline-flex h-9 items-center rounded-md bg-gray-100 px-2.5 text-[11px] font-medium text-gray-700">
                            {totalAdmisiones} opciones encontradas
                        </div>
                    </div>

                    <div className="xl:col-span-12 space-y-2">
                        <div className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-700">Tabla de admisiones</span>
                            <button
                                type="button"
                                onClick={() => setMostrarCoincidenciasBusqueda((actual) => !actual)}
                                className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-100"
                            >
                                {mostrarListaCoincidencias ? 'Cerrar tabla' : 'Abrir tabla'}
                            </button>
                        </div>

                        {mostrarListaCoincidencias ? (
                            admisiones.length === 0 ? (
                                <div className="rounded-md border border-dashed border-gray-300 bg-white px-3 py-4 text-sm text-gray-500">
                                    No se encontraron admisiones para los filtros actuales.
                                </div>
                            ) : (
                                <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                                            <tr>
                                                <th className="px-3 py-2 text-left">Ingreso</th>
                                                <th className="px-3 py-2 text-left">Paciente</th>
                                                <th className="px-3 py-2 text-left">HC</th>
                                                <th className="px-3 py-2 text-left">DNI</th>
                                                <th className="px-3 py-2 text-left">Fecha ingreso</th>
                                                <th className="px-3 py-2 text-right">Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {admisiones.map((admision) => {
                                                const seleccionado = selectedIngresoId === admision.id
                                                return (
                                                    <tr
                                                        key={admision.id}
                                                        className={seleccionado ? 'bg-blue-50' : 'border-t border-gray-100'}
                                                    >
                                                        <td className="px-3 py-2 font-medium text-gray-900">
                                                            {admision.tipoIngresoCodigo}-{admision.numeroIngreso}
                                                        </td>
                                                        <td className="px-3 py-2 text-gray-800">
                                                            {admision.paciente?.nombreCompleto ?? 'Sin nombre'}
                                                        </td>
                                                        <td className="px-3 py-2 text-gray-700">
                                                            {admision.paciente?.historiaClinica ?? '—'}
                                                        </td>
                                                        <td className="px-3 py-2 text-gray-700">
                                                            {admision.paciente?.numeroDocumento ?? '—'}
                                                        </td>
                                                        <td className="px-3 py-2 text-gray-600">
                                                            {admision.fechaIngreso ? formatearFechaHoraArgentina(admision.fechaIngreso) : '—'}
                                                        </td>
                                                        <td className="px-3 py-2 text-right">
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setAutoSeleccionBusquedaDirecta(false)
                                                                    setMostrarCoincidenciasBusqueda(false)
                                                                    setSelectedIngresoId(admision.id)
                                                                    actualizarQueryEstado(admision.id)
                                                                }}
                                                                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                                                                    seleccionado
                                                                        ? 'bg-blue-600 text-white'
                                                                        : 'border border-blue-300 bg-white text-blue-700 hover:bg-blue-50'
                                                                }`}
                                                            >
                                                                {seleccionado ? 'Seleccionada' : 'Seleccionar'}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>

                                    {totalAdmisiones > porPaginaAdmisiones && (
                                        <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-gray-600">
                                            <span>
                                                Página {paginaAdmisionesActual} de {totalPaginasAdmisiones} · {totalAdmisiones} resultados
                                            </span>
                                            <div className="inline-flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const siguiente = Math.max(1, paginaAdmisionesActual - 1)
                                                        void buscarAdmisiones(undefined, {
                                                            pagina: siguiente,
                                                            actualizarUrl: false,
                                                            preservarSeleccionActual: true,
                                                            forzarMostrarCoincidencias: true,
                                                            permitirAutoSeleccion: false,
                                                        })
                                                    }}
                                                    disabled={paginaAdmisionesActual <= 1 || buscando}
                                                    className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                                >
                                                    Anterior
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const siguiente = Math.min(totalPaginasAdmisiones, paginaAdmisionesActual + 1)
                                                        void buscarAdmisiones(undefined, {
                                                            pagina: siguiente,
                                                            actualizarUrl: false,
                                                            preservarSeleccionActual: true,
                                                            forzarMostrarCoincidencias: true,
                                                            permitirAutoSeleccion: false,
                                                        })
                                                    }}
                                                    disabled={paginaAdmisionesActual >= totalPaginasAdmisiones || buscando}
                                                    className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                                >
                                                    Siguiente
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        ) : (
                            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800">
                                Tabla de admisiones oculta. Hacé click en Abrir tabla para volver a verla.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {confirmacion && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4">
                    <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-xl">
                        <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
                            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                            <h3 className="text-base font-semibold text-gray-900">{confirmacion.titulo}</h3>
                        </div>

                        <div className="space-y-3 px-5 py-4">
                            <p className="text-sm text-gray-600">{confirmacion.mensaje}</p>

                            {confirmacion.detalle.length > 0 && (
                                <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                                    {confirmacion.detalle.map((linea) => (
                                        <div key={linea} className="text-sm font-medium text-amber-900">{linea}</div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
                            <button
                                type="button"
                                onClick={() => responderConfirmacion(false)}
                                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => responderConfirmacion(true)}
                                className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
                            >
                                Confirmar cambios
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {mensaje && (
                <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl bg-green-700 px-4 py-3 text-sm text-white shadow-2xl">
                    <CheckCircle className="h-5 w-5 shrink-0" />
                    <span>{mensaje}</span>
                    <button onClick={() => setMensaje(null)} className="ml-1 rounded p-0.5 hover:bg-green-600"><XCircle className="h-4 w-4" /></button>
                </div>
            )}
            {error && <div className="his-card border-red-200 bg-red-50 text-red-700 p-3 text-sm">{error}</div>}

            <div className="space-y-4">
                    {cargandoContexto && <div className="his-card p-6 flex items-center gap-2 text-sm text-gray-600"><Loader2 className="h-4 w-4 animate-spin" /> Cargando contexto de facturación...</div>}

                    {!cargandoContexto && !contexto && (
                        <div className="his-card p-10 text-center text-gray-500">
                            <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                            Selecciona una admisión para comenzar
                        </div>
                    )}

                    {!cargandoContexto && contexto && (
                        <>
                            <div className="his-card p-4 space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-base font-semibold text-gray-900">Resumen del paciente</h3>
                                        <p className="text-xs text-gray-500 mt-1">Pendiente: <span className="font-semibold text-orange-700">{formatCurrency(totalPacientePendiente)}</span> {' · '}Facturado: <span className="font-semibold text-green-700">{formatCurrency(totalPacienteFacturado)}</span></p>
                                    </div>
                                    <div className="text-xs text-gray-500">Foco operativo: prácticas y órdenes</div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
                                    <div className="rounded-md border border-gray-200 px-3 py-2 bg-gray-50"><span className="text-gray-500 text-xs">Tipo de ingreso</span><div className="font-medium text-gray-900">{contexto.ingreso.tipoIngresoCodigo}</div></div>
                                    <div className="rounded-md border border-gray-200 px-3 py-2 bg-gray-50"><span className="text-gray-500 text-xs">Número de ingreso</span><div className="font-medium text-gray-900">{contexto.ingreso.numeroIngreso}</div></div>
                                    <div className="rounded-md border border-gray-200 px-3 py-2 bg-gray-50"><span className="text-gray-500 text-xs">Paciente</span><div className="font-medium text-gray-900">{formPacienteNombreCompleto || '—'}</div></div>
                                    <div className="rounded-md border border-gray-200 px-3 py-2 bg-gray-50"><span className="text-gray-500 text-xs">DNI</span><div className="font-medium text-gray-900">{contexto.paciente?.numeroDocumento ?? '—'}</div></div>
                                    <div className="rounded-md border border-gray-200 px-3 py-2 bg-gray-50"><span className="text-gray-500 text-xs">Obra social</span><div className="font-medium text-gray-900">{contexto.obraSocial?.nombre ?? 'Particular'}</div></div>
                                    <div className="rounded-md border border-gray-200 px-3 py-2 bg-gray-50"><span className="text-gray-500 text-xs">Coseguro</span><div className="font-medium text-gray-900">{contexto.obraSocialCoseguro?.nombre ?? '—'}</div></div>
                                    <div className="rounded-md border border-gray-200 px-3 py-2 bg-gray-50"><span className="text-gray-500 text-xs">N° afiliado</span><div className="font-medium text-gray-900">{formNumeroAfiliado || '—'}</div></div>
                                    <div className="rounded-md border border-gray-200 px-3 py-2 bg-gray-50"><span className="text-gray-500 text-xs">Ficha de ingreso</span><div className="font-medium text-gray-900">{formatearFechaHoraArgentina(contexto.ingreso.fechaIngreso)}</div></div>
                                </div>
                            </div>

                            {cirugiasEditables.length > 0 && (
                                <div className="his-card p-4 space-y-4 border-amber-200">
                                    <div>
                                        <h4 className="text-sm font-semibold text-amber-900">Diferenciales de cirugía</h4>
                                        <p className="text-xs text-amber-700">
                                            En cirugía múltiple, elegí práctica principal y práctica secundaria. El diferencial quirúrgico se aplica solo a la secundaria.
                                        </p>
                                        <p className="text-xs text-amber-700">
                                            Feriado y nocturna impactan montos en facturación según las reglas de diferenciales.
                                        </p>
                                        <p className="text-xs text-amber-700">
                                            Si la ficha quirúrgica no cargó el diferencial, se puede seleccionar acá mientras la cirugía no esté facturada.
                                        </p>
                                    </div>

                                    {cirugiasEditables.map((cirugia) => {
                                        const draft = diferencialesCirugiaEdit[cirugia.cirugiaId] ?? buildDiferencialesCirugiaState(cirugia)
                                        const etiquetasAplicadas = etiquetasCamposDiferencialCirugia(draft)
                                        const congelada = cirugiasCongeladas.has(cirugia.cirugiaId)

                                        return (
                                            <div key={cirugia.cirugiaId} className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="text-xs font-semibold text-amber-900">
                                                        Cirugía #{cirugia.cirugiaId} · Prácticas: {cirugia.practicas.length}
                                                    </div>
                                                    <button
                                                        onClick={() => guardarDiferencialesCirugia(cirugia)}
                                                        disabled={congelada || guardandoDiferencialCirugiaId === cirugia.cirugiaId}
                                                        className="rounded border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                                                    >
                                                        {guardandoDiferencialCirugiaId === cirugia.cirugiaId ? 'Guardando...' : 'Guardar diferenciales'}
                                                    </button>
                                                </div>

                                                {congelada && (
                                                    <div className="rounded border border-amber-300 bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-800">
                                                        Diferenciales congelados: ya se facturaron gastos u honorarios de especialista de esta cirugía. Para cambiarlos hay que anular la facturación de esas órdenes.
                                                    </div>
                                                )}

                                                <div className="rounded border border-amber-200 bg-white px-2 py-2 text-xs text-amber-900">
                                                    <span className="font-semibold">Campos con diferencial:</span>{' '}
                                                    {etiquetasAplicadas.length > 0 ? etiquetasAplicadas.join(' · ') : 'Base 100%'}
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 text-xs text-amber-900">
                                                    <label className="inline-flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={draft.esFeriado}
                                                            disabled={congelada}
                                                            onChange={(e) => setDiferencialesCirugiaEdit((prev) => ({
                                                                ...prev,
                                                                [cirugia.cirugiaId]: { ...draft, esFeriado: e.target.checked },
                                                            }))}
                                                        />
                                                        Feriado
                                                    </label>
                                                    <label className="inline-flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={draft.esNocturna}
                                                            disabled={congelada}
                                                            onChange={(e) => setDiferencialesCirugiaEdit((prev) => ({
                                                                ...prev,
                                                                [cirugia.cirugiaId]: { ...draft, esNocturna: e.target.checked },
                                                            }))}
                                                        />
                                                        Nocturna
                                                    </label>
                                                    <label className="inline-flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={draft.mismaViaPatologia}
                                                            disabled={congelada}
                                                            onChange={(e) => setDiferencialesCirugiaEdit((prev) => ({
                                                                ...prev,
                                                                [cirugia.cirugiaId]: { ...draft, mismaViaPatologia: e.target.checked },
                                                            }))}
                                                        />
                                                        Misma vía / distinta patología
                                                        <span className="text-[10px] text-amber-700">(Gastos al 30%; especialista y ayudante no se pagan)</span>
                                                    </label>
                                                    <label className="inline-flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={draft.mismaViaMismaPatologia}
                                                            disabled={congelada}
                                                            onChange={(e) => setDiferencialesCirugiaEdit((prev) => ({
                                                                ...prev,
                                                                [cirugia.cirugiaId]: { ...draft, mismaViaMismaPatologia: e.target.checked },
                                                            }))}
                                                        />
                                                        Misma vía / misma patología
                                                        <span className="text-[10px] text-amber-700">(Gastos al 30%; especialista y ayudante no se pagan)</span>
                                                    </label>
                                                    <label className="inline-flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={draft.diferentesViasPatologia}
                                                            disabled={congelada}
                                                            onChange={(e) => setDiferencialesCirugiaEdit((prev) => ({
                                                                ...prev,
                                                                [cirugia.cirugiaId]: { ...draft, diferentesViasPatologia: e.target.checked },
                                                            }))}
                                                        />
                                                        Distinta vía / misma patología
                                                        <span className="text-[10px] text-amber-700">(Gastos al 50%; especialista y ayudante al 75%)</span>
                                                    </label>
                                                    <label className="inline-flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={draft.diferentesViasDiferentesPatologia}
                                                            disabled={congelada}
                                                            onChange={(e) => setDiferencialesCirugiaEdit((prev) => ({
                                                                ...prev,
                                                                [cirugia.cirugiaId]: { ...draft, diferentesViasDiferentesPatologia: e.target.checked },
                                                            }))}
                                                        />
                                                        Distinta vía / distinta patología
                                                        <span className="text-[10px] text-amber-700">(Gastos al 50%; especialista y ayudante al 75%)</span>
                                                    </label>
                                                    <label className="inline-flex items-center gap-2 font-semibold">
                                                        <input
                                                            type="checkbox"
                                                            checked={draft.dobleCirugia}
                                                            disabled={congelada || cirugia.practicas.length < 2}
                                                            onChange={(e) => {
                                                                if (cirugia.practicas.length < 2) return
                                                                if (congelada) return
                                                                const checked = e.target.checked
                                                                const practicaBaseDefault =
                                                                    draft.practicaBaseId || String(cirugia.practicas[0]?.practicaId ?? '')
                                                                const practicaSecundariaDefault =
                                                                    cirugia.practicas
                                                                        .find((p) => String(p.practicaId) !== practicaBaseDefault)
                                                                        ?.practicaId ??
                                                                    null
                                                                setDiferencialesCirugiaEdit((prev) => ({
                                                                    ...prev,
                                                                    [cirugia.cirugiaId]: {
                                                                        ...draft,
                                                                        dobleCirugia: checked,
                                                                        practicaBaseId: checked
                                                                            ? practicaBaseDefault
                                                                            : '',
                                                                        practicaSecundariaId: checked
                                                                            ? (draft.practicaSecundariaId || (practicaSecundariaDefault ? String(practicaSecundariaDefault) : ''))
                                                                            : '',
                                                                    },
                                                                }))
                                                            }}
                                                        />
                                                        Doble cirugía
                                                    </label>
                                                </div>

                                                {cirugia.practicas.length < 2 && (
                                                    <div className="text-[11px] text-amber-800">
                                                        Doble cirugía requiere al menos 2 prácticas quirúrgicas en esta cirugía.
                                                    </div>
                                                )}

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-end">
                                                    <label className="text-xs text-amber-900">
                                                        Práctica principal (100% quirúrgico)
                                                        <select
                                                            value={draft.practicaBaseId}
                                                            onChange={(e) => {
                                                                const baseId = e.target.value
                                                                setDiferencialesCirugiaEdit((prev) => {
                                                                    const secundariaActual = draft.practicaSecundariaId
                                                                    const secundariaValida =
                                                                        secundariaActual && secundariaActual !== baseId
                                                                            ? secundariaActual
                                                                            : ''
                                                                    return {
                                                                        ...prev,
                                                                        [cirugia.cirugiaId]: {
                                                                            ...draft,
                                                                            practicaBaseId: baseId,
                                                                            practicaSecundariaId: secundariaValida,
                                                                        },
                                                                    }
                                                                })
                                                            }}
                                                            disabled={congelada || !draft.dobleCirugia}
                                                            className="mt-1 w-full rounded border border-amber-300 bg-white px-2 py-1 text-xs disabled:bg-amber-100"
                                                        >
                                                            <option value="">-- Seleccionar práctica principal --</option>
                                                            {cirugia.practicas.map((practica) => (
                                                                <option key={practica.practicaId} value={String(practica.practicaId)}>
                                                                    {practica.descripcion} · Total cirugía {formatCurrency(practica.importeTotalReferencia)}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                    <label className="text-xs text-amber-900">
                                                        Práctica secundaria (con diferencial)
                                                        <select
                                                            value={draft.practicaSecundariaId}
                                                            onChange={(e) => setDiferencialesCirugiaEdit((prev) => ({
                                                                ...prev,
                                                                [cirugia.cirugiaId]: { ...draft, practicaSecundariaId: e.target.value },
                                                            }))}
                                                            disabled={congelada || !draft.dobleCirugia}
                                                            className="mt-1 w-full rounded border border-amber-300 bg-white px-2 py-1 text-xs disabled:bg-amber-100"
                                                        >
                                                            <option value="">-- Seleccionar práctica secundaria --</option>
                                                            {cirugia.practicas
                                                                .filter((practica) => String(practica.practicaId) !== draft.practicaBaseId)
                                                                .map((practica) => (
                                                                    <option key={practica.practicaId} value={String(practica.practicaId)}>
                                                                        {practica.descripcion} · Total cirugía {formatCurrency(practica.importeTotalReferencia)}
                                                                    </option>
                                                                ))}
                                                        </select>
                                                    </label>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            {!esVistaFacturadas && (
                            <div className="his-card p-3 space-y-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <button
                                        onClick={() => setExpandNuevaPractica((v) => !v)}
                                        className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium ${expandNuevaPractica ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
                                    >
                                        <Plus className="h-3 w-3" /> Agregar práctica
                                    </button>
                                    <button
                                        onClick={() => setExpandPedidoLaboratorio((v) => !v)}
                                        className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium ${expandPedidoLaboratorio ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
                                    >
                                        <Plus className="h-3 w-3" /> Agregar laboratorio
                                    </button>
                                    <button
                                        onClick={() => setExpandNuevaMedicacion((v) => !v)}
                                        className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium ${expandNuevaMedicacion ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
                                    >
                                        <Plus className="h-3 w-3" /> Agregar medicación
                                    </button>
                                    <button
                                        onClick={() => setExpandNuevoDescartable((v) => !v)}
                                        className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium ${expandNuevoDescartable ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
                                    >
                                        <Plus className="h-3 w-3" /> Agregar descartable
                                    </button>
                                </div>

                                {expandNuevaPractica && (
                                    <div className="rounded-md border border-gray-200 bg-white p-2.5 space-y-2">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Agregar práctica</p>
                                        <div className="relative">
                                            <div className="relative">
                                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                                                <input
                                                    value={npBusqueda}
                                                    onChange={(e) => buscarNomenclador(e.target.value)}
                                                    placeholder="Buscar por código o descripción..."
                                                    className="h-8 w-full rounded border border-gray-300 pl-7 pr-7 text-xs"
                                                />
                                                {npBuscando && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 animate-spin" />}
                                                {npSeleccionada && (
                                                    <button onClick={() => { setNpSeleccionada(null); setNpBusqueda(''); setNpComponentes({ especialista: 0, ayudante: 0, anestesista: 0, gastos: 0 }) }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
                                                )}
                                            </div>
                                            {npResultados.length > 0 && (
                                                <ul className="absolute z-20 mt-1 w-full rounded border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto text-xs">
                                                    {npResultados.map((r) => (
                                                        <li key={`${r.convenioId}-${r.codigo}`}>
                                                            <button type="button" onClick={() => seleccionarDesdeBusqueda(r)} className="flex w-full items-start gap-2 px-2 py-1.5 text-left hover:bg-blue-50">
                                                                <span className="font-mono text-[10px] text-gray-400 shrink-0 pt-0.5">{r.codigo.trim()}</span>
                                                                <span className="min-w-0 flex-1 text-gray-800">{r.descripcion}</span>
                                                                <span className="shrink-0 text-[10px] font-medium text-gray-500">{r.valor != null ? formatCurrency(r.valor) : ''}</span>
                                                            </button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>

                                        {npSeleccionada && (
                                            <ComponenteSelector
                                                valores={{
                                                    valorEspecialista: npSeleccionada.valorEspecialista,
                                                    valorAyudante: npSeleccionada.valorAyudante,
                                                    valorAnestesista: npSeleccionada.valorAnestesista,
                                                    valorGastos: npSeleccionada.valorGastos,
                                                    valorTotal: npSeleccionada.valor,
                                                }}
                                                seleccion={npComponentes}
                                                onChange={setNpComponentes}
                                                disabled={guardandoPractica}
                                            />
                                        )}

                                        <div className="grid gap-2 md:grid-cols-2">
                                            <input value={nuevaPracticaAutorizacion} onChange={(e) => setNuevaPracticaAutorizacion(e.target.value)} className="h-8 rounded border border-gray-300 px-2 text-xs" placeholder="Nro autorización" />
                                            <input type="datetime-local" value={nuevaPracticaFecha} onChange={(e) => setNuevaPracticaFecha(e.target.value)} className="h-8 rounded border border-gray-300 px-2 text-xs" />
                                        </div>
                                        <button onClick={crearPractica} disabled={guardandoPractica || (!npSeleccionada && !npBusqueda.trim())} className="rounded border px-2 py-1 text-[11px] font-medium hover:bg-gray-50 disabled:opacity-60">{guardandoPractica ? 'Guardando...' : 'Guardar práctica'}</button>
                                    </div>
                                )}

                                {expandPedidoLaboratorio && (
                                    <div className="rounded-md border border-indigo-200 bg-indigo-50/40 p-2.5 space-y-2">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">Agregar laboratorio</p>
                                        <div className="grid gap-2 md:grid-cols-2">
                                            <input value={numeroProtocoloLaboratorio} onChange={(e) => setNumeroProtocoloLaboratorio(e.target.value)} className="h-8 rounded border border-gray-300 px-2 text-xs" placeholder="Número de protocolo" />
                                            <input value={diagnosticoLaboratorio} onChange={(e) => setDiagnosticoLaboratorio(e.target.value)} className="h-8 rounded border border-gray-300 px-2 text-xs" placeholder="Diagnóstico" />
                                        </div>
                                        <button onClick={crearPedidoLaboratorio} disabled={guardandoPedidoLaboratorio} className="rounded border border-indigo-300 bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-700 disabled:opacity-60">{guardandoPedidoLaboratorio ? 'Generando...' : 'Generar orden'}</button>
                                    </div>
                                )}

                                {expandNuevaMedicacion && (
                                    <div className="rounded-md border border-gray-200 bg-white p-2.5 space-y-2">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Agregar medicación</p>
                                        <div className="grid gap-2 md:grid-cols-2">
                                            <div>
                                                <select
                                                    value={nuevaMedicacionNombre}
                                                    onChange={(e) => setNuevaMedicacionNombre(e.target.value)}
                                                    className="h-8 w-full rounded border border-gray-300 px-2 text-xs bg-white"
                                                >
                                                    <option value="">-- Seleccionar de lista unificada --</option>
                                                    {opcionesInsumosUti.map((item) => (
                                                        <option key={item.id} value={item.nombre}>{item.nombre}</option>
                                                    ))}
                                                </select>
                                                {cargandoInsumosUti && <p className="mt-1 text-[11px] text-gray-400">Cargando listado...</p>}
                                            </div>
                                            <input type="datetime-local" value={nuevaMedicacionFecha} onChange={(e) => setNuevaMedicacionFecha(e.target.value)} className="h-8 rounded border border-gray-300 px-2 text-xs" />
                                        </div>
                                        <button onClick={crearMedicacion} disabled={guardandoMedicacion} className="rounded border px-2 py-1 text-[11px] font-medium hover:bg-gray-50 disabled:opacity-60">{guardandoMedicacion ? 'Guardando...' : 'Guardar medicación'}</button>
                                    </div>
                                )}

                                {expandNuevoDescartable && (
                                    <div className="rounded-md border border-gray-200 bg-white p-2.5 space-y-2">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Agregar descartable</p>
                                        <div>
                                            <select
                                                value={nuevoDescartableNombre}
                                                onChange={(e) => setNuevoDescartableNombre(e.target.value)}
                                                className="h-8 w-full rounded border border-gray-300 px-2 text-xs bg-white"
                                            >
                                                <option value="">-- Seleccionar de lista unificada --</option>
                                                {opcionesInsumosUti.map((item) => (
                                                    <option key={item.id} value={item.nombre}>{item.nombre}</option>
                                                ))}
                                            </select>
                                            {cargandoInsumosUti && <p className="mt-1 text-[11px] text-gray-400">Cargando listado...</p>}
                                        </div>
                                        <button onClick={crearDescartable} disabled={guardandoDescartable} className="rounded border px-2 py-1 text-[11px] font-medium hover:bg-gray-50 disabled:opacity-60">{guardandoDescartable ? 'Guardando...' : 'Guardar descartable'}</button>
                                    </div>
                                )}
                            </div>
                            )}

                            <div className="his-card overflow-hidden">
                                <div className="p-4 border-b bg-gray-50 flex items-center justify-between gap-3">
                                    <div>
                                        <h4 className="text-sm font-semibold text-gray-900">
                                            {esVistaFacturadas ? 'Prestaciones facturadas' : 'Prestaciones pendientes'}
                                        </h4>
                                        <p className="text-xs text-gray-500">
                                            {esVistaFacturadas
                                                ? 'Visualización de órdenes y prácticas ya facturadas.'
                                                : 'Editar y validar antes del armado de lotes.'}
                                        </p>
                                    </div>
                                    {!esVistaFacturadas && <div className="flex items-center gap-2">
                                        <button onClick={facturarPaciente} disabled={cargandoOrdenes} className="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60">{cargandoOrdenes ? 'Facturando...' : 'Facturar paciente'}</button>
                                    </div>}
                                </div>

                                <div className="border-b px-4 py-3 bg-white">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <div className="relative min-w-60 flex-1">
                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                                            <input
                                                type="text"
                                                value={filtroPrestaciones}
                                                onChange={(e) => setFiltroPrestaciones(e.target.value)}
                                                placeholder={esVistaFacturadas ? 'Filtrar prestaciones facturadas...' : 'Filtrar prestaciones pendientes...'}
                                                className="w-full rounded-md border border-gray-300 pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <select
                                            value={porPaginaPrestaciones}
                                            onChange={(e) => setPorPaginaPrestaciones(Number.parseInt(e.target.value, 10) || PRESTACIONES_POR_PAGINA_DEFAULT)}
                                            className="rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-700"
                                        >
                                            <option value={8}>8 órdenes por página</option>
                                            <option value={12}>12 órdenes por página</option>
                                            <option value={20}>20 órdenes por página</option>
                                        </select>
                                        <p className="text-xs text-gray-500 whitespace-nowrap">
                                            {esVistaFacturadas
                                                ? `Órdenes facturadas: ${ordenesConItems.length}`
                                                : `Grupos: ${gruposPrestacionesNoOrdenadasFiltradas.length} · Prácticas: ${prestacionesNoOrdenadasFiltradas.length} de ${prestacionesNoOrdenadas.length}`}
                                        </p>
                                    </div>
                                </div>

                                <div className="overflow-hidden">
                                    <table className="w-full table-fixed text-sm">
                                        <thead>
                                            <tr className="border-b bg-white text-left">
                                                <th className="w-24 px-3 py-2 text-xs font-medium text-gray-500">Orden</th>
                                                <th className="w-40 px-3 py-2 text-xs font-medium text-gray-500">Fecha</th>
                                                <th className="w-24 px-3 py-2 text-xs font-medium text-gray-500">Código</th>
                                                <th className="px-3 py-2 text-xs font-medium text-gray-500">Descripción</th>
                                                <th className="w-28 px-3 py-2 text-xs font-medium text-gray-500">N° orden</th>
                                                <th className="w-36 px-3 py-2 text-xs font-medium text-gray-500">Matrícula ejec.</th>
                                                <th className="w-16 px-3 py-2 text-xs font-medium text-gray-500">Cant</th>
                                                <th className="w-28 px-3 py-2 text-xs font-medium text-gray-500">Importe</th>
                                                <th className="w-28 px-3 py-2 text-xs font-medium text-gray-500">Acción</th>
                                                <th className="w-24 px-3 py-2 text-xs font-medium text-gray-500">Detalle</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {!esVistaFacturadas && gruposPrestacionesNoOrdenadasPaginadas.map((grupo) => {
                                                const grupoExpandido = ordenesPendientesExpand[grupo.key] ?? true
                                                const esGrupoCirugia = Boolean(grupo.cirugiaProgramadaId)
                                                const tieneNumeroOrden = !esGrupoCirugia && Boolean(grupo.ordenPuestoNumero && grupo.ordenNumero)
                                                const practicasSeleccionablesOrden = grupo.items.filter((it) => esPrestacionSeleccionableParaFacturar(it))
                                                const practicasSeleccionablesOrdenUids = practicasSeleccionablesOrden.map((it) => it.uid)
                                                const totalSeleccionablesOrden = practicasSeleccionablesOrdenUids.length
                                                const totalSeleccionadasOrden = practicasSeleccionablesOrdenUids.filter((uid) => Boolean(seleccion[uid])).length
                                                const ordenCompletaSeleccionada = totalSeleccionablesOrden > 0 && totalSeleccionadasOrden === totalSeleccionablesOrden
                                                const ordenSeleccionParcial = totalSeleccionadasOrden > 0 && totalSeleccionadasOrden < totalSeleccionablesOrden
                                                const authOrdenKey =
                                                    tieneNumeroOrden && grupo.ordenPuestoNumero && grupo.ordenNumero
                                                        ? keyAutorizacionOrden(grupo.ordenPuestoNumero, grupo.ordenNumero)
                                                        : null
                                                const numeroAutorizacionOrdenActual =
                                                    tieneNumeroOrden && grupo.ordenPuestoNumero && grupo.ordenNumero
                                                        ? obtenerNumeroAutorizacionOrdenDesdeItems(
                                                            grupo.items,
                                                            grupo.ordenPuestoNumero,
                                                            grupo.ordenNumero
                                                        )
                                                        : ''
                                                const numeroAutorizacionOrdenDraft = authOrdenKey
                                                    ? (editAutorizacionOrden[authOrdenKey] ?? numeroAutorizacionOrdenActual)
                                                    : ''
                                                const guardandoAutorizacionOrden =
                                                    Boolean(authOrdenKey) && guardandoAutorizacionOrdenKey === authOrdenKey
                                                const etiquetaOrden =
                                                    esGrupoCirugia
                                                        ? `Cirugía #${grupo.cirugiaProgramadaId}`
                                                        : (grupo.ordenPuestoNumero && grupo.ordenNumero
                                                        ? formatOrderNumber(grupo.ordenPuestoNumero, grupo.ordenNumero)
                                                        : 'Sin orden vinculada')
                                                const destinoOrdenGrupo =
                                                    grupo.ordenPuestoNumero && grupo.ordenNumero
                                                        ? `/dashboard/ambulatorio/${grupo.ordenPuestoNumero}/${grupo.ordenNumero}`
                                                        : null

                                                return (
                                                    <Fragment key={grupo.key}>
                                                        <tr className="bg-slate-50">
                                                            <td colSpan={10} className="px-3 py-2">
                                                                <div className="flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setOrdenesPendientesExpand((prev) => ({ ...prev, [grupo.key]: !grupoExpandido }))}
                                                                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-700"
                                                                    >
                                                                        {grupoExpandido ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                                                    </button>
                                                                    <span className="text-xs font-medium text-slate-700">
                                                                        {esGrupoCirugia ? 'Cirugía' : 'Orden'}
                                                                    </span>
                                                                    {destinoOrdenGrupo ? (
                                                                        <Link
                                                                            href={destinoOrdenGrupo}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
                                                                            title="Abrir orden en nueva pestaña"
                                                                        >
                                                                            {etiquetaOrden}
                                                                        </Link>
                                                                    ) : (
                                                                        <span className="text-xs font-medium text-slate-600">{etiquetaOrden}</span>
                                                                    )}
                                                                    {grupo.esCirugia && (
                                                                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                                                                            Cirugía
                                                                        </span>
                                                                    )}
                                                                    {grupo.esCirugiaMultiple && (
                                                                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-800">
                                                                            Regla cirugía múltiple
                                                                        </span>
                                                                    )}
                                                                    {grupo.etiquetasCirugia.map((etq) => (
                                                                        <span key={`${grupo.key}:${etq}`} className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800">
                                                                            {etq}
                                                                        </span>
                                                                    ))}
                                                                    <span className="text-[11px] text-slate-500">
                                                                        ({grupo.items.length} práctica{grupo.items.length === 1 ? '' : 's'}
                                                                        {esGrupoCirugia
                                                                            ? ` · ${grupo.ordenesRelacionadas.length} orden${grupo.ordenesRelacionadas.length === 1 ? '' : 'es'}`
                                                                            : ''}
                                                                        )
                                                                    </span>
                                                                    {esGrupoCirugia && grupo.ordenesRelacionadas.length > 0 && (
                                                                        <div className="flex flex-wrap items-center gap-1">
                                                                            {grupo.ordenesRelacionadas.map((ordenRelacionada) => {
                                                                                const hrefOrden = `/dashboard/ambulatorio/${ordenRelacionada.ordenPuestoNumero}/${ordenRelacionada.ordenNumero}`
                                                                                return (
                                                                                    <Link
                                                                                        key={`${grupo.key}:${ordenRelacionada.ordenPuestoNumero}:${ordenRelacionada.ordenNumero}`}
                                                                                        href={hrefOrden}
                                                                                        target="_blank"
                                                                                        rel="noopener noreferrer"
                                                                                        className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-100"
                                                                                        title="Abrir orden relacionada en nueva pestaña"
                                                                                    >
                                                                                        {formatOrderNumber(ordenRelacionada.ordenPuestoNumero, ordenRelacionada.ordenNumero)}
                                                                                    </Link>
                                                                                )
                                                                            })}
                                                                        </div>
                                                                    )}
                                                                    {totalSeleccionablesOrden > 0 && (
                                                                        <label className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800">
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={ordenCompletaSeleccionada}
                                                                                onChange={(e) => {
                                                                                    const nextChecked = e.target.checked
                                                                                    setSeleccion((prev) => {
                                                                                        const next = { ...prev }
                                                                                        for (const uid of practicasSeleccionablesOrdenUids) {
                                                                                            next[uid] = nextChecked
                                                                                        }
                                                                                        return next
                                                                                    })
                                                                                }}
                                                                            />
                                                                            {esGrupoCirugia ? 'Facturar cirugía completa' : 'Facturar orden completa'}
                                                                            <span className="text-[10px] text-emerald-700">
                                                                                ({totalSeleccionadasOrden}/{totalSeleccionablesOrden})
                                                                            </span>
                                                                            {ordenSeleccionParcial && (
                                                                                <span className="text-[10px] font-semibold text-amber-700">Parcial</span>
                                                                            )}
                                                                        </label>
                                                                    )}

                                                                    {authOrdenKey && grupo.ordenPuestoNumero && grupo.ordenNumero && (
                                                                        <div className="ml-auto flex flex-wrap items-center gap-1">
                                                                            <input
                                                                                value={numeroAutorizacionOrdenDraft}
                                                                                onChange={(e) =>
                                                                                    setEditAutorizacionOrden((prev) => ({
                                                                                        ...prev,
                                                                                        [authOrdenKey]: e.target.value,
                                                                                    }))
                                                                                }
                                                                                placeholder="Nro autorización orden"
                                                                                className="w-40 rounded border border-gray-300 px-2 py-1 text-xs"
                                                                            />
                                                                            <button
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    guardarAutorizacionOrden(
                                                                                        grupo.ordenPuestoNumero as number,
                                                                                        grupo.ordenNumero as number,
                                                                                        numeroAutorizacionOrdenDraft
                                                                                    )
                                                                                }
                                                                                disabled={guardandoAutorizacionOrden}
                                                                                className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                                                                            >
                                                                                {guardandoAutorizacionOrden ? 'Guardando...' : 'Guardar auth'}
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>

                                                        {grupoExpandido && grupo.items.map((p) => {
                                                const draft = editRows[p.uid] ?? buildEditState(p)
                                                const filaEnEdicion = Boolean(rowEditMode[p.uid])
                                                const detalleAbierto = Boolean(detallePrestacionesExpand[p.uid])
                                                const autorizacionesVinculadasOrdenadas =
                                                    p.tipo === 'PRACTICA' && !p.facturada
                                                        ? [...((p.autorizacionesVinculadas ?? []) as AutorizacionVinculadaExtendida[])].sort((a, b) => {
                                                            if (a.ordenPuestoNumero !== b.ordenPuestoNumero) {
                                                                return a.ordenPuestoNumero - b.ordenPuestoNumero
                                                            }
                                                            if (a.ordenNumero !== b.ordenNumero) {
                                                                return a.ordenNumero - b.ordenNumero
                                                            }
                                                            return a.ordenItem - b.ordenItem
                                                        })
                                                        : []
                                                const tieneAutorizacionesVinculadas = autorizacionesVinculadasOrdenadas.length > 0
                                                const tieneOrdenGenerada = practicaTieneOrdenGenerada(p)
                                                const tieneAutorizacionConOrden = practicaTieneAutorizacionConOrden(p)
                                                const practicaSinOrdenVinculada =
                                                    p.tipo === 'PRACTICA' &&
                                                    !p.facturada &&
                                                    !tieneAutorizacionesVinculadas
                                                const draftAutorizacionesVinculadas =
                                                    editAutorizacionesVinculadas[p.uid] ?? buildAutorizacionesVinculadasEditState(p)
                                                const desgloseSelector = obtenerDesgloseSelector(p)
                                                const seleccionable = esPrestacionSeleccionableParaFacturar(p)
                                                const yaFacturada = p.tipo === 'PRACTICA' && p.facturada
                                                const tieneComponentes = p.tipo === 'PRACTICA' && !p.facturada && desgloseSelector != null && tieneDesglose(desgloseSelector)
                                                const mostrarSelectorComponentes = p.tipo === 'PRACTICA' && !p.facturada
                                                const selComp = tieneComponentes
                                                    ? (compSeleccion[p.uid] ?? seleccionPorDefecto(desgloseSelector!))
                                                    : (mostrarSelectorComponentes ? (compSeleccion[p.uid] ?? { especialista: 0, ayudante: 0, anestesista: 0, gastos: 0 }) : null)
                                                const permiteEditarClasificacion = true
                                                const clasificacionesEditor =
                                                    p.tipo === 'PRACTICA' &&
                                                    permiteEditarClasificacion &&
                                                    selComp
                                                        ? construirClasificacionesPorComponenteUI(
                                                            selComp,
                                                            clasificacionPorComponenteUid[p.uid],
                                                            p.codigoPractica
                                                        )
                                                        : null
                                                const resumenIncluye = resumenSubitemsIncluidos(p.incluyeCodigo)
                                                const diferencialesActivos = resumenDiferenciales(p.diferenciales)
                                                if (p.diferenciales?.dobleCirugia && p.diferenciales?.esPracticaBase) {
                                                    diferencialesActivos.push('Principal (100% quirúrgico en doble cirugía)')
                                                }
                                                if (p.diferenciales?.dobleCirugia && p.diferenciales?.esPracticaSecundaria && p.diferenciales?.aplicaDiferencial) {
                                                    diferencialesActivos.push('Secundaria con diferencial')
                                                }
                                                const etiquetasDiferencial = etiquetasCamposDiferencial(p.diferenciales)
                                                const fechaDraft = draft.fecha ? new Date(draft.fecha) : null
                                                const fechaResumen = fechaDraft && !Number.isNaN(fechaDraft.getTime())
                                                    ? fechaDraft.toLocaleString('es-AR')
                                                    : '—'
                                                const importeResumen = Number.parseFloat(draft.importeTotal)
                                                const importeOriginal = p.importeTotalOriginal != null ? Number(p.importeTotalOriginal) : null
                                                const deltaDiferencial =
                                                    importeOriginal !== null
                                                        ? Number((Number(p.importeTotal ?? 0) - importeOriginal).toFixed(2))
                                                        : null
                                                const mostrarDeltaDiferencial = Boolean(
                                                    p.diferenciales?.aplicaDiferencial &&
                                                    importeOriginal !== null &&
                                                    Math.abs(deltaDiferencial ?? 0) > 0.009
                                                )
                                                const numeroOrdenLinea = obtenerNumeroOrdenPrestacion(p, autorizacionesVinculadasOrdenadas)
                                                const destinoOrdenLinea = obtenerDestinoOrdenPrestacion(p, autorizacionesVinculadasOrdenadas)
                                                const ordenAgrupada = Boolean(grupo.ordenPuestoNumero && grupo.ordenNumero)
                                                const itemsOrdenRelacionados = obtenerItemsOrdenRelacionados(p, autorizacionesVinculadasOrdenadas)
                                                const itemOrdenPrincipalKey =
                                                    p.origen.ordenPuestoNumero && p.origen.ordenNumero && p.origen.ordenItem
                                                        ? `${p.origen.ordenPuestoNumero}:${p.origen.ordenNumero}:${p.origen.ordenItem}`
                                                        : (itemsOrdenRelacionados[0]
                                                            ? keyItemOrdenRelacionado(itemsOrdenRelacionados[0])
                                                            : null)
                                                const matriculaEjecutante = obtenerMatriculaEjecutante(p, draft, autorizacionesVinculadasOrdenadas)
                                                const matriculaEjecutanteNumero = obtenerMatriculaEjecutanteNumero(p, draft, autorizacionesVinculadasOrdenadas)
                                                const profesionalEjecutante = matriculaEjecutanteNumero
                                                    ? profesionalPorMatricula.get(matriculaEjecutanteNumero)
                                                    : null
                                                const ejecutanteDetalle = matriculaEjecutanteNumero
                                                    ? `${profesionalEjecutante?.nombre ?? 'Sin nombre'} · MP ${matriculaEjecutanteNumero}`
                                                    : '—'
                                                const mostrarMatriculaAyudante = mostrarCampoMatriculaAyudante(p, desgloseSelector)
                                                const mostrarMatriculaAnestesista = mostrarCampoMatriculaAnestesista(p, desgloseSelector)
                                                const ordenParaEdicionGlobal = obtenerOrdenParaOrdenamiento(p)
                                                const aplicaOrdenCompleta = Boolean(
                                                    aplicarOrdenCompletaPorFila[p.uid] && ordenParaEdicionGlobal
                                                )
                                                const practicaSeleccionada = Boolean(seleccion[p.uid])
                                                return (
                                                    <Fragment key={p.uid}>
                                                        <tr className={yaFacturada ? 'bg-green-50' : p.esPracticaCirugia ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-gray-50'}>
                                                            <td className="px-3 py-2 align-top">
                                                                {yaFacturada ? (
                                                                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">✓ Facturada</span>
                                                                ) : seleccionable ? (
                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                        {p.esPracticaCirugia && (
                                                                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800" title={diferencialesActivos.join(' · ') || 'Práctica vinculada a cirugía'}>
                                                                                Cirugía
                                                                            </span>
                                                                        )}
                                                                        <label className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium ${practicaSeleccionada ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-300 bg-white text-slate-700'}`}>
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={practicaSeleccionada}
                                                                                onChange={(e) => {
                                                                                    const nextChecked = e.target.checked
                                                                                    setSeleccion((prev) => ({
                                                                                        ...prev,
                                                                                        [p.uid]: nextChecked,
                                                                                    }))
                                                                                }}
                                                                            />
                                                                            {practicaSeleccionada ? 'Práctica incluida' : 'Seleccionar práctica'}
                                                                        </label>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                        {p.esPracticaCirugia && (
                                                                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800" title={diferencialesActivos.join(' · ') || 'Práctica vinculada a cirugía'}>
                                                                                Cirugía
                                                                            </span>
                                                                        )}
                                                                        <span className="text-[11px] font-medium text-amber-700">
                                                                            {practicaSinOrdenVinculada ? 'Sin orden generada' : 'Sin autorización'}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2 align-top">
                                                                {filaEnEdicion ? (
                                                                    <input
                                                                        type="datetime-local"
                                                                        value={draft.fecha}
                                                                        onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, fecha: e.target.value } }))}
                                                                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                                                                    />
                                                                ) : (
                                                                    <div className="text-xs text-gray-700">{fechaResumen}</div>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2 align-top">
                                                                {filaEnEdicion ? (
                                                                    <input
                                                                        value={draft.codigoPractica}
                                                                        onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, codigoPractica: e.target.value } }))}
                                                                        className="w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs"
                                                                    />
                                                                ) : (
                                                                    <span className="font-mono text-xs text-gray-700">{draft.codigoPractica || '—'}</span>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2 align-top">
                                                                {filaEnEdicion ? (
                                                                    <input
                                                                        value={draft.descripcion}
                                                                        onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, descripcion: e.target.value } }))}
                                                                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                                                                    />
                                                                ) : (
                                                                    <div className="truncate text-xs text-gray-700" title={draft.descripcion || ''}>{draft.descripcion || '—'}</div>
                                                                )}
                                                                {p.tipo === 'PRACTICA' && (
                                                                    <div className="mt-1 flex flex-wrap gap-1">
                                                                        {resumenIncluye && (
                                                                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                                                                                Incluye: {resumenIncluye}
                                                                            </span>
                                                                        )}
                                                                        {autorizacionesVinculadasOrdenadas.slice(0, 2).map((aut) => (
                                                                            <span
                                                                                key={`${p.uid}:resumen:${aut.ordenPuestoNumero}:${aut.ordenNumero}:${aut.ordenItem}`}
                                                                                className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800"
                                                                                title={`Orden ${formatOrderNumber(aut.ordenPuestoNumero, aut.ordenNumero)} · Item ${aut.ordenItem}`}
                                                                            >
                                                                                {formatOrderNumber(aut.ordenPuestoNumero, aut.ordenNumero)} · {aut.numeroAutorizacion ?? 'S/A'}
                                                                            </span>
                                                                        ))}
                                                                        {autorizacionesVinculadasOrdenadas.length > 2 && (
                                                                            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                                                                                +{autorizacionesVinculadasOrdenadas.length - 2} más
                                                                            </span>
                                                                        )}
                                                                        {p.esPracticaCirugia && etiquetasDiferencial.map((etq) => (
                                                                            <span
                                                                                key={`${p.uid}:resumen-diferencial:${etq}`}
                                                                                className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800"
                                                                            >
                                                                                {etq}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2 align-top">
                                                                {ordenAgrupada ? (
                                                                    <span className="text-[11px] text-gray-400">↳</span>
                                                                ) : destinoOrdenLinea ? (
                                                                    <Link
                                                                        href={destinoOrdenLinea}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
                                                                        title="Abrir orden"
                                                                    >
                                                                        {numeroOrdenLinea}
                                                                    </Link>
                                                                ) : (
                                                                    <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">{numeroOrdenLinea}</span>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2 align-top">
                                                                {filaEnEdicion && (p.tipo === 'PRACTICA' || p.tipo === 'ORDEN_ITEM') ? (
                                                                    <ProfesionalSelect
                                                                        profesionales={profesionalesConMatricula}
                                                                        value={resolveSelectedProfesionalId(draft.matriculaEspecialista)}
                                                                        onChange={(nextValue) => applyProfesionalSelection(p.uid, draft, 'matriculaEspecialista', nextValue)}
                                                                        placeholderOption="-- Seleccionar --"
                                                                        searchPlaceholder="Buscar nombre o matricula"
                                                                        selectClassName="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                                                                        searchClassName="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-[11px]"
                                                                    />
                                                                ) : (
                                                                    <span className="text-xs text-gray-700">{matriculaEjecutante}</span>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2 align-top">
                                                                {filaEnEdicion ? (
                                                                    <input
                                                                        value={draft.cantidad}
                                                                        onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: actualizarCantidadPrestacion(draft, e.target.value) }))}
                                                                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                                                                    />
                                                                ) : (
                                                                    <span className="text-xs text-gray-700">{draft.cantidad || '—'}</span>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2 align-top">
                                                                {filaEnEdicion ? (
                                                                    <input
                                                                        value={draft.importeTotal}
                                                                        onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, importeTotal: e.target.value } }))}
                                                                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                                                                    />
                                                                ) : (
                                                                    <div className="space-y-0.5">
                                                                        <span className="text-xs font-semibold text-gray-800">{Number.isFinite(importeResumen) ? formatCurrency(importeResumen) : '—'}</span>
                                                                        {mostrarDeltaDiferencial && importeOriginal !== null && deltaDiferencial !== null && (
                                                                            <div className="text-[10px] text-amber-700">
                                                                                Base {formatCurrency(importeOriginal)} · Dif {deltaDiferencial > 0 ? '+' : ''}{formatCurrency(deltaDiferencial)}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2 align-top">
                                                                {p.tipo === 'PRACTICA' || p.tipo === 'ORDEN_ITEM' ? (
                                                                    filaEnEdicion ? (
                                                                        <div className="flex flex-col gap-1">
                                                                            <button onClick={() => guardarPrestacion(p)} disabled={guardandoRowUid === p.uid} className="rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-60">{guardandoRowUid === p.uid ? 'Guardando...' : 'Guardar'}</button>
                                                                            <button onClick={() => cancelarEdicionFila(p)} disabled={guardandoRowUid === p.uid} className="rounded border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-60">Cancelar</button>
                                                                        </div>
                                                                    ) : (
                                                                        <button onClick={() => habilitarEdicionFila(p)} className="rounded border px-2 py-1 text-xs hover:bg-gray-50">Editar</button>
                                                                    )
                                                                ) : (
                                                                    <span className="text-xs text-gray-400">No aplica</span>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2 align-top">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setDetallePrestacionesExpand((prev) => ({ ...prev, [p.uid]: !detalleAbierto }))}
                                                                    className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded border px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                                                >
                                                                    {detalleAbierto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                                                    {detalleAbierto ? 'Ocultar' : 'Ver'}
                                                                </button>
                                                            </td>
                                                        </tr>

                                                        {detalleAbierto && (
                                                            <tr className="bg-slate-50">
                                                                <td colSpan={10} className="px-4 py-3">
                                                                    <div className="mb-3 flex items-center justify-between gap-2">
                                                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Detalle de prestación</p>
                                                                        {filaEnEdicion ? (
                                                                            <div className="flex items-center gap-2">
                                                                                {ordenParaEdicionGlobal && (
                                                                                    <label className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-800">
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            checked={aplicaOrdenCompleta}
                                                                                            onChange={(e) =>
                                                                                                setAplicarOrdenCompletaPorFila((prev) => ({
                                                                                                    ...prev,
                                                                                                    [p.uid]: e.target.checked,
                                                                                                }))
                                                                                            }
                                                                                        />
                                                                                        Aplicar a toda la orden {formatOrderNumber(ordenParaEdicionGlobal.puestoNumero, ordenParaEdicionGlobal.ordenNumero)}
                                                                                    </label>
                                                                                )}
                                                                                <button
                                                                                    onClick={() => guardarPrestacion(p)}
                                                                                    disabled={guardandoRowUid === p.uid}
                                                                                    className="rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-60"
                                                                                >
                                                                                    {guardandoRowUid === p.uid ? 'Guardando...' : 'Guardar'}
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => cancelarEdicionFila(p)}
                                                                                    disabled={guardandoRowUid === p.uid}
                                                                                    className="rounded border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                                                                                >
                                                                                    Cancelar
                                                                                </button>
                                                                            </div>
                                                                        ) : (
                                                                            <button
                                                                                onClick={() => habilitarEdicionFila(p)}
                                                                                className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                                                                            >
                                                                                Editar
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                    <div className="grid gap-3 lg:grid-cols-12">
                                                                        <div className="rounded-md border border-slate-200 bg-white p-2 lg:col-span-5">
                                                                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Datos de prestación</p>
                                                                            <div className="mt-1 grid gap-2">
                                                                                <label className="text-[11px] text-gray-600">
                                                                                    Fecha
                                                                                    <input
                                                                                        type="datetime-local"
                                                                                        value={draft.fecha}
                                                                                        onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, fecha: e.target.value } }))}
                                                                                        disabled={!filaEnEdicion}
                                                                                        className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-100 disabled:text-gray-500"
                                                                                    />
                                                                                </label>
                                                                                <label className="text-[11px] text-gray-600">
                                                                                    Código
                                                                                    <input
                                                                                        value={draft.codigoPractica}
                                                                                        onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, codigoPractica: e.target.value } }))}
                                                                                        disabled={!filaEnEdicion}
                                                                                        className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-100 disabled:text-gray-500"
                                                                                    />
                                                                                </label>
                                                                                <label className="text-[11px] text-gray-600">
                                                                                    Descripción
                                                                                    <input
                                                                                        value={draft.descripcion}
                                                                                        onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, descripcion: e.target.value } }))}
                                                                                        disabled={!filaEnEdicion}
                                                                                        className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-100 disabled:text-gray-500"
                                                                                    />
                                                                                </label>
                                                                                <div className="grid grid-cols-2 gap-2">
                                                                                    <label className="text-[11px] text-gray-600">
                                                                                        Cantidad
                                                                                        <input
                                                                                            value={draft.cantidad}
                                                                                            onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: actualizarCantidadPrestacion(draft, e.target.value) }))}
                                                                                            disabled={!filaEnEdicion}
                                                                                            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-100 disabled:text-gray-500"
                                                                                        />
                                                                                    </label>
                                                                                    <label className="text-[11px] text-gray-600">
                                                                                        Importe total
                                                                                        <input
                                                                                            value={draft.importeTotal}
                                                                                            onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, importeTotal: e.target.value } }))}
                                                                                            disabled={!filaEnEdicion}
                                                                                            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-100 disabled:text-gray-500"
                                                                                        />
                                                                                    </label>
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        <div className="rounded-md border border-slate-200 bg-white p-2 lg:col-span-4">
                                                                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Autorizaciones</p>
                                                                            <div className="mt-1 space-y-2">
                                                                                <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
                                                                                    <span className="font-semibold">Ejecutante:</span> {ejecutanteDetalle}
                                                                                </div>
                                                                                {p.tipo === 'PRACTICA' && !p.facturada ? (
                                                                                    tieneAutorizacionesVinculadas ? (
                                                                                        filaEnEdicion ? (
                                                                                            <div className="space-y-1">
                                                                                                {autorizacionesVinculadasOrdenadas.map((aut) => {
                                                                                                    const key = keyAutorizacionVinculada(aut)
                                                                                                    return (
                                                                                                        <div key={`${p.uid}:${key}`} className="flex flex-wrap items-center gap-2">
                                                                                                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800">
                                                                                                                {formatOrderNumber(aut.ordenPuestoNumero, aut.ordenNumero)} · Item {aut.ordenItem}{aut.incluyeCodigo ? ` [${aut.incluyeCodigo}]` : ''}
                                                                                                            </span>
                                                                                                            <input
                                                                                                                value={draftAutorizacionesVinculadas[key] ?? ''}
                                                                                                                onChange={(e) =>
                                                                                                                    setEditAutorizacionesVinculadas((prev) => ({
                                                                                                                        ...prev,
                                                                                                                        [p.uid]: {
                                                                                                                            ...(prev[p.uid] ?? draftAutorizacionesVinculadas),
                                                                                                                            [key]: e.target.value,
                                                                                                                        },
                                                                                                                    }))
                                                                                                                }
                                                                                                                placeholder="Nro autorización"
                                                                                                                className="w-full rounded border border-gray-300 px-2 py-1 text-xs md:w-44"
                                                                                                            />
                                                                                                        </div>
                                                                                                    )
                                                                                                })}
                                                                                            </div>
                                                                                        ) : (
                                                                                            <div className="flex flex-wrap gap-1">
                                                                                                {autorizacionesVinculadasOrdenadas.map((aut) => (
                                                                                                    <span
                                                                                                        key={`${p.uid}:${aut.ordenPuestoNumero}:${aut.ordenNumero}:${aut.ordenItem}`}
                                                                                                        className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800"
                                                                                                        title={`Orden ${formatOrderNumber(aut.ordenPuestoNumero, aut.ordenNumero)} · Item ${aut.ordenItem}`}
                                                                                                    >
                                                                                                        {formatOrderNumber(aut.ordenPuestoNumero, aut.ordenNumero)} · {aut.numeroAutorizacion ?? 'S/A'}{aut.incluyeCodigo ? ` [${aut.incluyeCodigo}]` : ''}
                                                                                                    </span>
                                                                                                ))}
                                                                                            </div>
                                                                                        )
                                                                                    ) : (
                                                                                        <div className="space-y-2">
                                                                                            <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                                                                                                Sin orden vinculada. Primero generá la orden; luego podrás cargar el número de autorización.
                                                                                            </div>
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => crearOrdenDesdePractica(p)}
                                                                                                disabled={creandoOrdenPracticaUid === p.uid}
                                                                                                className="inline-flex w-fit items-center justify-center rounded border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                                                                                            >
                                                                                                {creandoOrdenPracticaUid === p.uid ? 'Generando orden...' : 'Generar orden en facturación'}
                                                                                            </button>
                                                                                            <input
                                                                                                value={draft.numeroAutorizacion}
                                                                                                disabled
                                                                                                placeholder="Nro autorización (requiere orden)"
                                                                                                className="w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-500 disabled:bg-gray-100 disabled:text-gray-500"
                                                                                            />
                                                                                        </div>
                                                                                    )
                                                                                ) : (
                                                                                    <input value={draft.numeroAutorizacion} onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, numeroAutorizacion: e.target.value } }))} disabled={!filaEnEdicion} placeholder="Nro autorización" className="w-full rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-100 disabled:text-gray-500" />
                                                                                )}
                                                                            </div>
                                                                        </div>

                                                                        <div className="rounded-md border border-slate-200 bg-white p-2 lg:col-span-3">
                                                                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Matrículas</p>
                                                                            <div className="mt-1 grid gap-2">
                                                                                <label className="text-[11px] text-gray-600">
                                                                                    Ejecutante
                                                                                    <ProfesionalSelect
                                                                                        profesionales={profesionalesConMatricula}
                                                                                        value={resolveSelectedProfesionalId(draft.matriculaEspecialista)}
                                                                                        onChange={(nextValue) => applyProfesionalSelection(p.uid, draft, 'matriculaEspecialista', nextValue)}
                                                                                        disabled={!filaEnEdicion}
                                                                                        placeholderOption="-- Seleccionar --"
                                                                                        searchPlaceholder="Buscar nombre o matricula"
                                                                                        selectClassName="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-100 disabled:text-gray-500"
                                                                                        searchClassName="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-[11px] disabled:bg-gray-100 disabled:text-gray-500"
                                                                                    />
                                                                                </label>
                                                                                {mostrarMatriculaAyudante && (
                                                                                    <label className="text-[11px] text-gray-600">
                                                                                        Ayudante
                                                                                        <ProfesionalSelect
                                                                                            profesionales={profesionalesConMatricula}
                                                                                            value={resolveSelectedProfesionalId(draft.matriculaAyudante)}
                                                                                            onChange={(nextValue) => applyProfesionalSelection(p.uid, draft, 'matriculaAyudante', nextValue)}
                                                                                            disabled={!filaEnEdicion}
                                                                                            placeholderOption="-- Seleccionar --"
                                                                                            searchPlaceholder="Buscar nombre o matricula"
                                                                                            selectClassName="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-100 disabled:text-gray-500"
                                                                                            searchClassName="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-[11px] disabled:bg-gray-100 disabled:text-gray-500"
                                                                                        />
                                                                                    </label>
                                                                                )}
                                                                                {mostrarMatriculaAnestesista && (
                                                                                    <label className="text-[11px] text-gray-600">
                                                                                        Anestesista
                                                                                        <ProfesionalSelect
                                                                                            profesionales={profesionalesConMatricula}
                                                                                            value={resolveSelectedProfesionalId(draft.matriculaAnestesista)}
                                                                                            onChange={(nextValue) => applyProfesionalSelection(p.uid, draft, 'matriculaAnestesista', nextValue)}
                                                                                            disabled={!filaEnEdicion}
                                                                                            placeholderOption="-- Seleccionar --"
                                                                                            searchPlaceholder="Buscar nombre o matricula"
                                                                                            selectClassName="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-100 disabled:text-gray-500"
                                                                                            searchClassName="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-[11px] disabled:bg-gray-100 disabled:text-gray-500"
                                                                                        />
                                                                                    </label>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-700">
                                                                        {resumenIncluye && (
                                                                            <span className="rounded-full bg-slate-100 px-2 py-0.5">Incluye: {resumenIncluye}</span>
                                                                        )}
                                                                        {itemsOrdenRelacionados.map((item) => {
                                                                            const keyItem = keyItemOrdenRelacionado(item)
                                                                            const esPrincipal = itemOrdenPrincipalKey === keyItem
                                                                            return (
                                                                                <span
                                                                                    key={`${p.uid}:item-vinculado:${keyItem}`}
                                                                                    className={esPrincipal
                                                                                        ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800'
                                                                                        : 'rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700'}
                                                                                >
                                                                                    {formatOrderNumber(item.ordenPuestoNumero, item.ordenNumero)} · Item {item.ordenItem}
                                                                                    {esPrincipal ? ' (esta práctica)' : ''}
                                                                                </span>
                                                                            )
                                                                        })}
                                                                        {etiquetasDiferencial.length > 0 && etiquetasDiferencial.map((etq) => (
                                                                            <span key={etq} className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800">{etq}</span>
                                                                        ))}
                                                                        {diferencialesActivos.length > 0 && diferencialesActivos.map((texto) => (
                                                                            <span key={texto} className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">{texto}</span>
                                                                        ))}
                                                                    </div>

                                                                    {(tieneComponentes || mostrarSelectorComponentes) && selComp && (
                                                                        <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-2">
                                                                            <ComponenteSelector
                                                                                valores={desgloseSelector ?? {
                                                                                    valorEspecialista: null,
                                                                                    valorAyudante: null,
                                                                                    valorAnestesista: null,
                                                                                    valorGastos: null,
                                                                                    valorTotal: p.precioUnitario ?? null,
                                                                                }}
                                                                                seleccion={selComp}
                                                                                disabled={!filaEnEdicion}
                                                                                clasificacionesPorComponente={clasificacionesEditor?.clasificacionesPorComponente}
                                                                                onClasificacionChange={
                                                                                    clasificacionesEditor
                                                                                        ? (index, value) => {
                                                                                            if (!filaEnEdicion) return
                                                                                            const target = clasificacionesEditor.indexMap[index]
                                                                                            if (!target) return

                                                                                            setClasificacionPorComponenteUid((prev) => {
                                                                                                const prevUid = prev[p.uid] ?? {}
                                                                                                const actuales = [...(prevUid[target.componente] ?? [])]
                                                                                                while (actuales.length <= target.posicion) {
                                                                                                    const fallback = clasificacionPorDefectoComponente(target.componente, actuales.length, p.codigoPractica)
                                                                                                    actuales.push(fallback)
                                                                                                }
                                                                                                actuales[target.posicion] = normalizarClasificacionInput(value)

                                                                                                return {
                                                                                                    ...prev,
                                                                                                    [p.uid]: {
                                                                                                        ...prevUid,
                                                                                                        [target.componente]: actuales,
                                                                                                    },
                                                                                                }
                                                                                            })
                                                                                        }
                                                                                        : undefined
                                                                                }
                                                                                clasificacionListId={clasificacionesEditor ? 'clasificacion-facturacion-list' : undefined}
                                                                                onChange={(nuevaSeleccion) => {
                                                                                    if (!filaEnEdicion) return
                                                                                    setCompSeleccion((prev) => ({ ...prev, [p.uid]: nuevaSeleccion }))
                                                                                    if (tieneComponentes) {
                                                                                        const totalBase = calcularTotalSeleccionado(desgloseSelector!, nuevaSeleccion)
                                                                                        const cant = Number(draft.cantidad || 1)
                                                                                        const pct = contexto?.reglaFacturacion.porcentajeFacturacion ?? 100
                                                                                        const nuevoImporte = Math.round((totalBase * cant * pct / 100) * 100) / 100
                                                                                        setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, importeTotal: String(nuevoImporte) } }))
                                                                                    }
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </Fragment>
                                                )
                                            })}

                                                    </Fragment>
                                                )
                                            })}

                                            {!esVistaFacturadas && prestacionesNoOrdenadasFiltradas.length === 0 && prestacionesNoOrdenadas.length > 0 && (
                                                <tr>
                                                    <td colSpan={10} className="px-3 py-4 text-center text-xs text-gray-500">
                                                        No hay prestaciones pendientes para el filtro aplicado.
                                                    </td>
                                                </tr>
                                            )}

                                            {esVistaFacturadas && ordenesConItems.map((orden) => {
                                                const expand = ordenesExpand[orden.key] ?? true
                                                const authOrdenKey = keyAutorizacionOrden(orden.puesto, orden.numero)
                                                const numeroAutorizacionOrdenActual =
                                                    orden.items.find((it) => tieneNumeroAutorizacionValido(it.numeroAutorizacion))
                                                        ?.numeroAutorizacion?.trim() ?? ''
                                                const numeroAutorizacionOrdenDraft =
                                                    editAutorizacionOrden[authOrdenKey] ?? numeroAutorizacionOrdenActual
                                                const guardandoAutorizacionOrden = guardandoAutorizacionOrdenKey === authOrdenKey
                                                return (
                                                    <Fragment key={orden.key}>
                                                        <tr key={`head-${orden.key}`} className="bg-green-50">
                                                            <td className="px-3 py-2" colSpan={6}>
                                                                <button onClick={() => setOrdenesExpand((prev) => ({ ...prev, [orden.key]: !expand }))} className="inline-flex items-center gap-2 text-xs font-semibold text-green-800">
                                                                    {expand ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                                                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">✓ Facturada</span>
                                                                    Orden {formatOrderNumber(orden.puesto, orden.numero)}
                                                                </button>
                                                                <div className="mt-2 flex flex-wrap items-end gap-2">
                                                                    <label className="text-[11px] text-gray-600">
                                                                        Nro autorización orden
                                                                        <input
                                                                            value={numeroAutorizacionOrdenDraft}
                                                                            onChange={(e) =>
                                                                                setEditAutorizacionOrden((prev) => ({
                                                                                    ...prev,
                                                                                    [authOrdenKey]: e.target.value,
                                                                                }))
                                                                            }
                                                                            className="mt-1 w-40 rounded border border-gray-300 px-2 py-1 text-xs"
                                                                            placeholder="Nro autorización"
                                                                        />
                                                                    </label>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            guardarAutorizacionOrden(
                                                                                orden.puesto,
                                                                                orden.numero,
                                                                                numeroAutorizacionOrdenDraft
                                                                            )
                                                                        }
                                                                        disabled={guardandoAutorizacionOrden}
                                                                        className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                                                                    >
                                                                        {guardandoAutorizacionOrden ? 'Guardando auth...' : 'Guardar auth'}
                                                                    </button>
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-2 text-xs text-gray-700">{orden.items.length} ítems</td>
                                                            <td className="px-3 py-2 text-xs font-semibold text-gray-800">{formatCurrency(orden.total)}</td>
                                                            <td className="px-3 py-2"><button onClick={() => anularOrden(orden.puesto, orden.numero)} disabled={anulando === orden.key} title="Anula la facturación y devuelve las prácticas a pendientes. La orden sigue vigente." className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"><XCircle className="h-3.5 w-3.5" />{anulando === orden.key ? 'Anulando...' : 'Anular facturación'}</button></td>
                                                            <td className="px-3 py-2 text-xs text-gray-500">Facturada</td>
                                                        </tr>

                                                        {expand && orden.items.map((p) => {
                                                            const draft = editRows[p.uid] ?? buildEditState(p)
                                                            const filaEnEdicion = Boolean(rowEditMode[p.uid])
                                                            const detalleAbierto = Boolean(detallePrestacionesExpand[p.uid])
                                                            const desgloseSelector = obtenerDesgloseSelector(p)
                                                            const resumenIncluye = resumenSubitemsIncluidos(p.incluyeCodigo)
                                                            const etiquetasDiferencial = etiquetasCamposDiferencial(p.diferenciales)
                                                            const fechaDraft = draft.fecha ? new Date(draft.fecha) : null
                                                            const fechaResumen = fechaDraft && !Number.isNaN(fechaDraft.getTime())
                                                                ? fechaDraft.toLocaleString('es-AR')
                                                                : '—'
                                                            const importeResumen = Number.parseFloat(draft.importeTotal)
                                                            const importeOriginal = p.importeTotalOriginal != null ? Number(p.importeTotalOriginal) : null
                                                            const deltaDiferencial =
                                                                importeOriginal !== null
                                                                    ? Number((Number(p.importeTotal ?? 0) - importeOriginal).toFixed(2))
                                                                    : null
                                                            const mostrarDeltaDiferencial = Boolean(
                                                                p.diferenciales?.aplicaDiferencial &&
                                                                importeOriginal !== null &&
                                                                Math.abs(deltaDiferencial ?? 0) > 0.009
                                                            )
                                                            const numeroOrdenLinea = obtenerNumeroOrdenPrestacion(p, [])
                                                            const destinoOrdenLinea = obtenerDestinoOrdenPrestacion(p, [])
                                                            const matriculaEjecutante = obtenerMatriculaEjecutante(p, draft, [])
                                                            const matriculaEjecutanteNumero = obtenerMatriculaEjecutanteNumero(p, draft, [])
                                                            const profesionalEjecutante = matriculaEjecutanteNumero
                                                                ? profesionalPorMatricula.get(matriculaEjecutanteNumero)
                                                                : null
                                                            const ejecutanteDetalle = matriculaEjecutanteNumero
                                                                ? `${profesionalEjecutante?.nombre ?? 'Sin nombre'} · MP ${matriculaEjecutanteNumero}`
                                                                : '—'
                                                            const mostrarMatriculaAyudante = mostrarCampoMatriculaAyudante(p, desgloseSelector)
                                                            const mostrarMatriculaAnestesista = mostrarCampoMatriculaAnestesista(p, desgloseSelector)
                                                            const ordenParaEdicionGlobal = obtenerOrdenParaOrdenamiento(p)
                                                            const aplicaOrdenCompleta = Boolean(
                                                                aplicarOrdenCompletaPorFila[p.uid] && ordenParaEdicionGlobal
                                                            )

                                                            return (
                                                                <Fragment key={p.uid}>
                                                                    <tr className="hover:bg-gray-50">
                                                                        <td className="px-3 py-2 align-top text-xs text-gray-500">
                                                                            Item {p.origen.ordenItem}
                                                                        </td>
                                                                        <td className="px-3 py-2 align-top">
                                                                            {filaEnEdicion ? (
                                                                                <input
                                                                                    type="datetime-local"
                                                                                    value={draft.fecha}
                                                                                    onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, fecha: e.target.value } }))}
                                                                                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                                                                                />
                                                                            ) : (
                                                                                <span className="text-xs text-gray-700">{fechaResumen}</span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-3 py-2 align-top">
                                                                            {filaEnEdicion ? (
                                                                                <input
                                                                                    value={draft.codigoPractica}
                                                                                    onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, codigoPractica: e.target.value } }))}
                                                                                    className="w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs"
                                                                                />
                                                                            ) : (
                                                                                <span className="font-mono text-xs text-gray-700">{draft.codigoPractica || '—'}</span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-3 py-2 align-top">
                                                                            {filaEnEdicion ? (
                                                                                <input
                                                                                    value={draft.descripcion}
                                                                                    onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, descripcion: e.target.value } }))}
                                                                                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                                                                                />
                                                                            ) : (
                                                                                <div className="truncate text-xs text-gray-700" title={draft.descripcion || ''}>{draft.descripcion || '—'}</div>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-3 py-2 align-top">
                                                                            {destinoOrdenLinea ? (
                                                                                <Link
                                                                                    href={destinoOrdenLinea}
                                                                                    target="_blank"
                                                                                    rel="noopener noreferrer"
                                                                                    className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
                                                                                    title="Abrir orden"
                                                                                >
                                                                                    {numeroOrdenLinea}
                                                                                </Link>
                                                                            ) : (
                                                                                <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">{numeroOrdenLinea}</span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-3 py-2 align-top">
                                                                            {filaEnEdicion ? (
                                                                                <ProfesionalSelect
                                                                                    profesionales={profesionalesConMatricula}
                                                                                    value={resolveSelectedProfesionalId(draft.matriculaEspecialista)}
                                                                                    onChange={(nextValue) => applyProfesionalSelection(p.uid, draft, 'matriculaEspecialista', nextValue)}
                                                                                    placeholderOption="-- Seleccionar --"
                                                                                    searchPlaceholder="Buscar nombre o matricula"
                                                                                    selectClassName="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                                                                                    searchClassName="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-[11px]"
                                                                                />
                                                                            ) : (
                                                                                <span className="text-xs text-gray-700">{matriculaEjecutante}</span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-3 py-2 align-top">
                                                                            {filaEnEdicion ? (
                                                                                <input
                                                                                    value={draft.cantidad}
                                                                                    onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: actualizarCantidadPrestacion(draft, e.target.value) }))}
                                                                                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                                                                                />
                                                                            ) : (
                                                                                <span className="text-xs text-gray-700">{draft.cantidad || '—'}</span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-3 py-2 align-top">
                                                                            {filaEnEdicion ? (
                                                                                <input
                                                                                    value={draft.importeTotal}
                                                                                    onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, importeTotal: e.target.value } }))}
                                                                                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                                                                                />
                                                                            ) : (
                                                                                <div className="space-y-0.5">
                                                                                    <span className="text-xs font-semibold text-gray-800">{Number.isFinite(importeResumen) ? formatCurrency(importeResumen) : '—'}</span>
                                                                                    {mostrarDeltaDiferencial && importeOriginal !== null && deltaDiferencial !== null && (
                                                                                        <div className="text-[10px] text-amber-700">
                                                                                            Base {formatCurrency(importeOriginal)} · Dif {deltaDiferencial > 0 ? '+' : ''}{formatCurrency(deltaDiferencial)}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-3 py-2 align-top">
                                                                            {filaEnEdicion ? (
                                                                                <div className="flex flex-col gap-1">
                                                                                    <button onClick={() => guardarPrestacion(p)} disabled={guardandoRowUid === p.uid} className="rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-60">{guardandoRowUid === p.uid ? 'Guardando...' : 'Guardar'}</button>
                                                                                    <button onClick={() => cancelarEdicionFila(p)} disabled={guardandoRowUid === p.uid} className="rounded border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-60">Cancelar</button>
                                                                                </div>
                                                                            ) : (
                                                                                <button onClick={() => habilitarEdicionFila(p)} className="rounded border px-2 py-1 text-xs hover:bg-gray-50">Editar</button>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-3 py-2 align-top">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setDetallePrestacionesExpand((prev) => ({ ...prev, [p.uid]: !detalleAbierto }))}
                                                                                className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded border px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                                                            >
                                                                                {detalleAbierto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                                                                {detalleAbierto ? 'Ocultar' : 'Ver'}
                                                                            </button>
                                                                        </td>
                                                                    </tr>

                                                                    {detalleAbierto && (
                                                                        <tr className="bg-slate-50">
                                                                            <td colSpan={10} className="px-4 py-3">
                                                                                <div className="mb-3 flex items-center justify-between gap-2">
                                                                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Detalle de prestación</p>
                                                                                    {filaEnEdicion ? (
                                                                                        <div className="flex items-center gap-2">
                                                                                            {ordenParaEdicionGlobal && (
                                                                                                <label className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-800">
                                                                                                    <input
                                                                                                        type="checkbox"
                                                                                                        checked={aplicaOrdenCompleta}
                                                                                                        onChange={(e) =>
                                                                                                            setAplicarOrdenCompletaPorFila((prev) => ({
                                                                                                                ...prev,
                                                                                                                [p.uid]: e.target.checked,
                                                                                                            }))
                                                                                                        }
                                                                                                    />
                                                                                                    Aplicar a toda la orden {formatOrderNumber(ordenParaEdicionGlobal.puestoNumero, ordenParaEdicionGlobal.ordenNumero)}
                                                                                                </label>
                                                                                            )}
                                                                                            <button
                                                                                                onClick={() => guardarPrestacion(p)}
                                                                                                disabled={guardandoRowUid === p.uid}
                                                                                                className="rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-60"
                                                                                            >
                                                                                                {guardandoRowUid === p.uid ? 'Guardando...' : 'Guardar'}
                                                                                            </button>
                                                                                            <button
                                                                                                onClick={() => cancelarEdicionFila(p)}
                                                                                                disabled={guardandoRowUid === p.uid}
                                                                                                className="rounded border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                                                                                            >
                                                                                                Cancelar
                                                                                            </button>
                                                                                        </div>
                                                                                    ) : (
                                                                                        <button
                                                                                            onClick={() => habilitarEdicionFila(p)}
                                                                                            className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                                                                                        >
                                                                                            Editar
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                                <div className="grid gap-3 lg:grid-cols-12">
                                                                                    <div className="rounded-md border border-slate-200 bg-white p-2 lg:col-span-5">
                                                                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Datos de prestación</p>
                                                                                        <div className="mt-1 grid gap-2">
                                                                                            <label className="text-[11px] text-gray-600">
                                                                                                Fecha
                                                                                                <input type="datetime-local" value={draft.fecha} onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, fecha: e.target.value } }))} disabled={!filaEnEdicion} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-100 disabled:text-gray-500" />
                                                                                            </label>
                                                                                            <label className="text-[11px] text-gray-600">
                                                                                                Código
                                                                                                <input value={draft.codigoPractica} onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, codigoPractica: e.target.value } }))} disabled={!filaEnEdicion} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-100 disabled:text-gray-500" />
                                                                                            </label>
                                                                                            <label className="text-[11px] text-gray-600">
                                                                                                Descripción
                                                                                                <input value={draft.descripcion} onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, descripcion: e.target.value } }))} disabled={!filaEnEdicion} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-100 disabled:text-gray-500" />
                                                                                            </label>
                                                                                            <div className="grid grid-cols-2 gap-2">
                                                                                                <label className="text-[11px] text-gray-600">
                                                                                                    Cantidad
                                                                                                    <input value={draft.cantidad} onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: actualizarCantidadPrestacion(draft, e.target.value) }))} disabled={!filaEnEdicion} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-100 disabled:text-gray-500" />
                                                                                                </label>
                                                                                                <label className="text-[11px] text-gray-600">
                                                                                                    Importe total
                                                                                                    <input value={draft.importeTotal} onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, importeTotal: e.target.value } }))} disabled={!filaEnEdicion} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-100 disabled:text-gray-500" />
                                                                                                </label>
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>

                                                                                    <div className="rounded-md border border-slate-200 bg-white p-2 lg:col-span-4">
                                                                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Autorización</p>
                                                                                        <div className="mt-1 space-y-1 text-xs text-gray-700">
                                                                                            <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
                                                                                                <span className="font-semibold">Ejecutante:</span> {ejecutanteDetalle}
                                                                                            </div>
                                                                                            <input value={draft.numeroAutorizacion} onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, numeroAutorizacion: e.target.value } }))} disabled={!filaEnEdicion} placeholder="Nro autorización" className="w-full rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-100 disabled:text-gray-500" />
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="rounded-md border border-slate-200 bg-white p-2 lg:col-span-3">
                                                                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Matrículas</p>
                                                                                        <div className="mt-1 grid gap-2">
                                                                                            <label className="text-[11px] text-gray-600">
                                                                                                Ejecutante
                                                                                                <ProfesionalSelect
                                                                                                    profesionales={profesionalesConMatricula}
                                                                                                    value={resolveSelectedProfesionalId(draft.matriculaEspecialista)}
                                                                                                    onChange={(nextValue) => applyProfesionalSelection(p.uid, draft, 'matriculaEspecialista', nextValue)}
                                                                                                    disabled={!filaEnEdicion}
                                                                                                    placeholderOption="-- Seleccionar --"
                                                                                                    searchPlaceholder="Buscar nombre o matricula"
                                                                                                    selectClassName="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-100 disabled:text-gray-500"
                                                                                                    searchClassName="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-[11px] disabled:bg-gray-100 disabled:text-gray-500"
                                                                                                />
                                                                                            </label>
                                                                                            {mostrarMatriculaAyudante && (
                                                                                                <label className="text-[11px] text-gray-600">
                                                                                                    Ayudante
                                                                                                    <ProfesionalSelect
                                                                                                        profesionales={profesionalesConMatricula}
                                                                                                        value={resolveSelectedProfesionalId(draft.matriculaAyudante)}
                                                                                                        onChange={(nextValue) => applyProfesionalSelection(p.uid, draft, 'matriculaAyudante', nextValue)}
                                                                                                        disabled={!filaEnEdicion}
                                                                                                        placeholderOption="-- Seleccionar --"
                                                                                                        searchPlaceholder="Buscar nombre o matricula"
                                                                                                        selectClassName="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-100 disabled:text-gray-500"
                                                                                                        searchClassName="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-[11px] disabled:bg-gray-100 disabled:text-gray-500"
                                                                                                    />
                                                                                                </label>
                                                                                            )}
                                                                                            {mostrarMatriculaAnestesista && (
                                                                                                <label className="text-[11px] text-gray-600">
                                                                                                    Anestesista
                                                                                                    <ProfesionalSelect
                                                                                                        profesionales={profesionalesConMatricula}
                                                                                                        value={resolveSelectedProfesionalId(draft.matriculaAnestesista)}
                                                                                                        onChange={(nextValue) => applyProfesionalSelection(p.uid, draft, 'matriculaAnestesista', nextValue)}
                                                                                                        disabled={!filaEnEdicion}
                                                                                                        placeholderOption="-- Seleccionar --"
                                                                                                        searchPlaceholder="Buscar nombre o matricula"
                                                                                                        selectClassName="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-100 disabled:text-gray-500"
                                                                                                        searchClassName="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-[11px] disabled:bg-gray-100 disabled:text-gray-500"
                                                                                                    />
                                                                                                </label>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-700">
                                                                                    {resumenIncluye && (
                                                                                        <span className="rounded-full bg-slate-100 px-2 py-0.5">Incluye: {resumenIncluye}</span>
                                                                                    )}
                                                                                    {etiquetasDiferencial.length > 0 && etiquetasDiferencial.map((etq) => (
                                                                                        <span key={etq} className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800">{etq}</span>
                                                                                    ))}
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    )}
                                                                </Fragment>
                                                            )
                                                        })}
                                                    </Fragment>
                                                )
                                            })}

                                                    {esVistaFacturadas && ordenesConItems.length === 0 && (
                                                        <tr>
                                                            <td colSpan={10} className="px-3 py-6 text-center text-sm text-gray-500">
                                                                Sin prestaciones facturadas
                                                            </td>
                                                        </tr>
                                                    )}
                                                    {!esVistaFacturadas && gruposPrestacionesNoOrdenadasFiltradas.length === 0 && (
                                                        <tr>
                                                            <td colSpan={10} className="px-3 py-6 text-center text-sm text-gray-500">
                                                                Sin prestaciones pendientes
                                                            </td>
                                                        </tr>
                                                    )}
                                        </tbody>
                                    </table>
                                </div>

                                <datalist id="clasificacion-facturacion-list">
                                    <option value="HE" />
                                    <option value="HA" />
                                    <option value="GA" />
                                    <option value="HP" />
                                    <option value="A1" />
                                    <option value="A2" />
                                    <option value="A3" />
                                </datalist>

                                <div className="px-4 py-2 border-t text-xs text-gray-500 flex flex-wrap items-center justify-between gap-2">
                                    {esVistaFacturadas ? (
                                        <span>Órdenes facturadas: {ordenesConItems.length}</span>
                                    ) : (
                                        <span>Seleccionables para facturar: {prestacionesSeleccionables.length} · Seleccionadas: {prestacionesSeleccionadas.length}</span>
                                    )}
                                    {!esVistaFacturadas && gruposPrestacionesNoOrdenadasFiltradas.length > porPaginaPrestaciones && (
                                        <span className="inline-flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => setPaginaPrestaciones((prev) => Math.max(1, prev - 1))}
                                                disabled={paginaPrestacionesActual <= 1}
                                                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                            >
                                                Anterior
                                            </button>
                                            <span className="text-xs text-gray-600">Página {paginaPrestacionesActual} de {totalPaginasPrestaciones}</span>
                                            <button
                                                type="button"
                                                onClick={() => setPaginaPrestaciones((prev) => Math.min(totalPaginasPrestaciones, prev + 1))}
                                                disabled={paginaPrestacionesActual >= totalPaginasPrestaciones}
                                                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                            >
                                                Siguiente
                                            </button>
                                        </span>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
            </div>

            {mostrarImportadorNomenclador && (
                <ImportarNomencladorModal
                    onClose={() => setMostrarImportadorNomenclador(false)}
                    onExito={(msg) => {
                        setMensaje(msg)
                        setMostrarImportadorNomenclador(false)
                    }}
                    onError={(msg) => setError(msg)}
                />
            )}
        </div>
    )
}

type ImportarNomencladorModalProps = {
    onClose: () => void
    onExito: (mensaje: string) => void
    onError: (mensaje: string) => void
}

function ImportarNomencladorModal({ onClose, onExito, onError }: ImportarNomencladorModalProps) {
    const IMPORT_TIMEOUT_MS = 840000
    const [archivo, setArchivo] = useState<File | null>(null)
    const [loading, setLoading] = useState(false)
    const [errorLocal, setErrorLocal] = useState<string | null>(null)
    const [vigenteNombre, setVigenteNombre] = useState<string | null>(null)
    const [loadingVigente, setLoadingVigente] = useState(true)
    const abortRef = useRef<AbortController | null>(null)

    function cerrarModal() {
        if (loading && abortRef.current) {
            abortRef.current.abort()
            abortRef.current = null
        }
        setLoading(false)
        onClose()
    }

    useEffect(() => {
        let cancelled = false

        async function cargarVigente() {
            setLoadingVigente(true)
            try {
                const res = await fetch('/api/facturacion/nomenclador/import')
                const json = (await res.json()) as ApiResponse<{ vigente: { nombre: string } | null }>
                if (!cancelled) {
                    setVigenteNombre(json.ok ? (json.data?.vigente?.nombre ?? null) : null)
                }
            } catch {
                if (!cancelled) setVigenteNombre(null)
            } finally {
                if (!cancelled) setLoadingVigente(false)
            }
        }

        cargarVigente()
        return () => {
            cancelled = true
        }
    }, [])

    async function importar() {
        setErrorLocal(null)
        if (!archivo) {
            setErrorLocal('Seleccioná un archivo XLS/XLSX para continuar.')
            return
        }

        console.log(`[ImportarNomencladorModal] Iniciando importación de archivo: ${archivo.name}`)
        setLoading(true)
        const controller = new AbortController()
        abortRef.current = controller
        let timeoutId: NodeJS.Timeout | null = null

        try {
            const fd = new FormData()
            fd.append('file', archivo)

            console.log(`[ImportarNomencladorModal] FormData preparado, tamaño archivo: ${archivo.size} bytes`)

            timeoutId = setTimeout(() => {
                console.warn(`[ImportarNomencladorModal] Timeout de ${IMPORT_TIMEOUT_MS}ms alcanzado, abortando...`)
                controller.abort()
            }, IMPORT_TIMEOUT_MS)

            console.log(`[ImportarNomencladorModal] Enviando POST a /api/facturacion/nomenclador/import`)
            const res = await fetch('/api/facturacion/nomenclador/import', {
                method: 'POST',
                body: fd,
                signal: controller.signal,
            })

            if (timeoutId) clearTimeout(timeoutId)

            console.log(`[ImportarNomencladorModal] POST completado, status: ${res.status}`)

            let json: any = null

            try {
                json = await res.json()
            } catch (parseErr) {
                console.error(`[ImportarNomencladorModal] Error al parsear JSON:`, parseErr)
                throw new Error(`Error al procesar respuesta: ${parseErr instanceof Error ? parseErr.message : 'desconocido'}`)
            }

            console.log(`[ImportarNomencladorModal] JSON parseado:`, json)

            if (res.status === 409) {
                const msg = json?.error ?? `El nomenclador "${archivo.name}" ya está vigente.`
                setVigenteNombre(archivo.name)
                onExito(`Sin cambios: ${msg}`)
                return
            }

            if (!res.ok) {
                throw new Error(json?.error ?? `Error HTTP ${res.status}`)
            }

            if (!json?.ok || !json?.data) {
                throw new Error(json?.error ?? 'No se pudo actualizar el nomenclador')
            }

            console.log(`[ImportarNomencladorModal] Importación exitosa`)
            onExito(
                `Nomenclador actualizado: ${json.data.nomencladorPrestacionActualizados} prestaciones y ${json.data.nomencladorPracticaActualizados} prácticas (${json.data.totalLeidos} códigos leídos).`
            )
        } catch (err) {
            console.error(`[ImportarNomencladorModal] Error:`, err)
            const esAbort = err instanceof Error && err.name === 'AbortError'
            const esNetworkFetch = err instanceof TypeError && /Failed to fetch/i.test(err.message)
            const msg = esAbort
                ? 'La actualización superó los 14 minutos. El archivo puede ser muy grande o haber un problema de formato.'
                : esNetworkFetch
                    ? 'No se pudo conectar con el servidor. Verificá que haya una sola instancia de npm run dev activa y reintentá.'
                    : (err instanceof Error ? err.message : 'Error desconocido al importar nomenclador')
            setErrorLocal(msg)
            onError(msg)
        } finally {
            if (timeoutId) clearTimeout(timeoutId)
            abortRef.current = null
            setLoading(false)
            console.log(`[ImportarNomencladorModal] Importación finalizada`)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
            <div className="w-full max-w-xl rounded-xl bg-white shadow-xl border border-gray-200">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="text-base font-semibold text-gray-900">Actualizar Nomenclador</h3>
                    <button type="button" onClick={cerrarModal} className="rounded p-1 text-gray-500 hover:bg-gray-100">
                        <XCircle className="h-5 w-5" />
                    </button>
                </div>

                <div className="px-5 py-4 space-y-3">
                    <p className="text-sm text-gray-600">
                        Cargá el archivo oficial de nomenclador del mes para actualizar precios y descripciones de prácticas.
                    </p>

                    <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                        <span className="font-medium">Nomenclador vigente:</span>{' '}
                        {loadingVigente ? 'Cargando...' : (vigenteNombre ?? 'Sin registro de importación previa')}
                    </div>

                    <label className="block space-y-1">
                        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Archivo XLS/XLSX</span>
                        <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-4">
                            <input
                                id="archivo-nomenclador"
                                type="file"
                                accept=".xls,.xlsx"
                                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                                className="hidden"
                            />
                            <label
                                htmlFor="archivo-nomenclador"
                                className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-blue-600 bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                            >
                                <Upload className="h-4 w-4" /> Seleccionar archivo de nomenclador
                            </label>
                            <p className="mt-2 text-xs text-gray-600">
                                {archivo ? `Archivo seleccionado: ${archivo.name}` : 'No hay archivo seleccionado.'}
                            </p>
                        </div>
                    </label>

                    <p className="text-xs text-gray-500">
                        Nota: el sistema usa automáticamente el convenio y la hoja vigentes para evitar errores operativos.
                    </p>

                    {loading && (
                        <p className="text-xs text-amber-700">
                            Importando archivo grande. Este proceso puede tardar varios minutos.
                        </p>
                    )}

                    {errorLocal && (
                        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {errorLocal}
                        </div>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={cerrarModal}
                        className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                    >
                        {loading ? 'Cancelar importación' : 'Cancelar'}
                    </button>
                    <button
                        type="button"
                        onClick={importar}
                        disabled={loading}
                        className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                        {loading ? 'Actualizando...' : 'Actualizar nomenclador'}
                    </button>
                </div>
            </div>
        </div>
    )
}
