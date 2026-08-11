'use client'

import Image from 'next/image'
import Link from 'next/link'
import { BedDouble, CalendarRange, FileDown, Loader2, X } from 'lucide-react'
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
}: CensoInternacionProps) {
  const [desde, setDesde] = useState(ingresoDesdeInicial)
  const [hasta, setHasta] = useState(ingresoHastaInicial)
  const [rangoAplicado, setRangoAplicado] = useState({
    desde: ingresoDesdeInicial,
    hasta: ingresoHastaInicial,
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const rangoDiferido = useDeferredValue(rangoAplicado)
  const rangoInvalido = Boolean(desde && hasta && desde > hasta)

  const rowsFiltradas = rows.filter((row) => {
    if (rangoDiferido.desde && row.fechaIngresoKey < rangoDiferido.desde) return false
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

  async function generarPdf() {
    if (isGenerating) return
    setIsGenerating(true)

    try {
      const [{ jsPDF }, { autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ])
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.text('CLINICA SAN RAFAEL', 10, 12)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.text('Censo de internacion', 10, 17)
      doc.text(`Fecha: ${fechaLabel}`, 10, 21)
      if (filtros.length > 0) doc.text(`Filtros: ${filtros.join(' | ')}`, 10, 25, { maxWidth: 275 })

      autoTable(doc, {
        startY: filtros.length > 0 ? 29 : 25,
        head: [['Ingreso', 'HC', 'Paciente', 'DNI / Edad / Af.', 'Cobertura', 'Habitacion', 'Diagnostico', 'Tratante', 'Dias / Egreso']],
        body: rowsFiltradas.map((row) => [
          `${row.ingreso}\n${row.fechaIngreso}`,
          row.historiaClinica,
          row.paciente,
          row.documentoEdadAfiliado.join('\n'),
          `${row.cobertura}\nCoseguro: ${row.coseguro}`,
          `${row.sector}\n${row.habitacionCama}\n${row.estadoHabitacion}`,
          row.diagnostico,
          `${row.medicoTratante}\nMP ${row.matricula}`,
          `${row.diasInternacion} dias\nEgreso: ${row.egreso}`,
        ]),
        theme: 'grid',
        styles: { fontSize: 6.5, cellPadding: 1.4, overflow: 'linebreak', valign: 'top' },
        headStyles: { fillColor: [31, 41, 55], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 12 },
          2: { cellWidth: 34 },
          3: { cellWidth: 28 },
          4: { cellWidth: 34 },
          5: { cellWidth: 35 },
          6: { cellWidth: 38 },
          7: { cellWidth: 32 },
          8: { cellWidth: 24 },
        },
        margin: { left: 7, right: 7 },
      })

      const finalY = (doc as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
      autoTable(doc, {
        startY: finalY + 5,
        head: [['Obra social', 'Internados', 'Dias totales']],
        body: [
          ...resumen.map((fila) => [fila.nombre, String(fila.internados), String(fila.dias)]),
          ['Total general', String(rowsFiltradas.length), String(totalDias)],
        ],
        theme: 'grid',
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [31, 41, 55], textColor: 255 },
        columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 25, halign: 'right' }, 2: { cellWidth: 25, halign: 'right' } },
        margin: { left: 7 },
      })

      doc.save(`censo-internacion-${fechaSeleccionada}.pdf`)
    } catch (error) {
      console.error('No se pudo generar el PDF', error)
      window.alert('No se pudo generar el PDF. Intente nuevamente.')
    } finally {
      setIsGenerating(false)
    }
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
          <button type="button" onClick={generarPdf} disabled={isGenerating} className="flex items-center gap-2 rounded-md bg-blue-600 hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70 text-white text-sm font-medium px-3 py-2">
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            {isGenerating ? 'Generando PDF...' : 'Generar PDF'}
          </button>
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
