'use client'

import { useRef, useState } from 'react'
import { Plus, Pill, CheckCircle, XCircle, Clock } from 'lucide-react'
import type { MedicacionItem } from '@/modules/internacion/types'
import { ESTADO_MEDICACION_LABEL } from '@/modules/internacion/types'

interface MedicacionSectionProps {
    ingresoId: number
    medicaciones: MedicacionItem[]
    profesionales: Array<{ id: number; nombre: string }>
    puedeCrear: boolean
    puedeModificar: boolean
}

const ESTADO_ICON: Record<string, React.ReactNode> = {
    A: <CheckCircle className="h-3.5 w-3.5 text-green-500" />,
    S: <XCircle className="h-3.5 w-3.5 text-orange-500" />,
    F: <Clock className="h-3.5 w-3.5 text-gray-400" />,
}

const VIA_OPTIONS = [
    'Oral', 'Intravenosa', 'Intramuscular', 'Subcutánea',
    'Inhalatoria', 'Tópica', 'Sublingual', 'Rectal', 'Otra',
]

export function MedicacionSection({
    ingresoId,
    medicaciones: medicacionesIniciales,
    profesionales,
    puedeCrear,
    puedeModificar,
}: MedicacionSectionProps) {
    const [medicaciones, setMedicaciones] = useState(medicacionesIniciales)
    const [mostrarFormulario, setMostrarFormulario] = useState(false)
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [actualizandoId, setActualizandoId] = useState<number | null>(null)

    // Formulario
    const [nombre, setNombre] = useState('')
    const [dosis, setDosis] = useState('')
    const [via, setVia] = useState('')
    const [frecuencia, setFrecuencia] = useState('')
    const [fechaInicio, setFechaInicio] = useState(new Date().toISOString().split('T')[0])
    const [fechaFin, setFechaFin] = useState('')
    const [observaciones, setObservaciones] = useState('')
    const [profesionalId, setProfesionalId] = useState('')
    const [buscandoCatalogo, setBuscandoCatalogo] = useState(false)
    const [sugerencias, setSugerencias] = useState<Array<{ id: number; nombre: string }>>([])
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const buscarCatalogo = (value: string) => {
        setNombre(value)
        if (debounceRef.current) clearTimeout(debounceRef.current)

        const query = value.trim()
        if (query.length < 2) {
            setSugerencias([])
            return
        }

        debounceRef.current = setTimeout(async () => {
            setBuscandoCatalogo(true)
            try {
                const res = await fetch(`/api/catalogos/medicamentos-uti?q=${encodeURIComponent(query)}&limit=12`)
                const json = await res.json()
                setSugerencias(Array.isArray(json.data) ? json.data : [])
            } catch {
                setSugerencias([])
            } finally {
                setBuscandoCatalogo(false)
            }
        }, 300)
    }

    const limpiar = () => {
        setNombre(''); setDosis(''); setVia(''); setFrecuencia('')
        setFechaInicio(new Date().toISOString().split('T')[0])
        setFechaFin(''); setObservaciones(''); setProfesionalId('')
        setSugerencias([])
        setMostrarFormulario(false)
        setError(null)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setGuardando(true); setError(null)
        try {
            const res = await fetch(`/api/internacion/${ingresoId}/medicaciones`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nombre: nombre.trim(),
                    dosis: dosis || null,
                    viaAdministracion: via || null,
                    frecuencia: frecuencia || null,
                    fechaInicio: fechaInicio ? new Date(fechaInicio).toISOString() : new Date().toISOString(),
                    fechaFin: fechaFin ? new Date(fechaFin).toISOString() : null,
                    observaciones: observaciones || null,
                    profesionalId: profesionalId ? parseInt(profesionalId) : null,
                }),
            })
            if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Error') }
            const { data } = await res.json()
            setMedicaciones([{ ...data, fechaInicio: new Date(data.fechaInicio) }, ...medicaciones])
            limpiar()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error desconocido')
        } finally {
            setGuardando(false)
        }
    }

    const cambiarEstado = async (id: number, estado: 'S' | 'F') => {
        setActualizandoId(id)
        try {
            const res = await fetch(`/api/internacion/${ingresoId}/medicaciones/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado, fechaFin: estado === 'F' ? new Date().toISOString() : null }),
            })
            if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Error') }
            const { data } = await res.json()
            setMedicaciones(medicaciones.map((m) => (m.id === id ? { ...m, ...data } : m)))
        } catch {
            // silently fail — user can retry
        } finally {
            setActualizandoId(null)
        }
    }

    const fmtDate = (d: Date | string | null) =>
        d ? new Date(d).toLocaleDateString('es-AR') : '—'

    const activas = medicaciones.filter((m) => m.estado === 'A')
    const otras = medicaciones.filter((m) => m.estado !== 'A')

    return (
        <div className="his-card">
            <div className="flex items-center justify-between p-4 border-b">
                <div className="flex items-center gap-2">
                    <Pill className="h-4 w-4 text-gray-500" />
                    <h3 className="text-sm font-semibold text-gray-900">Medicaciones</h3>
                    <span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5">
                        {activas.length} activas
                    </span>
                </div>
                {puedeCrear && (
                    <button
                        onClick={() => setMostrarFormulario(!mostrarFormulario)}
                        className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Agregar
                    </button>
                )}
            </div>

            {mostrarFormulario && (
                <form onSubmit={handleSubmit} className="p-4 border-b bg-blue-50/50 space-y-3">
                    {error && (
                        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="sm:col-span-2 relative">
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                Medicamento <span className="text-red-500">*</span>
                            </label>
                            <input
                                required type="text" value={nombre}
                                onChange={(e) => buscarCatalogo(e.target.value)}
                                placeholder="Nombre del medicamento"
                                className="w-full border rounded-lg px-3 py-2 text-sm"
                            />
                            {sugerencias.length > 0 && (
                                <div className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow-sm max-h-40 overflow-y-auto divide-y">
                                    {sugerencias.map((s) => (
                                        <button
                                            key={s.id}
                                            type="button"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => {
                                                setNombre(s.nombre)
                                                setSugerencias([])
                                            }}
                                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                                        >
                                            {s.nombre}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {buscandoCatalogo && (
                                <p className="mt-1 text-xs text-gray-400">Buscando en catálogo UTI...</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Dosis</label>
                            <input
                                type="text" value={dosis}
                                onChange={(e) => setDosis(e.target.value)}
                                placeholder="Ej: 500mg"
                                className="w-full border rounded-lg px-3 py-2 text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Vía de administración</label>
                            <select
                                value={via} onChange={(e) => setVia(e.target.value)}
                                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                            >
                                <option value="">— Seleccionar —</option>
                                {VIA_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Frecuencia</label>
                            <input
                                type="text" value={frecuencia}
                                onChange={(e) => setFrecuencia(e.target.value)}
                                placeholder="Ej: Cada 8hs"
                                className="w-full border rounded-lg px-3 py-2 text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Profesional indicador</label>
                            <select
                                value={profesionalId} onChange={(e) => setProfesionalId(e.target.value)}
                                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                            >
                                <option value="">— Sin asignar —</option>
                                {profesionales.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Fecha inicio</label>
                            <input
                                type="date" required value={fechaInicio}
                                onChange={(e) => setFechaInicio(e.target.value)}
                                className="w-full border rounded-lg px-3 py-2 text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Fecha fin (opcional)</label>
                            <input
                                type="date" value={fechaFin}
                                onChange={(e) => setFechaFin(e.target.value)}
                                className="w-full border rounded-lg px-3 py-2 text-sm"
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Observaciones</label>
                            <input
                                type="text" value={observaciones}
                                onChange={(e) => setObservaciones(e.target.value)}
                                className="w-full border rounded-lg px-3 py-2 text-sm"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={limpiar}
                            className="px-3 py-1.5 text-xs text-gray-600 border rounded-lg hover:bg-gray-50">
                            Cancelar
                        </button>
                        <button type="submit" disabled={guardando}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60">
                            {guardando ? 'Guardando…' : 'Guardar'}
                        </button>
                    </div>
                </form>
            )}

            <div className="divide-y max-h-100 overflow-y-auto">
                {medicaciones.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-8">Sin medicaciones registradas</p>
                ) : (
                    <>
                        {activas.map((med) => (
                            <MedicacionRow
                                key={med.id} med={med} puedeModificar={puedeModificar}
                                actualizando={actualizandoId === med.id}
                                onSuspender={() => cambiarEstado(med.id, 'S')}
                                onFinalizar={() => cambiarEstado(med.id, 'F')}
                                fmtDate={fmtDate}
                            />
                        ))}
                        {otras.length > 0 && (
                            <>
                                <div className="px-4 py-2 bg-gray-50">
                                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Historial</p>
                                </div>
                                {otras.map((med) => (
                                    <MedicacionRow
                                        key={med.id} med={med} puedeModificar={false}
                                        actualizando={false} onSuspender={() => { }} onFinalizar={() => { }}
                                        fmtDate={fmtDate}
                                    />
                                ))}
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}

function MedicacionRow({
    med, puedeModificar, actualizando, onSuspender, onFinalizar, fmtDate,
}: {
    med: MedicacionItem
    puedeModificar: boolean
    actualizando: boolean
    onSuspender: () => void
    onFinalizar: () => void
    fmtDate: (d: Date | string | null) => string
}) {
    return (
        <div className="p-4 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    {ESTADO_ICON[med.estado]}
                    <span className="text-sm font-medium text-gray-900">{med.nombre}</span>
                    {med.dosis && <span className="text-xs text-gray-500">{med.dosis}</span>}
                    {(med.viaAdministracion || med.frecuencia) && (
                        <span className="text-xs text-gray-400">
                            {[med.viaAdministracion, med.frecuencia].filter(Boolean).join(' · ')}
                        </span>
                    )}
                </div>
                <div className="text-xs text-gray-500 flex gap-3">
                    <span>Inicio: {fmtDate(med.fechaInicio)}</span>
                    {med.fechaFin && <span>Fin: {fmtDate(med.fechaFin)}</span>}
                    {med.profesional && <span>Dr. {med.profesional.nombre}</span>}
                </div>
                {med.observaciones && (
                    <p className="text-xs text-gray-500 mt-1 italic">{med.observaciones}</p>
                )}
                <span className={`inline-block mt-1 text-xs px-1.5 py-0.5 rounded ${med.estado === 'A' ? 'bg-green-100 text-green-700' :
                    med.estado === 'S' ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-100 text-gray-500'
                    }`}>
                    {ESTADO_MEDICACION_LABEL[med.estado] ?? med.estado}
                </span>
            </div>
            {puedeModificar && med.estado === 'A' && (
                <div className="flex gap-1 shrink-0">
                    <button
                        onClick={onSuspender} disabled={actualizando}
                        title="Suspender"
                        className="text-xs px-2 py-1 border rounded hover:bg-orange-50 hover:border-orange-300 disabled:opacity-50"
                    >
                        Suspender
                    </button>
                    <button
                        onClick={onFinalizar} disabled={actualizando}
                        title="Finalizar"
                        className="text-xs px-2 py-1 border rounded hover:bg-gray-100 disabled:opacity-50"
                    >
                        Finalizar
                    </button>
                </div>
            )}
        </div>
    )
}
