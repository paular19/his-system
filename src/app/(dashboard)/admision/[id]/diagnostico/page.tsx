'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export default function NuevoDiagnosticoPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const ingresoId = parseInt(id, 10)

  const [descripcion, setDescripcion] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!descripcion.trim()) {
      setError('La descripción es requerida')
      return
    }
    setGuardando(true)
    setError(null)

    try {
      const res = await fetch(`/api/admision/${ingresoId}/diagnostico`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descripcion: descripcion.trim(),
          observaciones: observaciones.trim() || null,
          estado: 'A',
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Error al registrar')

      router.push(`/dashboard/admision/${ingresoId}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-4">
      <nav className="flex items-center gap-1 text-xs text-gray-500">
        <Link href="/dashboard/admision" className="hover:text-gray-700">
          Admisión
        </Link>
        <ChevronRight className="h-3 w-3" />
        <Link href={`/dashboard/admision/${ingresoId}`} className="hover:text-gray-700">
          Ingreso #{ingresoId}
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-gray-900 font-medium">Nuevo Diagnóstico</span>
      </nav>

      <div className="his-card p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          Registrar Diagnóstico
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Descripción <span className="text-red-500">*</span>
            </label>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={4}
              maxLength={500}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Diagnóstico o descripción clínica..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Observaciones
            </label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={2}
              maxLength={500}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Observaciones adicionales..."
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              disabled={guardando}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {guardando ? 'Guardando...' : 'Guardar Diagnóstico'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
