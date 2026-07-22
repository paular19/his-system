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

      <section className="hidden print:block border border-gray-400 p-3 text-[11px]">
        <div className="border-b pb-2 mb-2">
          <h2 className="text-sm font-semibold">Ficha de via</h2>
          <p>Internacion INT-{numeroIngreso}</p>
          <p>Paciente: {pacienteNombre ?? '—'}</p>
          <p>DNI: {pacienteDni ?? '—'}</p>
          <p>Obra social: {obraSocial ?? '—'}</p>
          <p>
            Via: {etiquetaTipoVia(viaActiva.tipo)} · Fecha/Hora:{' '}
            {formatearFechaHoraArgentina(viaActiva.fechaHora, {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
          <p>Profesional que indica: {viaActiva.profesionalNombre}</p>
        </div>

        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td className="border border-gray-400 p-2 align-top w-10">1</td>
              <td className="border border-gray-400 p-2 align-top whitespace-pre-wrap">{notas.item1 || ' '}</td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-2 align-top">2</td>
              <td className="border border-gray-400 p-2 align-top whitespace-pre-wrap">{notas.item2 || ' '}</td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-2 align-top">3</td>
              <td className="border border-gray-400 p-2 align-top whitespace-pre-wrap">{notas.item3 || ' '}</td>
            </tr>
            <tr>
              <td className="border border-gray-400 p-2 align-top">4</td>
              <td className="border border-gray-400 p-2 align-top whitespace-pre-wrap">{notas.item4 || ' '}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </>
  )
}
