import { CATEGORIA_PRACTICA_LABEL } from '@/modules/facturacion/categorias-practica'
import type { LiquidacionResumen } from '@/modules/liquidacion-profesionales/types'
import { formatearFechaArgentina, formatearFechaHoraArgentina } from '@/lib/utils/argentina-date'

const ESTADO_LOTE_LABEL: Record<string, string> = {
    PEN: 'Pendiente',
    CON: 'Confirmado',
}

const TIPO_INGRESO_LABEL: Record<string, string> = {
    INT: 'Internados',
    AMB: 'Ambulatorios',
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

export function LiquidacionPrint({ resumen }: { resumen: LiquidacionResumen }) {
    const { filtros } = resumen
    const categorias = filtros.categorias.map((c) => CATEGORIA_PRACTICA_LABEL[c]).join(', ')

    return (
        <div className="font-sans text-[11px] text-gray-900 p-6">
            <div className="flex justify-between items-start border-b-2 border-gray-800 pb-4 mb-4">
                <div className="flex flex-col items-start gap-1">
                    <img src="/logo-clinica.png" alt="Logo Clínica" style={{ maxWidth: 110, marginBottom: 4 }} />
                    <p className="text-xs text-gray-500">Av. Sarmiento 566, Salta Capital, Argentina</p>
                    <p className="text-xs text-gray-500">Tel: 3872537289</p>
                </div>
                <div>
                    <h1 className="text-2xl font-bold">Liquidación de Profesionales</h1>
                    <p className="text-gray-600 mt-1">Honorarios por profesional efector</p>
                    {resumen.esProvisorio && (
                        <p className="mt-1 inline-block border-2 border-amber-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-700">
                            Resumen provisorio — no válido para pago
                        </p>
                    )}
                </div>
                <div className="text-right text-sm text-gray-600 space-y-1">
                    <p>Período: {formatFecha(`${filtros.desde}T00:00:00.000Z`)} al {formatFecha(`${filtros.hasta}T00:00:00.000Z`)}</p>
                    <p>Impreso: {formatearFechaHoraArgentina(new Date())}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-4 text-sm">
                <div className="space-y-1">
                    <p><strong>Obra Social:</strong> {filtros.obraSocial?.nombre ?? 'Todas'}</p>
                    <p><strong>Tipo de práctica:</strong> {categorias || 'Todas'}</p>
                    <p><strong>Profesional:</strong> {filtros.matricula ? `Matrícula ${filtros.matricula}` : 'Todos'}</p>
                </div>
                <div className="space-y-1">
                    <p><strong>Estado de lote:</strong> {filtros.estadosLote.map((e) => ESTADO_LOTE_LABEL[e] ?? e).join(', ')}</p>
                    <p><strong>Tipo de ingreso:</strong> {filtros.tipoIngreso ? TIPO_INGRESO_LABEL[filtros.tipoIngreso] ?? filtros.tipoIngreso : 'Todos'}</p>
                    <p><strong>Profesionales:</strong> {resumen.profesionales.length}</p>
                    <p><strong>Cantidad de prácticas:</strong> {resumen.cantidadPracticas}</p>
                </div>
            </div>

            {resumen.esProvisorio && (
                <div className="mb-4 border-2 border-amber-600 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                    <strong>Resumen provisorio.</strong> {resumen.practicasPendientes} de {resumen.cantidadPracticas} prácticas
                    (${formatMonto(resumen.totalPendiente)} de ${formatMonto(resumen.total)}) salen de lotes en estado
                    pendiente. Un lote pendiente todavía se puede editar o anular, así que estos importes pueden cambiar.
                    Emitir la liquidación definitiva recién con los lotes confirmados.
                </div>
            )}

            <div className="space-y-5">
                {resumen.profesionales.map((prof) => (
                    <section key={prof.matricula} className="break-inside-avoid-page">
                        <div className="border-b border-gray-800 pb-1 mb-1 text-[12px] font-bold">
                            PRESTADOR: {prof.matricula} &nbsp;&nbsp; {prof.nombre}
                        </div>
                        <table className="w-full border-collapse text-[10px]">
                            <thead>
                                <tr className="border-b border-gray-400 text-gray-700">
                                    <th className="px-1.5 py-1 text-left font-semibold">Nro. Ing.</th>
                                    <th className="px-1.5 py-1 text-left font-semibold">Paciente</th>
                                    <th className="px-1.5 py-1 text-left font-semibold">N Afi.</th>
                                    <th className="px-1.5 py-1 text-left font-semibold">Nro. Aut.</th>
                                    <th className="px-1.5 py-1 text-left font-semibold">Fecha</th>
                                    <th className="px-1.5 py-1 text-left font-semibold">Cod.</th>
                                    <th className="px-1.5 py-1 text-left font-semibold">Tipo</th>
                                    <th className="px-1.5 py-1 text-right font-semibold">Cant.</th>
                                    <th className="px-1.5 py-1 text-right font-semibold">$ Hon</th>
                                    <th className="px-1.5 py-1 text-right font-semibold">$ Gto</th>
                                    <th className="px-1.5 py-1 text-right font-semibold">$ Total</th>
                                    <th className="px-1.5 py-1 text-left font-semibold">Lote</th>
                                </tr>
                            </thead>
                            <tbody>
                                {prof.lineas.map((linea) => (
                                    <tr
                                        key={`${linea.ordenPuestoNumero}-${linea.ordenNumero}-${linea.ordenItem}`}
                                        className="border-b border-gray-200"
                                    >
                                        <td className="px-1.5 py-0.5">{linea.numeroIngreso}</td>
                                        <td className="px-1.5 py-0.5">{linea.paciente}</td>
                                        <td className="px-1.5 py-0.5">{linea.numeroAfiliado || '-'}</td>
                                        <td className="px-1.5 py-0.5">{linea.numeroAutorizacion || '-'}</td>
                                        <td className="px-1.5 py-0.5">{formatFecha(linea.fecha)}</td>
                                        <td className="px-1.5 py-0.5 font-mono">{linea.codigoPractica}</td>
                                        <td className="px-1.5 py-0.5">{linea.subitem}</td>
                                        <td className="px-1.5 py-0.5 text-right">{formatCantidad(linea.cantidad)}</td>
                                        <td className="px-1.5 py-0.5 text-right">{formatMonto(linea.importeHonorarios)}</td>
                                        <td className="px-1.5 py-0.5 text-right">{formatMonto(linea.importeGastos)}</td>
                                        <td className="px-1.5 py-0.5 text-right font-semibold">{formatMonto(linea.importeTotal)}</td>
                                        <td className={`px-1.5 py-0.5 whitespace-nowrap ${linea.loteEstado === 'PEN' ? 'text-amber-700 font-semibold' : ''}`}>
                                            #{linea.loteNumero} {linea.loteEstado}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="border-t border-gray-800 mt-0.5 pt-1 flex justify-between text-[11px] font-bold">
                            <span>Total Profesional:</span>
                            <span className="flex gap-8">
                                <span>{formatMonto(prof.totalHonorarios)}</span>
                                <span>{formatMonto(prof.totalGastos)}</span>
                                <span>{formatMonto(prof.total)}</span>
                            </span>
                        </div>
                    </section>
                ))}

                {resumen.profesionales.length === 0 && (
                    <div className="border border-gray-300 rounded-sm px-4 py-3 text-center text-gray-600">
                        No hay prácticas para liquidar con estos filtros.
                    </div>
                )}
            </div>

            <div className="mt-5 border-t-2 border-gray-800 pt-2 flex justify-between items-center">
                <span className="text-xs text-gray-600">Cantidad de practicas: {resumen.cantidadPracticas}</span>
                <span className="text-base font-bold">Total General: $ {formatMonto(resumen.total)}</span>
            </div>
        </div>
    )
}
