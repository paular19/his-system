'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, CheckCircle, FileSpreadsheet, Loader2, Pencil, Plus, Search, Upload, X, XCircle } from 'lucide-react'
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

type DiferencialesCirugiaEditState = {
    esFeriado: boolean
    esNocturna: boolean
    mismaViaPatologia: boolean
    diferentesViasPatologia: boolean
    diferentesViasDiferentesPatologia: boolean
    dobleCirugia: boolean
    practicaBaseId: string
}

type CirugiaPracticaEditable = {
    practicaId: number
    descripcion: string
    importeTotal: number
    importeTotalReferencia: number
    esPracticaBase: boolean
    aplicaDiferencial: boolean
}

type CirugiaEditableGroup = {
    cirugiaId: number
    practicas: CirugiaPracticaEditable[]
    diferenciales: PrestacionFacturableItem['diferenciales']
}

type ClasificacionToken = 'GA' | 'HE' | 'HA' | 'HP' | 'A1' | 'A2' | 'A3'

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

function normalizarTextoBusqueda(value: string | null | undefined): string {
    return (value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
}

function calcularRecargosDiferencial(diferenciales: PrestacionFacturableItem['diferenciales'] | null | undefined): {
    especialista: number
    gastos: number
} {
    if (!diferenciales) return { especialista: 0, gastos: 0 }

    const especialista =
        (diferenciales.diferentesViasPatologia || diferenciales.diferentesViasDiferentesPatologia ? 75 : 0) +
        (diferenciales.esFeriado ? 20 : 0) +
        (diferenciales.esNocturna ? 20 : 0)

    const gastos =
        (diferenciales.mismaViaPatologia ? 30 : 0) +
        (diferenciales.diferentesViasPatologia || diferenciales.diferentesViasDiferentesPatologia ? 50 : 0) +
        (diferenciales.esFeriado ? 20 : 0) +
        (diferenciales.esNocturna ? 20 : 0)

    return { especialista, gastos }
}

function etiquetasCamposDiferencial(
    diferenciales: PrestacionFacturableItem['diferenciales'] | null | undefined
): string[] {
    if (!diferenciales) return []
    if (diferenciales.aplicaDiferencial === false) return ['Base 100%']

    const recargos = calcularRecargosDiferencial(diferenciales)
    const etiquetas: string[] = []
    if (recargos.especialista > 0) etiquetas.push(`Especialista +${recargos.especialista}%`)
    if (recargos.gastos > 0) etiquetas.push(`Gastos +${recargos.gastos}%`)
    return etiquetas
}

function etiquetasCamposDiferencialCirugia(draft: DiferencialesCirugiaEditState): string[] {
    const recargosEspecialista =
        (draft.diferentesViasPatologia || draft.diferentesViasDiferentesPatologia ? 75 : 0) +
        (draft.esFeriado ? 20 : 0) +
        (draft.esNocturna ? 20 : 0)

    const recargosGastos =
        (draft.mismaViaPatologia ? 30 : 0) +
        (draft.diferentesViasPatologia || draft.diferentesViasDiferentesPatologia ? 50 : 0) +
        (draft.esFeriado ? 20 : 0) +
        (draft.esNocturna ? 20 : 0)

    const etiquetas: string[] = []
    if (recargosEspecialista > 0) etiquetas.push(`Especialista +${recargosEspecialista}%`)
    if (recargosGastos > 0) etiquetas.push(`Gastos +${recargosGastos}%`)
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
    return normalizarCodigoPractica(codigoPractica) === '169006'
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
        .filter((part) => /^(GA|HE|HA|A[1-3])$/.test(part))

    if (parts.length === 0) return null

    return {
        especialista: parts.filter((part) => part === 'HE').length,
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
    posicion: number
): ClasificacionToken {
    if (componente === 'ayudante') {
        const idx = Math.min(Math.max(1, posicion + 1), 3)
        return `A${idx}` as ClasificacionToken
    }
    if (componente === 'anestesista') return 'HA'
    if (componente === 'gastos') return 'GA'
    return 'HE'
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

function construirClasificacionesPorComponenteUI(
    seleccion: ComponenteSeleccion,
    estadoActual?: ClasificacionPorComponenteState
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
            const fallback = clasificacionPorDefectoComponente(componente, posicion)
            const value = normalizarClasificacionToken(actuales[posicion], fallback)
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
    if (!seleccion) return 'Completa (todos los componentes)'

    const partes: string[] = []
    if (seleccion.gastos > 0) partes.push(`GA x${seleccion.gastos}`)
    if (seleccion.especialista > 0) partes.push(`HE x${seleccion.especialista}`)
    if (seleccion.anestesista > 0) partes.push(`HA x${seleccion.anestesista}`)
    if (seleccion.ayudante > 0) partes.push(`Ayudante x${seleccion.ayudante}`)

    return partes.length > 0 ? partes.join(' · ') : 'Completa (todos los componentes)'
}

function esImporteParcialPorSubitem(incluyeCodigo: string | null | undefined): boolean {
    return parseIncluyeCodigoSeleccion(incluyeCodigo) !== null
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
    clasificacionesPorComponente?: ClasificacionPorComponenteState
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

    if (esCompleta) {
        const actual = (incluyeCodigoActual ?? '').trim().toUpperCase()
        return actual && actual !== 'COMPLETA' ? actual : null
    }

    const hayClasificacionPersonalizada = ORDEN_COMPONENTES_CLASIFICACION.some((componente) => {
        const valoresComponente = clasificacionesPorComponente?.[componente] ?? []
        return valoresComponente.some((v) => (v ?? '').trim().length > 0)
    })

    if (hayClasificacionPersonalizada) {
        const codigosPersonalizados: string[] = []

        const agregarCodigos = (componente: keyof ComponenteSeleccion, cantidad: number) => {
            const valoresComponente = clasificacionesPorComponente?.[componente] ?? []
            for (let i = 0; i < cantidad; i += 1) {
                const fallback = clasificacionPorDefectoComponente(componente, i)
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

    const codigos: string[] = []
    if (gasDisp) {
        const cantidadGastos = normalizarCantidadSeleccion(seleccion.gastos)
        for (let i = 0; i < cantidadGastos; i += 1) codigos.push('GA')
    }
    if (espDisp) {
        const cantidadEspecialista = normalizarCantidadSeleccion(seleccion.especialista)
        for (let i = 0; i < cantidadEspecialista; i += 1) codigos.push('HE')
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

    if (p.matriculaProfesional && p.matriculaProfesional > 0) {
        return p.matriculaProfesional
    }

    if (p.matriculaAnestesista && p.matriculaAnestesista > 0) {
        return p.matriculaAnestesista
    }

    const aut = autorizacionesVinculadasOrdenadas[0]
    if (!aut) return null
    if (aut.matriculaProfesional && aut.matriculaProfesional > 0) return aut.matriculaProfesional
    if (aut.matriculaEspecialista && aut.matriculaEspecialista > 0) return aut.matriculaEspecialista
    if (aut.matriculaAyudante && aut.matriculaAyudante > 0) return aut.matriculaAyudante
    if (aut.matriculaAnestesista && aut.matriculaAnestesista > 0) return aut.matriculaAnestesista

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

type OrdenRenumerarState = {
    nuevoPuestoNumero: string
    nuevoNumero: string
}

type AutorizacionVinculada = NonNullable<PrestacionFacturableItem['autorizacionesVinculadas']>[number]

function keyAutorizacionVinculada(aut: AutorizacionVinculada): string {
    return `${aut.ordenPuestoNumero}:${aut.ordenNumero}:${aut.ordenItem}`
}

function buildAutorizacionesVinculadasEditState(p: PrestacionFacturableItem): Record<string, string> {
    const state: Record<string, string> = {}
    for (const aut of p.autorizacionesVinculadas ?? []) {
        state[keyAutorizacionVinculada(aut)] = aut.numeroAutorizacion ?? ''
    }
    return state
}

const MATRICULA_AYUDANTE_DEFAULT = 995
const PRESTACIONES_POR_PAGINA_DEFAULT = 12

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
    return {
        fecha: toDateInput(p.fecha),
        codigoPractica: p.codigoPractica ?? '',
        descripcion: p.descripcion,
        cantidad: String(p.cantidad ?? 1),
        numeroAutorizacion: p.numeroAutorizacion ?? '',
        importeTotal: String(p.importeTotal ?? 0),
        matriculaAyudante: tieneAyudante ? String(MATRICULA_AYUDANTE_DEFAULT) : '',
        matriculaEspecialista: (!soloAyudante || tieneEspecialista) && p.matriculaEspecialista ? String(p.matriculaEspecialista) : '',
        matriculaAnestesista: p.matriculaAnestesista ? String(p.matriculaAnestesista) : '',
    }
}

function buildDiferencialesCirugiaState(cirugia: CirugiaEditableGroup): DiferencialesCirugiaEditState {
    const baseIdActual = cirugia.diferenciales?.practicaBaseId ?? null
    const baseIdPorImporte = cirugia.practicas[0]?.practicaId ?? null
    const dobleCirugia = Boolean(cirugia.diferenciales?.dobleCirugia)
    const baseIdFinal = dobleCirugia ? (baseIdActual ?? baseIdPorImporte) : baseIdActual

    return {
        esFeriado: Boolean(cirugia.diferenciales?.esFeriado),
        esNocturna: Boolean(cirugia.diferenciales?.esNocturna),
        mismaViaPatologia: Boolean(cirugia.diferenciales?.mismaViaPatologia),
        diferentesViasPatologia: Boolean(cirugia.diferenciales?.diferentesViasPatologia),
        diferentesViasDiferentesPatologia: Boolean(cirugia.diferenciales?.diferentesViasDiferentesPatologia),
        dobleCirugia,
        practicaBaseId: baseIdFinal ? String(baseIdFinal) : '',
    }
}

export function FacturacionPanel() {
    const [q, setQ] = useState('')
    const [tipoIngresoCodigo, setTipoIngresoCodigo] = useState('')
    const [codigoPractica, setCodigoPractica] = useState('')

    const [buscando, setBuscando] = useState(false)
    const [admisiones, setAdmisiones] = useState<AdmisionFacturacionListItem[]>([])
    const [totalAdmisiones, setTotalAdmisiones] = useState(0)
    const [selectedIngresoId, setSelectedIngresoId] = useState<number | null>(null)

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
    const [rowEditMode, setRowEditMode] = useState<Record<string, boolean>>({})
    const [detallePrestacionesExpand, setDetallePrestacionesExpand] = useState<Record<string, boolean>>({})
    const [guardandoRowUid, setGuardandoRowUid] = useState<string | null>(null)
    const [ordenesExpand, setOrdenesExpand] = useState<Record<string, boolean>>({})
    const [filtroPrestaciones, setFiltroPrestaciones] = useState('')
    const [paginaPrestaciones, setPaginaPrestaciones] = useState(1)
    const [porPaginaPrestaciones, setPorPaginaPrestaciones] = useState(PRESTACIONES_POR_PAGINA_DEFAULT)
    const [anulando, setAnulando] = useState<string | null>(null)
    const [guardandoDiferencialCirugiaId, setGuardandoDiferencialCirugiaId] = useState<number | null>(null)
    const [mostrarImportadorNomenclador, setMostrarImportadorNomenclador] = useState(false)
    const [creandoOrdenPracticaUid, setCreandoOrdenPracticaUid] = useState<string | null>(null)
    const [renumerandoOrdenKey, setRenumerandoOrdenKey] = useState<string | null>(null)
    const [renumerarOrdenDraft, setRenumerarOrdenDraft] = useState<Record<string, OrdenRenumerarState>>({})

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

    const prestacionesSeleccionables = useMemo(() => {
        if (!contexto) return []
        return contexto.prestaciones.filter(
            (p) =>
                p.tipo === 'PRACTICA' &&
                p.codigoPractica &&
                p.convenioId !== null &&
                !p.facturada &&
                practicaTieneOrdenGenerada(p) &&
                practicaTieneAutorizacionConOrden(p)
        )
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

    const totalPaginasPrestaciones = Math.max(1, Math.ceil(prestacionesNoOrdenadasFiltradas.length / porPaginaPrestaciones))
    const paginaPrestacionesActual = Math.min(paginaPrestaciones, totalPaginasPrestaciones)

    const prestacionesNoOrdenadasPaginadas = useMemo(() => {
        const desde = (paginaPrestacionesActual - 1) * porPaginaPrestaciones
        return prestacionesNoOrdenadasFiltradas.slice(desde, desde + porPaginaPrestaciones)
    }, [paginaPrestacionesActual, porPaginaPrestaciones, prestacionesNoOrdenadasFiltradas])

    const cirugiasEditables = useMemo(() => {
        if (!contexto) return []

        const map = new Map<number, CirugiaEditableGroup>()

        for (const p of contexto.prestaciones) {
            if (p.tipo !== 'PRACTICA') continue
            if (!p.esPracticaCirugia) continue
            if (!p.origen.cirugiaProgramadaId) continue
            if (!p.origen.practicaId) continue

            const cirugiaId = p.origen.cirugiaProgramadaId
            const practica: CirugiaPracticaEditable = {
                practicaId: p.origen.practicaId,
                descripcion: p.descripcion,
                importeTotal: Number(p.importeTotal ?? 0),
                importeTotalReferencia: Number(p.importeTotalOriginal ?? p.importeTotal ?? 0),
                esPracticaBase: Boolean(p.diferenciales?.esPracticaBase),
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

            existente.practicas.push(practica)
            if (!existente.diferenciales && p.diferenciales) {
                existente.diferenciales = p.diferenciales
            }
        }

        return Array.from(map.values())
            .map((cirugia) => ({
                ...cirugia,
                practicas: [...cirugia.practicas].sort((a, b) => b.importeTotalReferencia - a.importeTotalReferencia),
            }))
            .sort((a, b) => b.cirugiaId - a.cirugiaId)
    }, [contexto])

    const diferencialesCirugiaCongelados = useMemo(() => {
        if (!contexto) return false
        return contexto.prestaciones.some(
            (p) => (p.tipo === 'PRACTICA' && p.facturada) || p.tipo === 'ORDEN_ITEM'
        )
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
        setFormObservaciones(data.ingreso.observaciones ?? '')
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

    async function buscarAdmisiones() {
        setError(null)
        setMensaje(null)
        setBuscando(true)
        try {
            const params = new URLSearchParams()
            if (q.trim()) params.set('q', q.trim())
            if (tipoIngresoCodigo.trim()) params.set('tipoIngresoCodigo', tipoIngresoCodigo.trim().toUpperCase())
            if (codigoPractica.trim()) params.set('codigoPractica', codigoPractica.trim().toUpperCase())
            params.set('porPagina', '30')

            const res = await fetch(`/api/facturacion/busqueda?${params.toString()}`)
            const json = (await res.json()) as ApiResponse<{ items: AdmisionFacturacionListItem[]; total: number }>
            if (!res.ok || !json.ok || !json.data) throw new Error(json.error ?? 'No se pudo buscar')

            setAdmisiones(json.data.items)
            setTotalAdmisiones(json.data.total)

            const mantenerSeleccion =
                selectedIngresoId !== null &&
                json.data.items.some((item) => item.id === selectedIngresoId)

            if (!mantenerSeleccion) {
                setSelectedIngresoId(null)
                setContexto(null)
                setSeleccion({})
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error de busqueda')
        } finally {
            setBuscando(false)
        }
    }

    async function cargarContexto(ingresoId: number) {
        setError(null)
        setCargandoContexto(true)
        try {
            const res = await fetch(`/api/facturacion/contexto?ingresoId=${ingresoId}`)
            const json = (await res.json()) as ApiResponse<FacturacionContexto>
            if (!res.ok || !json.ok || !json.data) throw new Error(json.error ?? 'No se pudo cargar el contexto')

            setContexto(json.data)
            cargarFormDesdeContexto(json.data)
            initEditRows(json.data)
            setSeleccion({})
            setOrdenesExpand({})
            setRowEditMode({})
            setDetallePrestacionesExpand({})
            setEditandoFicha(false)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al cargar contexto')
            setContexto(null)
        } finally {
            setCargandoContexto(false)
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
        setCargandoOrdenes(true)
        setError(null)
        setMensaje(null)
        try {
            // Si el usuario tildó filas explícitamente, usar solo esas.
            // Si no tildó ninguna, usar todas las seleccionables (facturar todo).
            const source = prestacionesSeleccionadas.length > 0
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
                    const sel = compSeleccion[p.uid]
                    const baseDesc = draft?.descripcion ?? p.descripcion
                    const desgloseSelector = obtenerDesgloseSelector(p)
                    const incluyeCodigo = construirIncluyeCodigoDesdeSeleccion(
                        desgloseSelector,
                        sel,
                        p.incluyeCodigo,
                        clasificacionPorComponenteUid[p.uid]
                    )
                    const usaMatriculaAyudante =
                        incluyeSoloAyudante(incluyeCodigo ?? p.incluyeCodigo) ||
                        (!incluyeCodigo && !p.incluyeCodigo && descripcionEsAyudante(baseDesc))
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
                                : (draft.matriculaEspecialista ? Number(draft.matriculaEspecialista) : null))
                            : (p.matriculaEspecialista ?? null),
                        matriculaAnestesista: draft
                            ? (draft.matriculaAnestesista ? Number(draft.matriculaAnestesista) : null)
                            : (p.matriculaAnestesista ?? null),
                    }
                })

            if (prestaciones.length === 0) throw new Error('No hay prácticas pendientes con orden y autorización para facturar')

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

        setRowEditMode((prev) => ({ ...prev, [p.uid]: false }))
    }

    async function guardarPrestacion(p: PrestacionFacturableItem) {
        const draft = editRows[p.uid]
        if (!draft) return
        if (p.tipo !== 'PRACTICA' && p.tipo !== 'ORDEN_ITEM') return

        if (p.tipo === 'PRACTICA' && p.facturada) {
            const ok = window.confirm(
                `Esta práctica ya fue facturada (Ord. ${p.ordenPuestoNumero}-${p.ordenNumero}).\nAl guardar los cambios se desvinculará de esa orden y quedará como pendiente.\n¿Continuar?`
            )
            if (!ok) return
        }

        setGuardandoRowUid(p.uid)
        setError(null)
        try {
            let numeroAutorizacionPractica = draft.numeroAutorizacion || null

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
                incluyeSoloAyudante(p.incluyeCodigo) ||
                (!p.incluyeCodigo && descripcionEsAyudante(draft.descripcion || p.descripcion))
            const common = {
                fecha: new Date(draft.fecha || p.fecha).toISOString(),
                codigoPractica: (draft.codigoPractica || p.codigoPractica || '').trim(),
                descripcionPractica: draft.descripcion,
                cantidad: Number(draft.cantidad || 1),
                numeroAutorizacion:
                    p.tipo === 'PRACTICA'
                        ? numeroAutorizacionPractica
                        : (draft.numeroAutorizacion || null),
                importeTotal: Number(draft.importeTotal || 0),
                matriculaProfesional: null,
                matriculaEspecialista: usaMatriculaAyudante
                    ? MATRICULA_AYUDANTE_DEFAULT
                    : (draft.matriculaEspecialista ? Number(draft.matriculaEspecialista) : null),
                matriculaAnestesista: draft.matriculaAnestesista ? Number(draft.matriculaAnestesista) : null,
            }

            if (!common.codigoPractica) throw new Error('Código de práctica requerido')

            const payload =
                p.tipo === 'PRACTICA' && p.origen.practicaId
                    ? {
                        tipo: 'PRACTICA' as const,
                        practicaId: p.origen.practicaId,
                        ...common,
                    }
                    : {
                        tipo: 'ORDEN_ITEM' as const,
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
            if (contexto) await cargarContexto(contexto.ingreso.id)
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

    async function renumerarOrden(puestoNumero: number, numero: number) {
        if (!contexto) return
        const key = `${puestoNumero}:${numero}`
        const draft = renumerarOrdenDraft[key] ?? {
            nuevoPuestoNumero: String(puestoNumero),
            nuevoNumero: String(numero),
        }

        const nuevoPuestoNumero = Number.parseInt(draft.nuevoPuestoNumero, 10)
        const nuevoNumero = Number.parseInt(draft.nuevoNumero, 10)

        if (!Number.isFinite(nuevoPuestoNumero) || nuevoPuestoNumero <= 0) {
            setError('Nuevo puesto inválido')
            return
        }
        if (!Number.isFinite(nuevoNumero) || nuevoNumero <= 0) {
            setError('Nuevo número de orden inválido')
            return
        }

        if (nuevoPuestoNumero === puestoNumero && nuevoNumero === numero) {
            setMensaje('No hubo cambios en la numeración de la orden')
            return
        }

        const confirmar = window.confirm(
            `¿Renumerar orden ${formatOrderNumber(puestoNumero, numero)} a ${formatOrderNumber(nuevoPuestoNumero, nuevoNumero)}?`
        )
        if (!confirmar) return

        setRenumerandoOrdenKey(key)
        setError(null)
        try {
            const res = await fetch('/api/facturacion/ordenes/renumerar', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    puestoNumero,
                    numero,
                    nuevoPuestoNumero,
                    nuevoNumero,
                }),
            })

            const json = (await res.json()) as ApiResponse<{ puestoNumero: number; numero: number }>
            if (!res.ok || !json.ok || !json.data) {
                throw new Error(json.error ?? 'No se pudo renumerar la orden')
            }

            setMensaje(`Orden renumerada a ${formatOrderNumber(json.data.puestoNumero, json.data.numero)}`)
            await cargarContexto(contexto.ingreso.id)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al renumerar orden')
        } finally {
            setRenumerandoOrdenKey(null)
        }
    }

    async function guardarDiferencialesCirugia(cirugia: CirugiaEditableGroup) {
        if (!contexto) return
        if (diferencialesCirugiaCongelados) {
            setError('Los diferenciales de cirugía están congelados porque ya se facturó el paciente.')
            return
        }

        const draft = diferencialesCirugiaEdit[cirugia.cirugiaId] ?? buildDiferencialesCirugiaState(cirugia)
        const practicaBaseId = draft.practicaBaseId ? Number.parseInt(draft.practicaBaseId, 10) : null

        if (draft.dobleCirugia && (!practicaBaseId || !cirugia.practicas.some((p) => p.practicaId === practicaBaseId))) {
            setError('Debe seleccionar la cirugía base al 100% para aplicar doble cirugía')
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
                    esFeriado: draft.esFeriado,
                    esNocturna: draft.esNocturna,
                    mismaViaPatologia: draft.mismaViaPatologia,
                    diferentesViasPatologia: draft.diferentesViasPatologia,
                    diferentesViasDiferentesPatologia: draft.diferentesViasDiferentesPatologia,
                    dobleCirugia: draft.dobleCirugia,
                }),
            })

            const json = (await res.json()) as ApiResponse<{ ok: boolean }>
            if (!res.ok || !json.ok) throw new Error(json.error ?? 'No se pudieron guardar los diferenciales de cirugía')

            setMensaje('Diferenciales de cirugía actualizados')
            await cargarContexto(contexto.ingreso.id)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al guardar diferenciales de cirugía')
        } finally {
            setGuardandoDiferencialCirugiaId(null)
        }
    }

    async function anularOrden(puestoNumero: number, numero: number) {
        if (!contexto) return
        const ok = window.confirm(
            `¿Anular la facturación de la Orden ${puestoNumero}-${numero}?\nLas prácticas vinculadas volverán a estado pendiente.`
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
            const json = (await res.json()) as ApiResponse<{ ok: boolean }>
            if (!res.ok || !json.ok) throw new Error(json.error ?? 'No se pudo anular la orden')

            setMensaje(`Orden ${puestoNumero}-${numero} anulada. Las prácticas quedaron como pendientes.`)
            await cargarContexto(contexto.ingreso.id)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al anular orden')
        } finally {
            setAnulando(null)
        }
    }

    useEffect(() => {
        buscarAdmisiones()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (selectedIngresoId) {
            cargarContexto(selectedIngresoId)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedIngresoId])

    useEffect(() => {
        setPaginaPrestaciones(1)
    }, [filtroPrestaciones, porPaginaPrestaciones, selectedIngresoId])

    return (
        <div className="p-6 space-y-4">
            <div className="his-card p-4 md:p-5">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                            <Search className="h-3.5 w-3.5" /> Cargar órdenes
                        </div>
                        <p className="mt-2 text-sm text-gray-600">Buscá admisiones por paciente, documento, tipo de ingreso o código de práctica.</p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <Link
                            href="/facturacion/lotes"
                            className="inline-flex h-10 items-center justify-center rounded-md bg-indigo-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
                        >
                            Generar lote
                        </Link>
                        <Link
                            href="/facturacion/lotes?nuevo=ips"
                            className="inline-flex h-10 items-center justify-center rounded-md border border-green-600 bg-green-50 px-4 text-sm font-medium text-green-700 shadow-sm transition-colors hover:bg-green-100"
                        >
                            📄 Importar Planilla IPS
                        </Link>
                        <button
                            type="button"
                            onClick={() => setMostrarImportadorNomenclador(true)}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-blue-600 bg-blue-50 px-4 text-sm font-medium text-blue-700 shadow-sm transition-colors hover:bg-blue-100"
                        >
                            <Upload className="h-4 w-4" /> Actualizar Nomenclador
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12">
                    <label className="space-y-1 xl:col-span-4">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Búsqueda</span>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Paciente, nro ingreso o documento"
                                className="h-10 w-full rounded-md border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                            />
                        </div>
                    </label>

                    <label className="space-y-1 xl:col-span-3">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Tipo de ingreso</span>
                        <input
                            value={tipoIngresoCodigo}
                            onChange={(e) => setTipoIngresoCodigo(e.target.value)}
                            placeholder="INT / GUA / AMB"
                            className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                    </label>

                    <label className="space-y-1 xl:col-span-3">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Código práctica</span>
                        <input
                            value={codigoPractica}
                            onChange={(e) => setCodigoPractica(e.target.value)}
                            placeholder="Filtrar por práctica"
                            className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                    </label>

                    <div className="flex items-end gap-2 xl:col-span-2">
                        <button
                            onClick={buscarAdmisiones}
                            className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={buscando}
                        >
                            {buscando ? 'Buscando...' : 'Buscar'}
                        </button>
                    </div>

                    <div className="xl:col-span-12">
                        <div className="grid gap-2 md:grid-cols-[auto,1fr] md:items-center">
                            <div className="inline-flex items-center rounded-md bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-600">
                                {totalAdmisiones} admisiones encontradas
                            </div>
                            <label className="space-y-1">
                                <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Admisión seleccionada</span>
                                <select
                                    value={selectedIngresoId ?? ''}
                                    onChange={(e) => {
                                        const next = Number.parseInt(e.target.value, 10)
                                        if (Number.isFinite(next) && next > 0) {
                                            setSelectedIngresoId(next)
                                        } else {
                                            setSelectedIngresoId(null)
                                            setContexto(null)
                                            setSeleccion({})
                                        }
                                    }}
                                    className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-xs text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                >
                                    <option value="">Seleccionar admisión...</option>
                                    {admisiones.map((a) => (
                                        <option key={a.id} value={a.id}>
                                            {`${a.tipoIngresoCodigo}-${a.numeroIngreso} · ${a.paciente?.nombreCompleto ?? 'Sin nombre'} · DNI ${a.paciente?.numeroDocumento ?? '—'}`}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>
                    </div>
                </div>
            </div>

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
                                    <div className="rounded-md border border-gray-200 px-3 py-2 bg-gray-50"><span className="text-gray-500 text-xs">Plan</span><div className="font-medium text-gray-900">{contexto.plan?.descripcion ?? '—'}</div></div>
                                    <div className="rounded-md border border-gray-200 px-3 py-2 bg-gray-50"><span className="text-gray-500 text-xs">N° afiliado</span><div className="font-medium text-gray-900">{formNumeroAfiliado || '—'}</div></div>
                                    <div className="rounded-md border border-gray-200 px-3 py-2 bg-gray-50"><span className="text-gray-500 text-xs">Ficha de ingreso</span><div className="font-medium text-gray-900">{formatearFechaHoraArgentina(contexto.ingreso.fechaIngreso)}</div></div>
                                </div>
                            </div>

                            {cirugiasEditables.length > 0 && (
                                <div className="his-card p-4 space-y-4 border-amber-200">
                                    <div>
                                        <h4 className="text-sm font-semibold text-amber-900">Diferenciales de cirugía</h4>
                                        <p className="text-xs text-amber-700">
                                            Definí la cirugía base al 100% y qué diferenciales se aplican al resto.
                                        </p>
                                        {diferencialesCirugiaCongelados && (
                                            <p className="mt-1 text-xs font-medium text-amber-800">
                                                Diferenciales congelados: el paciente ya tiene facturación registrada.
                                            </p>
                                        )}
                                    </div>

                                    {cirugiasEditables.map((cirugia) => {
                                        const draft = diferencialesCirugiaEdit[cirugia.cirugiaId] ?? buildDiferencialesCirugiaState(cirugia)
                                        const practicaBaseId = draft.practicaBaseId ? Number.parseInt(draft.practicaBaseId, 10) : null
                                        const practicaBase = cirugia.practicas.find((p) => p.practicaId === practicaBaseId) ?? null
                                        const practicasConDiferencial = cirugia.practicas.filter((p) => p.practicaId !== practicaBaseId)
                                        const etiquetasAplicadas = etiquetasCamposDiferencialCirugia(draft)

                                        return (
                                            <div key={cirugia.cirugiaId} className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="text-xs font-semibold text-amber-900">
                                                        Cirugía #{cirugia.cirugiaId} · Prácticas: {cirugia.practicas.length}
                                                    </div>
                                                    <button
                                                        onClick={() => guardarDiferencialesCirugia(cirugia)}
                                                        disabled={diferencialesCirugiaCongelados || guardandoDiferencialCirugiaId === cirugia.cirugiaId}
                                                        className="rounded border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                                                    >
                                                        {guardandoDiferencialCirugiaId === cirugia.cirugiaId ? 'Guardando...' : 'Guardar diferenciales'}
                                                    </button>
                                                </div>

                                                <div className="rounded border border-amber-200 bg-white px-2 py-2 text-xs text-amber-900">
                                                    <span className="font-semibold">Campos con diferencial:</span>{' '}
                                                    {etiquetasAplicadas.length > 0 ? etiquetasAplicadas.join(' · ') : 'Base 100%'}
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 text-xs text-amber-900">
                                                    <label className="inline-flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={draft.esFeriado}
                                                            disabled={diferencialesCirugiaCongelados}
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
                                                            disabled={diferencialesCirugiaCongelados}
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
                                                            disabled={diferencialesCirugiaCongelados}
                                                            onChange={(e) => setDiferencialesCirugiaEdit((prev) => ({
                                                                ...prev,
                                                                [cirugia.cirugiaId]: { ...draft, mismaViaPatologia: e.target.checked },
                                                            }))}
                                                        />
                                                        Misma vía / distinta patología
                                                    </label>
                                                    <label className="inline-flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={draft.diferentesViasPatologia}
                                                            disabled={diferencialesCirugiaCongelados}
                                                            onChange={(e) => setDiferencialesCirugiaEdit((prev) => ({
                                                                ...prev,
                                                                [cirugia.cirugiaId]: { ...draft, diferentesViasPatologia: e.target.checked },
                                                            }))}
                                                        />
                                                        Distintas vías / misma patología
                                                    </label>
                                                    <label className="inline-flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={draft.diferentesViasDiferentesPatologia}
                                                            disabled={diferencialesCirugiaCongelados}
                                                            onChange={(e) => setDiferencialesCirugiaEdit((prev) => ({
                                                                ...prev,
                                                                [cirugia.cirugiaId]: { ...draft, diferentesViasDiferentesPatologia: e.target.checked },
                                                            }))}
                                                        />
                                                        Distintas vías / distinta patología
                                                    </label>
                                                    <label className="inline-flex items-center gap-2 font-semibold">
                                                        <input
                                                            type="checkbox"
                                                            checked={draft.dobleCirugia}
                                                            disabled={diferencialesCirugiaCongelados || cirugia.practicas.length < 2}
                                                            onChange={(e) => {
                                                                if (cirugia.practicas.length < 2) return
                                                                if (diferencialesCirugiaCongelados) return
                                                                const checked = e.target.checked
                                                                setDiferencialesCirugiaEdit((prev) => ({
                                                                    ...prev,
                                                                    [cirugia.cirugiaId]: {
                                                                        ...draft,
                                                                        dobleCirugia: checked,
                                                                        practicaBaseId: checked
                                                                            ? (draft.practicaBaseId || String(cirugia.practicas[0]?.practicaId ?? ''))
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
                                                        Cirugía base al 100%
                                                        <select
                                                            value={draft.practicaBaseId}
                                                            onChange={(e) => setDiferencialesCirugiaEdit((prev) => ({
                                                                ...prev,
                                                                [cirugia.cirugiaId]: { ...draft, practicaBaseId: e.target.value },
                                                            }))}
                                                            disabled={diferencialesCirugiaCongelados || !draft.dobleCirugia}
                                                            className="mt-1 w-full rounded border border-amber-300 bg-white px-2 py-1 text-xs disabled:bg-amber-100"
                                                        >
                                                            <option value="">-- Seleccionar práctica base --</option>
                                                            {cirugia.practicas.map((practica) => (
                                                                <option key={practica.practicaId} value={String(practica.practicaId)}>
                                                                    {practica.descripcion} · {formatCurrency(practica.importeTotalReferencia)}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                    <div className="text-xs text-amber-900 rounded border border-amber-200 bg-white px-2 py-2">
                                                        <div><span className="font-semibold">Base 100%:</span> {practicaBase ? `${practicaBase.descripcion} (${formatCurrency(practicaBase.importeTotalReferencia)})` : 'Sin selección'}</div>
                                                        <div><span className="font-semibold">Con diferenciales:</span> {draft.dobleCirugia ? (practicasConDiferencial.length > 0 ? practicasConDiferencial.map((p) => p.descripcion).join(' · ') : 'Ninguna') : 'Todas las prácticas de la cirugía'}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

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

                            <div className="his-card overflow-hidden">
                                <div className="p-4 border-b bg-gray-50 flex items-center justify-between gap-3">
                                    <div>
                                        <h4 className="text-sm font-semibold text-gray-900">Prestaciones</h4>
                                        <p className="text-xs text-gray-500">Editar y validar antes del armado de lotes.</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={facturarPaciente} disabled={cargandoOrdenes} className="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60">{cargandoOrdenes ? 'Facturando...' : 'Facturar paciente'}</button>
                                    </div>
                                </div>

                                <div className="border-b px-4 py-3 bg-white">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <div className="relative min-w-60 flex-1">
                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                                            <input
                                                type="text"
                                                value={filtroPrestaciones}
                                                onChange={(e) => setFiltroPrestaciones(e.target.value)}
                                                placeholder="Filtrar prestaciones pendientes..."
                                                className="w-full rounded-md border border-gray-300 pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <select
                                            value={porPaginaPrestaciones}
                                            onChange={(e) => setPorPaginaPrestaciones(Number.parseInt(e.target.value, 10) || PRESTACIONES_POR_PAGINA_DEFAULT)}
                                            className="rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-700"
                                        >
                                            <option value={8}>8 por página</option>
                                            <option value={12}>12 por página</option>
                                            <option value={20}>20 por página</option>
                                        </select>
                                        <p className="text-xs text-gray-500 whitespace-nowrap">
                                            {prestacionesNoOrdenadasFiltradas.length} de {prestacionesNoOrdenadas.length} pendientes
                                        </p>
                                    </div>
                                </div>

                                <div className="overflow-hidden">
                                    <table className="w-full table-fixed text-sm">
                                        <thead>
                                            <tr className="border-b bg-white text-left">
                                                <th className="w-24 px-3 py-2 text-xs font-medium text-gray-500">Sel</th>
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
                                            {prestacionesNoOrdenadasPaginadas.map((p) => {
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
                                                const seleccionable =
                                                    p.tipo === 'PRACTICA' &&
                                                    !p.facturada &&
                                                    Boolean(p.codigoPractica && p.convenioId !== null) &&
                                                    tieneOrdenGenerada &&
                                                    tieneAutorizacionConOrden
                                                const yaFacturada = p.tipo === 'PRACTICA' && p.facturada
                                                const tieneComponentes = p.tipo === 'PRACTICA' && !p.facturada && desgloseSelector != null && tieneDesglose(desgloseSelector)
                                                const mostrarSelectorComponentes = p.tipo === 'PRACTICA' && !p.facturada
                                                const selComp = tieneComponentes
                                                    ? (compSeleccion[p.uid] ?? seleccionPorDefecto(desgloseSelector!))
                                                    : (mostrarSelectorComponentes ? (compSeleccion[p.uid] ?? { especialista: 0, ayudante: 0, anestesista: 0, gastos: 0 }) : null)
                                                const permiteEditarClasificacion = false
                                                const clasificacionesEditor =
                                                    p.tipo === 'PRACTICA' &&
                                                    permiteEditarClasificacion &&
                                                    selComp
                                                        ? construirClasificacionesPorComponenteUI(
                                                            selComp,
                                                            clasificacionPorComponenteUid[p.uid]
                                                        )
                                                        : null
                                                const resumenIncluye = resumenSubitemsIncluidos(p.incluyeCodigo)
                                                const importeParcialPorSubitem = p.tipo === 'PRACTICA' && esImporteParcialPorSubitem(p.incluyeCodigo)
                                                const diferencialesActivos = resumenDiferenciales(p.diferenciales)
                                                if (p.diferenciales?.dobleCirugia && p.diferenciales?.esPracticaBase) {
                                                    diferencialesActivos.push('Base 100% (doble cirugía)')
                                                }
                                                if (p.diferenciales?.dobleCirugia && p.diferenciales?.aplicaDiferencial) {
                                                    diferencialesActivos.push('Secundaria con diferencial')
                                                }
                                                const etiquetasDiferencial = etiquetasCamposDiferencial(p.diferenciales)
                                                const fechaDraft = draft.fecha ? new Date(draft.fecha) : null
                                                const fechaResumen = fechaDraft && !Number.isNaN(fechaDraft.getTime())
                                                    ? fechaDraft.toLocaleString('es-AR')
                                                    : '—'
                                                const importeResumen = Number.parseFloat(draft.importeTotal)
                                                const numeroOrdenLinea = obtenerNumeroOrdenPrestacion(p, autorizacionesVinculadasOrdenadas)
                                                const destinoOrdenLinea = obtenerDestinoOrdenPrestacion(p, autorizacionesVinculadasOrdenadas)
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
                                                return (
                                                    <Fragment key={p.uid}>
                                                        <tr className={yaFacturada ? 'bg-green-50' : p.esPracticaCirugia ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-gray-50'}>
                                                            <td className="px-3 py-2 align-top">
                                                                {yaFacturada ? (
                                                                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">✓ Facturada</span>
                                                                ) : seleccionable ? (
                                                                    <div className="flex items-center gap-2">
                                                                        {p.esPracticaCirugia && (
                                                                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800" title={diferencialesActivos.join(' · ') || 'Práctica vinculada a cirugía'}>
                                                                                Cirugía
                                                                            </span>
                                                                        )}
                                                                        <input type="checkbox" checked={Boolean(seleccion[p.uid])} onChange={(e) => setSeleccion((prev) => ({ ...prev, [p.uid]: e.target.checked }))} />
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
                                                                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                                                                            Incluye: {resumenIncluye}
                                                                        </span>
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
                                                                    </div>
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
                                                                        onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, cantidad: e.target.value } }))}
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
                                                                    <span className="text-xs font-semibold text-gray-800">{Number.isFinite(importeResumen) ? formatCurrency(importeResumen) : '—'}</span>
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
                                                                                            onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, cantidad: e.target.value } }))}
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
                                                                        <span className="rounded-full bg-slate-100 px-2 py-0.5">Incluye: {resumenIncluye}</span>
                                                                        {etiquetasDiferencial.length > 0 && etiquetasDiferencial.map((etq) => (
                                                                            <span key={etq} className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800">{etq}</span>
                                                                        ))}
                                                                        {diferencialesActivos.length > 0 && diferencialesActivos.map((texto) => (
                                                                            <span key={texto} className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">{texto}</span>
                                                                        ))}
                                                                    </div>
                                                                    {importeParcialPorSubitem && (
                                                                        <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                                                                            Este importe corresponde solo al subitem incluido; no representa el gasto total del código.
                                                                        </div>
                                                                    )}

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
                                                                                                    const fallback = clasificacionPorDefectoComponente(target.componente, actuales.length)
                                                                                                    actuales.push(fallback)
                                                                                                }
                                                                                                actuales[target.posicion] = normalizarClasificacionToken(value, target.fallback)

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

                                            {prestacionesNoOrdenadasFiltradas.length === 0 && prestacionesNoOrdenadas.length > 0 && (
                                                <tr>
                                                    <td colSpan={10} className="px-3 py-4 text-center text-xs text-gray-500">
                                                        No hay prestaciones pendientes para el filtro aplicado.
                                                    </td>
                                                </tr>
                                            )}

                                            {ordenesConItems.map((orden) => {
                                                const expand = ordenesExpand[orden.key] ?? true
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
                                                                        Nuevo puesto
                                                                        <input
                                                                            type="number"
                                                                            min={1}
                                                                            value={renumerarOrdenDraft[orden.key]?.nuevoPuestoNumero ?? String(orden.puesto)}
                                                                            onChange={(e) =>
                                                                                setRenumerarOrdenDraft((prev) => ({
                                                                                    ...prev,
                                                                                    [orden.key]: {
                                                                                        nuevoPuestoNumero: e.target.value,
                                                                                        nuevoNumero: prev[orden.key]?.nuevoNumero ?? String(orden.numero),
                                                                                    },
                                                                                }))
                                                                            }
                                                                            className="mt-1 w-24 rounded border border-gray-300 px-2 py-1 text-xs"
                                                                        />
                                                                    </label>
                                                                    <label className="text-[11px] text-gray-600">
                                                                        Nuevo número
                                                                        <input
                                                                            type="number"
                                                                            min={1}
                                                                            value={renumerarOrdenDraft[orden.key]?.nuevoNumero ?? String(orden.numero)}
                                                                            onChange={(e) =>
                                                                                setRenumerarOrdenDraft((prev) => ({
                                                                                    ...prev,
                                                                                    [orden.key]: {
                                                                                        nuevoPuestoNumero: prev[orden.key]?.nuevoPuestoNumero ?? String(orden.puesto),
                                                                                        nuevoNumero: e.target.value,
                                                                                    },
                                                                                }))
                                                                            }
                                                                            className="mt-1 w-28 rounded border border-gray-300 px-2 py-1 text-xs"
                                                                        />
                                                                    </label>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => renumerarOrden(orden.puesto, orden.numero)}
                                                                        disabled={renumerandoOrdenKey === orden.key}
                                                                        className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                                                                    >
                                                                        {renumerandoOrdenKey === orden.key ? 'Renumerando...' : 'Renumerar'}
                                                                    </button>
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-2 text-xs text-gray-700">{orden.items.length} ítems</td>
                                                            <td className="px-3 py-2 text-xs font-semibold text-gray-800">{formatCurrency(orden.total)}</td>
                                                            <td className="px-3 py-2"><button onClick={() => anularOrden(orden.puesto, orden.numero)} disabled={anulando === orden.key} className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"><XCircle className="h-3.5 w-3.5" />{anulando === orden.key ? 'Anulando...' : 'Anular'}</button></td>
                                                            <td className="px-3 py-2 text-xs text-gray-500">Facturada</td>
                                                        </tr>

                                                        {expand && orden.items.map((p) => {
                                                            const draft = editRows[p.uid] ?? buildEditState(p)
                                                            const filaEnEdicion = Boolean(rowEditMode[p.uid])
                                                            const detalleAbierto = Boolean(detallePrestacionesExpand[p.uid])
                                                            const desgloseSelector = obtenerDesgloseSelector(p)
                                                            const resumenIncluye = resumenSubitemsIncluidos(p.incluyeCodigo)
                                                            const importeParcialPorSubitem = esImporteParcialPorSubitem(p.incluyeCodigo)
                                                            const etiquetasDiferencial = etiquetasCamposDiferencial(p.diferenciales)
                                                            const fechaDraft = draft.fecha ? new Date(draft.fecha) : null
                                                            const fechaResumen = fechaDraft && !Number.isNaN(fechaDraft.getTime())
                                                                ? fechaDraft.toLocaleString('es-AR')
                                                                : '—'
                                                            const importeResumen = Number.parseFloat(draft.importeTotal)
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
                                                                                    onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, cantidad: e.target.value } }))}
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
                                                                                <span className="text-xs font-semibold text-gray-800">{Number.isFinite(importeResumen) ? formatCurrency(importeResumen) : '—'}</span>
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
                                                                                                    <input value={draft.cantidad} onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, cantidad: e.target.value } }))} disabled={!filaEnEdicion} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-100 disabled:text-gray-500" />
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
                                                                                    <span className="rounded-full bg-slate-100 px-2 py-0.5">Incluye: {resumenIncluye}</span>
                                                                                    {etiquetasDiferencial.length > 0 && etiquetasDiferencial.map((etq) => (
                                                                                        <span key={etq} className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800">{etq}</span>
                                                                                    ))}
                                                                                </div>
                                                                                {importeParcialPorSubitem && (
                                                                                    <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                                                                                        Este importe corresponde solo al subitem incluido; no representa el gasto total del código.
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

                                            {contexto.prestaciones.length === 0 && <tr><td colSpan={10} className="px-3 py-6 text-center text-sm text-gray-500">Sin prestaciones registradas</td></tr>}
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
                                    <span>Seleccionables para facturar: {prestacionesSeleccionables.length} · Seleccionadas: {prestacionesSeleccionadas.length}</span>
                                    {prestacionesNoOrdenadasFiltradas.length > porPaginaPrestaciones && (
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
