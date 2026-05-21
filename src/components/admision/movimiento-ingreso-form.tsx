'use client'

import { useState, useEffect } from 'react'
import { Save, X, Loader2 } from 'lucide-react'
import type { IngresoDetalle } from '@/modules/admision/types'

interface MovimientoIngresoFormProps {
    ingreso: IngresoDetalle
    onSuccess: () => void
    onCancel: () => void
}

interface TipoMovimiento {
    codigo: string
    descripcion: string
}

export function MovimientoIngresoForm({ ingreso, onSuccess, onCancel }: MovimientoIngresoFormProps) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [tiposMovimiento, setTiposMovimiento] = useState<TipoMovimiento[]>([])
    const [loadingTipos, setLoadingTipos] = useState(true)

    const [formData, setFormData] = useState({
        tipoMovimientoCodigo: '',
        fecha: new Date().toISOString().split('T')[0],
        concepto: '',
        signo: 1,
        importe: 0,
        saldo: 0,
    })

    // Cargar tipos de movimiento al montar
    useEffect(() => {
        const fetchTipos = async () => {
            try {
                const response = await fetch('/api/admision/tipos-movimiento')
                if (response.ok) {
                    const data = await response.json()
                    setTiposMovimiento(data)
                }
            } catch (err) {
                console.error('Error cargando tipos de movimiento:', err)
            } finally {
                setLoadingTipos(false)
            }
        }
        fetchTipos()
    }, [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            const response = await fetch(`/api/admision/${ingreso.id}/movimiento`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tipoMovimientoCodigo: formData.tipoMovimientoCodigo,
                    fecha: formData.fecha ? new Date(formData.fecha) : undefined,
                    concepto: formData.concepto || null,
                    signo: formData.signo,
                    importe: parseFloat(String(formData.importe)),
                    saldo: parseFloat(String(formData.saldo)),
                }),
            })

            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(errorData.message || 'Error al guardar movimiento')
            }

            onSuccess()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al guardar')
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-gray-50 rounded-md border border-gray-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Tipo de Movimiento */}
                <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                        Tipo de Movimiento
                    </label>
                    <select
                        value={formData.tipoMovimientoCodigo}
                        onChange={(e) =>
                            setFormData((prev) => ({ ...prev, tipoMovimientoCodigo: e.target.value }))
                        }
                        disabled={loading || loadingTipos}
                        className="w-full border rounded px-3 py-2 text-sm disabled:bg-gray-100"
                        required
                    >
                        <option value="">
                            {loadingTipos ? 'Cargando...' : 'Seleccionar tipo'}
                        </option>
                        {tiposMovimiento.map((tipo) => (
                            <option key={tipo.codigo} value={tipo.codigo}>
                                {tipo.descripcion}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Fecha */}
                <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                        Fecha
                    </label>
                    <input
                        type="date"
                        value={formData.fecha}
                        onChange={(e) => setFormData((prev) => ({ ...prev, fecha: e.target.value }))}
                        disabled={loading}
                        className="w-full border rounded px-3 py-2 text-sm disabled:bg-gray-100"
                    />
                </div>

                {/* Signo */}
                <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                        Signo
                    </label>
                    <select
                        value={formData.signo}
                        onChange={(e) => setFormData((prev) => ({ ...prev, signo: parseInt(e.target.value) }))}
                        disabled={loading}
                        className="w-full border rounded px-3 py-2 text-sm disabled:bg-gray-100"
                    >
                        <option value={1}>Positivo (+)</option>
                        <option value={-1}>Negativo (-)</option>
                    </select>
                </div>

                {/* Importe */}
                <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                        Importe
                    </label>
                    <input
                        type="number"
                        step="0.01"
                        value={formData.importe}
                        onChange={(e) => setFormData((prev) => ({ ...prev, importe: parseFloat(e.target.value) }))}
                        disabled={loading}
                        className="w-full border rounded px-3 py-2 text-sm disabled:bg-gray-100"
                        required
                    />
                </div>

                {/* Saldo */}
                <div>
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                        Saldo
                    </label>
                    <input
                        type="number"
                        step="0.01"
                        value={formData.saldo}
                        onChange={(e) => setFormData((prev) => ({ ...prev, saldo: parseFloat(e.target.value) }))}
                        disabled={loading}
                        className="w-full border rounded px-3 py-2 text-sm disabled:bg-gray-100"
                        required
                    />
                </div>

                {/* Concepto */}
                <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                        Concepto (opcional)
                    </label>
                    <input
                        type="text"
                        value={formData.concepto}
                        onChange={(e) => setFormData((prev) => ({ ...prev, concepto: e.target.value }))}
                        disabled={loading}
                        className="w-full border rounded px-3 py-2 text-sm disabled:bg-gray-100"
                        placeholder="Ej: Pago inicial, ajuste, etc."
                    />
                </div>
            </div>

            {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}

            <div className="flex gap-2 justify-end pt-2">
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                    <X className="h-4 w-4" />
                    Cancelar
                </button>
                <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Guardar
                </button>
            </div>
        </form>
    )
}
