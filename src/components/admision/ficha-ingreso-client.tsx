'use client'

import { useState } from 'react'
import { ChevronRight, User, Pencil, FileText, Printer, Save, X } from 'lucide-react'
import Link from 'next/link'
import { formatearFecha, formatearFechaHora, calcularEdad } from '@/lib/utils'
import { AdmisionEditForm } from './admision-edit-form'
import { FichaAdmisionPrint } from './ficha-admision-print'
import type { IngresoConRelaciones } from '@/modules/admision/types'

interface FichaIngresoClientProps {
    ingreso: IngresoConRelaciones
    puedeModificar: boolean
    puedeAgregarDiagnostico: boolean
}

const LABEL_ESTADO: Record<string, string> = {
    A: 'Activo',
    E: 'Egresado',
    P: 'Pendiente',
    X: 'Anulado',
}
const BADGE_ESTADO: Record<string, string> = {
    A: 'his-badge-activo',
    E: 'his-badge-inactivo',
    P: 'his-badge-urgente',
    X: 'his-badge-inactivo',
}

function DataItem({ label, value }: { label: string; value?: string | null }) {
    if (!value) return null
    return (
        <div>
            <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                {label}
            </dt>
            <dd className="text-sm text-gray-900">{value}</dd>
        </div>
    )
}

