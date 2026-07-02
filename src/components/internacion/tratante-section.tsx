'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Stethoscope } from 'lucide-react'
import { ProfesionalSelect } from '@/components/ui/profesional-select'
import { nombreProfesionalParaMostrar } from '@/lib/profesionales'

interface ProfesionalOption {
    id: number
    nombre: string
    matricula?: number | null
}

interface HistorialTratanteItem {
    id: number
    profesionalId: number
    profesionalNombre: string
    usuario: string
    fecha: Date | string
}

interface TratanteSectionProps {
    ingresoId: number
    tratanteActualId: number | null
    tratanteActualNombre: string | null
    profesionales: ProfesionalOption[]
    historialTratantes: HistorialTratanteItem[]
    puedeModificar: boolean
}

export function TratanteSection({
    ingresoId,
    tratanteActualId,
    tratanteActualNombre,
    profesionales,
    historialTratantes,
    puedeModificar,
}: TratanteSectionProps) {
    const router = useRouter()
    const [tratanteSeleccionado, setTratanteSeleccionado] = useState(
        tratanteActualId ? String(tratanteActualId) : ''
    )
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const cambiosDetectados = useMemo(
        () => (tratanteActualId ? String(tratanteActualId) !== tratanteSeleccionado : Boolean(tratanteSeleccionado)),
        [tratanteActualId, tratanteSeleccionado]
    )

    const guardarTratante = async () => {
        if (!tratanteSeleccionado) {
            setError('Seleccione un médico tratante')
            return
        }

        setGuardando(true)
        setError(null)

        try {
            const res = await fetch(`/api/internacion/${ingresoId}/tratante`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profesionalTratanteId: Number(tratanteSeleccionado) }),
            })

            const json = await res.json().catch(() => ({}))
            if (!res.ok || !json.ok) {
                throw new Error(json?.error ?? 'No se pudo actualizar el médico tratante')
            }

            router.refresh()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo actualizar el médico tratante')
        } finally {
            setGuardando(false)
        }
    }

    const fmtFecha = (value: Date | string) => {
        const d = value instanceof Date ? value : new Date(value)
        if (Number.isNaN(d.getTime())) return '—'
        return d.toLocaleString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        })
    }

    return (
        <div className="his-card p-4">
            <div className="flex items-center gap-2 mb-3">
                <Stethoscope className="h-4 w-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">Médico tratante</h3>
            </div>

            <p className="text-xs text-gray-500 mb-2">Actual: <span className="text-gray-800 font-medium">{tratanteActualNombre ? nombreProfesionalParaMostrar(tratanteActualNombre) : 'Sin asignar'}</span></p>

            <div className="space-y-2">
                <ProfesionalSelect
                    profesionales={profesionales}
                    value={tratanteSeleccionado}
                    onChange={setTratanteSeleccionado}
                    disabled={!puedeModificar || guardando}
                    placeholderOption="Seleccionar médico tratante"
                />
                {puedeModificar && cambiosDetectados && (
                    <button
                        type="button"
                        onClick={() => void guardarTratante()}
                        disabled={guardando}
                        className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                        {guardando ? 'Guardando...' : 'Guardar'}
                    </button>
                )}
            </div>

            {error && (
                <p className="text-xs text-red-600 mt-2">{error}</p>
            )}

            <div className="mt-4 border-t pt-3">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Histórico de tratantes</p>
                {historialTratantes.length === 0 ? (
                    <p className="text-xs text-gray-500">No hay cambios de médico tratante registrados.</p>
                ) : (
                    <ul className="space-y-1.5">
                        {historialTratantes.map((item) => (
                            <li key={item.id} className="text-xs text-gray-700">
                                <span className="font-medium">{nombreProfesionalParaMostrar(item.profesionalNombre)}</span>
                                <span className="text-gray-500"> · {fmtFecha(item.fecha)} · usuario {item.usuario}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}
