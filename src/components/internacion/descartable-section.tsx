'use client'

import { useEffect, useState } from 'react'
import { Plus, Package } from 'lucide-react'
import type { DescartableItem } from '@/modules/internacion/types'
import { nombreProfesionalParaMostrar } from '@/lib/profesionales'

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
    puedeCrear,
}: DescartableSectionProps) {
    const [descartables, setDescartables] = useState(descartablesIniciales)
    const [mostrarFormulario, setMostrarFormulario] = useState(false)
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [nombre, setNombre] = useState('')
    const [opcionesInsumosUti, setOpcionesInsumosUti] = useState<Array<{ id: number; nombre: string }>>([])
    const [cargandoInsumosUti, setCargandoInsumosUti] = useState(false)

    useEffect(() => {
        let activo = true

        const cargarInsumos = async () => {
            setCargandoInsumosUti(true)
            try {
                const res = await fetch('/api/catalogos/insumos-uti?limit=5000')
                const json = await res.json()
                if (!activo) return
                setOpcionesInsumosUti(Array.isArray(json.data) ? json.data : [])
            } catch {
                if (activo) setOpcionesInsumosUti([])
            } finally {
                if (activo) setCargandoInsumosUti(false)
            }
        }

        void cargarInsumos()
        return () => {
            activo = false
        }
    }, [])

    const limpiar = () => {
        setNombre('')
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
                    cantidad: 1,
                    observaciones: null,
                    profesionalId: null,
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
                        <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                Insumo <span className="text-red-500">*</span>
                            </label>
                            <select
                                required
                                value={nombre}
                                onChange={(e) => setNombre(e.target.value)}
                                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                            >
                                <option value="">-- Seleccionar de lista unificada --</option>
                                {opcionesInsumosUti.map((item) => (
                                    <option key={item.id} value={item.nombre}>{item.nombre}</option>
                                ))}
                            </select>
                            {cargandoInsumosUti && (
                                <p className="mt-1 text-xs text-gray-400">Cargando listado...</p>
                            )}
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
                    {item.profesional && <span>{nombreProfesionalParaMostrar(item.profesional.nombre)}</span>}
                    <span>{new Date(item.fechaInicio).toLocaleDateString('es-AR')}</span>
                </div>
                {item.observaciones && <p className="text-xs text-gray-500 mt-1 italic">{item.observaciones}</p>}
            </div>
        </div>
    )
}
