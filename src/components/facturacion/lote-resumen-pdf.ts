import type { LoteFacturacionDetalle, LoteIPSTxtItemDetalle } from '@/modules/facturacion/types'
import { etiquetaAjusteAplicado, resolverReglaPromedi } from '@/modules/facturacion/promedi-rules'
import { formatearFechaArgentina, formatearFechaHoraArgentina } from '@/lib/utils/argentina-date'

const TIPO_LABEL: Record<string, string> = {
    PRACTICAS: 'Practicas',
    MEDICAMENTOS: 'Medicamentos',
}

const ESTADO_LABEL: Record<string, string> = {
    PEN: 'Pendiente',
    CON: 'Confirmado',
    ANU: 'Anulado',
}

const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export interface ResumenPdfLinea {
    fecha: Date | string
    numeroAutorizacion: string | null
    profesional: string | null
    codigoPractica: string
    // En los lotes de medicamentos el renglon es el nombre del medicamento: no hay codigo.
    descripcion?: string | null
    cantidad: number
    importeEspecialista: number | null
    importeAyudante: number | null
    importeAnestesista: number | null
    importeGastos: number | null
    importeTotal: number
}

export interface ResumenPdfPaciente {
    clave: string
    numerosIngreso: number[]
    paciente: string
    numeroAfiliado: string | null
    total: number
    lineas: ResumenPdfLinea[]
}

function numerosIngresoTexto(numeros: number[]): string {
    if (numeros.length === 0) return 'Ingreso: -'
    const valores = numeros.map((n) => `I - ${n}`).join(', ')
    return numeros.length > 1 ? `Ingresos: ${valores}` : `Ingreso: ${valores}`
}

export interface ResumenPdfOpciones {
    lote: LoteFacturacionDetalle
    totalIncluido: number
    // Un bloque por paciente: sus dos ingresos del lote van en el mismo desglose.
    detallePacientes: ResumenPdfPaciente[]
    itemsIPSTxt?: LoteIPSTxtItemDetalle[]
    // Etiqueta de la categoria filtrada, para dejar constancia de que el PDF es parcial.
    filtroCategoria?: string | null
    // Nombre del paciente cuando el PDF es de un solo paciente.
    pacienteUnico?: string | null
    // Arranca cada paciente en una hoja nueva.
    unaHojaPorPaciente?: boolean
}

