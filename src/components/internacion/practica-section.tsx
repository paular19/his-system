'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Stethoscope, Search, Plus, Loader2, X, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import type { PracticaItem } from '@/modules/internacion/types'
import { formatearNumeroOrden } from '@/modules/orden/types'
import {
    ComponenteSelector,
    type ComponenteValores,
    type ComponenteSeleccion,
    calcularTotalSeleccionado,
    seleccionPorDefecto,
} from '@/components/ui/componente-selector'
import {
    esSubitemAnestesista,
    esSubitemEspecialista,
    type SubitemCodigo,
    obtenerSubitemsSeleccionados,
    valorUnitarioPorSubitem,
} from '@/lib/practicas-subitems'
import { fechaHoraAInputLocal } from '@/lib/utils/argentina-date'

interface NomencladorItem {
    convenioId: number
    codigo: string
    descripcion: string
    valor: number | null
    valorEspecialista: number | null
    valorAyudante: number | null
    valorAnestesista: number | null
    valorGastos: number | null
}

const formatoMoneda = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
})

const MATRICULA_ANESTESISTA_DEFAULT = 6
const PRACTICAS_LISTA_POR_PAGINA = 8
const TIMEOUT_ELIMINAR_PRACTICA_MS = 45000

function etiquetaSubitem(subitem: SubitemCodigo): string {
    if (subitem === 'HE') return 'Honorario Especialista (HE)'
    if (subitem === 'HA') return 'Honorario Anestesista (HA)'
    if (subitem === 'GA') return 'Derechos/Gastos (GA)'
    if (subitem === 'A1') return 'Ayudante 1 (A1)'
    if (subitem === 'A2') return 'Ayudante 2 (A2)'
    return 'Ayudante 3 (A3)'
}

function normalizarBusquedaLista(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
}

function numeroAutorizacionValida(value: string | null | undefined): boolean {
    return (value?.trim().length ?? 0) > 0
}

function practicaActiva(estado: string | null | undefined): boolean {
    return (estado?.trim().toUpperCase() ?? 'A') !== 'X'
}

interface PracticaSectionProps {
    ingresoId: number
    convenioId: number | null
    practicas: PracticaItem[]
    puedeCrear: boolean
    matriculaTratanteDefault?: number | null
    puedeGenerarAutorizacion?: boolean
    refrescarDespuesCambios?: boolean
    permitirGenerarSinPendientes?: boolean
    incluirPracticaIdsEnGenerarAutorizacion?: boolean
    forzarNavegacionCompletaGenerarAutorizacion?: boolean
}

