'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface FichaQuirurgicaAltaCirugiaProps {
  ingresoId: number
  pacienteId: number
}

function todayInputDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function FichaQuirurgicaAltaCirugia({ ingresoId, pacienteId }: FichaQuirurgicaAltaCirugiaProps) {
  const router = useRouter()
  const [fechaCirugia, setFechaCirugia] = useState(todayInputDate())
  const [horaCirugia, setHoraCirugia] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!descripcion.trim()) {
      setError('La descripcion es obligatoria')
      return
    }

    setGuardando(true)
    setError(null)
    setOk(null)

    try {
      const res = await fetch(`/api/internacion/${ingresoId}/cirugias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pacienteId,
          fechaCirugia,
          horaCirugia: horaCirugia.trim() ? horaCirugia : null,
          descripcion: descripcion.trim(),
        }),
      })

      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload.error ?? 'No se pudo registrar la cirugia')
      }

      setDescripcion('')
      setHoraCirugia('')
      setOk('Cirugia registrada correctamente')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="his-card p-4 print:hidden">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">Agregar cirugia</h2>

      <form onSubmit={onSubmit} className="space-y-3">
        {error && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</p>
        )}
        {ok && (
          <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1.5">{ok}</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
            <input
              type="date"
              value={fechaCirugia}
              onChange={(e) => setFechaCirugia(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Hora (opcional)</label>
            <input
              type="time"
              value={horaCirugia}
              onChange={(e) => setHoraCirugia(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Descripcion de la cirugia</label>
          <textarea
            rows={3}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y"
            placeholder="Detalle de la cirugia"
            required
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={guardando}
            className="rounded-md bg-blue-600 text-white px-3 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
          >
            {guardando ? 'Guardando...' : 'Agregar cirugia'}
          </button>
        </div>
      </form>
    </section>
  )
}
