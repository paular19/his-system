import type { LoteFacturacionDetalle } from '@/modules/facturacion/types'
import { aplicaPromediIPS } from '@/modules/facturacion/promedi-rules'
import { formatearFechaArgentina, formatearFechaHoraArgentina } from '@/lib/utils/argentina-date'

const TIPO_LABEL: Record<string, string> = {
    PRACTICAS: 'Prácticas',
    MEDICAMENTOS: 'Medicamentos',
}

const ESTADO_LABEL: Record<string, string> = {
    PEN: 'Pendiente',
    CON: 'Confirmado',
    ANU: 'Anulado',
}

function formatMonto(n: number) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)
}

function formatPeriodo(periodo: string | null) {
    if (!periodo) return 'Sin período'
    const [anio, mes] = periodo.split('-')
    if (!anio || !mes) return periodo
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
    return `${meses[parseInt(mes, 10) - 1]} ${anio}`
}

interface Props {
    lote: LoteFacturacionDetalle
    totalIncluido: number
    detalleIngresos?: LoteResumenIngresoDetalle[]
    // Items IPS ya filtrados por el padre (regla de promedi + filtro de categoria).
    itemsIPSTxt?: LoteFacturacionDetalle['itemsIPSTxt']
    // Etiqueta de la categoria filtrada, para dejar constancia de que es parcial.
    filtroCategoria?: string | null
    // Arranca cada paciente en una hoja nueva al imprimir.
    unaHojaPorPaciente?: boolean
}

interface LoteResumenIngresoLinea {
    fecha: Date | string
    numeroAutorizacion: string | null
    profesional: string | null
    codigoPractica: string
    cantidad: number
    importeEspecialista: number | null
    importeAyudante: number | null
    importeAnestesista: number | null
    importeGastos: number | null
    importeTotal: number
}

interface LoteResumenIngresoDetalle {
    ingresoId: number
    numeroIngreso: number
    paciente: string
    numeroAfiliado: string | null
    totalIngreso: number
    lineas: LoteResumenIngresoLinea[]
}

function formatDate(value: Date | string | null | undefined) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    // Sin el helper, un timestamp a medianoche UTC se muestra un dia antes en Argentina.
    return formatearFechaArgentina(date)
}

function formatCantidad(value: number) {
    return new Intl.NumberFormat('es-AR', {
        minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
        maximumFractionDigits: 2,
    }).format(value)
}

function formatMontoNullable(value: number | null | undefined) {
    if (value === null || value === undefined) return '—'
    return formatMonto(value)
}

function totalMonto(items: Array<{ importeTotal: number }>) {
    return items.reduce((acc, item) => acc + item.importeTotal, 0)
}

