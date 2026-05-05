'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { LoteFacturacionListItem } from '@/modules/facturacion/types'
import { PaginationControls } from '@/components/ui/pagination-controls'

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const

const ESTADO_LABEL: Record<string, { label: string; cls: string }> = {
    PEN: { label: 'Pendiente', cls: 'bg-yellow-100 text-yellow-800' },
    CON: { label: 'Confirmado', cls: 'bg-green-100 text-green-800' },
    ANU: { label: 'Anulado', cls: 'bg-red-100 text-red-800' },
}

const TIPO_LABEL: Record<string, string> = {
    PRACTICAS: 'Prácticas',
    MEDICAMENTOS: 'Medicamentos',
}

function formatPeriodo(periodo: string) {
    const [anio, mes] = periodo.split('-')
    if (!anio || !mes) return periodo
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    return `${meses[parseInt(mes, 10) - 1]} ${anio}`
}

function formatMonto(n: number) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)
}

export function LotesPanel() {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [lotes, setLotes] = useState<LoteFacturacionListItem[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(false)
    const [mostrarForm, setMostrarForm] = useState(false)

    const pagina = Math.max(1, Number(searchParams.get('page') ?? searchParams.get('pagina') ?? 1))
    const porPaginaRaw = Math.max(1, Number(searchParams.get('limit') ?? searchParams.get('porPagina') ?? 20))
    const porPagina = PAGE_SIZE_OPTIONS.includes(porPaginaRaw as (typeof PAGE_SIZE_OPTIONS)[number])
        ? porPaginaRaw
        : 20
    const filtroEstado = searchParams.get('estado') ?? ''
    const filtroPeriodo = searchParams.get('periodo') ?? ''
    const filtroTipo = searchParams.get('tipo') ?? ''

    const updateSearch = useCallback((mutator: (sp: URLSearchParams) => void) => {
        const sp = new URLSearchParams(searchParams.toString())
        mutator(sp)
        if (!sp.get('page')) sp.set('page', '1')
        if (!sp.get('limit')) sp.set('limit', String(porPagina))
        // Limpieza de aliases legacy para evitar contenido duplicado.
        sp.delete('pagina')
        sp.delete('porPagina')
        const href = `${pathname}?${sp.toString()}`
        router.push(href as never, { scroll: false })
    }, [pathname, porPagina, router, searchParams])

    const cargarLotes = useCallback(async () => {
        setLoading(true)
        try {
            const sp = new URLSearchParams({ pagina: String(pagina), porPagina: String(porPagina) })
            if (filtroEstado) sp.set('estado', filtroEstado)
            if (filtroPeriodo) sp.set('periodo', filtroPeriodo)
            if (filtroTipo) sp.set('tipo', filtroTipo)

            const res = await fetch(`/api/facturacion/lotes?${sp}`)
            if (!res.ok) throw new Error('Error al cargar lotes')
            const json = await res.json()
            setLotes(json.data.items)
            setTotal(json.data.total)
        } catch {
            // silencioso
        } finally {
            setLoading(false)
        }
    }, [filtroEstado, filtroPeriodo, filtroTipo, pagina, porPagina])

    useEffect(() => { cargarLotes() }, [cargarLotes])

    const totalPaginas = Math.max(1, Math.ceil(total / porPagina))

    return (
        <div className="p-6 space-y-4">
            {/* Filtros + Nuevo */}
            <div className="flex flex-wrap gap-3 items-end justify-between">
                <div className="flex flex-wrap gap-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Período</label>
                        <input
                            type="month"
                            value={filtroPeriodo}
                            onChange={(e) => {
                                const value = e.target.value
                                updateSearch((sp) => {
                                    if (value) sp.set('periodo', value)
                                    else sp.delete('periodo')
                                    sp.set('page', '1')
                                })
                            }}
                            className="border rounded px-3 py-1.5 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
                        <select
                            value={filtroEstado}
                            onChange={(e) => {
                                const value = e.target.value
                                updateSearch((sp) => {
                                    if (value) sp.set('estado', value)
                                    else sp.delete('estado')
                                    sp.set('page', '1')
                                })
                            }}
                            className="border rounded px-3 py-1.5 text-sm"
                        >
                            <option value="">Todos</option>
                            <option value="PEN">Pendiente</option>
                            <option value="CON">Confirmado</option>
                            <option value="ANU">Anulado</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                        <select
                            value={filtroTipo}
                            onChange={(e) => {
                                const value = e.target.value
                                updateSearch((sp) => {
                                    if (value) sp.set('tipo', value)
                                    else sp.delete('tipo')
                                    sp.set('page', '1')
                                })
                            }}
                            className="border rounded px-3 py-1.5 text-sm"
                        >
                            <option value="">Todos</option>
                            <option value="PRACTICAS">Prácticas</option>
                            <option value="MEDICAMENTOS">Medicamentos</option>
                        </select>
                    </div>
                </div>
                <button
                    onClick={() => setMostrarForm(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700"
                >
                    + Nuevo Lote
                </button>
            </div>

            {/* Tabla */}
            <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-700">
                        <tr>
                            <th className="px-4 py-3 text-left font-medium">Nro</th>
                            <th className="px-4 py-3 text-left font-medium">Fecha</th>
                            <th className="px-4 py-3 text-left font-medium">Sede</th>
                            <th className="px-4 py-3 text-left font-medium">Período</th>
                            <th className="px-4 py-3 text-left font-medium">Tipo</th>
                            <th className="px-4 py-3 text-left font-medium">Cliente</th>
                            <th className="px-4 py-3 text-left font-medium">Concepto</th>
                            <th className="px-4 py-3 text-left font-medium">Descripción</th>
                            <th className="px-4 py-3 text-right font-medium">Importe Total</th>
                            <th className="px-4 py-3 text-center font-medium">Estado</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading && (
                            <tr>
                                <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                                    Cargando...
                                </td>
                            </tr>
                        )}
                        {!loading && lotes.length === 0 && (
                            <tr>
                                <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                                    No hay lotes registrados
                                </td>
                            </tr>
                        )}
                        {!loading && lotes.map((lote) => {
                            const est = ESTADO_LABEL[lote.estado] ?? { label: lote.estado, cls: 'bg-gray-100 text-gray-700' }
                            return (
                                <tr
                                    key={lote.id}
                                    className="hover:bg-blue-50 cursor-pointer"
                                    onClick={() => router.push(`/facturacion/lotes/${lote.id}`)}
                                >
                                    <td className="px-4 py-3 font-mono font-semibold text-blue-700">
                                        #{lote.numero}
                                    </td>
                                    <td className="px-4 py-3">
                                        {new Date(lote.fecha).toLocaleDateString('es-AR')}
                                    </td>
                                    <td className="px-4 py-3">{lote.sedeId ?? '-'}</td>
                                    <td className="px-4 py-3">{formatPeriodo(lote.periodo)}</td>
                                    <td className="px-4 py-3">{TIPO_LABEL[lote.tipo] ?? lote.tipo}</td>
                                    <td className="px-4 py-3">
                                        {lote.obraSocial?.nombre ?? <span className="text-gray-400">Particular</span>}
                                        {lote.plan && (
                                            <span className="block text-xs text-gray-500">{lote.plan.descripcion}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-gray-600">{lote.concepto ?? '-'}</td>
                                    <td className="px-4 py-3 text-gray-600">{lote.descripcion ?? '-'}</td>
                                    <td className="px-4 py-3 text-right font-semibold">
                                        {formatMonto(lote.importeTotal)}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${est.cls}`}>
                                            {est.label}
                                        </span>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            <PaginationControls
                currentPage={Math.min(pagina, totalPaginas)}
                totalPages={totalPaginas}
                totalItems={total}
                pageSize={porPagina}
                allowedPageSizes={PAGE_SIZE_OPTIONS as unknown as number[]}
                pageParam="page"
                pageSizeParam="limit"
            />

            {/* Modal crear lote */}
            {mostrarForm && (
                <CrearLoteModal
                    onClose={() => setMostrarForm(false)}
                    onCreado={(id) => {
                        setMostrarForm(false)
                        router.push(`/facturacion/lotes/${id}`)
                    }}
                />
            )}
        </div>
    )
}

// ============================================================
// Modal de creación de lote
// ============================================================

interface CrearLoteModalProps {
    onClose: () => void
    onCreado: (id: number) => void
}

function CrearLoteModal({ onClose, onCreado }: CrearLoteModalProps) {
    const hoy = new Date().toISOString().slice(0, 10)
    const periodoActual = new Date().toISOString().slice(0, 7)

    const [form, setForm] = useState({
        fecha: hoy,
        periodo: periodoActual,
        tipo: 'PRACTICAS',
        clienteTipo: 'OBRA_SOCIAL',
        obraSocialId: '',
        planId: '',
        tipoIngresoCodigo: '',
        rangoDesde: '',
        rangoHasta: '',
        sedeId: '',
        descripcion: '',
        concepto: '',
    })
    const [obrasSociales, setObrasSociales] = useState<Array<{ id: number; nombre: string }>>([])
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        fetch('/api/facturacion/obras-sociales?porPagina=300')
            .then((r) => r.json())
            .then((j) => setObrasSociales(j.data?.items ?? j.data ?? []))
            .catch(() => { })
    }, [])

    const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError('')
        if (form.clienteTipo === 'OBRA_SOCIAL' && !form.obraSocialId) {
            setError('Seleccioná una obra social para continuar')
            return
        }
        setLoading(true)
        try {
            const body: Record<string, unknown> = {
                fecha: new Date(form.fecha).toISOString(),
                periodo: form.periodo,
                tipo: form.tipo,
                clienteTipo: form.clienteTipo,
                obraSocialId: form.clienteTipo === 'OBRA_SOCIAL' && form.obraSocialId ? Number(form.obraSocialId) : null,
                planId: form.planId ? Number(form.planId) : null,
                tipoIngresoCodigo: form.tipoIngresoCodigo || null,
                rangoDesde: form.rangoDesde ? Number(form.rangoDesde) : null,
                rangoHasta: form.rangoHasta ? Number(form.rangoHasta) : null,
                sedeId: form.sedeId ? Number(form.sedeId) : null,
                descripcion: form.descripcion || null,
                concepto: form.concepto || null,
            }
            const res = await fetch('/api/facturacion/lotes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const json = await res.json()
            if (!res.ok || !json.ok) {
                setError(json.error ?? 'Error al crear el lote')
                return
            }
            onCreado(json.data.id)
        } catch {
            setError('Error de conexión')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-6">
            <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-5 shadow-xl">
                <h2 className="text-lg font-semibold text-gray-800">Nuevo Lote de Facturación</h2>

                <form onSubmit={handleSubmit} className="max-h-[80vh] space-y-3 overflow-y-auto pr-1">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
                            <input
                                type="date"
                                value={form.fecha}
                                onChange={(e) => set('fecha', e.target.value)}
                                required
                                className="w-full border rounded px-3 py-1.5 text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Período</label>
                            <input
                                type="month"
                                value={form.periodo}
                                onChange={(e) => set('periodo', e.target.value)}
                                required
                                className="w-full border rounded px-3 py-1.5 text-sm"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de Lote</label>
                        <select
                            value={form.tipo}
                            onChange={(e) => set('tipo', e.target.value)}
                            className="w-full border rounded px-3 py-1.5 text-sm"
                        >
                            <option value="PRACTICAS">Prácticas</option>
                            <option value="MEDICAMENTOS">Medicamentos</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Cliente</label>
                        <select
                            value={form.clienteTipo}
                            onChange={(e) => set('clienteTipo', e.target.value)}
                            className="w-full border rounded px-3 py-1.5 text-sm"
                        >
                            <option value="OBRA_SOCIAL">Obra social</option>
                            <option value="PARTICULAR">Particular</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                            Cliente (Obra Social)
                        </label>
                        <select
                            value={form.obraSocialId}
                            onChange={(e) => set('obraSocialId', e.target.value)}
                            disabled={form.clienteTipo !== 'OBRA_SOCIAL'}
                            className="w-full border rounded px-3 py-1.5 text-sm"
                        >
                            <option value="">Seleccionar obra social</option>
                            {obrasSociales.map((os) => (
                                <option key={os.id} value={os.id}>
                                    {os.nombre}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Sede (ID)</label>
                        <input
                            type="number"
                            value={form.sedeId}
                            onChange={(e) => set('sedeId', e.target.value)}
                            className="w-full border rounded px-3 py-1.5 text-sm"
                            placeholder="Opcional"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                            Filtrar por Tipo de Ingreso
                        </label>
                        <input
                            type="text"
                            maxLength={3}
                            placeholder="Ej: AMB, INT, URG..."
                            value={form.tipoIngresoCodigo}
                            onChange={(e) => set('tipoIngresoCodigo', e.target.value.toUpperCase())}
                            className="w-full border rounded px-3 py-1.5 text-sm"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                            Rango de Nro. de Ingreso (opcional)
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <input
                                type="number"
                                placeholder="Desde"
                                value={form.rangoDesde}
                                onChange={(e) => set('rangoDesde', e.target.value)}
                                className="w-full border rounded px-3 py-1.5 text-sm"
                            />
                            <input
                                type="number"
                                placeholder="Hasta"
                                value={form.rangoHasta}
                                onChange={(e) => set('rangoHasta', e.target.value)}
                                className="w-full border rounded px-3 py-1.5 text-sm"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Concepto</label>
                        <input
                            type="text"
                            maxLength={200}
                            value={form.concepto}
                            onChange={(e) => set('concepto', e.target.value)}
                            className="w-full border rounded px-3 py-1.5 text-sm"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
                        <textarea
                            maxLength={500}
                            value={form.descripcion}
                            onChange={(e) => set('descripcion', e.target.value)}
                            rows={2}
                            className="w-full border rounded px-3 py-1.5 text-sm resize-none"
                        />
                    </div>

                    {error && (
                        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
                            {error}
                        </p>
                    )}

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 border rounded text-sm"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                        >
                            {loading ? 'Creando...' : 'Crear Lote'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