export function FichaIngresoClient({ ingreso, puedeModificar, puedeAgregarDiagnostico }: FichaIngresoClientProps) {
    const [isEditing, setIsEditing] = useState(false)
    const edad = ingreso.fechaNacimiento ? calcularEdad(ingreso.fechaNacimiento) : null

    if (isEditing) {
        return (
            <div className="p-6 max-w-4xl space-y-5">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-gray-900">Editando Ingreso</h2>
                    <button
                        onClick={() => setIsEditing(false)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                        <X className="h-4 w-4" />
                        Cancelar
                    </button>
                </div>
                <AdmisionEditForm ingreso={ingreso} onSuccess={() => setIsEditing(false)} />
            </div>
        )
    }

    return (
        <div>
            {/* Contenido visible en pantalla — oculto al imprimir */}
            <div className="p-6 max-w-4xl space-y-5 print:hidden">
                {/* Breadcrumb */}
                <nav className="flex items-center gap-1 text-xs text-gray-500">
                    <Link href="/dashboard/admision" className="hover:text-gray-700">
                        Admisión
                    </Link>
                    <ChevronRight className="h-3 w-3" />
                    <span className="text-gray-900 font-medium">
                        {ingreso.tipoIngresoCodigo}-{ingreso.numeroIngreso}
                    </span>
                </nav>

                {/* Cabecera */}
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">
                            {ingreso.nombre ?? ingreso.paciente?.nombreCompleto ?? 'Sin nombre'}
                        </h2>
                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 flex-wrap">
                            <span className="font-mono font-medium text-blue-600">
                                {ingreso.tipoIngresoCodigo}-{ingreso.numeroIngreso}
                            </span>
                            {ingreso.fechaIngreso && (
                                <span>Ingresado: {formatearFechaHora(ingreso.fechaIngreso)}</span>
                            )}
                            {ingreso.estado && (
                                <span className={BADGE_ESTADO[ingreso.estado] ?? 'his-badge-inactivo'}>
                                    {LABEL_ESTADO[ingreso.estado] ?? ingreso.estado}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 print:hidden">
                        <button
                            onClick={() => window.print()}
                            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                            <Printer className="h-4 w-4" />
                            Imprimir
                        </button>
                        {ingreso.tipoIngresoCodigo === 'I' && (
                            <Link
                                href={`/dashboard/internacion/${ingreso.id}/informe`}
                                className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                            >
                                <FileText className="h-4 w-4" />
                                Informe
                            </Link>
                        )}
                        {puedeModificar && (
                            <button
                                onClick={() => setIsEditing(true)}
                                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                <Pencil className="h-4 w-4" />
                                Editar
                            </button>
                        )}
                    </div>
                </div>

                {/* Datos del paciente */}
                <div className="his-card p-5">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b">
                        <h3 className="text-sm font-semibold text-gray-700">Datos del Paciente</h3>
                        {ingreso.pacienteId && (
                            <Link
                                href={`/dashboard/pacientes/${ingreso.pacienteId}`}
                                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                            >
                                <User className="h-3 w-3" />
                                Ver ficha
                            </Link>
                        )}
                    </div>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                        <DataItem
                            label="Nombre"
                            value={ingreso.nombre ?? ingreso.paciente?.nombreCompleto}
                        />
                        <DataItem
                            label="Fecha de Nacimiento"
                            value={
                                ingreso.fechaNacimiento
                                    ? `${formatearFecha(ingreso.fechaNacimiento)}${edad !== null ? ` (${edad} años)` : ''}`
                                    : null
                            }
                        />
                        <DataItem label="Edad al ingreso" value={ingreso.edad?.toString()} />
                    </dl>
                </div>

                {/* Datos de admisión */}
                <div className="his-card p-5">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
                        Datos de la Admisión
                    </h3>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                        <DataItem
                            label="Tipo de Ingreso"
                            value={ingreso.tipoIngreso?.descripcion ?? ingreso.tipoIngresoCodigo}
                        />
                        <DataItem
                            label="Número de Ingreso"
                            value={`${ingreso.tipoIngresoCodigo}-${ingreso.numeroIngreso}`}
                        />
                        <DataItem label="Fecha de Ingreso" value={formatearFechaHora(ingreso.fechaIngreso)} />
                        <DataItem
                            label="Fecha de Egreso"
                            value={formatearFecha(ingreso.fechaEgreso)}
                        />
                        <DataItem
                            label="Egreso Previsto"
                            value={formatearFecha(ingreso.fechaEgresoPrevista)}
                        />
                        <DataItem
                            label="Profesional Guardia"
                            value={ingreso.profesionalGuardia?.nombre}
                        />
                        <DataItem
                            label="Profesional Tratante"
                            value={ingreso.profesionalTratante?.nombre}
                        />
                        {ingreso.cama && (
                            <DataItem
                                label="Cama"
                                value={`${ingreso.cama.identificador} (${ingreso.cama.sector}${ingreso.cama.habitacion ? ` · ${ingreso.cama.habitacion}` : ''})`}
                            />
                        )}
                    </dl>
                </div>

                {/* Cobertura médica */}
                <div className="his-card p-5">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
                        Cobertura Médica
                    </h3>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                        <DataItem
                            label="Obra Social ID"
                            value={ingreso.obraSocialId?.toString()}
                        />
                        <DataItem label="Plan ID" value={ingreso.planId?.toString()} />
                        <DataItem label="Número de Afiliado" value={ingreso.numeroAfiliado} />
                    </dl>
                </div>

                {/* Diagnóstico inicial */}
                {(ingreso.descripcionPatologia || ingreso.descripcionPatologiaDefinitiva) && (
                    <div className="his-card p-5">
                        <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
                            Diagnóstico
                        </h3>
                        {ingreso.descripcionPatologia && (
                            <div className="mb-3">
                                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                                    Presuntivo
                                </p>
                                <p className="text-sm text-gray-900">{ingreso.descripcionPatologia}</p>
                            </div>
                        )}
                        {ingreso.descripcionPatologiaDefinitiva && (
                            <div>
                                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                                    Definitivo
                                </p>
                                <p className="text-sm text-gray-900">
                                    {ingreso.descripcionPatologiaDefinitiva}
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Diagnósticos registrados */}
                <div className="his-card p-5">
                    <div className="flex items-center justify-between mb-3 pb-2 border-b">
                        <h3 className="text-sm font-semibold text-gray-700">Diagnósticos</h3>
                        {puedeAgregarDiagnostico && (
                            <div>DiagnosticoInlineForm placeholder</div> // TODO: implement
                        )}
                    </div>
                    {ingreso.ingresoPatologias.length === 0 ? (
                        <p className="text-sm text-gray-400">Sin diagnósticos registrados.</p>
                    ) : (
                        <div className="space-y-2">
                            {ingreso.ingresoPatologias.map((d) => (
                                <div key={d.id} className="rounded-md bg-gray-50 px-3 py-2 text-sm">
                                    <p className="text-gray-900">{d.descripcion}</p>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        {formatearFechaHora(d.fecha)}
                                        {d.observaciones && ` · ${d.observaciones}`}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Movimientos */}
                <div className="his-card p-5">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b">
                        Movimientos del Ingreso
                    </h3>
                    {ingreso.movimientosIngreso.length === 0 ? (
                        <p className="text-sm text-gray-400">Sin movimientos registrados.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs text-gray-400 uppercase tracking-wider">
                                        <th className="pb-2 pr-4">Tipo</th>
                                        <th className="pb-2 pr-4">Fecha</th>
                                        <th className="pb-2 pr-4">Concepto</th>
                                        <th className="pb-2 pr-4 text-right">Importe</th>
                                        <th className="pb-2 text-right">Saldo</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {ingreso.movimientosIngreso.map((m) => (
                                        <tr key={m.id}>
                                            <td className="py-2 pr-4 text-gray-700">
                                                {m.tipoMovimiento.descripcion}
                                            </td>
                                            <td className="py-2 pr-4 text-gray-500">
                                                {formatearFecha(m.fecha)}
                                            </td>
                                            <td className="py-2 pr-4 text-gray-600">{m.concepto ?? '-'}</td>
                                            <td className="py-2 pr-4 text-right font-mono text-gray-700">
                                                {m.signo >= 0 ? '+' : ''}
                                                {Number(m.importe).toFixed(2)}
                                            </td>
                                            <td className="py-2 text-right font-mono text-gray-700">
                                                {Number(m.saldo).toFixed(2)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Observaciones */}
                {ingreso.observaciones && (
                    <div className="his-card p-5">
                        <h3 className="text-sm font-semibold text-gray-700 mb-2">Observaciones</h3>
                        <p className="text-sm text-gray-600 whitespace-pre-line">
                            {ingreso.observaciones}
                        </p>
                    </div>
                )}
            </div>

            {/* Contenido imprimible — solo visible al imprimir */}
            <FichaAdmisionPrint ingreso={ingreso} />
        </div>
    )
}