export function LoteResumenPrint({
    lote,
    totalIncluido,
    detalleIngresos = [],
    itemsIPSTxt,
    filtroCategoria,
    unaHojaPorPaciente = false,
}: Props) {
    const itemsIncluidos = lote.items.filter((it) => it.incluido)
    const esIPSTxt = lote.origen === 'IPS_TXT'
    // Al resumen solo van las practicas alcanzadas por la regla de promedi. Si el padre
    // ya mando la lista filtrada, se respeta tal cual.
    const itemsIPSFacturables = itemsIPSTxt
        ?? (lote.itemsIPSTxt ?? []).filter((it) => aplicaPromediIPS(it.servicioCodigo))
    const cantidadRegistros = esIPSTxt ? itemsIPSFacturables.length : itemsIncluidos.length

    return (
        <div className="font-sans text-[11px] text-gray-900 p-6">
            <div className="flex justify-between items-start border-b-2 border-gray-800 pb-4 mb-5">
                <div className="flex flex-col items-start gap-1">
                    <img src="/logo-clinica.png" alt="Logo Clínica" style={{ maxWidth: 110, marginBottom: 4 }} />
                    <p className="text-xs text-gray-500">Av. Sarmiento 566, Salta Capital, Argentina</p>
                    <p className="text-xs text-gray-500">Tel: 3872537289</p>
                </div>
                <div>
                    <h1 className="text-2xl font-bold">Resumen de Facturación</h1>
                    <p className="text-gray-600 mt-1">Lote #{lote.numero} · {TIPO_LABEL[lote.tipo]}</p>
                </div>
                <div className="text-right text-sm text-gray-600 space-y-1">
                    <p>Fecha: {formatearFechaArgentina(lote.fecha)}</p>
                    <p>Período: {formatPeriodo(lote.periodo)}</p>
                    <p>Estado: {ESTADO_LABEL[lote.estado]}</p>
                    <p>Impreso: {formatearFechaHoraArgentina(new Date())}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-5 text-sm">
                <div className="space-y-1">
                    <p><strong>Nro de Resumen:</strong> {lote.numero}</p>
                    <p><strong>Concepto:</strong> {lote.concepto || '-'}</p>
                    <p><strong>Cliente:</strong> {lote.obraSocial?.nombre ?? 'Particular'}</p>
                    <p><strong>Obra Social:</strong> {lote.obraSocial?.nombre ?? 'Particular'}</p>
                    {lote.tipoIngresoCodigo && (
                        <p><strong>Tipo Ingreso:</strong> {lote.tipoIngresoCodigo}</p>
                    )}
                    {(lote.rangoDesde || lote.rangoHasta) && (
                        <p><strong>Rango:</strong> {lote.rangoDesde ?? '—'} a {lote.rangoHasta ?? '—'}</p>
                    )}
                </div>
                <div className="space-y-1">
                    <p><strong>Descripción:</strong> {lote.descripcion || '-'}</p>
                    <p><strong>Tipo:</strong> {TIPO_LABEL[lote.tipo]}</p>
                    <p><strong>Estado:</strong> {ESTADO_LABEL[lote.estado]}</p>
                    <p><strong>Cantidad de registros:</strong> {cantidadRegistros}</p>
                    {filtroCategoria && (
                        <p><strong>Filtrado por:</strong> {filtroCategoria} (resumen parcial)</p>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6 bg-gray-100 rounded p-4">
                <div className="text-center">
                    <div className="text-2xl font-bold">{esIPSTxt ? (lote.itemsIPSTxt?.length ?? 0) : lote.items.length}</div>
                    <div className="text-xs text-gray-500">{esIPSTxt ? 'Registros IPS' : 'Pacientes en lote'}</div>
                </div>
                <div className="text-center">
                    <div className="text-2xl font-bold">{esIPSTxt ? itemsIPSFacturables.length : itemsIncluidos.length}</div>
                    <div className="text-xs text-gray-500">{esIPSTxt ? 'Prácticas facturadas' : 'Incluidos'}</div>
                </div>
                <div className="text-center">
                    <div className="text-2xl font-bold">{formatMonto(totalIncluido)}</div>
                    <div className="text-xs text-gray-500">Total</div>
                </div>
            </div>

            {!esIPSTxt && (
                <div className="space-y-6">
                    {detalleIngresos.map((ingreso) => (
                        <section
                            key={ingreso.ingresoId}
                            className={`break-inside-avoid-page${unaHojaPorPaciente ? ' lote-hoja-paciente' : ''}`}
                        >
                            {unaHojaPorPaciente && (
                                <div className="mb-1 flex justify-between text-[10px] text-gray-500">
                                    <span>Lote #{lote.numero} · {lote.obraSocial?.nombre ?? 'Particular'}</span>
                                    <span>Período: {formatPeriodo(lote.periodo)}</span>
                                </div>
                            )}
                            <div className="border border-gray-300 rounded-sm">
                                <div className="grid grid-cols-12 gap-2 border-b border-gray-300 px-3 py-2 text-[12px] font-semibold bg-gray-50">
                                    <div className="col-span-5">PACIENTE: <span className="font-normal">{ingreso.paciente}</span></div>
                                    <div className="col-span-4">Nro. Af.: <span className="font-normal">{ingreso.numeroAfiliado ?? '-'}</span></div>
                                    <div className="col-span-3 text-right">Ingreso: <span className="font-normal">I - {ingreso.numeroIngreso}</span></div>
                                </div>

                                <table className="w-full border-collapse text-[10px]">
                                    <thead>
                                        <tr className="border-b border-gray-300">
                                            <th className="px-2 py-1 text-left font-semibold">Fecha</th>
                                            <th className="px-2 py-1 text-left font-semibold">Nro. Aut.</th>
                                            <th className="px-2 py-1 text-left font-semibold">Profesional</th>
                                            <th className="px-2 py-1 text-left font-semibold">Cod.</th>
                                            <th className="px-2 py-1 text-right font-semibold">Cant.</th>
                                            <th className="px-2 py-1 text-right font-semibold">$ Esp</th>
                                            <th className="px-2 py-1 text-right font-semibold">$ Ayu</th>
                                            <th className="px-2 py-1 text-right font-semibold">$ Ane</th>
                                            <th className="px-2 py-1 text-right font-semibold">$ Gto</th>
                                            <th className="px-2 py-1 text-right font-semibold">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ingreso.lineas.map((linea, index) => (
                                            <tr key={`${ingreso.ingresoId}-${linea.codigoPractica}-${index}`} className="border-b border-gray-200">
                                                <td className="px-2 py-1">{formatDate(linea.fecha)}</td>
                                                <td className="px-2 py-1">{linea.numeroAutorizacion || '-'}</td>
                                                <td className="px-2 py-1">{linea.profesional || '-'}</td>
                                                <td className="px-2 py-1 font-mono">{linea.codigoPractica}</td>
                                                <td className="px-2 py-1 text-right">{formatCantidad(linea.cantidad)}</td>
                                                <td className="px-2 py-1 text-right">{formatMontoNullable(linea.importeEspecialista)}</td>
                                                <td className="px-2 py-1 text-right">{formatMontoNullable(linea.importeAyudante)}</td>
                                                <td className="px-2 py-1 text-right">{formatMontoNullable(linea.importeAnestesista)}</td>
                                                <td className="px-2 py-1 text-right">{formatMontoNullable(linea.importeGastos)}</td>
                                                <td className="px-2 py-1 text-right font-semibold">{formatMonto(linea.importeTotal)}</td>
                                            </tr>
                                        ))}
                                        {ingreso.lineas.length === 0 && (
                                            <tr>
                                                <td colSpan={10} className="px-2 py-2 text-center text-gray-500">Sin prácticas autorizadas para este ingreso</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>

                                <div className="border-t border-gray-300 px-3 py-1.5 text-right text-[11px] font-semibold bg-gray-50">
                                    Total Ingreso: {formatMonto(ingreso.totalIngreso)}
                                </div>
                            </div>
                        </section>
                    ))}

                    {detalleIngresos.length === 0 && (
                        <div className="border border-gray-300 rounded-sm px-4 py-3 text-center text-gray-600">
                            No hay detalle de prácticas para imprimir.
                        </div>
                    )}
                </div>
            )}

            {esIPSTxt && (
                <table className="w-full border-collapse text-[10px]">
                    <thead>
                        <tr className="border-y border-gray-800 bg-gray-50">
                            <th className="px-2 py-1 text-left font-semibold">Afiliado</th>
                            <th className="px-2 py-1 text-left font-semibold">Documento</th>
                            <th className="px-2 py-1 text-left font-semibold">Nro. Orden</th>
                            <th className="px-2 py-1 text-left font-semibold">Fecha</th>
                            <th className="px-2 py-1 text-left font-semibold">Servicio</th>
                            <th className="px-2 py-1 text-left font-semibold">Cod.</th>
                            <th className="px-2 py-1 text-right font-semibold">Cant.</th>
                            <th className="px-2 py-1 text-right font-semibold">$ Esp</th>
                            <th className="px-2 py-1 text-right font-semibold">$ Ayu</th>
                            <th className="px-2 py-1 text-right font-semibold">$ Ane</th>
                            <th className="px-2 py-1 text-right font-semibold">$ Gto</th>
                            <th className="px-2 py-1 text-right font-semibold">Total</th>
                            <th className="px-2 py-1 text-right font-semibold">Importe aplicado</th>
                        </tr>
                    </thead>
                    <tbody>
                        {itemsIPSFacturables.map((it, i) => (
                            <tr key={it.id} className={i % 2 === 0 ? 'bg-white border-b border-gray-200' : 'bg-gray-50 border-b border-gray-200'}>
                                <td className="px-2 py-1">{it.afiliadoNom}</td>
                                <td className="px-2 py-1">{it.afiliadoDoc}</td>
                                <td className="px-2 py-1">{it.nroOrden}</td>
                                <td className="px-2 py-1">{formatDate(it.fechaRealiz)}</td>
                                <td className="px-2 py-1">{it.servicioNombre}</td>
                                <td className="px-2 py-1 font-mono">{it.servicioCodigo}</td>
                                <td className="px-2 py-1 text-right">{formatCantidad(it.cantidad)}</td>
                                <td className="px-2 py-1 text-right">{formatMonto(it.impEsp)}</td>
                                <td className="px-2 py-1 text-right">{formatMonto(it.impAyu)}</td>
                                <td className="px-2 py-1 text-right">{formatMonto(it.impAne)}</td>
                                <td className="px-2 py-1 text-right">{formatMonto(it.impGto)}</td>
                                <td className="px-2 py-1 text-right font-semibold">{formatMonto(it.impTotal)}</td>
                                <td className="px-2 py-1 text-right font-semibold">{it.importePromedi === null ? '—' : formatMonto(it.importePromedi)}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="border-t-2 border-gray-800 bg-gray-50 font-semibold">
                            <td colSpan={11} className="px-2 py-1 text-right">Total bruto</td>
                            <td className="px-2 py-1 text-right">{formatMonto(totalMonto(itemsIPSFacturables.map((it) => ({ importeTotal: it.impTotal }))))}</td>
                            <td className="px-2 py-1 text-right">{formatMonto(totalIncluido)}</td>
                        </tr>
                    </tfoot>
                </table>
            )}

            <div className="mt-6 border-t border-gray-800 pt-2 text-right text-sm font-semibold">
                Total General: {formatMonto(totalIncluido)}
            </div>
        </div>
    )
}
