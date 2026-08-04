'use client'

import { useEffect, useState, useTransition } from 'react'
import { updateIngresoAction } from '@/modules/admision/actions'
import type { IngresoDetalle } from '@/modules/admision/types'
import { calcularTotalSeleccionado } from '@/components/ui/componente-selector'
import {
    esSubitemAnestesista,
    esSubitemEspecialista,
    obtenerSubitemsSeleccionados,
    valorUnitarioPorSubitem,
} from '@/lib/practicas-subitems'
import {
    PracticasAdmisionCard,
    type PracticaAdmisionItem,
} from './practicas-admision-card'

const MATRICULA_AMBULATORIO_DEFAULT = 9110

interface PracticaIngresoFormProps {
    ingreso: IngresoDetalle
    practicasActuales: IngresoDetalle['practicas']
    onEncolarGeneracionOrdenes: (task: {
        practicaIds: number[]
        imprimirDespues: boolean
        separarPorPractica?: boolean
    }) => void
    onSuccess: () => void
    onCancel: () => void
}

type PracticaAdmisionApi = {
    id: number
    estado?: string | null
    ordenPractica?: Array<unknown>
}

function estaPendienteDeOrden(practica: PracticaAdmisionApi): boolean {
    const estado = (practica.estado ?? 'A').trim().toUpperCase()
    if (estado === 'X') return false
    return (practica.ordenPractica?.length ?? 0) === 0
}

async function obtenerPracticasIngreso(ingresoId: number): Promise<PracticaAdmisionApi[]> {
    const res = await fetch(`/api/admision/${ingresoId}/practicas`, { cache: 'no-store' })
    const json = await res.json().catch(() => null)
    const practicas = Array.isArray(json?.data) ? json.data : []
    return practicas as PracticaAdmisionApi[]
}

