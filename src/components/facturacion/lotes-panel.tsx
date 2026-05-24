'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { LoteFacturacionListItem, LotePracticaFacturadaProfesionalItem } from '@/modules/facturacion/types'
import { PaginationControls } from '@/components/ui/pagination-controls'
import { Skeleton } from '@/components/ui/skeleton'

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
    const [practicasProfesional, setPracticasProfesional] = useState<LotePracticaFacturadaProfesionalItem[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(false)
    const [mostrarForm, setMostrarForm] = useState(false)
    const [modoInicial, setModoInicial] = useState<'NORMAL' | 'IPS_TXT' | null>(null)

    // Abrir modal IPS directamente si viene con ?nuevo=ips
    useEffect(() => {
        if (searchParams.get('nuevo') === 'ips') {
            setModoInicial('IPS_TXT')
            setMostrarForm(true)
            // Limpiar el query param sin recargar
            const sp = new URLSearchParams(searchParams.toString())
            sp.delete('nuevo')
            router.replace(`${pathname}?${sp.toString()}`, { scroll: false })
        }
        // Solo correr al montar
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const pagina = Math.max(1, Number(searchParams.get('page') ?? searchParams.get('pagina') ?? 1))
    const porPaginaRaw = Math.max(1, Number(searchParams.get('limit') ?? searchParams.get('porPagina') ?? 20))
    const porPagina = PAGE_SIZE_OPTIONS.includes(porPaginaRaw as (typeof PAGE_SIZE_OPTIONS)[number])
        ? porPaginaRaw
        : 20
    const filtroEstado = searchParams.get('estado') ?? ''
    const filtroPeriodo = searchParams.get('periodo') ?? ''
    const filtroTipo = searchParams.get('tipo') ?? ''
    const filtroMedico = searchParams.get('medico') ?? ''
    const filtroMatricula = searchParams.get('matricula') ?? ''
    const modoPracticasProfesional = Boolean(filtroMedico.trim() || filtroMatricula.trim())
    const [draftMedico, setDraftMedico] = useState(filtroMedico)
    const [draftMatricula, setDraftMatricula] = useState(filtroMatricula)

    useEffect(() => {
        setDraftMedico(filtroMedico)
        setDraftMatricula(filtroMatricula)
    }, [filtroMatricula, filtroMedico])

    const updateSearch = useCallback((mutator: (sp: URLSearchParams) => void) => {
        const sp = new URLSearchParams(searchParams.toString())
        mutator(sp)
        if (!sp.get('page')) sp.set('page', '1')
        if (!sp.get('limit')) sp.set('limit', String(porPagina))
        // Limpieza de aliases legacy para evitar contenido duplicado.
        sp.delete('pagina')
        sp.delete('porPagina')
        const href = `${pathname}?${sp.toString()}`
        router.replace(href as never, { scroll: false })
    }, [pathname, porPagina, router, searchParams])

    const aplicarBusquedaProfesional = useCallback(() => {
        updateSearch((sp) => {
            const medico = draftMedico.trim()
            const matricula = draftMatricula.trim()

            if (medico.length >= 2) sp.set('medico', medico)
            else sp.delete('medico')

            if (/^[1-9]\d*$/.test(matricula)) sp.set('matricula', matricula)
            else sp.delete('matricula')

            sp.set('page', '1')
        })
    }, [draftMatricula, draftMedico, updateSearch])

    const limpiarBusquedaProfesional = useCallback(() => {
        setDraftMedico('')
        setDraftMatricula('')
        updateSearch((sp) => {
            sp.delete('medico')
            sp.delete('matricula')
            sp.set('page', '1')
        })
    }, [updateSearch])

    const cargarLotes = useCallback(async () => {
        setLoading(true)
        try {
            const sp = new URLSearchParams({ pagina: String(pagina), porPagina: String(porPagina) })
            if (filtroEstado) sp.set('estado', filtroEstado)
            if (filtroPeriodo) sp.set('periodo', filtroPeriodo)
            if (filtroTipo) sp.set('tipo', filtroTipo)
            if (filtroMedico) sp.set('medico', filtroMedico)
            if (filtroMatricula) sp.set('matricula', filtroMatricula)

            const endpoint = modoPracticasProfesional
                ? '/api/facturacion/lotes/practicas-profesional'
                : '/api/facturacion/lotes'

            const res = await fetch(`${endpoint}?${sp}`)
            if (!res.ok) throw new Error('Error al cargar lotes')
            const json = await res.json()
            if (modoPracticasProfesional) {
                setPracticasProfesional(json.data.items)
                setLotes([])
            } else {
                setLotes(json.data.items)
                setPracticasProfesional([])
            }
            setTotal(json.data.total)
        } catch {
            // silencioso
        } finally {
            setLoading(false)
        }
    }, [filtroEstado, filtroPeriodo, filtroTipo, filtroMedico, filtroMatricula, modoPracticasProfesional, pagina, porPagina])

    useEffect(() => { cargarLotes() }, [cargarLotes])

    const totalPaginas = Math.max(1, Math.ceil(total / porPagina))

    function imprimirResultados() {
        window.print()
    }

    return (
        <div className="p-6 space-y-4">
            {/* Filtros + Nuevo */}
            <div className="flex flex-wrap gap-3 items-end justify-between print:hidden">
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
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Médico</label>
                        <input
                            type="text"
                            value={draftMedico}
                            onChange={(e) => setDraftMedico(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault()
                                    aplicarBusquedaProfesional()
                                }
                            }}
                            placeholder="Nombre del profesional"
                            className="border rounded px-3 py-1.5 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Matrícula</label>
                        <input
                            type="number"
                            min={1}
                            value={draftMatricula}
                            onChange={(e) => setDraftMatricula(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault()
                                    aplicarBusquedaProfesional()
                                }
                            }}
                            placeholder="Ej: 9110"
                            className="border rounded px-3 py-1.5 text-sm w-32"
                        />
                    </div>
                    <div className="flex gap-2 pb-0.5">
                        <button
                            type="button"
                            onClick={aplicarBusquedaProfesional}
                            className="border border-blue-300 bg-blue-50 text-blue-700 px-3 py-1.5 rounded text-sm hover:bg-blue-100"
                        >
                            Buscar profesional
                        </button>
                        {(filtroMedico || filtroMatricula || draftMedico || draftMatricula) && (
                            <button
                                type="button"
                                onClick={limpiarBusquedaProfesional}
                                className="border border-gray-300 px-3 py-1.5 rounded text-sm hover:bg-gray-50"
                            >
                                Limpiar
                            </button>
                        )}
                    </div>
                </div>
                <button
                    onClick={() => setMostrarForm(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700"
                >
                    + Nuevo Lote
                </button>
                {modoPracticasProfesional && (
                    <button
                        onClick={imprimirResultados}
                        className="border border-gray-300 text-gray-700 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50"
                    >
                        Imprimir resultados
                    </button>
                )}
            </div>

            {/* Tabla */}
            <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                    {!modoPracticasProfesional ? (
                        <>
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
                                        <td colSpan={10} className="px-4 py-8">
                                            <Skeleton className="h-8 w-1/2 mx-auto mb-2" />
                                            <Skeleton className="h-6 w-full mb-2" />
                                            <Skeleton className="h-6 w-2/3 mx-auto" />
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
                        </>
                    ) : (
                        <>
                            <thead className="bg-gray-50 text-gray-700">
                                <tr>
                                    <th className="px-4 py-3 text-left font-medium">Lote</th>
                                    <th className="px-4 py-3 text-center font-medium">Estado</th>
                                    <th className="px-4 py-3 text-left font-medium">Período</th>
                                    <th className="px-4 py-3 text-left font-medium">Ingreso</th>
                                    <th className="px-4 py-3 text-left font-medium">Paciente</th>
                                    <th className="px-4 py-3 text-left font-medium">Profesional</th>
                                    <th className="px-4 py-3 text-left font-medium">Fecha Orden</th>
                                    <th className="px-4 py-3 text-left font-medium">Código</th>
                                    <th className="px-4 py-3 text-left font-medium">Descripción</th>
                                    <th className="px-4 py-3 text-center font-medium">Cant.</th>
                                    <th className="px-4 py-3 text-left font-medium">Nro. Aut.</th>
                                    <th className="px-4 py-3 text-right font-medium">Importe</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading && (
                                    <tr>
                                        <td colSpan={12} className="px-4 py-8">
                                            <Skeleton className="h-8 w-1/2 mx-auto mb-2" />
                                            <Skeleton className="h-6 w-full mb-2" />
                                            <Skeleton className="h-6 w-2/3 mx-auto" />
                                        </td>
                                    </tr>
                                )}
                                {!loading && practicasProfesional.length === 0 && (
                                    <tr>
                                        <td colSpan={12} className="px-4 py-8 text-center text-gray-400">
                                            No hay prácticas facturadas para el médico/matrícula indicado
                                        </td>
                                    </tr>
                                )}
                                {!loading && practicasProfesional.map((fila, idx) => {
                                    const est = ESTADO_LABEL[fila.loteEstado] ?? { label: fila.loteEstado, cls: 'bg-gray-100 text-gray-700' }
                                    return (
                                        <tr
                                            key={`${fila.loteId}:${fila.ordenPuestoNumero}:${fila.ordenNumero}:${fila.item}:${idx}`}
                                            className="hover:bg-blue-50 cursor-pointer"
                                            onClick={() => router.push(`/facturacion/lotes/${fila.loteId}`)}
                                        >
                                            <td className="px-4 py-3 font-mono font-semibold text-blue-700">#{fila.loteNumero}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${est.cls}`}>
                                                    {est.label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">{formatPeriodo(fila.lotePeriodo)}</td>
                                            <td className="px-4 py-3 font-mono text-xs">{fila.tipoIngresoCodigo}-{fila.numeroIngreso}</td>
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-gray-800">{fila.paciente?.nombreCompleto ?? '-'}</div>
                                                {fila.paciente?.numeroDocumento && (
                                                    <div className="text-xs text-gray-500">DNI {fila.paciente.numeroDocumento.toLocaleString('es-AR')}</div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="text-gray-800">{fila.profesional?.nombre ?? '-'}</div>
                                                <div className="text-xs text-gray-500">Matrícula: {fila.profesional?.matricula ?? '-'}</div>
                                            </td>
                                            <td className="px-4 py-3">{new Date(fila.ordenFechaEmision).toLocaleDateString('es-AR')}</td>
                                            <td className="px-4 py-3 font-mono">{fila.codigoPractica}</td>
                                            <td className="px-4 py-3 text-gray-600">{fila.descripcionPractica ?? '-'}</td>
                                            <td className="px-4 py-3 text-center">{fila.cantidad}</td>
                                            <td className="px-4 py-3 text-blue-600">{fila.numeroAutorizacion ?? '—'}</td>
                                            <td className="px-4 py-3 text-right font-semibold">{formatMonto(fila.importeTotal)}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </>
                    )}
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
                <SeleccionTipoLoteModal
                    modoInicial={modoInicial}
                    onClose={() => { setMostrarForm(false); setModoInicial(null) }}
                    onCreado={(id) => {
                        setMostrarForm(false)
                        setModoInicial(null)
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

// ============================================================
// Selección de tipo de lote (Normal vs IPS TXT)
// ============================================================

interface SeleccionTipoLoteModalProps {
    modoInicial?: 'NORMAL' | 'IPS_TXT' | null
    onClose: () => void
    onCreado: (id: number) => void
}

function SeleccionTipoLoteModal({ modoInicial, onClose, onCreado }: SeleccionTipoLoteModalProps) {
    const [modo, setModo] = useState<'NORMAL' | 'IPS_TXT' | null>(modoInicial ?? null)

    if (modo === 'NORMAL') return <CrearLoteModal onClose={onClose} onCreado={onCreado} />
    if (modo === 'IPS_TXT') return <CrearLoteIPSTxtModal onClose={onClose} onCreado={onCreado} />

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl space-y-4">
                <h2 className="text-lg font-semibold text-gray-800">Nuevo Lote</h2>
                <p className="text-sm text-gray-600">¿Qué tipo de lote querés crear?</p>
                <div className="grid grid-cols-2 gap-3">
                    <button
                        onClick={() => setModo('NORMAL')}
                        className="flex flex-col items-center gap-2 rounded-lg border-2 border-gray-200 p-4 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                    >
                        <span className="text-2xl">📋</span>
                        <span className="text-sm font-medium text-gray-800">Lote Normal</span>
                        <span className="text-xs text-gray-500 text-center">Prácticas / Medicamentos del sistema</span>
                    </button>
                    <button
                        onClick={() => setModo('IPS_TXT')}
                        className="flex flex-col items-center gap-2 rounded-lg border-2 border-gray-200 p-4 hover:border-green-400 hover:bg-green-50 transition-colors"
                    >
                        <span className="text-2xl">📄</span>
                        <span className="text-sm font-medium text-gray-800">Planilla IPS</span>
                        <span className="text-xs text-gray-500 text-center">Importar TXT exportado desde IPS</span>
                    </button>
                </div>
                <div className="flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 border rounded text-sm">Cancelar</button>
                </div>
            </div>
        </div>
    )
}

// ============================================================
// Modal IPS TXT
// ============================================================

interface CrearLoteIPSTxtModalProps {
    onClose: () => void
    onCreado: (id: number) => void
}

interface IPSTxtItem {
    afiliadoDoc: string
    afiliadoNom: string
    nroOrden: string
    fechaRealiz: string | null
    servicioCodigo: string
    servicioNombre: string
    cantidad: number
    impEsp: number
    impAyu: number
    impAne: number
    impGto: number
    impTotal: number
}

function parsearTxtIPS(contenido: string): IPSTxtItem[] {
    const lineas = contenido.split(/\r?\n/).filter((l) => l.trim())
    // Saltar header
    const dataLineas = lineas.length > 0 && (lineas[0] ?? '').startsWith('NroPlanilla') ? lineas.slice(1) : lineas

    return dataLineas
        .map((linea) => {
            const cols = linea.split(';')
            // Indices según formato IPS TXT (0-indexed):
            // 8=NroOrden 10=FechaRealiz 14=AfiliadoDoc 15=AfiliadoNom
            // 16=ServicioCodigo 17=ServicioNombre 18=Cantidad
            // 19=ImpEsp 20=ImpAyu 21=ImpAne 22=ImpGto 23=ImpTotal
            const parseMoney = (v: string | undefined) => parseFloat((v ?? '0').replace(',', '.')) || 0
            const parseCant = (v: string | undefined) => (v ? (Number(v.trim()) || 1) : 1)
            const parseDate = (v: string | undefined) => {
                if (!v || !v.trim()) return null
                const trimmed = v.trim()
                // Formato: DD/MM/YYYY HH:MM:SS a.m./p.m.  o  DD/MM/YYYY
                if (trimmed.includes('/')) {
                    const parts = trimmed.split('/')
                    if (parts.length >= 3) {
                        const d = (parts[0] ?? '').padStart(2, '0')
                        const m = (parts[1] ?? '').padStart(2, '0')
                        const y = (parts[2] ?? '').split(' ')[0] // recortar parte de hora
                        if (d && m && y && y.length === 4) {
                            const iso = `${y}-${m}-${d}`
                            if (!isNaN(new Date(iso).getTime())) return iso
                        }
                    }
                }
                // Formato YYYY-MM-DD
                if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10)
                return null
            }
            return {
                nroOrden: cols[8]?.trim() ?? '',
                fechaRealiz: parseDate(cols[10]?.trim()),
                afiliadoDoc: cols[14]?.trim() ?? '',
                afiliadoNom: cols[15]?.trim() ?? '',
                servicioCodigo: cols[16]?.trim() ?? '',
                servicioNombre: cols[17]?.trim() ?? '',
                cantidad: parseCant(cols[18]),
                impEsp: parseMoney(cols[19]),
                impAyu: parseMoney(cols[20]),
                impAne: parseMoney(cols[21]),
                impGto: parseMoney(cols[22]),
                impTotal: parseMoney(cols[23]),
            } satisfies IPSTxtItem
        })
        .filter((it) => it.afiliadoDoc || it.servicioCodigo)
}

function CrearLoteIPSTxtModal({ onClose, onCreado }: CrearLoteIPSTxtModalProps) {
    const hoy = new Date().toISOString().slice(0, 10)
    const periodoActual = new Date().toISOString().slice(0, 7)

    const [form, setForm] = useState({ fecha: hoy, periodo: periodoActual, descripcion: '' })
    const [items, setItems] = useState<IPSTxtItem[]>([])
    const [fileName, setFileName] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

    function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        setFileName(file.name)
        const reader = new FileReader()
        reader.onload = (ev) => {
            const text = ev.target?.result as string
            const parsed = parsearTxtIPS(text)
            setItems(parsed)
            if (parsed.length === 0) setError('No se encontraron registros en el archivo.')
            else setError('')
        }
        reader.readAsText(file, 'latin1')
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError('')
        if (items.length === 0) { setError('Primero cargá el archivo TXT'); return }

        setLoading(true)
        try {
            const body = {
                fecha: new Date(form.fecha).toISOString(),
                periodo: form.periodo,
                descripcion: form.descripcion || null,
                items,
            }
            const res = await fetch('/api/facturacion/lotes/ips-txt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const json = await res.json()
            if (!res.ok || !json.ok) { setError(json.error ?? 'Error al crear el lote'); return }
            onCreado(json.data.id)
        } catch {
            setError('Error de conexión')
        } finally {
            setLoading(false)
        }
    }

    const totalBruto = items.reduce((s, it) => s + it.impTotal, 0)

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-6">
            <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-800">Importar Planilla IPS (TXT)</h2>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">IPS</span>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
                            <input type="date" value={form.fecha} onChange={(e) => set('fecha', e.target.value)} required className="w-full border rounded px-3 py-1.5 text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Período</label>
                            <input type="month" value={form.periodo} onChange={(e) => set('periodo', e.target.value)} required className="w-full border rounded px-3 py-1.5 text-sm" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Descripción (opcional)</label>
                        <input type="text" maxLength={200} value={form.descripcion} onChange={(e) => set('descripcion', e.target.value)} className="w-full border rounded px-3 py-1.5 text-sm" />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Archivo TXT (planilla IPS)</label>
                        <input type="file" accept=".txt,.csv" onChange={handleFile} className="w-full border rounded px-3 py-1.5 text-sm file:mr-2 file:py-1 file:px-2 file:border-0 file:bg-blue-50 file:text-blue-700 file:text-xs file:rounded" />
                        {fileName && <p className="text-xs text-gray-500 mt-1">Archivo: {fileName}</p>}
                    </div>

                    {items.length > 0 && (
                        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm space-y-1">
                            <p className="font-medium text-blue-800">Vista previa</p>
                            <p className="text-blue-700">{items.length} registros cargados</p>
                            <p className="text-blue-700">Importe total bruto: <span className="font-semibold">{new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(totalBruto)}</span></p>
                            <p className="text-xs text-blue-600">Al aplicar PROMEDI se calculará el 40% solo para los códigos alcanzados por la regla; el resto quedará al 100%.</p>
                        </div>
                    )}

                    {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>}

                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 border rounded text-sm">Cancelar</button>
                        <button type="submit" disabled={loading || items.length === 0} className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                            {loading ? 'Creando...' : 'Crear Lote Pendiente'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
