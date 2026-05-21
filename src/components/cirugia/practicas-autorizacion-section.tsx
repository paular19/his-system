'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import { actualizarNumerosAutorizacionAction } from '@/modules/cirugia/actions'
import { generarCodigoBarras } from '@/modules/orden/types'

interface Practica {
    id: number
    codigo: string
    descripcion: string
    cantidad: number
    numeroAutorizacion: string | null
    ordenesAutorizacion?: Array<{
        puestoNumero: number
        ordenNumero: number
        item: number
        modulo: string | null
        numeroAutorizacion: string | null
    }>
}

interface PracticasAutorizacionSectionProps {
    cirugiaId: number
    internacionId?: number | null
    practicas: Practica[]
    onActualizar?: () => void
}

type EntradaAutorizacion = {
    uid: string
    codigo: string
    descripcion: string
    cantidad: number
    etiqueta: string
    numeroAutorizacion: string | null
    actualizacion:
    | { practicaId: number; numeroAutorizacion: string }
    | { puestoNumero: number; ordenNumero: number; item: number; numeroAutorizacion: string }
}

function formatearModulo(modulo: string | null | undefined): string {
    const normalized = modulo?.trim().toUpperCase()
    if (!normalized) return 'BASE'
    return normalized
}

function normalizarNumeroAutorizacion(value: string | null | undefined): string | null {
    const normalized = value?.trim() ?? ''
    return normalized.length > 0 ? normalized : null
}

function obtenerNumeroConfirmado(entrada: EntradaAutorizacion): string | null {
    const numero = normalizarNumeroAutorizacion(entrada.numeroAutorizacion)
    if (!numero) return null

    if ('practicaId' in entrada.actualizacion) {
        return numero
    }

    const generado = generarCodigoBarras(
        entrada.actualizacion.puestoNumero,
        entrada.actualizacion.ordenNumero,
        entrada.actualizacion.item
    )

    if (numero === generado) return null
    return numero
}

