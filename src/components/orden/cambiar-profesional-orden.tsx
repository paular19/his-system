'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ProfesionalSelect } from '@/components/ui/profesional-select'
import { nombreProfesionalParaMostrar, type ProfesionalBasico } from '@/lib/profesionales'

interface CambiarProfesionalOrdenProps {
  puestoNumero: number
  numero: number
  profesionalActual: { id: number; nombre: string; matricula: number | null } | null
  /** La orden esta anulada o facturada: se muestra el motivo y no se permite editar. */
  bloqueo?: string | null
}

export function CambiarProfesionalOrden({
  puestoNumero,
  numero,
  profesionalActual,
  bloqueo = null,
}: CambiarProfesionalOrdenProps) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [profesionales, setProfesionales] = useState<ProfesionalBasico[]>([])
  const [cargandoLista, setCargandoLista] = useState(false)
  const [seleccion, setSeleccion] = useState(profesionalActual ? String(profesionalActual.id) : '')
  const [actualizarEfector, setActualizarEfector] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto || profesionales.length > 0 || cargandoLista) return

    let cancelado = false
    setCargandoLista(true)

    fetch('/api/cirugia/profesionales')
      .then((res) => res.json())
      .then((json) => {
        if (cancelado) return
        if (!json?.ok || !Array.isArray(json.data)) {
          throw new Error(json?.error ?? 'No se pudo cargar el listado de profesionales')
        }
        setProfesionales(json.data as ProfesionalBasico[])
      })
      .catch((err: unknown) => {
        if (cancelado) return
        setError(err instanceof Error ? err.message : 'No se pudo cargar el listado de profesionales')
      })
      .finally(() => {
        if (!cancelado) setCargandoLista(false)
      })

    return () => {
      cancelado = true
    }
  }, [abierto, profesionales.length, cargandoLista])

  const guardar = async () => {
    const profesionalId = Number.parseInt(seleccion, 10)
    if (!Number.isFinite(profesionalId) || profesionalId <= 0) {
      setError('Elegi un profesional')
      return
    }
    if (profesionalActual && profesionalId === profesionalActual.id) {
      setError('La orden ya esta a nombre de ese profesional')
      return
    }

    setError(null)
    setAviso(null)
    setGuardando(true)

    try {
      const res = await fetch(`/api/ordenes/${puestoNumero}/${numero}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profesionalId,
          actualizarEfectorEspecialista: actualizarEfector,
        }),
      })

      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? 'No se pudo cambiar el profesional')
      }

      const data = json.data as {
        profesionalNuevo: { nombre: string; matricula: number | null }
        itemsEfectorActualizados: number
        practicasEspecialistaActualizadas: number
      }

      setAviso(
        `Orden a nombre de ${nombreProfesionalParaMostrar(data.profesionalNuevo.nombre)}. ` +
          `Items con honorario especialista reasignado: ${data.itemsEfectorActualizados}.`
      )
      setAbierto(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el profesional')
    } finally {
      setGuardando(false)
    }
  }

  const etiquetaActual = profesionalActual
    ? `${nombreProfesionalParaMostrar(profesionalActual.nombre)}${
        profesionalActual.matricula ? ` · MP ${profesionalActual.matricula}` : ''
      }`
    : 'Sin profesional asignado'

  return (
    <div className="no-print rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs text-gray-600">Profesional que suscribe:</span>
        <span className="text-sm font-medium text-gray-900">{etiquetaActual}</span>

        {bloqueo ? (
          <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">
            {bloqueo}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => {
              setAbierto((prev) => !prev)
              setError(null)
              setAviso(null)
            }}
            className="rounded border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50"
          >
            {abierto ? 'Cancelar' : 'Cambiar profesional'}
          </button>
        )}
      </div>

      {aviso && (
        <p className="mt-2 rounded border border-green-200 bg-green-50 px-2 py-1 text-[11px] text-green-800">
          {aviso}
        </p>
      )}

      {abierto && !bloqueo && (
        <div className="mt-3 max-w-md space-y-2">
          <ProfesionalSelect
            profesionales={profesionales}
            value={seleccion}
            onChange={setSeleccion}
            disabled={guardando || cargandoLista}
            placeholderOption={cargandoLista ? 'Cargando profesionales...' : '-- Seleccionar profesional --'}
            permitirCargaManual
          />

          <label className="flex items-start gap-2 text-[11px] text-gray-700">
            <input
              type="checkbox"
              checked={actualizarEfector}
              onChange={(e) => setActualizarEfector(e.target.checked)}
              disabled={guardando}
              className="mt-0.5"
            />
            <span>
              Reasignar tambien el honorario especialista de las practicas que hoy figuran a nombre
              del profesional anterior. Los renglones de gastos y anestesia no se tocan.
            </span>
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void guardar()}
              disabled={guardando || cargandoLista}
              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {guardando ? 'Guardando...' : 'Guardar cambio'}
            </button>
          </div>

          {error && (
            <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
