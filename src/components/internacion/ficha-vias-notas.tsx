'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatearFechaHoraArgentina } from '@/lib/utils/argentina-date'
import {
  etiquetaTipoVia,
  guardarFichaVia,
  leerFichaVia,
  leerVias,
  type ViaFichaNotas,
} from '@/lib/utils/vias-storage'

type FichaViasNotasProps = {
  ingresoId: number
  numeroIngreso: number
  pacienteNombre: string | null
  pacienteDni: string | null
  obraSocial: string | null
  viaIdInicial: number | null
  puedeEditar: boolean
}

const EMPTY_NOTAS: ViaFichaNotas = {
  item1: '',
  item2: '',
  item3: '',
  item4: '',
}

export function FichaViasNotas({
  ingresoId,
  numeroIngreso,
  pacienteNombre,
  pacienteDni,
  obraSocial,
  viaIdInicial,
  puedeEditar,
}: FichaViasNotasProps) {
  const [vias, setVias] = useState(() => leerVias(ingresoId))
  const [viaActivaId, setViaActivaId] = useState<number | null>(viaIdInicial)
  const [notas, setNotas] = useState<ViaFichaNotas>(EMPTY_NOTAS)
  const [mensaje, setMensaje] = useState<string | null>(null)

  useEffect(() => {
    const lista = leerVias(ingresoId)
    setVias(lista)

    if (lista.length === 0) {
      setViaActivaId(null)
      return
    }

    const existeInicial = viaIdInicial != null && lista.some((item) => item.id === viaIdInicial)
    const siguienteId = existeInicial ? viaIdInicial : lista[0]?.id ?? null
    setViaActivaId((prev) => prev ?? siguienteId)
  }, [ingresoId, viaIdInicial])

  const viaActiva = useMemo(
    () => vias.find((via) => via.id === viaActivaId) ?? null,
    [vias, viaActivaId]
  )

  useEffect(() => {
    if (!viaActiva) {
      setNotas(EMPTY_NOTAS)
      return
    }

    setNotas(leerFichaVia(ingresoId, viaActiva.id))
    setMensaje(null)
  }, [ingresoId, viaActiva])

  const guardar = () => {
    if (!viaActiva) return
    guardarFichaVia(ingresoId, viaActiva.id, notas)
    setMensaje('Ficha de via guardada.')
  }

  const limpiar = () => {
    if (!viaActiva) return
    setNotas(EMPTY_NOTAS)
    guardarFichaVia(ingresoId, viaActiva.id, EMPTY_NOTAS)
    setMensaje('Ficha de via limpiada.')
  }

  const desarrolloTexto = [
    `1) ${notas.item1.trim() || '............................................................'}`,
    `2) ${notas.item2.trim() || '............................................................'}`,
    `3) ${notas.item3.trim() || '............................................................'}`,
    `4) ${notas.item4.trim() || '............................................................'}`,
  ].join('\n')

  if (!viaActiva) {
    return (
      <section className="his-card p-5 text-sm text-gray-500">
        No hay vias registradas para esta internacion. Cargalas primero desde la ficha de internacion.
      </section>
    )
  }

  const viaFechaLabel = formatearFechaHoraArgentina(viaActiva.fechaHora, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const viaHoraLabel = formatearFechaHoraArgentina(viaActiva.fechaHora, {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <>
      <section className="his-card p-4 print:hidden space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Via seleccionada</label>
            <select
              value={String(viaActiva.id)}
              onChange={(e) => setViaActivaId(Number.parseInt(e.target.value, 10))}
              className="w-full rounded border border-gray-300 bg-white px-2 py-2 text-sm"
            >
              {vias.map((via) => (
                <option key={via.id} value={via.id}>
                  {etiquetaTipoVia(via.tipo)} - {formatearFechaHoraArgentina(via.fechaHora, {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Tipo</label>
            <input
              value={etiquetaTipoVia(viaActiva.tipo)}
              readOnly
              className="w-full rounded border border-gray-300 bg-gray-50 px-2 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Profesional que indica</label>
            <input
              value={viaActiva.profesionalNombre}
              readOnly
              className="w-full rounded border border-gray-300 bg-gray-50 px-2 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Item 1</label>
            <textarea
              rows={3}
              value={notas.item1}
              onChange={(e) => setNotas((prev) => ({ ...prev, item1: e.target.value }))}
              disabled={!puedeEditar}
              className="w-full rounded border border-gray-300 bg-white px-2 py-2 text-sm resize-y disabled:bg-gray-100"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Item 2</label>
            <textarea
              rows={3}
              value={notas.item2}
              onChange={(e) => setNotas((prev) => ({ ...prev, item2: e.target.value }))}
              disabled={!puedeEditar}
              className="w-full rounded border border-gray-300 bg-white px-2 py-2 text-sm resize-y disabled:bg-gray-100"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Item 3</label>
            <textarea
              rows={3}
              value={notas.item3}
              onChange={(e) => setNotas((prev) => ({ ...prev, item3: e.target.value }))}
              disabled={!puedeEditar}
              className="w-full rounded border border-gray-300 bg-white px-2 py-2 text-sm resize-y disabled:bg-gray-100"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Item 4</label>
            <textarea
              rows={3}
              value={notas.item4}
              onChange={(e) => setNotas((prev) => ({ ...prev, item4: e.target.value }))}
              disabled={!puedeEditar}
              className="w-full rounded border border-gray-300 bg-white px-2 py-2 text-sm resize-y disabled:bg-gray-100"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-gray-500">
            Desarrollo imprimible:
            <span className="ml-1 whitespace-pre-wrap text-gray-600">{desarrolloTexto}</span>
          </p>
          {puedeEditar && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={limpiar}
                className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
              >
                Limpiar
              </button>
              <button
                type="button"
                onClick={guardar}
                className="rounded border border-blue-200 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                Guardar ficha
              </button>
            </div>
          )}
        </div>

        {mensaje && <p className="text-xs text-green-700">{mensaje}</p>}
      </section>

      <section className="hidden print:block">
        <div className="mx-auto w-full max-w-225 rounded bg-white text-[10.2px] text-black print:max-w-none print:rounded-none print:text-[9.8px]">
          <div className="border border-black print:h-[274mm] print:overflow-hidden">
            <div className="grid grid-cols-[46%_22%_32%] border-b border-black">
              <div className="border-r border-black px-2 py-1">
                <span className="font-semibold uppercase">APELLIDO Y NOMBRE</span> {(pacienteNombre ?? '').trim()}
              </div>
              <div className="border-r border-black px-2 py-1">
                <span className="font-semibold uppercase">DNI N</span> {(pacienteDni ?? '').trim()}
              </div>
              <div className="px-2 py-1">
                <span className="font-semibold uppercase">O SOCIAL</span> {(obraSocial ?? '').trim()}
              </div>
            </div>

            <div className="grid grid-cols-2 border-b border-black">
              <div className="border-r border-black px-2 py-1">
                <span className="font-semibold uppercase">PROFESIONAL QUE INDICA</span> {viaActiva.profesionalNombre.trim()}
              </div>
              <div className="px-2 py-1">
                <span className="font-semibold uppercase">TIPO DE VIA</span> {etiquetaTipoVia(viaActiva.tipo)}
              </div>
            </div>

            <div className="grid grid-cols-2 border-b border-black">
              <div className="border-r border-black px-2 py-1">
                <span className="font-semibold uppercase">INTERNACION</span> INT-{numeroIngreso}
              </div>
              <div className="px-2 py-1">
                <span className="font-semibold uppercase">FICHA</span> VIA
              </div>
            </div>

            <div className="grid grid-cols-2 border-b border-black">
              <div className="border-r border-black px-2 py-1">
                <span className="font-semibold uppercase">OBSERVACIONES</span>
              </div>
              <div className="px-2 py-1">
                <span className="font-semibold uppercase">DESARROLLO EN RENGLONES</span>
              </div>
            </div>

            <div className="grid grid-cols-[20%_48%_32%] border-b border-black">
              <div className="border-r border-black px-2 py-1">
                <span className="font-semibold uppercase">FECHA</span> {viaFechaLabel}
              </div>
              <div className="border-r border-black px-2 py-1">
                <span className="font-semibold uppercase">HORA</span> {viaHoraLabel}
              </div>
              <div className="px-2 py-1">
                <span className="font-semibold uppercase">TERMINO</span>
              </div>
            </div>

            <div className="grid grid-cols-[16%_30%_30%_24%] border-b border-black">
              <div className="border-r border-black px-2 py-1 font-semibold uppercase">ORDENAMIENTO</div>
              <div className="border-r border-black px-2 py-1 font-semibold uppercase">1</div>
              <div className="border-r border-black px-2 py-1 font-semibold uppercase">2</div>
              <div className="px-2 py-1 font-semibold uppercase">3</div>
            </div>

            <div className="grid grid-cols-[16%_44%_40%] border-b border-black">
              <div className="border-r border-black px-2 py-1" />
              <div className="border-r border-black px-2 py-1 font-semibold uppercase">4</div>
              <div className="px-2 py-1 font-semibold uppercase">FIRMA</div>
            </div>

            <div className="relative h-[221mm] overflow-hidden">
              <div className="pointer-events-none absolute inset-x-0 top-0 bottom-[48mm] z-0">
                {Array.from({ length: 22 }).map((_, index) => (
                  <div
                    key={`renglon-${index}`}
                    className="absolute left-0 right-0 border-b border-black/90"
                    style={{ top: `${(index + 1) * 7.8}mm` }}
                  />
                ))}
              </div>

              <div className="absolute inset-0 z-10 px-2 pt-[0.9mm] pb-[48mm] pr-2 text-[9.8px] leading-[7.8mm] whitespace-pre-wrap wrap-break-word">
                {desarrolloTexto}
              </div>

              <div className="absolute bottom-0 left-0 z-20 h-[46mm] w-[33%] border-r border-t border-black bg-white px-2 py-1 text-[8.7px]">
                <p className="font-semibold uppercase">DATOS DE VIA</p>
                <div className="mt-0.5 space-y-0.5">
                  <p>Tipo: {etiquetaTipoVia(viaActiva.tipo)}</p>
                  <p>Profesional: {viaActiva.profesionalNombre.trim() || '________________'}</p>
                  <p>Fecha: {viaFechaLabel || '________________'}</p>
                  <p>Hora: {viaHoraLabel || '________________'}</p>
                  <p>Internacion: INT-{numeroIngreso}</p>
                </div>
              </div>

              <div className="absolute bottom-0 right-0 z-20 h-[47mm] w-[34%] border-l border-t border-black bg-white px-2">
                <div className="h-[16mm]" />
                <div className="border-b border-black" />
                <p className="mt-1 text-[10px] font-semibold">Firma y sello</p>
                <p className="text-[10px]">Profesional que indica: {viaActiva.profesionalNombre || '________________'}</p>
                <p className="text-[10px]">Matricula: __________________</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