export function PracticaIngresoForm({
    ingreso,
    practicasActuales,
    onEncolarGeneracionOrdenes,
    onSuccess,
    onCancel,
}: PracticaIngresoFormProps) {
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)
    const [practicas, setPracticas] = useState<PracticaAdmisionItem[]>([])
    const [generarOrdenesSeparadasPorPractica, setGenerarOrdenesSeparadasPorPractica] = useState(false)
    const [busquedaPracticaPendiente, setBusquedaPracticaPendiente] = useState({
        termino: '',
        hayResultados: false,
    })
    const permiteNumeroAutorizacionManual = ingreso.tipoIngresoCodigo === 'AMB'

    const subtipoAdmisionCodigo = ingreso.ingresoSubtipo?.subtipoAdmisionCodigo ?? ''
    const etiquetaBusquedaPractica = subtipoAdmisionCodigo === 'CUR' || subtipoAdmisionCodigo === 'SUT'
        ? 'Buscar codigo de practica...'
        : 'Buscar practica en nomenclador...'

    useEffect(() => {
        if (practicas.length < 2 && generarOrdenesSeparadasPorPractica) {
            setGenerarOrdenesSeparadasPorPractica(false)
        }
    }, [practicas.length, generarOrdenesSeparadasPorPractica])

    const obtenerMatriculaDefault = () => {
        const matriculaTratante = ingreso.profesionalTratante?.matricula
            ?? ingreso.profesionalTratanteFallback?.matricula
            ?? ingreso.profesionalInterviniente?.matricula
            ?? null
        const matriculaGuardia = ingreso.profesionalGuardia?.matricula ?? null
        return matriculaTratante ?? matriculaGuardia ?? MATRICULA_AMBULATORIO_DEFAULT
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (practicas.length === 0) {
            setError('Debe agregar al menos una practica')
            return
        }
        if (busquedaPracticaPendiente.termino.trim().length >= 2 && busquedaPracticaPendiente.hayResultados) {
            setError('Seleccione una practica del listado o limpie la busqueda antes de guardar')
            return
        }

        setError(null)
        startTransition(async () => {
            try {
                const idsPrevios = new Set(practicasActuales.map((p) => p.id))

                const practicasExpandida = practicas.flatMap((p) => {
                    const subitems = obtenerSubitemsSeleccionados(
                        {
                            valorEspecialista: p.desglose.valorEspecialista,
                            valorAyudante: p.desglose.valorAyudante,
                            valorAnestesista: p.desglose.valorAnestesista,
                            valorGastos: p.desglose.valorGastos,
                        },
                        p.seleccionComponentes
                    )

                    if (subitems.length === 0) {
                        return [{
                            cantidad: 1,
                            convenioId: p.convenioId,
                            codigo: p.codigo.trim(),
                            descripcion: p.descripcion,
                            numeroAutorizacion: permiteNumeroAutorizacionManual
                                ? (p.numeroAutorizacion?.trim() || null)
                                : null,
                            matriculaEspecialista: p.matriculaEspecialista,
                            matriculaAnestesista: p.matriculaAnestesista,
                            importeTotal: Number((
                                calcularTotalSeleccionado(p.desglose, p.seleccionComponentes)
                            ).toFixed(2)),
                        }]
                    }

                    return subitems.map((subitem) => {
                        const valorUnitario = valorUnitarioPorSubitem(subitem, {
                            valorEspecialista: p.desglose.valorEspecialista,
                            valorAyudante: p.desglose.valorAyudante,
                            valorAnestesista: p.desglose.valorAnestesista,
                            valorGastos: p.desglose.valorGastos,
                        })

                        return {
                            cantidad: 1,
                            convenioId: p.convenioId,
                            codigo: p.codigo.trim(),
                            descripcion: p.descripcion,
                            numeroAutorizacion: permiteNumeroAutorizacionManual
                                ? (p.numeroAutorizacion?.trim() || null)
                                : null,
                            matriculaEspecialista: esSubitemEspecialista(subitem) ? p.matriculaEspecialista : null,
                            matriculaAnestesista: esSubitemAnestesista(subitem) ? p.matriculaAnestesista : null,
                            importeTotal: Number((valorUnitario ?? 0).toFixed(2)),
                        }
                    })
                })

                await updateIngresoAction(ingreso.id, {
                    practicasAgregar: practicasExpandida,
                })

                const practicasActualizadas = await obtenerPracticasIngreso(ingreso.id)
                const idsNuevasPendientes = practicasActualizadas
                    .filter((p) => !idsPrevios.has(p.id) && estaPendienteDeOrden(p))
                    .map((p) => p.id)

                if (idsNuevasPendientes.length > 0) {
                    onEncolarGeneracionOrdenes({
                        practicaIds: idsNuevasPendientes,
                        imprimirDespues: true,
                        separarPorPractica: practicas.length > 1 && generarOrdenesSeparadasPorPractica,
                    })
                }

                setPracticas([])
                setGenerarOrdenesSeparadasPorPractica(false)
                onSuccess()
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Error al guardar')
            }
        })
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-gray-50 rounded-md border border-gray-200">
            <div className="space-y-4">
                {!ingreso.obraSocialId && (
                    <p className="text-xs text-amber-700">
                        Asignar obra social a la admision para buscar practicas
                    </p>
                )}

                <PracticasAdmisionCard
                    obraSocialId={ingreso.obraSocialId}
                    etiquetaBusqueda={etiquetaBusquedaPractica}
                    practicas={practicas}
                    setPracticas={setPracticas}
                    obtenerMatriculaDefault={obtenerMatriculaDefault}
                    disabled={isPending || !ingreso.obraSocialId}
                    onPendingSearchChange={setBusquedaPracticaPendiente}
                />

                {practicas.length > 1 && (
                    <div className="rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2">
                        <label className="inline-flex items-center gap-2 text-sm text-blue-900">
                            <input
                                type="checkbox"
                                checked={generarOrdenesSeparadasPorPractica}
                                onChange={(e) => setGenerarOrdenesSeparadasPorPractica(e.target.checked)}
                                className="h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                            />
                            Generar una orden separada por cada práctica agregada
                        </label>
                    </div>
                )}

                {error && (
                    <div className="text-xs text-red-600">{error}</div>
                )}
                <div className="flex gap-2 justify-end">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        disabled={isPending}
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        disabled={isPending || !ingreso.obraSocialId}
                    >
                        Guardar
                    </button>
                </div>
            </div>
        </form>
    )
}
