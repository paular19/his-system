'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { Ban, Check, Clock, FileText, Pencil, X } from 'lucide-react'
import { actualizarNumeroAutorizacionAction, anularOrdenAction } from '@/modules/orden/actions'
import { formatearNumeroOrden } from '@/modules/orden/types'
import type { OrdenListItem } from '@/modules/orden/types'
import { PaginationControls } from '@/components/ui/pagination-controls'

interface OrdenesTabsProps {
    pendientes: OrdenListItem[]
    confirmadas: OrdenListItem[]
    anuladas: OrdenListItem[]
    totalPendientes: number
    totalConfirmadas: number
    totalAnuladas: number
    puedeModificar: boolean
    tabActual: 'pendientes' | 'confirmadas' | 'anuladas'
    pagina: number
    porPagina: number
    totalPaginas: number
}

function FilaOrden({
    orden,
    puedeModificar,
    onConfirmada,
    onAnulada,
    mostrarAnular,
}: {
    orden: OrdenListItem
    puedeModificar: boolean
    onConfirmada?: (puestoNumero: number, numero: number) => void
    onAnulada?: (puestoNumero: number, numero: number) => void
    mostrarAnular?: boolean
}) {
    const [editando, setEditando] = useState(false)
    const [mostrarModalAnular, setMostrarModalAnular] = useState(false)
    const [nroAut, setNroAut] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()
    const inputRef = useRef<HTMLInputElement>(null)

    function iniciarEdicion() {
        setNroAut('')
        setError(null)
        setEditando(true)
        setTimeout(() => inputRef.current?.focus(), 50)
    }

    function cancelar() {
        setEditando(false)
        setError(null)
    }

    function guardar() {
        if (!nroAut.trim()) {
            setError('Ingrese el número')
            return
        }
        startTransition(async () => {
            const result = await actualizarNumeroAutorizacionAction(
                orden.puestoNumero,
                orden.numero,
                nroAut.trim()
            )
            if (result.error) {
                setError(result.error)
            } else {
                setEditando(false)
                onConfirmada?.(orden.puestoNumero, orden.numero)
            }
        })
    }

    function abrirModalAnular() {
        setError(null)
        setMostrarModalAnular(true)
    }

    function cerrarModalAnular() {
        if (isPending) return
        setMostrarModalAnular(false)
    }

    function confirmarAnulacion() {
        startTransition(async () => {
            const result = await anularOrdenAction(orden.puestoNumero, orden.numero)
            if (result.error) {
                setError(result.error)
            } else {
                setMostrarModalAnular(false)
                setEditando(false)
                onAnulada?.(orden.puestoNumero, orden.numero)
            }
        })
    }

    return (
        <>
            <tr className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-600">
                    {formatearNumeroOrden(orden.puestoNumero, orden.numero)}
                </td>
                <td className="px-4 py-3 font-medium text-gray-900">{orden.nombrePaciente}</td>
                <td className="px-4 py-3 text-gray-600">{orden.obraSocialNombre}</td>
                <td className="px-4 py-3 text-gray-600">{orden.coseguroNombre}</td>
                <td className="px-4 py-3 text-gray-500">
                    {new Date(orden.fechaEmision).toLocaleDateString('es-AR')}
                </td>
                <td className="px-4 py-3 text-center text-gray-600">{orden.cantidadItems}</td>
                <td className="px-4 py-3 min-w-55">
                    {editando ? (
                        <div className="flex items-center gap-1">
                            <input
                                ref={inputRef}
                                type="text"
                                maxLength={15}
                                value={nroAut}
                                onChange={(e) => setNroAut(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') guardar()
                                    if (e.key === 'Escape') cancelar()
                                }}
                                className="w-32 rounded border border-blue-400 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="N° Autorización"
                            />
                            <button
                                onClick={guardar}
                                disabled={isPending}
                                className="rounded bg-green-600 p-1 text-white hover:bg-green-700 disabled:opacity-50"
                                title="Confirmar"
                            >
                                <Check className="h-3 w-3" />
                            </button>
                            <button
                                onClick={cancelar}
                                disabled={isPending}
                                className="rounded bg-gray-200 p-1 text-gray-700 hover:bg-gray-300"
                                title="Cancelar"
                            >
                                <X className="h-3 w-3" />
                            </button>
                            {error && <span className="text-xs text-red-600">{error}</span>}
                        </div>
                    ) : orden.numeroAutorizacion ? (
                        <span className="font-mono text-xs text-green-700 font-semibold">
                            {orden.numeroAutorizacion}
                        </span>
                    ) : puedeModificar ? (
                        <button
                            onClick={iniciarEdicion}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 border border-blue-200"
                        >
                            <Pencil className="h-3 w-3" />
                            Ingresar N° Aut.
                        </button>
                    ) : (
                        <span className="text-xs text-gray-400 italic">Pendiente</span>
                    )}
                </td>
                <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                        {mostrarAnular && puedeModificar && (
                            <button
                                type="button"
                                onClick={abrirModalAnular}
                                disabled={isPending}
                                className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                                <Ban className="h-3 w-3" />
                                Anular
                            </button>
                        )}
                        <Link
                            href={`/dashboard/ambulatorio/${orden.puestoNumero}/${orden.numero}`}
                            className="text-blue-600 hover:underline text-xs font-medium"
                        >
                            Ver / Imprimir
                        </Link>
                    </div>
                </td>
            </tr>

            {typeof window !== 'undefined' && mostrarModalAnular
                ? createPortal(
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                        <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
                            <div className="border-b px-4 py-3">
                                <h3 className="text-sm font-semibold text-gray-900">Confirmar anulación</h3>
                            </div>
                            <div className="space-y-2 px-4 py-3 text-sm text-gray-700">
                                <p>
                                    Está por anular la autorización{' '}
                                    <span className="font-mono font-semibold text-gray-900">
                                        {formatearNumeroOrden(orden.puestoNumero, orden.numero)}
                                    </span>
                                    .
                                </p>
                                <p>Esta acción la moverá a la solapa Anuladas.</p>
                                {error && <p className="text-xs text-red-600">{error}</p>}
                            </div>
                            <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
                                <button
                                    type="button"
                                    onClick={cerrarModalAnular}
                                    disabled={isPending}
                                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={confirmarAnulacion}
                                    disabled={isPending}
                                    className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                >
                                    <Ban className="h-3 w-3" />
                                    {isPending ? 'Anulando...' : 'Anular'}
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )
                : null}
        </>
    )
}

