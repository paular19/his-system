'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { ArrowRightLeft } from 'lucide-react'
import type { TransferenciaItem, CamaConOcupante } from '@/modules/internacion/types'
import { SECTOR_LABEL } from '@/modules/internacion/types'
import { ProfesionalSelect } from '@/components/ui/profesional-select'
import { formatearFechaHoraArgentina } from '@/lib/utils/argentina-date'

const MOTIVOS_EGRESO = [
    { codigo: 'AL', descripcion: 'Alta medica' },
    { codigo: 'TR', descripcion: 'Traslado' },
    { codigo: 'FA', descripcion: 'Fallecimiento' },
    { codigo: 'AV', descripcion: 'Alta voluntaria' },
    { codigo: 'FU', descripcion: 'Fuga' },
]

function normalizarEstadoCama(estado: string | null | undefined): 'DISPONIBLE' | 'OCUPADA' | 'RESERVADA' | 'MANTENIMIENTO' | null {
    const valor = (estado ?? '').trim().toUpperCase()
    if (!valor) return null
    if (valor === 'DISPONIBLE' || valor === 'D') return 'DISPONIBLE'
    if (valor === 'OCUPADA' || valor === 'O') return 'OCUPADA'
    if (valor === 'RESERVADA' || valor === 'R') return 'RESERVADA'
    if (valor === 'MANTENIMIENTO' || valor === 'M') return 'MANTENIMIENTO'
    return null
}

function ahoraLocalDateTimeInput(): string {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${d}T${hh}:${mm}`
}

function toDateTimeLocalInput(value: Date | string | null | undefined): string {
    if (!value) return ''
    const d = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${day}T${hh}:${mm}`
}

interface TransferenciaCamaProps {
    ingresoId: number
    camaActual: { id: number; identificador: string; sector: string; estado: string } | null
    transferencias: TransferenciaItem[]
    camasDisponibles: CamaConOcupante[]
    profesionales: Array<{ id: number; nombre: string; matricula?: number | null }>
    puedeModificar: boolean
    estadoInternacion: string | null
    fechaEgresoActual?: Date | string | null
}

