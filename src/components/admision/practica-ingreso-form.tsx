'use client'

import { useEffect, useState, useTransition } from 'react'
import { X, Loader2, Search } from 'lucide-react'
import { updateIngresoAction } from '@/modules/admision/actions'
import { crearPedidoLaboratorioAction } from '@/modules/orden/actions'
import type { IngresoDetalle } from '@/modules/admision/types'
import {
    ComponenteSelector,
    calcularTotalSeleccionado,
    seleccionPorDefecto,
    type ComponenteSeleccion,
    type ComponenteValores,
} from '@/components/ui/componente-selector'
import {
    esSubitemAnestesista,
    esSubitemEspecialista,
    obtenerSubitemsSeleccionados,
    valorUnitarioPorSubitem,
} from '@/lib/practicas-subitems'

interface PracticaIngresoFormProps {
    ingreso: IngresoDetalle
    onSuccess: () => void
    onCancel: () => void
}

interface PracticaBusquedaItem {
    convenioId: number
    codigo: string
    descripcion: string
    valorEspecialista?: number | null
    valorAnestesista?: number | null
    valorAyudante?: number | null
    valorGastos?: number | null
}

interface PracticaIngresoItem {
    _key: string
    convenioId: number
    codigo: string
    descripcion: string
    numeroAutorizacion: string
    desglose: ComponenteValores
    seleccionComponentes: ComponenteSeleccion
    requiereMatriculaEspecialista: boolean
    requiereMatriculaAnestesista: boolean
    matriculaEspecialista: number | null
    matriculaAnestesista: number | null
}

