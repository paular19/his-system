'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Stethoscope } from 'lucide-react'
import type { EvolucionItem } from '@/modules/internacion/types'
import { TIPO_EVOLUCION_LABEL } from '@/modules/internacion/types'

interface EvolucionSectionProps {
    ingresoId: number
    evoluciones: EvolucionItem[]
    profesionales: Array<{ id: number; nombre: string }>
    puedeCrear: boolean
}

const TIPO_COLOR: Record<string, string> = {
    MEDICA: 'bg-blue-50 border-blue-200 text-blue-800',
    ENFERMERIA: 'bg-green-50 border-green-200 text-green-800',
    KINESIO: 'bg-purple-50 border-purple-200 text-purple-800',
    NUTRICION: 'bg-orange-50 border-orange-200 text-orange-800',
    SERVICIO_SOCIAL: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    PSICOLOGIA: 'bg-pink-50 border-pink-200 text-pink-800',
    OTRO: 'bg-gray-50 border-gray-200 text-gray-800',
}

export function EvolucionSection({
    ingresoId,
    evoluciones: evolucionesIniciales,
    profesionales,
    puedeCrear,
}: EvolucionSectionProps) {
    const [evoluciones, setEvoluciones] = useState(evolucionesIniciales)
    const [mostrarFormulario, setMostrarFormulario] = useState(false)
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Formulario nueva evolución
    const [tipo, setTipo] = useState('MEDICA')
    const [descripcion, setDescripcion] = useState('')
    const [profesionalId, setProfesionalId] = useState('')
    const [tensionArterial, setTensionArterial] = useState('')
    const [frecuenciaCardiaca, setFrecuenciaCardiaca] = useState('')
    const [frecuenciaRespiratoria, setFrecuenciaRespiratoria] = useState('')
    const [temperatura, setTemperatura] = useState('')
    const [saturacionO2, setSaturacionO2] = useState('')
    const [mostrarSignos, setMostrarSignos] = useState(false)

    const limpiarFormulario = () => {
        setTipo('MEDICA')
        setDescripcion('')
        setProfesionalId('')
        setTensionArterial('')
        setFrecuenciaCardiaca('')
        setFrecuenciaRespiratoria('')
        setTemperatura('')
        setSaturacionO2('')
        setMostrarSignos(false)
        setMostrarFormulario(false)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!descripcion.trim()) return

        setGuardando(true)
        setError(null)

        try {
            const res = await fetch(`/api/internacion/${ingresoId}/evoluciones`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tipo,
                    descripcion: descripcion.trim(),
                    profesionalId: profesionalId ? parseInt(profesionalId) : null,
                    tensionArterial: tensionArterial || null,
                    frecuenciaCardiaca: frecuenciaCardiaca ? parseInt(frecuenciaCardiaca) : null,
                    frecuenciaRespiratoria: frecuenciaRespiratoria ? parseInt(frecuenciaRespiratoria) : null,
                    temperatura: temperatura ? parseFloat(temperatura) : null,
                    saturacionO2: saturacionO2 ? parseInt(saturacionO2) : null,
                }),
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error ?? 'Error al registrar evolución')
            }

            const { data } = await res.json()
            setEvoluciones([{ ...data, fecha: new Date(data.fecha) }, ...evoluciones])
            limpiarFormulario()
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
                    <Stethoscope className="h-4 w-4 text-gray-500" />
                    <h3 className="text-sm font-semibold text-gray-900">Evolución Clínica</h3>
                    <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                        {evoluciones.length}
                    </span>
                </div>
                {puedeCrear && (
                    <button
                        onClick={() => setMostrarFormulario(!mostrarFormulario)}
                        className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Nueva nota
                    </button>
                )}
            </div>

            {/* Formulario nueva evolución */}
            {mostrarFormulario && (
                <form onSubmit={handleSubmit} className="p-4 border-b bg-blue-50/50 space-y-3">
                    {error && (
                        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Tipo</label>
                            <select
                                value={tipo}
                                onChange={(e) => setTipo(e.target.value)}
                                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                            >
                                {Object.entries(TIPO_EVOLUCION_LABEL).map(([val, lbl]) => (
                                    <option key={val} value={val}>{lbl}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Profesional</label>
                            <select
                                value={profesionalId}
                                onChange={(e) => setProfesionalId(e.target.value)}
                                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                            >
                                <option value="">— Sin asignar —</option>
                                {profesionales.map((p) => (
                                    <option key={p.id} value={p.id}>{p.nombre}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                            Descripción <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            required
                            rows={4}
                            value={descripcion}
                            onChange={(e) => setDescripcion(e.target.value)}
                            placeholder="Registre la evolución del paciente..."
                            className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                        />
                    </div>

                    {/* Signos vitales (expandible) */}
                    <div>
                        <button
                            type="button"
                            onClick={() => setMostrarSignos(!mostrarSignos)}
                            className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"
                        >
                            {mostrarSignos ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            Signos vitales (opcional)
                        </button>
                        {mostrarSignos && (
                            <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2">
                                <div>
                                    <label className="block text-xs text-gray-600 mb-1">TA (mmHg)</label>
                                    <input
                                        type="text" placeholder="120/80"
                                        value={tensionArterial}
                                        onChange={(e) => setTensionArterial(e.target.value)}
                                        className="w-full border rounded px-2 py-1.5 text-xs"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-600 mb-1">FC (lpm)</label>
                                    <input
                                        type="number" min="0" max="300" placeholder="72"
                                        value={frecuenciaCardiaca}
                                        onChange={(e) => setFrecuenciaCardiaca(e.target.value)}
                                        className="w-full border rounded px-2 py-1.5 text-xs"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-600 mb-1">FR (rpm)</label>
                                    <input
                                        type="number" min="0" max="100" placeholder="16"
                                        value={frecuenciaRespiratoria}
                                        onChange={(e) => setFrecuenciaRespiratoria(e.target.value)}
                                        className="w-full border rounded px-2 py-1.5 text-xs"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-600 mb-1">Temp (°C)</label>
                                    <input
                                        type="number" min="30" max="45" step="0.1" placeholder="36.5"
                                        value={temperatura}
                                        onChange={(e) => setTemperatura(e.target.value)}
                                        className="w-full border rounded px-2 py-1.5 text-xs"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-600 mb-1">SpO₂ (%)</label>
                                    <input
                                        type="number" min="0" max="100" placeholder="98"
                                        value={saturacionO2}
                                        onChange={(e) => setSaturacionO2(e.target.value)}
                                        className="w-full border rounded px-2 py-1.5 text-xs"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={limpiarFormulario}
                            className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 border rounded-lg"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={guardando}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60"
                        >
                            {guardando ? 'Guardando…' : 'Guardar nota'}
                        </button>
                    </div>
                </form>
            )}

            {/* Lista de evoluciones */}
            <div className="divide-y max-h-[500px] overflow-y-auto">
                {evoluciones.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-8">Sin evoluciones registradas</p>
                ) : (
                    evoluciones.map((ev) => (
                        <div key={ev.id} className="p-4">
                            <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2">
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded border ${TIPO_COLOR[ev.tipo] ?? TIPO_COLOR.OTRO}`}>
                                        {TIPO_EVOLUCION_LABEL[ev.tipo] ?? ev.tipo}
                                    </span>
                                    {ev.profesional && (
                                        <span className="text-xs text-gray-600">Dr. {ev.profesional.nombre}</span>
                                    )}
                                </div>
                                <span className="text-xs text-gray-400 whitespace-nowrap">{fmt(ev.fecha)}</span>
                            </div>
                            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-snug">{ev.descripcion}</p>

                            {/* Signos vitales inline */}
                            {(ev.tensionArterial || ev.frecuenciaCardiaca || ev.temperatura || ev.saturacionO2) && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {ev.tensionArterial && (
                                        <span className="text-xs bg-gray-100 rounded px-1.5 py-0.5">TA: {ev.tensionArterial}</span>
                                    )}
                                    {ev.frecuenciaCardiaca && (
                                        <span className="text-xs bg-gray-100 rounded px-1.5 py-0.5">FC: {ev.frecuenciaCardiaca} lpm</span>
                                    )}
                                    {ev.frecuenciaRespiratoria && (
                                        <span className="text-xs bg-gray-100 rounded px-1.5 py-0.5">FR: {ev.frecuenciaRespiratoria} rpm</span>
                                    )}
                                    {ev.temperatura && (
                                        <span className="text-xs bg-gray-100 rounded px-1.5 py-0.5">T°: {ev.temperatura}°C</span>
                                    )}
                                    {ev.saturacionO2 && (
                                        <span className="text-xs bg-gray-100 rounded px-1.5 py-0.5">SpO₂: {ev.saturacionO2}%</span>
                                    )}
                                </div>
                            )}

                            <p className="mt-1 text-xs text-gray-400">Registrado por: {ev.usuario}</p>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
