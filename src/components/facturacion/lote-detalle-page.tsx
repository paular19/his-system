'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { LoteFacturacionDetalle, LoteFacturacionItemDetalle, OrdenAutorizadaLote } from '@/modules/facturacion/types'
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
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
    return `${meses[parseInt(mes) - 1]} ${anio}`
}

interface Props { loteId: number }

export function LoteDetallePage({ loteId }: Props) {
    const router = useRouter()
    const [lote, setLote] = useState<LoteFacturacionDetalle | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [selectedIngresoId, setSelectedIngresoId] = useState<number | null>(null)
    const [ordenes, setOrdenes] = useState<OrdenAutorizadaLote[]>([])
    const [loadingOrdenes, setLoadingOrdenes] = useState(false)
    const [procesando, setProcesando] = useState(false)
    const [editando, setEditando] = useState(false)
    const [formEdit, setFormEdit] = useState({
        fecha: '',
        periodo: '',
        descripcion: '',
        concepto: '',
        sedeId: '',
        tipoIngresoCodigo: '',
        rangoDesde: '',
        rangoHasta: '',
    })
    const [mostrarImpresion, setMostrarImpresion] = useState(false)
    const printRef = useRef<HTMLDivElement>(null)

    const cargar = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/facturacion/lotes/${loteId}`)
            const json = await res.json()
            if (!res.ok || !json.ok) { setError(json.error ?? 'Error'); return }
            setLote(json.data)
            setFormEdit({
                fecha: new Date(json.data.fecha).toISOString().slice(0, 10),
                periodo: json.data.periodo,
                descripcion: json.data.descripcion ?? '',
                concepto: json.data.concepto ?? '',
                sedeId: json.data.sedeId ? String(json.data.sedeId) : '',
                tipoIngresoCodigo: json.data.tipoIngresoCodigo ?? '',
                rangoDesde: json.data.rangoDesde ? String(json.data.rangoDesde) : '',
                rangoHasta: json.data.rangoHasta ? String(json.data.rangoHasta) : '',
            })
        } catch {
            setError('Error de conexión')
        } finally {
            setLoading(false)
        }
    }, [loteId])

    useEffect(() => { cargar() }, [cargar])

    async function cargarOrdenes(ingresoId: number) {
        setSelectedIngresoId(ingresoId)
        setLoadingOrdenes(true)
        try {
            const res = await fetch(`/api/facturacion/lotes/ingreso/${ingresoId}/ordenes`)
            const json = await res.json()
            setOrdenes(json.data ?? [])
        } catch {
            setOrdenes([])
        } finally {
            setLoadingOrdenes(false)
        }
    }

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

    async function guardarEdicion() {
        setProcesando(true)
        try {
            await fetch(`/api/facturacion/lotes/${loteId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fecha: formEdit.fecha ? new Date(formEdit.fecha).toISOString() : undefined,
                    periodo: formEdit.periodo || undefined,
                    descripcion: formEdit.descripcion || null,
                    concepto: formEdit.concepto || null,
                    sedeId: formEdit.sedeId ? Number(formEdit.sedeId) : null,
                    tipoIngresoCodigo: formEdit.tipoIngresoCodigo || null,
                    rangoDesde: formEdit.rangoDesde ? Number(formEdit.rangoDesde) : null,
                    rangoHasta: formEdit.rangoHasta ? Number(formEdit.rangoHasta) : null,
                }),
            })
            setEditando(false)
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
    const itemsIncluidos = lote.items.filter((it) => it.incluido)
    const totalIncluido = itemsIncluidos.reduce((s, it) => s + it.importeTotal, 0)

    return (
        <div className="p-6 space-y-5 print:p-0">
            {/* Encabezado */}
            <div className="bg-white rounded-lg border border-gray-200 p-5 print:border-0 print:shadow-none">
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
                        {esPendiente && (
                            <>
                                <button
                                    onClick={() => setEditando(!editando)}
                                    className="border border-gray-300 px-3 py-1.5 rounded text-sm hover:bg-gray-50"
                                >
                                    ✏️ Editar
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
                        <button
                            onClick={() => router.back()}
                            className="border border-gray-300 px-3 py-1.5 rounded text-sm hover:bg-gray-50"
                        >
                            ← Volver
                        </button>
                    </div>
                </div>

                {/* Concepto / Descripción */}
                {editando ? (
                    <div className="mt-4 space-y-2 print:hidden">
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
                                <input
                                    type="date"
                                    value={formEdit.fecha}
                                    onChange={(e) => setFormEdit((f) => ({ ...f, fecha: e.target.value }))}
                                    className="w-full border rounded px-3 py-1.5 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Período</label>
                                <input
                                    type="month"
                                    value={formEdit.periodo}
                                    onChange={(e) => setFormEdit((f) => ({ ...f, periodo: e.target.value }))}
                                    className="w-full border rounded px-3 py-1.5 text-sm"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-4 gap-2">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Sede ID</label>
                                <input
                                    type="number"
                                    value={formEdit.sedeId}
                                    onChange={(e) => setFormEdit((f) => ({ ...f, sedeId: e.target.value }))}
                                    className="w-full border rounded px-3 py-1.5 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo Ingreso</label>
                                <input
                                    type="text"
                                    maxLength={3}
                                    value={formEdit.tipoIngresoCodigo}
                                    onChange={(e) => setFormEdit((f) => ({ ...f, tipoIngresoCodigo: e.target.value.toUpperCase() }))}
                                    className="w-full border rounded px-3 py-1.5 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Rango Desde</label>
                                <input
                                    type="number"
                                    value={formEdit.rangoDesde}
                                    onChange={(e) => setFormEdit((f) => ({ ...f, rangoDesde: e.target.value }))}
                                    className="w-full border rounded px-3 py-1.5 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Rango Hasta</label>
                                <input
                                    type="number"
                                    value={formEdit.rangoHasta}
                                    onChange={(e) => setFormEdit((f) => ({ ...f, rangoHasta: e.target.value }))}
                                    className="w-full border rounded px-3 py-1.5 text-sm"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Concepto</label>
                            <input
                                type="text"
                                value={formEdit.concepto}
                                onChange={(e) => setFormEdit((f) => ({ ...f, concepto: e.target.value }))}
                                className="w-full border rounded px-3 py-1.5 text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
                            <textarea
                                value={formEdit.descripcion}
                                onChange={(e) => setFormEdit((f) => ({ ...f, descripcion: e.target.value }))}
                                rows={2}
                                className="w-full border rounded px-3 py-1.5 text-sm resize-none"
                            />
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={guardarEdicion}
                                disabled={procesando}
                                className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
                            >
                                Guardar
                            </button>
                            <button
                                onClick={() => setEditando(false)}
                                className="border px-3 py-1.5 rounded text-sm"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="mt-3 space-y-1 text-sm text-gray-600">
                        {lote.concepto && <div><strong>Concepto:</strong> {lote.concepto}</div>}
                        {lote.descripcion && <div><strong>Descripción:</strong> {lote.descripcion}</div>}
                    </div>
                )}

                {/* Resumen numérico */}
                <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-4 text-sm">
                    <div className="text-center">
                        <div className="text-2xl font-bold text-blue-700">{lote.items.length}</div>
                        <div className="text-gray-500">Pacientes en lote</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold text-green-700">{itemsIncluidos.length}</div>
                        <div className="text-gray-500">A facturar</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold text-gray-800">{formatMonto(totalIncluido)}</div>
                        <div className="text-gray-500">Total a facturar</div>
                    </div>
                </div>
            </div>

            {/* Tabla de pacientes */}
            <div className="grid grid-cols-12 gap-4">
                <div className={`${selectedIngresoId ? 'col-span-5' : 'col-span-12'} space-y-2`}>
                    <h3 className="text-sm font-semibold text-gray-700">Pacientes del Lote</h3>
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
                                                    <th className="px-4 py-1.5 text-left">Práctica</th>
                                                    <th className="px-4 py-1.5 text-left">Descripción</th>
                                                    <th className="px-4 py-1.5 text-center">Cant.</th>
                                                    <th className="px-4 py-1.5 text-left">Nro. Aut.</th>
                                                    <th className="px-4 py-1.5 text-right">Importe</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {orden.items.map((it) => (
                                                    <tr key={it.item}>
                                                        <td className="px-4 py-1.5 font-mono">{it.codigoPractica}</td>
                                                        <td className="px-4 py-1.5 text-gray-600">{it.descripcion ?? '-'}</td>
                                                        <td className="px-4 py-1.5 text-center">{it.cantidad}</td>
                                                        <td className="px-4 py-1.5 text-blue-600">{it.numeroAutorizacion ?? '—'}</td>
                                                        <td className="px-4 py-1.5 text-right">{formatMonto(it.importeTotal)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Vista de impresión oculta */}
            <div ref={printRef} className="hidden print:block">
                <LoteResumenPrint lote={lote} totalIncluido={totalIncluido} />
            </div>
        </div>
    )
}
