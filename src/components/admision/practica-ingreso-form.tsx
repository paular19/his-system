'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { updateIngresoAction } from '@/modules/admision/actions'
import { crearPedidoLaboratorioAction } from '@/modules/orden/actions'
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
    onSuccess: () => void
    onCancel: () => void
}

export function PracticaIngresoForm({ ingreso, onSuccess, onCancel }: PracticaIngresoFormProps) {
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)
    const [practicas, setPracticas] = useState<PracticaAdmisionItem[]>([])
    const [mostrarPedidoLaboratorio, setMostrarPedidoLaboratorio] = useState(false)
    const [guardandoPedidoLaboratorio, setGuardandoPedidoLaboratorio] = useState(false)
    const [numeroProtocoloLaboratorio, setNumeroProtocoloLaboratorio] = useState('')
    const [diagnosticoLaboratorio, setDiagnosticoLaboratorio] = useState('')
    const [busquedaPracticaPendiente, setBusquedaPracticaPendiente] = useState({
        termino: '',
        hayResultados: false,
    })
    const permiteNumeroAutorizacionManual = ingreso.tipoIngresoCodigo === 'AMB'

    const subtipoAdmisionCodigo = ingreso.ingresoSubtipo?.subtipoAdmisionCodigo ?? ''
    const etiquetaBusquedaPractica = subtipoAdmisionCodigo === 'CUR' || subtipoAdmisionCodigo === 'SUT'
        ? 'Buscar codigo de practica...'
        : 'Buscar practica en nomenclador...'

    const obtenerMatriculaDefault = () => {
        const matriculaTratante = ingreso.profesionalTratante?.matricula
            ?? ingreso.profesionalTratanteFallback?.matricula
            ?? ingreso.profesionalInterviniente?.matricula
            ?? null
        const matriculaGuardia = ingreso.profesionalGuardia?.matricula ?? null
        return matriculaTratante ?? matriculaGuardia ?? MATRICULA_AMBULATORIO_DEFAULT
    }

    const limpiarPedidoLaboratorio = () => {
        setNumeroProtocoloLaboratorio('')
        setDiagnosticoLaboratorio('')
    }

    const crearPedidoLaboratorio = async () => {
        const numeroProtocolo = numeroProtocoloLaboratorio.trim()
        const diagnostico = diagnosticoLaboratorio.trim()

        if (!numeroProtocolo) {
            setError('Ingresa el numero de protocolo')
            return
        }

        if (!diagnostico) {
            setError('Ingresa el diagnostico')
            return
        }

        setError(null)
        setGuardandoPedidoLaboratorio(true)
        try {
            const result = await crearPedidoLaboratorioAction({
                ingresoId: ingreso.id,
                numeroProtocolo,
                diagnostico,
            })

            if ('error' in result && result.error) {
                setError(result.error)
                return
            }

            if ('puestoNumero' in result && 'numero' in result) {
                window.location.href = `/dashboard/ambulatorio/${result.puestoNumero}/${result.numero}`
                return
            }

            limpiarPedidoLaboratorio()
            setMostrarPedidoLaboratorio(false)
        } catch {
            setError('Error al generar el pedido de laboratorio')
        } finally {
            setGuardandoPedidoLaboratorio(false)
        }
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
                setPracticas([])
                onSuccess()
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Error al guardar')
            }
        })
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-gray-50 rounded-md border border-gray-200">
            <div className="space-y-4">
                <div className="rounded-md border border-indigo-200 bg-indigo-50/40 p-3">
                    <button
                        type="button"
                        onClick={() => {
                            setMostrarPedidoLaboratorio((v) => !v)
                            if (mostrarPedidoLaboratorio) limpiarPedidoLaboratorio()
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md border border-indigo-300 bg-white px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                    >
                        Nuevo pedido de laboratorio
                    </button>

                    {mostrarPedidoLaboratorio && (
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                            <input
                                type="text"
                                value={numeroProtocoloLaboratorio}
                                onChange={(e) => setNumeroProtocoloLaboratorio(e.target.value)}
                                placeholder="Numero de protocolo"
                                className="rounded border border-gray-300 px-3 py-2 text-sm"
                            />
                            <input
                                type="text"
                                value={diagnosticoLaboratorio}
                                onChange={(e) => setDiagnosticoLaboratorio(e.target.value)}
                                placeholder="Diagnostico"
                                className="rounded border border-gray-300 px-3 py-2 text-sm"
                            />
                            <div className="md:col-span-2 flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => void crearPedidoLaboratorio()}
                                    disabled={guardandoPedidoLaboratorio}
                                    className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    {guardandoPedidoLaboratorio ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
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
