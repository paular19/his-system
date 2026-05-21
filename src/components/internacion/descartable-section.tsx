'use client'

import { useRef, useState } from 'react'
import { Plus, Package } from 'lucide-react'
import type { DescartableItem } from '@/modules/internacion/types'

interface DescartableSectionProps {
    ingresoId: number
    descartables: DescartableItem[]
    profesionales: Array<{ id: number; nombre: string }>
    puedeCrear: boolean
    puedeModificar: boolean
}

export function DescartableSection({
    ingresoId,
    descartables: descartablesIniciales,
    profesionales,
    puedeCrear,
    puedeModificar,
}: DescartableSectionProps) {
    const [descartables, setDescartables] = useState(descartablesIniciales)
    const [mostrarFormulario, setMostrarFormulario] = useState(false)
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [nombre, setNombre] = useState('')
    const [cantidad, setCantidad] = useState('1')
    const [observaciones, setObservaciones] = useState('')
    const [profesionalId, setProfesionalId] = useState('')

    const [buscandoCatalogo, setBuscandoCatalogo] = useState(false)
    const [sugerencias, setSugerencias] = useState<Array<{ id: number; nombre: string }>>([])
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const buscarCatalogo = (value: string) => {
        setNombre(value)
        if (debounceRef.current) clearTimeout(debounceRef.current)

        const query = value.trim()
        if (query.length < 2) {
            setSugerencias([])
            return
        }

        debounceRef.current = setTimeout(async () => {
            setBuscandoCatalogo(true)
            try {
                const res = await fetch(`/api/catalogos/descartables-uti?q=${encodeURIComponent(query)}&limit=12`)
                const json = await res.json()
                setSugerencias(Array.isArray(json.data) ? json.data : [])
            } catch {
                setSugerencias([])
            } finally {
                setBuscandoCatalogo(false)
            }
        }, 300)
    }

    const limpiar = () => {
        setNombre('')
        setCantidad('1')
        setObservaciones('')
        setProfesionalId('')
        setSugerencias([])
        setMostrarFormulario(false)
        setError(null)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setGuardando(true)
        setError(null)

        try {
            const res = await fetch(`/api/internacion/${ingresoId}/descartables`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nombre: nombre.trim(),
                    cantidad: Math.max(1, Number.parseInt(cantidad, 10) || 1),
                    observaciones: observaciones || null,
                    profesionalId: profesionalId ? Number.parseInt(profesionalId, 10) : null,
                }),
            })

            if (!res.ok) {
                const d = await res.json()
                throw new Error(d.error ?? 'Error al guardar descartable')
            }

            const { data } = await res.json()
            setDescartables([{ ...data }, ...descartables])
            limpiar()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error desconocido')
        } finally {
            setGuardando(false)
        }
    }
    const totalUnidades = descartables.reduce((sum, item) => sum + (item.cantidad || 0), 0)

    return (
        <div className="his-card">
            <div className="flex items-center justify-between p-4 border-b">
                <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-gray-500" />
                    <h3 className="text-sm font-semibold text-gray-900">Descartables</h3>
                    <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">
                        {descartables.length} registrados · {totalUnidades} unidades
                    </span>
                </div>
                {puedeCrear && (
                    <button
                        onClick={() => setMostrarFormulario(!mostrarFormulario)}
                        className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Agregar
                    </button>
                )}
            </div>

            {mostrarFormulario && (
                <form onSubmit={handleSubmit} className="p-4 border-b bg-blue-50/50 space-y-3">
                    {error && (
                        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="sm:col-span-2 relative">
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                Descartable <span className="text-red-500">*</span>
                            </label>
                            <input
                                required
                                type="text"
                                value={nombre}
                                onChange={(e) => buscarCatalogo(e.target.value)}
                                placeholder="Nombre del descartable"
                                className="w-full border rounded-lg px-3 py-2 text-sm"
                            />
                            {sugerencias.length > 0 && (
                                <div className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow-sm max-h-40 overflow-y-auto divide-y">
                                    {sugerencias.map((s) => (
                                        <button
                                            key={s.id}
                                            type="button"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => {
                                                setNombre(s.nombre)
                                                setSugerencias([])
                                            }}
                                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                                        >
                                            {s.nombre}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {buscandoCatalogo && (
                                <p className="mt-1 text-xs text-gray-400">Buscando en catálogo UTI...</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Cantidad</label>
                            <input
                                type="number"
                                min={1}
                                value={cantidad}
                                onChange={(e) => setCantidad(e.target.value)}
                                className="w-full border rounded-lg px-3 py-2 text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Profesional indicador</label>
                            <select
                                value={profesionalId}
                                onChange={(e) => setProfesionalId(e.target.value)}
                                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                            >
                                <option value="">- Sin asignar -</option>
                                {profesionales.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.nombre}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Observaciones</label>
                            <input
                                type="text"
                                value={observaciones}
                                onChange={(e) => setObservaciones(e.target.value)}
                                className="w-full border rounded-lg px-3 py-2 text-sm"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={limpiar}
                            className="px-3 py-1.5 text-xs text-gray-600 border rounded-lg hover:bg-gray-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={guardando}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60"
                        >
                            {guardando ? 'Guardando...' : 'Guardar'}
                        </button>
                    </div>
                </form>
            )}

            <div className="divide-y max-h-90 overflow-y-auto">
                {descartables.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-8">Sin descartables registrados</p>
                ) : (
                    descartables.map((item) => <DescartableRow key={item.id} item={item} />)
                )}
            </div>
        </div>
    )
}

function DescartableRow({
    item,
}: {
    item: DescartableItem
}) {
    return (
        <div className="p-4 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-900">{item.nombre}</span>
                    <span className="text-xs text-gray-500">x{item.cantidad}</span>
                </div>
                <div className="text-xs text-gray-500 flex gap-3">
                    {item.profesional && <span>Dr. {item.profesional.nombre}</span>}
                    <span>{new Date(item.fechaInicio).toLocaleDateString('es-AR')}</span>
                </div>
                {item.observaciones && <p className="text-xs text-gray-500 mt-1 italic">{item.observaciones}</p>}
            </div>
        </div>
    )
}
