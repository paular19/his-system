'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import type { LoteFacturacionDetalle, LoteFacturacionItemDetalle, LoteIPSTxtItemDetalle, OrdenAutorizadaLote } from '@/modules/facturacion/types'
import { puedeEditarPrestacionEnLote } from '@/modules/facturacion/editability'
import { LoteResumenPrint } from './lote-resumen-print'
import { descargarResumenPdf } from './lote-resumen-pdf'
import { fechaHoraAInputLocal } from '@/lib/utils/argentina-date'
import { recalcularImportePorCambioCantidad } from '@/lib/facturacion/importes'
import {
    aplicaPromediIPS,
    aplicaPromediPorObraYSubitem,
    calcularImportePromediPorCodigo,
    resolverSubitemPromedi,
    type LineaSubitemPromedi,
    type SubitemPromedi,
} from '@/modules/facturacion/promedi-rules'
import {
    CATEGORIAS_PRACTICA,
    CATEGORIA_PRACTICA_LABEL,
    categoriaPractica,
    type CategoriaPractica,
} from '@/modules/facturacion/categorias-practica'

const ESTADO_LABEL: Record<string, { label: string; cls: string }> = {
    PEN: { label: 'Pendiente', cls: 'bg-yellow-100 text-yellow-800' },
    CON: { label: 'Confirmado', cls: 'bg-green-100 text-green-800' },
    ANU: { label: 'Anulado', cls: 'bg-red-100 text-red-800' },
}

const TIPO_LABEL: Record<string, string> = {
    PRACTICAS: 'Prácticas',
    MEDICAMENTOS: 'Medicamentos',
}

function formatMonto(n: number) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)
}

function formatPeriodo(periodo: string) {
    const [anio, mes] = periodo.split('-')
    if (!anio || !mes) return periodo
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
    return `${meses[parseInt(mes, 10) - 1]} ${anio}`
}

function desglosarImportesPorCodigo(
    codigoRaw: string,
    moduloRaw: string | null | undefined,
    profesionalRaw: string | null | undefined,
    importeTotal: number
) {
    const codigo = normalizarTexto(codigoRaw)
    const modulo = normalizarTexto(moduloRaw)
    const profesional = normalizarTexto(profesionalRaw)

    if (modulo.includes('A1') || modulo.includes('A2') || modulo.includes('A3')) {
        return {
            importeEspecialista: null,
            importeAyudante: importeTotal,
            importeAnestesista: null,
            importeGastos: null,
        }
    }
    if (modulo.includes('HE')) {
        return {
            importeEspecialista: importeTotal,
            importeAyudante: null,
            importeAnestesista: null,
            importeGastos: null,
        }
    }
    if (modulo.includes('HA') || profesional.includes('ANEST')) {
        return {
            importeEspecialista: null,
            importeAyudante: null,
            importeAnestesista: importeTotal,
            importeGastos: null,
        }
    }
    if (modulo.includes('GA') || profesional.includes('CLINICA SAN RAFAEL')) {
        return {
            importeEspecialista: null,
            importeAyudante: null,
            importeAnestesista: null,
            importeGastos: importeTotal,
        }
    }

    if (codigo.includes('A1') || codigo.includes('A2') || codigo.includes('A3')) {
        return {
            importeEspecialista: null,
            importeAyudante: importeTotal,
            importeAnestesista: null,
            importeGastos: null,
        }
    }
    if (codigo.includes('HA')) {
        return {
            importeEspecialista: null,
            importeAyudante: null,
            importeAnestesista: importeTotal,
            importeGastos: null,
        }
    }
    if (codigo.includes('GA')) {
        return {
            importeEspecialista: null,
            importeAyudante: null,
            importeAnestesista: null,
            importeGastos: importeTotal,
        }
    }

    return {
        importeEspecialista: importeTotal,
        importeAyudante: 0,
        importeAnestesista: 0,
        importeGastos: 0,
    }
}

function sumarImporteNullable(actual: number | null, siguiente: number | null): number | null {
    if (siguiente === null) return actual
    if (actual === null) return siguiente
    return actual + siguiente
}

function fechaToGroupingKey(value: Date | string): string {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    return date.toISOString()
}

