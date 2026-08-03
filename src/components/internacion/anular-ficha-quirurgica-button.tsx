'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Loader2 } from 'lucide-react'

interface AnularFichaQuirurgicaButtonProps {
  ingresoId: number
  cirugiaId: number
  className?: string
}

export function AnularFichaQuirurgicaButton({
  ingresoId,
  cirugiaId,
  className,
}: AnularFichaQuirurgicaButtonProps) {
  const router = useRouter()
  const [anulando, setAnulando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const anular = async () => {
    if (typeof window !== 'undefined') {
      const confirmar = window.confirm(
        `Se anulará la ficha quirúrgica ${cirugiaId}. Si tiene prácticas pendientes sin orden/autorización, también se anularán. ¿Desea continuar?`
      )
      if (!confirmar) return
    }

    setError(null)
    setAnulando(true)
    try {
      const res = await fetch(`/api/internacion/${ingresoId}/cirugias/${cirugiaId}`, {
        method: 'DELETE',
        cache: 'no-store',
      })
      const json = await res.json().catch(() => null)

      if (!res.ok) {
        setError(json?.error ?? 'No se pudo anular la ficha quirúrgica')
        return
      }

      router.refresh()
    } catch {
      setError('Error de conexión al anular la ficha quirúrgica')
    } finally {
      setAnulando(false)
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => void anular()}
        disabled={anulando}
        className={
          className ??
          'inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60'
        }
      >
        {anulando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
        {anulando ? 'Anulando...' : 'Anular ficha'}
      </button>

      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  )
}
