import { NextRequest, NextResponse } from 'next/server'
import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { claveDiaArgentina, fechaDesdeClaveArgentina, formatearFechaArgentina, formatearFechaHoraArgentina } from '@/lib/utils/argentina-date'
import { obtenerInternacionesActivas } from '@/modules/internacion/service'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

function calcularDiasInternacion(fechaIngreso: Date | null, fechaCorte: Date): number {
  const ingresoKey = claveDiaArgentina(fechaIngreso)
  const corteKey = claveDiaArgentina(fechaCorte)
  if (!ingresoKey || !corteKey) return 0
  return Math.max(0, Math.floor((Date.parse(`${corteKey}T00:00:00Z`) - Date.parse(`${ingresoKey}T00:00:00Z`)) / 86_400_000))
}

function calcularEdad(fechaNacimiento: Date | null | undefined, edadRegistrada: number | null, fechaCorte: Date): number | null {
  if (!fechaNacimiento) return edadRegistrada
  let edad = fechaCorte.getFullYear() - fechaNacimiento.getFullYear()
  const mes = fechaCorte.getMonth() - fechaNacimiento.getMonth()
  if (mes < 0 || (mes === 0 && fechaCorte.getDate() < fechaNacimiento.getDate())) edad -= 1
  return edad >= 0 ? edad : edadRegistrada
}

export async function GET(request: NextRequest) {
  try {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'INTERNACION', 'LEER')) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const params = request.nextUrl.searchParams
    const fechaKey = params.get('fecha')
    const ingresoDesdeKey = params.get('ingresoDesde')
    const ingresoHastaKey = params.get('ingresoHasta')
    const fechaReferencia = fechaKey && DATE_KEY.test(fechaKey) ? fechaDesdeClaveArgentina(fechaKey) : new Date()
    const ingresoDesde = ingresoDesdeKey && DATE_KEY.test(ingresoDesdeKey) ? fechaDesdeClaveArgentina(ingresoDesdeKey) : undefined
    const ingresoHasta = ingresoHastaKey && DATE_KEY.test(ingresoHastaKey) ? fechaDesdeClaveArgentina(ingresoHastaKey) : undefined
    const obraSocialIdRaw = params.get('obraSocialId')
    const obraSocialId = obraSocialIdRaw ? Number(obraSocialIdRaw) : undefined

    const resultado = await obtenerInternacionesActivas({
      pagina: 1,
      porPagina: 100,
      q: params.get('q')?.trim() || undefined,
      obraSocialId: obraSocialId && Number.isFinite(obraSocialId) ? obraSocialId : undefined,
      fechaReferencia,
      fechaIngresoDesde: ingresoDesde,
      fechaIngresoHasta: ingresoHasta,
    }, usuario.codigoUsuario)

    const rows = resultado.items.map((item) => ({
      ingreso: `#${item.numeroIngreso}\n${item.fechaIngreso ? formatearFechaHoraArgentina(item.fechaIngreso) : '—'}`,
      historiaClinica: String(item.paciente?.historiaClinica ?? '—'),
      paciente: item.paciente?.nombreCompleto ?? item.nombre ?? '—',
      datos: `DNI ${item.paciente?.numeroDocumento ?? '—'}\nEdad ${calcularEdad(item.paciente?.fechaNacimiento, item.edad, fechaReferencia) ?? '—'}\nAf. ${item.numeroAfiliado?.trim() || '—'}`,
      cobertura: `${item.obraSocial?.nombre ?? 'Sin obra social'}\nCoseguro: ${item.coseguroNombre ?? 'No'}`,
      habitacion: `${item.cama?.sector ?? '—'}\nHab. ${item.cama?.habitacion ?? '—'} · Cama ${item.cama?.identificador ?? '—'}\n${item.habitacionBloqueada ? 'Habitacion bloqueada' : 'Habitacion no bloqueada'}`,
      diagnostico: item.descripcionPatologia?.trim() || '—',
      tratante: `${item.profesionalTratante?.nombre ?? '—'}\nMP ${item.profesionalTratante?.matricula ?? '—'}`,
      dias: `${calcularDiasInternacion(item.fechaIngreso, fechaReferencia)} dias\nEgreso: ${item.fechaEgreso ? formatearFechaHoraArgentina(item.fechaEgreso) : '—'}`,
    }))

    const resumen = Array.from(rows.reduce((mapa, _, index) => {
      const item = resultado.items[index]
      const nombre = item?.obraSocial?.nombre?.trim() || 'Sin obra social'
      const actual = mapa.get(nombre) ?? { nombre, internados: 0, dias: 0 }
      actual.internados += 1
      actual.dias += calcularDiasInternacion(item?.fechaIngreso ?? null, fechaReferencia)
      mapa.set(nombre, actual)
      return mapa
    }, new Map<string, { nombre: string; internados: number; dias: number }>()).values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text('CLINICA SAN RAFAEL', 8, 10)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(`Censo de internacion · Fecha: ${formatearFechaArgentina(fechaReferencia)}`, 8, 15)
    const filtros = [
      params.get('q') ? `Persona: ${params.get('q')}` : '',
      ingresoDesdeKey ? `Ingreso desde: ${formatearFechaArgentina(ingresoDesde)}` : '',
      ingresoHastaKey ? `Ingreso hasta: ${formatearFechaArgentina(ingresoHasta)}` : '',
    ].filter(Boolean)
    if (filtros.length > 0) doc.text(`Filtros: ${filtros.join(' | ')}`, 8, 20, { maxWidth: 280 })

    autoTable(doc, {
      startY: filtros.length > 0 ? 24 : 19,
      head: [['Ingreso', 'HC', 'Paciente', 'DNI / Edad / Af.', 'Cobertura', 'Habitacion', 'Diagnostico', 'Tratante', 'Dias / Egreso']],
      body: rows.map((row) => [row.ingreso, row.historiaClinica, row.paciente, row.datos, row.cobertura, row.habitacion, row.diagnostico, row.tratante, row.dias]),
      theme: 'grid',
      styles: { fontSize: 6, cellPadding: 1.2, overflow: 'linebreak', valign: 'top' },
      headStyles: { fillColor: [31, 41, 55], textColor: 255, fontStyle: 'bold' },
      margin: { left: 7, right: 7 },
    })

    const finalY = (doc as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
    autoTable(doc, {
      startY: finalY + 4,
      head: [['Obra social', 'Internados', 'Dias totales']],
      body: [
        ...resumen.map((fila) => [fila.nombre, String(fila.internados), String(fila.dias)]),
        ['Total general', String(rows.length), String(resumen.reduce((total, fila) => total + fila.dias, 0))],
      ],
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [31, 41, 55], textColor: 255 },
      tableWidth: 140,
      margin: { left: 7 },
    })

    const filename = `censo-internacion-${claveDiaArgentina(fechaReferencia) ?? 'actual'}.pdf`
    return new NextResponse(doc.output('arraybuffer'), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('[GET /api/internacion/censo-pdf]', error)
    return NextResponse.json({ error: 'No se pudo generar el PDF' }, { status: 500 })
  }
}
