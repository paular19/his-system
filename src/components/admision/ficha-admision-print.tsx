'use client'

import { useEffect } from 'react'
import { formatearFecha, formatearFechaHora, calcularEdad } from '@/lib/utils'
import type { IngresoDetalle } from '@/modules/admision/types'
import { limpiarObservacionesAdmision } from '@/modules/admision/utils'

interface FichaAdmisionPrintProps {
    ingreso: IngresoDetalle
}

export function FichaAdmisionPrint({ ingreso }: FichaAdmisionPrintProps) {
    const edad = ingreso.fechaNacimiento ? calcularEdad(ingreso.fechaNacimiento) : null
    const observacionesLimpias = limpiarObservacionesAdmision(ingreso.observaciones)

    useEffect(() => {
        const originalTitle = document.title
        const handleBeforePrint = () => {
            // Prevent browser print headers from showing the page title text.
            document.title = ' '
        }
        const handleAfterPrint = () => {
            document.title = originalTitle
        }

        window.addEventListener('beforeprint', handleBeforePrint)
        window.addEventListener('afterprint', handleAfterPrint)

        return () => {
            window.removeEventListener('beforeprint', handleBeforePrint)
            window.removeEventListener('afterprint', handleAfterPrint)
            document.title = originalTitle
        }
    }, [])

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
                    html, body {
                        width: 100%;
                        margin: 0 !important;
                        padding: 0 !important;
                        background: white;
                    }

                    /* Ocultar navegación y elementos de UI no imprimibles */
                    nav, aside, [role="navigation"], .sidebar, button,
                    header, .no-print, .navbar { display: none !important; }
                    .print-hidden { display: none !important; }

                    /* Evitar corrimiento por el layout del dashboard */
                    .flex-1.pl-60 {
                        padding-left: 0 !important;
                    }
                    main {
                        padding: 0 !important;
                        margin: 0 !important;
                    }

                    /* Asegurar visibilidad y centrado de la ficha */
                    .print-ficha {
                        display: block !important;
                        visibility: visible !important;
                        width: 190mm;
                        max-width: 190mm;
                        margin: 0 auto;
                        padding: 6mm;
                        page-break-after: auto;
                        break-after: auto;
                        font-family: Arial, sans-serif;
                        font-size: 10pt;
                        color: #000;
                    }
                    
                    .print-ficha h1 { font-size: 16pt; font-weight: bold; margin: 0 0 2px; text-align: center; }
                    .print-ficha h2 { font-size: 12pt; font-weight: bold; margin: 8px 0 4px; }
                    .print-ficha p { margin: 1px 0; }

                    .print-header { border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 8px; }
                    .print-header-row { display: flex; gap: 12px; align-items: flex-start; }
                    .print-header-clinica { min-width: 170px; }
                    .print-header-clinica-nombre { font-size: 13pt; font-weight: bold; line-height: 1.1; }
                    .print-header-sub { font-size: 8.5pt; color: #333; line-height: 1.1; }
                    .print-header-info { flex: 1; }
                    .print-header-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
                    .print-header-table td { border: none; padding: 1px 4px 1px 0; }
                    .print-label { font-weight: bold; color: #555; white-space: nowrap; }
                    .print-value { color: #000; }
                    .print-nro-ingreso { font-weight: bold; font-size: 11pt; }

                    .print-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }

                    .print-section { border: 1px solid #000; padding: 6px; margin-bottom: 6px; page-break-inside: avoid; }
                    .print-section-title { font-weight: bold; font-size: 9pt; border-bottom: 1px solid #000; margin-bottom: 4px; padding-bottom: 3px; }

                    table { width: 100%; border-collapse: collapse; margin: 4px 0; page-break-inside: avoid; }
                    table td { border: 1px solid #999; padding: 3px 4px; font-size: 8.5pt; }
                    table th { background: #ddd; border: 1px solid #999; padding: 3px 4px; font-weight: bold; }

                    .print-item { border-left: 3px solid #0066cc; padding-left: 5px; margin: 3px 0; }

                    @page { size: A4; margin: 5mm; }
                }
                @media screen { .print-ficha { display: none !important; } }
            `}</style>

            <div className="print-ficha">
                <div className="print-header">
                    <div className="print-header-row">
                        <div className="print-header-clinica">
                            <div className="print-header-clinica-nombre">CLINICA SAN RAFAEL</div>
                            <div className="print-header-sub">Sistema HIS</div>
                            <div className="print-header-sub">Av. Siempre Viva 1234 · CABA</div>
                            <div className="print-header-sub">Tel: (011) 1234-5678</div>
                        </div>
                        <div className="print-header-info">
                            <table className="print-header-table">
                                <tbody>
                                    <tr>
                                        <td className="print-label">Documento:</td>
                                        <td className="print-value">FICHA DE ADMISION</td>
                                        <td className="print-label">Fecha impresion:</td>
                                        <td className="print-value">{formatearFechaHora(new Date())}</td>
                                    </tr>
                                    <tr>
                                        <td className="print-label">Paciente:</td>
                                        <td className="print-value" colSpan={3}>
                                            {(ingreso.nombre ?? ingreso.paciente?.nombreCompleto ?? '—').toUpperCase()}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="print-label">Nro ingreso:</td>
                                        <td className="print-value print-nro-ingreso">
                                            {ingreso.tipoIngresoCodigo}-{ingreso.numeroIngreso}
                                        </td>
                                        <td className="print-label">Fecha ingreso:</td>
                                        <td className="print-value">{formatearFechaHora(ingreso.fechaIngreso)}</td>
                                    </tr>
                                    <tr>
                                        <td className="print-label">Cobertura:</td>
                                        <td className="print-value" colSpan={3}>
                                            {ingreso.obraSocial?.nombre ?? '—'} - {ingreso.plan?.descripcion ?? '—'}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
                                <dd className="font-medium">
                                    {ingreso.ingresoSubtipo?.subtipoAdmision?.descripcion
                                        ?? ingreso.tipoIngreso?.descripcion
                                        ?? ingreso.tipoIngresoCodigo}
                                </dd>
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

                {/* Información específica del subtipo */}
                {ingreso.ingresoSubtipo && (() => {
                    const sub = ingreso.ingresoSubtipo!
                    const codigo = sub.subtipoAdmisionCodigo
                    if (codigo === 'DER') return (
                        <div className="border border-gray-300 rounded-lg p-3 mb-4">
                            <h3 className="text-sm font-semibold text-gray-700 border-b pb-1 mb-2">
                                INFORMACIÓN DE DERIVACIÓN
                            </h3>
                            <dl className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                {sub.centroDerivante && <div className="flex justify-between">
                                    <dt className="text-gray-600">Centro Derivante:</dt>
                                    <dd className="font-medium">{sub.centroDerivante}</dd>
                                </div>}
                                {sub.profesionalDerivanteNombre && <div className="flex justify-between">
                                    <dt className="text-gray-600">Profesional Derivante:</dt>
                                    <dd className="font-medium">{sub.profesionalDerivanteNombre}</dd>
                                </div>}
                                {sub.motivoDerivacion && <div className="col-span-full flex justify-between">
                                    <dt className="text-gray-600">Motivo:</dt>
                                    <dd className="font-medium">{sub.motivoDerivacion}</dd>
                                </div>}
                                {sub.diagnosticoDerivacion && <div className="col-span-full flex justify-between">
                                    <dt className="text-gray-600">Diagnóstico de Derivación:</dt>
                                    <dd className="font-medium">{sub.diagnosticoDerivacion}</dd>
                                </div>}
                            </dl>
                        </div>
                    )
                    if (codigo === 'TUR' || codigo === 'RAY' || codigo === 'PAM') return (
                        <div className="border border-gray-300 rounded-lg p-3 mb-4">
                            <h3 className="text-sm font-semibold text-gray-700 border-b pb-1 mb-2">
                                TURNO / PRÁCTICA
                            </h3>
                            <dl className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                {sub.practicaCodigo && <div className="flex justify-between">
                                    <dt className="text-gray-600">Práctica:</dt>
                                    <dd className="font-medium">{sub.practicaCodigo}</dd>
                                </div>}
                                {sub.fechaTurno && <div className="flex justify-between">
                                    <dt className="text-gray-600">Fecha de Turno:</dt>
                                    <dd className="font-medium">{formatearFechaHora(sub.fechaTurno)}</dd>
                                </div>}
                            </dl>
                        </div>
                    )
                    if (codigo === 'IND') return (
                        <div className="border border-gray-300 rounded-lg p-3 mb-4">
                            <h3 className="text-sm font-semibold text-gray-700 border-b pb-1 mb-2">
                                INDICACIÓN MÉDICA
                            </h3>
                            <dl className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                {sub.profesionalIndicadorNombre && <div className="flex justify-between">
                                    <dt className="text-gray-600">Profesional Indicador:</dt>
                                    <dd className="font-medium">{sub.profesionalIndicadorNombre}</dd>
                                </div>}
                                {sub.tipoIndicacion && <div className="flex justify-between">
                                    <dt className="text-gray-600">Tipo de Indicación:</dt>
                                    <dd className="font-medium">{sub.tipoIndicacion}</dd>
                                </div>}
                                {sub.descripcionIndicacion && <div className="col-span-full flex justify-between">
                                    <dt className="text-gray-600">Descripción:</dt>
                                    <dd className="font-medium">{sub.descripcionIndicacion}</dd>
                                </div>}
                            </dl>
                        </div>
                    )
                    return null
                })()}

                {/* Cobertura Médica */}
                <div className="border border-gray-300 rounded-lg p-3 mb-4">
                    <h3 className="text-sm font-semibold text-gray-700 border-b pb-1 mb-2">
                        COBERTURA MÉDICA
                    </h3>
                    <dl className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div className="flex justify-between">
                            <dt className="text-gray-600">Obra Social:</dt>
                            <dd className="font-medium">{ingreso.obraSocial?.nombre ?? '—'}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-gray-600">Plan:</dt>
                            <dd className="font-medium">{ingreso.plan?.descripcion ?? '—'}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-gray-600">N° Afiliado:</dt>
                            <dd className="font-medium">{ingreso.numeroAfiliado ?? '—'}</dd>
                        </div>
                    </dl>
                </div>

                {/* Diagnóstico */}
                {(ingreso.descripcionPatologia || ingreso.descripcionPatologiaDefinitiva) && (
                    <div className="border border-gray-300 rounded-lg p-3 mb-4">
                        <h3 className="text-sm font-semibold text-gray-700 border-b pb-1 mb-2">
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
                {observacionesLimpias && (
                    <div className="border border-gray-300 rounded-lg p-3 mb-4">
                        <h3 className="text-sm font-semibold text-gray-700 border-b pb-1 mb-2">
                            OBSERVACIONES
                        </h3>
                        <p className="text-sm text-gray-900 whitespace-pre-line">{observacionesLimpias}</p>
                    </div>
                )}

                {/* Diagnósticos Registrados */}
                {ingreso.ingresoPatologias.length > 0 && (
                    <div className="border border-gray-300 rounded-lg p-3 mb-4">
                        <h3 className="text-sm font-semibold text-gray-700 border-b pb-1 mb-2">
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
                    <div className="border border-gray-300 rounded-lg p-3 mb-4">
                        <h3 className="text-sm font-semibold text-gray-700 border-b pb-1 mb-2">
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
                <div className="text-center text-xs text-gray-500 mt-4 pt-2 border-t border-gray-300">
                    <p>Documento generado por el Sistema de Gestión Hospitalaria</p>
                    <p>Fecha: {formatearFechaHora(new Date())}</p>
                </div>
            </div>
        </>
    )
}