'use client'

import { formatearFecha, formatearFechaHora, calcularEdad } from '@/lib/utils'
import type { IngresoConRelaciones } from '@/modules/admision/types'

interface FichaAdmisionPrintProps {
    ingreso: IngresoConRelaciones
}

export function FichaAdmisionPrint({ ingreso }: FichaAdmisionPrintProps) {
    const edad = ingreso.fechaNacimiento ? calcularEdad(ingreso.fechaNacimiento) : null

    const LABEL_ESTADO: Record<string, string> = {
        A: 'Activo',
        E: 'Egresado',
        P: 'Pendiente',
        X: 'Anulado',
    }

    return (
        <>
            <style>{`
                @media print {
                    /* Reset global */
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    html, body { width: 100%; margin: 0; padding: 0; background: white; }
                    
                    /* Ocultar navegación y elementos de UI no imprimibles */
                    nav, aside, [role="navigation"], .sidebar, button, .flex-1.pl-60,
                    header, .no-print, .navbar { display: none !important; }
                    .print-hidden { display: none !important; }
                    
                    /* Asegurar visibilidad de la ficha */
                    .print-ficha { display: block !important; visibility: visible !important; }
                    
                    /* Layout */
                    main { padding: 0 !important; margin: 0 !important; }
                    
                    .print-ficha {
                        width: 100%;
                        page-break-after: avoid;
                        padding: 30px;
                        font-family: Arial, sans-serif;
                        font-size: 11pt;
                        color: #000;
                    }
                    
                    .print-ficha h1 { font-size: 16pt; font-weight: bold; margin: 0 0 4px; text-align: center; }
                    .print-ficha h2 { font-size: 13pt; font-weight: bold; margin: 12px 0 6px; }
                    .print-ficha p { margin: 2px 0; }
                    
                    .print-header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
                    .print-header-clinic { font-size: 14pt; font-weight: bold; }
                    .print-header-sub { font-size: 9pt; color: #333; }
                    
                    .print-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
                    
                    .print-section { border: 1px solid #000; padding: 8px; margin-bottom: 8px; page-break-inside: avoid; }
                    .print-section-title { font-weight: bold; font-size: 10pt; border-bottom: 1px solid #000; margin-bottom: 6px; padding-bottom: 4px; }
                    
                    table { width: 100%; border-collapse: collapse; margin: 6px 0; page-break-inside: avoid; }
                    table td { border: 1px solid #999; padding: 4px 6px; font-size: 9pt; }
                    table th { background: #ddd; border: 1px solid #999; padding: 4px 6px; font-weight: bold; }
                    
                    .print-item { border-left: 3px solid #0066cc; padding-left: 6px; margin: 4px 0; }
                    
                    @page { size: A4; margin: 10mm; }
                }
                @media screen { .print-ficha { display: none !important; } }
            `}</style>

            <div className="print-ficha">
                <div className="print-header">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-4">
                            <div className="h-16 w-16 rounded-full bg-blue-900 text-white flex items-center justify-center font-bold text-lg">
                                HIS
                            </div>
                            <div className="text-left">
                                <div className="print-header-clinic">CLÍNICA SAN RAFAEL</div>
                                <div className="print-header-sub">Av. Siempre Viva 1234 · CABA</div>
                                <div className="print-header-sub">Tel: (011) 1234-5678 · info@clinicasanrafael.com</div>
                            </div>
                        </div>
                        <div className="text-left md:text-right">
                            <div className="print-header-clinic">FICHA DE ADMISIÓN AMBULATORIA</div>
                            <div className="print-header-sub mt-1">Fecha de impresión: {formatearFechaHora(new Date())}</div>
                        </div>
                    </div>
                </div>

                <div className="text-center mb-6">
                    <p className="text-lg font-mono font-bold text-blue-700 mt-2">
                        {ingreso.tipoIngresoCodigo}-{ingreso.numeroIngreso}
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    {/* Información del Paciente */}
                    <div className="border border-gray-300 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-gray-700 border-b pb-2 mb-3">
                            INFORMACIÓN DEL PACIENTE
                        </h3>
                        <dl className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <dt className="text-gray-600">Nombre:</dt>
                                <dd className="font-medium">{ingreso.nombre ?? ingreso.paciente?.nombreCompleto ?? '—'}</dd>
                            </div>
                            <div className="flex justify-between">
                                <dt className="text-gray-600">Fecha de Nacimiento:</dt>
                                <dd className="font-medium">
                                    {ingreso.fechaNacimiento ? formatearFecha(ingreso.fechaNacimiento) : '—'}
                                </dd>
                            </div>
                            <div className="flex justify-between">
                                <dt className="text-gray-600">Edad:</dt>
                                <dd className="font-medium">{edad ? `${edad} años` : ingreso.edad ? `${ingreso.edad} años` : '—'}</dd>
                            </div>
                            <div className="flex justify-between">
                                <dt className="text-gray-600">Documento:</dt>
                                <dd className="font-medium">
                                    {ingreso.paciente?.tipoDocumento} {ingreso.paciente?.numeroDocumento ?? '—'}
                                </dd>
                            </div>
                            <div className="flex justify-between">
                                <dt className="text-gray-600">Historia Clínica:</dt>
                                <dd className="font-medium">{ingreso.paciente?.historiaClinica ?? '—'}</dd>
                            </div>
                        </dl>
                    </div>

                    {/* Datos de la Admisión */}
                    <div className="border border-gray-300 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-gray-700 border-b pb-2 mb-3">
                            DATOS DE LA ADMISIÓN
                        </h3>
                        <dl className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <dt className="text-gray-600">Tipo de Ingreso:</dt>
                                <dd className="font-medium">{ingreso.tipoIngreso?.descripcion ?? ingreso.tipoIngresoCodigo}</dd>
                            </div>
                            <div className="flex justify-between">
                                <dt className="text-gray-600">Fecha de Ingreso:</dt>
                                <dd className="font-medium">{formatearFechaHora(ingreso.fechaIngreso)}</dd>
                            </div>
                            <div className="flex justify-between">
                                <dt className="text-gray-600">Fecha de Egreso:</dt>
                                <dd className="font-medium">{formatearFecha(ingreso.fechaEgreso) ?? '—'}</dd>
                            </div>
                            <div className="flex justify-between">
                                <dt className="text-gray-600">Egreso Previsto:</dt>
                                <dd className="font-medium">{formatearFecha(ingreso.fechaEgresoPrevista) ?? '—'}</dd>
                            </div>
                            <div className="flex justify-between">
                                <dt className="text-gray-600">Estado:</dt>
                                <dd className="font-medium">{LABEL_ESTADO[ingreso.estado ?? ''] ?? ingreso.estado ?? '—'}</dd>
                            </div>
                            <div className="flex justify-between">
                                <dt className="text-gray-600">Profesional Guardia:</dt>
                                <dd className="font-medium">{ingreso.profesionalGuardia?.nombre ?? '—'}</dd>
                            </div>
                            <div className="flex justify-between">
                                <dt className="text-gray-600">Profesional Tratante:</dt>
                                <dd className="font-medium">{ingreso.profesionalTratante?.nombre ?? '—'}</dd>
                            </div>
                        </dl>
                    </div>
                </div>

                {/* Cobertura Médica */}
                <div className="border border-gray-300 rounded-lg p-4 mb-6">
                    <h3 className="text-sm font-semibold text-gray-700 border-b pb-2 mb-3">
                        COBERTURA MÉDICA
                    </h3>
                    <dl className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div className="flex justify-between">
                            <dt className="text-gray-600">Obra Social:</dt>
                            <dd className="font-medium">{ingreso.obraSocial?.nombre ?? '—'}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-gray-600">Plan:</dt>
                            <dd className="font-medium">{ingreso.plan?.nombre ?? '—'}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-gray-600">N° Afiliado:</dt>
                            <dd className="font-medium">{ingreso.numeroAfiliado ?? '—'}</dd>
                        </div>
                    </dl>
                </div>

                {/* Diagnóstico */}
                {(ingreso.descripcionPatologia || ingreso.descripcionPatologiaDefinitiva) && (
                    <div className="border border-gray-300 rounded-lg p-4 mb-6">
                        <h3 className="text-sm font-semibold text-gray-700 border-b pb-2 mb-3">
                            DIAGNÓSTICO
                        </h3>
                        {ingreso.descripcionPatologia && (
                            <div className="mb-3">
                                <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">
                                    Presuntivo:
                                </p>
                                <p className="text-sm text-gray-900">{ingreso.descripcionPatologia}</p>
                            </div>
                        )}
                        {ingreso.descripcionPatologiaDefinitiva && (
                            <div>
                                <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">
                                    Definitivo:
                                </p>
                                <p className="text-sm text-gray-900">{ingreso.descripcionPatologiaDefinitiva}</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Observaciones */}
                {ingreso.observaciones && (
                    <div className="border border-gray-300 rounded-lg p-4 mb-6">
                        <h3 className="text-sm font-semibold text-gray-700 border-b pb-2 mb-3">
                            OBSERVACIONES
                        </h3>
                        <p className="text-sm text-gray-900 whitespace-pre-line">{ingreso.observaciones}</p>
                    </div>
                )}

                {/* Diagnósticos Registrados */}
                {ingreso.ingresoPatologias.length > 0 && (
                    <div className="border border-gray-300 rounded-lg p-4 mb-6">
                        <h3 className="text-sm font-semibold text-gray-700 border-b pb-2 mb-3">
                            DIAGNÓSTICOS REGISTRADOS
                        </h3>
                        <div className="space-y-2">
                            {ingreso.ingresoPatologias.map((d) => (
                                <div key={d.id} className="border-l-4 border-blue-500 pl-3 py-2">
                                    <p className="text-sm text-gray-900">{d.descripcion}</p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {formatearFechaHora(d.fecha)}
                                        {d.observaciones && ` · ${d.observaciones}`}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Movimientos */}
                {ingreso.movimientosIngreso.length > 0 && (
                    <div className="border border-gray-300 rounded-lg p-4 mb-6">
                        <h3 className="text-sm font-semibold text-gray-700 border-b pb-2 mb-3">
                            MOVIMIENTOS DEL INGRESO
                        </h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="border-b border-gray-300">
                                        <th className="text-left py-2 px-2 text-gray-600">Tipo</th>
                                        <th className="text-left py-2 px-2 text-gray-600">Fecha</th>
                                        <th className="text-left py-2 px-2 text-gray-600">Concepto</th>
                                        <th className="text-right py-2 px-2 text-gray-600">Importe</th>
                                        <th className="text-right py-2 px-2 text-gray-600">Saldo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ingreso.movimientosIngreso.map((m) => (
                                        <tr key={m.id} className="border-b border-gray-100">
                                            <td className="py-2 px-2 text-gray-700">{m.tipoMovimiento.descripcion}</td>
                                            <td className="py-2 px-2 text-gray-500">{formatearFecha(m.fecha)}</td>
                                            <td className="py-2 px-2 text-gray-600">{m.concepto ?? '—'}</td>
                                            <td className="py-2 px-2 text-right font-mono text-gray-700">
                                                {m.signo >= 0 ? '+' : ''}{Number(m.importe).toFixed(2)}
                                            </td>
                                            <td className="py-2 px-2 text-right font-mono text-gray-700">
                                                {Number(m.saldo).toFixed(2)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Pie de página */}
                <div className="text-center text-xs text-gray-500 mt-8 pt-4 border-t border-gray-300">
                    <p>Documento generado por el Sistema de Gestión Hospitalaria</p>
                    <p>Fecha: {formatearFechaHora(new Date())}</p>
                </div>
            </div>
        </>
    )
}