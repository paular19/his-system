'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Save, X } from 'lucide-react'

type DiagnosticoItem = {
    id: number
    patologiaId: number | null
    descripcion: string | null
    observaciones: string | null
    estado: string
    fecha: Date | string
    fechaEstado: Date | string
    usuario: string
}

interface DiagnosticosSectionProps {
    ingresoId: number
    descripcionPatologia: string | null
    diagnosticos: DiagnosticoItem[]
    puedeModificar: boolean
}

export function DiagnosticosSection({
    ingresoId,
    descripcionPatologia,
    diagnosticos: diagnosticosIniciales,
    puedeModificar,
}: DiagnosticosSectionProps) {
    const router = useRouter()
    const [diagnosticos, setDiagnosticos] = useState<DiagnosticoItem[]>(diagnosticosIniciales)
    const [mostrarForm, setMostrarForm] = useState(false)
    const [editandoId, setEditandoId] = useState<number | null>(null)
    const [descripcion, setDescripcion] = useState('')
    const [observaciones, setObservaciones] = useState('')
    const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 16))
    const [estado, setEstado] = useState<'A' | 'I'>('A')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const limpiarForm = () => {
        setEditandoId(null)
        setDescripcion('')
        setObservaciones('')
        setFecha(new Date().toISOString().slice(0, 16))
        setEstado('A')
        setMostrarForm(false)
        setError(null)
    }

    const editarDiagnostico = (diagnostico: DiagnosticoItem) => {
        setEditandoId(diagnostico.id)
        setDescripcion(diagnostico.descripcion ?? '')
        setObservaciones(diagnostico.observaciones ?? '')
        setFecha(new Date(diagnostico.fecha).toISOString().slice(0, 16))
        setEstado(diagnostico.estado === 'I' ? 'I' : 'A')
        setMostrarForm(true)
        setError(null)
    }

    const guardar = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const descripcionLimpia = descripcion.trim()
        if (!descripcionLimpia) {
            setError('La descripción es requerida')
            return
        }

        setGuardando(true)
        setError(null)

        try {
            const payload = {
                ingresoId,
                descripcion: descripcionLimpia,
                observaciones: observaciones.trim() || null,
                fecha: new Date(fecha).toISOString(),
                estado,
            }

            const res = await fetch(
                editandoId
                    ? `/api/internacion/${ingresoId}/diagnosticos/${editandoId}`
                    : `/api/admision/${ingresoId}/diagnostico`,
                {
                    method: editandoId ? 'PUT' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                }
            )

            const json = await res.json()
            if (!res.ok || !json.ok) {
                throw new Error(json.error ?? 'Error al guardar el diagnóstico')
            }

            const diagnosticoNuevo = json.data as DiagnosticoItem
            setDiagnosticos((prev) =>
                editandoId
                    ? prev.map((item) => (item.id === editandoId ? diagnosticoNuevo : item))
                    : [diagnosticoNuevo, ...prev]
            )
            router.refresh()
            limpiarForm()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error inesperado')
        } finally {
            setGuardando(false)
        }
    }

    return (
        <div className="his-card p-4">
            <div className="flex items-center justify-between mb-3">
                <div>
                    <h3 className="text-sm font-semibold text-gray-900">Diagnósticos</h3>
                    {descripcionPatologia && (
                        <p className="mt-1 text-xs text-gray-500 italic">Presuntivo: {descripcionPatologia}</p>
                    )}
                </div>
                {puedeModificar && (
                    <button
                        type="button"
                        onClick={() => {
                            setEditandoId(null)
                            setDescripcion('')
                            setObservaciones('')
                            setFecha(new Date().toISOString().slice(0, 16))
                            setEstado('A')
                            setMostrarForm((v) => !v)
                            setError(null)
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Agregar diagnóstico
                    </button>
                )}
            </div>

            {mostrarForm && puedeModificar && (
                <form onSubmit={guardar} className="mb-4 rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Descripción</label>
                            <textarea
                                required
                                rows={3}
                                value={descripcion}
                                onChange={(e) => setDescripcion(e.target.value)}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none"
                                placeholder="Registrar o actualizar diagnóstico..."
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Fecha</label>
                            <input
                                type="datetime-local"
                                value={fecha}
                                onChange={(e) => setFecha(e.target.value)}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Estado</label>
                            <select
                                value={estado}
                                onChange={(e) => setEstado(e.target.value === 'I' ? 'I' : 'A')}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                            >
                                <option value="A">Activo</option>
                                <option value="I">Inactivo</option>
                            </select>
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Observaciones</label>
                            <textarea
                                rows={2}
                                value={observaciones}
                                onChange={(e) => setObservaciones(e.target.value)}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none"
                                placeholder="Observaciones opcionales"
                            />
                        </div>
                    </div>

                    {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}

                    <div className="flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={limpiarForm}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                            <X className="h-3.5 w-3.5" />
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={guardando}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                            <Save className="h-3.5 w-3.5" />
                            {guardando ? 'Guardando…' : editandoId ? 'Actualizar' : 'Guardar'}
                        </button>
                    </div>
                </form>
            )}

            {diagnosticos.length === 0 ? (
                <p className="text-xs text-gray-400">Sin diagnósticos registrados</p>
            ) : (
                <div className="space-y-2">
                    {diagnosticos.map((diagnostico) => (
                        <div key={diagnostico.id} className="rounded-lg border border-gray-200 bg-white p-3 text-xs">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <p className="font-medium text-gray-800">{diagnostico.descripcion ?? 'Sin descripción'}</p>
                                    {diagnostico.observaciones && (
                                        <p className="mt-1 text-gray-500 whitespace-pre-line">{diagnostico.observaciones}</p>
                                    )}
                                    <p className="mt-1 text-gray-400">
                                        {new Date(diagnostico.fecha).toLocaleString('es-AR')} · {diagnostico.usuario}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${diagnostico.estado === 'A' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                        {diagnostico.estado === 'A' ? 'Activo' : 'Inactivo'}
                                    </span>
                                    {puedeModificar && (
                                        <button
                                            type="button"
                                            onClick={() => editarDiagnostico(diagnostico)}
                                            className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                                        >
                                            <Pencil className="h-3 w-3" />
                                            Editar
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}