'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CirugiaProgramadaListItem } from '@/modules/cirugia/types'
import { PracticasAutorizacionSection } from '@/components/cirugia/practicas-autorizacion-section'
import { ChevronDown, ChevronRight, Stethoscope } from 'lucide-react'
import { Fragment } from 'react'

interface CirugiaProgramadaTableProps {
    items: CirugiaProgramadaListItem[]
}

interface CamaDisponible {
    id: number
    identificador: string
    sector: string
    habitacion: string | null
}

interface PreIngresoFormState {
    fechaIngreso: string
    horaIngreso: string
    fechaEgresoPrevista: string
    camaId: string
    camas: CamaDisponible[]
    camasCargadas: boolean
    cargandoCamas: boolean
    guardando: boolean
    error: string | null
}

function toLocalDateInput(value: Date | string): string {
    const d = new Date(value)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

export function CirugiaProgramadaTable({ items }: CirugiaProgramadaTableProps) {
    const router = useRouter()
    const [expandedId, setExpandedId] = useState<number | null>(null)
    const [preIngresoByCirugia, setPreIngresoByCirugia] = useState<Record<number, PreIngresoFormState>>({})

    const initPreIngresoForm = (item: CirugiaProgramadaListItem) => {
        setPreIngresoByCirugia((prev) => {
            if (prev[item.id]) return prev
            return {
                ...prev,
                [item.id]: {
                    fechaIngreso: toLocalDateInput(item.fechaCirugia),
                    horaIngreso: '',
                    fechaEgresoPrevista: toLocalDateInput(item.fechaCirugia),
                    camaId: '',
                    camas: [],
                    camasCargadas: false,
                    cargandoCamas: false,
                    guardando: false,
                    error: null,
                },
            }
        })
    }

    const cargarCamasDisponibles = async (cirugiaId: number) => {
        const formActual = preIngresoByCirugia[cirugiaId]
        if (!formActual) return

        setPreIngresoByCirugia((prev) => {
            const current = prev[cirugiaId]
            if (!current) return prev
            return {
                ...prev,
                [cirugiaId]: {
                    ...current,
                    cargandoCamas: true,
                    error: null,
                },
            }
        })

        try {
            const qs = new URLSearchParams()
            if (formActual.fechaIngreso) qs.set('fecha', formActual.fechaIngreso)
            if (formActual.horaIngreso) qs.set('hora', formActual.horaIngreso)

            const res = await fetch(`/api/cirugia/camas-disponibles?${qs.toString()}`)
            const json = await res.json()
            if (!res.ok) {
                throw new Error(json?.error ?? 'No se pudieron cargar camas disponibles')
            }

            const camasRaw = Array.isArray(json?.camas)
                ? json.camas
                : []

            const camas = (camasRaw as Array<Record<string, unknown>>)
                .filter((c) => c?.estado === 'DISPONIBLE' || c?.estado === undefined)
                .map((c) => ({
                    id: Number(c.id),
                    identificador: String(c.identificador ?? ''),
                    sector: String(c.sector ?? ''),
                    habitacion: c.habitacion ? String(c.habitacion) : null,
                }))
                .filter((c) => Number.isFinite(c.id) && c.id > 0 && c.identificador.length > 0)

            setPreIngresoByCirugia((prev) => {
                const current = prev[cirugiaId]
                if (!current) return prev
                const selectedStillAvailable = camas.some((c) => String(c.id) === current.camaId)
                return {
                    ...prev,
                    [cirugiaId]: {
                        ...current,
                        camas,
                        camaId: selectedStillAvailable ? current.camaId : '',
                        camasCargadas: true,
                        cargandoCamas: false,
                    },
                }
            })
        } catch (err) {
            setPreIngresoByCirugia((prev) => {
                const current = prev[cirugiaId]
                if (!current) return prev
                return {
                    ...prev,
                    [cirugiaId]: {
                        ...current,
                        camasCargadas: true,
                        cargandoCamas: false,
                        error: err instanceof Error ? err.message : 'No se pudieron cargar camas disponibles',
                    },
                }
            })
        }
    }

    const actualizarPreIngreso = (cirugiaId: number, patch: Partial<PreIngresoFormState>) => {
        setPreIngresoByCirugia((prev) => {
            const current = prev[cirugiaId]
            if (!current) return prev
            return {
                ...prev,
                [cirugiaId]: {
                    ...current,
                    ...patch,
                },
            }
        })
    }

    const asignarCamaEIngresar = async (item: CirugiaProgramadaListItem) => {
        if (!item.internacionId) return

        const form = preIngresoByCirugia[item.id]
        if (!form) return

        if (!form.fechaIngreso || !form.horaIngreso) {
            actualizarPreIngreso(item.id, { error: 'Debe completar fecha y hora de ingreso.' })
            return
        }
        if (!form.fechaEgresoPrevista) {
            actualizarPreIngreso(item.id, { error: 'Debe completar la fecha de egreso prevista.' })
            return
        }
        if (!form.camaId) {
            actualizarPreIngreso(item.id, { error: 'Debe seleccionar una cama disponible.' })
            return
        }

        const fechaIngresoISO = new Date(`${form.fechaIngreso}T${form.horaIngreso}:00`).toISOString()
        const fechaEgresoPrevistaISO = new Date(`${form.fechaEgresoPrevista}T00:00:00`).toISOString()
        const camaDestinoId = Number.parseInt(form.camaId, 10)

        if (!Number.isFinite(camaDestinoId) || camaDestinoId <= 0) {
            actualizarPreIngreso(item.id, { error: 'La cama seleccionada no es válida.' })
            return
        }

        actualizarPreIngreso(item.id, { guardando: true, error: null })

        try {
            const resAsignacion = await fetch(`/api/cirugia/${item.internacionId}/asignar-cama`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fechaIngreso: fechaIngresoISO,
                    fechaEgresoPrevista: fechaEgresoPrevistaISO,
                    camaDestinoId,
                    motivo: 'Asignación inicial de cama desde Cirugía Programada',
                }),
            })
            const jsonAsignacion = await resAsignacion.json()
            if (!resAsignacion.ok) {
                throw new Error(jsonAsignacion?.error ?? 'No se pudo asignar la cama')
            }

            router.push(`/dashboard/internacion/${item.internacionId}`)
            router.refresh()
        } catch (err) {
            actualizarPreIngreso(item.id, {
                guardando: false,
                error: err instanceof Error ? err.message : 'No se pudo completar el ingreso',
            })
            return
        }

        actualizarPreIngreso(item.id, { guardando: false })
    }

    useEffect(() => {
        if (!expandedId) return
        const item = items.find((x) => x.id === expandedId)
        if (!item) return
        if (!item.internacionId || item.internacionTipoIngresoCodigo !== 'INT') return

        const form = preIngresoByCirugia[item.id]
        if (!form) {
            initPreIngresoForm(item)
            return
        }

        if (!form.camasCargadas && !form.cargandoCamas) {
            void cargarCamasDisponibles(item.id)
        }
    }, [expandedId, items, preIngresoByCirugia])

    if (items.length === 0) {
        return (
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b bg-gray-50 text-left">
                        <th className="px-4 py-3 w-10" />
                        <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Fecha</th>
                        <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Hora</th>
                        <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Paciente</th>
                        <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Cobertura</th>
                        <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Practicas</th>
                        <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">N deg autorizacion</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                            <Stethoscope className="h-8 w-8 mx-auto mb-2 opacity-30" />
                            <p>No hay cirugias programadas</p>
                        </td>
                    </tr>
                </tbody>
            </table>
        )
    }

    return (
        <table className="w-full text-sm">
            <thead>
                <tr className="border-b bg-gray-50 text-left">
                    <th className="px-4 py-3 w-10" />
                    <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Fecha</th>
                    <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Hora</th>
                    <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Paciente</th>
                    <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Cobertura</th>
                    <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Practicas</th>
                    <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">N deg autorizacion</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
                {items.map((item) => {
                    const expanded = expandedId === item.id
                    const camaYaAsignada = typeof item.internacionCamaId === 'number' && item.internacionCamaId > 0
                    return (
                        <Fragment key={item.id}>
                            <tr
                                className="hover:bg-gray-50 transition-colors cursor-pointer"
                                onClick={() => setExpandedId(expanded ? null : item.id)}
                            >
                                <td className="px-4 py-3 text-gray-500">
                                    {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </td>
                                <td className="px-4 py-3 text-gray-700">
                                    {new Date(item.fechaCirugia).toLocaleDateString('es-AR')}
                                </td>
                                <td className="px-4 py-3 text-gray-700">{item.horaCirugia || '-'}</td>
                                <td className="px-4 py-3">
                                    <div className="font-medium text-gray-900">{item.paciente.nombreCompleto}</div>
                                    <div className="text-xs text-gray-400">
                                        DNI {item.paciente.numeroDocumento ?? '-'} · HC {item.paciente.historiaClinica ?? '-'}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-gray-600 text-xs">
                                    {item.paciente.obraSocial ?? 'Sin cobertura'}
                                    {item.paciente.plan ? ` · ${item.paciente.plan}` : ''}
                                </td>
                                <td className="px-4 py-3 text-gray-700">{item.practicasCantidad}</td>
                                <td className="px-4 py-3 text-gray-700">{item.numeroAutorizacion?.trim() || '-'}</td>
                            </tr>

                            {expanded && (
                                <tr>
                                    <td colSpan={7} className="px-4 py-4 bg-gray-50/50">
                                        <div className="rounded-md border border-gray-200 bg-white p-4">
                                            <h4 className="mb-3 text-sm font-semibold text-gray-700">Practicas y autorizaciones</h4>
                                            <PracticasAutorizacionSection
                                                cirugiaId={item.id}
                                                internacionId={item.internacionId}
                                                practicas={item.practicas}
                                                onActualizar={() => router.refresh()}
                                            />
                                            {item.internacionId && item.internacionTipoIngresoCodigo === 'INT' && !camaYaAsignada ? (
                                                <div className="mt-4 border-t pt-4 space-y-3">
                                                    <h5 className="text-sm font-semibold text-gray-700">Pre-ingreso para asignación de cama</h5>
                                                    <p className="text-xs text-gray-500">
                                                        Complete fecha/hora de ingreso, egreso previsto y cama disponible. Luego se asigna la cama y se abre la ficha de internación.
                                                    </p>

                                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                                        <div>
                                                            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha ingreso</label>
                                                            <input
                                                                type="date"
                                                                value={preIngresoByCirugia[item.id]?.fechaIngreso ?? ''}
                                                                onChange={(e) => actualizarPreIngreso(item.id, { fechaIngreso: e.target.value })}
                                                                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-medium text-gray-600 mb-1">Hora ingreso</label>
                                                            <input
                                                                type="time"
                                                                value={preIngresoByCirugia[item.id]?.horaIngreso ?? ''}
                                                                onChange={(e) => actualizarPreIngreso(item.id, { horaIngreso: e.target.value })}
                                                                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-medium text-gray-600 mb-1">Egreso previsto</label>
                                                            <input
                                                                type="date"
                                                                value={preIngresoByCirugia[item.id]?.fechaEgresoPrevista ?? ''}
                                                                onChange={(e) => actualizarPreIngreso(item.id, { fechaEgresoPrevista: e.target.value })}
                                                                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-medium text-gray-600 mb-1">Cama disponible</label>
                                                            <select
                                                                value={preIngresoByCirugia[item.id]?.camaId ?? ''}
                                                                onChange={(e) => actualizarPreIngreso(item.id, { camaId: e.target.value })}
                                                                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white"
                                                                disabled={preIngresoByCirugia[item.id]?.cargandoCamas}
                                                            >
                                                                <option value="">-- Seleccionar cama --</option>
                                                                {(preIngresoByCirugia[item.id]?.camas ?? []).map((cama) => (
                                                                    <option key={cama.id} value={String(cama.id)}>
                                                                        {cama.identificador}{cama.habitacion ? ` · Hab ${cama.habitacion}` : ''} ({cama.sector})
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    </div>

                                                    {preIngresoByCirugia[item.id]?.error && (
                                                        <p className="text-xs text-red-600">{preIngresoByCirugia[item.id]?.error}</p>
                                                    )}

                                                    <div className="flex items-center justify-between gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => void cargarCamasDisponibles(item.id)}
                                                            className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                                            disabled={preIngresoByCirugia[item.id]?.cargandoCamas || preIngresoByCirugia[item.id]?.guardando}
                                                        >
                                                            {preIngresoByCirugia[item.id]?.cargandoCamas ? 'Buscando camas...' : 'Actualizar camas disponibles'}
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => void asignarCamaEIngresar(item)}
                                                            className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                                                            disabled={preIngresoByCirugia[item.id]?.guardando || preIngresoByCirugia[item.id]?.cargandoCamas}
                                                        >
                                                            {preIngresoByCirugia[item.id]?.guardando ? 'Asignando cama...' : 'Asignar cama e ir a Internación'}
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : item.internacionId && item.internacionTipoIngresoCodigo === 'INT' && camaYaAsignada ? (
                                                <div className="mt-4 border-t pt-4">
                                                    <p className="text-xs text-emerald-700">
                                                        Esta internación ya tiene cama asignada. No es necesario volver a asignar.
                                                    </p>
                                                </div>
                                            ) : item.internacionId ? (
                                                <div className="mt-4 border-t pt-4">
                                                    <p className="text-xs text-amber-700">
                                                        Esta cirugía está vinculada a un ingreso no tipificado como internación (INT), por eso no se puede abrir "Asignar cama" en esta fila.
                                                    </p>
                                                </div>
                                            ) : null}
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </Fragment>
                    )
                })}
            </tbody>
        </table>
    )
}
