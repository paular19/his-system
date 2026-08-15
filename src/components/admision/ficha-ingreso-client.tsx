'use client'

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { updateIngresoAction } from '@/modules/admision/actions'
import { ChevronRight, ChevronDown, ChevronUp, User, FileText, Printer, Loader2, AlertTriangle, Ban, Trash2, Pencil } from 'lucide-react'
import Link from 'next/link'
import { formatearFecha, formatearFechaHora, formatearFechaCalendario, calcularEdad } from '@/lib/utils'
import { FichaAdmisionPrint } from './ficha-admision-print'
import {
    SeccionCobertura,
    SeccionDatosAdmision,
    SeccionDiagnostico,
    SeccionObservaciones,
    SeccionResponsable,
    SeccionSubtipo,
} from './ficha-secciones'
import {
    PracticaEdicionForm,
    PracticasEdicionMasiva,
    type PracticaEditable,
} from './practica-edicion-form'
import { PracticaIngresoForm } from './practica-ingreso-form'
import { generarOrdenesPendientesAdmision } from './ordenes-auto'
import type { IngresoDetalle } from '@/modules/admision/types'
import { formatearNumeroOrden } from '@/modules/orden/types'
import { anularOrdenAction } from '@/modules/orden/actions'
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
    autoGenerarOrdenesInicial?: boolean
    autoImprimirInicial?: boolean
    autoSepararInicial?: boolean
    ventanaImpresionNombreInicial?: string | null
}

type GeneracionOrdenTask = {
    practicaIds: number[]
    imprimirDespues: boolean
    separarPorPractica?: boolean
    ventanaImpresionInicial?: Window | null
}

type ModalEliminarAdmision = {
    tipo: 'confirmar' | 'bloqueada'
    mensaje: string
}

