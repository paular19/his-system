'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, FileText, Plus, Trash2 } from 'lucide-react'
import { fechaHoraAInputLocal, formatearFechaHoraArgentina } from '@/lib/utils/argentina-date'
import { ProfesionalSelect } from '@/components/ui/profesional-select'
import {
  crearVia,
  eliminarVia,
  etiquetaTipoVia,
  leerVias,
  type TipoVia,
  type ViaRegistro,
} from '@/lib/utils/vias-storage'

interface ViaSectionProps {
  ingresoId: number
  numeroIngreso: number
  profesionales: Array<{ id: number; nombre: string; matricula?: number | null }>
  puedeCrear: boolean
}

export function ViasSection({ ingresoId, numeroIngreso, profesionales, puedeCrear }: ViaSectionProps) {
  const [expandido, setExpandido] = useState(true)
  const [vias, setVias] = useState<ViaRegistro[]>([])
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [tipoVia, setTipoVia] = useState<TipoVia>('SIMPLE')
  const [fechaHora, setFechaHora] = useState(() => fechaHoraAInputLocal())
  const [profesionalId, setProfesionalId] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setVias(leerVias(ingresoId))
  }, [ingresoId])

  const profesionalSeleccionado = useMemo(
    () => profesionales.find((item) => item.id === Number.parseInt(profesionalId, 10)) ?? null,
    [profesionales, profesionalId]
  )

  const handleGuardarVia = () => {
    if (!fechaHora.trim()) {
      setError('Debe indicar fecha y hora')
      return
    }

    if (!profesionalSeleccionado) {
      setError('Debe seleccionar el profesional que indica')
      return
    }

    const via = crearVia({
      ingresoId,
      tipo: tipoVia,
      fechaHora,
      profesionalId: profesionalSeleccionado.id,
      profesionalNombre: profesionalSeleccionado.nombre,
    })

    setVias((prev) => [via, ...prev].sort((a, b) => new Date(b.fechaHora).getTime() - new Date(a.fechaHora).getTime()))
    setError(null)
    setMostrarFormulario(false)
    setTipoVia('SIMPLE')
    setFechaHora(fechaHoraAInputLocal())
    setProfesionalId('')
  }

  const handleEliminarVia = (viaId: number) => {
    if (typeof window !== 'undefined') {
      const confirmar = window.confirm('Se eliminara la via y su ficha asociada. Continuar?')
      if (!confirmar) return
    }

    const siguientes = eliminarVia(ingresoId, viaId)
    setVias(siguientes)
  }

  return (
    <div className="his-card">
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <button
          type="button"
          onClick={() => setExpandido((prev) => !prev)}
          className="flex items-center gap-2 text-sm font-semibold text-gray-900 hover:text-gray-700"
        >
          Vias
          <span className="text-xs font-normal text-gray-400 ml-1">({vias.length})</span>
          {expandido ? (
            <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          )}
        </button>

        {puedeCrear && (
          <button
            type="button"
            onClick={() => {
              setMostrarFormulario((prev) => !prev)
              setError(null)
            }}
            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1 hover:bg-blue-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar via
          </button>
        )}
      </div>

      {expandido && (
        <div className="p-4 space-y-3">
          {mostrarFormulario && puedeCrear && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Nueva via</p>

              <div className="space-y-2">
                <p className="text-xs text-gray-600">Tipo de via</p>
                <div className="flex flex-wrap gap-3">
                  <label className="inline-flex items-center gap-1.5 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={tipoVia === 'SIMPLE'}
                      onChange={(e) => {
                        if (e.target.checked) setTipoVia('SIMPLE')
                      }}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Simple
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={tipoVia === 'DOBLE_LUMEN'}
                      onChange={(e) => {
                        if (e.target.checked) setTipoVia('DOBLE_LUMEN')
                      }}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Doble lumen
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={tipoVia === 'CATETER_HEMODIALISIS'}
                      onChange={(e) => {
                        if (e.target.checked) setTipoVia('CATETER_HEMODIALISIS')
                      }}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Cateter de hemodialisis
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Fecha y hora</label>
                  <input
                    type="datetime-local"
                    value={fechaHora}
                    onChange={(e) => setFechaHora(e.target.value)}
                    className="his-input text-sm w-full"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Profesional que indica</label>
                  <ProfesionalSelect
                    profesionales={profesionales}
                    value={profesionalId}
                    onChange={setProfesionalId}
                    placeholderOption="-- Seleccionar profesional --"
                    searchPlaceholder="Buscar por nombre o matricula"
                    selectClassName="w-full rounded border border-gray-300 bg-white px-2 py-2 text-xs text-gray-900"
                    searchClassName="mt-1 w-full rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700"
                  />
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setMostrarFormulario(false)
                    setError(null)
                  }}
                  className="text-xs text-gray-600 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleGuardarVia}
                  className="text-xs font-medium bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700"
                >
                  Guardar via
                </button>
              </div>
            </div>
          )}

          {vias.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3">Sin vias registradas</p>
          ) : (
            <div className="space-y-2">
              {vias.map((via) => (
                <div key={via.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="font-semibold text-gray-900">{etiquetaTipoVia(via.tipo)}</p>
                      <p className="text-gray-600">
                        {formatearFechaHoraArgentina(via.fechaHora, {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      <p className="text-gray-600">Indica: {via.profesionalNombre}</p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/dashboard/internacion/${ingresoId}/ficha-vias?viaId=${via.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Ficha de via
                      </Link>
                      {puedeCrear && (
                        <button
                          type="button"
                          onClick={() => handleEliminarVia(via.id)}
                          className="inline-flex h-6 w-6 items-center justify-center rounded border border-red-200 bg-white text-red-700 hover:bg-red-50"
                          title="Eliminar via"
                          aria-label="Eliminar via"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-[11px] text-gray-500">
            Internacion INT-{numeroIngreso}. La ficha de via se completa e imprime desde el boton de cada registro.
          </p>
        </div>
      )}
    </div>
  )
}
