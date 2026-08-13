'use client'

import Image from 'next/image'
import Link from 'next/link'
import { BedDouble, CalendarRange, FileDown, X } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { PrintButton } from '@/components/ui/print-button'

export interface CensoInternacionRow {
  id: number
  fechaIngresoKey: string
  ingreso: string
  fechaIngreso: string
  historiaClinica: string
  paciente: string
  documentoEdadAfiliado: string[]
  cobertura: string
  coseguro: string
  sector: string
  habitacionCama: string
  estadoHabitacion: string
  habitacionBloqueada: boolean
  diagnostico: string
  medicoTratante: string
  matricula: string
  diasInternacion: number
  egreso: string
}

interface CensoInternacionProps {
  rows: CensoInternacionRow[]
  fechaLabel: string
  fechaSeleccionada: string
  ingresoDesdeInicial: string
  ingresoHastaInicial: string
  filtrosBase: string[]
  pdfQueryBase: string
}

function formatearFechaInput(value: string): string {
  if (!value) return ''
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

export function CensoInternacion({
  rows,
  fechaLabel,
  fechaSeleccionada,
  ingresoDesdeInicial,
  ingresoHastaInicial,
  filtrosBase,
  pdfQueryBase,
}: CensoInternacionProps) {
  const [desde, setDesde] = useState(ingresoDesdeInicial)
  const [hasta, setHasta] = useState(ingresoHastaInicial)
  const [rangoAplicado, setRangoAplicado] = useState({
    desde: ingresoDesdeInicial,
    hasta: ingresoHastaInicial,
  })
  const rangoDiferido = useDeferredValue(rangoAplicado)
  const rangoInvalido = Boolean(desde && hasta && desde > hasta)

  const rowsFiltradas = rows.filter((row) => {
    // Lógica de solapamiento: paciente activo estaba internado durante el período
    // si ingresó en o antes del "hasta". El "desde" no excluye activos porque siguen internados hoy.
    if (rangoDiferido.hasta && row.fechaIngresoKey > rangoDiferido.hasta) return false
    return true
  })

  const resumen = Array.from(
    rowsFiltradas.reduce((resultado, row) => {
      const actual = resultado.get(row.cobertura) ?? { nombre: row.cobertura, internados: 0, dias: 0 }
      actual.internados += 1
      actual.dias += row.diasInternacion
      resultado.set(row.cobertura, actual)
      return resultado
    }, new Map<string, { nombre: string; internados: number; dias: number }>()).values()
  ).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  const totalDias = rowsFiltradas.reduce((total, row) => total + row.diasInternacion, 0)
  const filtrosRango = [
    rangoAplicado.desde ? `Ingreso desde: ${formatearFechaInput(rangoAplicado.desde)}` : '',
    rangoAplicado.hasta ? `Ingreso hasta: ${formatearFechaInput(rangoAplicado.hasta)}` : '',
  ].filter(Boolean)
  const filtros = [...filtrosBase, ...filtrosRango]
  const pdfParams = new URLSearchParams(pdfQueryBase)
  if (rangoAplicado.desde) pdfParams.set('ingresoDesde', rangoAplicado.desde)
  else pdfParams.delete('ingresoDesde')
  if (rangoAplicado.hasta) pdfParams.set('ingresoHasta', rangoAplicado.hasta)
  else pdfParams.delete('ingresoHasta')
  const pdfHref = `/api/internacion/censo-pdf?${pdfParams.toString()}`

  function actualizarUrl(nuevoDesde: string, nuevoHasta: string) {
    const url = new URL(window.location.href)
    if (nuevoDesde) url.searchParams.set('ingresoDesde', nuevoDesde)
    else url.searchParams.delete('ingresoDesde')
    if (nuevoHasta) url.searchParams.set('ingresoHasta', nuevoHasta)
    else url.searchParams.delete('ingresoHasta')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }

  function aplicarRango() {
    if (rangoInvalido) return
    setRangoAplicado({ desde, hasta })
    actualizarUrl(desde, hasta)
  }

  function limpiarRango() {
    setDesde('')
    setHasta('')
    setRangoAplicado({ desde: '', hasta: '' })
    actualizarUrl('', '')
  }

  return (
    <div id="censo-internacion" className="ips-print-sheet">
      <div className="hidden print:flex items-center justify-between border-b border-gray-400 pb-3 mb-3">
        <div className="flex items-center gap-4">
          <Image src="/logo-clinica.png" alt="Logo de Clinica San Rafael" width={208} height={144} className="h-auto w-26" priority />
          <div>
            <h1 className="text-lg font-bold text-gray-900">CLINICA SAN RAFAEL</h1>
            <p className="text-xs text-gray-700">Email: admisionsanar@gmail.com</p>
            <p className="text-xs text-gray-700">Tel. 0387 431-8111</p>
            <p className="text-xs text-gray-700">Av. Sarmiento 566</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-base font-semibold text-gray-900">Censo de internacion</p>
          <p className="text-xs text-gray-700">Fecha: {fechaLabel}</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-gray-900">
          Internaciones activas
          <span className="ml-2 text-sm font-normal text-gray-500">({rowsFiltradas.length})</span>
        </h2>
        <div className="print:hidden flex items-center gap-2">
          <PrintButton label="Imprimir censo" className="flex items-center gap-2 rounded-md border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-3 py-2" />
          <a href={pdfHref} className="flex items-center gap-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2">
            <FileDown className="h-4 w-4" />
            Generar PDF
          </a>
        </div>
      </div>

      <div className="print:hidden mb-3 flex flex-wrap items-end gap-3 rounded-md border border-gray-200 bg-gray-50 p-3">
        <div className="flex items-center gap-2 self-center text-sm font-medium text-gray-700"><CalendarRange className="h-4 w-4" />Fecha de ingreso</div>
        <div>
          <label htmlFor="internacion-ingreso-desde" className="mb-1 block text-xs font-medium text-gray-600">Desde</label>
          <input id="internacion-ingreso-desde" type="date" value={desde} max={hasta || undefined} onChange={(event) => setDesde(event.target.value)} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label htmlFor="internacion-ingreso-hasta" className="mb-1 block text-xs font-medium text-gray-600">Hasta</label>
          <input id="internacion-ingreso-hasta" type="date" value={hasta} min={desde || undefined} onChange={(event) => setHasta(event.target.value)} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button type="button" onClick={aplicarRango} disabled={rangoInvalido} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">Aplicar rango</button>
        {(rangoAplicado.desde || rangoAplicado.hasta || desde || hasta) && (
          <button type="button" onClick={limpiarRango} className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"><X className="h-4 w-4" />Limpiar rango</button>
        )}
        {rangoInvalido && <p className="basis-full text-xs text-red-600">La fecha desde no puede ser posterior a la fecha hasta.</p>}
      </div>

      {filtros.length > 0 && <p className="hidden print:block text-xs text-gray-700 mb-2">Filtros aplicados: {filtros.join('. ')}.</p>}

      {rowsFiltradas.length === 0 ? (
        <div className="his-card p-8 text-center"><BedDouble className="h-8 w-8 mx-auto text-gray-300 mb-2" /><p className="text-sm text-gray-500">No hay internaciones activas</p></div>
      ) : (
        <div className="space-y-4">
          <div className="his-card overflow-hidden ips-print-table censo-print-table">
            <table className="w-full min-w-7xl table-fixed text-sm">
              <thead className="bg-gray-50 border-b border-gray-200"><tr>{['Ingreso', 'HC', 'Paciente', 'DNI / Edad / Afiliado', 'Cobertura', 'Habitacion', 'Diagnostico', 'Medico tratante', 'Dias / Egreso'].map((titulo) => <th key={titulo} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{titulo}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-100">
                {rowsFiltradas.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3"><Link href={`/dashboard/internacion/${row.id}`} className="font-medium text-blue-700 hover:text-blue-900 print:text-gray-900">{row.ingreso}</Link><p className="text-xs text-gray-500">{row.fechaIngreso}</p></td>
                    <td className="px-4 py-3 font-medium text-gray-900">{row.historiaClinica}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{row.paciente}</td>
                    <td className="px-4 py-3 text-gray-700">{row.documentoEdadAfiliado.map((linea) => <p key={linea}>{linea}</p>)}</td>
                    <td className="px-4 py-3 text-gray-700"><p className="font-medium text-gray-900">{row.cobertura}</p><p className="text-xs text-gray-500">Coseguro: {row.coseguro}</p></td>
                    <td className="px-4 py-3"><p className="font-medium text-gray-900">{row.sector}</p><p className="text-xs text-gray-500">{row.habitacionCama}</p><p className={`text-xs font-medium ${row.habitacionBloqueada ? 'text-amber-700' : 'text-emerald-700'}`}>{row.estadoHabitacion}</p></td>
                    <td className="px-4 py-3 text-gray-700">{row.diagnostico}</td>
                    <td className="px-4 py-3 text-gray-700"><p>{row.medicoTratante}</p><p className="text-xs text-gray-500">MP {row.matricula}</p></td>
                    <td className="px-4 py-3 text-gray-700"><p className="font-medium text-gray-900">{row.diasInternacion} dias</p><p className="text-xs text-gray-500">Egreso: {row.egreso}</p></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="his-card overflow-hidden ips-print-table">
            <table className="w-full text-sm"><thead className="bg-gray-50 border-b border-gray-200"><tr><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Obra social</th><th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Internados</th><th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Dias totales</th></tr></thead><tbody className="divide-y divide-gray-100">{resumen.map((fila) => <tr key={fila.nombre}><td className="px-4 py-3 font-medium text-gray-900">{fila.nombre}</td><td className="px-4 py-3 text-right text-gray-700">{fila.internados}</td><td className="px-4 py-3 text-right text-gray-700">{fila.dias}</td></tr>)}</tbody><tfoot><tr><td className="px-4 py-3">Total general</td><td className="px-4 py-3 text-right">{rowsFiltradas.length}</td><td className="px-4 py-3 text-right">{totalDias}</td></tr></tfoot></table>
          </div>
        </div>
      )}
    </div>
  )
}
