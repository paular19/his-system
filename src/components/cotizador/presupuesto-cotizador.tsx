'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, Plus, Trash2, Printer, RotateCcw, FileText, Loader2 } from 'lucide-react'
import { BuscarPaciente } from '@/components/admision/buscar-paciente'
import type { PacienteResumen } from '@/modules/admision/types'
import type { NomencladorPracticaItem } from '@/modules/orden/types'
import { formatearFechaHora, formatearMoneda } from '@/lib/utils'

type ItemPresupuesto = NomencladorPracticaItem & {
  key: string
  cantidad: number
}

type ApiRespuestaNomenclador = {
  ok: boolean
  data?: NomencladorPracticaItem[]
  error?: string
}

const PORCENTAJE_PACIENTE = 0.2

interface PresupuestoCotizadorProps {
  usuario: string
}

function generarNumeroPresupuesto() {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  return `PRE-${yyyy}${mm}${dd}-${hh}${min}`
}

function keyPractica(practica: Pick<NomencladorPracticaItem, 'convenioId' | 'codigo'>): string {
  return `${practica.convenioId}-${practica.codigo.trim().toUpperCase()}`
}

export function PresupuestoCotizador({ usuario }: PresupuestoCotizadorProps) {
  const [paciente, setPaciente] = useState<PacienteResumen | null>(null)
  const [pacienteManual, setPacienteManual] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null)
  const [resultadoBusqueda, setResultadoBusqueda] = useState<NomencladorPracticaItem[]>([])
  const [items, setItems] = useState<ItemPresupuesto[]>([])
  const [numeroPresupuesto] = useState(() => generarNumeroPresupuesto())

  const totalPrestaciones = useMemo(
    () => items.reduce((acc, item) => acc + (item.valor ?? 0) * item.cantidad, 0),
    [items]
  )

  const montoPaciente = useMemo(
    () => Number((totalPrestaciones * PORCENTAJE_PACIENTE).toFixed(2)),
    [totalPrestaciones]
  )

  const nombrePaciente = paciente?.nombreCompleto?.trim() || pacienteManual.trim() || 'No especificado'

  const convenioBusqueda = paciente?.obraSocialId ?? undefined

  async function buscarPracticas(termino: string) {
    const q = termino.trim()
    if (q.length < 2) {
      setResultadoBusqueda([])
      setBuscando(false)
      return
    }

    setBuscando(true)
    setErrorBusqueda(null)
    try {
      const params = new URLSearchParams()
      params.set('q', q)
      if (convenioBusqueda) params.set('convenioId', String(convenioBusqueda))

      const response = await fetch(`/api/practicas-nomenclador?${params.toString()}`, {
        cache: 'no-store',
      })
      const json = (await response.json()) as ApiRespuestaNomenclador

      if (!response.ok || !json.ok) {
        throw new Error(json.error ?? 'No se pudo consultar el nomenclador')
      }

      setResultadoBusqueda(Array.isArray(json.data) ? json.data : [])
    } catch (error) {
      setErrorBusqueda(
        error instanceof Error ? error.message : 'Error inesperado al consultar el nomenclador'
      )
      setResultadoBusqueda([])
    } finally {
      setBuscando(false)
    }
  }

  useEffect(() => {
    const q = busqueda.trim()
    if (q.length < 2) {
      setResultadoBusqueda([])
      setErrorBusqueda(null)
      return
    }

    const timer = setTimeout(() => {
      void buscarPracticas(q)
    }, 350)

    return () => clearTimeout(timer)
  }, [busqueda, convenioBusqueda])

  function agregarItem(item: NomencladorPracticaItem) {
    const key = keyPractica(item)
    setItems((prev) => {
      const existing = prev.find((it) => it.key === key)
      if (!existing) return [...prev, { ...item, key, cantidad: 1 }]

      return prev.map((it) =>
        it.key === key ? { ...it, cantidad: Math.max(1, it.cantidad + 1) } : it
      )
    })
    setBusqueda('')
    setResultadoBusqueda([])
  }

  function actualizarCantidad(key: string, value: string) {
    const parsed = Number.parseInt(value, 10)
    setItems((prev) =>
      prev.map((item) => {
        if (item.key !== key) return item
        if (!Number.isFinite(parsed) || parsed <= 0) return item
        return { ...item, cantidad: parsed }
      })
    )
  }

  function quitarItem(key: string) {
    setItems((prev) => prev.filter((item) => item.key !== key))
  }

  function limpiarPresupuesto() {
    setItems([])
    setObservaciones('')
    setPaciente(null)
    setPacienteManual('')
  }

  return (
    <div className="p-6 space-y-5">
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 10mm;
          }

          .presupuesto-print-sheet {
            display: block !important;
            width: 100%;
            color: #111827;
          }
        }

        @media screen {
          .presupuesto-print-sheet {
            display: none;
          }
        }
      `}</style>

      <div className="presupuesto-screen space-y-5 print:hidden">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <section className="xl:col-span-2 space-y-5">
            <div className="his-card p-4 space-y-4">
              <h3 className="text-sm font-semibold text-gray-700">Paciente</h3>
              <BuscarPaciente onSeleccionar={setPaciente} pacienteSeleccionado={paciente} />
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Nombre manual (opcional)
                </label>
                <input
                  value={pacienteManual}
                  onChange={(event) => setPacienteManual(event.target.value)}
                  placeholder="Ej: Juan Perez"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="his-card p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-gray-700">Buscar practicas del nomenclador</h3>
                <button
                  type="button"
                  onClick={() => {
                    setBusqueda('')
                    setResultadoBusqueda([])
                    setErrorBusqueda(null)
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Limpiar
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <div className="md:col-span-3 relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    value={busqueda}
                    onChange={(event) => setBusqueda(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void buscarPracticas(busqueda)
                      }
                    }}
                    placeholder="Codigo o descripcion"
                    className="w-full rounded-md border border-gray-300 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void buscarPracticas(busqueda)}
                  disabled={buscando}
                  className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {buscando ? 'Buscando...' : 'Buscar'}
                </button>
              </div>

              {errorBusqueda && (
                <p className="text-sm text-red-600">{errorBusqueda}</p>
              )}

              {buscando && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Buscando practicas...
                </div>
              )}

              {resultadoBusqueda.length > 0 ? (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b text-left">
                        <th className="px-3 py-2 font-medium text-gray-600">Codigo</th>
                        <th className="px-3 py-2 font-medium text-gray-600">Descripcion</th>
                        <th className="px-3 py-2 font-medium text-gray-600 text-right">Valor</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {resultadoBusqueda.map((prestacion) => (
                        <tr key={keyPractica(prestacion)} className="border-b last:border-b-0">
                          <td className="px-3 py-2 font-mono text-xs">{prestacion.codigo}</td>
                          <td className="px-3 py-2">{prestacion.descripcion}</td>
                          <td className="px-3 py-2 text-right">{formatearMoneda(prestacion.valor ?? 0)}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => agregarItem(prestacion)}
                              className="inline-flex items-center gap-1 rounded-md border border-blue-300 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Agregar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-md border border-dashed bg-gray-50 px-4 py-3 text-sm text-gray-500">
                  Escriba al menos 2 caracteres para buscar y agregar practicas.
                </div>
              )}
            </div>
          </section>

          <section className="space-y-5">
            <div className="his-card p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Resumen de presupuesto</h3>

              <div className="rounded-md border bg-gray-50 p-3 space-y-1 text-sm">
                <p className="text-gray-600">Numero: <span className="font-medium text-gray-900">{numeroPresupuesto}</span></p>
                <p className="text-gray-600">Fecha: <span className="font-medium text-gray-900">{formatearFechaHora(new Date())}</span></p>
                <p className="text-gray-600">Paciente: <span className="font-medium text-gray-900">{nombrePaciente}</span></p>
              </div>

              {items.length === 0 ? (
                <p className="text-sm text-gray-500">Aun no hay practicas agregadas.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {items.map((item) => (
                    <div key={item.key} className="rounded-md border p-2.5 bg-white">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-mono text-gray-500">{item.codigo}</p>
                          <p className="text-sm font-medium text-gray-900 leading-tight">{item.descripcion}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => quitarItem(item.key)}
                          className="text-gray-400 hover:text-red-600"
                          aria-label={`Quitar ${item.codigo}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <label className="text-xs text-gray-600 flex items-center gap-2">
                          Cantidad
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={item.cantidad}
                            onChange={(event) => actualizarCantidad(item.key, event.target.value)}
                            className="w-16 rounded-md border border-gray-300 px-2 py-1 text-xs"
                          />
                        </label>
                        <p className="text-sm font-semibold text-gray-900">
                          {formatearMoneda((item.valor ?? 0) * item.cantidad)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-md border-t pt-3 space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Total practicas</span>
                  <span className="font-semibold text-gray-900">{formatearMoneda(totalPrestaciones)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">20% a abonar</span>
                  <span className="font-semibold text-blue-700">{formatearMoneda(montoPaciente)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Observaciones</label>
                <textarea
                  value={observaciones}
                  onChange={(event) => setObservaciones(event.target.value)}
                  rows={3}
                  placeholder="Detalle adicional del presupuesto"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  disabled={items.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Printer className="h-4 w-4" />
                  Imprimir PDF
                </button>
                <button
                  type="button"
                  onClick={limpiarPresupuesto}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  Nuevo presupuesto
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="presupuesto-print-sheet ips-print-sheet">
        <div className="border-b-2 border-gray-900 pb-3 mb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <img src="/logo-clinica.png" alt="Logo Clinica" style={{ maxWidth: 96 }} />
              <div className="text-xs text-gray-700 leading-relaxed">
                <p className="text-sm font-bold text-gray-900">CLINICA SAN RAFAEL</p>
                <p>Av. Sarmiento 566, Salta Capital, Argentina</p>
                <p>Tel: 3872537289</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-medium text-gray-600">Documento</p>
              <p className="text-lg font-bold text-gray-900">PRESUPUESTO DE PRACTICAS</p>
              <p className="text-xs text-gray-600 mt-1">Nro: {numeroPresupuesto}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs mb-3">
          <div className="border rounded-md p-2">
            <p><span className="font-semibold">Paciente:</span> {nombrePaciente}</p>
            <p><span className="font-semibold">DNI:</span> {paciente?.numeroDocumento ?? '-'}</p>
            <p><span className="font-semibold">HC:</span> {paciente?.historiaClinica ?? '-'}</p>
          </div>
          <div className="border rounded-md p-2">
            <p><span className="font-semibold">Fecha emision:</span> {formatearFechaHora(new Date())}</p>
            <p><span className="font-semibold">Emitido por:</span> {usuario}</p>
            <p><span className="font-semibold">Condicion:</span> Paciente sin coseguro</p>
          </div>
        </div>

        <div className="ips-print-table rounded-md border overflow-hidden">
          <table>
            <thead>
              <tr>
                <th className="text-left">Codigo</th>
                <th className="text-left">Descripcion</th>
                <th className="text-right">Cant.</th>
                <th className="text-right">Unitario</th>
                <th className="text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={`print-${item.key}`}>
                  <td className="font-mono">{item.codigo}</td>
                  <td>{item.descripcion}</td>
                  <td className="text-right">{item.cantidad}</td>
                  <td className="text-right">{formatearMoneda(item.valor ?? 0)}</td>
                  <td className="text-right">{formatearMoneda((item.valor ?? 0) * item.cantidad)}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-gray-500 py-3">
                    Sin practicas cargadas.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="text-right">Total practicas</td>
                <td className="text-right">{formatearMoneda(totalPrestaciones)}</td>
              </tr>
              <tr>
                <td colSpan={4} className="text-right">20% a abonar por paciente</td>
                <td className="text-right">{formatearMoneda(montoPaciente)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 text-xs">
          <div className="border rounded-md p-2">
            <p className="font-semibold flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              Observaciones
            </p>
            <p className="mt-1 whitespace-pre-wrap">{observaciones.trim() || 'Sin observaciones.'}</p>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t grid grid-cols-2 gap-8 text-xs">
          <div>
            <p className="text-gray-500">Firma profesional / admision</p>
            <div className="mt-8 border-b border-gray-400" />
          </div>
          <div>
            <p className="text-gray-500">Firma paciente / responsable</p>
            <div className="mt-8 border-b border-gray-400" />
          </div>
        </div>
      </div>
    </div>
  )
}
