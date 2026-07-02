'use client'

import { useState, useEffect, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Save, Loader2, CheckCircle2, AlertCircle, Search, Plus, X } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { ProfesionalSelect } from '@/components/ui/profesional-select'
import { updateIngresoAction, getProfesionalesAction, getMotivosEgresoAction } from '@/modules/admision/actions'
import { ActualizarIngresoSchema } from '@/modules/admision/schemas'
import { crearPedidoLaboratorioAction } from '@/modules/orden/actions'
import type { ActualizarIngresoInput } from '@/modules/admision/schemas'
import type { IngresoDetalle } from '@/modules/admision/types'
import { limpiarObservacionesAdmision } from '@/modules/admision/utils'

interface AdmisionEditFormProps {
    ingreso: IngresoDetalle
    onSuccess: () => void
}

interface PracticaBusquedaItem {
    convenioId: number
    codigo: string
    descripcion: string
    valorEspecialista?: number | null
    valorAnestesista?: number | null
}

interface PracticaEditable {
    tempId: string
    convenioId: number | null
    codigo: string
    descripcion: string
    cantidad: number
    requiereMatriculaEspecialista?: boolean
    requiereMatriculaAnestesista?: boolean
    matriculaEspecialista?: number | null
    matriculaAnestesista?: number | null
}

const MATRICULA_AMBULATORIO_DEFAULT = 9110