export function PracticaIngresoForm({ ingreso, onSuccess, onCancel }: PracticaIngresoFormProps) {
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)
    const [buscandoPractica, setBuscandoPractica] = useState(false)
    const [busquedaTermino, setBusquedaTermino] = useState('')
    const [resultados, setResultados] = useState<PracticaBusquedaItem[]>([])
    const [practicas, setPracticas] = useState<PracticaIngresoItem[]>([])
    const [mostrarPedidoLaboratorio, setMostrarPedidoLaboratorio] = useState(false)
    const [guardandoPedidoLaboratorio, setGuardandoPedidoLaboratorio] = useState(false)
    const [numeroProtocoloLaboratorio, setNumeroProtocoloLaboratorio] = useState('')
    const [diagnosticoLaboratorio, setDiagnosticoLaboratorio] = useState('')
    const permiteNumeroAutorizacionManual = ingreso.tipoIngresoCodigo === 'AMB'

    const buscarPractica = async (termino: string) => {
        if (termino.trim().length < 2) {
            setResultados([])
            return
        }

        const convenioId = ingreso.obraSocialId
        if (!convenioId) {
            setResultados([])
            setError('La admisión no tiene obra social asignada para buscar prácticas')
            return
        }

        setError(null)
        setBuscandoPractica(true)
        setResultados([])
        try {
            const params = new URLSearchParams({
                q: termino.trim(),
                convenioId: String(convenioId),
            })
            const res = await fetch(`/api/practicas-nomenclador?${params.toString()}`)
            const json = await res.json()
            if (json.ok) {
                const data = Array.isArray(json.data) ? json.data : []
                setResultados(data as PracticaBusquedaItem[])
            }
        } catch (err) {
            setResultados([])
            setError('Error en la búsqueda')
            console.error(err)
        } finally {
            setBuscandoPractica(false)
        }
    }

    useEffect(() => {
        if (!ingreso.obraSocialId) {
            setResultados([])
            return
        }

        const termino = busquedaTermino.trim()
        if (termino.length < 2) {
            setResultados([])
            return
        }

        const timer = setTimeout(() => {
            void buscarPractica(termino)
        }, 350)

        return () => clearTimeout(timer)
    }, [busquedaTermino, ingreso.obraSocialId])

    const agregarPractica = (practica: PracticaBusquedaItem) => {
        setPracticas((prev) => [
            ...prev,
            {
                _key: `${practica.convenioId}-${practica.codigo}-${Date.now()}`,
                convenioId: practica.convenioId,
                codigo: practica.codigo,
                descripcion: practica.descripcion,
                numeroAutorizacion: '',
                desglose: {
                    valorEspecialista: practica.valorEspecialista ?? null,
                    valorAyudante: practica.valorAyudante ?? null,
                    valorAnestesista: practica.valorAnestesista ?? null,
                    valorGastos: practica.valorGastos ?? null,
                    valorTotal: null,
                },
                seleccionComponentes: seleccionPorDefecto({
                    valorEspecialista: practica.valorEspecialista ?? null,
                    valorAyudante: practica.valorAyudante ?? null,
                    valorAnestesista: practica.valorAnestesista ?? null,
                    valorGastos: practica.valorGastos ?? null,
                    valorTotal: null,
                }),
                requiereMatriculaEspecialista: Number(practica.valorEspecialista ?? 0) > 0,
                requiereMatriculaAnestesista: Number(practica.valorAnestesista ?? 0) > 0,
                matriculaEspecialista: null,
                matriculaAnestesista: null,
            },
        ])
        setResultados([])
        setBusquedaTermino('')
    }

    const quitarPractica = (key: string) => {
        setPracticas((prev) => prev.filter((x) => x._key !== key))
    }

    const limpiarPedidoLaboratorio = () => {
        setNumeroProtocoloLaboratorio('')
        setDiagnosticoLaboratorio('')
    }

    const crearPedidoLaboratorio = async () => {
        const numeroProtocolo = numeroProtocoloLaboratorio.trim()
        const diagnostico = diagnosticoLaboratorio.trim()

        if (!numeroProtocolo) {
            setError('Ingresá el número de protocolo')
            return
        }

        if (!diagnostico) {
            setError('Ingresá el diagnóstico')
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
            setError('Debe agregar al menos una práctica')
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
                                ? (p.numeroAutorizacion.trim() || null)
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
                                ? (p.numeroAutorizacion.trim() || null)
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
                                placeholder="Número de protocolo"
                                className="rounded border border-gray-300 px-3 py-2 text-sm"
                            />
                            <input
                                type="text"
                                value={diagnosticoLaboratorio}
                                onChange={(e) => setDiagnosticoLaboratorio(e.target.value)}
                                placeholder="Diagnóstico"
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

                {/* Búsqueda de Práctica */}
                <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                        Buscar Práctica en el Nomenclador
                    </label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={busquedaTermino}
                            onChange={(e) => setBusquedaTermino(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault()
                                    void buscarPractica(busquedaTermino)
                                }
                            }}
                            disabled={buscandoPractica || isPending || !ingreso.obraSocialId}
                            placeholder="Código o descripción..."
                            className="flex-1 border rounded px-3 py-2 text-sm disabled:bg-gray-100"
                        />
                        <button
                            type="button"
                            onClick={() => void buscarPractica(busquedaTermino)}
                            disabled={buscandoPractica || isPending || busquedaTermino.trim().length < 2 || !ingreso.obraSocialId}
                            className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                        >
                            {buscandoPractica ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Search className="h-4 w-4" />
                            )}
                            Buscar
                        </button>
                    </div>
                </div>

                {!ingreso.obraSocialId && (
                    <p className="mb-3 text-xs text-amber-700">
                        Asignar obra social a la admisión para buscar prácticas
                    </p>
                )}
                {resultados.length > 0 && (
                    <div className="mb-3 rounded-md border bg-white shadow-sm max-h-48 overflow-y-auto divide-y">
                        {resultados.map((p) => (
                            <button
                                key={`${p.convenioId}-${p.codigo}`}
                                type="button"
                                onClick={() => agregarPractica(p)}
                                className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors text-sm"
                            >
                                <span className="font-mono text-xs text-gray-500 mr-2">{p.codigo}</span>
                                {p.descripcion}
                            </button>
                        ))}
                    </div>
                )}
                {practicas.length > 0 ? (
                    <div className="space-y-2">
                        <div className="divide-y border rounded-md">
                            {practicas.map((p) => (
                                <div key={p._key} className="px-3 py-3 space-y-3">
                                    <div className="flex items-center gap-3">
                                        <span className="font-mono text-xs text-gray-500 w-20 shrink-0">{p.codigo}</span>
                                        <span className="flex-1 text-sm text-gray-800">{p.descripcion}</span>
                                        {permiteNumeroAutorizacionManual && (
                                            <input
                                                type="text"
                                                value={p.numeroAutorizacion}
                                                onChange={(e) => {
                                                    const value = e.target.value.slice(0, 50)
                                                    setPracticas((prev) =>
                                                        prev.map((x) =>
                                                            x._key === p._key
                                                                ? {
                                                                    ...x,
                                                                    numeroAutorizacion: value,
                                                                }
                                                                : x
                                                        )
                                                    )
                                                }}
                                                className="w-36 rounded border border-gray-300 px-2 py-1 text-xs"
                                                placeholder="N° Autorización"
                                            />
                                        )}
                                        {p.requiereMatriculaEspecialista && (
                                            <input
                                                type="number"
                                                min={1}
                                                value={p.matriculaEspecialista ?? ''}
                                                onChange={(e) => {
                                                    const value = e.target.value.trim()
                                                    setPracticas((prev) =>
                                                        prev.map((x) =>
                                                            x._key === p._key
                                                                ? {
                                                                    ...x,
                                                                    matriculaEspecialista: value ? Number.parseInt(value, 10) || null : null,
                                                                }
                                                                : x
                                                        )
                                                    )
                                                }}
                                                className="w-24 rounded border border-gray-300 px-2 py-1 text-xs"
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
                                                    setPracticas((prev) =>
                                                        prev.map((x) =>
                                                            x._key === p._key
                                                                ? {
                                                                    ...x,
                                                                    matriculaAnestesista: value ? Number.parseInt(value, 10) || null : null,
                                                                }
                                                                : x
                                                        )
                                                    )
                                                }}
                                                className="w-24 rounded border border-gray-300 px-2 py-1 text-xs"
                                                placeholder="Mat. HA"
                                            />
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => quitarPractica(p._key)}
                                            className="text-red-400 hover:text-red-600"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                    <ComponenteSelector
                                        valores={p.desglose}
                                        seleccion={p.seleccionComponentes}
                                        onChange={(nuevaSeleccion) => {
                                            setPracticas((prev) =>
                                                prev.map((x) =>
                                                    x._key === p._key
                                                        ? { ...x, seleccionComponentes: nuevaSeleccion }
                                                        : x
                                                )
                                            )
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <p className="text-xs text-gray-400">No se han agregado prácticas.</p>
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
                        disabled={isPending}
                    >
                        Guardar
                    </button>
                </div>
            </div>
        </form>
    )
}
