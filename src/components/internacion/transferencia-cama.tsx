'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowRightLeft } from 'lucide-react'
import type { TransferenciaItem, CamaConOcupante } from '@/modules/internacion/types'
import { SECTOR_LABEL } from '@/modules/internacion/types'

const MOTIVOS_EGRESO = [
    { codigo: 'AL', descripcion: 'Alta medica' },
    { codigo: 'TR', descripcion: 'Traslado' },
    { codigo: 'FA', descripcion: 'Fallecimiento' },
    { codigo: 'AV', descripcion: 'Alta voluntaria' },
    { codigo: 'FU', descripcion: 'Fuga' },
]

interface TransferenciaCamaProps {
    ingresoId: number
    camaActual: { id: number; identificador: string; sector: string; estado: string } | null
    transferencias: TransferenciaItem[]
    camasDisponibles: CamaConOcupante[]
    profesionales: Array<{ id: number; nombre: string }>
    puedeModificar: boolean
    estadoInternacion: string | null
}

export function TransferenciaCama({
    ingresoId,
    camaActual,
    transferencias: transferenciasIniciales,
    camasDisponibles,
    profesionales,
    puedeModificar,
    estadoInternacion,
}: TransferenciaCamaProps) {
    const router = useRouter()
    const [transferencias, setTransferencias] = useState(transferenciasIniciales)
    const [cama, setCama] = useState(camaActual)
    const [mostrarFormulario, setMostrarFormulario] = useState(
        () => puedeModificar && camasDisponibles.some((c) => c.id !== camaActual?.id)
    )
    const [guardando, setGuardando] = useState(false)
    const [concretandoReserva, setConcretandoReserva] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [reservaMsg, setReservaMsg] = useState<string | null>(null)

    const [camaDestinoId, setCamaDestinoId] = useState('')
    const [motivo, setMotivo] = useState('')
    const [profesionalId, setProfesionalId] = useState('')
    const [mostrarAlta, setMostrarAlta] = useState(false)
    const [fechaEgreso, setFechaEgreso] = useState(() => new Date().toISOString().slice(0, 16))
    const [motivoEgresoCodigo, setMotivoEgresoCodigo] = useState('')
    const [descripcionPatologiaDefinitiva, setDescripcionPatologiaDefinitiva] = useState('')
    const [altaGuardando, setAltaGuardando] = useState(false)
    const [altaError, setAltaError] = useState<string | null>(null)

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

    const registrarAlta = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setAltaGuardando(true)
        setAltaError(null)

        const motivoCodigo = motivoEgresoCodigo.trim().toUpperCase()
        if (motivoCodigo.length > 2) {
            setAltaError('El motivo de egreso debe ser un codigo de hasta 2 caracteres (por ejemplo: AM, TR).')
            setAltaGuardando(false)
            return
        }

        try {
            const res = await fetch(`/api/internacion/${ingresoId}/alta`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ingresoId,
                    fechaEgreso: new Date(fechaEgreso).toISOString(),
                    motivoEgresoCodigo: motivoCodigo || null,
                    descripcionPatologiaDefinitiva: descripcionPatologiaDefinitiva.trim() || null,
                }),
            })

            const json = await res.json()
            if (!res.ok || !json.ok) {
                throw new Error(json.error ?? 'Error al registrar el alta')
            }

            router.refresh()
        } catch (err) {
            setAltaError(err instanceof Error ? err.message : 'Error inesperado')
        } finally {
            setAltaGuardando(false)
        }
    }

    const concretarReserva = async () => {
        if (!cama || cama.estado === 'OCUPADA') return

        setConcretandoReserva(true)
        setError(null)
        setReservaMsg(null)

        try {
            const res = await fetch(`/api/internacion/camas/${cama.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado: 'OCUPADA' }),
            })

            const json = await res.json()
            if (!res.ok) {
                throw new Error(json?.error ?? 'No se pudo concretar la reserva')
            }

            setCama((prev) => (prev ? { ...prev, estado: 'OCUPADA' } : prev))
            setReservaMsg('Reserva concretada: la cama quedó ocupada.')
            router.refresh()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo concretar la reserva')
        } finally {
            setConcretandoReserva(false)
        }
    }

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
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-700 font-bold text-sm">
                                {cama.identificador}
                            </div>
                            <div>
                                <p className="text-sm font-medium text-gray-900">Cama {cama.identificador}</p>
                                <p className="text-xs text-gray-500">{SECTOR_LABEL[cama.sector] ?? cama.sector}</p>
                                <p className="text-xs text-gray-500">Estado: {cama.estado}</p>
                            </div>
                        </div>

                        {puedeModificar && estadoInternacion === 'A' && cama.estado !== 'OCUPADA' && (
                            <button
                                type="button"
                                onClick={() => void concretarReserva()}
                                disabled={concretandoReserva}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                                {concretandoReserva
                                    ? 'Concretando...'
                                    : cama.estado === 'RESERVADA'
                                        ? 'Marcar reserva concretada'
                                        : 'Marcar cama ocupada'}
                            </button>
                        )}

                        {reservaMsg && (
                            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">
                                {reservaMsg}
                            </p>
                        )}
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

            {puedeModificar && (
                <div className="border-t border-gray-100 p-4 bg-rose-50/40">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                            <p className="text-xs font-semibold text-rose-700 uppercase tracking-wide">Alta</p>
                            <p className="text-xs text-rose-600 mt-1">
                                {estadoInternacion === 'A'
                                    ? 'Registrar el egreso del paciente y liberar la cama.'
                                    : 'La internación ya fue dada de alta.'}
                            </p>
                        </div>
                        {estadoInternacion === 'A' && (
                            <button
                                type="button"
                                onClick={() => setMostrarAlta((v) => !v)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 transition-colors"
                            >
                                {mostrarAlta ? 'Ocultar alta' : 'Dar alta'}
                            </button>
                        )}
                    </div>

                    {estadoInternacion === 'A' && mostrarAlta && (
                        <form onSubmit={registrarAlta} className="space-y-3 rounded-xl border border-rose-200 bg-white p-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Fecha de egreso</label>
                                    <input
                                        type="datetime-local"
                                        value={fechaEgreso}
                                        onChange={(e) => setFechaEgreso(e.target.value)}
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Motivo de egreso</label>
                                    <select
                                        value={motivoEgresoCodigo}
                                        onChange={(e) => setMotivoEgresoCodigo(e.target.value.toUpperCase())}
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                                    >
                                        <option value="">Sin motivo</option>
                                        {MOTIVOS_EGRESO.map((motivo) => (
                                            <option key={motivo.codigo} value={motivo.codigo}>
                                                {motivo.codigo} - {motivo.descripcion}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Diagnóstico definitivo</label>
                                    <textarea
                                        rows={2}
                                        value={descripcionPatologiaDefinitiva}
                                        onChange={(e) => setDescripcionPatologiaDefinitiva(e.target.value)}
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none"
                                        placeholder="Completar si corresponde"
                                    />
                                </div>
                            </div>

                            {altaError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{altaError}</p>}

                            <div className="flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setMostrarAlta(false)}
                                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={altaGuardando}
                                    className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-60"
                                >
                                    {altaGuardando ? 'Registrando…' : 'Confirmar alta'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            )}
        </div>
    )
}
