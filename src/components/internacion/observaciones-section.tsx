'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Loader2 } from 'lucide-react'

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
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [observaciones, setObservaciones] = useState(observacionesIniciales ?? '')

  const cancelarEdicion = () => {
    setEditando(false)
    setError(null)
    setObservaciones(observacionesIniciales ?? '')
  }

  const guardar = async () => {
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch(`/api/internacion/${ingresoId}/observaciones`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ observaciones: observaciones.trim() || null }),
      })

      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error ?? 'No se pudieron guardar las observaciones')
        return
      }

      setEditando(false)
      router.refresh()
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
        <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
          {observacionesIniciales?.trim() ? observacionesIniciales : 'Sin observaciones'}
        </p>
      ) : (
        <div className="space-y-2">
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={4}
            maxLength={5000}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y"
            placeholder="Agregar observaciones de internación"
          />

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
