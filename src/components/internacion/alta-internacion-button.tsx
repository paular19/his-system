'use client'

import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'

interface AltaInternacionButtonProps {
    ingresoId: number
    label?: string
    className?: string
    onSuccess?: () => void
}

export function AltaInternacionButton({
    ingresoId,
    label = 'Marcar alta',
    className = '',
    onSuccess,
}: AltaInternacionButtonProps) {
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const registrarAlta = async () => {
        const confirmado = window.confirm('¿Confirmás el alta de esta internación?')
        if (!confirmado) return

        setGuardando(true)
        setError(null)

        try {
            const res = await fetch(`/api/internacion/${ingresoId}/alta`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ingresoId }),
            })
            const json = await res.json()
            if (!res.ok || !json.ok) {
                throw new Error(json.error ?? 'Error al registrar el alta')
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
                onClick={registrarAlta}
                disabled={guardando}
                className={className}
            >
                <CheckCircle2 className="h-4 w-4" />
                {guardando ? 'Marcando alta…' : label}
            </button>
            {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
    )
}