export function AdmisionEditForm({ ingreso, onSuccess }: AdmisionEditFormProps) {
    const [isPending, startTransition] = useTransition()
    const [profesionales, setProfesionales] = useState<{ id: number; nombre: string; matricula?: number | null }[]>([])
    const [motivosEgreso, setMotivosEgreso] = useState<{ codigo: string; descripcion: string }[]>([])
    const [isLoadingData, setIsLoadingData] = useState(true)
    const [successMsg, setSuccessMsg] = useState<string | null>(null)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [busquedaPractica, setBusquedaPractica] = useState('')
    const [buscandoPractica, setBuscandoPractica] = useState(false)
    const [resultadosPractica, setResultadosPractica] = useState<PracticaBusquedaItem[]>([])
    const [practicasAgregar, setPracticasAgregar] = useState<PracticaEditable[]>([])
    const [mostrarPedidoLaboratorio, setMostrarPedidoLaboratorio] = useState(false)
    const [guardandoPedidoLaboratorio, setGuardandoPedidoLaboratorio] = useState(false)
    const [numeroProtocoloLaboratorio, setNumeroProtocoloLaboratorio] = useState('')
    const [diagnosticoLaboratorio, setDiagnosticoLaboratorio] = useState('')
    const esAmbulatorio = ingreso.tipoIngresoCodigo === 'AMB'
    const subtiposPracticaAmbulatoria = ['TUR', 'RAY', 'CUR', 'SUT', 'ECG', 'ECO', 'PAM']
    const esPracticaAmbulatoria =
        esAmbulatorio &&
        subtiposPracticaAmbulatoria.includes(ingreso.ingresoSubtipo?.subtipoAdmisionCodigo ?? '')

    const crearTempId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

    const completarMatriculasAmbulatorias = (items: PracticaEditable[]): PracticaEditable[] => {
        if (!esAmbulatorio) return items

        return items.map((p) => ({
            ...p,
            matriculaEspecialista: p.requiereMatriculaEspecialista
                ? (p.matriculaEspecialista ?? MATRICULA_AMBULATORIO_DEFAULT)
                : p.matriculaEspecialista,
            matriculaAnestesista: p.requiereMatriculaAnestesista
                ? (p.matriculaAnestesista ?? MATRICULA_AMBULATORIO_DEFAULT)
                : p.matriculaAnestesista,
        }))
    }

    // Convierte un Date/string/null a YYYY-MM-DD para <input type="date">
    const toDateStr = (d: Date | string | null | undefined) => {
        if (!d) return ''
        const date = new Date(d)
        const y = date.getFullYear()
        const m = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${y}-${m}-${day}`
    }

    // Convierte un Date/string/null a YYYY-MM-DDTHH:mm para <input type="datetime-local">
    const toDateTimeLocalStr = (d: Date | string | null | undefined) => {
        if (!d) return ''
        const date = new Date(d)
        const y = date.getFullYear()
        const m = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const hh = String(date.getHours()).padStart(2, '0')
        const mm = String(date.getMinutes()).padStart(2, '0')
        return `${y}-${m}-${day}T${hh}:${mm}`
    }

    const form = useForm<ActualizarIngresoInput>({
        resolver: zodResolver(ActualizarIngresoSchema),
        defaultValues: {
            subtipoAdmisionCodigo: ingreso.ingresoSubtipo?.subtipoAdmisionCodigo,
            fechaIngreso: toDateTimeLocalStr(ingreso.fechaIngreso) as unknown as Date,
            fechaEgresoPrevista: esPracticaAmbulatoria
                ? undefined
                : (toDateStr(ingreso.fechaEgresoPrevista) as unknown as Date),
            fechaEgreso: toDateStr(ingreso.fechaEgreso) as unknown as Date,
            profesionalGuardiaId: ingreso.profesionalGuardiaId ?? undefined,
            profesionalTratanteId: ingreso.profesionalTratanteId ?? undefined,
            camaId: ingreso.camaId ?? undefined,
            sedeId: ingreso.sedeId ?? undefined,
            obraSocialId: ingreso.obraSocialId ?? undefined,
            planId: ingreso.planId ?? undefined,
            numeroAfiliado: ingreso.numeroAfiliado ?? undefined,
            descripcionPatologia: ingreso.descripcionPatologia ?? undefined,
            descripcionPatologiaDefinitiva: ingreso.descripcionPatologiaDefinitiva ?? undefined,
            observaciones: limpiarObservacionesAdmision(ingreso.observaciones) ?? undefined,
            estado: ingreso.estado ?? undefined,
            motivoEgresoCodigo: ingreso.motivoEgresoCodigo ?? undefined,
        } as Partial<ActualizarIngresoInput>,
    })

    const profesionalGuardiaSeleccionado = form.watch('profesionalGuardiaId')
    const profesionalTratanteSeleccionado = form.watch('profesionalTratanteId')

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

    const buscarPractica = async (termino: string) => {
        if (termino.trim().length < 2) {
            setResultadosPractica([])
            return
        }

        const convenioId = ingreso.obraSocialId ?? undefined
        if (!convenioId) {
            setResultadosPractica([])
            setErrorMsg('La admisión no tiene obra social asignada para buscar prácticas')
            return
        }

        setErrorMsg(null)
        setBuscandoPractica(true)
        setResultadosPractica([])
        try {
            const params = new URLSearchParams({
                q: termino.trim(),
                convenioId: String(convenioId),
            })
            const res = await fetch(`/api/practicas-nomenclador?${params.toString()}`)
            const json = await res.json()
            if (json.ok) {
                const data = Array.isArray(json.data) ? json.data : []
                setResultadosPractica(data as PracticaBusquedaItem[])
            }
        } catch {
            setResultadosPractica([])
        } finally {
            setBuscandoPractica(false)
        }
    }

    useEffect(() => {
        if (!ingreso.obraSocialId) {
            setResultadosPractica([])
            return
        }

        const termino = busquedaPractica.trim()
        if (termino.length < 2) {
            setResultadosPractica([])
            return
        }

        const timer = setTimeout(() => {
            void buscarPractica(termino)
        }, 350)

        return () => clearTimeout(timer)
    }, [busquedaPractica, ingreso.obraSocialId])

    const agregarPractica = (practica: PracticaBusquedaItem) => {
        setPracticasAgregar((prev) => [
            ...prev,
            {
                tempId: crearTempId(),
                convenioId: practica.convenioId,
                codigo: practica.codigo,
                descripcion: practica.descripcion,
                cantidad: 1,
                requiereMatriculaEspecialista: practica.valorEspecialista != null,
                requiereMatriculaAnestesista: practica.valorAnestesista != null,
                matriculaEspecialista: esAmbulatorio && practica.valorEspecialista != null
                    ? MATRICULA_AMBULATORIO_DEFAULT
                    : null,
                matriculaAnestesista: esAmbulatorio && practica.valorAnestesista != null
                    ? MATRICULA_AMBULATORIO_DEFAULT
                    : null,
            },
        ])
        setBusquedaPractica('')
        setResultadosPractica([])
    }

    const agregarPracticaManual = () => {
        if (!busquedaPractica.trim()) return
        const convenioId = ingreso.obraSocialId ?? null
        if (!convenioId) {
            setErrorMsg('La admisión no tiene obra social asignada para agregar prácticas manuales')
            return
        }

        setPracticasAgregar((prev) => [
            ...prev,
            {
                tempId: crearTempId(),
                convenioId,
                codigo: busquedaPractica.trim().slice(0, 8).toUpperCase(),
                descripcion: busquedaPractica.trim(),
                cantidad: 1,
                matriculaEspecialista: null,
                matriculaAnestesista: null,
            },
        ])
        setBusquedaPractica('')
        setResultadosPractica([])
        setErrorMsg(null)
    }

    const quitarPractica = (tempId: string) => {
        setPracticasAgregar((prev) => prev.filter((p) => p.tempId !== tempId))
    }

    const limpiarPedidoLaboratorio = () => {
        setNumeroProtocoloLaboratorio('')
        setDiagnosticoLaboratorio('')
    }

    const crearPedidoLaboratorio = async () => {
        const numeroProtocolo = numeroProtocoloLaboratorio.trim()
        const diagnostico = diagnosticoLaboratorio.trim()

        if (!numeroProtocolo) {
            setErrorMsg('Ingresá el número de protocolo')
            return
        }

        if (!diagnostico) {
            setErrorMsg('Ingresá el diagnóstico')
            return
        }

        setErrorMsg(null)
        setGuardandoPedidoLaboratorio(true)
        try {
            const result = await crearPedidoLaboratorioAction({
                ingresoId: ingreso.id,
                numeroProtocolo,
                diagnostico,
            })

            if ('error' in result && result.error) {
                setErrorMsg(result.error)
                return
            }

            if ('puestoNumero' in result && 'numero' in result) {
                window.location.href = `/dashboard/ambulatorio/${result.puestoNumero}/${result.numero}`
                return
            }

            setSuccessMsg('Pedido de laboratorio generado')
            limpiarPedidoLaboratorio()
            setMostrarPedidoLaboratorio(false)
        } catch {
            setErrorMsg('Error al generar el pedido de laboratorio')
        } finally {
            setGuardandoPedidoLaboratorio(false)
        }
    }

    const onSubmit = (data: ActualizarIngresoInput) => {
        setSuccessMsg(null)
        setErrorMsg(null)

        const practicasAgregarNormalizadas = completarMatriculasAmbulatorias(practicasAgregar)
        if (esAmbulatorio) {
            setPracticasAgregar(practicasAgregarNormalizadas)
        }

        // Sanear selects numéricos: la opción vacía con valueAsNumber devuelve NaN.
        // Si el campo tenía valor y ahora es NaN → el usuario lo limpió → null.
        // Si nunca tuvo valor y sigue vacío → no tocar → undefined.
        const sanitizeNum = (
            val: number | null | undefined,
            original: number | null | undefined
        ): number | null | undefined => {
            if (typeof val === 'number' && isNaN(val)) {
                return original != null ? null : undefined
            }
            return val
        }

        const sanitized: ActualizarIngresoInput = {
            ...data,
            profesionalGuardiaId: sanitizeNum(data.profesionalGuardiaId, ingreso.profesionalGuardiaId),
            profesionalTratanteId: sanitizeNum(data.profesionalTratanteId, ingreso.profesionalTratanteId),
            practicasAgregar: practicasAgregarNormalizadas.length > 0 ? practicasAgregarNormalizadas : undefined,
            // Fechas vacías: string vacío no debe pisar valores existentes
            fechaIngreso: (data.fechaIngreso as unknown as string) ? data.fechaIngreso : undefined,
            fechaEgresoPrevista: esPracticaAmbulatoria
                ? null
                : ((data.fechaEgresoPrevista as unknown as string) ? data.fechaEgresoPrevista : undefined),
            fechaEgreso: (data.fechaEgreso as unknown as string) ? data.fechaEgreso : undefined,
        }

        startTransition(async () => {
            try {
                await updateIngresoAction(ingreso.id, sanitized)
                setSuccessMsg('Ingreso actualizado correctamente')
                setTimeout(() => onSuccess(), 1200)
            } catch (error) {
                setErrorMsg('Error al actualizar el ingreso')
                console.error(error)
            }
        })
    }

    if (isLoadingData) {
        return (
            <div className="p-8">
                <div className="max-w-2xl mx-auto space-y-6">
                    <Skeleton className="h-8 w-1/2 mb-4" />
                    <Skeleton className="h-6 w-full mb-2" />
                    <Skeleton className="h-6 w-full mb-2" />
                    <Skeleton className="h-6 w-2/3" />
                </div>
            </div>
        )
    }

    return (
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Fecha de Ingreso */}
                <div className="space-y-2">
                    <label htmlFor="fechaIngreso" className="block text-sm font-medium text-gray-700">
                        Fecha y hora de ingreso
                    </label>
                    <input
                        id="fechaIngreso"
                        type="datetime-local"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        {...form.register('fechaIngreso')}
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
                        {...form.register('fechaEgreso')}
                    />
                    {form.formState.errors.fechaEgreso && (
                        <p className="text-sm text-red-600">{form.formState.errors.fechaEgreso.message}</p>
                    )}
                </div>

                {/* Egreso Previsto */}
                {!esPracticaAmbulatoria && (
                    <div className="space-y-2">
                        <label htmlFor="fechaEgresoPrevista" className="block text-sm font-medium text-gray-700">
                            Egreso Previsto
                        </label>
                        <input
                            id="fechaEgresoPrevista"
                            type="date"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            {...form.register('fechaEgresoPrevista')}
                        />
                        {form.formState.errors.fechaEgresoPrevista && (
                            <p className="text-sm text-red-600">{form.formState.errors.fechaEgresoPrevista.message}</p>
                        )}
                    </div>
                )}

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
                    <ProfesionalSelect
                        id="profesionalGuardiaId"
                        profesionales={profesionales}
                        value={
                            typeof profesionalGuardiaSeleccionado === 'number'
                                ? String(profesionalGuardiaSeleccionado)
                                : ''
                        }
                        onChange={(nextValue) => {
                            form.setValue(
                                'profesionalGuardiaId',
                                nextValue ? Number.parseInt(nextValue, 10) : undefined,
                                { shouldDirty: true, shouldValidate: true }
                            )
                        }}
                        selectClassName="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {form.formState.errors.profesionalGuardiaId && (
                        <p className="text-sm text-red-600">{form.formState.errors.profesionalGuardiaId.message}</p>
                    )}
                </div>

                {/* Profesional Tratante */}
                <div className="space-y-2">
                    <label htmlFor="profesionalTratanteId" className="block text-sm font-medium text-gray-700">
                        Profesional Tratante
                    </label>
                    <ProfesionalSelect
                        id="profesionalTratanteId"
                        profesionales={profesionales}
                        value={
                            typeof profesionalTratanteSeleccionado === 'number'
                                ? String(profesionalTratanteSeleccionado)
                                : ''
                        }
                        onChange={(nextValue) => {
                            form.setValue(
                                'profesionalTratanteId',
                                nextValue ? Number.parseInt(nextValue, 10) : undefined,
                                { shouldDirty: true, shouldValidate: true }
                            )
                        }}
                        selectClassName="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {form.formState.errors.profesionalTratanteId && (
                        <p className="text-sm text-red-600">{form.formState.errors.profesionalTratanteId.message}</p>
                    )}
                </div>

                {/* Motivo Egreso — sólo internación */}
                {ingreso.tipoIngresoCodigo === 'INT' && (
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
                )}
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

            <div className="space-y-4">
                <div>
                    <h3 className="text-sm font-medium text-gray-700">Prácticas</h3>
                    <p className="text-xs text-gray-500 mt-1">
                        Las prácticas ya registradas se muestran abajo. Desde acá podés agregar nuevas.
                    </p>
                </div>

                <div className="rounded-md border border-indigo-200 bg-indigo-50/40 p-3">
                    <button
                        type="button"
                        onClick={() => {
                            setMostrarPedidoLaboratorio((v) => !v)
                            if (mostrarPedidoLaboratorio) limpiarPedidoLaboratorio()
                        }}
                        className="inline-flex items-center gap-2 rounded-md border border-indigo-300 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Nuevo pedido de laboratorio
                    </button>

                    {mostrarPedidoLaboratorio && (
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                            <input
                                type="text"
                                value={numeroProtocoloLaboratorio}
                                onChange={(e) => setNumeroProtocoloLaboratorio(e.target.value)}
                                placeholder="Número de protocolo"
                                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                            />
                            <input
                                type="text"
                                value={diagnosticoLaboratorio}
                                onChange={(e) => setDiagnosticoLaboratorio(e.target.value)}
                                placeholder="Diagnóstico"
                                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                            />
                            <div className="md:col-span-2 flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => void crearPedidoLaboratorio()}
                                    disabled={guardandoPedidoLaboratorio}
                                    className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    {guardandoPedidoLaboratorio ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                    Generar orden
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMostrarPedidoLaboratorio(false)
                                        limpiarPedidoLaboratorio()
                                    }}
                                    className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {ingreso.practicas.length > 0 && (
                    <div className="rounded-md border overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                                <tr>
                                    <th className="px-3 py-2 text-left">Código</th>
                                    <th className="px-3 py-2 text-left">Práctica ya cargada</th>
                                    <th className="px-3 py-2 text-center">Cant.</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {ingreso.practicas.map((p) => (
                                    <tr key={p.id} className="bg-white">
                                        <td className="px-3 py-2 font-mono text-xs text-gray-600">{p.codigoPractica.trim()}</td>
                                        <td className="px-3 py-2 text-gray-900">{p.nomencladorPractica?.descripcion ?? p.codigoPractica.trim()}</td>
                                        <td className="px-3 py-2 text-center text-gray-700">{p.cantidad}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            value={busquedaPractica}
                            onChange={(e) => setBusquedaPractica(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault()
                                    void buscarPractica(busquedaPractica)
                                }
                            }}
                            placeholder="Buscar práctica por código o descripción..."
                            className="w-full rounded-md border border-gray-300 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => void buscarPractica(busquedaPractica)}
                        disabled={buscandoPractica || busquedaPractica.trim().length < 2}
                        className="rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                    >
                        {buscandoPractica ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
                    </button>
                    <button
                        type="button"
                        onClick={agregarPracticaManual}
                        disabled={!busquedaPractica.trim()}
                        className="rounded-md bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                        title="Agregar práctica manual"
                    >
                        <Plus className="h-4 w-4" />
                    </button>
                </div>

                {resultadosPractica.length > 0 && (
                    <div className="rounded-md border bg-white shadow-sm max-h-48 overflow-y-auto divide-y">
                        {resultadosPractica.map((p) => (
                            <button
                                key={`${p.convenioId}-${p.codigo}`}
                                type="button"
                                onClick={() => agregarPractica(p)}
                                className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors"
                            >
                                <p className="text-sm font-medium text-gray-900">{p.descripcion}</p>
                                <p className="text-xs text-gray-500">Código: {p.codigo.trim()}</p>
                            </button>
                        ))}
                    </div>
                )}

                {practicasAgregar.length > 0 && (
                    <div className="rounded-md border overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-blue-50 text-xs text-gray-500 uppercase">
                                <tr>
                                    <th className="px-3 py-2 text-left">Código</th>
                                    <th className="px-3 py-2 text-left">Nueva práctica</th>
                                    <th className="px-3 py-2 text-left">Matrículas</th>
                                    <th className="px-3 py-2 w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {practicasAgregar.map((p) => (
                                    <tr key={p.tempId} className="bg-white">
                                        <td className="px-3 py-2 font-mono text-xs text-gray-600">{p.codigo.trim()}</td>
                                        <td className="px-3 py-2 text-gray-900">{p.descripcion}</td>
                                        <td className="px-3 py-2">
                                            <div className="flex flex-col gap-1">
                                                {p.requiereMatriculaEspecialista && (
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        value={p.matriculaEspecialista ?? ''}
                                                        onChange={(e) => {
                                                            const value = e.target.value.trim()
                                                            setPracticasAgregar((prev) => prev.map((x) =>
                                                                x.tempId === p.tempId
                                                                    ? { ...x, matriculaEspecialista: value ? parseInt(value, 10) || null : null }
                                                                    : x
                                                            ))
                                                        }}
                                                        className="w-28 rounded border border-gray-200 px-1 py-0.5 text-xs"
                                                        placeholder="Mat. HE"
                                                    />
                                                )}
                                                {p.requiereMatriculaAnestesista && (
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        value={p.matriculaAnestesista ?? ''}
                                                        onChange={(e) => {
                                                            const value = e.target.value.trim()
                                                            setPracticasAgregar((prev) => prev.map((x) =>
                                                                x.tempId === p.tempId
                                                                    ? { ...x, matriculaAnestesista: value ? parseInt(value, 10) || null : null }
                                                                    : x
                                                            ))
                                                        }}
                                                        className="w-28 rounded border border-gray-200 px-1 py-0.5 text-xs"
                                                        placeholder="Mat. HA"
                                                    />
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2">
                                            <button
                                                type="button"
                                                onClick={() => quitarPractica(p.tempId)}
                                                className="text-red-400 hover:text-red-600"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {successMsg && (
                <div className="flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {successMsg}
                </div>
            )}
            {errorMsg && (
                <div className="flex items-center gap-2 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {errorMsg}
                </div>
            )}

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