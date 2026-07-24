'use client'

import { useEffect, useMemo, useState } from 'react'
import { ClipboardCheck, FileText, Loader2 } from 'lucide-react'
import {
  parseObservacionesInternacion,
  REQUISITOS_DOCUMENTALES,
  tieneChecklistCompleto,
  type ChecklistDocumental,
} from '@/modules/internacion/observaciones-meta'
import { useBackgroundRefresh } from '@/lib/utils/client-mutation'

interface ObservacionesSectionProps {
  ingresoId: number
  observacionesIniciales: string | null
  puedeModificar: boolean
}

export function ObservacionesSection({
  ingresoId,
  observacionesIniciales,
  puedeModificar,
}: ObservacionesSectionProps) {
  const { refreshInBackground } = useBackgroundRefresh()
  const parsedInicial = useMemo(
    () => parseObservacionesInternacion(observacionesIniciales),
    [observacionesIniciales]
  )

  const [editando, setEditando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [observaciones, setObservaciones] = useState(parsedInicial.observaciones ?? '')
  const [checklistDocumental, setChecklistDocumental] = useState<ChecklistDocumental>(
    parsedInicial.checklistDocumental
  )

  useEffect(() => {
    const parsed = parseObservacionesInternacion(observacionesIniciales)
    setObservaciones(parsed.observaciones ?? '')
    setChecklistDocumental(parsed.checklistDocumental)
  }, [observacionesIniciales])

  const checklistCompleto = useMemo(
    () => tieneChecklistCompleto(checklistDocumental),
    [checklistDocumental]
  )

  const cancelarEdicion = () => {
    const parsed = parseObservacionesInternacion(observacionesIniciales)
    setEditando(false)
    setError(null)
    setObservaciones(parsed.observaciones ?? '')
    setChecklistDocumental(parsed.checklistDocumental)
  }

  const toggleChecklist = (key: keyof ChecklistDocumental) => {
    setChecklistDocumental((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const guardar = async () => {
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch(`/api/internacion/${ingresoId}/observaciones`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          observaciones: observaciones.trim() || null,
          checklistDocumental,
        }),
      })

      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error ?? 'No se pudieron guardar las observaciones')
        return
      }

      setEditando(false)
      refreshInBackground()
    } catch {
      setError('Error de conexión al guardar observaciones')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="his-card p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">Observaciones</h3>
        </div>

        {puedeModificar && !editando && (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            Editar
          </button>
        )}
      </div>

      {!editando ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
            {parsedInicial.observaciones?.trim() ? parsedInicial.observaciones : 'Sin observaciones'}
          </p>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="mb-2 flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-gray-500" />
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                Checklist documental
              </h4>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  checklistCompleto
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {checklistCompleto ? 'Completo' : 'Pendiente'}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {REQUISITOS_DOCUMENTALES.map((item) => (
                <label key={item.key} className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={checklistDocumental[item.key]}
                    readOnly
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={4}
            maxLength={5000}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y"
            placeholder="Agregar observaciones de internacion"
          />

          <div className="rounded-lg border border-gray-200 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-700">
              Checklist documental
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {REQUISITOS_DOCUMENTALES.map((item) => (
                <label key={item.key} className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={checklistDocumental[item.key]}
                    onChange={() => toggleChecklist(item.key)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={cancelarEdicion}
              disabled={guardando}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void guardar()}
              disabled={guardando}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
