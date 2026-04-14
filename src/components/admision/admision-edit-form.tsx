'use client'

import { useState, useEffect, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Save, Loader2 } from 'lucide-react'
import { updateIngresoAction, getProfesionalesAction, getMotivosEgresoAction } from '@/modules/admision/actions'
import { ActualizarIngresoSchema } from '@/modules/admision/schemas'
import type { ActualizarIngresoInput } from '@/modules/admision/schemas'
import type { IngresoConRelaciones } from '@/modules/admision/types'

interface AdmisionEditFormProps {
    ingreso: IngresoConRelaciones
    onSuccess: () => void
}

export function AdmisionEditForm({ ingreso, onSuccess }: AdmisionEditFormProps) {
    const [isPending, startTransition] = useTransition()
    const [profesionales, setProfesionales] = useState<{ id: number; nombre: string }[]>([])
    const [motivosEgreso, setMotivosEgreso] = useState<{ codigo: string; descripcion: string }[]>([])
    const [isLoadingData, setIsLoadingData] = useState(true)

    const form = useForm<ActualizarIngresoInput>({
        resolver: zodResolver(ActualizarIngresoSchema),
        defaultValues: {
            subtipoAdmisionCodigo: ingreso.subtipoAdmision?.codigo,
            fechaIngreso: ingreso.fechaIngreso ? new Date(ingreso.fechaIngreso) : undefined,
            fechaEgresoPrevista: ingreso.fechaEgresoPrevista ? new Date(ingreso.fechaEgresoPrevista) : undefined,
            fechaEgreso: ingreso.fechaEgreso ? new Date(ingreso.fechaEgreso) : undefined,
            profesionalGuardiaId: ingreso.profesionalGuardiaId ?? undefined,
            profesionalTratanteId: ingreso.profesionalTratanteId ?? undefined,
            camaId: ingreso.camaId ?? undefined,
            sedeId: ingreso.sedeId ?? undefined,
            obraSocialId: ingreso.obraSocialId ?? undefined,
            planId: ingreso.planId ?? undefined,
            numeroAfiliado: ingreso.numeroAfiliado ?? undefined,
            descripcionPatologia: ingreso.descripcionPatologia ?? undefined,
            descripcionPatologiaDefinitiva: ingreso.descripcionPatologiaDefinitiva ?? undefined,
            observaciones: ingreso.observaciones ?? undefined,
            estado: ingreso.estado ?? undefined,
            motivoEgresoCodigo: ingreso.motivoEgreso?.codigo ?? undefined,
        } as Partial<ActualizarIngresoInput>,
    })

    useEffect(() => {
        const loadData = async () => {
            try {
                const [profData, motivosData] = await Promise.all([
                    getProfesionalesAction(),
                    getMotivosEgresoAction(),
                ])
                setProfesionales(profData)
                setMotivosEgreso(motivosData)
            } catch (error) {
                alert('Error al cargar datos')
                console.error(error)
            } finally {
                setIsLoadingData(false)
            }
        }
        loadData()
    }, [])

    const onSubmit = (data: ActualizarIngresoInput) => {
        startTransition(async () => {
            try {
                await updateIngresoAction(ingreso.id, data)
                alert('Ingreso actualizado correctamente')
                onSuccess()
            } catch (error) {
                alert('Error al actualizar el ingreso')
                console.error(error)
            }
        })
    }

    if (isLoadingData) {
        return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
    }

    return (
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Fecha de Ingreso */}
                <div className="space-y-2">
                    <label htmlFor="fechaIngreso" className="block text-sm font-medium text-gray-700">
                        Fecha de Ingreso
                    </label>
                    <input
                        id="fechaIngreso"
                        type="date"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        {...form.register('fechaIngreso', { valueAsDate: true })}
                    />
                    {form.formState.errors.fechaIngreso && (
                        <p className="text-sm text-red-600">{form.formState.errors.fechaIngreso.message}</p>
                    )}
                </div>

                {/* Fecha de Egreso */}
                <div className="space-y-2">
                    <label htmlFor="fechaEgreso" className="block text-sm font-medium text-gray-700">
                        Fecha de Egreso
                    </label>
                    <input
                        id="fechaEgreso"
                        type="date"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        {...form.register('fechaEgreso', { valueAsDate: true })}
                    />
                    {form.formState.errors.fechaEgreso && (
                        <p className="text-sm text-red-600">{form.formState.errors.fechaEgreso.message}</p>
                    )}
                </div>

                {/* Egreso Previsto */}
                <div className="space-y-2">
                    <label htmlFor="fechaEgresoPrevista" className="block text-sm font-medium text-gray-700">
                        Egreso Previsto
                    </label>
                    <input
                        id="fechaEgresoPrevista"
                        type="date"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        {...form.register('fechaEgresoPrevista', { valueAsDate: true })}
                    />
                    {form.formState.errors.fechaEgresoPrevista && (
                        <p className="text-sm text-red-600">{form.formState.errors.fechaEgresoPrevista.message}</p>
                    )}
                </div>

                {/* Estado */}
                <div className="space-y-2">
                    <label htmlFor="estado" className="block text-sm font-medium text-gray-700">
                        Estado
                    </label>
                    <select
                        id="estado"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        {...form.register('estado')}
                    >
                        <option value="">Seleccionar estado</option>
                        <option value="A">Activo</option>
                        <option value="E">Egresado</option>
                        <option value="P">Pendiente</option>
                        <option value="X">Anulado</option>
                    </select>
                    {form.formState.errors.estado && (
                        <p className="text-sm text-red-600">{form.formState.errors.estado.message}</p>
                    )}
                </div>

                {/* Profesional Guardia */}
                <div className="space-y-2">
                    <label htmlFor="profesionalGuardiaId" className="block text-sm font-medium text-gray-700">
                        Profesional Guardia
                    </label>
                    <select
                        id="profesionalGuardiaId"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        {...form.register('profesionalGuardiaId', { valueAsNumber: true })}
                    >
                        <option value="">Seleccionar profesional</option>
                        {profesionales.map((prof) => (
                            <option key={prof.id} value={prof.id}>
                                {prof.nombre}
                            </option>
                        ))}
                    </select>
                    {form.formState.errors.profesionalGuardiaId && (
                        <p className="text-sm text-red-600">{form.formState.errors.profesionalGuardiaId.message}</p>
                    )}
                </div>

                {/* Profesional Tratante */}
                <div className="space-y-2">
                    <label htmlFor="profesionalTratanteId" className="block text-sm font-medium text-gray-700">
                        Profesional Tratante
                    </label>
                    <select
                        id="profesionalTratanteId"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        {...form.register('profesionalTratanteId', { valueAsNumber: true })}
                    >
                        <option value="">Seleccionar profesional</option>
                        {profesionales.map((prof) => (
                            <option key={prof.id} value={prof.id}>
                                {prof.nombre}
                            </option>
                        ))}
                    </select>
                    {form.formState.errors.profesionalTratanteId && (
                        <p className="text-sm text-red-600">{form.formState.errors.profesionalTratanteId.message}</p>
                    )}
                </div>

                {/* Motivo Egreso */}
                <div className="space-y-2">
                    <label htmlFor="motivoEgresoCodigo" className="block text-sm font-medium text-gray-700">
                        Motivo Egreso
                    </label>
                    <select
                        id="motivoEgresoCodigo"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        {...form.register('motivoEgresoCodigo')}
                    >
                        <option value="">Seleccionar motivo</option>
                        {motivosEgreso.map((motivo) => (
                            <option key={motivo.codigo} value={motivo.codigo}>
                                {motivo.descripcion}
                            </option>
                        ))}
                    </select>
                    {form.formState.errors.motivoEgresoCodigo && (
                        <p className="text-sm text-red-600">{form.formState.errors.motivoEgresoCodigo.message}</p>
                    )}
                </div>
            </div>

            {/* Diagnóstico Presuntivo */}
            <div className="space-y-2">
                <label htmlFor="descripcionPatologia" className="block text-sm font-medium text-gray-700">
                    Diagnóstico Presuntivo
                </label>
                <textarea
                    id="descripcionPatologia"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    {...form.register('descripcionPatologia')}
                    placeholder="Ingrese el diagnóstico presuntivo"
                />
                {form.formState.errors.descripcionPatologia && (
                    <p className="text-sm text-red-600">{form.formState.errors.descripcionPatologia.message}</p>
                )}
            </div>

            {/* Diagnóstico Definitivo */}
            <div className="space-y-2">
                <label htmlFor="descripcionPatologiaDefinitiva" className="block text-sm font-medium text-gray-700">
                    Diagnóstico Definitivo
                </label>
                <textarea
                    id="descripcionPatologiaDefinitiva"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    {...form.register('descripcionPatologiaDefinitiva')}
                    placeholder="Ingrese el diagnóstico definitivo"
                />
                {form.formState.errors.descripcionPatologiaDefinitiva && (
                    <p className="text-sm text-red-600">{form.formState.errors.descripcionPatologiaDefinitiva.message}</p>
                )}
            </div>

            {/* Observaciones */}
            <div className="space-y-2">
                <label htmlFor="observaciones" className="block text-sm font-medium text-gray-700">
                    Observaciones
                </label>
                <textarea
                    id="observaciones"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={4}
                    {...form.register('observaciones')}
                    placeholder="Observaciones adicionales"
                />
                {form.formState.errors.observaciones && (
                    <p className="text-sm text-red-600">{form.formState.errors.observaciones.message}</p>
                )}
            </div>

            <div className="flex justify-end gap-4">
                <button
                    type="submit"
                    disabled={isPending}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isPending ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Guardando...
                        </>
                    ) : (
                        <>
                            <Save className="h-4 w-4" />
                            Guardar Cambios
                        </>
                    )}
                </button>
            </div>
        </form>
    )
}