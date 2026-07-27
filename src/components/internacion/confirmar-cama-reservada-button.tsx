'use client'

import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'

interface ConfirmarCamaReservadaButtonProps {
  camaId: number
  label?: string
  className?: string
  onSuccess?: () => void
}

export function ConfirmarCamaReservadaButton({
  camaId,
  label = 'Confirmar cama reservada',
  className = '',
  onSuccess,
}: ConfirmarCamaReservadaButtonProps) {
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirmarReserva = async () => {
    const confirmado = window.confirm('¿Confirmás que esta cama reservada debe pasar a ocupada?')
    if (!confirmado) return

    setGuardando(true)
    setError(null)

    try {
      const res = await fetch(`/api/internacion/camas/${camaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'OCUPADA' }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error ?? 'No se pudo confirmar la cama reservada')
      }

      onSuccess?.()
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={confirmarReserva}
        disabled={guardando}
        className={className}
      >
        <CheckCircle2 className="h-4 w-4" />
        {guardando ? 'Confirmando…' : label}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
