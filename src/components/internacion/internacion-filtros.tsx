'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useState, useTransition } from 'react'

interface ObraSocialOption {
    id: number
    nombre: string
}

interface InternacionFiltrosProps {
    q: string
    obraSocialIdFiltro: number | undefined
    obrasSociales: ObraSocialOption[]
    hayFiltros: boolean
    fechaReferencia: string
}

export function InternacionFiltros({
    q,
    obraSocialIdFiltro,
    obrasSociales,
    hayFiltros,
    fechaReferencia,
}: InternacionFiltrosProps) {
    const router = useRouter()
    const pathname = usePathname()
    const [isPending, startTransition] = useTransition()

    const [busqueda, setBusqueda] = useState(q)
    const [obraSocialId, setObraSocialId] = useState(
        obraSocialIdFiltro ? String(obraSocialIdFiltro) : ''
    )

    const aplicarFiltros = () => {
        const params = new URLSearchParams()
        if (fechaReferencia) params.set('fecha', fechaReferencia)
        if (busqueda.trim()) params.set('q', busqueda.trim())
        if (obraSocialId) params.set('obraSocialId', obraSocialId)
        const qs = params.toString()
        startTransition(() => {
            router.push(qs ? `${pathname}?${qs}` : pathname)
        })
    }

    const limpiarFiltros = () => {
        setBusqueda('')
        setObraSocialId('')
        startTransition(() => {
            router.push(fechaReferencia ? `${pathname}?fecha=${encodeURIComponent(fechaReferencia)}` : pathname)
        })
    }

    return (
        <div className="print:hidden mb-4 flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-56">
                <label className="text-xs font-medium text-gray-600 block mb-1">Buscar persona</label>
                <input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && aplicarFiltros()}
                    placeholder="Nombre, apellido, DNI o N° ingreso"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>
            <div className="min-w-56">
                <label className="text-xs font-medium text-gray-600 block mb-1">Obra social</label>
                <select
                    value={obraSocialId}
                    onChange={(e) => setObraSocialId(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    <option value="">Todas</option>
                    {obrasSociales.map((obra) => (
                        <option key={obra.id} value={obra.id}>{obra.nombre}</option>
                    ))}
                </select>
            </div>
            <button
                type="button"
                onClick={aplicarFiltros}
                disabled={isPending}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
                {isPending ? 'Buscando...' : 'Filtrar'}
            </button>
            {(hayFiltros || busqueda || obraSocialId) && (
                <button
                    type="button"
                    onClick={limpiarFiltros}
                    disabled={isPending}
                    className="rounded-md border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                >
                    Limpiar
                </button>
            )}
        </div>
    )
}
