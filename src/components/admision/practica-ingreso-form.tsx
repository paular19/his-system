'use client'

import { useEffect, useState, useTransition } from 'react'
import { addPracticasIngresoAction } from '@/modules/admision/actions'
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
import {
    abrirVentanaImpresionPendiente,
    cerrarVentanaImpresion,
} from '@/lib/utils/print-window'

const MATRICULA_AMBULATORIO_DEFAULT = 9110

interface PracticaIngresoFormProps {
    ingreso: IngresoDetalle
    onEncolarGeneracionOrdenes: (task: {
        practicaIds: number[]
        imprimirDespues: boolean
        separarPorPractica?: boolean
        ventanaImpresionInicial?: Window | null
    }) => void
    onSuccess: () => void
    onCancel: () => void
}

export function PracticaIngresoForm({
    ingreso,
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

        // Abrimos la pestana al hacer click en Guardar para evitar bloqueos de popup.
        const ventanaImpresionInicial = abrirVentanaImpresionPendiente()

        setError(null)
        startTransition(async () => {
            let ventanaTransferida = false
            try {
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

                const resultado = await addPracticasIngresoAction(ingreso.id, {
                    practicasAgregar: practicasExpandida,
                })

                const separarPorPractica = practicas.length > 1 && generarOrdenesSeparadasPorPractica
                if (resultado.practicaIds.length > 0) {
                    onEncolarGeneracionOrdenes({
                        practicaIds: resultado.practicaIds,
                        imprimirDespues: true,
                        separarPorPractica,
                        ventanaImpresionInicial,
                    })
                    ventanaTransferida = true
                }

                setPracticas([])
                setGenerarOrdenesSeparadasPorPractica(false)
                onSuccess()
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Error al guardar')
            } finally {
                if (!ventanaTransferida) {
                    cerrarVentanaImpresion(ventanaImpresionInicial)
                }
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
