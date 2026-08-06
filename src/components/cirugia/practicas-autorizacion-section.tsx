'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, AlertCircle, Loader2, ChevronRight } from 'lucide-react'
import { actualizarNumerosAutorizacionAction } from '@/modules/cirugia/actions'
import { formatearNumeroOrden, generarCodigoBarras } from '@/modules/orden/types'

const TIMEOUT_ELIMINAR_PRACTICA_MS = 45000

interface Practica {
    id: number
    codigo: string
    descripcion: string
    cantidad: number
    numeroAutorizacion: string | null
    matriculaEspecialista?: number | null
    matriculaAnestesista?: number | null
    ordenesAutorizacion?: Array<{
        puestoNumero: number
        ordenNumero: number
        item: number
        modulo: string | null
        numeroAutorizacion: string | null
        matriculaFirmante?: number | null
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
    matriculaFirmante: number | null
    actualizacion:
    | { practicaId: number; numeroAutorizacion: string }
    | { puestoNumero: number; ordenNumero: number; item: number; numeroAutorizacion: string }
}

type GrupoAutorizado = {
    key: string
    tipo: 'orden' | 'autorizacion'
    puestoNumero: number | null
    ordenNumero: number | null
    numeroAutorizacion: string | null
    totalCantidad: number
    matriculasFirmantes: number[]
    items: Array<EntradaAutorizacion & { numeroConfirmado: string | null }>
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
    const recargarPaginaCompleta = () => {
        if (typeof window !== 'undefined') {
            window.location.reload()
        }
    }

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
                        matriculaFirmante:
                            typeof orden.matriculaFirmante === 'number' && orden.matriculaFirmante > 0
                                ? orden.matriculaFirmante
                                : null,
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
                matriculaFirmante:
                    (typeof practica.matriculaEspecialista === 'number' && practica.matriculaEspecialista > 0)
                        ? practica.matriculaEspecialista
                        : (typeof practica.matriculaAnestesista === 'number' && practica.matriculaAnestesista > 0)
                            ? practica.matriculaAnestesista
                            : null,
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
    const [eliminandoPracticas, setEliminandoPracticas] = useState(false)
    const [eliminadas, setEliminadas] = useState<Set<string>>(new Set())
    const [pendientesSeleccionadas, setPendientesSeleccionadas] = useState<string[]>([])
    const [confirmarEliminacionSeleccionadas, setConfirmarEliminacionSeleccionadas] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [exito, setExito] = useState(false)
    const [gruposAutorizadosAbiertos, setGruposAutorizadosAbiertos] = useState<Record<string, boolean>>({})
    const [autorizadasExpandidas, setAutorizadasExpandidas] = useState<Record<string, boolean>>({})

    useEffect(() => {
        setNumeros((prev) => {
            const next: Record<string, string> = {}
            for (const entrada of entradasConEstado) {
                next[entrada.uid] = prev[entrada.uid] ?? entrada.numeroConfirmado ?? ''
            }
            return next
        })
    }, [entradasConEstado])

    const entradasVisibles = entradasConEstado.filter((p) => !eliminadas.has(p.uid))
    const pendientes = entradasVisibles.filter((p) => !p.numeroConfirmado)
    const autorizadas = entradasVisibles.filter((p) => p.numeroConfirmado)
    const gruposAutorizados = useMemo<GrupoAutorizado[]>(() => {
        const grupos = new Map<string, GrupoAutorizado>()

        for (const entrada of autorizadas) {
            const numeroConfirmado = entrada.numeroConfirmado
            const baseOrden = 'puestoNumero' in entrada.actualizacion && 'ordenNumero' in entrada.actualizacion
                ? {
                    tipo: 'orden' as const,
                    key: `ORD-${entrada.actualizacion.puestoNumero}-${entrada.actualizacion.ordenNumero}`,
                    puestoNumero: entrada.actualizacion.puestoNumero,
                    ordenNumero: entrada.actualizacion.ordenNumero,
                }
                : {
                    tipo: 'autorizacion' as const,
                    key: `AUT-${entrada.uid}`,
                    puestoNumero: null,
                    ordenNumero: null,
                }

            const existente = grupos.get(baseOrden.key)
            if (!existente) {
                grupos.set(baseOrden.key, {
                    key: baseOrden.key,
                    tipo: baseOrden.tipo,
                    puestoNumero: baseOrden.puestoNumero,
                    ordenNumero: baseOrden.ordenNumero,
                    numeroAutorizacion: numeroConfirmado,
                    totalCantidad: entrada.cantidad,
                    matriculasFirmantes:
                        typeof entrada.matriculaFirmante === 'number' && entrada.matriculaFirmante > 0
                            ? [entrada.matriculaFirmante]
                            : [],
                    items: [entrada],
                })
                continue
            }

            existente.totalCantidad += entrada.cantidad
            existente.items.push(entrada)
            if (!existente.numeroAutorizacion && numeroConfirmado) {
                existente.numeroAutorizacion = numeroConfirmado
            }
            if (
                typeof entrada.matriculaFirmante === 'number' &&
                entrada.matriculaFirmante > 0 &&
                !existente.matriculasFirmantes.includes(entrada.matriculaFirmante)
            ) {
                existente.matriculasFirmantes.push(entrada.matriculaFirmante)
            }
        }

        return Array.from(grupos.values())
            .map((grupo) => ({
                ...grupo,
                matriculasFirmantes: [...grupo.matriculasFirmantes].sort((a, b) => a - b),
                items: [...grupo.items].sort((a, b) => a.codigo.localeCompare(b.codigo)),
            }))
            .sort((a, b) => {
                if (a.tipo !== b.tipo) return a.tipo === 'orden' ? -1 : 1
                if (a.puestoNumero !== b.puestoNumero) return (b.puestoNumero ?? 0) - (a.puestoNumero ?? 0)
                if (a.ordenNumero !== b.ordenNumero) return (b.ordenNumero ?? 0) - (a.ordenNumero ?? 0)
                return a.key.localeCompare(b.key)
            })
    }, [autorizadas])
    const pendientesEliminables = pendientes.filter((p) => 'practicaId' in p.actualizacion)
    const idsPendientesEliminables = pendientesEliminables.map((p) => p.uid)
    const firmaPendientesEliminables = idsPendientesEliminables.join('|')
    const seleccionadasEliminables = pendientesEliminables.filter((p) => pendientesSeleccionadas.includes(p.uid))
    const todasEliminablesSeleccionadas =
        idsPendientesEliminables.length > 0 && idsPendientesEliminables.every((id) => pendientesSeleccionadas.includes(id))

    useEffect(() => {
        setPendientesSeleccionadas((prev) => prev.filter((uid) => idsPendientesEliminables.includes(uid)))
    }, [firmaPendientesEliminables])

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

    const alternarSeleccionPendiente = (uid: string, checked: boolean) => {
        setPendientesSeleccionadas((prev) => {
            if (checked) {
                if (prev.includes(uid)) return prev
                return [...prev, uid]
            }
            return prev.filter((id) => id !== uid)
        })
    }

    const alternarSeleccionTodasEliminables = (checked: boolean) => {
        if (!checked) {
            setPendientesSeleccionadas((prev) => prev.filter((id) => !idsPendientesEliminables.includes(id)))
            return
        }

        setPendientesSeleccionadas((prev) => {
            const next = new Set(prev)
            for (const uid of idsPendientesEliminables) {
                next.add(uid)
            }
            return Array.from(next)
        })
    }

    const handleEliminarSeleccionadas = async () => {
        const seleccionActual = [...pendientesSeleccionadas]
        if (seleccionActual.length === 0) return

        const entradasSeleccionadas = pendientesEliminables.filter((p) => seleccionActual.includes(p.uid))
        if (entradasSeleccionadas.length === 0) {
            setError('Seleccione prácticas base para eliminar')
            return
        }

        try {
            setError(null)
            setEliminandoPracticas(true)

            const resultados = await Promise.all(
                entradasSeleccionadas.map(async (entrada) => {
                    if (!('practicaId' in entrada.actualizacion)) {
                        return {
                            uid: entrada.uid,
                            ok: false as const,
                            error: 'Solo se pueden eliminar prácticas base sin orden asociada',
                        }
                    }

                    let timeoutId: ReturnType<typeof setTimeout> | null = null
                    try {
                        const controller = new AbortController()
                        timeoutId = setTimeout(() => controller.abort(), TIMEOUT_ELIMINAR_PRACTICA_MS)
                        const res = await fetch(`/api/cirugia/${cirugiaId}/practicas/${entrada.actualizacion.practicaId}`, {
                            method: 'DELETE',
                            signal: controller.signal,
                            cache: 'no-store',
                        })
                        const json = await res.json().catch(() => null)
                        if (res.status === 404) {
                            // Si ya no existe en backend (por carrera o estado previo), tratamos como eliminada.
                            return { uid: entrada.uid, ok: true as const }
                        }
                        if (!res.ok) {
                            return {
                                uid: entrada.uid,
                                ok: false as const,
                                error: json?.error ?? 'No se pudo eliminar la práctica',
                            }
                        }

                        return { uid: entrada.uid, ok: true as const }
                    } catch (err) {
                        return {
                            uid: entrada.uid,
                            ok: false as const,
                            error:
                                err instanceof DOMException && err.name === 'AbortError'
                                    ? 'Tiempo de espera agotado al eliminar la práctica'
                                    : 'Error de conexión al eliminar la práctica',
                        }
                    } finally {
                        if (timeoutId) clearTimeout(timeoutId)
                    }
                })
            )

            const exitosas = resultados.filter((r) => r.ok).map((r) => r.uid)
            const fallidas = resultados.filter((r) => !r.ok)

            if (fallidas.length > 0) {
                const errorPrincipal = fallidas[0]?.error ?? 'No se pudieron eliminar algunas prácticas'
                setError(
                    exitosas.length > 0
                        ? `Se eliminaron ${exitosas.length} prácticas y ${fallidas.length} fallaron. ${errorPrincipal}`
                        : errorPrincipal
                )
            }

            if (exitosas.length > 0) {
                setEliminadas((prev) => {
                    const next = new Set(prev)
                    for (const uid of exitosas) {
                        next.add(uid)
                    }
                    return next
                })
                setPendientesSeleccionadas((prev) => prev.filter((uid) => !exitosas.includes(uid)))
                onActualizar?.()
                recargarPaginaCompleta()
            }

            if (fallidas.length === 0) {
                setConfirmarEliminacionSeleccionadas(false)
            }
        } finally {
            setEliminandoPracticas(false)
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
                    {pendientesEliminables.length > 0 && (
                        <div className="mb-3 rounded-md border border-amber-300 bg-white/70 p-3 text-xs flex flex-wrap items-center gap-3">
                            <label className="inline-flex items-center gap-2 text-amber-900">
                                <input
                                    type="checkbox"
                                    checked={todasEliminablesSeleccionadas}
                                    onChange={(e) => alternarSeleccionTodasEliminables(e.target.checked)}
                                    disabled={eliminandoPracticas}
                                    className="h-4 w-4 rounded border-amber-300 text-amber-700 focus:ring-amber-500"
                                />
                                Seleccionar todas las prácticas base
                            </label>
                            <button
                                type="button"
                                onClick={() => {
                                    if (pendientesSeleccionadas.length === 0) return
                                    setError(null)
                                    setConfirmarEliminacionSeleccionadas(true)
                                }}
                                disabled={eliminandoPracticas || pendientesSeleccionadas.length === 0}
                                className="inline-flex items-center rounded-md border border-red-200 bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                            >
                                Eliminar seleccionadas ({pendientesSeleccionadas.length})
                            </button>
                        </div>
                    )}
                    {confirmarEliminacionSeleccionadas && pendientesSeleccionadas.length > 0 && (
                        <div className="mb-3 rounded-md border border-amber-300 bg-white/70 p-3 text-xs">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-start gap-2 text-amber-900">
                                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-sm font-semibold">
                                            ¿Eliminar {pendientesSeleccionadas.length} práctica(s) no autorizada(s)?
                                        </p>
                                        {seleccionadasEliminables.slice(0, 3).map((p) => (
                                            <p key={p.uid} className="text-xs text-amber-800">
                                                {p.codigo} · {p.descripcion}
                                            </p>
                                        ))}
                                        {pendientesSeleccionadas.length > 3 && (
                                            <p className="text-xs text-amber-800">... y {pendientesSeleccionadas.length - 3} más</p>
                                        )}
                                        <p className="text-xs text-amber-700 mt-1">Esta acción no se puede deshacer.</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setConfirmarEliminacionSeleccionadas(false)}
                                        disabled={eliminandoPracticas}
                                        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void handleEliminarSeleccionadas()}
                                        disabled={eliminandoPracticas}
                                        className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                    >
                                        {eliminandoPracticas && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                        {eliminandoPracticas ? 'Eliminando...' : 'Eliminar'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
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
                                        <div className="flex items-end gap-2">
                                            {'practicaId' in p.actualizacion && (
                                                <input
                                                    type="checkbox"
                                                    checked={pendientesSeleccionadas.includes(p.uid)}
                                                    onChange={(e) => alternarSeleccionPendiente(p.uid, e.target.checked)}
                                                    disabled={eliminandoPracticas}
                                                    className="mb-2 h-4 w-4 rounded border-amber-300 text-amber-700 focus:ring-amber-500"
                                                    title="Seleccionar práctica para eliminar"
                                                />
                                            )}
                                            <div className="min-w-0 flex-1">
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
                        {gruposAutorizados.map((grupo) => {
                            const limiteItems = 3
                            const abierta = gruposAutorizadosAbiertos[grupo.key] ?? false
                            const expandida = autorizadasExpandidas[grupo.key] ?? false
                            const itemsVisibles = expandida ? grupo.items : grupo.items.slice(0, limiteItems)
                            const restantes = Math.max(0, grupo.items.length - itemsVisibles.length)
                            const codigosConCantidad = Array.from(
                                grupo.items.reduce((mapa, item) => {
                                    const codigo = item.codigo.trim()
                                    if (!codigo) return mapa

                                    const cantidad = Number.isFinite(Number(item.cantidad)) && Number(item.cantidad) > 0
                                        ? Number(item.cantidad)
                                        : 1
                                    mapa.set(codigo, (mapa.get(codigo) ?? 0) + cantidad)
                                    return mapa
                                }, new Map<string, number>())
                            ).map(([codigo, cantidad]) => `${codigo} x${cantidad}`)
                            const codigosResumen = codigosConCantidad.slice(0, 4).join(', ')
                            const codigosRestantes = Math.max(0, codigosConCantidad.length - 4)
                            const destino =
                                grupo.tipo === 'orden' && grupo.puestoNumero && grupo.ordenNumero
                                    ? `/dashboard/ambulatorio/${grupo.puestoNumero}/${grupo.ordenNumero}`
                                    : grupo.numeroAutorizacion
                                        ? `/dashboard/ambulatorio?tab=confirmadas&q=${encodeURIComponent(grupo.numeroAutorizacion)}`
                                        : null

                            return (
                                <div key={grupo.key} className="rounded-lg border border-green-200 bg-green-50/40 p-2 text-xs">
                                    <button
                                        type="button"
                                        onClick={() => setGruposAutorizadosAbiertos((prev) => ({
                                            ...prev,
                                            [grupo.key]: !(prev[grupo.key] ?? false),
                                        }))}
                                        className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-0 text-left hover:bg-green-100/40"
                                    >
                                        <span className="flex min-w-0 items-center gap-2 text-green-900">
                                            <ChevronRight className={`h-4 w-4 transition-transform ${abierta ? 'rotate-90' : ''}`} />
                                            <span className="shrink-0 font-semibold">
                                                {grupo.tipo === 'orden' && grupo.puestoNumero && grupo.ordenNumero
                                                    ? `Orden ${formatearNumeroOrden(grupo.puestoNumero, grupo.ordenNumero)}`
                                                    : 'Autorización manual'}
                                            </span>
                                            <span className="min-w-0 truncate text-[10px] text-green-700">
                                                Cod/Cant: {codigosResumen}{codigosRestantes > 0 ? ` +${codigosRestantes}` : ''}
                                            </span>
                                        </span>
                                        <span className="text-[11px] text-green-700">{grupo.items.length} práctica(s)</span>
                                    </button>

                                    {abierta && (
                                        <div className="mt-1.5 grid grid-cols-1 gap-2 md:grid-cols-2">
                                            <div className="space-y-1.5 text-green-900">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {destino && (
                                                        <Link
                                                            href={destino}
                                                            className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-900 hover:bg-green-200"
                                                        >
                                                            Abrir
                                                        </Link>
                                                    )}
                                                </div>
                                                <p className="text-green-800">N° autorización: {grupo.numeroAutorizacion ?? '-'}</p>
                                                <p className="text-green-800">Cantidad total: {grupo.totalCantidad}</p>
                                                <p className="text-green-800">
                                                    {grupo.matriculasFirmantes.length > 1
                                                        ? 'Matrículas firmantes'
                                                        : 'Matrícula firmante'}: {grupo.matriculasFirmantes.length > 0 ? grupo.matriculasFirmantes.join(', ') : 'No informada'}
                                                </p>
                                            </div>

                                            <div className="rounded-md border border-green-200 bg-white/70 p-1.5">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-green-700">
                                                        Prácticas de la orden ({grupo.items.length})
                                                    </p>
                                                    {grupo.items.length > limiteItems && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setAutorizadasExpandidas((prev) => ({
                                                                ...prev,
                                                                [grupo.key]: !(prev[grupo.key] ?? false),
                                                            }))}
                                                            className="rounded border border-green-300 px-2 py-0.5 text-[11px] font-medium text-green-800 hover:bg-green-50"
                                                        >
                                                            {expandida ? 'Contraer' : 'Expandir'}
                                                        </button>
                                                    )}
                                                </div>

                                                <div className="mt-1.5 space-y-1">
                                                    {itemsVisibles.map((item) => (
                                                        <div key={item.uid} className="rounded border border-green-100 bg-white px-2 py-1">
                                                            <div className="flex items-center justify-between gap-2 text-green-900">
                                                                <span className="font-mono text-[11px]">{item.codigo}</span>
                                                                <span className="font-medium">Cant. {item.cantidad}</span>
                                                            </div>
                                                            <p className="text-green-900">{item.descripcion}</p>
                                                            <p className="text-[11px] text-gray-500 mt-0.5">{item.etiqueta}</p>
                                                        </div>
                                                    ))}
                                                </div>

                                                {!expandida && restantes > 0 && (
                                                    <p className="mt-1 text-[11px] text-green-700">+{restantes} práctica(s) más</p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}