function formatMonto(n: number): string {
    return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function formatMontoNullable(n: number | null | undefined): string {
    if (n === null || n === undefined) return '-'
    return formatMonto(n)
}

function formatCantidad(n: number): string {
    return new Intl.NumberFormat('es-AR', {
        minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
        maximumFractionDigits: 2,
    }).format(n)
}

function formatFecha(value: Date | string | null | undefined): string {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    // Sin el helper, un timestamp a medianoche UTC se muestra un dia antes en Argentina.
    return formatearFechaArgentina(date)
}

function formatPeriodo(periodo: string | null): string {
    if (!periodo) return "Sin periodo"
    const [anio, mes] = periodo.split('-')
    if (!anio || !mes) return periodo
    return `${MESES[parseInt(mes, 10) - 1] ?? mes} ${anio}`
}

function slugArchivo(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
}

export function nombreArchivoResumen(opciones: ResumenPdfOpciones): string {
    const partes = ['resumen', `lote-${opciones.lote.numero}`]
    if (opciones.pacienteUnico) partes.push(slugArchivo(opciones.pacienteUnico))
    if (opciones.filtroCategoria) partes.push(slugArchivo(opciones.filtroCategoria))
    return `${partes.join('-')}.pdf`
}

export async function generarResumenPdf(opciones: ResumenPdfOpciones): Promise<Blob> {
    // Import dinamico: jspdf pesa bastante y solo hace falta al descargar.
    const [{ jsPDF }, { autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
    ])

    const {
        lote,
        totalIncluido,
        detallePacientes,
        itemsIPSTxt = [],
        filtroCategoria,
        pacienteUnico,
        unaHojaPorPaciente = false,
    } = opciones
    const esIPSTxt = lote.origen === 'IPS_TXT'
    const esMedicamentos = lote.tipo === 'MEDICAMENTOS'
    // Los importes de un lote con promedi ya salen ajustados: hay que decirlo en el papel.
    const textoPromedi = lote.promediAplicado
        ? etiquetaAjusteAplicado(
            lote.ajuste,
            esIPSTxt ? 'IPS' : resolverReglaPromedi(lote.obraSocial?.nombre)
        )
        : null

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
    doc.text('Resumen de Facturacion', anchoPagina - margen, 10, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(
        `Lote #${lote.numero}  ·  ${TIPO_LABEL[lote.tipo] ?? lote.tipo}  ·  ${ESTADO_LABEL[lote.estado] ?? lote.estado}${textoPromedi ? `  ·  ${textoPromedi}` : ''}`,
        anchoPagina - margen,
        15,
        { align: 'right' }
    )

    const datos = [
        `Cliente: ${lote.obraSocial?.nombre ?? 'Particular'}`,
        `Periodo: ${formatPeriodo(lote.periodo)}`,
        `Fecha: ${formatearFechaArgentina(lote.fecha)}`,
        `Generado: ${formatearFechaHoraArgentina(new Date())}`,
    ]
    doc.text(datos.join('   |   '), margen, 21, { maxWidth: anchoPagina - margen * 2 })

    let y = 26
    const aclaraciones: string[] = []
    if (textoPromedi) aclaraciones.push(textoPromedi)
    if (pacienteUnico) aclaraciones.push(`Paciente: ${pacienteUnico}`)
    if (filtroCategoria) aclaraciones.push(`Filtrado por: ${filtroCategoria} (resumen parcial)`)
    if (lote.concepto) aclaraciones.push(`Concepto: ${lote.concepto}`)
    if (aclaraciones.length > 0) {
        doc.setFont('helvetica', 'bold')
        doc.text(aclaraciones.join('   |   '), margen, y, { maxWidth: anchoPagina - margen * 2 })
        doc.setFont('helvetica', 'normal')
        y += 5
    }

    const estilosTabla = {
        theme: 'grid' as const,
        styles: { fontSize: 6.5, cellPadding: 1.1, overflow: 'linebreak' as const, valign: 'top' as const },
        headStyles: { fillColor: [31, 41, 55] as [number, number, number], textColor: 255, fontStyle: 'bold' as const },
        margin: { left: margen, right: margen },
    }

    const posicionFinal = () =>
        (doc as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

    if (esIPSTxt) {
        autoTable(doc, {
            ...estilosTabla,
            startY: y,
            head: [['Afiliado', 'Documento', 'Nro. Orden', 'Fecha', 'Servicio', 'Cod.', 'Cant.', '$ Esp', '$ Ayu', '$ Ane', '$ Gto', 'Total', 'Importe aplicado']],
            body: itemsIPSTxt.map((it) => [
                it.afiliadoNom,
                it.afiliadoDoc,
                it.nroOrden,
                formatFecha(it.fechaRealiz),
                it.servicioNombre,
                it.servicioCodigo,
                formatCantidad(it.cantidad),
                formatMonto(it.impEsp),
                formatMonto(it.impAyu),
                formatMonto(it.impAne),
                formatMonto(it.impGto),
                formatMonto(it.impTotal),
                it.importePromedi === null ? '-' : formatMonto(it.importePromedi),
            ]),
            columnStyles: {
                6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' },
                9: { halign: 'right' }, 10: { halign: 'right' },
                11: { halign: 'right', fontStyle: 'bold' }, 12: { halign: 'right', fontStyle: 'bold' },
            },
        })
        y = posicionFinal() + 4
    } else if (detallePacientes.length === 0) {
        doc.setFontSize(9)
        doc.text(
            esMedicamentos
                ? 'No hay detalle de medicacion para el resumen.'
                : 'No hay detalle de practicas para el resumen.',
            margen,
            y
        )
        y += 6
    } else {
        detallePacientes.forEach((paciente, indice) => {
            // Con una hoja por paciente el primero sigue abajo de la portada; los demas
            // arrancan en hoja nueva con un encabezado minimo que repite el lote.
            if (unaHojaPorPaciente && indice > 0) {
                doc.addPage()
                doc.setFontSize(7)
                doc.setTextColor(120)
                doc.text(
                    `Lote #${lote.numero}  ·  ${lote.obraSocial?.nombre ?? 'Particular'}  ·  Periodo: ${formatPeriodo(lote.periodo)}${textoPromedi ? `  ·  ${textoPromedi}` : ''}`,
                    margen,
                    10
                )
                doc.setTextColor(0)
                doc.setFontSize(8)
                y = 14
            }

            autoTable(doc, {
                ...estilosTabla,
                startY: y,
                head: [[
                    `PACIENTE: ${paciente.paciente}`,
                    `Nro. Af.: ${paciente.numeroAfiliado ?? '-'}`,
                    numerosIngresoTexto(paciente.numerosIngreso),
                ]],
                body: [],
                headStyles: { fillColor: [229, 231, 235], textColor: 20, fontStyle: 'bold' },
                styles: { ...estilosTabla.styles, fontSize: 7 },
            })

            autoTable(doc, {
                ...estilosTabla,
                startY: posicionFinal(),
                head: [[
                    'Fecha',
                    'Nro. Aut.',
                    'Profesional',
                    esMedicamentos ? 'Medicamento' : 'Cod.',
                    'Cant.', '$ Esp', '$ Ayu', '$ Ane', '$ Gto', 'Total',
                ]],
                body: paciente.lineas.length > 0
                    ? paciente.lineas.map((linea) => [
                        formatFecha(linea.fecha),
                        linea.numeroAutorizacion || '-',
                        linea.profesional || '-',
                        linea.descripcion || linea.codigoPractica,
                        formatCantidad(linea.cantidad),
                        formatMontoNullable(linea.importeEspecialista),
                        formatMontoNullable(linea.importeAyudante),
                        formatMontoNullable(linea.importeAnestesista),
                        formatMontoNullable(linea.importeGastos),
                        formatMonto(linea.importeTotal),
                    ])
                    : [[
                        esMedicamentos
                            ? 'Sin medicacion cargada para este paciente'
                            : 'Sin practicas autorizadas para este paciente',
                        '', '', '', '', '', '', '', '', '',
                    ]],
                foot: [['', '', '', '', '', '', '', '', 'Total Paciente', formatMonto(paciente.total)]],
                footStyles: { fillColor: [243, 244, 246], textColor: 20, fontStyle: 'bold', halign: 'right' },
                columnStyles: {
                    4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' },
                    7: { halign: 'right' }, 8: { halign: 'right' },
                    9: { halign: 'right', fontStyle: 'bold' },
                },
            })
            y = posicionFinal() + 4
        })
    }

    const cantidadRegistros = esIPSTxt
        ? itemsIPSTxt.length
        : detallePacientes.reduce((acc, p) => acc + p.lineas.length, 0)

    if (y > doc.internal.pageSize.getHeight() - 18) {
        doc.addPage()
        y = 14
    }
    doc.setDrawColor(31, 41, 55)
    doc.line(margen, y, anchoPagina - margen, y)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(`Total General: $ ${formatMonto(totalIncluido)}`, anchoPagina - margen, y + 6, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(
        `Registros: ${cantidadRegistros}${esIPSTxt ? '' : `  ·  Pacientes: ${detallePacientes.length}`}`,
        margen,
        y + 6
    )

    return doc.output('blob')
}

export async function descargarResumenPdf(opciones: ResumenPdfOpciones): Promise<void> {
    const blob = await generarResumenPdf(opciones)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = nombreArchivoResumen(opciones)
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
}
