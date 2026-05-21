'use client'

import { useEffect, useState, useTransition } from 'react'
import { Save, X, Loader2, Search } from 'lucide-react'
import { updateIngresoAction } from '@/modules/admision/actions'
import type { IngresoDetalle } from '@/modules/admision/types'
import {
    ComponenteSelector,
    calcularTotalSeleccionado,
    seleccionPorDefecto,
    type ComponenteSeleccion,
    type ComponenteValores,
} from '@/components/ui/componente-selector'

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

export function PracticaIngresoForm({ ingreso, onSuccess, onCancel }: PracticaIngresoFormProps) {
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)
    const [buscandoPractica, setBuscandoPractica] = useState(false)
    const [busquedaTermino, setBusquedaTermino] = useState('')
    const [resultados, setResultados] = useState<PracticaBusquedaItem[]>([])
    const [practicaSeleccionada, setPracticaSeleccionada] = useState<PracticaBusquedaItem | null>(null)
    const [seleccionComponentes, setSeleccionComponentes] = useState<ComponenteSeleccion>({
        especialista: 0,
        ayudante: 0,
        anestesista: 0,
        gastos: 0,
    })

    // Remove formData.cantidad and switch to a list of practices like surgery
    const [practicas, setPracticas] = useState<any[]>([])

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

    const cancelarSeleccion = () => {
        // No-op: legacy, can be removed
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
                await updateIngresoAction(ingreso.id, {
                    practicasAgregar: practicas.map((p) => ({
                        convenioId: p.convenioId,
                        codigo: p.codigo.trim(),
                        descripcion: p.descripcion,
                        cantidad: 1,
                        matriculaEspecialista: p.matriculaEspecialista,
                        matriculaAnestesista: p.matriculaAnestesista,
                        importeTotal: Number((calcularTotalSeleccionado(p.desglose, p.seleccionComponentes) * 1).toFixed(2)),
                    })),
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
