'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { LoteFacturacionDetalle, LoteFacturacionItemDetalle, LoteIPSTxtItemDetalle, OrdenAutorizadaLote } from '@/modules/facturacion/types'
import { LoteResumenPrint } from './lote-resumen-print'

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

interface Props { loteId: number }

type OrdenItemEditState = {
    fecha: string
    codigoPractica: string
    descripcion: string
    cantidad: string
    numeroAutorizacion: string
    importeTotal: string
}

function toDateTimeInput(value: Date | string | null | undefined): string {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toISOString().slice(0, 16)
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
    }
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
    const [editandoPracticas, setEditandoPracticas] = useState(false)
    const [editItems, setEditItems] = useState<Record<string, OrdenItemEditState>>({})
    const [guardandoItemKey, setGuardandoItemKey] = useState<string | null>(null)
    const [mostrarImpresion, setMostrarImpresion] = useState(false)
    const [mostrarConfirmPromedi, setMostrarConfirmPromedi] = useState(false)
    const [errorPromedi, setErrorPromedi] = useState('')
    const [filtroMedico, setFiltroMedico] = useState('')
    const [filtroMatricula, setFiltroMatricula] = useState('')
    const printRef = useRef<HTMLDivElement>(null)

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
        try {
            const sp = new URLSearchParams()
            if (filtroMedico.trim()) sp.set('medico', filtroMedico.trim())
            if (filtroMatricula.trim()) sp.set('matricula', filtroMatricula.trim())
            if (lote?.periodo) sp.set('periodo', lote.periodo)
            const res = await fetch(`/api/facturacion/lotes/ingreso/${ingresoId}/ordenes?${sp.toString()}`)
            const json = await res.json()
            const ordenesData: OrdenAutorizadaLote[] = json.data ?? []
            setOrdenes(ordenesData)

            const nextEditItems: Record<string, OrdenItemEditState> = {}
            for (const orden of ordenesData) {
                for (const item of orden.items) {
                    nextEditItems[keyOrdenItem(orden.puestoNumero, orden.numero, item.item)] = buildOrdenItemEditState(item)
                }
            }
            setEditItems(nextEditItems)
        } catch {
            setOrdenes([])
            setEditItems({})
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

    async function toggleItem(item: LoteFacturacionItemDetalle) {
        const res = await fetch(`/api/facturacion/lotes/${loteId}/items/${item.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ incluido: !item.incluido }),
        })
        if (res.ok) cargar()
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
                puestoNumero: orden.puestoNumero,
                ordenNumero: orden.numero,
                item: item.item,
                fecha: new Date(draft.fecha || item.fecha).toISOString(),
                codigoPractica: (draft.codigoPractica || item.codigoPractica || '').trim(),
                descripcionPractica: draft.descripcion || null,
                cantidad: Number(draft.cantidad || item.cantidad || 1),
                numeroAutorizacion: draft.numeroAutorizacion.trim() || null,
                importeTotal: Number(draft.importeTotal || item.importeTotal || 0),
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

    function imprimir() {
        window.print()
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
    const esPendiente = lote.estado === 'PEN'
    const esIPSTxt = lote.origen === 'IPS_TXT'
    const esOsecac = esObraSocialOsecac(lote.obraSocial?.nombre)
    const puedeAplicarPromedi = esPendiente && (esIPSTxt || (lote.tipo === 'PRACTICAS' && esOsecac))
    const porcentajePromedi = esIPSTxt ? 40 : 20
    const itemsIncluidos = lote.items.filter((it) => it.incluido)
    const totalNetoSinPromedi = esIPSTxt
        ? (lote.itemsIPSTxt ?? []).reduce((s, it) => s + it.impTotal, 0)
        : 0
    const totalIncluido = esIPSTxt
        ? (lote.itemsIPSTxt ?? []).reduce((s, it) => s + (it.importePromedi ?? it.impTotal), 0)
        : itemsIncluidos.reduce((s, it) => s + it.importeTotal, 0)

    return (
        <div className="p-6 space-y-5 print:p-0">
            {/* Encabezado */}
            <div className={`bg-white rounded-lg border border-gray-200 p-5 print:border-0 print:shadow-none ${esIPSTxt ? 'print:hidden' : ''}`}>
                <div className="flex items-start justify-between flex-wrap gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-bold text-gray-800">Lote #{lote.numero}</h2>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${est.cls}`}>
                                {est.label}
                            </span>
                            <span className="text-sm text-gray-500">{TIPO_LABEL[lote.tipo]}</span>
                        </div>
                        <div className="text-sm text-gray-600 space-x-4">
                            <span>Fecha: {new Date(lote.fecha).toLocaleDateString('es-AR')}</span>
                            <span>Período: {formatPeriodo(lote.periodo)}</span>
                            <span>Sede: {lote.sedeId ?? '-'}</span>
                        </div>
                        <div className="text-sm text-gray-600">
                            Cliente: <strong>{lote.obraSocial?.nombre ?? 'Particular'}</strong>
                            {lote.plan && <span className="text-gray-500"> — {lote.plan.descripcion}</span>}
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
                            onClick={imprimir}
                            className="border border-gray-300 text-gray-600 px-3 py-1.5 rounded text-sm hover:bg-gray-50"
                        >
                            🖨 Imprimir
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
                                Aplicar PROMEDI ({porcentajePromedi}%)
                            </button>
                        )}
                        {esPendiente && !esIPSTxt && (
                            <>
                                <button
                                    onClick={() => setEditandoPracticas((prev) => !prev)}
                                    className="border border-gray-300 px-3 py-1.5 rounded text-sm hover:bg-gray-50"
                                >
                                    {editandoPracticas ? 'Finalizar edición de prácticas' : '✏️ Editar prácticas'}
                                </button>
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

                <div className="mt-3 space-y-1 text-sm text-gray-600">
                    {lote.concepto && <div><strong>Concepto:</strong> {lote.concepto}</div>}
                    {lote.descripcion && <div><strong>Descripción:</strong> {lote.descripcion}</div>}
                    {esPendiente && !esIPSTxt && editandoPracticas && (
                        <div className="text-xs font-medium text-blue-700">
                            Modo edición activo: seleccioná un paciente y corregí las prácticas en sus órdenes.
                        </div>
                    )}
                </div>

                {/* Resumen numérico */}
                <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-4 text-sm">
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
                                    {lote.plan?.descripcion ? ` - ${lote.plan.descripcion}` : ''}
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
                            {(filtroMedico || filtroMatricula) && (
                                <button
                                    onClick={() => {
                                        setFiltroMedico('')
                                        setFiltroMatricula('')
                                    }}
                                    className="text-xs border border-gray-300 rounded px-2 py-1 hover:bg-gray-50"
                                >
                                    Limpiar filtros
                                </button>
                            )}
                        </div>
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
                                    {lote.items.map((item) => (
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
                                                {formatMonto(item.importeTotal)}
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
                                    Órdenes Autorizadas —{' '}
                                    {lote.items.find((i) => i.ingresoId === selectedIngresoId)?.paciente?.nombreCompleto ?? 'Paciente'}
                                </h3>
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
                                    Sin órdenes autorizadas para este ingreso
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {ordenes.map((orden) => (
                                        <div key={`${orden.puestoNumero}-${orden.numero}`} className="border rounded-lg bg-white">
                                            <div className="px-4 py-2.5 bg-gray-50 border-b flex items-center justify-between rounded-t-lg">
                                                <div className="text-sm font-medium">
                                                    Orden #{orden.numero}
                                                    {orden.descripcion && <span className="text-gray-500 ml-2">— {orden.descripcion}</span>}
                                                </div>
                                                <div className="text-right text-sm">
                                                    <div className="text-xs text-gray-400">
                                                        {new Date(orden.fechaEmision).toLocaleDateString('es-AR')}
                                                    </div>
                                                    <div className="font-semibold text-gray-700">
                                                        {formatMonto(orden.importeTotal)}
                                                    </div>
                                                </div>
                                            </div>
                                            {orden.numeroAutorizacion && (
                                                <div className="px-4 py-1 text-xs text-blue-600 bg-blue-50 border-b">
                                                    Aut. Orden: {orden.numeroAutorizacion}
                                                </div>
                                            )}
                                            <table className="w-full text-xs">
                                                <thead className="text-gray-500">
                                                    <tr>
                                                        <th className="px-4 py-1.5 text-left">Fecha</th>
                                                        <th className="px-4 py-1.5 text-left">Práctica</th>
                                                        <th className="px-4 py-1.5 text-left">Descripción</th>
                                                        <th className="px-4 py-1.5 text-center">Cant.</th>
                                                        <th className="px-4 py-1.5 text-left">Nro. Aut.</th>
                                                        <th className="px-4 py-1.5 text-right">Importe</th>
                                                        {esPendiente && editandoPracticas && <th className="px-4 py-1.5 text-right">Acción</th>}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {orden.items.map((it) => {
                                                        const key = keyOrdenItem(orden.puestoNumero, orden.numero, it.item)
                                                        const draft = editItems[key] ?? buildOrdenItemEditState(it)
                                                        const guardando = guardandoItemKey === key

                                                        return (
                                                            <tr key={it.item}>
                                                                <td className="px-4 py-1.5 text-gray-600">
                                                                    {esPendiente && editandoPracticas ? (
                                                                        <input
                                                                            type="datetime-local"
                                                                            value={draft.fecha}
                                                                            onChange={(e) => setEditItems((prev) => ({ ...prev, [key]: { ...draft, fecha: e.target.value } }))}
                                                                            className="w-44 rounded border border-gray-300 px-2 py-1"
                                                                        />
                                                                    ) : (
                                                                        new Date(it.fecha).toLocaleString('es-AR')
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-1.5 font-mono">
                                                                    {esPendiente && editandoPracticas ? (
                                                                        <input
                                                                            value={draft.codigoPractica}
                                                                            onChange={(e) => setEditItems((prev) => ({ ...prev, [key]: { ...draft, codigoPractica: e.target.value } }))}
                                                                            className="w-24 rounded border border-gray-300 px-2 py-1"
                                                                        />
                                                                    ) : (
                                                                        it.codigoPractica
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-1.5 text-gray-600">
                                                                    {esPendiente && editandoPracticas ? (
                                                                        <input
                                                                            value={draft.descripcion}
                                                                            onChange={(e) => setEditItems((prev) => ({ ...prev, [key]: { ...draft, descripcion: e.target.value } }))}
                                                                            className="w-full rounded border border-gray-300 px-2 py-1"
                                                                        />
                                                                    ) : (
                                                                        it.descripcion ?? '-'
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-1.5 text-center">
                                                                    {esPendiente && editandoPracticas ? (
                                                                        <input
                                                                            type="number"
                                                                            min={0.01}
                                                                            step={0.01}
                                                                            value={draft.cantidad}
                                                                            onChange={(e) => setEditItems((prev) => ({ ...prev, [key]: { ...draft, cantidad: e.target.value } }))}
                                                                            className="w-20 rounded border border-gray-300 px-2 py-1 text-center"
                                                                        />
                                                                    ) : (
                                                                        it.cantidad
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-1.5 text-blue-600">
                                                                    {esPendiente && editandoPracticas ? (
                                                                        <input
                                                                            value={draft.numeroAutorizacion}
                                                                            onChange={(e) => setEditItems((prev) => ({ ...prev, [key]: { ...draft, numeroAutorizacion: e.target.value } }))}
                                                                            className="w-32 rounded border border-gray-300 px-2 py-1 text-gray-700"
                                                                        />
                                                                    ) : (
                                                                        it.numeroAutorizacion ?? '—'
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-1.5 text-right">
                                                                    {esPendiente && editandoPracticas ? (
                                                                        <input
                                                                            type="number"
                                                                            min={0}
                                                                            step={0.01}
                                                                            value={draft.importeTotal}
                                                                            onChange={(e) => setEditItems((prev) => ({ ...prev, [key]: { ...draft, importeTotal: e.target.value } }))}
                                                                            className="w-28 rounded border border-gray-300 px-2 py-1 text-right"
                                                                        />
                                                                    ) : (
                                                                        formatMonto(it.importeTotal)
                                                                    )}
                                                                </td>
                                                                {esPendiente && editandoPracticas && (
                                                                    <td className="px-4 py-1.5 text-right">
                                                                        <div className="flex justify-end gap-1">
                                                                            <button
                                                                                onClick={() => guardarOrdenItem(orden, it)}
                                                                                disabled={guardando}
                                                                                className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                                                                            >
                                                                                {guardando ? 'Guardando...' : 'Guardar'}
                                                                            </button>
                                                                            <button
                                                                                onClick={() => cancelarEdicionItem(orden, it)}
                                                                                disabled={guardando}
                                                                                className="rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                                                                            >
                                                                                Cancelar
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                )}
                                                            </tr>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Vista de impresión oculta */}
            {!esIPSTxt && (
                <div ref={printRef} className="hidden print:block">
                    <LoteResumenPrint lote={lote} totalIncluido={totalIncluido} />
                </div>
            )}

            {mostrarConfirmPromedi && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 print:hidden">
                    <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-gray-200">
                        <div className="px-5 py-4 border-b border-gray-100">
                            <h3 className="text-base font-semibold text-gray-900">Confirmar aplicación de PROMEDI</h3>
                        </div>
                        <div className="px-5 py-4 space-y-3">
                            <p className="text-sm text-gray-700">
                                ¿Aplicar PROMEDI ({porcentajePromedi}%) a los códigos configurados? Los códigos fuera de regla conservan el 100%. Esta acción confirmará el lote.
                            </p>
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

function TablaIPSTxtItems({ items, esPendiente }: { items: LoteIPSTxtItemDetalle[]; esPendiente: boolean }) {
    const totalBruto = items.reduce((s, it) => s + it.impTotal, 0)
    const totalPromedi = items.reduce((s, it) => s + (it.importePromedi ?? 0), 0)

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
            <p className="text-xs text-gray-500 print:hidden">
                PROMEDI aplica solo a códigos alcanzados por regla; los demás quedan al 100%.
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
                        {items.map((it) => (
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
                                    <div className="text-gray-400 font-mono break-all">{it.servicioCodigo}</div>
                                </td>
                                <td className="px-3 py-2 text-center">{it.cantidad}</td>
                                <td className="px-3 py-2 text-right whitespace-nowrap print:text-[8px]">{formatMonto(it.impEsp)}</td>
                                <td className="px-3 py-2 text-right whitespace-nowrap print:text-[8px]">{formatMonto(it.impAyu)}</td>
                                <td className="px-3 py-2 text-right whitespace-nowrap print:text-[8px]">{formatMonto(it.impAne)}</td>
                                <td className="px-3 py-2 text-right whitespace-nowrap print:text-[8px]">{formatMonto(it.impGto)}</td>
                                <td className="px-3 py-2 text-right font-semibold whitespace-nowrap print:text-[8px]">{formatMonto(it.impTotal)}</td>
                                <td className="px-3 py-2 text-right font-semibold text-green-700 whitespace-nowrap print:text-[8px]">
                                    {it.importePromedi !== null ? formatMonto(it.importePromedi) : (
                                        <span className="text-gray-300">—</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {items.length === 0 && (
                            <tr>
                                <td colSpan={11} className="px-3 py-6 text-center text-gray-400">
                                    Sin registros
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
