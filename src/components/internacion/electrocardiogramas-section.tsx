'use client'

import { useEffect, useState, useTransition } from 'react'
import { HeartPulse, Plus, Search, Trash2, X } from 'lucide-react'
import { fechaAInputLocal, formatearFechaArgentina } from '@/lib/utils/argentina-date'
import {
  buscarOrdenesParaElectrocardiogramaAction,
  crearElectrocardiogramaAction,
  eliminarElectrocardiogramaAction,
  listarElectrocardiogramasAction,
} from '@/modules/internacion/actions/electrocardiogramas'

type Electrocardiograma = Awaited<ReturnType<typeof listarElectrocardiogramasAction>>[number]
type OrdenResultado = Awaited<ReturnType<typeof buscarOrdenesParaElectrocardiogramaAction>>[number]

interface ElectrocardiogramasSectionProps {
  ingresoId: number
  puedeModificar: boolean
}

function claveOrden(orden: OrdenResultado): string {
  return `${orden.puestoNumero}-${orden.ordenNumero}-${orden.item}`
}

export function ElectrocardiogramasSection({ ingresoId, puedeModificar }: ElectrocardiogramasSectionProps) {
  const [registros, setRegistros] = useState<Electrocardiograma[]>([])
  const [cargando, setCargando] = useState(true)
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [fecha, setFecha] = useState(() => fechaAInputLocal())
  const [hora, setHora] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [ordenes, setOrdenes] = useState<OrdenResultado[]>([])
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<OrdenResultado | null>(null)
  const [buscandoOrdenes, iniciarBusqueda] = useTransition()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    setCargando(true)
    listarElectrocardiogramasAction(ingresoId)
      .then((data) => {
        if (activo) setRegistros(data)
      })
      .catch((err) => {
        if (activo) setError(err instanceof Error ? err.message : 'No se pudieron cargar los electrocardiogramas')
      })
      .finally(() => {
        if (activo) setCargando(false)
      })
    return () => { activo = false }
  }, [ingresoId])

  useEffect(() => {
    if (!mostrarFormulario || ordenSeleccionada) return
    const timeout = window.setTimeout(() => {
      iniciarBusqueda(async () => {
        try {
          const resultados = await buscarOrdenesParaElectrocardiogramaAction({ ingresoId, q: busqueda })
          setOrdenes(resultados)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'No se pudieron buscar las órdenes')
        }
      })
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [busqueda, ingresoId, mostrarFormulario, ordenSeleccionada])

  const cerrarFormulario = () => {
    setMostrarFormulario(false)
    setFecha(fechaAInputLocal())
    setHora('')
    setBusqueda('')
    setOrdenes([])
    setOrdenSeleccionada(null)
    setError(null)
  }

  const guardar = async () => {
    if (!fecha) {
      setError('Debe indicar la fecha del electrocardiograma')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      const creado = await crearElectrocardiogramaAction({
        ingresoId,
        fecha,
        hora: hora || null,
        orden: ordenSeleccionada ? {
          puestoNumero: ordenSeleccionada.puestoNumero,
          ordenNumero: ordenSeleccionada.ordenNumero,
          item: ordenSeleccionada.item,
        } : null,
      })
      setRegistros((actuales) => [creado, ...actuales])
      cerrarFormulario()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el electrocardiograma')
    } finally {
      setGuardando(false)
    }
  }

  const eliminar = async (id: number) => {
    if (!window.confirm('¿Eliminar este electrocardiograma?')) return
    setError(null)
    try {
      await eliminarElectrocardiogramaAction(id, ingresoId)
      setRegistros((actuales) => actuales.filter((registro) => registro.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el electrocardiograma')
    }
  }

  return (
    <section className="his-card">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 p-4">
        <div className="flex items-center gap-2">
          <HeartPulse className="h-4 w-4 text-rose-600" />
          <h3 className="text-sm font-semibold text-gray-900">Electrocardiogramas</h3>
          <span className="text-xs text-gray-400">({registros.length})</span>
        </div>
        {puedeModificar && !mostrarFormulario && (
          <button
            type="button"
            onClick={() => setMostrarFormulario(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar
          </button>
        )}
      </div>

      <div className="space-y-3 p-4">
        {mostrarFormulario && puedeModificar && (
          <div className="space-y-3 rounded-lg border border-rose-100 bg-rose-50/30 p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Fecha</label>
                <input type="date" value={fecha} onChange={(event) => setFecha(event.target.value)} className="his-input w-full text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Hora (opcional)</label>
                <input type="time" value={hora} onChange={(event) => setHora(event.target.value)} className="his-input w-full text-sm" />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Orden vinculada (opcional)</label>
              {ordenSeleccionada ? (
                <div className="flex items-start justify-between gap-2 rounded border border-rose-200 bg-white px-3 py-2 text-xs">
                  <div>
                    <p className="font-medium text-gray-900">
                      Orden {ordenSeleccionada.puestoNumero}-{ordenSeleccionada.ordenNumero} · {ordenSeleccionada.codigoPractica}
                    </p>
                    <p className="mt-0.5 text-gray-600">{ordenSeleccionada.descripcionPractica ?? 'Sin descripción'}</p>
                  </div>
                  <button type="button" onClick={() => setOrdenSeleccionada(null)} className="text-gray-500 hover:text-gray-800" title="Quitar orden" aria-label="Quitar orden">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                    <input
                      type="search"
                      value={busqueda}
                      onChange={(event) => setBusqueda(event.target.value)}
                      placeholder="Buscar electrocardiograma, código o número de orden"
                      className="his-input w-full pl-8 text-sm"
                    />
                  </div>
                  <div className="mt-1 max-h-48 overflow-y-auto rounded border border-gray-200 bg-white">
                    {buscandoOrdenes ? (
                      <p className="px-3 py-2 text-xs text-gray-500">Buscando órdenes...</p>
                    ) : ordenes.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-gray-500">No se encontraron órdenes activas del paciente.</p>
                    ) : ordenes.map((orden) => (
                      <button
                        key={claveOrden(orden)}
                        type="button"
                        onClick={() => setOrdenSeleccionada(orden)}
                        className="block w-full border-b border-gray-100 px-3 py-2 text-left text-xs last:border-b-0 hover:bg-rose-50"
                      >
                        <span className="font-medium text-gray-900">{orden.codigoPractica} · {orden.descripcionPractica ?? 'Sin descripción'}</span>
                        <span className="mt-0.5 block text-gray-500">
                          Orden {orden.puestoNumero}-{orden.ordenNumero} · {formatearFechaArgentina(orden.fechaEmision)}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {error && <p className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={cerrarFormulario} disabled={guardando} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">Cancelar</button>
              <button type="button" onClick={guardar} disabled={guardando} className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-60">
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        )}

        {!mostrarFormulario && error && <p className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</p>}
        {cargando ? (
          <p className="py-3 text-center text-xs text-gray-400">Cargando...</p>
        ) : registros.length === 0 ? (
          <p className="py-3 text-center text-xs text-gray-400">Sin electrocardiogramas registrados</p>
        ) : (
          <div className="space-y-2">
            {registros.map((registro) => (
              <div key={registro.id} className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 text-xs">
                <div>
                  <p className="font-semibold text-gray-900">
                    {formatearFechaArgentina(`${registro.fecha}T12:00:00-03:00`)}{registro.hora ? ` · ${registro.hora}` : ''}
                  </p>
                  {registro.ordenNumero != null ? (
                    <p className="mt-0.5 text-gray-600">
                      Orden {registro.puestoNumero}-{registro.ordenNumero} · {registro.codigoPractica} · {registro.descripcionPractica ?? 'Sin descripción'}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-gray-400">Sin orden vinculada</p>
                  )}
                </div>
                {puedeModificar && (
                  <button type="button" onClick={() => eliminar(registro.id)} className="text-red-600 hover:text-red-800" title="Eliminar electrocardiograma" aria-label="Eliminar electrocardiograma">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
