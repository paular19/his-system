import { CATEGORIA_PRACTICA_LABEL } from '@/modules/facturacion/categorias-practica'
import type { LiquidacionResumen } from '@/modules/liquidacion-profesionales/types'
import { formatearFechaArgentina, formatearFechaHoraArgentina } from '@/lib/utils/argentina-date'

const ESTADO_LOTE_LABEL: Record<string, string> = {
    PEN: 'Pendiente',
    CON: 'Confirmado',
}

function formatMonto(n: number): string {
    return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function formatCantidad(n: number): string {
    return new Intl.NumberFormat('es-AR', {
        minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
        maximumFractionDigits: 2,
    }).format(n)
}

function formatFecha(value: Date | string): string {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    // Sin el helper, un timestamp a medianoche UTC se muestra un dia antes en Argentina.
    return formatearFechaArgentina(date)
}

function slugArchivo(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
}

export function nombreArchivoLiquidacion(resumen: LiquidacionResumen): string {
    const partes = ['liquidacion-profesionales']
    // El archivo se comparte por mail: que el nombre diga si es provisorio.
    if (resumen.esProvisorio) partes.push('PROVISORIO')
    partes.push(resumen.filtros.desde, resumen.filtros.hasta)
    if (resumen.filtros.matricula) partes.push(`mat-${resumen.filtros.matricula}`)
    if (resumen.filtros.obraSocial) partes.push(slugArchivo(resumen.filtros.obraSocial.nombre))
    return `${partes.join('_')}.pdf`
}

export async function generarLiquidacionPdf(resumen: LiquidacionResumen): Promise<Blob> {
    // Import dinamico: jspdf pesa bastante y solo hace falta al descargar.
    const [{ jsPDF }, { autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
    ])

    const { filtros } = resumen
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const anchoPagina = doc.internal.pageSize.getWidth()
    const margen = 8

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text('CLINICA SAN RAFAEL', margen, 10)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text('Av. Sarmiento 566, Salta Capital, Argentina  ·  Tel: 3872537289', margen, 15)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text('Liquidacion de Profesionales', anchoPagina - margen, 10, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(
        `${formatFecha(`${filtros.desde}T00:00:00.000Z`)} al ${formatFecha(`${filtros.hasta}T00:00:00.000Z`)}`,
        anchoPagina - margen,
        15,
        { align: 'right' }
    )

    const categorias = filtros.categorias.map((c) => CATEGORIA_PRACTICA_LABEL[c]).join(', ')
    const datos = [
        `Obra Social: ${filtros.obraSocial?.nombre ?? 'Todas'}`,
        `Tipo de practica: ${categorias || 'Todas'}`,
        `Profesional: ${filtros.matricula ? `Mat. ${filtros.matricula}` : 'Todos'}`,
        `Lotes: ${filtros.estadosLote.map((e) => ESTADO_LOTE_LABEL[e] ?? e).join(', ')}`,
        `Generado: ${formatearFechaHoraArgentina(new Date())}`,
    ]
    doc.text(datos.join('   |   '), margen, 21, { maxWidth: anchoPagina - margen * 2 })

    let y = 27

    if (resumen.esProvisorio) {
        // Recuadro visible arriba de todo: un PDF provisorio no puede confundirse con
        // la liquidacion definitiva, porque un lote PEN todavia se edita o se anula.
        const alto = 9
        doc.setFillColor(254, 243, 199)
        doc.setDrawColor(180, 83, 9)
        doc.setLineWidth(0.5)
        doc.rect(margen, y, anchoPagina - margen * 2, alto, 'FD')
        doc.setTextColor(146, 64, 14)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.text('RESUMEN PROVISORIO - NO VALIDO PARA PAGO', margen + 2, y + 3.8)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6.5)
        doc.text(
            `${resumen.practicasPendientes} de ${resumen.cantidadPracticas} practicas ($ ${formatMonto(resumen.totalPendiente)} de $ ${formatMonto(resumen.total)}) salen de lotes pendientes: los importes pueden cambiar.`,
            margen + 2,
            y + 7.2
        )
        doc.setTextColor(0, 0, 0)
        doc.setLineWidth(0.2)
        y += alto + 3
    }

    const estilosTabla = {
        theme: 'grid' as const,
        styles: { fontSize: 6.5, cellPadding: 1.1, overflow: 'linebreak' as const, valign: 'top' as const },
        headStyles: { fillColor: [31, 41, 55] as [number, number, number], textColor: 255, fontStyle: 'bold' as const },
        margin: { left: margen, right: margen },
    }

    const posicionFinal = () =>
        (doc as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

    if (resumen.profesionales.length === 0) {
        doc.setFontSize(9)
        doc.text('No hay practicas para liquidar con estos filtros.', margen, y)
        y += 6
    }

    for (const prof of resumen.profesionales) {
        autoTable(doc, {
            ...estilosTabla,
            startY: y,
            head: [[`PRESTADOR: ${prof.matricula}`, prof.nombre]],
            body: [],
            headStyles: { fillColor: [229, 231, 235], textColor: 20, fontStyle: 'bold' },
            styles: { ...estilosTabla.styles, fontSize: 7.5 },
        })

        autoTable(doc, {
            ...estilosTabla,
            startY: posicionFinal(),
            head: [['Nro. Ing.', 'Paciente', 'N Afi.', 'Nro. Aut.', 'Fecha', 'Cod.', 'Tipo', 'Cant.', '$ Hon', '$ Gto', '$ Total', 'Lote']],
            body: prof.lineas.map((linea) => [
                String(linea.numeroIngreso),
                linea.paciente,
                linea.numeroAfiliado || '-',
                linea.numeroAutorizacion || '-',
                formatFecha(linea.fecha),
                linea.codigoPractica,
                linea.subitem,
                formatCantidad(linea.cantidad),
                formatMonto(linea.importeHonorarios),
                formatMonto(linea.importeGastos),
                formatMonto(linea.importeTotal),
                `#${linea.loteNumero} ${linea.loteEstado}`,
            ]),
            foot: [[
                'Total Profesional:', '', '', '', '', '', '', '',
                formatMonto(prof.totalHonorarios),
                formatMonto(prof.totalGastos),
                formatMonto(prof.total),
                '',
            ]],
            footStyles: { fillColor: [243, 244, 246], textColor: 20, fontStyle: 'bold' },
            columnStyles: {
                7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right' },
                10: { halign: 'right', fontStyle: 'bold' },
            },
        })
        y = posicionFinal() + 4
    }

    if (y > doc.internal.pageSize.getHeight() - 18) {
        doc.addPage()
        y = 14
    }
    doc.setDrawColor(31, 41, 55)
    doc.line(margen, y, anchoPagina - margen, y)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(`Total General: $ ${formatMonto(resumen.total)}`, anchoPagina - margen, y + 6, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(
        `Cantidad de practicas: ${resumen.cantidadPracticas}  ·  Profesionales: ${resumen.profesionales.length}`,
        margen,
        y + 6
    )

    return doc.output('blob')
}

export async function descargarLiquidacionPdf(resumen: LiquidacionResumen): Promise<void> {
    const blob = await generarLiquidacionPdf(resumen)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = nombreArchivoLiquidacion(resumen)
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
}