export function OrdenesTabs({
    pendientes: pendientesIniciales,
    confirmadas,
    anuladas,
    totalPendientes,
    totalConfirmadas,
    totalAnuladas,
    puedeModificar,
    tabActual,
    pagina,
    porPagina,
    totalPaginas,
}: OrdenesTabsProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [pendientes, setPendientes] = useState(pendientesIniciales)
    const [countPendientes, setCountPendientes] = useState(totalPendientes)

    function buildTabHref(tab: 'pendientes' | 'confirmadas' | 'anuladas') {
        const params = new URLSearchParams(searchParams.toString())
        params.set('tab', tab)
        params.set('pagina', '1')
        if (!params.get('porPagina')) params.set('porPagina', String(porPagina))
        const query = params.toString()
        return query ? `?${query}` : '?'
    }

    function handleConfirmada(puestoNumero: number, numero: number) {
        setPendientes((prev) =>
            prev.filter((o) => !(o.puestoNumero === puestoNumero && o.numero === numero))
        )
        setCountPendientes((prev) => Math.max(0, prev - 1))
        router.push('?tab=confirmadas')
        router.refresh()
    }

    function handleAnulada(puestoNumero: number, numero: number) {
        setPendientes((prev) =>
            prev.filter((o) => !(o.puestoNumero === puestoNumero && o.numero === numero))
        )
        setCountPendientes((prev) => Math.max(0, prev - 1))
        router.push('?tab=anuladas')
        router.refresh()
    }

    const ordenes = tabActual === 'pendientes'
        ? pendientes
        : tabActual === 'confirmadas'
            ? confirmadas
            : anuladas
    const total = tabActual === 'pendientes'
        ? countPendientes
        : tabActual === 'confirmadas'
            ? totalConfirmadas
            : totalAnuladas

    return (
        <div className="space-y-4">
            {/* Tabs */}
            <div className="flex border-b border-gray-200">
                <Link
                    href={buildTabHref('pendientes')}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${tabActual === 'pendientes'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                >
                    <Clock className="h-4 w-4" />
                    Pendientes
                    {countPendientes > 0 && (
                        <span className="ml-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
                            {countPendientes}
                        </span>
                    )}
                </Link>
                <Link
                    href={buildTabHref('confirmadas')}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${tabActual === 'confirmadas'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                >
                    <Check className="h-4 w-4" />
                    Confirmadas
                    {totalConfirmadas > 0 && (
                        <span className="ml-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                            {totalConfirmadas}
                        </span>
                    )}
                </Link>
                <Link
                    href={buildTabHref('anuladas')}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${tabActual === 'anuladas'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                >
                    <Ban className="h-4 w-4" />
                    Anuladas
                    {totalAnuladas > 0 && (
                        <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                            {totalAnuladas}
                        </span>
                    )}
                </Link>
            </div>

            {/* Tabla */}
            {ordenes.length === 0 ? (
                <div className="his-card flex flex-col items-center justify-center py-16 text-center space-y-3">
                    <FileText className="h-10 w-10 text-gray-300" />
                    <p className="text-sm text-gray-500">
                        {tabActual === 'pendientes'
                            ? 'No hay órdenes pendientes de autorización.'
                            : tabActual === 'confirmadas'
                                ? 'No hay órdenes confirmadas.'
                                : 'No hay órdenes anuladas.'}
                    </p>
                </div>
            ) : (
                <div className="his-card overflow-hidden p-0">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b">
                            <tr>
                                <th className="px-4 py-3 text-left">N° Orden</th>
                                <th className="px-4 py-3 text-left">Paciente</th>
                                <th className="px-4 py-3 text-left">Obra Social</th>
                                <th className="px-4 py-3 text-left">Coseguro</th>
                                <th className="px-4 py-3 text-left">Fecha</th>
                                <th className="px-4 py-3 text-center">Prácticas</th>
                                <th className="px-4 py-3 text-left">N° Autorización OS</th>
                                <th className="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {ordenes.map((orden) => (
                                <FilaOrden
                                    key={`${orden.puestoNumero}-${orden.numero}`}
                                    orden={orden}
                                    puedeModificar={puedeModificar}
                                    onConfirmada={tabActual === 'pendientes' ? handleConfirmada : undefined}
                                    onAnulada={tabActual === 'pendientes' ? handleAnulada : undefined}
                                    mostrarAnular={tabActual === 'pendientes'}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="his-card p-0">
                <PaginationControls
                    currentPage={pagina}
                    totalPages={totalPaginas}
                    totalItems={total}
                    pageSize={porPagina}
                    allowedPageSizes={[10, 20, 50, 100]}
                    pageParam="pagina"
                    pageSizeParam="porPagina"
                />
            </div>

            <p className="text-xs text-gray-400 text-right">
                {total} orden{total !== 1 ? 'es' : ''} en esta solapa
            </p>
        </div>
    )
}