export function TransferenciaCama({
    ingresoId,
    camaActual,
    transferencias: transferenciasIniciales,
    camasDisponibles,
    profesionales,
    puedeModificar,
    estadoInternacion,
    fechaEgresoActual,
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
    const [reservaError, setReservaError] = useState<string | null>(null)
    const [reservaMsg, setReservaMsg] = useState<string | null>(null)

    const [camaDestinoId, setCamaDestinoId] = useState('')
    const [motivo, setMotivo] = useState('')
    const [profesionalId, setProfesionalId] = useState('')
    const [fechaTransferencia, setFechaTransferencia] = useState(() => ahoraLocalDateTimeInput())
    const [mostrarAlta, setMostrarAlta] = useState(false)
    const [fechaEgreso, setFechaEgreso] = useState(() => ahoraLocalDateTimeInput())
    const [motivoEgresoCodigo, setMotivoEgresoCodigo] = useState('')
    const [descripcionPatologiaDefinitiva, setDescripcionPatologiaDefinitiva] = useState('')
    const [altaGuardando, setAltaGuardando] = useState(false)
    const [altaError, setAltaError] = useState<string | null>(null)
    const [altaExito, setAltaExito] = useState<string | null>(null)
    const [confirmacionAlta, setConfirmacionAlta] = useState(false)
    const [mostrarCorreccionAlta, setMostrarCorreccionAlta] = useState(false)
    const [fechaEgresoCorreccion, setFechaEgresoCorreccion] = useState(
        () => toDateTimeLocalInput(fechaEgresoActual) || ahoraLocalDateTimeInput()
    )
    const [correccionGuardando, setCorreccionGuardando] = useState(false)
    const [correccionError, setCorreccionError] = useState<string | null>(null)
    const [correccionExito, setCorreccionExito] = useState<string | null>(null)
    const [confirmacionCorreccionAlta, setConfirmacionCorreccionAlta] = useState(false)
    const [transferenciaEditandoId, setTransferenciaEditandoId] = useState<number | null>(null)
    const [fechaTransferenciaEdit, setFechaTransferenciaEdit] = useState('')
    const [camaDestinoEditId, setCamaDestinoEditId] = useState('')
    const [motivoTransferenciaEdit, setMotivoTransferenciaEdit] = useState('')
    const [guardandoEdicionTransferencia, setGuardandoEdicionTransferencia] = useState(false)
    const [errorEdicionTransferencia, setErrorEdicionTransferencia] = useState<string | null>(null)

    const estadoCamaActual = normalizarEstadoCama(cama?.estado)

    // Refresh camas disponibles (excluir la cama actual del listado)
    const camasParaTransferir = camasDisponibles.filter((c) => c.id !== cama?.id)
    const opcionesCamasHistorial = useMemo(() => {
        const map = new Map<number, { id: number; identificador: string; sector: string; habitacion: string | null }>()

        for (const camaDisponible of camasDisponibles) {
            map.set(camaDisponible.id, {
                id: camaDisponible.id,
                identificador: camaDisponible.identificador,
                sector: camaDisponible.sector,
                habitacion: camaDisponible.habitacion ?? null,
            })
        }

        if (camaActual) {
            map.set(camaActual.id, {
                id: camaActual.id,
                identificador: camaActual.identificador,
                sector: camaActual.sector,
                habitacion: null,
            })
        }

        for (const item of transferencias) {
            if (item.camaDestino) {
                map.set(item.camaDestino.id, {
                    id: item.camaDestino.id,
                    identificador: item.camaDestino.identificador,
                    sector: item.camaDestino.sector,
                    habitacion: null,
                })
            }
            if (item.camaOrigen) {
                map.set(item.camaOrigen.id, {
                    id: item.camaOrigen.id,
                    identificador: item.camaOrigen.identificador,
                    sector: item.camaOrigen.sector,
                    habitacion: null,
                })
            }
        }

        return Array.from(map.values()).sort((a, b) => a.identificador.localeCompare(b.identificador))
    }, [camaActual, camasDisponibles, transferencias])

    const iniciarEdicionTransferencia = (item: TransferenciaItem) => {
        setTransferenciaEditandoId(item.id)
        setFechaTransferenciaEdit(toDateTimeLocalInput(item.fecha))
        setCamaDestinoEditId(String(item.camaDestino.id))
        setMotivoTransferenciaEdit(item.motivo ?? '')
        setErrorEdicionTransferencia(null)
    }

    const cancelarEdicionTransferencia = () => {
        setTransferenciaEditandoId(null)
        setFechaTransferenciaEdit('')
        setCamaDestinoEditId('')
        setMotivoTransferenciaEdit('')
        setErrorEdicionTransferencia(null)
    }

    const guardarEdicionTransferencia = async (transferenciaId: number) => {
        if (!camaDestinoEditId) {
            setErrorEdicionTransferencia('Seleccione una cama destino para el historial.')
            return
        }

        setGuardandoEdicionTransferencia(true)
        setErrorEdicionTransferencia(null)

        try {
            const res = await fetch(`/api/internacion/${ingresoId}/transferencias/${transferenciaId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    camaDestinoId: Number.parseInt(camaDestinoEditId, 10),
                    fecha: fechaTransferenciaEdit || undefined,
                    motivo: motivoTransferenciaEdit || null,
                }),
            })

            const json = await res.json().catch(() => null)
            if (!res.ok) {
                throw new Error(json?.error ?? 'No se pudo editar la transferencia')
            }

            const data = json?.data
            if (!data?.id) {
                throw new Error('Respuesta inválida al editar la transferencia')
            }

            const actualizado = {
                ...data,
                fecha: new Date(data.fecha),
            } as TransferenciaItem

            setTransferencias((prev) => {
                const next = prev.map((item) => (item.id === transferenciaId ? actualizado : item))
                next.sort((a, b) => {
                    const af = a.fecha instanceof Date ? a.fecha.getTime() : new Date(a.fecha).getTime()
                    const bf = b.fecha instanceof Date ? b.fecha.getTime() : new Date(b.fecha).getTime()
                    return bf - af
                })
                return next
            })

            cancelarEdicionTransferencia()
        } catch (err) {
            setErrorEdicionTransferencia(err instanceof Error ? err.message : 'No se pudo editar la transferencia')
        } finally {
            setGuardandoEdicionTransferencia(false)
        }
    }

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
                    fecha: fechaTransferencia || undefined,
                    motivo: motivo || null,
                    profesionalId: profesionalId ? parseInt(profesionalId) : null,
                    reservarCama: estadoCamaActual === 'RESERVADA',
                }),
            })
            if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Error') }
            const { data } = await res.json()
            setTransferencias([{ ...data, fecha: new Date(data.fecha) }, ...transferencias])
            setCama(data.camaDestino)
            setCamaDestinoId(''); setMotivo(''); setProfesionalId(''); setFechaTransferencia(ahoraLocalDateTimeInput())
            setMostrarFormulario(false)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error desconocido')
        } finally {
            setGuardando(false)
        }
    }

    const fmt = (d: Date | string) => formatearFechaHoraArgentina(d)

    const registrarAlta = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setAltaGuardando(true)
        setAltaError(null)
        setAltaExito(null)

        if (!fechaEgreso) {
            setAltaError('Debe completar fecha y hora de egreso.')
            setAltaGuardando(false)
            return
        }

        if (!confirmacionAlta) {
            setAltaError('Debe confirmar el alta para continuar.')
            setAltaGuardando(false)
            return
        }

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

            setAltaExito('Alta registrada correctamente. Actualizando ficha...')
            setMostrarAlta(false)
            setConfirmacionAlta(false)
            setDescripcionPatologiaDefinitiva('')
            setMotivoEgresoCodigo('')
            setFechaEgreso(ahoraLocalDateTimeInput())
            router.refresh()
        } catch (err) {
            setAltaError(err instanceof Error ? err.message : 'Error inesperado')
        } finally {
            setAltaGuardando(false)
        }
    }

    const corregirFechaAlta = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setCorreccionGuardando(true)
        setCorreccionError(null)
        setCorreccionExito(null)

        if (!fechaEgresoCorreccion) {
            setCorreccionError('Debe completar la fecha y hora de alta corregida.')
            setCorreccionGuardando(false)
            return
        }

        if (!confirmacionCorreccionAlta) {
            setCorreccionError('Debe confirmar la corrección de fecha de alta para continuar.')
            setCorreccionGuardando(false)
            return
        }

        try {
            const res = await fetch(`/api/internacion/${ingresoId}/alta`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ingresoId,
                    fechaEgreso: new Date(fechaEgresoCorreccion).toISOString(),
                }),
            })

            const json = await res.json()
            if (!res.ok || !json.ok) {
                throw new Error(json.error ?? 'Error al corregir la fecha de alta')
            }

            setCorreccionExito('Fecha de alta corregida correctamente. Se registró auditoría del cambio.')
            setMostrarCorreccionAlta(false)
            setConfirmacionCorreccionAlta(false)
            router.refresh()
        } catch (err) {
            setCorreccionError(err instanceof Error ? err.message : 'Error inesperado')
        } finally {
            setCorreccionGuardando(false)
        }
    }

    const concretarReserva = async () => {
        if (!cama || estadoCamaActual === 'OCUPADA') return

        setConcretandoReserva(true)
        setReservaError(null)
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
            setReservaError(err instanceof Error ? err.message : 'No se pudo concretar la reserva')
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
                                <p className="text-xs text-gray-500">Estado: {estadoCamaActual ?? '—'}</p>
                            </div>
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
                            <ProfesionalSelect
                                profesionales={profesionales}
                                value={profesionalId}
                                onChange={setProfesionalId}
                                placeholderOption="— Sin asignar —"
                                selectClassName="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                Fecha y hora del cambio <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="datetime-local"
                                required
                                value={fechaTransferencia}
                                onChange={(e) => setFechaTransferencia(e.target.value)}
                                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                            />
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
                            <div key={t.id} className="rounded-md border border-gray-200 p-2 text-xs text-gray-600">
                                {transferenciaEditandoId === t.id ? (
                                    <div className="space-y-2">
                                        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                                            <div>
                                                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                                                    Fecha y hora
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    value={fechaTransferenciaEdit}
                                                    onChange={(e) => setFechaTransferenciaEdit(e.target.value)}
                                                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs"
                                                />
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                                                    Cama destino
                                                </label>
                                                <select
                                                    value={camaDestinoEditId}
                                                    onChange={(e) => setCamaDestinoEditId(e.target.value)}
                                                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs"
                                                >
                                                    <option value="">Seleccionar cama</option>
                                                    {opcionesCamasHistorial.map((camaOption) => (
                                                        <option key={camaOption.id} value={String(camaOption.id)}>
                                                            {camaOption.identificador}
                                                            {camaOption.habitacion ? ` · ${camaOption.habitacion}` : ''}
                                                            {camaOption.sector ? ` — ${SECTOR_LABEL[camaOption.sector] ?? camaOption.sector}` : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                                                    Motivo
                                                </label>
                                                <input
                                                    type="text"
                                                    value={motivoTransferenciaEdit}
                                                    onChange={(e) => setMotivoTransferenciaEdit(e.target.value)}
                                                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs"
                                                    placeholder="Opcional"
                                                />
                                            </div>
                                        </div>
                                        {errorEdicionTransferencia && (
                                            <p className="rounded border border-red-200 bg-red-50 p-1.5 text-[11px] text-red-700">
                                                {errorEdicionTransferencia}
                                            </p>
                                        )}
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                type="button"
                                                onClick={cancelarEdicionTransferencia}
                                                className="rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void guardarEdicionTransferencia(t.id)}
                                                disabled={guardandoEdicionTransferencia}
                                                className="rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                                            >
                                                {guardandoEdicionTransferencia ? 'Guardando...' : 'Guardar cambios'}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 text-xs text-gray-600 min-w-0">
                                            <span className="text-gray-400">{fmt(t.fecha)}</span>
                                            <ArrowRightLeft className="h-3 w-3 text-gray-400" />
                                            <span className="min-w-0">
                                                {t.camaOrigen ? `${t.camaOrigen.identificador} → ` : ''}
                                                <span className="font-medium">{t.camaDestino.identificador}</span>
                                            </span>
                                            {t.motivo && <span className="text-gray-400">({t.motivo})</span>}
                                        </div>
                                        {puedeModificar && (
                                            <button
                                                type="button"
                                                onClick={() => iniciarEdicionTransferencia(t)}
                                                className="rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                                            >
                                                Editar
                                            </button>
                                        )}
                                    </div>
                                )}
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
                                onClick={() => {
                                    setAltaError(null)
                                    setAltaExito(null)
                                    setMostrarAlta((v) => !v)
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 transition-colors"
                            >
                                {mostrarAlta ? 'Ocultar alta' : 'Dar alta'}
                            </button>
                        )}
                        {estadoInternacion === 'E' && (
                            <button
                                type="button"
                                onClick={() => {
                                    setCorreccionError(null)
                                    setCorreccionExito(null)
                                    setMostrarCorreccionAlta((v) => !v)
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 transition-colors"
                            >
                                {mostrarCorreccionAlta ? 'Ocultar corrección' : 'Corregir fecha de alta'}
                            </button>
                        )}
                    </div>

                    {puedeModificar && estadoInternacion === 'A' && cama && estadoCamaActual !== 'OCUPADA' && (
                        <div className="mb-3 space-y-2">
                            <button
                                type="button"
                                onClick={() => void concretarReserva()}
                                disabled={concretandoReserva}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                                {concretandoReserva
                                    ? 'Concretando...'
                                    : estadoCamaActual === 'RESERVADA'
                                        ? 'Confirmar cama reservada'
                                        : 'Marcar cama ocupada'}
                            </button>

                            {reservaMsg && (
                                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">
                                    {reservaMsg}
                                </p>
                            )}

                            {reservaError && (
                                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                                    {reservaError}
                                </p>
                            )}
                        </div>
                    )}

                    {altaExito && (
                        <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700">
                            {altaExito}
                        </p>
                    )}

                    {correccionExito && (
                        <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700">
                            {correccionExito}
                        </p>
                    )}

                    {estadoInternacion === 'A' && mostrarAlta && (
                        <form onSubmit={registrarAlta} className="space-y-3 rounded-xl border border-rose-200 bg-white p-4">
                            <div className="rounded-lg border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">
                                Esta acción marca la internación como egresada y libera la cama actual.
                            </div>

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

                            <label className="inline-flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700">
                                <input
                                    type="checkbox"
                                    checked={confirmacionAlta}
                                    onChange={(e) => setConfirmacionAlta(e.target.checked)}
                                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-rose-600 focus:ring-rose-500"
                                />
                                <span>Confirmo registrar el alta y liberar la cama actual.</span>
                            </label>

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
                                    disabled={altaGuardando || !confirmacionAlta || !fechaEgreso}
                                    className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-60"
                                >
                                    {altaGuardando ? 'Registrando alta...' : 'Confirmar alta'}
                                </button>
                            </div>
                        </form>
                    )}

                    {estadoInternacion === 'E' && mostrarCorreccionAlta && (
                        <form onSubmit={corregirFechaAlta} className="space-y-3 rounded-xl border border-amber-200 bg-white p-4">
                            <div className="rounded-lg border border-amber-100 bg-amber-50 p-2 text-xs text-amber-700">
                                Esta corrección actualiza la fecha de alta registrada y deja trazabilidad en auditoría con usuario y timestamp.
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Nueva fecha de alta</label>
                                <input
                                    type="datetime-local"
                                    value={fechaEgresoCorreccion}
                                    onChange={(e) => setFechaEgresoCorreccion(e.target.value)}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                                />
                            </div>

                            <label className="inline-flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700">
                                <input
                                    type="checkbox"
                                    checked={confirmacionCorreccionAlta}
                                    onChange={(e) => setConfirmacionCorreccionAlta(e.target.checked)}
                                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                                />
                                <span>Confirmo corregir la fecha de alta de esta internación.</span>
                            </label>

                            {correccionError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{correccionError}</p>}

                            <div className="flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setMostrarCorreccionAlta(false)}
                                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={correccionGuardando || !confirmacionCorreccionAlta || !fechaEgresoCorreccion}
                                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-60"
                                >
                                    {correccionGuardando ? 'Guardando corrección...' : 'Guardar corrección'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            )}
        </div>
    )
}