export function PracticasAutorizacionSection({
    cirugiaId,
    practicas,
    onActualizar,
}: PracticasAutorizacionSectionProps) {
    const entradas = useMemo<EntradaAutorizacion[]>(() => {
        const resultado = new Map<string, EntradaAutorizacion>()

        const guardarEntrada = (entrada: EntradaAutorizacion) => {
            const existente = resultado.get(entrada.uid)
            if (!existente) {
                resultado.set(entrada.uid, entrada)
                return
            }

            const numeroExistente = normalizarNumeroAutorizacion(existente.numeroAutorizacion)
            const numeroNuevo = normalizarNumeroAutorizacion(entrada.numeroAutorizacion)
            if (!numeroExistente && numeroNuevo) {
                resultado.set(entrada.uid, {
                    ...existente,
                    numeroAutorizacion: numeroNuevo,
                })
            }
        }

        for (const practica of practicas) {
            if (Array.isArray(practica.ordenesAutorizacion) && practica.ordenesAutorizacion.length > 0) {
                for (const orden of practica.ordenesAutorizacion) {
                    guardarEntrada({
                        uid: `ORD-${orden.puestoNumero}-${orden.ordenNumero}-${orden.item}`,
                        codigo: practica.codigo,
                        descripcion: practica.descripcion,
                        cantidad: practica.cantidad,
                        etiqueta: `Orden ${orden.puestoNumero}-${orden.ordenNumero}-${orden.item} · ${formatearModulo(orden.modulo)}`,
                        numeroAutorizacion: orden.numeroAutorizacion,
                        actualizacion: {
                            puestoNumero: orden.puestoNumero,
                            ordenNumero: orden.ordenNumero,
                            item: orden.item,
                            numeroAutorizacion: '',
                        },
                    })
                }
                continue
            }

            guardarEntrada({
                uid: `PRA-${practica.id}`,
                codigo: practica.codigo,
                descripcion: practica.descripcion,
                cantidad: practica.cantidad,
                etiqueta: 'Práctica base',
                numeroAutorizacion: practica.numeroAutorizacion,
                actualizacion: {
                    practicaId: practica.id,
                    numeroAutorizacion: '',
                },
            })
        }

        return Array.from(resultado.values())
    }, [practicas])

    const entradasConEstado = useMemo(
        () =>
            entradas.map((entrada) => ({
                ...entrada,
                numeroConfirmado: obtenerNumeroConfirmado(entrada),
            })),
        [entradas]
    )

    const [numeros, setNumeros] = useState<Record<string, string>>(
        entradasConEstado.reduce(
            (acc, p) => ({
                ...acc,
                [p.uid]: p.numeroConfirmado || '',
            }),
            {}
        )
    )
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [exito, setExito] = useState(false)

    useEffect(() => {
        setNumeros((prev) => {
            const next: Record<string, string> = {}
            for (const entrada of entradasConEstado) {
                next[entrada.uid] = prev[entrada.uid] ?? entrada.numeroConfirmado ?? ''
            }
            return next
        })
    }, [entradasConEstado])

    const pendientes = entradasConEstado.filter((p) => !p.numeroConfirmado)
    const autorizadas = entradasConEstado.filter((p) => p.numeroConfirmado)

    const construirActualizaciones = () =>
        entradas
            .map((entrada) => {
                const numero = (numeros[entrada.uid] ?? '').trim()
                if (!numero) return null
                return {
                    ...entrada.actualizacion,
                    numeroAutorizacion: numero,
                }
            })
            .filter((x): x is NonNullable<typeof x> => x != null)

    const handleActualizar = async () => {
        try {
            setError(null)
            setExito(false)
            setGuardando(true)

            const actualizaciones = construirActualizaciones()

            if (actualizaciones.length === 0) {
                setError('Debe ingresar al menos un número de autorización')
                return
            }

            await actualizarNumerosAutorizacionAction(cirugiaId, actualizaciones)
            setExito(true)
            onActualizar?.()

            setTimeout(() => setExito(false), 3000)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al actualizar autorizaciones')
        } finally {
            setGuardando(false)
        }
    }

    return (
        <div className="space-y-4">
            {error && (
                <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {exito && (
                <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700">
                    Números de autorización actualizados correctamente
                </div>
            )}

            {pendientes.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <h4 className="font-semibold text-sm text-amber-900 mb-3 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        Pendientes de autorización
                    </h4>
                    <div className="divide-y">
                        {pendientes.map((p) => (
                            <div key={p.uid} className="py-3 first:pt-0 last:pb-0">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                                    <div>
                                        <p className="text-xs text-gray-500 font-mono mb-1">{p.codigo}</p>
                                        <p className="text-sm font-medium text-gray-800">{p.descripcion}</p>
                                        <p className="text-xs text-gray-600 mt-1">Cantidad: {p.cantidad}</p>
                                        <p className="text-xs text-gray-500 mt-1">{p.etiqueta}</p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">
                                            N° de autorización
                                        </label>
                                        <input
                                            type="text"
                                            value={numeros[p.uid] ?? ''}
                                            onChange={(e) =>
                                                setNumeros((prev) => ({
                                                    ...prev,
                                                    [p.uid]: e.target.value,
                                                }))
                                            }
                                            placeholder="Ej: AUTH-2026-123456"
                                            className="w-full rounded-md border border-amber-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={() => void handleActualizar()}
                        disabled={guardando}
                        className="mt-4 w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-md px-3 py-2 text-sm font-medium transition-colors"
                    >
                        {guardando ? 'Guardando...' : 'Guardar autorizaciones'}
                    </button>
                </div>
            )}

            {autorizadas.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h4 className="font-semibold text-sm text-green-900 mb-3 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        Ya autorizadas
                    </h4>
                    <div className="space-y-2">
                        {autorizadas.map((p) => (
                            <div key={p.uid} className="flex items-start justify-between text-sm">
                                <div>
                                    <p className="font-mono text-xs text-gray-500">{p.codigo}</p>
                                    <p className="text-gray-800">{p.descripcion}</p>
                                    <p className="text-xs text-gray-500 mt-1">{p.etiqueta}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-mono font-medium text-green-700">{p.numeroConfirmado}</p>
                                    <p className="text-xs text-gray-600">Cantidad: {p.cantidad}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
