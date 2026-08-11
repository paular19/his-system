'use client'

import { CalendarRange, Loader2, X } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'

interface InternacionRangoFechasProps {
  fechaDesde: string
  fechaHasta: string
}

export function InternacionRangoFechas({
  fechaDesde,
  fechaHasta,
}: InternacionRangoFechasProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [desde, setDesde] = useState(fechaDesde)
  const [hasta, setHasta] = useState(fechaHasta)
  const rangoInvalido = Boolean(desde && hasta && desde > hasta)

  function navegar(params: URLSearchParams) {
    const query = params.toString()
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname)
    })
  }

  function aplicarRango() {
    if (rangoInvalido) return

    const params = new URLSearchParams(searchParams.toString())
    if (desde) params.set('ingresoDesde', desde)
    else params.delete('ingresoDesde')
    if (hasta) params.set('ingresoHasta', hasta)
    else params.delete('ingresoHasta')
    navegar(params)
  }

  function limpiarRango() {
    setDesde('')
    setHasta('')
    const params = new URLSearchParams(searchParams.toString())
    params.delete('ingresoDesde')
    params.delete('ingresoHasta')
    navegar(params)
  }

  return (
    <div className="pdf-export-actions print:hidden mb-3 flex flex-wrap items-end gap-3 rounded-md border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center gap-2 self-center text-sm font-medium text-gray-700">
        <CalendarRange className="h-4 w-4" />
        Fecha de ingreso
      </div>
      <div>
        <label htmlFor="internacion-ingreso-desde" className="mb-1 block text-xs font-medium text-gray-600">
          Desde
        </label>
        <input
          id="internacion-ingreso-desde"
          type="date"
          value={desde}
          max={hasta || undefined}
          onChange={(event) => setDesde(event.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label htmlFor="internacion-ingreso-hasta" className="mb-1 block text-xs font-medium text-gray-600">
          Hasta
        </label>
        <input
          id="internacion-ingreso-hasta"
          type="date"
          value={hasta}
          min={desde || undefined}
          onChange={(event) => setHasta(event.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <button
        type="button"
        onClick={aplicarRango}
        disabled={isPending || rangoInvalido}
        className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Aplicar rango
      </button>
      {(fechaDesde || fechaHasta || desde || hasta) && (
        <button
          type="button"
          onClick={limpiarRango}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-60"
        >
          <X className="h-4 w-4" />
          Limpiar rango
        </button>
      )}
      {rangoInvalido && (
        <p className="basis-full text-xs text-red-600">La fecha desde no puede ser posterior a la fecha hasta.</p>
      )}
    </div>
  )
}