export function PracticaSection({
    ingresoId,
    convenioId,
    practicas: practicasIniciales,
    puedeCrear,
    matriculaTratanteDefault,
    puedeGenerarAutorizacion,
    refrescarDespuesCambios = true,
    permitirGenerarSinPendientes = false,
    incluirPracticaIdsEnGenerarAutorizacion = true,
    forzarNavegacionCompletaGenerarAutorizacion = false,
}: PracticaSectionProps) {
    const router = useRouter()
    const [practicas, setPracticas] = useState<PracticaItem[]>(practicasIniciales)
    const [mostrarForm, setMostrarForm] = useState(false)
    const [expandido, setExpandido] = useState(true)
    const [filtroLista, setFiltroLista] = useState('')
    const [paginaPendientes, setPaginaPendientes] = useState(1)
    const [paginaAutorizadas, setPaginaAutorizadas] = useState(1)

    // Búsqueda nomenclador
    const [busqueda, setBusqueda] = useState('')
    const [resultados, setResultados] = useState<NomencladorItem[]>([])
    const [buscando, setBuscando] = useState(false)
    const [practicaSeleccionada, setPracticaSeleccionada] = useState<NomencladorItem | null>(null)

    // Selector de componentes
    const [componenteSeleccion, setComponenteSeleccion] = useState<ComponenteSeleccion>({
        especialista: 0, ayudante: 0, anestesista: 0, gastos: 0,
    })

    // Campos del form
    const [fecha, setFecha] = useState(() => fechaHoraAInputLocal())
    const [numeroAutorizacion, setNumeroAutorizacion] = useState('')
    const [matriculaEspecialista, setMatriculaEspecialista] = useState(
        matriculaTratanteDefault ? String(matriculaTratanteDefault) : ''
    )
    const [matriculaAnestesista, setMatriculaAnestesista] = useState(
        String(MATRICULA_ANESTESISTA_DEFAULT)
    )

    const [guardando, setGuardando] = useState(false)
    const [desagrupandoPracticaId, setDesagrupandoPracticaId] = useState<number | null>(null)
    const [eliminandoPracticas, setEliminandoPracticas] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [practicasSeleccionadas, setPracticasSeleccionadas] = useState<number[]>([])
    const [confirmarEliminacionSeleccionadas, setConfirmarEliminacionSeleccionadas] = useState(false)

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const buscarPractica = (q: string) => {
        setBusqueda(q)
        setPracticaSeleccionada(null)
        if (debounceRef.current) clearTimeout(debounceRef.current)
        if (q.trim().length < 2) {
            setResultados([])
            return
        }
        debounceRef.current = setTimeout(async () => {
            setBuscando(true)
            try {
                const qs = new URLSearchParams({ q: q.trim() })
                if (convenioId) qs.set('convenioId', String(convenioId))
                const res = await fetch(`/api/practicas-nomenclador?${qs.toString()}`)
                const json = await res.json()
                setResultados(Array.isArray(json.data) ? json.data : [])
            } catch {
                setResultados([])
            } finally {
                setBuscando(false)
            }
        }, 350)
    }

    const seleccionarPractica = (p: NomencladorItem) => {
        setPracticaSeleccionada(p)
        setBusqueda(p.descripcion)
        setResultados([])
        const valores: ComponenteValores = {
            valorEspecialista: p.valorEspecialista,
            valorAyudante: p.valorAyudante,
            valorAnestesista: p.valorAnestesista,
            valorGastos: p.valorGastos,
            valorTotal: p.valor,
        }
        setComponenteSeleccion(seleccionPorDefecto(valores))
    }

    const limpiarForm = () => {
        setBusqueda('')
        setResultados([])
        setPracticaSeleccionada(null)
        setComponenteSeleccion({ especialista: 0, ayudante: 0, anestesista: 0, gastos: 0 })
        setFecha(fechaHoraAInputLocal())
        setNumeroAutorizacion('')
        setMatriculaEspecialista(matriculaTratanteDefault ? String(matriculaTratanteDefault) : '')
        setMatriculaAnestesista(String(MATRICULA_ANESTESISTA_DEFAULT))
        setError(null)
    }

    const handleGuardar = async () => {
        setError(null)
        if (!practicaSeleccionada && !busqueda.trim()) {
            return setError('Seleccioná una práctica del nomenclador o escribí un código')
        }
        if ((practicaSeleccionada?.valorEspecialista != null) && !matriculaEspecialista.trim()) {
            return setError('Ingrese matrícula para honorario especialista')
        }
        if ((practicaSeleccionada?.valorAnestesista != null) && !matriculaAnestesista.trim()) {
            return setError('Ingrese matrícula para honorario anestesista')
        }

        const requiereEspecialista = practicaSeleccionada?.valorEspecialista != null
        const requiereAnestesista = practicaSeleccionada?.valorAnestesista != null

        const body = {
            convenioId: practicaSeleccionada?.convenioId ?? convenioId ?? 0,
            codigoPractica: practicaSeleccionada?.codigo ?? busqueda.trim().slice(0, 8).toUpperCase(),
            descripcionPractica: practicaSeleccionada?.descripcion ?? busqueda.trim(),
            fecha: new Date(fecha).toISOString(),
            cantidad: 1,
            numeroAutorizacion: numeroAutorizacion.trim() || null,
            matriculaEspecialista:
                requiereEspecialista && matriculaEspecialista.trim()
                    ? parseInt(matriculaEspecialista, 10) || null
                    : null,
            matriculaAnestesista:
                requiereAnestesista && matriculaAnestesista.trim()
                    ? parseInt(matriculaAnestesista, 10) || null
                    : null,
            facturable: true,
            importeBaseUnitario: practicaSeleccionada
                ? (() => {
                    const vals: ComponenteValores = {
                        valorEspecialista: practicaSeleccionada.valorEspecialista,
                        valorAyudante: practicaSeleccionada.valorAyudante,
                        valorAnestesista: practicaSeleccionada.valorAnestesista,
                        valorGastos: practicaSeleccionada.valorGastos,
                        valorTotal: practicaSeleccionada.valor,
                    }
                    const t = calcularTotalSeleccionado(vals, componenteSeleccion)
                    return t > 0 ? t : null
                })()
                : null,
        }

        const subitemsSeleccionados = practicaSeleccionada
            ? obtenerSubitemsSeleccionados(
                {
                    valorEspecialista: practicaSeleccionada.valorEspecialista,
                    valorAyudante: practicaSeleccionada.valorAyudante,
                    valorAnestesista: practicaSeleccionada.valorAnestesista,
                    valorGastos: practicaSeleccionada.valorGastos,
                },
                componenteSeleccion
            )
            : []

        const cantidadPorSubitem = new Map<SubitemCodigo, number>()
        for (const subitem of subitemsSeleccionados) {
            cantidadPorSubitem.set(subitem, (cantidadPorSubitem.get(subitem) ?? 0) + 1)
        }

        const entradasCrear = cantidadPorSubitem.size > 0 && practicaSeleccionada
            ? Array.from(cantidadPorSubitem.entries()).map(([subitem, cantidadSubitem]) => {
                const valorUnitario = valorUnitarioPorSubitem(subitem, {
                    valorEspecialista: practicaSeleccionada.valorEspecialista,
                    valorAyudante: practicaSeleccionada.valorAyudante,
                    valorAnestesista: practicaSeleccionada.valorAnestesista,
                    valorGastos: practicaSeleccionada.valorGastos,
                })

                return {
                    ...body,
                    descripcionPractica: `${body.descripcionPractica} · ${etiquetaSubitem(subitem)}`,
                    cantidad: cantidadSubitem,
                    importeBaseUnitario: valorUnitario,
                    matriculaEspecialista: esSubitemEspecialista(subitem) ? body.matriculaEspecialista : null,
                    matriculaAnestesista: esSubitemAnestesista(subitem) ? body.matriculaAnestesista : null,
                }
            })
            : [body]

        setGuardando(true)
        try {
            const practicasCreadas: PracticaItem[] = []

            for (const entrada of entradasCrear) {
                const res = await fetch(`/api/internacion/${ingresoId}/practicas`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(entrada),
                })
                const json = await res.json()
                if (!res.ok) {
                    if (practicasCreadas.length > 0) {
                        setPracticas((prev) => [...practicasCreadas, ...prev])
                        if (refrescarDespuesCambios) {
                            router.refresh()
                        }
                    }
                    setError(json.error ?? 'Error al registrar la práctica')
                    return
                }
                practicasCreadas.push(json.data)
            }

            setPracticas((prev) => [...practicasCreadas, ...prev])
            if (refrescarDespuesCambios) {
                router.refresh()
            }
            limpiarForm()
            setMostrarForm(false)
        } catch {
            setError('Error de conexión')
        } finally {
            setGuardando(false)
        }
    }

    const handleDesagruparPractica = async (practicaId: number) => {
        setError(null)
        setDesagrupandoPracticaId(practicaId)
        const descripcionOriginal = practicas.find((p) => p.id === practicaId)?.descripcionPractica ?? null
        try {
            const res = await fetch(`/api/internacion/${ingresoId}/practicas/${practicaId}/desagrupar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-store',
            })

            const json = await res.json().catch(() => null)
            if (!res.ok) {
                setError(json?.error ?? 'No se pudo desagrupar la práctica')
                return
            }

            const practicasNuevas: PracticaItem[] = Array.isArray(json?.data)
                ? (json.data as PracticaItem[]).map((p) => ({
                    ...p,
                    descripcionPractica: p.descripcionPractica ?? descripcionOriginal ?? p.codigoPractica.trim(),
                }))
                : []
            if (practicasNuevas.length > 0) {
                setPracticas((prev) => {
                    const restante = prev.filter((p) => p.id !== practicaId)
                    return [...practicasNuevas, ...restante]
                })
            }

            if (refrescarDespuesCambios) {
                router.refresh()
            }
        } catch {
            setError('Error de conexión al desagrupar la práctica')
        } finally {
            setDesagrupandoPracticaId(null)
        }
    }

    const alternarSeleccionPractica = (practicaId: number, checked: boolean) => {
        setPracticasSeleccionadas((prev) => {
            if (checked) {
                if (prev.includes(practicaId)) return prev
                return [...prev, practicaId]
            }
            return prev.filter((id) => id !== practicaId)
        })
    }

    const alternarSeleccionTodas = (ids: number[], checked: boolean) => {
        if (!checked) {
            setPracticasSeleccionadas((prev) => prev.filter((id) => !ids.includes(id)))
            return
        }

        setPracticasSeleccionadas((prev) => {
            const next = new Set(prev)
            for (const id of ids) {
                next.add(id)
            }
            return Array.from(next)
        })
    }

    const handleEliminarPracticasSeleccionadas = async () => {
        const seleccionActual = [...practicasSeleccionadas]
        if (seleccionActual.length === 0) return

        setError(null)
        setEliminandoPracticas(true)
        try {
            const resultados = await Promise.all(
                seleccionActual.map(async (practicaId) => {
                    let timeoutId: ReturnType<typeof setTimeout> | null = null
                    try {
                        const controller = new AbortController()
                        timeoutId = setTimeout(() => controller.abort(), TIMEOUT_ELIMINAR_PRACTICA_MS)
                        const res = await fetch(`/api/internacion/${ingresoId}/practicas/${practicaId}`, {
                            method: 'DELETE',
                            signal: controller.signal,
                            cache: 'no-store',
                        })
                        const json = await res.json().catch(() => null)
                        if (res.status === 404) {
                            // Si ya no existe en backend (por carrera o estado previo), tratamos como eliminado.
                            return { practicaId, ok: true as const }
                        }
                        if (!res.ok) {
                            return {
                                practicaId,
                                ok: false as const,
                                error: json?.error ?? 'No se pudo eliminar la práctica',
                            }
                        }

                        return { practicaId, ok: true as const }
                    } catch (err) {
                        return {
                            practicaId,
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

            const exitosas = resultados.filter((r) => r.ok).map((r) => r.practicaId)
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
                setPracticas((prev) => prev.filter((p) => !exitosas.includes(p.id)))
                setPracticasSeleccionadas((prev) => prev.filter((id) => !exitosas.includes(id)))
                if (refrescarDespuesCambios) {
                    router.refresh()
                }
            }

            if (fallidas.length === 0) {
                setConfirmarEliminacionSeleccionadas(false)
            }
        } finally {
            setEliminandoPracticas(false)
        }
    }

    const fmtFecha = (d: Date | string) =>
        new Date(d).toLocaleString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        })

    const practicasVigentes = practicas.filter((p) => practicaActiva(p.estado))
    const practicasPendientes = practicasVigentes.filter(
        (p) => (p.ordenPractica?.length ?? 0) === 0 && !numeroAutorizacionValida(p.numeroAutorizacion)
    )
    const practicasAutorizadas = practicasVigentes.filter(
        (p) => (p.ordenPractica?.length ?? 0) > 0 || numeroAutorizacionValida(p.numeroAutorizacion)
    )
    const hrefGenerarAutorizacion = useMemo(() => {
        const params = new URLSearchParams({ ingresoId: String(ingresoId) })
        if (incluirPracticaIdsEnGenerarAutorizacion) {
            const idsPendientes = practicasPendientes.map((p) => p.id).join(',')
            if (idsPendientes) params.set('practicaIds', idsPendientes)
        }
        return `/dashboard/ambulatorio/nueva?${params.toString()}`
    }, [ingresoId, incluirPracticaIdsEnGenerarAutorizacion, practicasPendientes])
    const mostrarBotonGenerar = (puedeGenerarAutorizacion ?? puedeCrear) && practicas.length > 0
    const botonGenerarHabilitado = permitirGenerarSinPendientes
        ? practicasVigentes.length > 0
        : practicasPendientes.length > 0

    useEffect(() => {
        setPracticasSeleccionadas((prev) => prev.filter((id) => practicas.some((p) => p.id === id && (p.ordenPractica?.length ?? 0) === 0)))
    }, [practicas])

    const terminoFiltroLista = useMemo(() => normalizarBusquedaLista(filtroLista), [filtroLista])

    const practicasPendientesFiltradas = useMemo(() => {
        if (!terminoFiltroLista) return practicasPendientes
        return practicasPendientes.filter((p) => {
            const codigo = normalizarBusquedaLista(p.codigoPractica)
            const descripcion = normalizarBusquedaLista(p.descripcionPractica ?? '')
            const autorizacion = normalizarBusquedaLista(p.numeroAutorizacion ?? '')
            return (
                codigo.includes(terminoFiltroLista) ||
                descripcion.includes(terminoFiltroLista) ||
                autorizacion.includes(terminoFiltroLista)
            )
        })
    }, [practicasPendientes, terminoFiltroLista])

    const practicasAutorizadasFiltradas = useMemo(() => {
        if (!terminoFiltroLista) return practicasAutorizadas
        return practicasAutorizadas.filter((p) => {
            const codigo = normalizarBusquedaLista(p.codigoPractica)
            const descripcion = normalizarBusquedaLista(p.descripcionPractica ?? '')
            const autorizaciones = (p.ordenPractica ?? [])
                .map((orden) => `${orden.numeroAutorizacion ?? ''} ${orden.puestoNumero}-${orden.ordenNumero}`)
                .join(' ')
            const textoOrdenes = normalizarBusquedaLista(autorizaciones)
            return (
                codigo.includes(terminoFiltroLista) ||
                descripcion.includes(terminoFiltroLista) ||
                textoOrdenes.includes(terminoFiltroLista)
            )
        })
    }, [practicasAutorizadas, terminoFiltroLista])

    const totalPaginasPendientes = Math.max(1, Math.ceil(practicasPendientesFiltradas.length / PRACTICAS_LISTA_POR_PAGINA))
    const totalPaginasAutorizadas = Math.max(1, Math.ceil(practicasAutorizadasFiltradas.length / PRACTICAS_LISTA_POR_PAGINA))
    const paginaPendientesActual = Math.min(paginaPendientes, totalPaginasPendientes)
    const paginaAutorizadasActual = Math.min(paginaAutorizadas, totalPaginasAutorizadas)

    const practicasPendientesPaginadas = useMemo(() => {
        const desde = (paginaPendientesActual - 1) * PRACTICAS_LISTA_POR_PAGINA
        return practicasPendientesFiltradas.slice(desde, desde + PRACTICAS_LISTA_POR_PAGINA)
    }, [paginaPendientesActual, practicasPendientesFiltradas])

    const idsPendientesFiltradas = practicasPendientesFiltradas.map((p) => p.id)
    const seleccionadasFiltradas = practicasPendientesFiltradas.filter((p) => practicasSeleccionadas.includes(p.id))
    const todasFiltradasSeleccionadas =
        idsPendientesFiltradas.length > 0 && idsPendientesFiltradas.every((id) => practicasSeleccionadas.includes(id))

    const practicasAutorizadasPaginadas = useMemo(() => {
        const desde = (paginaAutorizadasActual - 1) * PRACTICAS_LISTA_POR_PAGINA
        return practicasAutorizadasFiltradas.slice(desde, desde + PRACTICAS_LISTA_POR_PAGINA)
    }, [paginaAutorizadasActual, practicasAutorizadasFiltradas])

    useEffect(() => {
        setPaginaPendientes(1)
        setPaginaAutorizadas(1)
    }, [filtroLista])

    return (
        <div className="his-card">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <button
                    onClick={() => setExpandido((v) => !v)}
                    className="flex items-center gap-2 text-sm font-semibold text-gray-900 hover:text-gray-700"
                >
                    <Stethoscope className="h-4 w-4 text-gray-400" />
                    Prácticas
                    <span className="text-xs font-normal text-gray-400 ml-1">({practicas.length})</span>
                    {expandido ? (
                        <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
                    ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                    )}
                </button>
                <div className="flex items-center gap-2">
                    {mostrarBotonGenerar && (
                        botonGenerarHabilitado ? (
                            forzarNavegacionCompletaGenerarAutorizacion ? (
                                <a
                                    href={hrefGenerarAutorizacion}
                                    className="flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 border border-emerald-200 rounded-lg px-2.5 py-1 hover:bg-emerald-50"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    Generar autorización
                                </a>
                            ) : (
                                <Link
                                    href={hrefGenerarAutorizacion}
                                    className="flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 border border-emerald-200 rounded-lg px-2.5 py-1 hover:bg-emerald-50"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    Generar autorización
                                </Link>
                            )
                        ) : (
                            <button
                                type="button"
                                disabled
                                title="No hay prácticas pendientes de autorización"
                                className="flex items-center gap-1 text-xs font-medium text-gray-400 border border-gray-200 rounded-lg px-2.5 py-1 bg-gray-50 cursor-not-allowed"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                Generar autorización
                            </button>
                        )
                    )}
                    {puedeCrear && (
                        <button
                            onClick={() => {
                                setMostrarForm((v) => !v)
                                if (mostrarForm) limpiarForm()
                            }}
                            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1 hover:bg-blue-50"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Agregar
                        </button>
                    )}
                </div>
            </div>

            {expandido && (
                <div className="p-4 space-y-4">
                    {/* Formulario */}
                    {mostrarForm && puedeCrear && (
                        <div className="border border-blue-100 bg-blue-50/40 rounded-xl p-4 space-y-3">
                            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                                Nueva práctica
                            </p>
                            <p className="text-[11px] text-blue-800 bg-blue-100/70 border border-blue-200 rounded-md px-2.5 py-1.5">
                                La cantidad general está deshabilitada. Cada registro se carga como un ítem individual.
                            </p>

                            {/* Búsqueda nomenclador */}
                            <div className="relative">
                                <label className="block text-xs text-gray-500 mb-1">
                                    Buscar en nomenclador
                                </label>
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                                    <input
                                        type="text"
                                        value={busqueda}
                                        onChange={(e) => buscarPractica(e.target.value)}
                                        placeholder="Código o descripción (mín. 2 caracteres)..."
                                        className="his-input pl-8 pr-8 text-sm w-full"
                                    />
                                    {buscando && (
                                        <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 animate-spin" />
                                    )}
                                    {practicaSeleccionada && (
                                        <button
                                            onClick={() => { setPracticaSeleccionada(null); setBusqueda('') }}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                                {resultados.length > 0 && (
                                    <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto text-sm">
                                        {resultados.map((r) => (
                                            <li key={`${r.convenioId}-${r.codigo}`}>
                                                <button
                                                    type="button"
                                                    onClick={() => seleccionarPractica(r)}
                                                    className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-start gap-2"
                                                >
                                                    <span className="font-mono text-xs text-gray-400 shrink-0 pt-0.5">
                                                        {r.codigo.trim()}
                                                    </span>
                                                    <span className="min-w-0 flex-1 text-gray-800">{r.descripcion}</span>
                                                    <span className="shrink-0 text-xs font-medium text-gray-500">
                                                        {r.valor != null ? formatoMoneda.format(r.valor) : '-'}
                                                    </span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            {/* Selector de componentes */}
                            {practicaSeleccionada && (
                                <ComponenteSelector
                                    valores={{
                                        valorEspecialista: practicaSeleccionada.valorEspecialista,
                                        valorAyudante: practicaSeleccionada.valorAyudante,
                                        valorAnestesista: practicaSeleccionada.valorAnestesista,
                                        valorGastos: practicaSeleccionada.valorGastos,
                                        valorTotal: practicaSeleccionada.valor,
                                    }}
                                    seleccion={componenteSeleccion}
                                    onChange={setComponenteSeleccion}
                                    disabled={guardando}
                                />
                            )}

                            {/* Fecha */}
                            <div className="grid grid-cols-1 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Fecha y hora</label>
                                    <input
                                        type="datetime-local"
                                        value={fecha}
                                        onChange={(e) => setFecha(e.target.value)}
                                        className="his-input text-sm w-full"
                                    />
                                </div>
                            </div>

                            {/* Nro autorización */}
                            <div className="grid grid-cols-1 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Nro. autorización</label>
                                    <input
                                        type="text"
                                        value={numeroAutorizacion}
                                        onChange={(e) => setNumeroAutorizacion(e.target.value)}
                                        placeholder="Opcional"
                                        className="his-input text-sm w-full"
                                    />
                                </div>
                            </div>

                            {practicaSeleccionada && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {practicaSeleccionada.valorEspecialista != null && (
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">Matrícula especialista (HE)</label>
                                            <input
                                                type="number"
                                                min={1}
                                                value={matriculaEspecialista}
                                                onChange={(e) => setMatriculaEspecialista(e.target.value)}
                                                placeholder="Ej: 12345"
                                                className="his-input text-sm w-full"
                                            />
                                        </div>
                                    )}
                                    {practicaSeleccionada.valorAnestesista != null && (
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">Matrícula anestesista (HA)</label>
                                            <input
                                                type="number"
                                                min={1}
                                                value={matriculaAnestesista}
                                                onChange={(e) => setMatriculaAnestesista(e.target.value)}
                                                placeholder="Ej: 12345"
                                                className="his-input text-sm w-full"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {error && (
                                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
                                    {error}
                                </p>
                            )}

                            <div className="flex gap-2 pt-1">
                                <button
                                    onClick={handleGuardar}
                                    disabled={guardando}
                                    className="flex items-center gap-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {guardando ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Plus className="h-3.5 w-3.5" />
                                    )}
                                    Guardar
                                </button>
                                <button
                                    onClick={() => { setMostrarForm(false); limpiarForm() }}
                                    className="text-xs text-gray-500 hover:text-gray-700 border rounded-lg px-3 py-1.5 hover:bg-gray-50"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Lista de prácticas */}
                    {practicas.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-3">
                            Sin prácticas registradas
                        </p>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between gap-2">
                                <div className="relative flex-1 max-w-sm">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                                    <input
                                        type="text"
                                        value={filtroLista}
                                        onChange={(e) => setFiltroLista(e.target.value)}
                                        placeholder="Filtrar prácticas por código, descripción o autorización..."
                                        className="w-full rounded-md border border-gray-300 pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <p className="text-xs text-gray-500">
                                    {practicasPendientesFiltradas.length + practicasAutorizadasFiltradas.length} de {practicas.length}
                                </p>
                            </div>
                            <div className="space-y-2">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                                    Pendientes de autorización ({practicasPendientesFiltradas.length})
                                </p>
                                {puedeCrear && practicasPendientesFiltradas.length > 0 && (
                                    <div className="rounded-md border border-amber-200 bg-amber-50/70 p-3 text-xs flex flex-wrap items-center gap-3">
                                        <label className="inline-flex items-center gap-2 text-amber-900">
                                            <input
                                                type="checkbox"
                                                checked={todasFiltradasSeleccionadas}
                                                onChange={(e) => alternarSeleccionTodas(idsPendientesFiltradas, e.target.checked)}
                                                disabled={eliminandoPracticas}
                                                className="h-4 w-4 rounded border-amber-300 text-amber-700 focus:ring-amber-500"
                                            />
                                            Seleccionar todas (filtro actual)
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (practicasSeleccionadas.length === 0) return
                                                setError(null)
                                                setConfirmarEliminacionSeleccionadas(true)
                                            }}
                                            disabled={eliminandoPracticas || practicasSeleccionadas.length === 0}
                                            className="inline-flex items-center rounded-md border border-red-200 bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                        >
                                            Eliminar seleccionadas ({practicasSeleccionadas.length})
                                        </button>
                                    </div>
                                )}
                                {confirmarEliminacionSeleccionadas && practicasSeleccionadas.length > 0 && (
                                    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs">
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="flex items-start gap-2 text-amber-900">
                                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                                <div>
                                                    <p className="text-sm font-semibold">
                                                        ¿Eliminar {practicasSeleccionadas.length} práctica(s) no autorizada(s)?
                                                    </p>
                                                    {seleccionadasFiltradas.slice(0, 3).map((p) => (
                                                        <p key={p.id} className="text-xs text-amber-800">
                                                            {p.codigoPractica.trim()} · {p.descripcionPractica ?? p.codigoPractica.trim()}
                                                        </p>
                                                    ))}
                                                    {practicasSeleccionadas.length > 3 && (
                                                        <p className="text-xs text-amber-800">... y {practicasSeleccionadas.length - 3} más</p>
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
                                                    onClick={() => void handleEliminarPracticasSeleccionadas()}
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
                                {practicasPendientesFiltradas.length === 0 ? (
                                    <p className="text-xs text-gray-400">No hay prácticas pendientes.</p>
                                ) : (
                                    practicasPendientesPaginadas.map((p) => (
                                        <div
                                            key={p.id}
                                            className="flex items-start justify-between gap-3 text-xs border rounded-lg p-2.5 bg-white hover:bg-amber-50/40"
                                        >
                                            {puedeCrear && (
                                                <input
                                                    type="checkbox"
                                                    checked={practicasSeleccionadas.includes(p.id)}
                                                    onChange={(e) => alternarSeleccionPractica(p.id, e.target.checked)}
                                                    disabled={eliminandoPracticas}
                                                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-amber-700 focus:ring-amber-500"
                                                />
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-mono text-gray-400 shrink-0">
                                                        {p.codigoPractica.trim()}
                                                    </span>
                                                    <span className="font-medium text-gray-800 truncate">
                                                        {p.descripcionPractica ?? p.codigoPractica.trim()}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3 mt-1 text-gray-500 flex-wrap">
                                                    <span>{fmtFecha(p.fecha)}</span>
                                                    {p.cantidad > 1 && <span>Cant: {p.cantidad}</span>}
                                                    {p.numeroAutorizacion && <span>Aut: {p.numeroAutorizacion}</span>}
                                                    <span
                                                        className={`px-1.5 py-0.5 rounded ${p.facturable
                                                            ? 'bg-green-50 text-green-700'
                                                            : 'bg-gray-100 text-gray-500'
                                                            }`}
                                                    >
                                                        {p.facturable ? 'Facturable' : 'No facturable'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {puedeCrear && p.cantidad > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleDesagruparPractica(p.id)}
                                                        disabled={desagrupandoPracticaId === p.id}
                                                        className="rounded-md border border-blue-200 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                                                    >
                                                        {desagrupandoPracticaId === p.id ? 'Desagrupando...' : 'Desagrupar'}
                                                    </button>
                                                )}
                                                {p.estado && p.estado !== 'A' && (
                                                    <span className="text-gray-400">{p.estado}</span>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                                {practicasPendientesFiltradas.length > PRACTICAS_LISTA_POR_PAGINA && (
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-xs text-gray-500">
                                            Página {paginaPendientesActual} de {totalPaginasPendientes}
                                        </p>
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => setPaginaPendientes((prev) => Math.max(1, prev - 1))}
                                                disabled={paginaPendientesActual <= 1}
                                                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                            >
                                                Anterior
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setPaginaPendientes((prev) => Math.min(totalPaginasPendientes, prev + 1))}
                                                disabled={paginaPendientesActual >= totalPaginasPendientes}
                                                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                            >
                                                Siguiente
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                    Ya autorizadas ({practicasAutorizadasFiltradas.length})
                                </p>
                                {practicasAutorizadasFiltradas.length === 0 ? (
                                    <p className="text-xs text-gray-400">No hay prácticas autorizadas.</p>
                                ) : (
                                    practicasAutorizadasPaginadas.map((p) => {
                                        const ordenesOrdenadas = [...p.ordenPractica].sort((a, b) => {
                                            if (a.puestoNumero !== b.puestoNumero) {
                                                return a.puestoNumero - b.puestoNumero
                                            }
                                            if (a.ordenNumero !== b.ordenNumero) {
                                                return a.ordenNumero - b.ordenNumero
                                            }
                                            return a.item - b.item
                                        })
                                        const ordenesUnicas = Array.from(
                                            new Map(
                                                ordenesOrdenadas.map((orden) => [
                                                    `${orden.puestoNumero}-${orden.ordenNumero}`,
                                                    orden,
                                                ])
                                            ).values()
                                        )
                                        const destinoAutorizada = ordenesUnicas.length === 0
                                            ? null
                                            : ordenesUnicas.length === 1
                                                ? `/dashboard/ambulatorio/${ordenesUnicas[0]!.puestoNumero}/${ordenesUnicas[0]!.ordenNumero}?item=${ordenesUnicas[0]!.item}`
                                                : `/dashboard/ambulatorio/imprimir?ordenes=${encodeURIComponent(
                                                    ordenesUnicas
                                                        .map((orden) => `${orden.puestoNumero}-${orden.ordenNumero}`)
                                                        .join(',')
                                                )}`

                                        return (
                                        <div
                                            key={p.id}
                                            role={destinoAutorizada ? 'button' : undefined}
                                            tabIndex={destinoAutorizada ? 0 : undefined}
                                            onClick={() => {
                                                if (destinoAutorizada) router.push(destinoAutorizada)
                                            }}
                                            onKeyDown={(e) => {
                                                if (!destinoAutorizada) return
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault()
                                                    router.push(destinoAutorizada)
                                                }
                                            }}
                                            title={
                                                !destinoAutorizada
                                                    ? undefined
                                                    : ordenesUnicas.length > 1
                                                        ? 'Ver todas las órdenes autorizadas'
                                                        : 'Ir a la orden autorizada'
                                            }
                                            className={`flex items-start justify-between gap-3 text-xs border border-emerald-200 rounded-lg p-2.5 bg-emerald-50/40 ${destinoAutorizada ? 'cursor-pointer hover:bg-emerald-100/40' : ''}`}
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-mono text-emerald-800/70 shrink-0">
                                                        {p.codigoPractica.trim()}
                                                    </span>
                                                    <span className="font-medium text-emerald-900 truncate">
                                                        {p.descripcionPractica ?? p.codigoPractica.trim()}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3 mt-1 text-emerald-700 flex-wrap">
                                                    <span>{fmtFecha(p.fecha)}</span>
                                                    {ordenesOrdenadas.map((orden) => (
                                                            <Link
                                                                key={`${p.id}-${orden.puestoNumero}-${orden.ordenNumero}-${orden.item}`}
                                                                href={`/dashboard/ambulatorio/${orden.puestoNumero}/${orden.ordenNumero}?item=${orden.item}`}
                                                                onClick={(e) => e.stopPropagation()}
                                                                title={`Ver orden ${formatearNumeroOrden(orden.puestoNumero, orden.ordenNumero, orden.item)} en Autorizaciones`}
                                                                className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-900 hover:bg-emerald-200"
                                                            >
                                                                {formatearNumeroOrden(
                                                                    orden.puestoNumero,
                                                                    orden.ordenNumero,
                                                                    orden.item
                                                                )}
                                                                {orden.numeroAutorizacion
                                                                    ? ` · ${orden.numeroAutorizacion}`
                                                                    : ' · falta N° de autorización'}
                                                            </Link>
                                                        ))}
                                                </div>
                                            </div>
                                        </div>
                                    )})
                                )}
                                {practicasAutorizadasFiltradas.length > PRACTICAS_LISTA_POR_PAGINA && (
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-xs text-gray-500">
                                            Página {paginaAutorizadasActual} de {totalPaginasAutorizadas}
                                        </p>
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => setPaginaAutorizadas((prev) => Math.max(1, prev - 1))}
                                                disabled={paginaAutorizadasActual <= 1}
                                                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                            >
                                                Anterior
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setPaginaAutorizadas((prev) => Math.min(totalPaginasAutorizadas, prev + 1))}
                                                disabled={paginaAutorizadasActual >= totalPaginasAutorizadas}
                                                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                            >
                                                Siguiente
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