type VerificacionEliminacionAdmision = {
    existe: boolean
    puedeEliminar: boolean
    motivos: string[]
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

function normalizarNumeroAutorizacion(value: string | null | undefined): string | null {
    const normalizada = value?.trim() ?? ''
    return normalizada.length > 0 ? normalizada : null
}

function grupoTieneNumeroAutorizacion(grupo: { numeroAutorizacion: string | null }): boolean {
    return normalizarNumeroAutorizacion(grupo.numeroAutorizacion) != null
}

function manejarNavegacionCompletaInterna(event: ReactMouseEvent<HTMLAnchorElement>, href: string) {
    if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
    ) {
        return
    }

    event.preventDefault()
    window.location.assign(href)
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
    autoGenerarOrdenesInicial = false,
    autoImprimirInicial = false,
    autoSepararInicial = false,
    ventanaImpresionNombreInicial = null,
}: FichaIngresoClientProps) {
    const router = useRouter()
    const fechaNacimientoPaciente = ingreso.paciente?.fechaNacimiento ?? ingreso.fechaNacimiento
    const edad = fechaNacimientoPaciente ? calcularEdad(fechaNacimientoPaciente) : null

    // Card de practicas: la unica seccion que sigue usando el toggle manual.
    const [editingCard, setEditingCard] = useState<string | null>(null)
    // Cambios guardados desde las secciones, para reflejarlos en el imprimible sin recargar.
    const [ingresoOverrides, setIngresoOverrides] = useState<Partial<IngresoDetalle>>({})
    const [practicasIngreso, setPracticasIngreso] = useState(ingreso.practicas)
    const [estadoIngreso, setEstadoIngreso] = useState((ingreso.estado ?? '').trim().toUpperCase())
    const [anulandoAdmision, setAnulandoAdmision] = useState(false)
    const [errorAnularAdmision, setErrorAnularAdmision] = useState<string | null>(null)
    const [verificandoEliminacionAdmision, setVerificandoEliminacionAdmision] = useState(false)
    const [eliminandoAdmision, setEliminandoAdmision] = useState(false)
    const [modalEliminarAdmision, setModalEliminarAdmision] = useState<ModalEliminarAdmision | null>(null)
    const [filtroPracticas, setFiltroPracticas] = useState('')
    const [paginaPendientes, setPaginaPendientes] = useState(1)
    const [paginaAutorizadas, setPaginaAutorizadas] = useState(1)
    const [practicasSeleccionadas, setPracticasSeleccionadas] = useState<number[]>([])
    const [confirmarEliminacionSeleccionadas, setConfirmarEliminacionSeleccionadas] = useState(false)
    const [eliminandoPracticas, setEliminandoPracticas] = useState(false)
    const [tareasGeneracionPendientes, setTareasGeneracionPendientes] = useState(0)
    const [practicaIdsEnGeneracion, setPracticaIdsEnGeneracion] = useState<number[]>([])
    const [errorEliminarPractica, setErrorEliminarPractica] = useState<string | null>(null)
    const [errorGenerarOrdenes, setErrorGenerarOrdenes] = useState<string | null>(null)
    const [practicaEditando, setPracticaEditando] = useState<PracticaEditable | null>(null)
    const [grupoPracticaEditando, setGrupoPracticaEditando] = useState<{
        practicas: PracticaEditable[]
        titulo: string | null
    } | null>(null)
    const [edicionMasivaAbierta, setEdicionMasivaAbierta] = useState(false)
    const [anulandoOrdenKey, setAnulandoOrdenKey] = useState<string | null>(null)
    const [ordenesAutorizadasAbiertas, setOrdenesAutorizadasAbiertas] = useState<Record<string, boolean>>({})
    const [ordenesAutorizadasExpandidas, setOrdenesAutorizadasExpandidas] = useState<Record<string, boolean>>({})
    const [mostrarOrdenesPendientesAutorizacion, setMostrarOrdenesPendientesAutorizacion] = useState(true)
    const [mostrarOrdenesYaAutorizadas, setMostrarOrdenesYaAutorizadas] = useState(true)
    const colaGeneracionRef = useRef<Promise<void>>(Promise.resolve())
    const practicaIdsEnGeneracionRef = useRef<Set<number>>(new Set())
    const autoGeneracionInicialEjecutadaRef = useRef(false)
    const hayGeneracionesEnBackground = tareasGeneracionPendientes > 0
    const terminoFiltroPracticas = normalizarTexto(filtroPracticas)

    const practicaIdsEnGeneracionSet = useMemo(
        () => new Set(practicaIdsEnGeneracion),
        [practicaIdsEnGeneracion]
    )

    const practicasPendientes = practicasIngreso.filter(
        (p) => (p.ordenPractica?.length ?? 0) === 0 && !practicaIdsEnGeneracionSet.has(p.id)
    )
    const practicasAutorizadas = practicasIngreso.filter(
        (p) => (p.ordenPractica?.length ?? 0) > 0
    )

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

    const ordenesPendientesAutorizacion = useMemo(
        () => ordenesAutorizadasFiltradas.filter((grupo) => !grupoTieneNumeroAutorizacion(grupo)).length,
        [ordenesAutorizadasFiltradas]
    )

    const ordenesYaAutorizadas = useMemo(
        () => ordenesAutorizadasFiltradas.filter((grupo) => grupoTieneNumeroAutorizacion(grupo)).length,
        [ordenesAutorizadasFiltradas]
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

    const ordenesAutorizadasPaginadasVisibles = useMemo(
        () =>
            ordenesAutorizadasPaginadas.filter((grupo) => {
                const yaAutorizada = grupoTieneNumeroAutorizacion(grupo)
                return yaAutorizada ? mostrarOrdenesYaAutorizadas : mostrarOrdenesPendientesAutorizacion
            }),
        [
            ordenesAutorizadasPaginadas,
            mostrarOrdenesPendientesAutorizacion,
            mostrarOrdenesYaAutorizadas,
        ]
    )

    useEffect(() => {
        setPaginaPendientes(1)
        setPaginaAutorizadas(1)
    }, [filtroPracticas])

    useEffect(() => {
        setPracticasIngreso(ingreso.practicas)
    }, [ingreso.practicas])

    useEffect(() => {
        setEstadoIngreso((ingreso.estado ?? '').trim().toUpperCase())
    }, [ingreso.estado])

    // Los datos que llegan del server ya traen los cambios: se descartan los overrides locales.
    useEffect(() => {
        setIngresoOverrides({})
    }, [ingreso])

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
        ['TUR', 'RAY', 'CUR', 'SUT', 'ECG', 'ECO', 'QAM', 'PAM'].includes(
            ingreso.ingresoSubtipo?.subtipoAdmisionCodigo ?? ''
        )
    const destinoPracticasInternacion = `/dashboard/internacion/${ingreso.id}/practicas`
    const destinoCirugiaInternacion = `/dashboard/internacion/${ingreso.id}#internacion-cirugia`
    const ocultarEgresoPrevisto =
        esPracticaAmbulatoria ||
        ['GUA', 'DER', 'IND'].includes(ingreso.ingresoSubtipo?.subtipoAdmisionCodigo ?? '')

    /** Ingreso con los cambios recien guardados aplicados (para el imprimible y las prácticas). */
    const ingresoVista = useMemo<IngresoDetalle>(
        () => ({ ...ingreso, ...ingresoOverrides }),
        [ingreso, ingresoOverrides]
    )

    const registrarCambioSeccion = (parcial: Partial<IngresoDetalle>) => {
        setIngresoOverrides((prev) => ({ ...prev, ...parcial }))
        if (parcial.estado !== undefined) {
            setEstadoIngreso((parcial.estado ?? '').trim().toUpperCase())
        }
    }

    const anularAdmision = async () => {
        const confirmar = window.confirm(
            `Se anulará la admisión ${ingreso.tipoIngresoCodigo}-${ingreso.numeroIngreso}. ¿Desea continuar?`
        )
        if (!confirmar) return

        setAnulandoAdmision(true)
        setErrorAnularAdmision(null)
        try {
            await updateIngresoAction(ingreso.id, { estado: 'X' })
            setEstadoIngreso('X')
            setIngresoOverrides((prev) => ({ ...prev, estado: 'X' }))
            setEditingCard(null)
            router.refresh()
        } catch (error) {
            setErrorAnularAdmision(
                error instanceof Error && error.message.trim().length > 0
                    ? error.message
                    : 'No se pudo anular la admisión'
            )
        } finally {
            setAnulandoAdmision(false)
        }
    }

    const abrirEliminacionAdmision = async () => {
        setVerificandoEliminacionAdmision(true)
        try {
            const response = await fetch(`/api/admision/${ingreso.id}?verificarEliminacion=1`, {
                cache: 'no-store',
            })
            const resultado = await response.json() as {
                data?: VerificacionEliminacionAdmision
                error?: string
            }

            if (!response.ok || !resultado.data) {
                throw new Error(resultado.error ?? 'No se pudo verificar la admisión')
            }

            if (resultado.data.puedeEliminar) {
                setModalEliminarAdmision({
                    tipo: 'confirmar',
                    mensaje: 'Esta acción es irreversible. La admisión se eliminará definitivamente.',
                })
                return
            }

            setModalEliminarAdmision({
                tipo: 'bloqueada',
                mensaje: `No se puede eliminar la admisión porque tiene elementos vinculados: ${resultado.data.motivos.join(', ')}.`,
            })
        } catch (error) {
            setModalEliminarAdmision({
                tipo: 'bloqueada',
                mensaje: error instanceof Error ? error.message : 'No se pudo verificar la admisión.',
            })
        } finally {
            setVerificandoEliminacionAdmision(false)
        }
    }

    const confirmarEliminacionAdmision = async () => {
        setEliminandoAdmision(true)
        try {
            const response = await fetch(`/api/admision/${ingreso.id}`, { method: 'DELETE' })
            const resultado = await response.json() as { error?: string }

            if (!response.ok) {
                setModalEliminarAdmision({
                    tipo: 'bloqueada',
                    mensaje: resultado.error ?? 'No se pudo eliminar la admisión.',
                })
                return
            }

            setModalEliminarAdmision(null)
            router.push('/dashboard/admision')
            router.refresh()
        } catch {
            setModalEliminarAdmision({
                tipo: 'bloqueada',
                mensaje: 'No se pudo eliminar la admisión. Intentá nuevamente.',
            })
        } finally {
            setEliminandoAdmision(false)
        }
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

    const ejecutarGeneracionOrdenesTask = async (task: GeneracionOrdenTask) => {
        const ventanaImpresion = task.imprimirDespues
            ? (task.ventanaImpresionInicial ?? abrirVentanaImpresionPendiente())
            : null
        let impresionDisparada = false

        try {
            const result = await generarOrdenesPendientesAdmision(ingreso.id, {
                idsPendientesConfirmados: task.practicaIds,
                separarPorPractica: task.separarPorPractica,
            })

            if (!result.ok) {
                setErrorGenerarOrdenes(result.error)
                return
            }

            await recargarPracticasIngreso()
            setPracticasSeleccionadas((prev) => prev.filter((id) => !task.practicaIds.includes(id)))

            if (task.imprimirDespues && result.ordenes.length > 0) {
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
        }
    }

    const encolarGeneracionOrdenes = (
        imprimirDespues: boolean,
        practicaIdsOverride?: number[],
        separarPorPractica?: boolean,
        ventanaImpresionInicial?: Window | null
    ) => {
        const seleccionBase = practicaIdsOverride ?? practicasSeleccionadas
        const permitirIdsNoCargados = Array.isArray(practicaIdsOverride)
        const practicaIds = Array.from(new Set(seleccionBase)).filter((id) => {
            if (practicaIdsEnGeneracionRef.current.has(id)) return false
            const practica = practicasIngreso.find((item) => item.id === id)
            if (!practica) return permitirIdsNoCargados
            return (practica.ordenPractica?.length ?? 0) === 0
        })

        if (practicaIds.length === 0) {
            setErrorGenerarOrdenes('No hay prácticas pendientes disponibles para generar órdenes')
            return
        }

        const task: GeneracionOrdenTask = {
            practicaIds,
            imprimirDespues,
            separarPorPractica,
            ventanaImpresionInicial,
        }

        setErrorGenerarOrdenes(null)

        task.practicaIds.forEach((id) => practicaIdsEnGeneracionRef.current.add(id))
        setPracticaIdsEnGeneracion((prev) => Array.from(new Set([...prev, ...task.practicaIds])))
        setPracticasSeleccionadas((prev) => prev.filter((id) => !task.practicaIds.includes(id)))
        setTareasGeneracionPendientes((prev) => prev + 1)

        colaGeneracionRef.current = colaGeneracionRef.current
            .catch(() => undefined)
            .then(async () => {
                try {
                    await ejecutarGeneracionOrdenesTask(task)
                } finally {
                    task.practicaIds.forEach((id) => practicaIdsEnGeneracionRef.current.delete(id))
                    setPracticaIdsEnGeneracion((prev) => prev.filter((id) => !task.practicaIds.includes(id)))
                    setTareasGeneracionPendientes((prev) => Math.max(0, prev - 1))
                }
            })
    }

    const generarOrdenesSeleccionadas = (imprimirDespues: boolean) => {
        encolarGeneracionOrdenes(imprimirDespues)
    }

    const handleAnularOrdenDesdeGrupo = async (puestoNumero: number, ordenNumero: number, grupoKey: string) => {
        if (typeof window !== 'undefined') {
            const confirmar = window.confirm(
                `Se anulara la orden ${formatearNumeroOrden(puestoNumero, ordenNumero)}. Desea continuar?`
            )
            if (!confirmar) return
        }

        setErrorGenerarOrdenes(null)
        setAnulandoOrdenKey(grupoKey)

        try {
            const result = await anularOrdenAction(puestoNumero, ordenNumero)
            if ('error' in result && result.error) {
                setErrorGenerarOrdenes(result.error)
                return
            }

            await recargarPracticasIngreso()
        } catch {
            setErrorGenerarOrdenes('Error al anular la orden')
        } finally {
            setAnulandoOrdenKey(null)
        }
    }

    useEffect(() => {
        if (!autoGenerarOrdenesInicial) return
        if (autoGeneracionInicialEjecutadaRef.current) return
        autoGeneracionInicialEjecutadaRef.current = true

        const urlActual = new URL(window.location.href)
        urlActual.searchParams.delete('autoGen')
        urlActual.searchParams.delete('autoPrint')
        urlActual.searchParams.delete('autoSep')
        urlActual.searchParams.delete('printWin')
        window.history.replaceState(window.history.state, '', `${urlActual.pathname}${urlActual.search}${urlActual.hash}`)

        const idsPendientes = (ingreso.practicas ?? [])
            .filter((p) => (p.ordenPractica?.length ?? 0) === 0)
            .map((p) => p.id)

        if (idsPendientes.length === 0) return

        const ventanaInicial = autoImprimirInicial && ventanaImpresionNombreInicial
            ? window.open('', ventanaImpresionNombreInicial)
            : null

        encolarGeneracionOrdenes(
            autoImprimirInicial,
            idsPendientes,
            autoSepararInicial,
            ventanaInicial
        )
    }, [
        autoGenerarOrdenesInicial,
        autoImprimirInicial,
        autoSepararInicial,
        ventanaImpresionNombreInicial,
        ingreso.practicas,
    ])

    const cerrarEdicionPractica = async () => {
        await recargarPracticasIngreso()
        setPracticaEditando(null)
        setGrupoPracticaEditando(null)
    }

    const cerrarEdicionMasiva = async () => {
        await recargarPracticasIngreso()
        setEdicionMasivaAbierta(false)
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
                            <span className="font-mono font-semibold text-gray-800">
                                HC {ingreso.paciente?.historiaClinica ?? '—'}
                            </span>
                            {ingreso.fechaIngreso && (
                                <span>Ingresado: {formatearFechaHora(ingreso.fechaIngreso)}</span>
                            )}
                            {estadoIngreso && (
                                <span className={BADGE_ESTADO[estadoIngreso] ?? 'his-badge-inactivo'}>
                                    {LABEL_ESTADO[estadoIngreso] ?? estadoIngreso}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2 shrink-0 print:hidden">
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
                        {puedeModificar && estadoIngreso !== 'X' && (
                            <button
                                type="button"
                                onClick={anularAdmision}
                                disabled={anulandoAdmision}
                                className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {anulandoAdmision ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Ban className="h-4 w-4" />
                                )}
                                {anulandoAdmision ? 'Anulando...' : 'Anular admisión'}
                            </button>
                        )}
                        {puedeModificar && (
                            <button
                                type="button"
                                onClick={abrirEliminacionAdmision}
                                disabled={verificandoEliminacionAdmision || eliminandoAdmision}
                                className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {verificandoEliminacionAdmision ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Trash2 className="h-4 w-4" />
                                )}
                                {verificandoEliminacionAdmision ? 'Verificando...' : 'Eliminar'}
                            </button>
                        )}
                    </div>
                </div>

                {errorAnularAdmision && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {errorAnularAdmision}
                    </div>
                )}

                {modalEliminarAdmision && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="eliminar-admision-titulo"
                    >
                        <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
                            <div className="flex items-center gap-2 border-b px-4 py-3">
                                <AlertTriangle className="h-5 w-5 text-red-600" />
                                <h3 id="eliminar-admision-titulo" className="text-sm font-semibold text-gray-900">
                                    {modalEliminarAdmision.tipo === 'confirmar'
                                        ? 'Eliminar admisión'
                                        : 'No se puede eliminar'}
                                </h3>
                            </div>
                            <div className="px-4 py-4 text-sm text-gray-700">
                                <p>{modalEliminarAdmision.mensaje}</p>
                            </div>
                            <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
                                <button
                                    type="button"
                                    onClick={() => setModalEliminarAdmision(null)}
                                    disabled={eliminandoAdmision}
                                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                >
                                    {modalEliminarAdmision.tipo === 'confirmar' ? 'Cancelar' : 'Cerrar'}
                                </button>
                                {modalEliminarAdmision.tipo === 'confirmar' && (
                                    <button
                                        type="button"
                                        onClick={confirmarEliminacionAdmision}
                                        disabled={eliminandoAdmision}
                                        className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                    >
                                        {eliminandoAdmision ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="h-4 w-4" />
                                        )}
                                        {eliminandoAdmision ? 'Eliminando...' : 'Eliminar definitivamente'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Datos del paciente */}
                <div className="his-card p-5">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b">
                        <h3 className="text-sm font-semibold text-gray-700">Datos del Paciente</h3>
                        {ingreso.pacienteId && (
                            <Link
                                href={`/dashboard/pacientes/${ingreso.pacienteId}`}
                                prefetch={false}
                                onClick={(event) => manejarNavegacionCompletaInterna(
                                    event,
                                    `/dashboard/pacientes/${ingreso.pacienteId}`
                                )}
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
                            label="Historia Clínica"
                            value={ingreso.paciente?.historiaClinica?.toString() ?? '—'}
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

                <SeccionDatosAdmision
                    ingreso={ingreso}
                    puedeModificar={puedeModificar}
                    onGuardado={registrarCambioSeccion}
                    esIngresoAmbulatorio={esIngresoAmbulatorio}
                    esGuardia={esGuardia}
                    ocultarEgresoPrevisto={ocultarEgresoPrevisto}
                    profesionalTratanteNombre={profesionalTratanteNombre}
                    profesionalTratanteMatricula={profesionalTratanteMatricula}
                />

                <SeccionResponsable
                    ingreso={ingreso}
                    puedeModificar={puedeModificar}
                    onGuardado={registrarCambioSeccion}
                />

                <SeccionSubtipo ingreso={ingreso} puedeModificar={puedeModificar} />

                <SeccionCobertura
                    ingreso={ingreso}
                    puedeModificar={puedeModificar}
                    onGuardado={registrarCambioSeccion}
                />

                <SeccionDiagnostico
                    ingreso={ingreso}
                    puedeModificar={puedeModificar}
                    onGuardado={registrarCambioSeccion}
                />

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
                            {puedeModificar && ingreso.tipoIngresoCodigo === 'INT' ? (
                                <>
                                    <Link
                                        href={destinoPracticasInternacion}
                                        prefetch={false}
                                        onClick={(event) => manejarNavegacionCompletaInterna(event, destinoPracticasInternacion)}
                                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                    >
                                        + Agregar práctica
                                    </Link>
                                    <Link
                                        href={destinoCirugiaInternacion}
                                        prefetch={false}
                                        onClick={(event) => manejarNavegacionCompletaInterna(event, destinoCirugiaInternacion)}
                                        className="text-xs text-emerald-600 hover:text-emerald-800 font-medium"
                                    >
                                        + Nueva cirugía
                                    </Link>
                                </>
                            ) : puedeModificar ? (
                                <button
                                    onClick={() => setEditingCard('practicas')}
                                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                >
                                    + Agregar práctica
                                </button>
                            ) : null}
                        </div>
                    </div>

                    {editingCard === 'practicas' && puedeModificar ? (
                        <PracticaIngresoForm
                            ingreso={ingresoVista}
                            onEncolarGeneracionOrdenes={(task) => {
                                encolarGeneracionOrdenes(
                                    task.imprimirDespues,
                                    task.practicaIds,
                                    task.separarPorPractica,
                                    task.ventanaImpresionInicial
                                )
                            }}
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
                            {hayGeneracionesEnBackground && (
                                <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                                    Generando órdenes en segundo plano: {tareasGeneracionPendientes} tarea(s) en cola. Podés seguir trabajando sin esperar.
                                </p>
                            )}

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
                                            disabled={practicasSeleccionadas.length === 0}
                                            className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                        >
                                            {`Generar órdenes (${practicasSeleccionadas.length})`}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void generarOrdenesSeleccionadas(true)}
                                            disabled={practicasSeleccionadas.length === 0}
                                            className="inline-flex items-center rounded-md border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                                        >
                                            Generar órdenes e imprimir
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (practicasSeleccionadas.length === 0) return
                                                setPracticaEditando(null)
                                                setGrupoPracticaEditando(null)
                                                setEdicionMasivaAbierta(true)
                                            }}
                                            disabled={practicasSeleccionadas.length === 0}
                                            className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                            Editar seleccionadas ({practicasSeleccionadas.length})
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
                                {edicionMasivaAbierta && practicasSeleccionadas.length > 0 && (
                                    <PracticasEdicionMasiva
                                        ingresoId={ingreso.id}
                                        practicas={practicasIngreso.filter((p) =>
                                            practicasSeleccionadas.includes(p.id)
                                        ) as PracticaEditable[]}
                                        onListo={cerrarEdicionMasiva}
                                        onCancelar={() => setEdicionMasivaAbierta(false)}
                                    />
                                )}
                                {errorGenerarOrdenes && (
                                    <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
                                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                        <span>{errorGenerarOrdenes}</span>
                                    </div>
                                )}
                                {practicaEditando && (
                                    <PracticaEdicionForm
                                        ingresoId={ingreso.id}
                                        practica={practicaEditando}
                                        practicasDelGrupo={grupoPracticaEditando?.practicas ?? [practicaEditando]}
                                        tituloGrupo={grupoPracticaEditando?.titulo ?? null}
                                        onListo={cerrarEdicionPractica}
                                        onCancelar={() => {
                                            setPracticaEditando(null)
                                            setGrupoPracticaEditando(null)
                                        }}
                                    />
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
                                                        <th className="pb-2 pr-4">N° Autorización</th>
                                                        {puedeModificar && <th className="pb-2"></th>}
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
                                                            <td className="py-2 pr-4 text-gray-700">{p.numeroAutorizacion ?? '-'}</td>
                                                            {puedeModificar && (
                                                                <td className="py-2 text-right">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setEdicionMasivaAbierta(false)
                                                                            setGrupoPracticaEditando(null)
                                                                            setPracticaEditando(p as PracticaEditable)
                                                                        }}
                                                                        className="inline-flex items-center gap-1 rounded border border-blue-200 bg-white px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-50"
                                                                    >
                                                                        <Pencil className="h-3 w-3" />
                                                                        Editar
                                                                    </button>
                                                                </td>
                                                            )}
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
                                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                    Ordenes generadas ({ordenesAutorizadasFiltradas.length})
                                </p>
                                <div className="mb-2 space-y-1">
                                    <button
                                        type="button"
                                        onClick={() => setMostrarOrdenesPendientesAutorizacion((prev) => !prev)}
                                        disabled={ordenesPendientesAutorizacion === 0}
                                        className="flex w-full items-center justify-between rounded border border-amber-200 bg-amber-50/50 px-2 py-1 text-left disabled:opacity-60"
                                    >
                                        <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                                            Pendientes de autorizacion ({ordenesPendientesAutorizacion})
                                        </span>
                                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800">
                                            {mostrarOrdenesPendientesAutorizacion ? 'Contraer' : 'Expandir'}
                                            {mostrarOrdenesPendientesAutorizacion
                                                ? <ChevronUp className="h-3.5 w-3.5" />
                                                : <ChevronDown className="h-3.5 w-3.5" />}
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setMostrarOrdenesYaAutorizadas((prev) => !prev)}
                                        disabled={ordenesYaAutorizadas === 0}
                                        className="flex w-full items-center justify-between rounded border border-emerald-200 bg-emerald-50/50 px-2 py-1 text-left disabled:opacity-60"
                                    >
                                        <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                            Ya autorizadas ({ordenesYaAutorizadas})
                                        </span>
                                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-800">
                                            {mostrarOrdenesYaAutorizadas ? 'Contraer' : 'Expandir'}
                                            {mostrarOrdenesYaAutorizadas
                                                ? <ChevronUp className="h-3.5 w-3.5" />
                                                : <ChevronDown className="h-3.5 w-3.5" />}
                                        </span>
                                    </button>
                                </div>
                                {ordenesAutorizadasFiltradas.length === 0 ? (
                                    <p className="text-sm text-gray-400">
                                        {practicasAutorizadas.length === 0
                                            ? 'No hay ordenes generadas.'
                                            : 'No hay ordenes generadas para este filtro.'}
                                    </p>
                                ) : ordenesAutorizadasPaginadasVisibles.length === 0 ? (
                                    <p className="text-sm text-gray-500">
                                        No hay ordenes visibles con los paneles cerrados.
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {ordenesAutorizadasPaginadasVisibles.map((grupo) => {
                                            const destinoAutorizada = obtenerDestinoGrupoPracticasAutorizadas(grupo)
                                            const destinoOrdenImpresion =
                                                grupo.tipo === 'orden' && grupo.puestoNumero && grupo.ordenNumero
                                                    ? `/dashboard/ambulatorio/imprimir?ordenes=${encodeURIComponent(`${grupo.puestoNumero}-${grupo.ordenNumero}`)}`
                                                    : null
                                            const destinoAbrir = destinoOrdenImpresion ?? destinoAutorizada
                                            const grupoSinNumeroAutorizacion = !Boolean(grupo.numeroAutorizacion?.trim())
                                            const grupoYaAutorizado = grupoTieneNumeroAutorizacion(grupo)
                                            const grupoFacturado = grupo.practicas.some((practica) => Boolean(practica.facturada))
                                            const puedeAnularGrupo =
                                                grupo.tipo === 'orden' &&
                                                Boolean(grupo.puestoNumero && grupo.ordenNumero) &&
                                                !grupoFacturado
                                            const grupoAnulandose = anulandoOrdenKey === grupo.key
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
                                            const fechaResumenOrden = formatearFecha(grupo.fechaReferencia)
                                            const tituloGrupo = grupo.tipo === 'orden' && grupo.puestoNumero && grupo.ordenNumero
                                                ? `Orden ${formatearNumeroOrden(grupo.puestoNumero, grupo.ordenNumero)}`
                                                : `Autorización ${grupo.numeroAutorizacion ?? '-'}`

                                            return (
                                                <div
                                                    key={grupo.key}
                                                    className={`rounded-lg p-2 ${
                                                        grupoYaAutorizado
                                                            ? 'border border-emerald-200 bg-emerald-50/40'
                                                            : 'border border-amber-300 bg-amber-100/60'
                                                    }`}
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => setOrdenesAutorizadasAbiertas((prev) => ({
                                                            ...prev,
                                                            [grupo.key]: !(prev[grupo.key] ?? false),
                                                        }))}
                                                        className={`flex w-full items-center justify-between gap-2 rounded-md px-1 py-0 text-left ${
                                                            grupoYaAutorizado ? 'hover:bg-emerald-100/40' : 'hover:bg-amber-200/50'
                                                        }`}
                                                    >
                                                        <span className={`flex min-w-0 items-center gap-2 ${grupoYaAutorizado ? 'text-emerald-900' : 'text-amber-900'}`}>
                                                            <ChevronRight className={`h-4 w-4 transition-transform ${abierta ? 'rotate-90' : ''}`} />
                                                            <span className="shrink-0 text-xs font-semibold">{tituloGrupo}</span>
                                                            <span className={`min-w-0 truncate text-[10px] ${grupoYaAutorizado ? 'text-emerald-700' : 'text-amber-800'}`}>
                                                                Cod/Cant: {codigosResumen}{codigosRestantes > 0 ? ` +${codigosRestantes}` : ''} · Fecha: {fechaResumenOrden}
                                                            </span>
                                                        </span>
                                                        <span className={`text-[11px] ${grupoYaAutorizado ? 'text-emerald-700' : 'text-amber-800'}`}>
                                                            {grupo.practicas.length} práctica(s)
                                                        </span>
                                                    </button>

                                                    {abierta && (
                                                        <div className="mt-1.5 grid gap-2 md:grid-cols-2">
                                                            <div className={`space-y-1.5 text-xs ${grupoYaAutorizado ? 'text-emerald-900' : 'text-amber-900'}`}>
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    {destinoAbrir && (
                                                                        <Link
                                                                            href={destinoAbrir}
                                                                            target={destinoOrdenImpresion ? '_blank' : undefined}
                                                                            rel={destinoOrdenImpresion ? 'noopener noreferrer' : undefined}
                                                                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                                                                grupoYaAutorizado
                                                                                    ? 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'
                                                                                    : 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                                                                            }`}
                                                                        >
                                                                            {destinoOrdenImpresion ? 'Abrir orden' : 'Abrir'}
                                                                        </Link>
                                                                    )}
                                                                    {puedeModificar && grupo.tipo === 'orden' && grupo.puestoNumero && grupo.ordenNumero && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => void handleAnularOrdenDesdeGrupo(grupo.puestoNumero as number, grupo.ordenNumero as number, grupo.key)}
                                                                            disabled={grupoAnulandose || !puedeAnularGrupo}
                                                                            title={!puedeAnularGrupo
                                                                                ? 'La orden ya esta facturada'
                                                                                : 'Anular orden'}
                                                                            className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                                                                        >
                                                                            {grupoAnulandose && <Loader2 className="h-3 w-3 animate-spin" />}
                                                                            {grupoAnulandose ? 'Anulando...' : 'Anular orden'}
                                                                        </button>
                                                                    )}
                                                                    {puedeModificar && (grupoSinNumeroAutorizacion || grupo.practicas.some((practica) => !Boolean(practica.facturada))) && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                const editable =
                                                                                    grupo.practicas.find((practica) => !Boolean(practica.facturada)) ??
                                                                                    grupo.practicas[0]
                                                                                if (editable) {
                                                                                    setEdicionMasivaAbierta(false)
                                                                                    setGrupoPracticaEditando({
                                                                                        practicas: grupo.practicas as PracticaEditable[],
                                                                                        titulo: tituloGrupo,
                                                                                    })
                                                                                    setPracticaEditando({
                                                                                        ...(editable as PracticaEditable),
                                                                                        numeroAutorizacion: grupo.numeroAutorizacion ?? editable.numeroAutorizacion ?? '',
                                                                                    })
                                                                                }
                                                                            }}
                                                                            className="inline-flex items-center rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-50"
                                                                        >
                                                                            {grupoSinNumeroAutorizacion ? 'Cargar N° autorización' : 'Editar práctica'}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                <p className={grupoYaAutorizado ? 'text-emerald-800' : 'text-amber-900'}>N° autorización: {grupo.numeroAutorizacion ?? '-'}</p>
                                                                <p className={grupoYaAutorizado ? 'text-emerald-800' : 'text-amber-900 font-semibold'}>
                                                                    Estado: {grupoYaAutorizado ? 'Ya autorizada' : 'Pendiente de autorización'}
                                                                </p>
                                                                <p className={grupoYaAutorizado ? 'text-emerald-800' : 'text-amber-900'}>Fecha última práctica: {formatearFechaHora(grupo.fechaReferencia)}</p>
                                                                <p className={grupoYaAutorizado ? 'text-emerald-800' : 'text-amber-900'}>Cantidad total: {grupo.totalCantidad}</p>
                                                                <p className={grupoYaAutorizado ? 'text-emerald-800' : 'text-amber-900'}>
                                                                    {grupo.matriculasFirmantes.length > 1
                                                                        ? 'Matrículas firmantes'
                                                                        : 'Matrícula firmante'}: {grupo.matriculasFirmantes.length > 0 ? grupo.matriculasFirmantes.join(', ') : '-'}
                                                                </p>
                                                            </div>

                                                            <div className={`rounded-md bg-white/70 p-1.5 ${
                                                                grupoYaAutorizado ? 'border border-emerald-200' : 'border border-amber-300'
                                                            }`}>
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <p className={`text-[11px] font-semibold uppercase tracking-wide ${
                                                                        grupoYaAutorizado ? 'text-emerald-700' : 'text-amber-800'
                                                                    }`}>
                                                                        Prácticas de la orden ({grupo.practicas.length})
                                                                    </p>
                                                                    {grupo.practicas.length > limitePracticas && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setOrdenesAutorizadasExpandidas((prev) => ({
                                                                                ...prev,
                                                                                [grupo.key]: !(prev[grupo.key] ?? false),
                                                                            }))}
                                                                            className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                                                                                grupoYaAutorizado
                                                                                    ? 'border border-emerald-300 text-emerald-800 hover:bg-emerald-50'
                                                                                    : 'border border-amber-300 text-amber-900 hover:bg-amber-100'
                                                                            }`}
                                                                        >
                                                                            {expandida ? 'Contraer' : 'Expandir'}
                                                                        </button>
                                                                    )}
                                                                </div>

                                                                <div className="mt-1.5 space-y-1 text-xs">
                                                                    {practicasVisibles.map((practica) => (
                                                                        <div
                                                                            key={`${grupo.key}-${practica.id}`}
                                                                            className={`rounded bg-white px-2 py-1 ${
                                                                                grupoYaAutorizado ? 'border border-emerald-100' : 'border border-amber-200'
                                                                            }`}
                                                                        >
                                                                            <div className={`flex items-center justify-between gap-2 ${
                                                                                grupoYaAutorizado ? 'text-emerald-900' : 'text-amber-900'
                                                                            }`}>
                                                                                <span className="font-mono text-[11px]">{practica.codigoPractica.trim()}</span>
                                                                                <span className="font-medium">Cant. {practica.cantidad}</span>
                                                                            </div>
                                                                            <p className={grupoYaAutorizado ? 'text-emerald-900' : 'text-amber-900'}>
                                                                                {practica.descripcionPractica ?? practica.codigoPractica.trim()}
                                                                            </p>
                                                                            <p className={grupoYaAutorizado ? 'text-[11px] text-emerald-700' : 'text-[11px] text-amber-800'}>{formatearFechaHora(practica.fecha)}</p>
                                                                        </div>
                                                                    ))}
                                                                </div>

                                                                {!expandida && restantes > 0 && (
                                                                    <p className={`mt-1 text-[11px] ${grupoYaAutorizado ? 'text-emerald-700' : 'text-amber-800'}`}>
                                                                        +{restantes} práctica(s) más
                                                                    </p>
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
                    <SeccionObservaciones
                        ingreso={ingreso}
                        puedeModificar={puedeModificar}
                        onGuardado={registrarCambioSeccion}
                    />
                )}
            </div>

            {/* Contenido imprimible — solo visible al imprimir */}
            <FichaAdmisionPrint ingreso={ingresoVista} />
        </div>
    )
}