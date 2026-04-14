'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateEstadoCamaAction } from '@/modules/internacion/actions'
import type { EstadoCama } from '@/modules/internacion/types'
import { ESTADO_CAMA_LABEL } from '@/modules/internacion/types'

interface CambiarEstadoCamaProps {
  camaId: number
  estadoActual: string
  identificador: string
  onClose: () => void
}

const ESTADOS_DESTINO: EstadoCama[] = ['DISPONIBLE', 'RESERVADA', 'MANTENIMIENTO']

export function CambiarEstadoCama({
  camaId,
  estadoActual,
  identificador,
  onClose,
}: CambiarEstadoCamaProps) {
  const router = useRouter()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [observaciones, setObservaciones] = useState('')

  const estados = ESTADOS_DESTINO.filter((e) => e !== estadoActual)

  async function handleCambiar(nuevoEstado: EstadoCama) {
    setGuardando(true)
    setError(null)
    try {
      await updateEstadoCamaAction(camaId, { estado: nuevoEstado, observaciones: observaciones || null })
      router.refresh()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al actualizar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="px-5 py-4 border-b">
          <h3 className="font-semibold text-gray-900">Cambiar estado — Cama {identificador}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Estado actual: <span className="font-medium">{ESTADO_CAMA_LABEL[estadoActual]}</span>
          </p>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Observaciones</label>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm resize-none h-20"
              placeholder="Motivo del cambio (opcional)"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              disabled={guardando}
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div className="space-y-2">
            {estados.map((estado) => (
              <button
                key={estado}
                onClick={() => handleCambiar(estado)}
                disabled={guardando}
                className="w-full text-sm font-medium py-2 px-4 rounded-lg border transition-colors disabled:opacity-50
                  hover:bg-gray-50 text-gray-700 border-gray-200"
              >
                Pasar a {ESTADO_CAMA_LABEL[estado]}
              </button>
            ))}
          </div>
        </div>
        <div className="px-5 py-3 border-t flex justify-end">
          <button
            onClick={onClose}
            disabled={guardando}
            className="text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
