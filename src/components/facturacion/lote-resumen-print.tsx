import type { LoteFacturacionDetalle } from '@/modules/facturacion/types'

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

function formatPeriodo(periodo: string) {
    const [anio, mes] = periodo.split('-')
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
    return `${meses[parseInt(mes) - 1]} ${anio}`
}

interface Props {
    lote: LoteFacturacionDetalle
    totalIncluido: number
}

export function LoteResumenPrint({ lote, totalIncluido }: Props) {
    const itemsIncluidos = lote.items.filter((it) => it.incluido)

    return (
        <div className="font-sans text-sm text-gray-900 p-8">
            {/* Encabezado */}
            <div className="flex justify-between items-start border-b-2 border-gray-800 pb-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Lote de Facturación #{lote.numero}</h1>
                    <p className="text-gray-600 mt-1">{TIPO_LABEL[lote.tipo]} — {ESTADO_LABEL[lote.estado]}</p>
                </div>
                <div className="text-right text-sm text-gray-600 space-y-1">
                    <p>Fecha: {new Date(lote.fecha).toLocaleDateString('es-AR')}</p>
                    <p>Período: {formatPeriodo(lote.periodo)}</p>
                    <p>Impreso: {new Date().toLocaleString('es-AR')}</p>
                </div>
            </div>

            {/* Datos del lote */}
            <div className="grid grid-cols-2 gap-6 mb-6 text-sm">
                <div className="space-y-1">
                    <p>
                        <strong>Cliente:</strong>{' '}
                        {lote.obraSocial?.nombre ?? 'Particular'}
                        {lote.plan && ` — ${lote.plan.descripcion}`}
                    </p>
                    {lote.tipoIngresoCodigo && (
                        <p><strong>Tipo Ingreso:</strong> {lote.tipoIngresoCodigo}</p>
                    )}
                    {(lote.rangoDesde || lote.rangoHasta) && (
                        <p>
                            <strong>Rango:</strong> {lote.rangoDesde ?? '—'} a {lote.rangoHasta ?? '—'}
                        </p>
                    )}
                </div>
                <div className="space-y-1">
                    {lote.concepto && <p><strong>Concepto:</strong> {lote.concepto}</p>}
                    {lote.descripcion && <p><strong>Descripción:</strong> {lote.descripcion}</p>}
                </div>
            </div>

            {/* Resumen */}
            <div className="grid grid-cols-3 gap-4 mb-6 bg-gray-100 rounded p-4">
                <div className="text-center">
                    <div className="text-2xl font-bold">{lote.items.length}</div>
                    <div className="text-xs text-gray-500">Pacientes en lote</div>
                </div>
                <div className="text-center">
                    <div className="text-2xl font-bold">{itemsIncluidos.length}</div>
                    <div className="text-xs text-gray-500">A facturar</div>
                </div>
                <div className="text-center">
                    <div className="text-2xl font-bold">{formatMonto(totalIncluido)}</div>
                    <div className="text-xs text-gray-500">Total a facturar</div>
                </div>
            </div>

            {/* Tabla de pacientes */}
            <table className="w-full text-sm border-collapse">
                <thead>
                    <tr className="border-b-2 border-gray-800">
                        <th className="py-2 text-left font-semibold">Nro.</th>
                        <th className="py-2 text-left font-semibold">Paciente</th>
                        <th className="py-2 text-left font-semibold">DNI</th>
                        <th className="py-2 text-left font-semibold">Nro. Afiliado</th>
                        <th className="py-2 text-left font-semibold">Diagnóstico</th>
                        <th className="py-2 text-left font-semibold">F. Ingreso</th>
                        <th className="py-2 text-left font-semibold">F. Egreso</th>
                        <th className="py-2 text-right font-semibold">Importe</th>
                        <th className="py-2 text-center font-semibold">Facturar</th>
                    </tr>
                </thead>
                <tbody>
                    {lote.items.map((item, i) => (
                        <tr
                            key={item.id}
                            className={`border-b border-gray-200 ${!item.incluido ? 'text-gray-400 line-through' : ''} ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                        >
                            <td className="py-1.5 pr-2 font-mono">{item.ingreso.numeroIngreso}</td>
                            <td className="py-1.5 pr-2 font-medium">
                                {item.paciente?.nombreCompleto ?? item.ingreso.nombre ?? '-'}
                            </td>
                            <td className="py-1.5 pr-2">
                                {item.paciente?.numeroDocumento?.toLocaleString('es-AR') ?? '—'}
                            </td>
                            <td className="py-1.5 pr-2">{item.ingreso.numeroAfiliado ?? '—'}</td>
                            <td className="py-1.5 pr-2 text-xs max-w-xs truncate">
                                {item.ingreso.descripcionPatologia ?? '—'}
                            </td>
                            <td className="py-1.5 pr-2 text-xs">
                                {item.ingreso.fechaIngreso
                                    ? new Date(item.ingreso.fechaIngreso).toLocaleDateString('es-AR')
                                    : '—'}
                            </td>
                            <td className="py-1.5 pr-2 text-xs">
                                {item.ingreso.fechaEgreso
                                    ? new Date(item.ingreso.fechaEgreso).toLocaleDateString('es-AR')
                                    : '—'}
                            </td>
                            <td className="py-1.5 text-right">{formatMonto(item.importeTotal)}</td>
                            <td className="py-1.5 text-center">{item.incluido ? '✓' : '✗'}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr className="border-t-2 border-gray-800 font-bold">
                        <td colSpan={7} className="py-2 text-right">Total a Facturar:</td>
                        <td className="py-2 text-right">{formatMonto(totalIncluido)}</td>
                        <td />
                    </tr>
                </tfoot>
            </table>

            {/* Firma */}
            <div className="mt-12 grid grid-cols-2 gap-8">
                <div className="text-center">
                    <div className="border-t border-gray-600 pt-2 text-xs text-gray-500">
                        Firma Facturación
                    </div>
                </div>
                <div className="text-center">
                    <div className="border-t border-gray-600 pt-2 text-xs text-gray-500">
                        Firma Autorización
                    </div>
                </div>
            </div>
        </div>
    )
}
