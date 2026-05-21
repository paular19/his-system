'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ActualizarIngresoSchema } from '@/modules/admision/schemas'
import { updateIngresoAction } from '@/modules/admision/actions'
import { ChevronRight, User, Pencil, FileText, Printer, Save, X } from 'lucide-react'
import Link from 'next/link'
import { formatearFecha, formatearFechaHora, calcularEdad } from '@/lib/utils'
import { AdmisionEditForm } from './admision-edit-form'
import { FichaAdmisionPrint } from './ficha-admision-print'
import { PracticaIngresoForm } from './practica-ingreso-form'
import type { IngresoDetalle } from '@/modules/admision/types'
import { formatearNumeroOrden } from '@/modules/orden/types'
import { limpiarObservacionesAdmision } from '@/modules/admision/utils'

interface FichaIngresoClientProps {
    ingreso: IngresoDetalle
    puedeModificar: boolean
    puedeAgregarDiagnostico: boolean
    puedeGenerarAutorizacion: boolean
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

export function FichaIngresoClient({
    ingreso,
    puedeModificar,
    puedeAgregarDiagnostico,
    puedeGenerarAutorizacion,
}: FichaIngresoClientProps) {
    const [isEditing, setIsEditing] = useState(false)
    const edad = ingreso.fechaNacimiento ? calcularEdad(ingreso.fechaNacimiento) : null
    const observacionesLimpias = limpiarObservacionesAdmision(ingreso.observaciones)

    // Inline edit state for each card
    const [editingCard, setEditingCard] = useState<string | null>(null)
    const [cardLoading, setCardLoading] = useState(false)
    const [cardError, setCardError] = useState<string | null>(null)
    const [cardValues, setCardValues] = useState<any>({})
    const estadoIngreso = (ingreso.estado ?? '').trim().toUpperCase()
    const ingresoHabilitadoAutorizacion = estadoIngreso === 'A' || estadoIngreso === 'P'
    const tienePracticas = ingreso.practicas.length > 0
    const practicasPendientes = ingreso.practicas.filter((p) => (p.ordenPractica?.length ?? 0) === 0)
    const tienePracticasPendientes = practicasPendientes.length > 0
    const practicasAutorizadas = ingreso.practicas.filter((p) => (p.ordenPractica?.length ?? 0) > 0)
    const profesionalTratanteNombre = ingreso.profesionalTratante?.nombre
        ?? ingreso.evoluciones?.[0]?.profesional?.nombre
        ?? ingreso.profesionalTratanteFallback?.nombre
        ?? null
    const profesionalTratanteMatricula = ingreso.profesionalTratante?.matricula
        ?? ingreso.evoluciones?.[0]?.profesional?.matricula
        ?? ingreso.profesionalTratanteFallback?.matricula
        ?? null
    const motivoBotonAutorizacionDeshabilitado = !ingresoHabilitadoAutorizacion
        ? 'No disponible para ingresos egresados o anulados'
        : !tienePracticas
            ? 'No hay prácticas cargadas en la admisión'
            : !tienePracticasPendientes
                ? 'No hay prácticas pendientes de autorización'
                : ''

    // For select fields (e.g., profesionales), you may want to fetch options here if needed

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
                        {ingreso.tipoIngresoCodigo === 'INT' && (
                            <Link
                                href={`/dashboard/internacion/${ingreso.id}/informe`}
                                className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                            >
                                <FileText className="h-4 w-4" />
                                Informe
                            </Link>
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

                {isEditing && puedeModificar && (
                    <div className="his-card p-5 border-l-4 border-blue-500 print:hidden">
                        <div className="flex items-center justify-between gap-3 mb-4 pb-2 border-b">
                            <h3 className="text-sm font-semibold text-gray-700">Editar ficha</h3>
                            <button
                                onClick={() => setIsEditing(false)}
                                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                <X className="h-4 w-4" />
                                Cerrar edición
                            </button>
                        </div>
                        <AdmisionEditForm ingreso={ingreso} onSuccess={() => setIsEditing(false)} />
                    </div>
                )}

                {/* Datos de admisión */}
                <div className="his-card p-5">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b">
                        <h3 className="text-sm font-semibold text-gray-700">Datos de la Admisión</h3>
                        {puedeModificar && editingCard !== 'admision' && (
                            <button
                                onClick={() => {
                                    setEditingCard('admision');
                                    setCardValues({
                                        fechaIngreso: ingreso.fechaIngreso ? new Date(ingreso.fechaIngreso).toISOString().split('T')[0] : '',
                                        profesionalGuardiaId: ingreso.profesionalGuardiaId || '',
                                        fechaEgreso: ingreso.fechaEgreso ? new Date(ingreso.fechaEgreso).toISOString().split('T')[0] : '',
                                        fechaEgresoPrevista: ingreso.fechaEgresoPrevista ? new Date(ingreso.fechaEgresoPrevista).toISOString().split('T')[0] : '',
                                        profesionalTratanteId: ingreso.profesionalTratanteId || '',
                                    });
                                }}
                                className="ml-1 text-gray-400 hover:text-blue-600" title="Editar sección"
                            >
                                <Pencil className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    {editingCard === 'admision' ? (
                        <form
                            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4"
                            onSubmit={async (e) => {
                                e.preventDefault();
                                setCardLoading(true);
                                setCardError(null);
                                try {
                                    await updateIngresoAction(ingreso.id, cardValues);
                                    setEditingCard(null);
                                } catch (err) {
                                    setCardError('Error al guardar');
                                } finally {
                                    setCardLoading(false);
                                }
                            }}
                        >
                            {/* Tipo de Ingreso (solo lectura) */}
                            <div>
                                <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Tipo de Ingreso</dt>
                                <dd className="text-sm text-gray-900">
                                    {ingreso.ingresoSubtipo?.subtipoAdmision?.descripcion
                                        ?? ingreso.tipoIngreso?.descripcion
                                        ?? ingreso.tipoIngresoCodigo}
                                </dd>
                            </div>
                            {/* Número de Ingreso (solo lectura) */}
                            <div>
                                <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Número de Ingreso</dt>
                                <dd className="text-sm text-gray-900">{`${ingreso.tipoIngresoCodigo}-${ingreso.numeroIngreso}`}</dd>
                            </div>
                            {/* Fecha de Ingreso */}
                            <div>
                                <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Fecha de Ingreso</dt>
                                <dd className="text-sm text-gray-900">
                                    <input
                                        type="datetime-local"
                                        className="border rounded px-2 py-1 w-full"
                                        value={cardValues.fechaIngreso ? cardValues.fechaIngreso + (cardValues.fechaIngreso.length === 10 ? 'T00:00' : '') : ''}
                                        onChange={e => setCardValues((v: any) => ({ ...v, fechaIngreso: e.target.value.slice(0, 16) }))}
                                        disabled={cardLoading}
                                    />
                                </dd>
                            </div>
                            {/* Profesional Guardia */}
                            <div>
                                <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Profesional Guardia</dt>
                                <dd className="text-sm text-gray-900">
                                    <input
                                        type="text"
                                        className="border rounded px-2 py-1 w-full"
                                        value={cardValues.profesionalGuardiaNombre || ingreso.profesionalGuardia?.nombre || ''}
                                        onChange={e => setCardValues((v: any) => ({ ...v, profesionalGuardiaNombre: e.target.value }))}
                                        disabled={cardLoading}
                                    />
                                </dd>
                            </div>
                            {/* Fecha de Egreso */}
                            <div>
                                <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Fecha de Egreso</dt>
                                <dd className="text-sm text-gray-900">
                                    <input
                                        type="datetime-local"
                                        className="border rounded px-2 py-1 w-full"
                                        value={cardValues.fechaEgreso ? cardValues.fechaEgreso + (cardValues.fechaEgreso.length === 10 ? 'T00:00' : '') : ''}
                                        onChange={e => setCardValues((v: any) => ({ ...v, fechaEgreso: e.target.value.slice(0, 16) }))}
                                        disabled={cardLoading}
                                    />
                                </dd>
                            </div>
                            {/* Egreso Previsto */}
                            <div>
                                <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Egreso Previsto</dt>
                                <dd className="text-sm text-gray-900">
                                    <input
                                        type="datetime-local"
                                        className="border rounded px-2 py-1 w-full"
                                        value={cardValues.fechaEgresoPrevista ? cardValues.fechaEgresoPrevista + (cardValues.fechaEgresoPrevista.length === 10 ? 'T00:00' : '') : ''}
                                        onChange={e => setCardValues((v: any) => ({ ...v, fechaEgresoPrevista: e.target.value.slice(0, 16) }))}
                                        disabled={cardLoading}
                                    />
                                </dd>
                            </div>
                            {/* Profesional Tratante */}
                            <div>
                                <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Profesional Tratante</dt>
                                <dd className="text-sm text-gray-900">
                                    <input
                                        type="text"
                                        className="border rounded px-2 py-1 w-full"
                                        value={cardValues.profesionalTratanteNombre || ingreso.profesionalTratante?.nombre || ''}
                                        onChange={e => setCardValues((v: any) => ({ ...v, profesionalTratanteNombre: e.target.value }))}
                                        disabled={cardLoading}
                                    />
                                </dd>
                            </div>
                            <div className="col-span-full flex gap-2 mt-2">
                                <button type="submit" className="text-green-600 border px-3 py-1 rounded" disabled={cardLoading}>Guardar</button>
                                <button type="button" className="text-gray-400 border px-3 py-1 rounded" onClick={() => setEditingCard(null)} disabled={cardLoading}>Cancelar</button>
                                {cardError && <span className="text-red-500 ml-2">{cardError}</span>}
                            </div>
                        </form>
                    ) : (
                        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                            <DataItem
                                label="Tipo de Ingreso"
                                value={
                                    ingreso.ingresoSubtipo?.subtipoAdmision?.descripcion
                                    ?? ingreso.tipoIngreso?.descripcion
                                    ?? ingreso.tipoIngresoCodigo
                                }
                            />
                            <DataItem
                                label="Número de Ingreso"
                                value={`${ingreso.tipoIngresoCodigo}-${ingreso.numeroIngreso}`}
                            />
                            <DataItem label="Fecha de Ingreso" value={formatearFechaHora(ingreso.fechaIngreso)} />
                            <DataItem label="Profesional Guardia" value={ingreso.profesionalGuardia?.nombre} />
                            <DataItem label="Fecha de Egreso" value={formatearFecha(ingreso.fechaEgreso)} />
                            <DataItem label="Egreso Previsto" value={formatearFecha(ingreso.fechaEgresoPrevista)} />
                            <DataItem label="Profesional Tratante" value={profesionalTratanteNombre} />
                            <DataItem
                                label="Matrícula Tratante"
                                value={profesionalTratanteMatricula ? String(profesionalTratanteMatricula) : null}
                            />
                            <DataItem
                                label="Profesional Interviniente"
                                value={ingreso.profesionalInterviniente?.nombre}
                            />
                            {ingreso.cama && (
                                <DataItem
                                    label="Cama"
                                    value={`${ingreso.cama.identificador} (${ingreso.cama.sector}${ingreso.cama.habitacion ? ` · ${ingreso.cama.habitacion}` : ''})`}
                                />
                            )}
                        </dl>
                    )}
                </div>

                {/* Información específica del subtipo de admisión */}
                {ingreso.ingresoSubtipo && (() => {
                    const sub = ingreso.ingresoSubtipo!
                    const codigo = sub.subtipoAdmisionCodigo

                    if (codigo === 'DER') {
                        return (
                            <div className="his-card p-5 border-l-4 border-yellow-400">
                                <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
                                    Información de Derivación
                                </h3>
                                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                                    <DataItem label="Centro Derivante" value={sub.centroDerivante} />
                                    <DataItem label="Profesional Derivante" value={sub.profesionalDerivanteNombre} />
                                    <DataItem label="Motivo de Derivación" value={sub.motivoDerivacion} />
                                    <DataItem label="Diagnóstico de Derivación" value={sub.diagnosticoDerivacion} />
                                </dl>
                            </div>
                        )
                    }

                    if (codigo === 'TUR' || codigo === 'RAY' || codigo === 'PAM') {
                        const tieneDatosTurnoPractica = Boolean(sub.practicaCodigo?.trim() || sub.fechaTurno)
                        if (!tieneDatosTurnoPractica) return null

                        return (
                            <div className="his-card p-5 border-l-4 border-green-400">
                                <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
                                    Ingreso por Turno / Práctica
                                </h3>
                                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                                    <DataItem label="Código de Práctica" value={sub.practicaCodigo} />
                                    {sub.fechaTurno && (
                                        <DataItem label="Fecha de Turno" value={formatearFechaHora(sub.fechaTurno)} />
                                    )}
                                </dl>
                            </div>
                        )
                    }

                    if (codigo === 'IND') {
                        return (
                            <div className="his-card p-5 border-l-4 border-purple-400">
                                <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
                                    Indicación Médica
                                </h3>
                                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                                    <DataItem
                                        label="Profesional Interviniente"
                                        value={ingreso.profesionalInterviniente?.nombre ?? sub.profesionalIndicadorNombre}
                                    />
                                    <DataItem label="Tipo de Indicación" value={sub.tipoIndicacion} />
                                    <DataItem label="Descripción" value={sub.descripcionIndicacion} />
                                </dl>
                            </div>
                        )
                    }

                    return null
                })()}

                {/* Cobertura médica */}
                <div className="his-card p-5">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b">
                        <h3 className="text-sm font-semibold text-gray-700">Cobertura Médica</h3>
                        {puedeModificar && editingCard !== 'cobertura' && (
                            <button
                                onClick={() => {
                                    setEditingCard('cobertura');
                                    setCardValues({
                                        obraSocial: ingreso.obraSocial?.nombre || '',
                                        plan: ingreso.plan?.descripcion || '',
                                        numeroAfiliado: ingreso.numeroAfiliado || '',
                                    });
                                }}
                                className="ml-1 text-gray-400 hover:text-blue-600" title="Editar sección"
                            >
                                <Pencil className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    {editingCard === 'cobertura' ? (
                        <form
                            className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4"
                            onSubmit={async (e) => {
                                e.preventDefault();
                                setCardLoading(true);
                                setCardError(null);
                                try {
                                    await updateIngresoAction(ingreso.id, {
                                        numeroAfiliado: cardValues.numeroAfiliado,
                                        // Aquí deberías mapear a los IDs reales si corresponde
                                    });
                                    setEditingCard(null);
                                } catch (err) {
                                    setCardError('Error al guardar');
                                } finally {
                                    setCardLoading(false);
                                }
                            }}
                        >
                            <div>
                                <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Obra Social</dt>
                                <dd className="text-sm text-gray-900">
                                    <input
                                        type="text"
                                        className="border rounded px-2 py-1 w-full"
                                        value={cardValues.obraSocial}
                                        onChange={e => setCardValues((v: any) => ({ ...v, obraSocial: e.target.value }))}
                                        disabled={cardLoading}
                                    />
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Plan</dt>
                                <dd className="text-sm text-gray-900">
                                    <input
                                        type="text"
                                        className="border rounded px-2 py-1 w-full"
                                        value={cardValues.plan}
                                        onChange={e => setCardValues((v: any) => ({ ...v, plan: e.target.value }))}
                                        disabled={cardLoading}
                                    />
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Número de Afiliado</dt>
                                <dd className="text-sm text-gray-900">
                                    <input
                                        type="text"
                                        className="border rounded px-2 py-1 w-full"
                                        value={cardValues.numeroAfiliado}
                                        onChange={e => setCardValues((v: any) => ({ ...v, numeroAfiliado: e.target.value }))}
                                        disabled={cardLoading}
                                    />
                                </dd>
                            </div>
                            <div className="col-span-full flex gap-2 mt-2">
                                <button type="submit" className="text-green-600 border px-3 py-1 rounded" disabled={cardLoading}>Guardar</button>
                                <button type="button" className="text-gray-400 border px-3 py-1 rounded" onClick={() => setEditingCard(null)} disabled={cardLoading}>Cancelar</button>
                                {cardError && <span className="text-red-500 ml-2">{cardError}</span>}
                            </div>
                        </form>
                    ) : (
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                            <DataItem
                                label="Obra Social"
                                value={ingreso.obraSocial?.nombre ?? (ingreso.obraSocialId ? `ID ${ingreso.obraSocialId}` : null)}
                            />
                            <DataItem
                                label="Plan"
                                value={ingreso.plan?.descripcion ?? (ingreso.planId ? `ID ${ingreso.planId}` : null)}
                            />
                            <DataItem label="Número de Afiliado" value={ingreso.numeroAfiliado} />
                        </dl>
                    )}
                </div>

                {/* Diagnóstico inicial */}
                {(ingreso.descripcionPatologia || ingreso.descripcionPatologiaDefinitiva) && (
                    <div className="his-card p-5">
                        <div className="flex items-center justify-between mb-4 pb-2 border-b">
                            <h3 className="text-sm font-semibold text-gray-700">Diagnóstico</h3>
                            {puedeModificar && editingCard !== 'diagnostico' && (
                                <button
                                    onClick={() => {
                                        setEditingCard('diagnostico');
                                        setCardValues({
                                            descripcionPatologia: ingreso.descripcionPatologia || '',
                                            descripcionPatologiaDefinitiva: ingreso.descripcionPatologiaDefinitiva || '',
                                        });
                                    }}
                                    className="ml-1 text-gray-400 hover:text-blue-600" title="Editar sección"
                                >
                                    <Pencil className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                        {editingCard === 'diagnostico' ? (
                            <form
                                className="space-y-3"
                                onSubmit={async (e) => {
                                    e.preventDefault();
                                    setCardLoading(true);
                                    setCardError(null);
                                    try {
                                        await updateIngresoAction(ingreso.id, {
                                            descripcionPatologia: cardValues.descripcionPatologia,
                                            descripcionPatologiaDefinitiva: cardValues.descripcionPatologiaDefinitiva,
                                        });
                                        setEditingCard(null);
                                    } catch (err) {
                                        setCardError('Error al guardar');
                                    } finally {
                                        setCardLoading(false);
                                    }
                                }}
                            >
                                <div>
                                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Presuntivo</p>
                                    <input
                                        type="text"
                                        className="border rounded px-2 py-1 w-full"
                                        value={cardValues.descripcionPatologia}
                                        onChange={e => setCardValues((v: any) => ({ ...v, descripcionPatologia: e.target.value }))}
                                        disabled={cardLoading}
                                    />
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Definitivo</p>
                                    <input
                                        type="text"
                                        className="border rounded px-2 py-1 w-full"
                                        value={cardValues.descripcionPatologiaDefinitiva}
                                        onChange={e => setCardValues((v: any) => ({ ...v, descripcionPatologiaDefinitiva: e.target.value }))}
                                        disabled={cardLoading}
                                    />
                                </div>
                                <div className="flex gap-2 mt-2">
                                    <button type="submit" className="text-green-600 border px-3 py-1 rounded" disabled={cardLoading}>Guardar</button>
                                    <button type="button" className="text-gray-400 border px-3 py-1 rounded" onClick={() => setEditingCard(null)} disabled={cardLoading}>Cancelar</button>
                                    {cardError && <span className="text-red-500 ml-2">{cardError}</span>}
                                </div>
                            </form>
                        ) : (
                            <>
                                {ingreso.descripcionPatologia && (
                                    <div className="mb-3">
                                        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Presuntivo</p>
                                        <p className="text-sm text-gray-900">{ingreso.descripcionPatologia}</p>
                                    </div>
                                )}
                                {ingreso.descripcionPatologiaDefinitiva && (
                                    <div>
                                        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Definitivo</p>
                                        <p className="text-sm text-gray-900">{ingreso.descripcionPatologiaDefinitiva}</p>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* Diagnósticos registrados */}
                <div className="his-card p-5">
                    <div className="flex items-center justify-between mb-3 pb-2 border-b">
                        <h3 className="text-sm font-semibold text-gray-700">Diagnósticos</h3>
                        {puedeAgregarDiagnostico && (
                            <Link
                                href={`/dashboard/admision/${ingreso.id}/diagnostico`}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                            >
                                + Agregar diagnóstico
                            </Link>
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

                {/* Prácticas realizadas */}
                <div className="his-card p-5">
                    <div className="flex items-center justify-between mb-3 pb-2 border-b gap-3 flex-wrap">
                        <h3 className="text-sm font-semibold text-gray-700">Prácticas realizadas</h3>
                        <div className="flex items-center gap-2">
                            {puedeModificar && (
                                <button
                                    onClick={() => setEditingCard('practicas')}
                                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                >
                                    + Agregar práctica
                                </button>
                            )}
                            {puedeGenerarAutorizacion && (
                                ingresoHabilitadoAutorizacion && tienePracticasPendientes ? (
                                    <Link
                                        href={`/dashboard/ambulatorio/nueva?ingresoId=${ingreso.id}`}
                                        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
                                    >
                                        <Save className="h-4 w-4" />
                                        Generar autorización
                                    </Link>
                                ) : (
                                    <button
                                        type="button"
                                        disabled
                                        title={motivoBotonAutorizacionDeshabilitado}
                                        className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-400 cursor-not-allowed"
                                    >
                                        <Save className="h-4 w-4" />
                                        Generar autorización
                                    </button>
                                )
                            )}
                        </div>
                    </div>

                    {editingCard === 'practicas' && puedeModificar ? (
                        <PracticaIngresoForm
                            ingreso={ingreso}
                            onSuccess={() => {
                                setEditingCard(null)
                                // Aquí se podría hacer un refresh de las prácticas
                                window.location.reload()
                            }}
                            onCancel={() => setEditingCard(null)}
                        />
                    ) : ingreso.practicas.length === 0 ? (
                        <p className="text-sm text-gray-400">
                            Sin prácticas registradas para esta admisión.
                        </p>
                    ) : (
                        <div className="space-y-5">
                            <div>
                                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                                    Pendientes de autorización ({practicasPendientes.length})
                                </p>
                                {practicasPendientes.length === 0 ? (
                                    <p className="text-sm text-gray-400">No hay prácticas pendientes.</p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-left text-xs text-gray-400 uppercase tracking-wider">
                                                    <th className="pb-2 pr-4">Código</th>
                                                    <th className="pb-2 pr-4">Descripción</th>
                                                    <th className="pb-2 pr-4 text-right">Cant.</th>
                                                    <th className="pb-2 pr-4">Fecha</th>
                                                    <th className="pb-2">N° Autorización</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {practicasPendientes.map((p) => (
                                                    <tr key={p.id}>
                                                        <td className="py-2 pr-4 font-mono text-xs text-gray-700">
                                                            {p.codigoPractica.trim()}
                                                        </td>
                                                        <td className="py-2 pr-4 text-gray-700">
                                                            {p.nomencladorPractica?.descripcion ?? p.codigoPractica.trim()}
                                                        </td>
                                                        <td className="py-2 pr-4 text-right text-gray-700">
                                                            {Number(p.cantidad)}
                                                        </td>
                                                        <td className="py-2 pr-4 text-gray-500">
                                                            {formatearFechaHora(p.fecha)}
                                                        </td>
                                                        <td className="py-2 text-gray-700">{p.numeroAutorizacion ?? '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            <div>
                                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                    Ya autorizadas ({practicasAutorizadas.length})
                                </p>
                                {practicasAutorizadas.length === 0 ? (
                                    <p className="text-sm text-gray-400">No hay prácticas autorizadas.</p>
                                ) : (
                                    <div className="overflow-x-auto rounded-md border border-emerald-200 bg-emerald-50/40 px-2">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-left text-xs text-emerald-700 uppercase tracking-wider">
                                                    <th className="pb-2 pr-4 pt-2">Código</th>
                                                    <th className="pb-2 pr-4 pt-2">Descripción</th>
                                                    <th className="pb-2 pr-4 pt-2 text-right">Cant.</th>
                                                    <th className="pb-2 pr-4 pt-2">Fecha</th>
                                                    <th className="pb-2 pt-2">Orden</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-emerald-100">
                                                {practicasAutorizadas.map((p) => (
                                                    <tr key={p.id}>
                                                        <td className="py-2 pr-4 font-mono text-xs text-emerald-900">
                                                            {p.codigoPractica.trim()}
                                                        </td>
                                                        <td className="py-2 pr-4 text-emerald-900">
                                                            {p.nomencladorPractica?.descripcion ?? p.codigoPractica.trim()}
                                                        </td>
                                                        <td className="py-2 pr-4 text-right text-emerald-900">
                                                            {Number(p.cantidad)}
                                                        </td>
                                                        <td className="py-2 pr-4 text-emerald-800">
                                                            {formatearFechaHora(p.fecha)}
                                                        </td>
                                                        <td className="py-2 text-emerald-900">
                                                            {formatearNumeroOrden(
                                                                p.ordenPractica[0]!.puestoNumero,
                                                                p.ordenPractica[0]!.ordenNumero,
                                                                p.ordenPractica[0]!.item
                                                            )}
                                                            {p.ordenPractica[0]!.numeroAutorizacion
                                                                ? ` · ${p.ordenPractica[0]!.numeroAutorizacion}`
                                                                : ' · falta N° de autorización'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Observaciones */}
                {observacionesLimpias && (
                    <div className="his-card p-5">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold text-gray-700">Observaciones</h3>
                            {puedeModificar && editingCard !== 'observaciones' && (
                                <button
                                    onClick={() => {
                                        setEditingCard('observaciones');
                                        setCardValues({ observaciones: observacionesLimpias });
                                    }}
                                    className="ml-1 text-gray-400 hover:text-blue-600" title="Editar sección"
                                >
                                    <Pencil className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                        {editingCard === 'observaciones' ? (
                            <form
                                onSubmit={async (e) => {
                                    e.preventDefault();
                                    setCardLoading(true);
                                    setCardError(null);
                                    try {
                                        await updateIngresoAction(ingreso.id, { observaciones: cardValues.observaciones });
                                        setEditingCard(null);
                                    } catch (err) {
                                        setCardError('Error al guardar');
                                    } finally {
                                        setCardLoading(false);
                                    }
                                }}
                            >
                                <textarea
                                    className="border rounded px-2 py-1 w-full text-sm"
                                    rows={4}
                                    value={cardValues.observaciones}
                                    onChange={e => setCardValues((v: any) => ({ ...v, observaciones: e.target.value }))}
                                    disabled={cardLoading}
                                />
                                <div className="flex gap-2 mt-2">
                                    <button type="submit" className="text-green-600 border px-3 py-1 rounded" disabled={cardLoading}>Guardar</button>
                                    <button type="button" className="text-gray-400 border px-3 py-1 rounded" onClick={() => setEditingCard(null)} disabled={cardLoading}>Cancelar</button>
                                    {cardError && <span className="text-red-500 ml-2">{cardError}</span>}
                                </div>
                            </form>
                        ) : (
                            <p className="text-sm text-gray-600 whitespace-pre-line">
                                {observacionesLimpias}
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* Contenido imprimible — solo visible al imprimir */}
            <FichaAdmisionPrint ingreso={ingreso} />
        </div>
    )
}