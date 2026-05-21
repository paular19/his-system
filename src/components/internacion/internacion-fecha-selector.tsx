'use client'

import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

interface FechaOption {
    key: string
    labelCorta: string
}

interface InternacionFechaSelectorProps {
    fechas: FechaOption[]
    fechaSeleccionada: string
    q: string
    obraSocialIdFiltro: number | undefined
}

export function InternacionFechaSelector({
    fechas,
    fechaSeleccionada,
    q,
    obraSocialIdFiltro,
}: InternacionFechaSelectorProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [fechaCambiando, setFechaCambiando] = useState<string | null>(null)

    const cambiarFecha = (fecha: string) => {
        if (isPending || fecha === fechaSeleccionada) return

        const query = new URLSearchParams()
        query.set('fecha', fecha)
        if (q) query.set('q', q)
        if (obraSocialIdFiltro) query.set('obraSocialId', String(obraSocialIdFiltro))

        setFechaCambiando(fecha)
        startTransition(() => {
            router.push(`/dashboard/internacion?${query.toString()}`)
        })
    }

    return (
        <div className="his-card p-4 print:hidden">
            <p className="text-xs font-medium text-gray-600 mb-2">Vista diaria (Argentina)</p>
            <div className="flex flex-wrap gap-2">
                {fechas.map((f) => {
                    const activo = f.key === fechaSeleccionada
                    const cargando = isPending && f.key === fechaCambiando

                    return (
                        <button
                            key={f.key}
                            type="button"
                            onClick={() => cambiarFecha(f.key)}
                            disabled={isPending}
                            className={
                                activo
                                    ? 'rounded-md bg-blue-600 text-white px-3 py-2 text-sm font-medium disabled:opacity-70'
                                    : 'rounded-md border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-2 text-sm font-medium disabled:opacity-70'
                            }
                        >
                            <span className="inline-flex items-center gap-1.5">
                                {cargando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                {f.labelCorta}
                            </span>
                        </button>
                    )
                })}
            </div>
            {isPending && (
                <p className="mt-2 text-xs text-blue-700 inline-flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Cambiando día...
                </p>
            )}
        </div>
    )
}
