'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { BedDouble, CalendarClock, Loader2 } from 'lucide-react'
import type { CamaConOcupante } from '@/modules/internacion/types'
import { SECTOR_LABEL } from '@/modules/internacion/types'

interface AsignacionCamaProgramadaCardProps {
  ingresoId: number
  camasDisponibles: CamaConOcupante[]
  puedeModificar: boolean
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

export function AsignacionCamaProgramadaCard({
  ingresoId,
  camasDisponibles,
  puedeModificar,
}: AsignacionCamaProgramadaCardProps) {
  const router = useRouter()
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [camaDestinoId, setCamaDestinoId] = useState('')
  const [fechaAsignacion, setFechaAsignacion] = useState(ahoraLocalDateTimeInput())

  const camasElegibles = useMemo(
    () => camasDisponibles.filter((item) => (item.estado ?? '').toUpperCase() === 'DISPONIBLE'),
    [camasDisponibles]
  )

  const asignarCama = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!camaDestinoId) {
      setError('Seleccione una cama para asignar.')
      return
    }

    setGuardando(true)
    setError(null)

    try {
      const res = await fetch(`/api/internacion/${ingresoId}/transferencias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          camaDestinoId: Number.parseInt(camaDestinoId, 10),
          fecha: fechaAsignacion || undefined,
          motivo: 'Asignacion de cama para cirugia programada',
          reservarCama: false,
        }),
      })

      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error ?? 'No se pudo asignar la cama')
        return
      }

      setMostrarFormulario(false)
      setCamaDestinoId('')
      setFechaAsignacion(ahoraLocalDateTimeInput())
      router.refresh()
    } catch {
      setError('Error de conexion al asignar la cama')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="his-card border border-amber-200 bg-amber-50/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <BedDouble className="mt-0.5 h-4 w-4 text-amber-700" />
          <div>
            <h3 className="text-sm font-semibold text-amber-900">Asignacion de cama programada</h3>
            <p className="mt-1 text-xs text-amber-800">
              Esta internacion tiene cirugia programada y todavia no tiene cama asignada.
            </p>
          </div>
        </div>

        {puedeModificar && (
          <button
            type="button"
            onClick={() => setMostrarFormulario((prev) => !prev)}
            disabled={camasElegibles.length === 0}
            className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mostrarFormulario ? 'Cancelar' : 'ASIGNAR'}
          </button>
        )}
      </div>

      {!puedeModificar && (
        <p className="mt-3 text-xs text-amber-800">Sin permisos para asignar cama.</p>
      )}

      {puedeModificar && camasElegibles.length === 0 && (
        <p className="mt-3 text-xs text-amber-800">No hay camas disponibles para asignar en este momento.</p>
      )}

      {mostrarFormulario && puedeModificar && camasElegibles.length > 0 && (
        <form onSubmit={asignarCama} className="mt-3 space-y-3 rounded-md border border-amber-200 bg-white p-3">
          {error && <p className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</p>}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-600">
                Fecha y hora <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <CalendarClock className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-gray-400" />
                <input
                  type="datetime-local"
                  required
                  value={fechaAsignacion}
                  onChange={(e) => setFechaAsignacion(e.target.value)}
                  className="w-full rounded-md border border-gray-300 py-1.5 pl-8 pr-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-600">
                Cama <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={camaDestinoId}
                onChange={(e) => setCamaDestinoId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">Seleccionar cama</option>
                {camasElegibles.map((cama) => (
                  <option key={cama.id} value={String(cama.id)}>
                    {cama.identificador}
                    {cama.habitacion ? ` · ${cama.habitacion}` : ''}
                    {' — '}
                    {SECTOR_LABEL[cama.sector] ?? cama.sector}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={guardando}
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {guardando ? 'Asignando...' : 'Confirmar asignacion'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
