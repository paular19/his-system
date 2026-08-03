'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ActualizarPracticaSchema } from '@/modules/internacion/schemas'
import { ActualizarIngresoSchema } from '@/modules/admision/schemas'
import { updateIngresoAction } from '@/modules/admision/actions'
import { ChevronRight, User, Pencil, FileText, Printer, X, Loader2, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { formatearFecha, formatearFechaHora, formatearFechaCalendario, calcularEdad } from '@/lib/utils'
import { AdmisionEditForm } from './admision-edit-form'
import { FichaAdmisionPrint } from './ficha-admision-print'
import { PracticaIngresoForm } from './practica-ingreso-form'
import { generarOrdenesPendientesAdmision } from './ordenes-auto'
import type { IngresoDetalle } from '@/modules/admision/types'
import { formatearNumeroOrden } from '@/modules/orden/types'
import { limpiarObservacionesAdmision } from '@/modules/admision/utils'
import { agruparPracticasAutorizadasPorOrden, obtenerDestinoGrupoPracticasAutorizadas } from '@/lib/practicas-autorizadas'
import { ObservacionesSection } from '@/components/internacion/observaciones-section'
import {
    abrirVentanaImpresionPendiente,
    cerrarVentanaImpresion,
    navegarVentanaImpresion,
} from '@/lib/utils/print-window'

interface FichaIngresoClientProps {
    ingreso: IngresoDetalle
    puedeModificar: boolean
    puedeAgregarDiagnostico: boolean
    puedeGenerarAutorizacion: boolean
}

type PracticaEditable = {
    id: number
    ingresoId: number
    convenioId: number
    codigoPractica: string
    descripcionPractica: string | null
    fecha: Date | string
    cantidad: number
    importeTotal?: number | null
    numeroAutorizacion: string | null
    matriculaEspecialista?: number | null
    matriculaAnestesista?: number | null
    facturable: boolean
    facturada?: boolean
}

const LABEL_ESTADO: Record<string, string> = {
    A: 'Activo',
    E: 'Egresado',
    P: 'Pendiente',
    X: 'Anulado',
}
const BADGE_ESTADO: Record<string, string> = {
    A: 'his-badge-activo',
    E: 'his-badge-inactivo',
    P: 'his-badge-urgente',
    X: 'his-badge-inactivo',
}

const PRACTICAS_POR_PAGINA = 12
const TIMEOUT_ELIMINAR_PRACTICA_MS = 45000

function normalizarTexto(value: string | null | undefined): string {
    return (value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
}

function DataItem({ label, value }: { label: string; value?: string | null }) {
    if (!value) return null
    return (
        <div>
            <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                {label}
            </dt>
            <dd className="text-sm text-gray-900">{value}</dd>
        </div>
    )
}

export function FichaIngresoClient({
    ingreso,
    puedeModificar,
    puedeAgregarDiagnostico,
    puedeGenerarAutorizacion,
}: FichaIngresoClientProps) {
    const router = useRouter()
    const [isEditing, setIsEditing] = useState(false)
    const fechaNacimientoPaciente = ingreso.paciente?.fechaNacimiento ?? ingreso.fechaNacimiento
    const edad = fechaNacimientoPaciente ? calcularEdad(fechaNacimientoPaciente) : null
    const observacionesLimpias = limpiarObservacionesAdmision(ingreso.observaciones)

    // Inline edit state for each card
    const [editingCard, setEditingCard] = useState<string | null>(null)
    const [cardLoading, setCardLoading] = useState(false)
    const [cardError, setCardError] = useState<string | null>(null)
    const [cardValues, setCardValues] = useState<any>({})
    const [practicasIngreso, setPracticasIngreso] = useState(ingreso.practicas)
    const estadoIngreso = (ingreso.estado ?? '').trim().toUpperCase()
    const practicasPendientes = practicasIngreso.filter(
        (p) => (p.ordenPractica?.length ?? 0) === 0
    )
    const practicasAutorizadas = practicasIngreso.filter(
        (p) => (p.ordenPractica?.length ?? 0) > 0
    )
    const [filtroPracticas, setFiltroPracticas] = useState('')
    const [paginaPendientes, setPaginaPendientes] = useState(1)
    const [paginaAutorizadas, setPaginaAutorizadas] = useState(1)
    const [practicasSeleccionadas, setPracticasSeleccionadas] = useState<number[]>([])
    const [confirmarEliminacionSeleccionadas, setConfirmarEliminacionSeleccionadas] = useState(false)
    const [eliminandoPracticas, setEliminandoPracticas] = useState(false)
    const [generandoOrdenes, setGenerandoOrdenes] = useState(false)
    const [errorEliminarPractica, setErrorEliminarPractica] = useState<string | null>(null)
    const [errorGenerarOrdenes, setErrorGenerarOrdenes] = useState<string | null>(null)
    const [practicaEditando, setPracticaEditando] = useState<PracticaEditable | null>(null)
    const [guardandoPracticaEditando, setGuardandoPracticaEditando] = useState(false)
    const [ordenesAutorizadasAbiertas, setOrdenesAutorizadasAbiertas] = useState<Record<string, boolean>>({})
    const [ordenesAutorizadasExpandidas, setOrdenesAutorizadasExpandidas] = useState<Record<string, boolean>>({})
    const terminoFiltroPracticas = normalizarTexto(filtroPracticas)

    const practicasPendientesFiltradas = terminoFiltroPracticas
        ? practicasPendientes.filter((p) => {
            const codigo = normalizarTexto(p.codigoPractica)
            const descripcion = normalizarTexto(p.nomencladorPractica?.descripcion)
            const numeroAutorizacion = normalizarTexto(p.numeroAutorizacion)
            return (
                codigo.includes(terminoFiltroPracticas) ||
                descripcion.includes(terminoFiltroPracticas) ||
                numeroAutorizacion.includes(terminoFiltroPracticas)
            )
        })
        : practicasPendientes

    const practicasAutorizadasFiltradas = terminoFiltroPracticas
        ? practicasAutorizadas.filter((p) => {
            const codigo = normalizarTexto(p.codigoPractica)
            const descripcion = normalizarTexto(p.nomencladorPractica?.descripcion)
            const numeroAutorizacion = normalizarTexto(p.numeroAutorizacion)
            const autorizacionesOrden = (p.ordenPractica ?? [])
                .map((orden) => normalizarTexto(orden.numeroAutorizacion))
                .join(' ')
            return (
                codigo.includes(terminoFiltroPracticas) ||
                descripcion.includes(terminoFiltroPracticas) ||
                numeroAutorizacion.includes(terminoFiltroPracticas) ||
                autorizacionesOrden.includes(terminoFiltroPracticas)
            )
        })
        : practicasAutorizadas

    const practicaAutorizadaIdsFiltradas = useMemo(
        () => new Set(practicasAutorizadasFiltradas.map((p) => p.id)),
        [practicasAutorizadasFiltradas]
    )

    const ordenesAutorizadasFiltradas = useMemo(
        () => agruparPracticasAutorizadasPorOrden(practicasAutorizadas, practicaAutorizadaIdsFiltradas),
        [practicasAutorizadas, practicaAutorizadaIdsFiltradas]
    )

    const totalPaginasPendientes = Math.max(
        1,
        Math.ceil(practicasPendientesFiltradas.length / PRACTICAS_POR_PAGINA)
    )
    const totalPaginasAutorizadas = Math.max(
        1,
        Math.ceil(ordenesAutorizadasFiltradas.length / PRACTICAS_POR_PAGINA)
    )
    const paginaPendientesActual = Math.min(paginaPendientes, totalPaginasPendientes)
    const paginaAutorizadasActual = Math.min(paginaAutorizadas, totalPaginasAutorizadas)

    const practicasPendientesPaginadas = practicasPendientesFiltradas.slice(
        (paginaPendientesActual - 1) * PRACTICAS_POR_PAGINA,
        paginaPendientesActual * PRACTICAS_POR_PAGINA
    )
    const ordenesAutorizadasPaginadas = ordenesAutorizadasFiltradas.slice(
        (paginaAutorizadasActual - 1) * PRACTICAS_POR_PAGINA,
        paginaAutorizadasActual * PRACTICAS_POR_PAGINA
    )

    useEffect(() => {
        setPaginaPendientes(1)
        setPaginaAutorizadas(1)
    }, [filtroPracticas])

    useEffect(() => {
        setPracticasIngreso(ingreso.practicas)
    }, [ingreso.practicas])

    useEffect(() => {
        setPaginaPendientes((prev) => Math.min(prev, totalPaginasPendientes))
    }, [totalPaginasPendientes])

    useEffect(() => {
        setPaginaAutorizadas((prev) => Math.min(prev, totalPaginasAutorizadas))
    }, [totalPaginasAutorizadas])

    useEffect(() => {
        setPracticasSeleccionadas((prev) => prev.filter((id) => practicasPendientes.some((p) => p.id === id)))
    }, [practicasPendientes])

    const profesionalTratanteNombre = ingreso.profesionalTratante?.nombre
        ?? ingreso.evoluciones?.[0]?.profesional?.nombre
        ?? ingreso.profesionalTratanteFallback?.nombre
        ?? null
    const profesionalTratanteMatricula = ingreso.profesionalTratante?.matricula
        ?? ingreso.evoluciones?.[0]?.profesional?.matricula
        ?? ingreso.profesionalTratanteFallback?.matricula
        ?? null
    const esIngresoAmbulatorio = ingreso.tipoIngresoCodigo === 'AMB'
    const esGuardia = ingreso.ingresoSubtipo?.subtipoAdmisionCodigo === 'GUA'
    const esPracticaAmbulatoria =
        ingreso.tipoIngresoCodigo === 'AMB' &&
        ['TUR', 'RAY', 'CUR', 'SUT', 'ECG', 'ECO', 'PAM'].includes(
            ingreso.ingresoSubtipo?.subtipoAdmisionCodigo ?? ''
        )
    const ocultarEgresoPrevisto =
        esPracticaAmbulatoria ||
        ['GUA', 'DER', 'IND'].includes(ingreso.ingresoSubtipo?.subtipoAdmisionCodigo ?? '')

    const toDateInputValue = (value: Date | string | null | undefined) => {
        if (!value) return ''
        const date = new Date(value)
        const y = date.getFullYear()
        const m = String(date.getMonth() + 1).padStart(2, '0')
        const d = String(date.getDate()).padStart(2, '0')
        return `${y}-${m}-${d}`
    }

    const toDateTimeLocalInputValue = (value: Date | string | null | undefined) => {
        if (!value) return ''
        const date = new Date(value)
        const y = date.getFullYear()
        const m = String(date.getMonth() + 1).padStart(2, '0')
        const d = String(date.getDate()).padStart(2, '0')
        const hh = String(date.getHours()).padStart(2, '0')
        const mm = String(date.getMinutes()).padStart(2, '0')
        return `${y}-${m}-${d}T${hh}:${mm}`
    }

    const idsPendientesFiltradas = practicasPendientesFiltradas.map((p) => p.id)
    const seleccionadasFiltradas = practicasPendientesFiltradas.filter((p) => practicasSeleccionadas.includes(p.id))
    const todasFiltradasSeleccionadas =
        idsPendientesFiltradas.length > 0 && idsPendientesFiltradas.every((id) => practicasSeleccionadas.includes(id))

    const alternarSeleccionPractica = (practicaId: number, checked: boolean) => {
        setPracticasSeleccionadas((prev) => {
            if (checked) {
                if (prev.includes(practicaId)) return prev
                return [...prev, practicaId]
            }
            return prev.filter((id) => id !== practicaId)
        })
    }

    const alternarSeleccionTodas = (checked: boolean) => {
        if (!checked) {
            setPracticasSeleccionadas((prev) => prev.filter((id) => !idsPendientesFiltradas.includes(id)))
            return
        }

        setPracticasSeleccionadas((prev) => {
            const next = new Set(prev)
            for (const id of idsPendientesFiltradas) {
                next.add(id)
            }
            return Array.from(next)
        })
    }

    const recargarPracticasIngreso = async () => {
        const res = await fetch(`/api/admision/${ingreso.id}/practicas`, { cache: 'no-store' })
        const json = await res.json().catch(() => null)
        const practicasActualizadas = Array.isArray(json?.data) ? json.data : []
        setPracticasIngreso(practicasActualizadas)
    }

    const generarOrdenesSeleccionadas = async (imprimirDespues: boolean) => {
        const seleccionActual = [...practicasSeleccionadas]
        if (seleccionActual.length === 0) return

        const ventanaImpresion = imprimirDespues ? abrirVentanaImpresionPendiente() : null
        let impresionDisparada = false

        setErrorGenerarOrdenes(null)
        setGenerandoOrdenes(true)
        try {
            const result = await generarOrdenesPendientesAdmision(ingreso.id, {
                idsPendientesConfirmados: seleccionActual,
            })

            if (!result.ok) {
                setErrorGenerarOrdenes(result.error)
                return
            }

            void recargarPracticasIngreso()
            setPracticasSeleccionadas((prev) => prev.filter((id) => !seleccionActual.includes(id)))

            if (imprimirDespues && result.ordenes.length > 0) {
                const ordenesParam = result.ordenes.map((o) => `${o.puestoNumero}-${o.numero}`).join(',')
                navegarVentanaImpresion(
                    ventanaImpresion,
                    `/dashboard/ambulatorio/imprimir?ordenes=${encodeURIComponent(ordenesParam)}`
                )
                impresionDisparada = true
            }
        } catch {
            setErrorGenerarOrdenes('Error al generar órdenes')
        } finally {
            if (!impresionDisparada) {
                cerrarVentanaImpresion(ventanaImpresion)
            }
            setGenerandoOrdenes(false)
        }
    }

    const guardarEdicionPractica = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        if (!practicaEditando) return

        setGuardandoPracticaEditando(true)
        try {
            const numeroAutorizacion = practicaEditando.numeroAutorizacion?.trim() || null

            const payload = ActualizarPracticaSchema.parse({
                convenioId: practicaEditando.convenioId,
                codigoPractica: practicaEditando.codigoPractica.trim(),
                descripcionPractica: practicaEditando.descripcionPractica,
                fecha: new Date(practicaEditando.fecha),
                cantidad: Number(practicaEditando.cantidad),
                numeroAutorizacion,
                facturable: Boolean(practicaEditando.facturable),
                matriculaEspecialista: practicaEditando.matriculaEspecialista ?? null,
                matriculaAnestesista: practicaEditando.matriculaAnestesista ?? null,
                importeBaseUnitario:
                    practicaEditando.importeTotal != null && Number(practicaEditando.cantidad) > 0
                        ? Number(practicaEditando.importeTotal) / Number(practicaEditando.cantidad)
                        : null,
            })

            const res = await fetch(`/api/internacion/${ingreso.id}/practicas/${practicaEditando.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })

            const json = await res.json().catch(() => null)
            if (!res.ok) {
                setErrorGenerarOrdenes(json?.error ?? 'No se pudo guardar la práctica')
                return
            }

            await recargarPracticasIngreso()
            setPracticaEditando(null)
            setErrorGenerarOrdenes(null)
        } catch {
            setErrorGenerarOrdenes('No se pudo guardar la práctica')
        } finally {
            setGuardandoPracticaEditando(false)
        }
    }

    const confirmarEliminarSeleccionadas = async () => {
        const seleccionActual = [...practicasSeleccionadas]
        if (seleccionActual.length === 0) return

        setErrorEliminarPractica(null)
        setEliminandoPracticas(true)
        try {
            const resultados = await Promise.all(
                seleccionActual.map(async (practicaId) => {
                    let timeoutId: ReturnType<typeof setTimeout> | null = null
                    try {
                        const controller = new AbortController()
                        timeoutId = setTimeout(() => controller.abort(), TIMEOUT_ELIMINAR_PRACTICA_MS)
                        const res = await fetch(`/api/internacion/${ingreso.id}/practicas/${practicaId}`, {
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
                setErrorEliminarPractica(
                    exitosas.length > 0
                        ? `Se eliminaron ${exitosas.length} prácticas y ${fallidas.length} fallaron. ${errorPrincipal}`
                        : errorPrincipal
                )
            }

            if (exitosas.length > 0) {
                setPracticasIngreso((prev) => prev.filter((p) => !exitosas.includes(p.id)))
                setPracticasSeleccionadas((prev) => prev.filter((id) => !exitosas.includes(id)))
            }

            if (fallidas.length === 0) {
                setConfirmarEliminacionSeleccionadas(false)
            }
        } finally {
            setEliminandoPracticas(false)
        }
    }

    // For select fields (e.g., profesionales), you may want to fetch options here if needed

    return (
        <div>
            {/* Contenido visible en pantalla — oculto al imprimir */}
            <div className="p-6 max-w-4xl space-y-5 print:hidden">
                {/* Breadcrumb */}
                <nav className="flex items-center gap-1 text-xs text-gray-500">
                    <Link href="/dashboard/admision" className="hover:text-gray-700">
                        Admisión
                    </Link>
                    <ChevronRight className="h-3 w-3" />
                    <span className="text-gray-900 font-medium">
                        {ingreso.tipoIngresoCodigo}-{ingreso.numeroIngreso}
                    </span>
                </nav>

                {/* Cabecera */}
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">
                            {ingreso.nombre ?? ingreso.paciente?.nombreCompleto ?? 'Sin nombre'}
                        </h2>
                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 flex-wrap">
                            <span className="font-mono font-medium text-blue-600">
                                {ingreso.tipoIngresoCodigo}-{ingreso.numeroIngreso}
                            </span>
                            {ingreso.fechaIngreso && (
                                <span>Ingresado: {formatearFechaHora(ingreso.fechaIngreso)}</span>
                            )}
                            {ingreso.estado && (
                                <span className={BADGE_ESTADO[ingreso.estado] ?? 'his-badge-inactivo'}>
                                    {LABEL_ESTADO[ingreso.estado] ?? ingreso.estado}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 print:hidden">
                        <button
                            onClick={() => window.print()}
                            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                            <Printer className="h-4 w-4" />
                            Imprimir
                        </button>
                        {ingreso.tipoIngresoCodigo === 'INT' && (
                            <Link
                                href={`/dashboard/internacion/${ingreso.id}/informe`}
                                className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                            >
                                <FileText className="h-4 w-4" />
                                Informe
                            </Link>
                        )}
                    </div>
                </div>

                {/* Datos del paciente */}
                <div className="his-card p-5">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b">
                        <h3 className="text-sm font-semibold text-gray-700">Datos del Paciente</h3>
                        {ingreso.pacienteId && (
                            <Link
                                href={`/dashboard/pacientes/${ingreso.pacienteId}`}
                                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                            >
                                <User className="h-3 w-3" />
                                Ver ficha
                            </Link>
                        )}
                    </div>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                        <DataItem
                            label="Nombre"
                            value={ingreso.nombre ?? ingreso.paciente?.nombreCompleto}
                        />
                        <DataItem
                            label="Fecha de Nacimiento"
                            value={
                                fechaNacimientoPaciente
                                    ? `${formatearFechaCalendario(fechaNacimientoPaciente)}${edad !== null ? ` (${edad} años)` : ''}`
                                    : null
                            }
                        />
                        <DataItem label="Edad al ingreso" value={ingreso.edad?.toString()} />
                    </dl>
                </div>

                {isEditing && puedeModificar && (
                    <div className="his-card p-5 border-l-4 border-blue-500 print:hidden">
                        <div className="flex items-center justify-between gap-3 mb-4 pb-2 border-b">
                            <h3 className="text-sm font-semibold text-gray-700">Editar ficha</h3>
                            <button
                                onClick={() => setIsEditing(false)}
                                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                <X className="h-4 w-4" />
                                Cerrar edición
                            </button>
                        </div>
                        <AdmisionEditForm ingreso={ingreso} onSuccess={() => setIsEditing(false)} />
                    </div>
                )}

                {/* Datos de admisión */}
                <div className="his-card p-5">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b">
                        <h3 className="text-sm font-semibold text-gray-700">Datos de la Admisión</h3>
                        {puedeModificar && editingCard !== 'admision' && (
                            <button
                                onClick={() => {
                                    setEditingCard('admision');
                                    setCardValues({
                                        fechaIngreso: toDateTimeLocalInputValue(ingreso.fechaIngreso),
                                        profesionalGuardiaId: ingreso.profesionalGuardiaId || '',
                                        ...(!esIngresoAmbulatorio
                                            ? { fechaEgreso: toDateInputValue(ingreso.fechaEgreso) }
                                            : {}),
                                        ...(!ocultarEgresoPrevisto
                                            ? { fechaEgresoPrevista: toDateInputValue(ingreso.fechaEgresoPrevista) }
                                            : {}),
                                        ...(!esGuardia
                                            ? { profesionalTratanteId: ingreso.profesionalTratanteId || '' }
                                            : {}),
                                    });
                                }}
                                className="ml-1 text-gray-400 hover:text-blue-600" title="Editar sección"
                            >
                                <Pencil className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    {editingCard === 'admision' ? (
                        <form
                            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4"
                            onSubmit={async (e) => {
                                e.preventDefault();
                                setCardLoading(true);
                                setCardError(null);
                                try {
                                    await updateIngresoAction(ingreso.id, cardValues);
                                    setEditingCard(null);
                                } catch (err) {
                                    setCardError('Error al guardar');
                                } finally {
                                    setCardLoading(false);
                                }
                            }}
                        >
                            {/* Tipo de Ingreso (solo lectura) */}
                            <div>
                                <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Tipo de Ingreso</dt>
                                <dd className="text-sm text-gray-900">
                                    {ingreso.ingresoSubtipo?.subtipoAdmision?.descripcion
                                        ?? ingreso.tipoIngreso?.descripcion
                                        ?? ingreso.tipoIngresoCodigo}
                                </dd>
                            </div>
                            {/* Número de Ingreso (solo lectura) */}
                            <div>
                                <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Número de Ingreso</dt>
                                <dd className="text-sm text-gray-900">{`${ingreso.tipoIngresoCodigo}-${ingreso.numeroIngreso}`}</dd>
                            </div>
                            {/* Fecha de Ingreso */}
                            <div>
                                <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Fecha de Ingreso</dt>
                                <dd className="text-sm text-gray-900">
                                    <input
                                        type="datetime-local"
                                        className="border rounded px-2 py-1 w-full"
                                        value={cardValues.fechaIngreso ? cardValues.fechaIngreso + (cardValues.fechaIngreso.length === 10 ? 'T00:00' : '') : ''}
                                        onChange={e => setCardValues((v: any) => ({ ...v, fechaIngreso: e.target.value.slice(0, 16) }))}
                                        disabled={cardLoading}
                                    />
                                </dd>
                            </div>
                            {/* Profesional Guardia */}
                            <div>
                                <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Profesional Guardia</dt>
                                <dd className="text-sm text-gray-900">
                                    <input
                                        type="text"
                                        className="border rounded px-2 py-1 w-full"
                                        value={cardValues.profesionalGuardiaNombre || ingreso.profesionalGuardia?.nombre || ''}
                                        onChange={e => setCardValues((v: any) => ({ ...v, profesionalGuardiaNombre: e.target.value }))}
                                        disabled={cardLoading}
                                    />
                                </dd>
                            </div>
                            {/* Fecha de Egreso */}
                            {!esIngresoAmbulatorio && (
                                <div>
                                    <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Fecha de Egreso</dt>
                                    <dd className="text-sm text-gray-900">
                                        <input
                                            type="datetime-local"
                                            className="border rounded px-2 py-1 w-full"
                                            value={cardValues.fechaEgreso ? cardValues.fechaEgreso + (cardValues.fechaEgreso.length === 10 ? 'T00:00' : '') : ''}
                                            onChange={e => setCardValues((v: any) => ({ ...v, fechaEgreso: e.target.value.slice(0, 16) }))}
                                            disabled={cardLoading}
                                        />
                                    </dd>
                                </div>
                            )}
                            {/* Egreso Previsto */}
                            {!ocultarEgresoPrevisto && (
                                <div>
                                    <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Egreso Previsto</dt>
                                    <dd className="text-sm text-gray-900">
                                        <input
                                            type="datetime-local"
                                            className="border rounded px-2 py-1 w-full"
                                            value={cardValues.fechaEgresoPrevista ? cardValues.fechaEgresoPrevista + (cardValues.fechaEgresoPrevista.length === 10 ? 'T00:00' : '') : ''}
                                            onChange={e => setCardValues((v: any) => ({ ...v, fechaEgresoPrevista: e.target.value.slice(0, 16) }))}
                                            disabled={cardLoading}
                                        />
                                    </dd>
                                </div>
                            )}
                            {/* Profesional Tratante */}
                            {!esGuardia && (
                                <div>
                                    <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Profesional Tratante</dt>
                                    <dd className="text-sm text-gray-900">
                                        <input
                                            type="text"
                                            className="border rounded px-2 py-1 w-full"
                                            value={cardValues.profesionalTratanteNombre || ingreso.profesionalTratante?.nombre || ''}
                                            onChange={e => setCardValues((v: any) => ({ ...v, profesionalTratanteNombre: e.target.value }))}
                                            disabled={cardLoading}
                                        />
                                    </dd>
                                </div>
                            )}
                            <div className="col-span-full flex gap-2 mt-2">
                                <button type="submit" className="text-green-600 border px-3 py-1 rounded" disabled={cardLoading}>Guardar</button>
                                <button type="button" className="text-gray-400 border px-3 py-1 rounded" onClick={() => setEditingCard(null)} disabled={cardLoading}>Cancelar</button>
                                {cardError && <span className="text-red-500 ml-2">{cardError}</span>}
                            </div>
                        </form>
                    ) : (
                        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                            <DataItem
                                label="Tipo de Ingreso"
                                value={
                                    ingreso.ingresoSubtipo?.subtipoAdmision?.descripcion
                                    ?? ingreso.tipoIngreso?.descripcion
                                    ?? ingreso.tipoIngresoCodigo
                                }
                            />
                            <DataItem
                                label="Número de Ingreso"
                                value={`${ingreso.tipoIngresoCodigo}-${ingreso.numeroIngreso}`}
                            />
                            <DataItem label="Fecha de Ingreso" value={formatearFechaHora(ingreso.fechaIngreso)} />
                            <DataItem label="Profesional Guardia" value={ingreso.profesionalGuardia?.nombre} />
                            {!esIngresoAmbulatorio && (
                                <DataItem label="Fecha de Egreso" value={formatearFecha(ingreso.fechaEgreso)} />
                            )}
                            {!ocultarEgresoPrevisto && (
                                <DataItem label="Egreso Previsto" value={formatearFecha(ingreso.fechaEgresoPrevista)} />
                            )}
                            {!esGuardia && (
                                <DataItem label="Profesional Tratante" value={profesionalTratanteNombre} />
                            )}
                            {!esGuardia && (
                                <DataItem
                                    label="Matrícula Tratante"
                                    value={profesionalTratanteMatricula ? String(profesionalTratanteMatricula) : null}
                                />
                            )}
                            <DataItem
                                label="Profesional Interviniente"
                                value={ingreso.profesionalInterviniente?.nombre}
                            />
                            {ingreso.cama && (
                                <DataItem
                                    label="Cama"
                                    value={`${ingreso.cama.identificador} (${ingreso.cama.sector}${ingreso.cama.habitacion ? ` · ${ingreso.cama.habitacion}` : ''})`}
                                />
                            )}
                        </dl>
                    )}
                </div>

                {/* Información específica del subtipo de admisión */}
                {ingreso.ingresoSubtipo && (() => {
                    const sub = ingreso.ingresoSubtipo!
                    const codigo = sub.subtipoAdmisionCodigo

                    if (codigo === 'DER') {
                        return (
                            <div className="his-card p-5 border-l-4 border-yellow-400">
                                <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
                                    Información de Derivación
                                </h3>
                                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                                    <DataItem label="Centro Derivante" value={sub.centroDerivante} />
                                    <DataItem label="Profesional Derivante" value={sub.profesionalDerivanteNombre} />
                                    <DataItem label="Motivo de Derivación" value={sub.motivoDerivacion} />
                                    <DataItem label="Diagnóstico de Derivación" value={sub.diagnosticoDerivacion} />
                                </dl>
                            </div>
                        )
                    }

                    if (codigo === 'TUR' || codigo === 'RAY' || codigo === 'PAM') {
                        const tieneDatosTurnoPractica = Boolean(sub.practicaCodigo?.trim() || sub.fechaTurno)
                        if (!tieneDatosTurnoPractica) return null

                        return (
                            <div className="his-card p-5 border-l-4 border-green-400">
                                <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
                                    Ingreso por Turno / Práctica
                                </h3>
                                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                                    <DataItem label="Código de Práctica" value={sub.practicaCodigo} />
                                    {sub.fechaTurno && (
                                        <DataItem label="Fecha de Turno" value={formatearFechaHora(sub.fechaTurno)} />
                                    )}
                                </dl>
                            </div>
                        )
                    }

                    if (codigo === 'IND') {
                        return (
                            <div className="his-card p-5 border-l-4 border-purple-400">
                                <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
                                    Indicación Médica
                                </h3>
                                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                                    <DataItem
                                        label="Profesional Interviniente"
                                        value={ingreso.profesionalInterviniente?.nombre ?? sub.profesionalIndicadorNombre}
                                    />
                                    <DataItem label="Tipo de Indicación" value={sub.tipoIndicacion} />
                                    <DataItem label="Descripción" value={sub.descripcionIndicacion} />
                                </dl>
                            </div>
                        )
                    }

                    return null
                })()}

                {/* Cobertura médica */}
                <div className="his-card p-5">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b">
                        <h3 className="text-sm font-semibold text-gray-700">Cobertura Médica</h3>
                        {puedeModificar && editingCard !== 'cobertura' && (
                            <button
                                onClick={() => {
                                    setEditingCard('cobertura');
                                    setCardValues({
                                        obraSocial: ingreso.obraSocial?.nombre || '',
                                        plan: ingreso.plan?.descripcion || '',
                                        numeroAfiliado: ingreso.numeroAfiliado || '',
                                    });
                                }}
                                className="ml-1 text-gray-400 hover:text-blue-600" title="Editar sección"
                            >
                                <Pencil className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    {editingCard === 'cobertura' ? (
                        <form
                            className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4"
                            onSubmit={async (e) => {
                                e.preventDefault();
                                setCardLoading(true);
                                setCardError(null);
                                try {
                                    await updateIngresoAction(ingreso.id, {
                                        numeroAfiliado: cardValues.numeroAfiliado,
                                        // Aquí deberías mapear a los IDs reales si corresponde
                                    });
                                    setEditingCard(null);
                                } catch (err) {
                                    setCardError('Error al guardar');
                                } finally {
                                    setCardLoading(false);
                                }
                            }}
                        >
                            <div>
                                <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Obra Social</dt>
                                <dd className="text-sm text-gray-900">
                                    <input
                                        type="text"
                                        className="border rounded px-2 py-1 w-full"
                                        value={cardValues.obraSocial}
                                        onChange={e => setCardValues((v: any) => ({ ...v, obraSocial: e.target.value }))}
                                        disabled={cardLoading}
                                    />
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Plan</dt>
                                <dd className="text-sm text-gray-900">
                                    <input
                                        type="text"
                                        className="border rounded px-2 py-1 w-full"
                                        value={cardValues.plan}
                                        onChange={e => setCardValues((v: any) => ({ ...v, plan: e.target.value }))}
                                        disabled={cardLoading}
                                    />
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Número de Afiliado</dt>
                                <dd className="text-sm text-gray-900">
                                    <input
                                        type="text"
                                        className="border rounded px-2 py-1 w-full"
                                        value={cardValues.numeroAfiliado}
                                        onChange={e => setCardValues((v: any) => ({ ...v, numeroAfiliado: e.target.value }))}
                                        disabled={cardLoading}
                                    />
                                </dd>
                            </div>
                            <div className="col-span-full flex gap-2 mt-2">
                                <button type="submit" className="text-green-600 border px-3 py-1 rounded" disabled={cardLoading}>Guardar</button>
                                <button type="button" className="text-gray-400 border px-3 py-1 rounded" onClick={() => setEditingCard(null)} disabled={cardLoading}>Cancelar</button>
                                {cardError && <span className="text-red-500 ml-2">{cardError}</span>}
                            </div>
                        </form>
                    ) : (
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                            <DataItem
                                label="Obra Social"
                                value={ingreso.obraSocial?.nombre ?? (ingreso.obraSocialId ? `ID ${ingreso.obraSocialId}` : null)}
                            />
                            <DataItem
                                label="Plan"
                                value={ingreso.plan?.descripcion ?? (ingreso.planId ? `ID ${ingreso.planId}` : null)}
                            />
                            <DataItem label="Número de Afiliado" value={ingreso.numeroAfiliado} />
                        </dl>
                    )}
                </div>

                {/* Diagnóstico inicial */}
                {(ingreso.descripcionPatologia || ingreso.descripcionPatologiaDefinitiva) && (
                    <div className="his-card p-5">
                        <div className="flex items-center justify-between mb-4 pb-2 border-b">
                            <h3 className="text-sm font-semibold text-gray-700">Diagnóstico</h3>
                            {puedeModificar && editingCard !== 'diagnostico' && (
                                <button
                                    onClick={() => {
                                        setEditingCard('diagnostico');
                                        setCardValues({
                                            descripcionPatologia: ingreso.descripcionPatologia || '',
                                            descripcionPatologiaDefinitiva: ingreso.descripcionPatologiaDefinitiva || '',
                                        });
                                    }}
                                    className="ml-1 text-gray-400 hover:text-blue-600" title="Editar sección"
                                >
                                    <Pencil className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                        {editingCard === 'diagnostico' ? (
                            <form
                                className="space-y-3"
                                onSubmit={async (e) => {
                                    e.preventDefault();
                                    setCardLoading(true);
                                    setCardError(null);
                                    try {
                                        await updateIngresoAction(ingreso.id, {
                                            descripcionPatologia: cardValues.descripcionPatologia,
                                            descripcionPatologiaDefinitiva: cardValues.descripcionPatologiaDefinitiva,
                                        });
                                        setEditingCard(null);
                                    } catch (err) {
                                        setCardError('Error al guardar');
                                    } finally {
                                        setCardLoading(false);
                                    }
                                }}
                            >
                                <div>
                                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Presuntivo</p>
                                    <input
                                        type="text"
                                        className="border rounded px-2 py-1 w-full"
                                        value={cardValues.descripcionPatologia}
                                        onChange={e => setCardValues((v: any) => ({ ...v, descripcionPatologia: e.target.value }))}
                                        disabled={cardLoading}
                                    />
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Definitivo</p>
                                    <input
                                        type="text"
                                        className="border rounded px-2 py-1 w-full"
                                        value={cardValues.descripcionPatologiaDefinitiva}
                                        onChange={e => setCardValues((v: any) => ({ ...v, descripcionPatologiaDefinitiva: e.target.value }))}
                                        disabled={cardLoading}
                                    />
                                </div>
                                <div className="flex gap-2 mt-2">
                                    <button type="submit" className="text-green-600 border px-3 py-1 rounded" disabled={cardLoading}>Guardar</button>
                                    <button type="button" className="text-gray-400 border px-3 py-1 rounded" onClick={() => setEditingCard(null)} disabled={cardLoading}>Cancelar</button>
                                    {cardError && <span className="text-red-500 ml-2">{cardError}</span>}
                                </div>
                            </form>
                        ) : (
                            <>
                                {ingreso.descripcionPatologia && (
                                    <div className="mb-3">
                                        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Presuntivo</p>
                                        <p className="text-sm text-gray-900">{ingreso.descripcionPatologia}</p>
                                    </div>
                                )}
                                {ingreso.descripcionPatologiaDefinitiva && (
                                    <div>
                                        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Definitivo</p>
                                        <p className="text-sm text-gray-900">{ingreso.descripcionPatologiaDefinitiva}</p>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* Diagnósticos registrados */}
                <div className="his-card p-5">
                    <div className="flex items-center justify-between mb-3 pb-2 border-b">
                        <h3 className="text-sm font-semibold text-gray-700">Diagnósticos</h3>
                        {puedeAgregarDiagnostico && (
                            <Link
                                href={`/dashboard/admision/${ingreso.id}/diagnostico`}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                            >
                                + Agregar diagnóstico
                            </Link>
                        )}
                    </div>
                    {ingreso.ingresoPatologias.length === 0 ? (
                        <p className="text-sm text-gray-400">Sin diagnósticos registrados.</p>
                    ) : (
                        <div className="space-y-2">
                            {ingreso.ingresoPatologias.map((d) => (
                                <div key={d.id} className="rounded-md bg-gray-50 px-3 py-2 text-sm">
                                    <p className="text-gray-900">{d.descripcion}</p>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        {formatearFechaHora(d.fecha)}
                                        {d.observaciones && ` · ${d.observaciones}`}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Prácticas realizadas */}
                <div className="his-card p-5">
                    <div className="flex items-center justify-between mb-3 pb-2 border-b gap-3 flex-wrap">
                        <h3 className="text-sm font-semibold text-gray-700">Prácticas realizadas</h3>
                        <div className="flex items-center gap-2">
                            {puedeModificar && (
                                <button
                                    onClick={() => setEditingCard('practicas')}
                                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                >
                                    + Agregar práctica
                                </button>
                            )}
                        </div>
                    </div>

                    {editingCard === 'practicas' && puedeModificar ? (
                        <PracticaIngresoForm
                            ingreso={ingreso}
                            practicasActuales={practicasIngreso}
                            onSuccess={() => {
                                setEditingCard(null)
                                void (async () => {
                                    await recargarPracticasIngreso()
                                })()
                            }}
                            onCancel={() => setEditingCard(null)}
                        />
                    ) : practicasIngreso.length === 0 ? (
                        <p className="text-sm text-gray-400">
                            Sin prácticas registradas para esta admisión.
                        </p>
                    ) : (
                        <div className="space-y-5">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <input
                                    type="text"
                                    value={filtroPracticas}
                                    onChange={(e) => setFiltroPracticas(e.target.value)}
                                    placeholder="Filtrar por código, descripción o autorización..."
                                    className="w-full sm:max-w-sm rounded-md border border-gray-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <p className="text-xs text-gray-500">
                                    {practicasPendientesFiltradas.length + practicasAutorizadasFiltradas.length}
                                    {' '}de {practicasIngreso.length}
                                </p>
                            </div>

                            <div>
                                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                                    Pendientes de autorización ({practicasPendientesFiltradas.length})
                                </p>
                                {puedeModificar && practicasPendientesFiltradas.length > 0 && (
                                    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-amber-200 bg-amber-50/70 p-3 text-xs">
                                        <label className="inline-flex items-center gap-2 text-amber-900">
                                            <input
                                                type="checkbox"
                                                checked={todasFiltradasSeleccionadas}
                                                onChange={(e) => alternarSeleccionTodas(e.target.checked)}
                                                disabled={eliminandoPracticas}
                                                className="h-4 w-4 rounded border-amber-300 text-amber-700 focus:ring-amber-500"
                                            />
                                            Seleccionar todas (filtro actual)
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => void generarOrdenesSeleccionadas(false)}
                                            disabled={generandoOrdenes || practicasSeleccionadas.length === 0}
                                            className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                        >
                                            {generandoOrdenes ? 'Generando...' : `Generar órdenes (${practicasSeleccionadas.length})`}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void generarOrdenesSeleccionadas(true)}
                                            disabled={generandoOrdenes || practicasSeleccionadas.length === 0}
                                            className="inline-flex items-center rounded-md border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                                        >
                                            Generar órdenes e imprimir
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (practicasSeleccionadas.length === 0) return
                                                setErrorEliminarPractica(null)
                                                setConfirmarEliminacionSeleccionadas(true)
                                            }}
                                            disabled={eliminandoPracticas || practicasSeleccionadas.length === 0}
                                            className="inline-flex items-center rounded-md border border-red-200 bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                        >
                                            Eliminar seleccionadas ({practicasSeleccionadas.length})
                                        </button>
                                    </div>
                                )}
                                {errorGenerarOrdenes && (
                                    <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
                                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                        <span>{errorGenerarOrdenes}</span>
                                    </div>
                                )}
                                {practicaEditando && (
                                    <form
                                        onSubmit={(e) => void guardarEdicionPractica(e)}
                                        className="mb-3 rounded-md border border-blue-200 bg-blue-50/60 p-3"
                                    >
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                                            <div>
                                                <label className="block text-[11px] text-gray-600 mb-1">Código</label>
                                                <input
                                                    type="text"
                                                    value={practicaEditando.codigoPractica.trim()}
                                                    disabled
                                                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-gray-100"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[11px] text-gray-600 mb-1">Cantidad</label>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    value={practicaEditando.cantidad}
                                                    onChange={(e) => setPracticaEditando((prev) => prev ? {
                                                        ...prev,
                                                        cantidad: Number(e.target.value) > 0 ? Number(e.target.value) : 1,
                                                    } : prev)}
                                                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[11px] text-gray-600 mb-1">N° autorización</label>
                                                <input
                                                    type="text"
                                                    value={practicaEditando.numeroAutorizacion ?? ''}
                                                    onChange={(e) => setPracticaEditando((prev) => prev ? {
                                                        ...prev,
                                                        numeroAutorizacion: e.target.value,
                                                    } : prev)}
                                                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                                                    placeholder="Opcional"
                                                />
                                            </div>
                                        </div>
                                        <div className="mt-2 flex items-center gap-2">
                                            <button
                                                type="submit"
                                                disabled={guardandoPracticaEditando}
                                                className="rounded-md border border-blue-200 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                                            >
                                                {guardandoPracticaEditando ? 'Guardando...' : 'Guardar edición'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setPracticaEditando(null)}
                                                disabled={guardandoPracticaEditando}
                                                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                            >
                                                Cancelar
                                            </button>
                                        </div>
                                    </form>
                                )}
                                {errorEliminarPractica && (
                                    <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
                                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                        <span>{errorEliminarPractica}</span>
                                    </div>
                                )}
                                {confirmarEliminacionSeleccionadas && practicasSeleccionadas.length > 0 && (
                                    <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3">
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="flex items-start gap-2 text-amber-900">
                                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                                <div>
                                                    <p className="text-sm font-semibold">
                                                        ¿Eliminar {practicasSeleccionadas.length} práctica(s) no autorizada(s)?
                                                    </p>
                                                    {seleccionadasFiltradas.slice(0, 3).map((p) => (
                                                        <p key={p.id} className="text-xs text-amber-800">
                                                            {p.codigoPractica.trim()} · {p.nomencladorPractica?.descripcion ?? p.codigoPractica.trim()}
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
                                                    onClick={() => void confirmarEliminarSeleccionadas()}
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
                                    <p className="text-sm text-gray-400">
                                        {practicasPendientes.length === 0
                                            ? 'No hay prácticas pendientes.'
                                            : 'No hay prácticas pendientes para este filtro.'}
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="text-left text-xs text-gray-400 uppercase tracking-wider">
                                                        {puedeModificar && <th className="pb-2 pr-3">Sel.</th>}
                                                        <th className="pb-2 pr-4">Código</th>
                                                        <th className="pb-2 pr-4">Descripción</th>
                                                        <th className="pb-2 pr-4">Fecha</th>
                                                        <th className="pb-2">N° Autorización</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {practicasPendientesPaginadas.map((p) => {
                                                        return (
                                                        <tr
                                                            key={p.id}
                                                            className="hover:bg-amber-50/40"
                                                        >
                                                            {puedeModificar && (
                                                                <td className="py-2 pr-3">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={practicasSeleccionadas.includes(p.id)}
                                                                        onChange={(e) => alternarSeleccionPractica(p.id, e.target.checked)}
                                                                        disabled={eliminandoPracticas}
                                                                        className="h-4 w-4 rounded border-gray-300 text-amber-700 focus:ring-amber-500"
                                                                    />
                                                                </td>
                                                            )}
                                                            <td className="py-2 pr-4 font-mono text-xs text-gray-700">
                                                                {p.codigoPractica.trim()}
                                                            </td>
                                                            <td className="py-2 pr-4 text-gray-700">
                                                                {p.nomencladorPractica?.descripcion ?? p.codigoPractica.trim()}
                                                            </td>
                                                            <td className="py-2 pr-4 text-gray-500">
                                                                {formatearFechaHora(p.fecha)}
                                                            </td>
                                                            <td className="py-2 text-gray-700">{p.numeroAutorizacion ?? '-'}</td>
                                                        </tr>
                                                    )})}
                                                </tbody>
                                            </table>
                                        </div>
                                        {practicasPendientesFiltradas.length > PRACTICAS_POR_PAGINA && (
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
                                )}
                            </div>

                            <div>
                                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                    Ya autorizadas ({ordenesAutorizadasFiltradas.length})
                                </p>
                                {ordenesAutorizadasFiltradas.length === 0 ? (
                                    <p className="text-sm text-gray-400">
                                        {practicasAutorizadas.length === 0
                                            ? 'No hay prácticas autorizadas.'
                                            : 'No hay prácticas autorizadas para este filtro.'}
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {ordenesAutorizadasPaginadas.map((grupo) => {
                                            const destinoAutorizada = obtenerDestinoGrupoPracticasAutorizadas(grupo)
                                            const destinoOrdenImpresion =
                                                grupo.tipo === 'orden' && grupo.puestoNumero && grupo.ordenNumero
                                                    ? `/dashboard/ambulatorio/imprimir?ordenes=${encodeURIComponent(`${grupo.puestoNumero}-${grupo.ordenNumero}`)}`
                                                    : null
                                            const destinoAbrir = destinoOrdenImpresion ?? destinoAutorizada
                                            const limitePracticas = 3
                                            const abierta = ordenesAutorizadasAbiertas[grupo.key] ?? false
                                            const expandida = ordenesAutorizadasExpandidas[grupo.key] ?? false
                                            const practicasVisibles = expandida
                                                ? grupo.practicas
                                                : grupo.practicas.slice(0, limitePracticas)
                                            const restantes = Math.max(0, grupo.practicas.length - practicasVisibles.length)
                                            const codigosConCantidad = Array.from(
                                                grupo.practicas.reduce((mapa, practica) => {
                                                    const codigo = practica.codigoPractica.trim()
                                                    if (!codigo) return mapa

                                                    const cantidad = Number.isFinite(Number(practica.cantidad)) && Number(practica.cantidad) > 0
                                                        ? Number(practica.cantidad)
                                                        : 1
                                                    mapa.set(codigo, (mapa.get(codigo) ?? 0) + cantidad)
                                                    return mapa
                                                }, new Map<string, number>())
                                            ).map(([codigo, cantidad]) => `${codigo} x${cantidad}`)
                                            const codigosResumen = codigosConCantidad.slice(0, 4).join(', ')
                                            const codigosRestantes = Math.max(0, codigosConCantidad.length - 4)
                                            const tituloGrupo = grupo.tipo === 'orden' && grupo.puestoNumero && grupo.ordenNumero
                                                ? `Orden ${formatearNumeroOrden(grupo.puestoNumero, grupo.ordenNumero)}`
                                                : `Autorización ${grupo.numeroAutorizacion ?? '-'}`

                                            return (
                                                <div
                                                    key={grupo.key}
                                                    className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2"
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => setOrdenesAutorizadasAbiertas((prev) => ({
                                                            ...prev,
                                                            [grupo.key]: !(prev[grupo.key] ?? false),
                                                        }))}
                                                        className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-0 text-left hover:bg-emerald-100/40"
                                                    >
                                                        <span className="flex min-w-0 items-center gap-2 text-emerald-900">
                                                            <ChevronRight className={`h-4 w-4 transition-transform ${abierta ? 'rotate-90' : ''}`} />
                                                            <span className="shrink-0 text-xs font-semibold">{tituloGrupo}</span>
                                                            <span className="min-w-0 truncate text-[10px] text-emerald-700">
                                                                Cod/Cant: {codigosResumen}{codigosRestantes > 0 ? ` +${codigosRestantes}` : ''}
                                                            </span>
                                                        </span>
                                                        <span className="text-[11px] text-emerald-700">{grupo.practicas.length} práctica(s)</span>
                                                    </button>

                                                    {abierta && (
                                                        <div className="mt-1.5 grid gap-2 md:grid-cols-2">
                                                            <div className="space-y-1.5 text-xs text-emerald-900">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    {destinoAbrir && (
                                                                        <Link
                                                                            href={destinoAbrir}
                                                                            target={destinoOrdenImpresion ? '_blank' : undefined}
                                                                            rel={destinoOrdenImpresion ? 'noopener noreferrer' : undefined}
                                                                            className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-900 hover:bg-emerald-200"
                                                                        >
                                                                            {destinoOrdenImpresion ? 'Abrir orden' : 'Abrir'}
                                                                        </Link>
                                                                    )}
                                                                    {puedeModificar && grupo.practicas.some((practica) => !Boolean(practica.facturada)) && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                const editable = grupo.practicas.find((practica) => !Boolean(practica.facturada))
                                                                                if (editable) {
                                                                                    setPracticaEditando({
                                                                                        ...editable,
                                                                                        numeroAutorizacion: grupo.numeroAutorizacion ?? editable.numeroAutorizacion ?? '',
                                                                                    })
                                                                                }
                                                                            }}
                                                                            className="inline-flex items-center rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-50"
                                                                        >
                                                                            Editar práctica
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                <p className="text-emerald-800">N° autorización: {grupo.numeroAutorizacion ?? '-'}</p>
                                                                <p className="text-emerald-800">Fecha última práctica: {formatearFechaHora(grupo.fechaReferencia)}</p>
                                                                <p className="text-emerald-800">Cantidad total: {grupo.totalCantidad}</p>
                                                                <p className="text-emerald-800">
                                                                    {grupo.matriculasFirmantes.length > 1
                                                                        ? 'Matrículas firmantes'
                                                                        : 'Matrícula firmante'}: {grupo.matriculasFirmantes.length > 0 ? grupo.matriculasFirmantes.join(', ') : '-'}
                                                                </p>
                                                            </div>

                                                            <div className="rounded-md border border-emerald-200 bg-white/70 p-1.5">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                                                        Prácticas de la orden ({grupo.practicas.length})
                                                                    </p>
                                                                    {grupo.practicas.length > limitePracticas && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setOrdenesAutorizadasExpandidas((prev) => ({
                                                                                ...prev,
                                                                                [grupo.key]: !(prev[grupo.key] ?? false),
                                                                            }))}
                                                                            className="rounded border border-emerald-300 px-2 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-50"
                                                                        >
                                                                            {expandida ? 'Contraer' : 'Expandir'}
                                                                        </button>
                                                                    )}
                                                                </div>

                                                                <div className="mt-1.5 space-y-1 text-xs">
                                                                    {practicasVisibles.map((practica) => (
                                                                        <div
                                                                            key={`${grupo.key}-${practica.id}`}
                                                                            className="rounded border border-emerald-100 bg-white px-2 py-1"
                                                                        >
                                                                            <div className="flex items-center justify-between gap-2 text-emerald-900">
                                                                                <span className="font-mono text-[11px]">{practica.codigoPractica.trim()}</span>
                                                                                <span className="font-medium">Cant. {practica.cantidad}</span>
                                                                            </div>
                                                                            <p className="text-emerald-900">
                                                                                {practica.descripcionPractica ?? practica.codigoPractica.trim()}
                                                                            </p>
                                                                            <p className="text-[11px] text-emerald-700">{formatearFechaHora(practica.fecha)}</p>
                                                                        </div>
                                                                    ))}
                                                                </div>

                                                                {!expandida && restantes > 0 && (
                                                                    <p className="mt-1 text-[11px] text-emerald-700">+{restantes} práctica(s) más</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                        {ordenesAutorizadasFiltradas.length > PRACTICAS_POR_PAGINA && (
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
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Observaciones */}
                {ingreso.tipoIngresoCodigo === 'INT' ? (
                    <ObservacionesSection
                        ingresoId={ingreso.id}
                        observacionesIniciales={ingreso.observaciones ?? null}
                        puedeModificar={puedeModificar}
                    />
                ) : (
                    observacionesLimpias && (
                        <div className="his-card p-5">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-sm font-semibold text-gray-700">Observaciones</h3>
                                {puedeModificar && editingCard !== 'observaciones' && (
                                    <button
                                        onClick={() => {
                                            setEditingCard('observaciones');
                                            setCardValues({ observaciones: observacionesLimpias });
                                        }}
                                        className="ml-1 text-gray-400 hover:text-blue-600" title="Editar sección"
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                            {editingCard === 'observaciones' ? (
                                <form
                                    onSubmit={async (e) => {
                                        e.preventDefault();
                                        setCardLoading(true);
                                        setCardError(null);
                                        try {
                                            await updateIngresoAction(ingreso.id, { observaciones: cardValues.observaciones });
                                            setEditingCard(null);
                                        } catch (err) {
                                            setCardError('Error al guardar');
                                        } finally {
                                            setCardLoading(false);
                                        }
                                    }}
                                >
                                    <textarea
                                        className="border rounded px-2 py-1 w-full text-sm"
                                        rows={4}
                                        value={cardValues.observaciones}
                                        onChange={e => setCardValues((v: any) => ({ ...v, observaciones: e.target.value }))}
                                        disabled={cardLoading}
                                    />
                                    <div className="flex gap-2 mt-2">
                                        <button type="submit" className="text-green-600 border px-3 py-1 rounded" disabled={cardLoading}>Guardar</button>
                                        <button type="button" className="text-gray-400 border px-3 py-1 rounded" onClick={() => setEditingCard(null)} disabled={cardLoading}>Cancelar</button>
                                        {cardError && <span className="text-red-500 ml-2">{cardError}</span>}
                                    </div>
                                </form>
                            ) : (
                                <p className="text-sm text-gray-600 whitespace-pre-line">
                                    {observacionesLimpias}
                                </p>
                            )}
                        </div>
                    )
                )}
            </div>

            {/* Contenido imprimible — solo visible al imprimir */}
            <FichaAdmisionPrint ingreso={ingreso} />
        </div>
    )
}