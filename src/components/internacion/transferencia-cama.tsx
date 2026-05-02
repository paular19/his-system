'use client'

import { useState } from 'react'
import { ArrowRightLeft } from 'lucide-react'
import type { TransferenciaItem, CamaConOcupante } from '@/modules/internacion/types'
import { SECTOR_LABEL } from '@/modules/internacion/types'

interface TransferenciaCamaProps {
    ingresoId: number
    camaActual: { id: number; identificador: string; sector: string } | null
    transferencias: TransferenciaItem[]
    camasDisponibles: CamaConOcupante[]
    profesionales: Array<{ id: number; nombre: string }>
    puedeModificar: boolean
}

export function TransferenciaCama({
    ingresoId,
    camaActual,
    transferencias: transferenciasIniciales,
    camasDisponibles,
    profesionales,
    puedeModificar,
}: TransferenciaCamaProps) {
    const [transferencias, setTransferencias] = useState(transferenciasIniciales)
    const [cama, setCama] = useState(camaActual)
    const [mostrarFormulario, setMostrarFormulario] = useState(
        () => puedeModificar && camasDisponibles.some((c) => c.id !== camaActual?.id)
    )
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [camaDestinoId, setCamaDestinoId] = useState('')
    const [motivo, setMotivo] = useState('')
    const [profesionalId, setProfesionalId] = useState('')

    // Refresh camas disponibles (excluir la cama actual del listado)
    const camasParaTransferir = camasDisponibles.filter((c) => c.id !== cama?.id)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!camaDestinoId) return
        setGuardando(true); setError(null)

        try {
            const res = await fetch(`/api/internacion/${ingresoId}/transferencias`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    camaDestinoId: parseInt(camaDestinoId),
                    motivo: motivo || null,
                    profesionalId: profesionalId ? parseInt(profesionalId) : null,
                }),
            })
            if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Error') }
            const { data } = await res.json()
            setTransferencias([{ ...data, fecha: new Date(data.fecha) }, ...transferencias])
            setCama(data.camaDestino)
            setCamaDestinoId(''); setMotivo(''); setProfesionalId('')
            setMostrarFormulario(false)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error desconocido')
        } finally {
            setGuardando(false)
        }
    }

    const fmt = (d: Date | string) =>
        new Date(d).toLocaleString('es-AR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        })

    return (
        <div className="his-card">
            <div className="flex items-center justify-between p-4 border-b">
                <div className="flex items-center gap-2">
                    <ArrowRightLeft className="h-4 w-4 text-gray-500" />
                    <h3 className="text-sm font-semibold text-gray-900">Cama Actual</h3>
                </div>
                {puedeModificar && (
                    <button
                        type="button"
                        onClick={() => setMostrarFormulario(!mostrarFormulario)}
                        disabled={camasParaTransferir.length === 0}
                        className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                        {mostrarFormulario ? 'Ocultar cambio' : 'Modificar cama actual'}
                    </button>
                )}
            </div>

            {/* Cama actual */}
            <div className="p-4 border-b">
                {cama ? (
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-700 font-bold text-sm">
                            {cama.identificador}
                        </div>
                        <div>
                            <p className="text-sm font-medium text-gray-900">Cama {cama.identificador}</p>
                            <p className="text-xs text-gray-500">{SECTOR_LABEL[cama.sector] ?? cama.sector}</p>
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-gray-500">Sin cama asignada</p>
                )}
                {puedeModificar && (
                    <p className="mt-2 text-xs text-gray-500">
                        {camasParaTransferir.length > 0
                            ? `Podés reemplazar la cama actual por otra disponible. Opciones: ${camasParaTransferir.length}`
                            : 'No hay camas disponibles para cambio en este momento.'}
                    </p>
                )}
            </div>

            {/* Formulario de transferencia */}
            {mostrarFormulario && (
                <form onSubmit={handleSubmit} className="p-4 border-b bg-amber-50/50 space-y-3">
                    <div>
                        <p className="text-xs font-medium text-gray-700 uppercase tracking-wide">
                            Modificar cama actual
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                            Seleccioná una nueva cama disponible para asignarla a esta internación.
                        </p>
                    </div>
                    {error && (
                        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                Cama destino <span className="text-red-500">*</span>
                            </label>
                            <select
                                required value={camaDestinoId}
                                onChange={(e) => setCamaDestinoId(e.target.value)}
                                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                            >
                                <option value="">— Seleccionar cama —</option>
                                {camasParaTransferir.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.identificador}{c.habitacion ? ` · ${c.habitacion}` : ''} — {SECTOR_LABEL[c.sector] ?? c.sector}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Profesional</label>
                            <select
                                value={profesionalId} onChange={(e) => setProfesionalId(e.target.value)}
                                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                            >
                                <option value="">— Sin asignar —</option>
                                {profesionales.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Motivo de la transferencia</label>
                            <input
                                type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                                placeholder="Ej: Alta de UTI, cambio de sector..."
                                className="w-full border rounded-lg px-3 py-2 text-sm"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setMostrarFormulario(false)}
                            className="px-3 py-1.5 text-xs text-gray-600 border rounded-lg hover:bg-gray-50">
                            Cancelar
                        </button>
                        <button type="submit" disabled={guardando}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-60">
                            {guardando ? 'Transfiriendo…' : 'Confirmar transferencia'}
                        </button>
                    </div>
                </form>
            )}

            {/* Historial de transferencias */}
            {transferencias.length > 0 && (
                <div className="p-4">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Historial de camas</p>
                    <div className="space-y-2">
                        {transferencias.map((t) => (
                            <div key={t.id} className="flex items-center gap-2 text-xs text-gray-600">
                                <span className="text-gray-400">{fmt(t.fecha)}</span>
                                <ArrowRightLeft className="h-3 w-3 text-gray-400" />
                                <span>
                                    {t.camaOrigen ? `${t.camaOrigen.identificador} → ` : ''}
                                    <span className="font-medium">{t.camaDestino.identificador}</span>
                                </span>
                                {t.motivo && <span className="text-gray-400">({t.motivo})</span>}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