function normalizarTexto(value: string | null | undefined): string {
    return (value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
}

function normalizarTextoSoloAlfanumerico(value: string | null | undefined): string {
    return normalizarTexto(value).replace(/[^A-Z0-9]/g, '')
}

function esObraSocialOsecac(nombre: string | null | undefined): boolean {
    const limpio = normalizarTextoSoloAlfanumerico(nombre)
    return limpio.includes('OSECAC') || limpio.includes('OBRASOCIALEMPLEADOSDECOMERCIO')
}

function esObraSocialIps(nombre: string | null | undefined): boolean {
    const limpio = normalizarTextoSoloAlfanumerico(nombre)
    return limpio.includes('IPS') || limpio.includes('IPSS')
}

function importePromediAplicado(
    codigoRaw: string,
    importe: number,
    porcentaje: number,
    esOsecac: boolean,
    subitem: SubitemPromedi
): number {
    // El PROMEDI debe evaluarse por práctica/item y no por paciente o ingreso.
    return calcularImportePromediPorCodigo(codigoRaw, importe, porcentaje, esOsecac ? 'OSECAC' : 'IPS', subitem)
}

function etiquetaSubitemComputado(linea: LineaSubitemPromedi): string {
    const subitem = resolverSubitemPromedi(linea)
    if (subitem === 'A1' || subitem === 'A2' || subitem === 'A3') {
        return `Ayudante (${subitem})`
    }
    if (subitem === 'HE') return 'Honorario Especialista (HE)'
    if (subitem === 'HA') return 'Honorario Anestesista (HA)'
    return 'Derechos/Gastos (GA)'
}

function FiltroCategoriasPractica({
    valor,
    onChange,
    conteos,
    totalSinFiltro,
    etiquetaTodos = 'Todas',
}: {
    valor: CategoriaPractica | ''
    onChange: (valor: CategoriaPractica | '') => void
    conteos: Partial<Record<CategoriaPractica, number>>
    totalSinFiltro: number
    etiquetaTodos?: string
}) {
    return (
        <div className="flex flex-wrap items-center gap-1.5 print:hidden">
            <span className="text-[11px] text-gray-500 mr-1">Filtrar por:</span>
            <button
                type="button"
                onClick={() => onChange('')}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] ${!valor
                    ? 'border-blue-500 bg-blue-600 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
            >
                {etiquetaTodos} ({totalSinFiltro})
            </button>
            {CATEGORIAS_PRACTICA.map((cat) => {
                const n = conteos[cat.id] ?? 0
                const activo = valor === cat.id
                return (
                    <button
                        key={cat.id}
                        type="button"
                        disabled={n === 0}
                        onClick={() => onChange(activo ? '' : cat.id)}
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] disabled:opacity-40 disabled:cursor-not-allowed ${activo
                            ? 'border-blue-500 bg-blue-600 text-white'
                            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                            }`}
                    >
                        {CATEGORIA_PRACTICA_LABEL[cat.id]} ({n})
                    </button>
                )
            })}
        </div>
    )
}

interface Props { loteId: number }

type OrdenItemEditState = {
    fecha: string
    codigoPractica: string
    descripcion: string
    cantidad: string
    numeroAutorizacion: string
    importeTotal: string
    modulo: string
    matriculaEjecutante: string
}

type OrdenEditState = {
    fechaEmision: string
    descripcion: string
    numeroAutorizacion: string
    matriculaEjecutante: string
}

function toDateTimeInput(value: Date | string | null | undefined): string {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return fechaHoraAInputLocal(date)
}

function keyOrdenItem(puestoNumero: number, ordenNumero: number, item: number): string {
    return `${puestoNumero}:${ordenNumero}:${item}`
}

function buildOrdenItemEditState(item: OrdenAutorizadaLote['items'][number]): OrdenItemEditState {
    return {
        fecha: toDateTimeInput(item.fecha),
        codigoPractica: (item.codigoPractica ?? '').trim(),
        descripcion: item.descripcion ?? '',
        cantidad: String(item.cantidad ?? 1),
        numeroAutorizacion: item.numeroAutorizacion ?? '',
        importeTotal: String(item.importeTotal ?? 0),
        modulo: item.modulo ?? '',
        matriculaEjecutante: item.efectorMatricula ? String(item.efectorMatricula) : '',
    }
}

function actualizarCantidadOrdenItem(
    draft: OrdenItemEditState,
    cantidadNuevaRaw: string
): OrdenItemEditState {
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

function buildOrdenEditState(orden: OrdenAutorizadaLote): OrdenEditState {
    return {
        fechaEmision: toDateTimeInput(orden.fechaEmision),
        descripcion: orden.descripcion ?? '',
        numeroAutorizacion: orden.numeroAutorizacion ?? '',
        matriculaEjecutante: orden.profesional?.matricula ? String(orden.profesional.matricula) : '',
    }
}

type OrdenItemAgrupadoTabla = {
    key: string
    fecha: Date
    codigoPractica: string
    descripcion: string | null
    subitemComputado: string
    cantidad: number
    numeroAutorizacion: string | null
    importeTotal: number
    importePromedi: number
}

function agruparItemsOrdenParaTabla(
    items: OrdenAutorizadaLote['items'],
    porcentajePromedi: number,
    esOsecac: boolean,
    profesionalNombre: string | null | undefined
): OrdenItemAgrupadoTabla[] {
    return items.map((item) => {
        const linea = {
            codigoPractica: item.codigoPractica,
            modulo: item.modulo,
            efectorMatricula: item.efectorMatricula,
            profesional: profesionalNombre,
        }
        return {
            key: [
                item.item,
                fechaToGroupingKey(item.fecha),
                (item.codigoPractica ?? '').trim(),
                item.numeroAutorizacion ?? '',
                item.descripcion ?? '',
            ].join('|'),
            fecha: item.fecha,
            codigoPractica: item.codigoPractica,
            descripcion: item.descripcion,
            subitemComputado: etiquetaSubitemComputado(linea),
            cantidad: item.cantidad,
            numeroAutorizacion: item.numeroAutorizacion,
            importeTotal: item.importeTotal,
            importePromedi: importePromediAplicado(
                item.codigoPractica,
                item.importeTotal,
                porcentajePromedi,
                esOsecac,
                resolverSubitemPromedi(linea)
            ),
        }
    })
}

export function LoteDetallePage({ loteId }: Props) {
    const router = useRouter()
    const [lote, setLote] = useState<LoteFacturacionDetalle | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [selectedIngresoId, setSelectedIngresoId] = useState<number | null>(null)
    const [ordenes, setOrdenes] = useState<OrdenAutorizadaLote[]>([])
    const [loadingOrdenes, setLoadingOrdenes] = useState(false)
    const [procesando, setProcesando] = useState(false)
    const [ordenesEnEdicion, setOrdenesEnEdicion] = useState<Record<string, boolean>>({})
    const [editItems, setEditItems] = useState<Record<string, OrdenItemEditState>>({})
    const [editOrdenes, setEditOrdenes] = useState<Record<string, OrdenEditState>>({})
    const [guardandoItemKey, setGuardandoItemKey] = useState<string | null>(null)
    const [guardandoOrdenKey, setGuardandoOrdenKey] = useState<string | null>(null)
    const [actualizandoOrdenKey, setActualizandoOrdenKey] = useState<string | null>(null)
    const [ordenesAbiertas, setOrdenesAbiertas] = useState<Record<string, boolean>>({})
    const [ordenesExpandidas, setOrdenesExpandidas] = useState<Record<string, boolean>>({})
    const [mostrarConfirmPromedi, setMostrarConfirmPromedi] = useState(false)
    const [errorPromedi, setErrorPromedi] = useState('')
    const [filtroMedico, setFiltroMedico] = useState('')
    const [filtroMatricula, setFiltroMatricula] = useState('')
    const [filtroPaciente, setFiltroPaciente] = useState('')
    const [filtroCategoria, setFiltroCategoria] = useState<CategoriaPractica | ''>('')
    const [filtroCategoriaIPS, setFiltroCategoriaIPS] = useState<CategoriaPractica | ''>('')
    const [printIngresoId, setPrintIngresoId] = useState<number | null>(null)
    const [generandoPdf, setGenerandoPdf] = useState(false)
    const [errorPdf, setErrorPdf] = useState('')
    const [vistaPromedi, setVistaPromedi] = useState(false)
    const printRef = useRef<HTMLDivElement>(null)
    const [ordenesPorIngreso, setOrdenesPorIngreso] = useState<Record<number, OrdenAutorizadaLote[]>>({})

    const cargar = useCallback(async () => {
        setLoading(true)
        try {
            const sp = new URLSearchParams()
            if (filtroMedico.trim()) sp.set('medico', filtroMedico.trim())
            if (filtroMatricula.trim()) sp.set('matricula', filtroMatricula.trim())
            const res = await fetch(`/api/facturacion/lotes/${loteId}${sp.toString() ? `?${sp}` : ''}`)
            const json = await res.json()
            if (!res.ok || !json.ok) { setError(json.error ?? 'Error'); return }
            setLote(json.data)
        } catch {
            setError('Error de conexión')
        } finally {
            setLoading(false)
        }
    }, [loteId, filtroMedico, filtroMatricula])

    useEffect(() => { cargar() }, [cargar])

    async function cargarOrdenes(ingresoId: number) {
        setSelectedIngresoId(ingresoId)
        setLoadingOrdenes(true)
        setOrdenesAbiertas({})
        setOrdenesExpandidas({})
        setOrdenesEnEdicion({})
        try {
            const sp = new URLSearchParams()
            if (filtroMedico.trim()) sp.set('medico', filtroMedico.trim())
            if (filtroMatricula.trim()) sp.set('matricula', filtroMatricula.trim())
            if (lote?.periodo) sp.set('periodo', lote.periodo)
            sp.set('loteId', String(loteId))
            const res = await fetch(`/api/facturacion/lotes/ingreso/${ingresoId}/ordenes?${sp.toString()}`)
            const json = await res.json()
            const ordenesData: OrdenAutorizadaLote[] = json.data ?? []
            setOrdenes(ordenesData)

            const nextEditItems: Record<string, OrdenItemEditState> = {}
            const nextEditOrdenes: Record<string, OrdenEditState> = {}
            for (const orden of ordenesData) {
                nextEditOrdenes[`${orden.puestoNumero}:${orden.numero}`] = buildOrdenEditState(orden)
                for (const item of orden.items) {
                    nextEditItems[keyOrdenItem(orden.puestoNumero, orden.numero, item.item)] = buildOrdenItemEditState(item)
                }
            }
            setEditItems(nextEditItems)
            setEditOrdenes(nextEditOrdenes)
        } catch {
            setOrdenes([])
            setEditItems({})
            setEditOrdenes({})
        } finally {
            setLoadingOrdenes(false)
        }
    }

    useEffect(() => {
        if (selectedIngresoId !== null) {
            cargarOrdenes(selectedIngresoId)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filtroMedico, filtroMatricula, lote?.periodo])

    useEffect(() => {
        if (!lote || lote.origen === 'IPS_TXT') {
            setOrdenesPorIngreso({})
            return
        }

        const loteActual = lote

        let cancelado = false

        async function cargarDetalleImpresion() {
            const spBase = new URLSearchParams()
            if (filtroMedico.trim()) spBase.set('medico', filtroMedico.trim())
            if (filtroMatricula.trim()) spBase.set('matricula', filtroMatricula.trim())
            if (loteActual.periodo) spBase.set('periodo', loteActual.periodo)
            spBase.set('loteId', String(loteId))

            const resultados = await Promise.all(
                loteActual.items.map(async (item) => {
                    const sp = new URLSearchParams(spBase.toString())
                    const res = await fetch(`/api/facturacion/lotes/ingreso/${item.ingresoId}/ordenes?${sp.toString()}`)
                    const json = await res.json()
                    return {
                        ingresoId: item.ingresoId,
                        ordenes: (res.ok && json.ok ? (json.data ?? []) : []) as OrdenAutorizadaLote[],
                    }
                })
            )

            if (cancelado) return

            const next: Record<number, OrdenAutorizadaLote[]> = {}
            for (const resultado of resultados) {
                next[resultado.ingresoId] = resultado.ordenes
            }
            setOrdenesPorIngreso(next)
        }

        cargarDetalleImpresion().catch(() => {
            if (!cancelado) setOrdenesPorIngreso({})
        })

        return () => {
            cancelado = true
        }
    }, [lote, filtroMedico, filtroMatricula, loteId])

    async function toggleItem(item: LoteFacturacionItemDetalle) {
        const nuevoIncluido = !item.incluido
        setLote((prev) => {
            if (!prev) return prev
            return {
                ...prev,
                items: prev.items.map((it) => it.id === item.id ? { ...it, incluido: nuevoIncluido } : it),
            }
        })

        try {
            const res = await fetch(`/api/facturacion/lotes/${loteId}/items/${item.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ incluido: nuevoIncluido }),
            })

            if (!res.ok) {
                setLote((prev) => {
                    if (!prev) return prev
                    return {
                        ...prev,
                        items: prev.items.map((it) => it.id === item.id ? { ...it, incluido: item.incluido } : it),
                    }
                })
            }
        } catch {
            setLote((prev) => {
                if (!prev) return prev
                return {
                    ...prev,
                    items: prev.items.map((it) => it.id === item.id ? { ...it, incluido: item.incluido } : it),
                }
            })
        }
    }

    async function cambiarEstado(estado: 'CON' | 'ANU') {
        if (!confirm(`¿Confirmar ${estado === 'CON' ? 'la confirmación' : 'la anulación'} del lote?`)) return
        setProcesando(true)
        try {
            const res = await fetch(`/api/facturacion/lotes/${loteId}/estado`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado }),
            })
            if (res.ok) cargar()
        } finally {
            setProcesando(false)
        }
    }

    async function guardarOrdenItem(orden: OrdenAutorizadaLote, item: OrdenAutorizadaLote['items'][number]) {
        const key = keyOrdenItem(orden.puestoNumero, orden.numero, item.item)
        const draft = editItems[key]
        if (!draft) return

        setGuardandoItemKey(key)
        setError('')
        try {
            const payload = {
                tipo: 'ORDEN_ITEM' as const,
                loteId,
                puestoNumero: orden.puestoNumero,
                ordenNumero: orden.numero,
                item: item.item,
                fecha: new Date(draft.fecha || item.fecha).toISOString(),
                codigoPractica: (draft.codigoPractica || item.codigoPractica || '').trim(),
                descripcionPractica: draft.descripcion || null,
                cantidad: Number(draft.cantidad || item.cantidad || 1),
                numeroAutorizacion: draft.numeroAutorizacion.trim() || null,
                importeTotal: Number(draft.importeTotal || item.importeTotal || 0),
                modulo: draft.modulo.trim() || null,
                matriculaEjecutante: draft.matriculaEjecutante ? Number(draft.matriculaEjecutante) : null,
                matriculaProfesional: null,
                matriculaEspecialista: null,
                matriculaAnestesista: null,
            }

            const res = await fetch('/api/facturacion/prestaciones/editar', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })

            const json = await res.json()
            if (!res.ok || !json.ok) {
                setError(json.error ?? 'No se pudo guardar la práctica de la orden')
                return
            }

            await cargar()
            if (selectedIngresoId !== null) {
                await cargarOrdenes(selectedIngresoId)
            }
        } catch {
            setError('Error al guardar la práctica de la orden')
        } finally {
            setGuardandoItemKey(null)
        }
    }

    function cancelarEdicionItem(orden: OrdenAutorizadaLote, item: OrdenAutorizadaLote['items'][number]) {
        const key = keyOrdenItem(orden.puestoNumero, orden.numero, item.item)
        setEditItems((prev) => ({
            ...prev,
            [key]: buildOrdenItemEditState(item),
        }))
    }

    async function guardarOrden(orden: OrdenAutorizadaLote) {
        const key = `${orden.puestoNumero}:${orden.numero}`
        const draft = editOrdenes[key]
        if (!draft) return

        setGuardandoOrdenKey(key)
        setError('')
        try {
            const res = await fetch('/api/facturacion/prestaciones/editar', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tipo: 'ORDEN',
                    loteId,
                    puestoNumero: orden.puestoNumero,
                    ordenNumero: orden.numero,
                    fechaEmision: new Date(draft.fechaEmision || orden.fechaEmision).toISOString(),
                    descripcion: draft.descripcion.trim() || null,
                    numeroAutorizacion: draft.numeroAutorizacion.trim() || null,
                    matriculaEjecutante: draft.matriculaEjecutante ? Number(draft.matriculaEjecutante) : null,
                }),
            })
            const json = await res.json()
            if (!res.ok || !json.ok) {
                setError(json.error ?? 'No se pudo guardar la orden')
                return
            }
            await cargar()
            if (selectedIngresoId !== null) await cargarOrdenes(selectedIngresoId)
        } catch {
            setError('Error al guardar la orden')
        } finally {
            setGuardandoOrdenKey(null)
        }
    }

    async function toggleOrdenEnLote(orden: OrdenAutorizadaLote) {
        const key = `${orden.puestoNumero}-${orden.numero}`
        setActualizandoOrdenKey(key)
        setError('')
        try {
            const res = await fetch(
                `/api/facturacion/lotes/${loteId}/ordenes/${orden.puestoNumero}/${orden.numero}`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ incluida: !orden.incluidaEnLote }),
                }
            )
            const json = await res.json()
            if (!res.ok || !json.ok) {
                setError(json.error ?? 'No se pudo actualizar la orden en el lote')
                return
            }
            setOrdenesEnEdicion((prev) => ({ ...prev, [key]: false }))
            await cargar()
            if (selectedIngresoId !== null) await cargarOrdenes(selectedIngresoId)
        } catch {
            setError('Error al actualizar la orden en el lote')
        } finally {
            setActualizandoOrdenKey(null)
        }
    }

    async function aplicarPromedi() {
        setErrorPromedi('')
        setProcesando(true)
        try {
            const res = await fetch(`/api/facturacion/lotes/${loteId}/promedi`, { method: 'POST' })
            const json = await res.json()
            if (!res.ok || !json.ok) {
                setErrorPromedi(json.error ?? 'Error al aplicar PROMEDI')
                return
            }
            setMostrarConfirmPromedi(false)
            cargar()
        } finally {
            setProcesando(false)
        }
    }

    function imprimir(ingresoId: number | null = null) {
        setPrintIngresoId(ingresoId)
        requestAnimationFrame(() => requestAnimationFrame(() => window.print()))
    }

    if (loading) {
        return <div className="p-8 text-center text-gray-400">Cargando lote...</div>
    }

    if (error || !lote) {
        return (
            <div className="p-8 text-center text-red-500">
                {error || 'Lote no encontrado'}
                <br />
                <button onClick={() => router.back()} className="mt-4 text-blue-600 underline text-sm">
                    Volver
                </button>
            </div>
        )
    }

    const est = ESTADO_LABEL[lote.estado] ?? { label: lote.estado, cls: 'bg-gray-100 text-gray-700' }
    const esPendiente = puedeEditarPrestacionEnLote(lote.estado)
    const esIPSTxt = lote.origen === 'IPS_TXT'
    const esIps = esObraSocialIps(lote.obraSocial?.nombre)
    const esOsecac = esObraSocialOsecac(lote.obraSocial?.nombre)
    const puedeAplicarPromedi = esPendiente && !lote.promediAplicado && (esIPSTxt || (lote.tipo === 'PRACTICAS' && (esIps || esOsecac)))
    const porcentajePromediDecimal = esIPSTxt || esIps ? 0.36 : 0.20
    const porcentajePromediLabel = esIPSTxt || esIps ? 36 : 20
    const itemsIncluidos = lote.items.filter((it) => it.incluido)
    const itemsOrdenados = [...lote.items].sort((a, b) =>
        (a.paciente?.nombreCompleto ?? a.ingreso.nombre ?? '').localeCompare(
            b.paciente?.nombreCompleto ?? b.ingreso.nombre ?? '',
            'es',
            { sensitivity: 'base' }
        )
    )
    // Categorias presentes en cada ingreso, a partir del detalle ya cargado para impresion.
    const categoriasPorIngreso = new Map<number, Set<CategoriaPractica>>()
    const conteoCategoriasLote: Partial<Record<CategoriaPractica, number>> = {}
    if (!esIPSTxt) {
        for (const [ingresoIdRaw, ordenesIngreso] of Object.entries(ordenesPorIngreso)) {
            const ingresoId = Number(ingresoIdRaw)
            const presentes = new Set<CategoriaPractica>()
            for (const orden of ordenesIngreso) {
                if (!orden.incluidaEnLote) continue
                for (const linea of orden.items) {
                    const cat = categoriaPractica(linea.codigoPractica)
                    if (cat) presentes.add(cat)
                }
            }
            categoriasPorIngreso.set(ingresoId, presentes)
            for (const cat of presentes) {
                conteoCategoriasLote[cat] = (conteoCategoriasLote[cat] ?? 0) + 1
            }
        }
    }

    // Si ninguna practica del lote esta alcanzada por la regla, aplicar PROMEDI lo dejaria
    // en cero. Pasa con los lotes de guardia, que se facturan por otra via.
    const ingresosIncluidos = new Set(lote.items.filter((it) => it.incluido).map((it) => it.ingresoId))
    const hayPracticasAlcanzadas = esIPSTxt
        ? true
        : Object.entries(ordenesPorIngreso).some(([ingresoIdRaw, ordenesIngreso]) =>
            ingresosIncluidos.has(Number(ingresoIdRaw)) &&
            ordenesIngreso.some((orden) =>
                orden.incluidaEnLote &&
                orden.items.some((linea) =>
                    aplicaPromediPorObraYSubitem(
                        linea.codigoPractica,
                        esOsecac ? 'OSECAC' : 'IPS',
                        resolverSubitemPromedi({
                            codigoPractica: linea.codigoPractica,
                            modulo: linea.modulo,
                            efectorMatricula: linea.efectorMatricula,
                            profesional: orden.profesional?.nombre,
                        })
                    )
                )
            )
        )

    const itemsFiltrados = itemsOrdenados
        .filter((item) =>
            normalizarTexto(item.paciente?.nombreCompleto ?? item.ingreso.nombre).includes(normalizarTexto(filtroPaciente))
        )
        .filter((item) =>
            !filtroCategoria || (categoriasPorIngreso.get(item.ingresoId)?.has(filtroCategoria) ?? false)
        )
    const totalNetoSinPromedi = esIPSTxt
        ? (lote.itemsIPSTxt ?? []).reduce((s, it) => s + it.impTotal, 0)
        : 0
    const tienePromedi = esIPSTxt
        ? (lote.itemsIPSTxt ?? []).some((it) => it.importePromedi !== null && Number(it.importePromedi) !== Number(it.impTotal))
        : lote.items.some((it) => it.importePromedi !== null && it.importePromedi !== it.importeTotal)
    const totalIncluido = esIPSTxt
        ? (lote.itemsIPSTxt ?? []).reduce((s, it) => {
            const importeBase = Number(it.impTotal)
            const importeMostrado = it.importePromedi !== null
                ? Number(it.importePromedi)
                : importeBase
            return s + importeMostrado
        }, 0)
        : itemsIncluidos.reduce((s, it) => {
            const importeBase = Number(it.importeTotal)
            const importeMostrado = vistaPromedi && it.importePromedi !== null && it.importePromedi !== importeBase
                ? Number(it.importePromedi)
                : importeBase
            return s + importeMostrado
        }, 0)

    // Al resumen IPS solo van las practicas alcanzadas por la regla, y ademas hay que
    // respetar el filtro de categoria de la tabla.
    const itemsIPSTxtParaResumen = esIPSTxt
        ? (lote.itemsIPSTxt ?? [])
            .filter((it) => aplicaPromediIPS(it.servicioCodigo))
            .filter((it) => !filtroCategoriaIPS || categoriaPractica(it.servicioCodigo) === filtroCategoriaIPS)
        : []

    // El resumen impreso o exportado tiene que respetar el filtro de categoria de la
    // pantalla: si se filtra por radiografias, no puede salir el lote entero.
    const detalleIngresosBase = !esIPSTxt
        ? itemsOrdenados.filter((item) =>
            !filtroCategoria || (categoriasPorIngreso.get(item.ingresoId)?.has(filtroCategoria) ?? false)
        ).map((item) => {
            const ordenesIngreso = ordenesPorIngreso[item.ingresoId] ?? []
            const lineasBase = ordenesIngreso.filter((orden) => orden.incluidaEnLote).flatMap((orden) =>
                (filtroCategoria
                    ? orden.items.filter((it) => categoriaPractica(it.codigoPractica) === filtroCategoria)
                    : orden.items
                ).map((linea) => {
                    const subitemLinea = resolverSubitemPromedi({
                        codigoPractica: linea.codigoPractica,
                        modulo: linea.modulo,
                        efectorMatricula: linea.efectorMatricula,
                        profesional: orden.profesional?.nombre,
                    })
                    const importeLinea = vistaPromedi
                        ? importePromediAplicado(
                            linea.codigoPractica,
                            linea.importeTotal,
                            porcentajePromediDecimal,
                            esOsecac,
                            subitemLinea
                        )
                        : linea.importeTotal
                    const desglose = desglosarImportesPorCodigo(
                        linea.codigoPractica,
                        linea.modulo,
                        orden.profesional?.nombre,
                        importeLinea
                    )
                    return {
                        itemKey: String(linea.item ?? `${orden.numero}:${linea.codigoPractica}:${linea.fecha}`),
                        ordenNumero: orden.numero,
                        fecha: linea.fecha,
                        numeroAutorizacion: linea.numeroAutorizacion,
                        profesional: orden.profesional?.nombre ?? null,
                        codigoPractica: linea.codigoPractica,
                        cantidad: linea.cantidad,
                        importeEspecialista: desglose.importeEspecialista,
                        importeAyudante: desglose.importeAyudante,
                        importeAnestesista: desglose.importeAnestesista,
                        importeGastos: desglose.importeGastos,
                        importeTotal: importeLinea,
                    }
                })
            )

            const lineas = Array.from(
                lineasBase
                    .reduce((acc, linea) => {
                        const key = [
                            linea.itemKey,
                            linea.ordenNumero,
                            fechaToGroupingKey(linea.fecha),
                            linea.numeroAutorizacion ?? '',
                            linea.profesional ?? '',
                            linea.codigoPractica,
                        ].join('|')

                        const existente = acc.get(key)
                        if (!existente) {
                            acc.set(key, { ...linea })
                            return acc
                        }

                        existente.importeEspecialista = sumarImporteNullable(
                            existente.importeEspecialista,
                            linea.importeEspecialista
                        )
                        existente.importeAyudante = sumarImporteNullable(
                            existente.importeAyudante,
                            linea.importeAyudante
                        )
                        existente.importeAnestesista = sumarImporteNullable(
                            existente.importeAnestesista,
                            linea.importeAnestesista
                        )
                        existente.importeGastos = sumarImporteNullable(
                            existente.importeGastos,
                            linea.importeGastos
                        )
                        existente.importeTotal += linea.importeTotal
                        existente.cantidad = Math.max(existente.cantidad, linea.cantidad)

                        return acc
                    }, new Map<string, (typeof lineasBase)[number]>())
                    .values()
            )

            return {
                ingresoId: item.ingresoId,
                numeroIngreso: item.ingreso.numeroIngreso,
                paciente: item.paciente?.nombreCompleto ?? item.ingreso.nombre ?? '-',
                numeroAfiliado: item.ingreso.numeroAfiliado,
                totalIngreso: lineas.reduce((acc, it) => acc + it.importeTotal, 0),
                lineas,
            }
        })
        : []

    const detalleParaImpresion = printIngresoId === null
        ? detalleIngresosBase
        : detalleIngresosBase.filter((item) => item.ingresoId === printIngresoId)

    const filtroResumenActivo = esIPSTxt ? filtroCategoriaIPS : filtroCategoria
    const etiquetaFiltroCategoria = filtroResumenActivo
        ? CATEGORIA_PRACTICA_LABEL[filtroResumenActivo]
        : null

    // Con filtro activo el total del lote entero no aplica: hay que totalizar lo filtrado.
    const totalResumen = !filtroResumenActivo
        ? totalIncluido
        : esIPSTxt
            ? itemsIPSTxtParaResumen.reduce(
                (s, it) => s + (it.importePromedi !== null ? Number(it.importePromedi) : Number(it.impTotal)),
                0
            )
            : detalleIngresosBase.reduce((s, ing) => s + ing.totalIngreso, 0)

    // Genera el PDF sin pasar por el dialogo de impresion del navegador.
    async function descargarPdf(ingresoId: number | null = null) {
        setErrorPdf('')
        setGenerandoPdf(true)
        try {
            const detalle = ingresoId === null
                ? detalleIngresosBase
                : detalleIngresosBase.filter((item) => item.ingresoId === ingresoId)
            const totalPdf = ingresoId === null
                ? totalResumen
                : (detalle[0]?.totalIngreso ?? 0)

            await descargarResumenPdf({
                lote: lote!,
                totalIncluido: totalPdf,
                detalleIngresos: detalle,
                itemsIPSTxt: itemsIPSTxtParaResumen,
                filtroCategoria: etiquetaFiltroCategoria,
                pacienteUnico: ingresoId === null ? null : (detalle[0]?.paciente ?? null),
            })
        } catch (e) {
            console.error('[descargarPdf]', e)
            setErrorPdf('No se pudo generar el PDF')
        } finally {
            setGenerandoPdf(false)
        }
    }

    return (
        <div className="p-6 space-y-5 print:p-0 lote-detalle-print-root">
            {/* Encabezado */}
            <div className={`bg-white rounded-lg border border-gray-200 p-5 print:hidden ${esIPSTxt ? 'print:hidden' : ''}`}>
                <div className="flex items-start justify-between flex-wrap gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-bold text-gray-800">Lote #{lote.numero}</h2>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${est.cls}`}>
                                {est.label}
                            </span>
                            <span className="text-sm text-gray-500">{TIPO_LABEL[lote.tipo]}</span>
                        </div>
                        {tienePromedi && (
                            <div className="flex gap-1 pt-2">
                                <button onClick={() => setVistaPromedi(false)} className={`rounded px-3 py-1 text-xs ${!vistaPromedi ? 'bg-blue-600 text-white' : 'border'}`}>General</button>
                                <button onClick={() => setVistaPromedi(true)} className={`rounded px-3 py-1 text-xs ${vistaPromedi ? 'bg-blue-600 text-white' : 'border'}`}>PROMEDI</button>
                            </div>
                        )}
                        <div className="text-sm text-gray-600 space-x-4">
                            <span>Fecha: {new Date(lote.fecha).toLocaleDateString('es-AR')}</span>
                            <span>Período: {formatPeriodo(lote.periodo)}</span>
                            <span>Sede: {lote.sedeId ?? '-'}</span>
                        </div>
                        <div className="text-sm text-gray-600">
                            Cliente: <strong>{lote.obraSocial?.nombre ?? 'Particular'}</strong>
                        </div>
                        {lote.tipoIngresoCodigo && (
                            <div className="text-sm text-gray-500">
                                Tipo Ingreso: {lote.tipoIngresoCodigo}
                                {(lote.rangoDesde || lote.rangoHasta) && (
                                    <span className="ml-2">
                                        | Rango: {lote.rangoDesde ?? '–'} a {lote.rangoHasta ?? '–'}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex gap-2 print:hidden">
                        <button
                            onClick={() => imprimir(null)}
                            className="border border-gray-300 text-gray-600 px-3 py-1.5 rounded text-sm hover:bg-gray-50"
                        >
                            🖨 Imprimir general
                        </button>
                        <button
                            onClick={() => descargarPdf(null)}
                            disabled={generandoPdf}
                            className="border border-gray-300 text-gray-600 px-3 py-1.5 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
                        >
                            {generandoPdf ? 'Generando PDF...' : '⬇ Descargar PDF'}
                        </button>
                        {puedeAplicarPromedi && (
                            <button
                                onClick={() => {
                                    setErrorPromedi('')
                                    setMostrarConfirmPromedi(true)
                                }}
                                disabled={procesando}
                                className="bg-green-600 text-white px-3 py-1.5 rounded text-sm hover:bg-green-700 disabled:opacity-50 font-medium"
                            >
                                Aplicar PROMEDI ({porcentajePromediLabel}%)
                            </button>
                        )}
                        {esPendiente && !esIPSTxt && (
                            <>
                                <button
                                    onClick={() => cambiarEstado('ANU')}
                                    disabled={procesando}
                                    className="border border-red-300 text-red-600 px-3 py-1.5 rounded text-sm hover:bg-red-50 disabled:opacity-50"
                                >
                                    Anular
                                </button>
                                <button
                                    onClick={() => cambiarEstado('CON')}
                                    disabled={procesando}
                                    className="bg-green-600 text-white px-3 py-1.5 rounded text-sm hover:bg-green-700 disabled:opacity-50"
                                >
                                    Confirmar
                                </button>
                            </>
                        )}
                        {esPendiente && esIPSTxt && (
                            <button
                                onClick={() => cambiarEstado('ANU')}
                                disabled={procesando}
                                className="border border-red-300 text-red-600 px-3 py-1.5 rounded text-sm hover:bg-red-50 disabled:opacity-50"
                            >
                                Anular
                            </button>
                        )}
                        <button
                            onClick={() => router.back()}
                            className="border border-gray-300 px-3 py-1.5 rounded text-sm hover:bg-gray-50"
                        >
                            ← Volver
                        </button>
                    </div>
                </div>

                {errorPdf && (
                    <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 print:hidden">
                        {errorPdf}
                    </div>
                )}

                <div className="mt-3 space-y-1 text-sm text-gray-600 print:hidden">
                    {lote.concepto && <div><strong>Concepto:</strong> {lote.concepto}</div>}
                    {lote.descripcion && <div><strong>Descripción:</strong> {lote.descripcion}</div>}
                </div>

                {/* Resumen numérico */}
                <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-4 text-sm print:hidden">
                    <div className="text-center">
                        <div className="text-2xl font-bold text-blue-700">
                            {esIPSTxt ? (lote.itemsIPSTxt?.length ?? 0) : lote.items.length}
                        </div>
                        <div className="text-gray-500">{esIPSTxt ? 'Registros IPS' : 'Pacientes en lote'}</div>
                    </div>
                    <div className="text-center">
                        {esIPSTxt ? (
                            <>
                                <div className="text-2xl font-bold text-gray-800">{formatMonto(totalNetoSinPromedi)}</div>
                                <div className="text-gray-500">Neto sin PROMEDI</div>
                            </>
                        ) : (
                            <>
                                <div className="text-2xl font-bold text-green-700">{itemsIncluidos.length}</div>
                                <div className="text-gray-500">A facturar</div>
                            </>
                        )}
                    </div>
                    <div className="text-center">
                        <div className={`text-2xl font-bold ${esIPSTxt ? 'text-green-700' : 'text-gray-800'}`}>{formatMonto(totalIncluido)}</div>
                        <div className="text-gray-500">{esIPSTxt ? 'Total a facturar con PROMEDI' : 'Total a facturar'}</div>
                    </div>
                </div>
            </div>

            {/* IPS TXT items table */}
            {esIPSTxt && (
                <div className="ips-print-sheet">
                    <div className="hidden print:block border-b-2 border-gray-300 pb-3 mb-3">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h1 className="text-lg font-bold text-gray-900">Informe de Planilla IPS</h1>
                                <p className="text-[11px] text-gray-600 mt-0.5">
                                    Obra Social: {lote.obraSocial?.nombre ?? 'Particular'}
                                </p>
                                <p className="text-[11px] text-gray-600">Período: {formatPeriodo(lote.periodo)}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xl font-mono font-bold text-blue-700">Lote #{lote.numero}</p>
                                <p className="text-[11px] text-gray-600">Fecha: {new Date(lote.fecha).toLocaleDateString('es-AR')}</p>
                                <p className="text-[11px] text-gray-600">Emitido: {new Date().toLocaleString('es-AR')}</p>
                            </div>
                        </div>
                    </div>

                    <TablaIPSTxtItems
                        items={lote.itemsIPSTxt ?? []}
                        esPendiente={esPendiente}
                        filtroCategoria={filtroCategoriaIPS}
                        onFiltroCategoriaChange={setFiltroCategoriaIPS}
                    />

                    <div className="hidden print:block border-t border-gray-300 mt-3 pt-2 text-[10px] text-gray-500 text-center">
                        Sistema HIS - Resumen de facturacion por planilla IPS
                    </div>
                </div>
            )}

            {/* Tabla de pacientes (solo lotes normales) */}
            {!esIPSTxt && (
                <div className="grid grid-cols-12 gap-4">
                    <div className={`${selectedIngresoId ? 'col-span-5' : 'col-span-12'} space-y-2`}>
                        <div className="flex flex-wrap items-end gap-2">
                            <h3 className="text-sm font-semibold text-gray-700 mr-2">Pacientes del Lote</h3>
                            <div>
                                <label className="block text-[11px] text-gray-500 mb-1">Paciente</label>
                                <input
                                    type="text"
                                    value={filtroPaciente}
                                    onChange={(e) => setFiltroPaciente(e.target.value)}
                                    placeholder="Nombre o apellido"
                                    className="border rounded px-2 py-1 text-xs"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] text-gray-500 mb-1">Médico</label>
                                <input
                                    type="text"
                                    value={filtroMedico}
                                    onChange={(e) => setFiltroMedico(e.target.value)}
                                    placeholder="Nombre"
                                    className="border rounded px-2 py-1 text-xs"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] text-gray-500 mb-1">Matrícula</label>
                                <input
                                    type="number"
                                    min={1}
                                    value={filtroMatricula}
                                    onChange={(e) => setFiltroMatricula(e.target.value)}
                                    placeholder="9110"
                                    className="border rounded px-2 py-1 text-xs w-24"
                                />
                            </div>
                            {(filtroPaciente || filtroMedico || filtroMatricula || filtroCategoria) && (
                                <button
                                    onClick={() => {
                                        setFiltroMedico('')
                                        setFiltroMatricula('')
                                        setFiltroPaciente('')
                                        setFiltroCategoria('')
                                    }}
                                    className="text-xs border border-gray-300 rounded px-2 py-1 hover:bg-gray-50"
                                >
                                    Limpiar filtros
                                </button>
                            )}
                        </div>
                        <FiltroCategoriasPractica
                            valor={filtroCategoria}
                            onChange={setFiltroCategoria}
                            conteos={conteoCategoriasLote}
                            totalSinFiltro={lote.items.length}
                            etiquetaTodos="Todos los pacientes"
                        />
                        {filtroCategoria && (
                            <p className="text-[11px] text-gray-500 print:hidden">
                                Mostrando solo pacientes y prácticas de {CATEGORIA_PRACTICA_LABEL[filtroCategoria]}. Los importes de la
                                tabla siguen siendo los del ingreso completo.
                            </p>
                        )}
                        <div className="overflow-x-auto rounded-lg border border-gray-200">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-gray-600">
                                    <tr>
                                        {esPendiente && <th className="px-3 py-2.5 text-center">✓</th>}
                                        <th className="px-3 py-2.5 text-left font-medium">Nro</th>
                                        <th className="px-3 py-2.5 text-left font-medium">Paciente</th>
                                        <th className="px-3 py-2.5 text-left font-medium">Afiliado</th>
                                        <th className="px-3 py-2.5 text-right font-medium">Importe</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {itemsFiltrados.map((item) => (
                                        <tr
                                            key={item.id}
                                            className={`cursor-pointer hover:bg-blue-50 ${selectedIngresoId === item.ingresoId ? 'bg-blue-50' : ''} ${!item.incluido ? 'opacity-40' : ''}`}
                                            onClick={() => cargarOrdenes(item.ingresoId)}
                                        >
                                            {esPendiente && (
                                                <td className="px-3 py-2 text-center" onClick={(e) => { e.stopPropagation(); toggleItem(item) }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={item.incluido}
                                                        readOnly
                                                        className="cursor-pointer"
                                                    />
                                                </td>
                                            )}
                                            <td className="px-3 py-2 font-mono text-xs">{item.ingreso.numeroIngreso}</td>
                                            <td className="px-3 py-2">
                                                <div className="font-medium text-gray-800">
                                                    {item.paciente?.nombreCompleto ?? item.ingreso.nombre ?? '-'}
                                                </div>
                                                {item.paciente?.numeroDocumento && (
                                                    <div className="text-xs text-gray-500">
                                                        DNI {item.paciente.numeroDocumento.toLocaleString('es-AR')}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-xs text-gray-500">
                                                {item.ingreso.numeroAfiliado ?? '-'}
                                            </td>
                                            <td className="px-3 py-2 text-right font-semibold">
                                                {(() => {
                                                    const importeBase = Number(item.importeTotal)
                                                    const importeMostrado = vistaPromedi && item.importePromedi !== null && item.importePromedi !== importeBase
                                                        ? Number(item.importePromedi)
                                                        : importeBase
                                                    return formatMonto(importeMostrado)
                                                })()}
                                            </td>
                                        </tr>
                                    ))}
                                    {lote.items.length === 0 && (
                                        <tr>
                                            <td colSpan={esPendiente ? 5 : 4} className="px-3 py-6 text-center text-gray-400">
                                                Sin pacientes en este lote
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Panel de órdenes del paciente seleccionado */}
                    {selectedIngresoId && (
                        <div className="col-span-7 space-y-2">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-gray-700">
                                    Órdenes Facturadas —{' '}
                                    {lote.items.find((i) => i.ingresoId === selectedIngresoId)?.paciente?.nombreCompleto ?? 'Paciente'}
                                </h3>
                                <button
                                    onClick={() => imprimir(selectedIngresoId)}
                                    className="rounded border border-blue-300 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
                                >
                                    Imprimir paciente
                                </button>
                                <button
                                    onClick={() => descargarPdf(selectedIngresoId)}
                                    disabled={generandoPdf}
                                    className="rounded border border-blue-300 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                                >
                                    {generandoPdf ? 'Generando...' : 'PDF paciente'}
                                </button>
                                <button
                                    onClick={() => { setSelectedIngresoId(null); setOrdenes([]) }}
                                    className="text-xs text-gray-400 hover:text-gray-600"
                                >
                                    ✕ Cerrar
                                </button>
                            </div>

                            {loadingOrdenes ? (
                                <div className="p-4 text-center text-gray-400 text-sm">Cargando órdenes...</div>
                            ) : ordenes.length === 0 ? (
                                <div className="p-4 text-center text-gray-400 text-sm rounded border bg-gray-50">
                                    Sin órdenes facturadas para este ingreso
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {(() => {
                                        const ordenesDeCategoria = filtroCategoria
                                            ? ordenes.filter((orden) =>
                                                orden.items.some((it) => categoriaPractica(it.codigoPractica) === filtroCategoria)
                                            )
                                            : ordenes
                                        const ordenesOrdenadas = [...ordenesDeCategoria].sort((a, b) => {
                                            const diffTipo = Number(Boolean(b.esCirugia)) - Number(Boolean(a.esCirugia))
                                            if (diffTipo !== 0) return diffTipo
                                            const fechaA = new Date(a.fechaEmision).getTime()
                                            const fechaB = new Date(b.fechaEmision).getTime()
                                            if (fechaA !== fechaB) return fechaA - fechaB
                                            return a.numero - b.numero
                                        })
                                        const hayCirugiaMultiple = ordenesOrdenadas.some((orden) => Boolean(orden.esCirugiaMultiple))

                                        if (ordenesOrdenadas.length === 0) {
                                            return (
                                                <div className="p-4 text-center text-gray-400 text-sm rounded border bg-gray-50">
                                                    Este paciente no tiene prácticas de {CATEGORIA_PRACTICA_LABEL[filtroCategoria as CategoriaPractica]}
                                                </div>
                                            )
                                        }

                                        return ordenesOrdenadas.map((orden, index) => {
                                            const keyOrden = `${orden.puestoNumero}-${orden.numero}`
                                            const keyOrdenEdicion = `${orden.puestoNumero}:${orden.numero}`
                                            const draftOrden = editOrdenes[keyOrdenEdicion] ?? buildOrdenEditState(orden)
                                            const porcentajePromediOrden = esIPSTxt || esIps ? 0.36 : 0.20
                                            const itemsOrden = filtroCategoria
                                                ? orden.items.filter((it) => categoriaPractica(it.codigoPractica) === filtroCategoria)
                                                : orden.items
                                            const itemsTabla = agruparItemsOrdenParaTabla(
                                                itemsOrden,
                                                porcentajePromediOrden,
                                                esOsecac,
                                                orden.profesional?.nombre
                                            )
                                            const totalCantidadOrden = itemsOrden.reduce((acc, it) => acc + (it.cantidad ?? 0), 0)
                                            const limitePracticas = 4
                                            const abierta = ordenesAbiertas[keyOrden] ?? false
                                            const editandoOrden = ordenesEnEdicion[keyOrden] ?? false
                                            const expandida = ordenesExpandidas[keyOrden] ?? false
                                            const practicasVisibles = expandida
                                                ? itemsTabla
                                                : itemsTabla.slice(0, limitePracticas)
                                            const restantes = Math.max(0, itemsTabla.length - practicasVisibles.length)
                                            const esOrdenCirugia = Boolean(orden.esCirugia)
                                            const eraCirugia = index > 0 ? Boolean(ordenesOrdenadas[index - 1]?.esCirugia) : null
                                            const mostrarEncabezadoSeccion = index === 0 || esOrdenCirugia !== eraCirugia

                                            return (
                                                <div key={keyOrden} className="space-y-2">
                                                    {mostrarEncabezadoSeccion && (
                                                        <div
                                                            className={`rounded-md border px-3 py-2 text-xs font-semibold uppercase tracking-wide ${esOrdenCirugia
                                                                ? 'border-amber-200 bg-amber-50 text-amber-900'
                                                                : 'border-slate-200 bg-slate-50 text-slate-700'
                                                                }`}
                                                        >
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span>{esOrdenCirugia ? 'Cirugia' : 'Ordenes generales'}</span>
                                                                {esOrdenCirugia && hayCirugiaMultiple && (
                                                                    <span className="text-[11px] normal-case font-medium text-amber-800">
                                                                        Incluye cirugia multiple con reglas de vias aplicadas en facturacion
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className={`border rounded-lg ${orden.incluidaEnLote ? 'bg-white' : 'border-red-200 bg-red-50/50 opacity-75'} ${esOrdenCirugia && orden.incluidaEnLote ? 'border-amber-200' : ''}`}>
                                                <div className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
                                                    <button
                                                        type="button"
                                                        onClick={() => setOrdenesAbiertas((prev) => ({
                                                            ...prev,
                                                            [keyOrden]: !(prev[keyOrden] ?? false),
                                                        }))}
                                                        className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                                                    >
                                                        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-800">
                                                            <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${abierta ? 'rotate-90' : ''}`} />
                                                            <span>Orden #{orden.numero}</span>
                                                            {esOrdenCirugia && (
                                                                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                                                                    Cirugia
                                                                </span>
                                                            )}
                                                            {esOrdenCirugia && orden.esCirugiaMultiple && (
                                                                <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                                                                    Multiple
                                                                </span>
                                                            )}
                                                            {orden.descripcion && <span className="truncate font-normal text-gray-500">— {orden.descripcion}</span>}
                                                            {!orden.incluidaEnLote && (
                                                                <span className="inline-flex items-center rounded bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                                                                    Excluida del lote
                                                                </span>
                                                            )}
                                                        </span>
                                                        <span className="shrink-0 text-xs text-gray-500">{itemsTabla.length} práctica(s)</span>
                                                    </button>
                                                    {esPendiente && orden.incluidaEnLote && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setOrdenesAbiertas((prev) => ({ ...prev, [keyOrden]: true }))
                                                                setOrdenesEnEdicion((prev) => ({ ...prev, [keyOrden]: !editandoOrden }))
                                                            }}
                                                            className={`shrink-0 rounded border px-2.5 py-1 text-xs font-medium ${editandoOrden
                                                                ? 'border-blue-300 bg-blue-50 text-blue-700'
                                                                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                                                }`}
                                                        >
                                                            {editandoOrden ? 'Finalizar edición' : 'Editar'}
                                                        </button>
                                                    )}
                                                    {esPendiente && (
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleOrdenEnLote(orden)}
                                                            disabled={actualizandoOrdenKey === keyOrden}
                                                            className={`shrink-0 rounded border px-2.5 py-1 text-xs font-medium disabled:opacity-60 ${orden.incluidaEnLote
                                                                ? 'border-red-300 bg-white text-red-700 hover:bg-red-50'
                                                                : 'border-green-300 bg-white text-green-700 hover:bg-green-50'
                                                                }`}
                                                        >
                                                            {actualizandoOrdenKey === keyOrden
                                                                ? 'Actualizando...'
                                                                : (orden.incluidaEnLote ? 'Remover del lote' : 'Reincorporar')}
                                                        </button>
                                                    )}
                                                </div>

                                                {abierta && (
                                                    <div className="border-t border-gray-200">
                                                        <div className="grid gap-3 bg-gray-50/70 px-3 py-3 text-xs text-gray-700 sm:grid-cols-3">
                                                            {esPendiente && editandoOrden ? (
                                                                <>
                                                                    <label className="block">Fecha de emisión
                                                                        <input type="datetime-local" value={draftOrden.fechaEmision} onChange={(e) => setEditOrdenes((prev) => ({ ...prev, [keyOrdenEdicion]: { ...draftOrden, fechaEmision: e.target.value } }))} className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5" />
                                                                    </label>
                                                                    <label className="block sm:col-span-2">Descripción de la orden
                                                                        <input value={draftOrden.descripcion} onChange={(e) => setEditOrdenes((prev) => ({ ...prev, [keyOrdenEdicion]: { ...draftOrden, descripcion: e.target.value } }))} className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5" />
                                                                    </label>
                                                                    <div className="flex items-center gap-3 sm:col-span-3">
                                                                        <span>Total: <strong>{formatMonto(orden.importeTotal)}</strong></span>
                                                                        <span>Cantidad: <strong>{totalCantidadOrden}</strong></span>
                                                                        <button type="button" onClick={() => guardarOrden(orden)} disabled={guardandoOrdenKey === keyOrdenEdicion} className="ml-auto rounded border border-blue-300 bg-blue-50 px-3 py-1.5 font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60">
                                                                            {guardandoOrdenKey === keyOrdenEdicion ? 'Guardando...' : 'Guardar cabecera'}
                                                                        </button>
                                                                    </div>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <span>Fecha de emisión: <strong>{new Date(orden.fechaEmision).toLocaleString('es-AR')}</strong></span>
                                                                    <span>Total: <strong>{formatMonto(orden.importeTotal)}</strong></span>
                                                                    <span>Cantidad: <strong>{totalCantidadOrden}</strong></span>
                                                                    {orden.descripcion && <span className="sm:col-span-3">Descripción: <strong>{orden.descripcion}</strong></span>}
                                                                </>
                                                            )}
                                                            {esOrdenCirugia && (orden.etiquetasCirugia?.length ?? 0) > 0 && (
                                                                <span className="font-medium text-amber-800 sm:col-span-3">Reglas cirugía: {(orden.etiquetasCirugia ?? []).join(' · ')}</span>
                                                            )}
                                                        </div>

                                                        <div className="px-3 py-3">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">Prácticas ({itemsTabla.length})</p>
                                                                {!editandoOrden && itemsTabla.length > limitePracticas && (
                                                                    <button type="button" onClick={() => setOrdenesExpandidas((prev) => ({ ...prev, [keyOrden]: !(prev[keyOrden] ?? false) }))} className="rounded border border-gray-300 px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50">
                                                                        {expandida ? 'Contraer' : 'Expandir'}
                                                                    </button>
                                                                )}
                                                            </div>

                                                            {esPendiente && editandoOrden ? (
                                                                <div className="mt-2 divide-y divide-gray-200 border-y border-gray-200">
                                                                    {itemsOrden.map((it) => {
                                                                        const key = keyOrdenItem(orden.puestoNumero, orden.numero, it.item)
                                                                        const draft = editItems[key] ?? buildOrdenItemEditState(it)
                                                                        const guardando = guardandoItemKey === key

                                                                        return (
                                                                            <div key={it.item} className="grid gap-3 py-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                                                                                <label>Práctica
                                                                                    <input value={draft.codigoPractica} onChange={(e) => setEditItems((prev) => ({ ...prev, [key]: { ...draft, codigoPractica: e.target.value } }))} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 font-mono" />
                                                                                </label>
                                                                                <label className="sm:col-span-2">Descripción
                                                                                    <input value={draft.descripcion} onChange={(e) => setEditItems((prev) => ({ ...prev, [key]: { ...draft, descripcion: e.target.value } }))} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" />
                                                                                </label>
                                                                                <label>Cantidad
                                                                                    <input type="number" min={0.01} step={0.01} value={draft.cantidad} onChange={(e) => setEditItems((prev) => ({ ...prev, [key]: actualizarCantidadOrdenItem(draft, e.target.value) }))} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" />
                                                                                </label>
                                                                                <label>Fecha de práctica
                                                                                    <input type="datetime-local" value={draft.fecha} onChange={(e) => setEditItems((prev) => ({ ...prev, [key]: { ...draft, fecha: e.target.value } }))} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" />
                                                                                </label>
                                                                                <label>N° autorización
                                                                                    <input value={draft.numeroAutorizacion} onChange={(e) => setEditItems((prev) => ({ ...prev, [key]: { ...draft, numeroAutorizacion: e.target.value } }))} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" />
                                                                                </label>
                                                                                <label>Módulo
                                                                                    <input value={draft.modulo} onChange={(e) => setEditItems((prev) => ({ ...prev, [key]: { ...draft, modulo: e.target.value } }))} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" />
                                                                                </label>
                                                                                <label>Matrícula ejecutante
                                                                                    <input type="number" min={1} value={draft.matriculaEjecutante} onChange={(e) => setEditItems((prev) => ({ ...prev, [key]: { ...draft, matriculaEjecutante: e.target.value } }))} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" />
                                                                                </label>
                                                                                <label>Importe
                                                                                    <input type="number" min={0} step={0.01} value={draft.importeTotal} onChange={(e) => setEditItems((prev) => ({ ...prev, [key]: { ...draft, importeTotal: e.target.value } }))} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" />
                                                                                </label>
                                                                                <div className="flex items-end justify-end gap-2 sm:col-span-2 lg:col-span-3">
                                                                                    <button onClick={() => cancelarEdicionItem(orden, it)} disabled={guardando} className="rounded border border-gray-300 px-3 py-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-60">Cancelar</button>
                                                                                    <button onClick={() => guardarOrdenItem(orden, it)} disabled={guardando} className="rounded border border-blue-300 bg-blue-50 px-3 py-1.5 font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60">{guardando ? 'Guardando...' : 'Guardar práctica'}</button>
                                                                                </div>
                                                                            </div>
                                                                        )
                                                                    })}
                                                                </div>
                                                            ) : (
                                                                <div className="mt-2 divide-y divide-gray-200 border-y border-gray-200 text-xs">
                                                                    {practicasVisibles.map((it) => {
                                                                        const importeBase = it.importeTotal
                                                                        const cambioPromedi = vistaPromedi && it.importePromedi !== null && it.importePromedi !== importeBase
                                                                        const importeAplicado = cambioPromedi ? it.importePromedi : importeBase
                                                                        return (
                                                                            <div key={it.key} className="grid gap-1 py-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                                                                                <div>
                                                                                    <span className="font-mono text-gray-800">{it.codigoPractica}</span>
                                                                                    <span className="ml-2 text-gray-700">{it.descripcion ?? '-'}</span>
                                                                                </div>
                                                                                <div className="text-right">
                                                                                    {cambioPromedi ? (
                                                                                        <div className="flex flex-col items-end">
                                                                                            <span className="text-[11px] text-gray-400 line-through">{formatMonto(importeBase)}</span>
                                                                                            <strong className="text-green-700">{formatMonto(importeAplicado)}</strong>
                                                                                        </div>
                                                                                    ) : (
                                                                                        <strong className="text-gray-800">{formatMonto(importeBase)}</strong>
                                                                                    )}
                                                                                </div>
                                                                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500 sm:col-span-2">
                                                                                    <span>{new Date(it.fecha).toLocaleString('es-AR')}</span>
                                                                                    <span>Cant. {it.cantidad}</span>
                                                                                    <span className="text-blue-700">Aut. {it.numeroAutorizacion ?? '—'}</span>
                                                                                    <span>Subitem: {it.subitemComputado}</span>
                                                                                    <span>Ejecutante: {orden.profesional?.nombre ?? '-'} · Mat. {orden.profesional?.matricula ?? '-'}</span>
                                                                                </div>
                                                                            </div>
                                                                        )
                                                                    })}
                                                                    {!expandida && restantes > 0 && <p className="py-2 text-[11px] text-gray-500">+{restantes} práctica(s) más</p>}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                                    </div>
                                            </div>
                                            )
                                        })
                                    })()}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Vista de impresión oculta */}
            <div ref={printRef} className="hidden print:block">
                <LoteResumenPrint
                    lote={lote}
                    totalIncluido={printIngresoId === null
                        ? totalResumen
                        : (detalleParaImpresion.find((item) => item.ingresoId === printIngresoId)?.totalIngreso ?? 0)}
                    detalleIngresos={detalleParaImpresion}
                    itemsIPSTxt={esIPSTxt ? itemsIPSTxtParaResumen : undefined}
                    filtroCategoria={etiquetaFiltroCategoria}
                />
                </div>

            {mostrarConfirmPromedi && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 print:hidden">
                    <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-gray-200">
                        <div className="px-5 py-4 border-b border-gray-100">
                            <h3 className="text-base font-semibold text-gray-900">Aplicar PROMEDI</h3>
                        </div>
                        <div className="px-5 py-4 space-y-3">
                            <p className="text-sm text-gray-700">
                                ¿Generar resumen PROMEDI ({porcentajePromediLabel}%)? Los códigos fuera de regla no se facturan.
                            </p>
                            {!hayPracticasAlcanzadas && (
                                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                    Ninguna práctica de este lote está alcanzada por la regla PROMEDI, así que el resumen
                                    quedaría en <strong>cero</strong>. Es lo esperable en los lotes de guardia, que se
                                    facturan por otra vía: en ese caso no hace falta aplicar PROMEDI.
                                </div>
                            )}
                            {errorPromedi && (
                                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                    {errorPromedi}
                                </div>
                            )}
                        </div>
                        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    if (!procesando) {
                                        setMostrarConfirmPromedi(false)
                                        setErrorPromedi('')
                                    }
                                }}
                                disabled={procesando}
                                className="border border-gray-300 px-3 py-1.5 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={aplicarPromedi}
                                disabled={procesando}
                                className="bg-green-600 text-white px-3 py-1.5 rounded text-sm hover:bg-green-700 disabled:opacity-50"
                            >
                                {procesando ? 'Aplicando...' : 'Aplicar y Confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ============================================================
// Tabla items IPS TXT
// ============================================================

function TablaIPSTxtItems({
    items,
    esPendiente,
    filtroCategoria,
    onFiltroCategoriaChange,
}: {
    items: LoteIPSTxtItemDetalle[]
    esPendiente: boolean
    // El filtro vive en el padre: la impresion y el PDF tienen que respetarlo.
    filtroCategoria: CategoriaPractica | ''
    onFiltroCategoriaChange: (valor: CategoriaPractica | '') => void
}) {
    const setFiltroCategoria = onFiltroCategoriaChange

    const conteoPorCategoria = items.reduce((acc, it) => {
        const cat = categoriaPractica(it.servicioCodigo)
        if (cat) acc[cat] = (acc[cat] ?? 0) + 1
        return acc
    }, {} as Partial<Record<CategoriaPractica, number>>)

    const itemsVisibles = filtroCategoria
        ? items.filter((it) => categoriaPractica(it.servicioCodigo) === filtroCategoria)
        : items
    const totalBruto = itemsVisibles.reduce((s, it) => s + it.impTotal, 0)
    const totalPromedi = itemsVisibles.reduce((s, it) => s + (it.importePromedi ?? 0), 0)

    return (
        <div className="space-y-2 print:space-y-0">
            <div className="flex items-center gap-3 print:hidden">
                <h3 className="text-sm font-semibold text-gray-700">Registros de Planilla IPS</h3>
                {esPendiente && (
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                        Pendiente de PROMEDI
                    </span>
                )}
            </div>
            <FiltroCategoriasPractica
                valor={filtroCategoria}
                onChange={setFiltroCategoria}
                conteos={conteoPorCategoria}
                totalSinFiltro={items.length}
            />
            <p className="text-xs text-gray-500 print:hidden">
                Al resumen solo entran los códigos alcanzados por la regla PROMEDI; los demás no se facturan.
            </p>
            <div className="ips-print-table overflow-x-auto rounded-lg border border-gray-200 print:rounded-none print:border-0">
                <table className="w-full text-xs print:text-[9px]">
                    <colgroup>
                        <col style={{ width: '14%' }} />
                        <col style={{ width: '6%' }} />
                        <col style={{ width: '7%' }} />
                        <col style={{ width: '18%' }} />
                        <col style={{ width: '4%' }} />
                        <col style={{ width: '8.5%' }} />
                        <col style={{ width: '8.5%' }} />
                        <col style={{ width: '8.5%' }} />
                        <col style={{ width: '8.5%' }} />
                        <col style={{ width: '8.5%' }} />
                        <col style={{ width: '8.5%' }} />
                    </colgroup>
                    <thead className="bg-gray-50 text-gray-600">
                        <tr>
                            <th className="px-3 py-2.5 text-left font-medium">Afiliado</th>
                            <th className="px-3 py-2.5 text-left font-medium">Orden</th>
                            <th className="px-3 py-2.5 text-left font-medium">Fecha</th>
                            <th className="px-3 py-2.5 text-left font-medium">Servicio</th>
                            <th className="px-3 py-2.5 text-center font-medium">Cant</th>
                            <th className="px-3 py-2.5 text-right font-medium">Esp.</th>
                            <th className="px-3 py-2.5 text-right font-medium">Ayu.</th>
                            <th className="px-3 py-2.5 text-right font-medium">Ane.</th>
                            <th className="px-3 py-2.5 text-right font-medium">Gto.</th>
                            <th className="px-3 py-2.5 text-right font-medium">Total</th>
                            <th className="px-3 py-2.5 text-right font-medium">Importe aplicado</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {itemsVisibles.map((it) => {
                            const importeAplicado = it.importePromedi !== null ? Number(it.importePromedi) : null
                            const aplicaCodigoPromedi = aplicaPromediIPS(it.servicioCodigo)
                            const aplicaDescuentoPromedi = importeAplicado !== null && importeAplicado < Number(it.impTotal)

                            return (
                            <tr key={it.id} className="hover:bg-gray-50 print:hover:bg-transparent">
                                <td className="px-3 py-2">
                                    <div className="font-medium text-gray-800 leading-tight wrap-break-word">{it.afiliadoNom}</div>
                                    <div className="text-gray-400">{it.afiliadoDoc}</div>
                                </td>
                                <td className="px-3 py-2 font-mono text-gray-600">{it.nroOrden}</td>
                                <td className="px-3 py-2 text-gray-500">
                                    {it.fechaRealiz ? new Date(it.fechaRealiz).toLocaleDateString('es-AR') : '-'}
                                </td>
                                <td className="px-3 py-2">
                                    <div className="text-gray-800 leading-tight wrap-break-word">{it.servicioNombre}</div>
                                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                        <span className="text-gray-400 font-mono break-all">{it.servicioCodigo}</span>
                                        {it.importePromedi !== null && (
                                            <span
                                                className={`inline-flex rounded-full px-1.5 py-0.5 font-medium ${aplicaCodigoPromedi
                                                    ? 'bg-green-100 text-green-700'
                                                    : 'bg-gray-100 text-gray-600'
                                                    }`}
                                            >
                                                {aplicaCodigoPromedi ? 'PROMEDI 36%' : 'No se factura'}
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-3 py-2 text-center">{it.cantidad}</td>
                                <td className="px-3 py-2 text-right whitespace-nowrap print:text-[8px]">{formatMonto(it.impEsp)}</td>
                                <td className="px-3 py-2 text-right whitespace-nowrap print:text-[8px]">{formatMonto(it.impAyu)}</td>
                                <td className="px-3 py-2 text-right whitespace-nowrap print:text-[8px]">{formatMonto(it.impAne)}</td>
                                <td className="px-3 py-2 text-right whitespace-nowrap print:text-[8px]">{formatMonto(it.impGto)}</td>
                                <td className="px-3 py-2 text-right font-semibold whitespace-nowrap print:text-[8px]">{formatMonto(it.impTotal)}</td>
                                <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap print:text-[8px] ${aplicaDescuentoPromedi ? 'text-green-700' : 'text-gray-700'}`}>
                                    {importeAplicado !== null ? formatMonto(importeAplicado) : (
                                        <span className="text-gray-300">—</span>
                                    )}
                                </td>
                            </tr>
                            )
                        })}
                        {itemsVisibles.length === 0 && (
                            <tr>
                                <td colSpan={11} className="px-3 py-6 text-center text-gray-400">
                                    {filtroCategoria ? 'Sin registros para el filtro' : 'Sin registros'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t font-semibold text-sm print:text-[8px]">
                        <tr>
                            <td colSpan={10} className="px-3 py-2 text-right text-gray-600">Total bruto:</td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">{formatMonto(totalBruto)}</td>
                        </tr>
                        <tr>
                            <td colSpan={10} className="px-3 py-2 text-right text-gray-600">Total con PROMEDI:</td>
                            <td className="px-3 py-2 text-right text-green-700 whitespace-nowrap">
                                {totalPromedi > 0 ? formatMonto(totalPromedi) : '—'}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    )
}
