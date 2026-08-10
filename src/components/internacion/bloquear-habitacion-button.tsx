'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LockKeyhole } from 'lucide-react'

interface BloquearHabitacionButtonProps {
  ingresoId: number
  habitacion: string
  camas: string[]
}

export function BloquearHabitacionButton({
  ingresoId,
  habitacion,
  camas,
}: BloquearHabitacionButtonProps) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirmar() {
    setGuardando(true)
    setError(null)

    try {
      const response = await fetch(`/api/internacion/${ingresoId}/bloquear-habitacion`, {
        method: 'POST',
      })
      const json = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(json?.error ?? 'No se pudo bloquear la habitacion')
      }

      setAbierto(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setError(null)
          setAbierto(true)
        }}
        className="inline-flex h-5 items-center gap-1 rounded border border-red-300 bg-white px-1.5 text-[10px] font-semibold leading-none text-red-700 hover:bg-red-50"
      >
        <LockKeyhole className="h-3 w-3" />
        Bloquear habitación
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !guardando && setAbierto(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="bloquear-habitacion-titulo"
            className="w-full max-w-md rounded-lg bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b px-5 py-4">
              <h3 id="bloquear-habitacion-titulo" className="font-semibold text-gray-900">
                Bloquear habitacion {habitacion}
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                El paciente conservara su cama actual hasta el alta o una transferencia.
              </p>
            </div>

            <div className="space-y-3 px-5 py-4">
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-3">
                <p className="text-xs font-semibold uppercase text-red-800">
                  {camas.length === 1 ? 'Cama que se bloqueara' : 'Camas que se bloquearan'}
                </p>
                <p className="mt-1 text-sm font-semibold text-red-950">{camas.join(', ')}</p>
              </div>
              <p className="text-sm text-gray-700">
                Estas camas dejaran de figurar como disponibles. El bloqueo se liberara
                automaticamente cuando el paciente sea dado de alta o transferido.
              </p>
              {error && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t px-5 py-3">
              <button
                type="button"
                onClick={() => setAbierto(false)}
                disabled={guardando}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmar}
                disabled={guardando}
                className="inline-flex items-center gap-2 rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
              >
                <LockKeyhole className="h-4 w-4" />
                {guardando ? 'Bloqueando...' : 'Confirmar bloqueo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}