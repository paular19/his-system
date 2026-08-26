'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    ChevronUp,
    ClipboardList,
    Loader2,
    Printer,
    Settings2,
    Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PracticaCargaForm, type PracticaCargaEntrada } from '@/components/internacion/practica-carga-form'
import type { PracticaItem } from '@/modules/internacion/types'
import { claveDiaArgentina, formatearFechaArgentina } from '@/lib/utils/argentina-date'
import { normalizarClasificacionAgrupacion, tituloDesdeClasificacion } from '@/modules/orden/clasificacion'
import {
    anularOrdenAction,
    actualizarNumeroAutorizacionAction,
    crearPedidoLaboratorioAction,
    generarOrdenesDesdeInternacionAction,
} from '@/modules/orden/actions'
import {
    agruparPracticasAutorizadasPorOrden,
    obtenerDestinoGrupoPracticasAutorizadas,
    type GrupoPracticasAutorizadas,
} from '@/lib/practicas-autorizadas'
import { formatearNumeroOrden } from '@/modules/orden/types'
import { ProfesionalSelect } from '@/components/ui/profesional-select'
import {
    abrirVentanaImpresionPendiente,
    cerrarVentanaImpresion,
    navegarVentanaImpresion,
} from '@/lib/utils/print-window'
import { calcularTotalSeleccionado, seleccionPorDefecto } from '@/components/ui/componente-selector'

type GuardadaSesionItem = {
    id: string
    practicaId: number
    codigo: string
    descripcion: string
    cantidad: number
    clasificacion: string
    fecha: string
}

type ProfesionalConMatricula = {
    id: number
    nombre: string
    matricula: number
}

type NomencladorItemProtocolo = {
    convenioId: number
    codigo: string
    descripcion: string
    valor: number | null
    valorEspecialista: number | null
    valorAyudante: number | null
    valorAnestesista: number | null
    valorGastos: number | null
}

type ComponenteOrden = 'HE' | 'HA' | 'GA' | 'HP' | 'A1' | 'A2' | 'A3'

type ProtocoloPredefinido = {
    id: string
    nombre: string
    codigos: string[]
    clasificacionPorCodigo: Record<string, ComponenteOrden>
}

type OrdenRef = {
    puestoNumero: number
    numero: number
}

type ConfirmacionOrdenUnicaState = {
    imprimirDespues: boolean
    agruparEnUnaOrden: boolean
    separarPorPractica: boolean
    practicaIds: number[]
    titulosDisponibles: string[]
    requiereElegirTitulo: boolean
    requiereElegirFirmante: boolean
    titularSeleccionado: string
    firmanteSeleccionadoId: string
}

type PopupImpresionSesionState = {
    ordenes: OrdenRef[]
    seleccionadas: string[]
}

type PopupSubitemsSesionState = {
    opciones: Array<{
        clasificacion: string
        titulo: string
        cantidad: number
    }>
    seleccionadas: string[]
}

type OrigenGeneracionOrden = 'default' | 'sesion' | 'protocolo'

type ProtocoloCargaEditable = {
    convenioId: number
    codigo: string
    descripcion: string
    clasificacion: string
    cantidad: string
    requiereMatriculaTratante: boolean
    matriculaTratante: string
    matriculaAnestesista: number | null
    importeBaseUnitario: number | null
    valorReferencial: number | null
}

type GuardarPracticasResult = {
    ok: boolean
    error?: string
    practicaIds?: number[]
}

type GeneracionOrdenTask = {
    practicaIds: number[]
    imprimirDespues: boolean
    agruparEnUnaOrden: boolean
    separarPorSubitem?: boolean
    origen: OrigenGeneracionOrden
    titularOrdenAgrupada?: string | null
    firmanteProfesionalId?: string
    /** true solo si el usuario eligio el firmante a mano; si no, firma el tratante. */
    firmanteExplicito?: boolean
    clasificacionPorPracticaId?: Record<number, string>
    ventanaImpresionPrefijada?: Window | null
}

type PracticaEditDraft = {
    convenioId: number
    codigoPractica: string
    descripcionPractica: string
    fecha: string
    cantidad: string
    numeroAutorizacion: string
    numeroProtocoloLaboratorio: string
    diagnosticoLaboratorio: string
    matriculaEspecialista: string
    matriculaAnestesista: string
    /** Medico que suscribe la orden que contiene la practica. */
    firmanteMatricula: string
    facturable: boolean
    importeBaseUnitario: string
}

type FirmanteOrden = {
    puestoNumero: number
    ordenNumero: number
    nombre: string | null
    matricula: number | null
}

interface PracticaCargaRapidaPageProps {
    ingresoId: number
    convenioId: number | null
    sectorInternacionActual?: string | null
    matriculaTratanteDefault?: number | null
    firmantesOrden?: FirmanteOrden[]
    puedeCrear: boolean
    practicasIniciales: PracticaItem[]
    contextoCirugia?: {
        cirugiaId: number
        pacienteId: number
        fechaCirugia: string | Date
        obraSocialId: number | null
        planId: number | null
        obraSocialCoseguroId: number | null
        numeroAfiliado: string | null
        practicaIdsInternacion: number[]
    } | null
}

const MATRICULA_PATOLOGIA_DEFAULT = 2675
const MATRICULA_ANESTESISTA_DEFAULT = 6
const ORDEN_CLASIFICACION_LISTA: Record<string, number> = {
    HE: 1,
    HA: 2,
    GA: 3,
    HP: 4,
    A1: 5,
    A2: 6,
    A3: 7,
}
const ORDEN_COMPONENTES_CLASIFICACION = ['HE', 'HA', 'GA', 'HP', 'A1', 'A2', 'A3'] as const
const ORDEN_COMPONENTES_VALIDOS = new Set<string>(ORDEN_COMPONENTES_CLASIFICACION)

const ORDENES_HISTORICO_POR_PAGINA = 8
const CONCURRENCIA_GUARDADO_PRACTICAS = 6
const PROTOCOLOS_PREDEFINIDOS: ProtocoloPredefinido[] = [
    {
        id: 'SALA_COMUN_COMPARTIDA',
        nombre: 'SALA O HABITACION COMUN COMPARTIDA',
        codigos: ['431001', '430101', '420301'],
        clasificacionPorCodigo: {
            '431001': 'GA',
            '430101': 'GA',
            '420301': 'HE',
        },
    },
    {
        id: 'SALA_COMUN_BLOQUEADA',
        nombre: 'SALA O HABITACION COMUN BLOQUEADA',
        codigos: ['431001', '430101', '430106', '420301'],
        clasificacionPorCodigo: {
            '431001': 'GA',
            '430101': 'GA',
            '430106': 'GA',
            '420301': 'HE',
        },
    },
    {
        id: 'SALA_USADA_8_HORAS',
        nombre: 'SALA O HABITACION USADA POR 8 HORAS',
        codigos: ['431001', '430130', '420301'],
        clasificacionPorCodigo: {
            '431001': 'GA',
            '430130': 'GA',
            '420301': 'HE',
        },
    },
    {
        id: 'CODIGOS_UTI_TERAPIA_INTENSIVA',
        nombre: 'CODIGOS UTI - TERAPIA INTENSIVA',
        codigos: ['400101', '431002'],
        clasificacionPorCodigo: {
            '400101': 'GA',
            '431002': 'GA',
        },
    },
]

function claveOrden(ref: OrdenRef): string {
    return `${ref.puestoNumero}-${ref.numero}`
}

function practicaActiva(estado: string | null | undefined): boolean {
    return (estado?.trim().toUpperCase() ?? 'A') !== 'X'
}

function practicaFacturada(practica: PracticaItem): boolean {
    return Boolean(practica.facturada)
}

function practicaTuvoOrdenGenerada(practica: Pick<PracticaItem, 'tuvoOrdenGenerada' | 'ordenPractica' | 'puestoNumero' | 'ordenNumero'>): boolean {
    if (practica.tuvoOrdenGenerada === true) return true
    if ((practica.ordenPractica?.length ?? 0) > 0) return true
    return (
        practica.puestoNumero != null &&
        practica.ordenNumero != null &&
        Number(practica.puestoNumero) > 0 &&
        Number(practica.ordenNumero) > 0
    )
}

function descripcionParaMostrar(practica: Pick<PracticaItem, 'descripcionPractica' | 'codigoPractica'>): string {
    const descripcion = practica.descripcionPractica?.trim()
    if (descripcion && descripcion.length > 0) {
        return descripcion.replace(
            /\s+·\s+(Honorario Especialista \(HE\)|Honorario Anestesista \(HA\)|Derechos\/Gastos \(GA\)|Ayudante [123] \(A[123]\))$/i,
            ''
        )
    }
    return practica.codigoPractica.trim()
}

function descripcionParaListaSesion(value: string): string {
    const limpia = value
        .replace(/\s*·\s*Honorario\s+Especialista\s*\(HE\)\s*$/i, '')
        .replace(/\s*·\s*Honorario\s+Anestesista\s*\(HA\)\s*$/i, '')
        .replace(/\s*·\s*Derechos\/Gastos\s*\(GA\)\s*$/i, '')
        .replace(/\s*·\s*Ayudante\s+[123]\s*\(A[123]\)\s*$/i, '')
        .trim()
    return limpia.length > 0 ? limpia : value
}

function clasificacionInferidaPractica(
    practica: Pick<PracticaItem, 'codigoPractica' | 'descripcionPractica' | 'matriculaEspecialista' | 'matriculaAnestesista'>
): string {
    if (practica.codigoPractica.trim() === '66') return 'HE'

    const descripcion = (practica.descripcionPractica ?? '').toUpperCase()
    const match = descripcion.match(/\((HE|HA|GA|HP|A1|A2|A3)\)/)
    if (match?.[1]) return match[1]

    if ((practica.matriculaAnestesista ?? null) && !(practica.matriculaEspecialista ?? null)) {
        return 'HA'
    }

    if ((practica.matriculaEspecialista ?? null) && !(practica.matriculaAnestesista ?? null)) {
        return 'HE'
    }

    return 'HE'
}

function ordenarSubitems(subitems: string[]): string[] {
    return Array.from(new Set(subitems)).sort(
        (a, b) => (ORDEN_CLASIFICACION_LISTA[a] ?? 999) - (ORDEN_CLASIFICACION_LISTA[b] ?? 999)
    )
}

function subitemsDesdeClasificacion(clasificacion: string | null | undefined): string[] {
    const normalizada = normalizarClasificacionAgrupacion(clasificacion)
    if (!normalizada) return []

    const tokens = normalizada
        .split('+')
        .map((token) => token.trim().toUpperCase())
        .filter((token) => ORDEN_COMPONENTES_VALIDOS.has(token))

    return ordenarSubitems(tokens)
}

function subitemsPracticaPorGrupo(
    practica: Pick<PracticaItem, 'codigoPractica' | 'descripcionPractica' | 'matriculaEspecialista' | 'matriculaAnestesista' | 'ordenPractica'>,
    grupo: Pick<GrupoPracticasAutorizadas, 'tipo' | 'puestoNumero' | 'ordenNumero'>
): string[] {
    if (grupo.tipo === 'orden' && grupo.puestoNumero != null && grupo.ordenNumero != null) {
        const subitemsOrden = (practica.ordenPractica ?? [])
            .filter(
                (op) =>
                    op.puestoNumero === grupo.puestoNumero &&
                    op.ordenNumero === grupo.ordenNumero
            )
            .flatMap((op) => subitemsDesdeClasificacion(op.clasificacionAgrupacion))

        if (subitemsOrden.length > 0) {
            return ordenarSubitems(subitemsOrden)
        }
    }

    return subitemsDesdeClasificacion(clasificacionInferidaPractica(practica))
}

function normalizarNumeroAutorizacion(value: string | null | undefined): string | null {
    const normalizada = value?.trim() ?? ''
    return normalizada.length > 0 ? normalizada : null
}

function grupoTieneNumeroAutorizacion(grupo: GrupoPracticasAutorizadas): boolean {
    return normalizarNumeroAutorizacion(grupo.numeroAutorizacion) != null
}

function normalizarBusqueda(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
}

function fechaAInputLocalSimple(value: string | Date): string {
    const clave = claveDiaArgentina(value)
    if (clave) return clave

    const parsed = new Date(value)
    const fecha = Number.isFinite(parsed.getTime()) ? parsed : new Date()
    const year = fecha.getFullYear()
    const month = String(fecha.getMonth() + 1).padStart(2, '0')
    const day = String(fecha.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function fechaSoloPracticaAISOString(value: string): string {
    return new Date(`${value}T12:00:00-03:00`).toISOString()
}

function normalizarCodigoProtocolo(codigo: string): string {
    return codigo.trim().toUpperCase()
}

function clasificacionDefaultDesdeNomenclador(item: NomencladorItemProtocolo): string {
    const soloAnestesia =
        item.valorAnestesista != null &&
        item.valorEspecialista == null &&
        item.valorGastos == null
    if (soloAnestesia) return 'HA'

    const soloGastos =
        item.valorGastos != null &&
        item.valorEspecialista == null &&
        item.valorAnestesista == null
    if (soloGastos) return 'GA'

    return 'HE'
}

function clasificacionProtocoloPorCodigo(
    protocolo: ProtocoloPredefinido | null,
    codigo: string,
    nomenclador: NomencladorItemProtocolo
): string {
    const codigoNormalizado = normalizarCodigoProtocolo(codigo)
    const clasificacionForzada = normalizarClasificacionAgrupacion(
        protocolo?.clasificacionPorCodigo[codigoNormalizado]
    )
    if (clasificacionForzada) return clasificacionForzada
    return clasificacionDefaultDesdeNomenclador(nomenclador)
}

function importeBaseDesdeNomenclador(item: NomencladorItemProtocolo): number | null {
    const seleccion = seleccionPorDefecto({
        valorEspecialista: item.valorEspecialista,
        valorAyudante: item.valorAyudante,
        valorAnestesista: item.valorAnestesista,
        valorGastos: item.valorGastos,
        valorTotal: item.valor,
    })

    const totalSeleccionado = calcularTotalSeleccionado(
        {
            valorEspecialista: item.valorEspecialista,
            valorAyudante: item.valorAyudante,
            valorAnestesista: item.valorAnestesista,
            valorGastos: item.valorGastos,
            valorTotal: item.valor,
        },
        seleccion
    )

    if (totalSeleccionado > 0) return totalSeleccionado
    return item.valor != null && item.valor > 0 ? item.valor : null
}

export function PracticaCargaRapidaPage({
    ingresoId,
    convenioId,
    sectorInternacionActual,
    matriculaTratanteDefault,
    firmantesOrden = [],
    puedeCrear,
    practicasIniciales,
    contextoCirugia,
}: PracticaCargaRapidaPageProps) {
    const router = useRouter()
    const modoCirugia = contextoCirugia != null
    const [practicas, setPracticas] = useState<PracticaItem[]>(
        practicasIniciales
            .filter((practica) => practicaActiva(practica.estado))
            .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
    )
    const [guardadasSesion, setGuardadasSesion] = useState<GuardadaSesionItem[]>([])
    const [mensajeError, setMensajeError] = useState<string | null>(null)
    const [mostrarEditorGrupos, setMostrarEditorGrupos] = useState(false)
    const [practicasSeleccionadas, setPracticasSeleccionadas] = useState<number[]>([])
    const [clasificacionPorPracticaId, setClasificacionPorPracticaId] = useState<Record<number, string>>({})
    const [profesionalesConMatricula, setProfesionalesConMatricula] = useState<ProfesionalConMatricula[]>([])
    const [medicoFirmanteId, setMedicoFirmanteId] = useState('')
    const [firmanteEditadoManualmente, setFirmanteEditadoManualmente] = useState(false)
    const [generandoOrdenes, setGenerandoOrdenes] = useState(false)
    const [tareasGeneracionPendientes, setTareasGeneracionPendientes] = useState(0)
    const [tareasGuardadoPendientes, setTareasGuardadoPendientes] = useState(0)
    const [practicaIdsEnGeneracion, setPracticaIdsEnGeneracion] = useState<number[]>([])
    const [mostrarOrdenesPendientesAutorizacion, setMostrarOrdenesPendientesAutorizacion] = useState(true)
    const [mostrarOrdenesYaAutorizadas, setMostrarOrdenesYaAutorizadas] = useState(true)
    const [ordenesAutorizadasAbiertas, setOrdenesAutorizadasAbiertas] = useState<Record<string, boolean>>({})
    const [ordenesAutorizadasExpandidas, setOrdenesAutorizadasExpandidas] = useState<Record<string, boolean>>({})
    const [ordenEditandoAutorizacionKey, setOrdenEditandoAutorizacionKey] = useState<string | null>(null)
    const [borradorNumeroAutorizacion, setBorradorNumeroAutorizacion] = useState('')
    const [guardandoAutorizacionOrdenKey, setGuardandoAutorizacionOrdenKey] = useState<string | null>(null)
    const [mostrarOrdenesHistoricas, setMostrarOrdenesHistoricas] = useState(true)
    const [busquedaHistorico, setBusquedaHistorico] = useState('')
    const [paginaHistorico, setPaginaHistorico] = useState(1)
    const [ordenesGeneradasSesion, setOrdenesGeneradasSesion] = useState<string[]>([])
    const [confirmacionOrdenUnica, setConfirmacionOrdenUnica] = useState<ConfirmacionOrdenUnicaState | null>(null)
    const [popupImpresionSesion, setPopupImpresionSesion] = useState<PopupImpresionSesionState | null>(null)
    const [popupSubitemsSesion, setPopupSubitemsSesion] = useState<PopupSubitemsSesionState | null>(null)
    const [generarImprimirPorSeparadoEditor, setGenerarImprimirPorSeparadoEditor] = useState(false)
    const [practicaIdsCirugiaLocales, setPracticaIdsCirugiaLocales] = useState<number[]>([])
    const [protocoloSeleccionadoId, setProtocoloSeleccionadoId] = useState(
        PROTOCOLOS_PREDEFINIDOS[0]?.id ?? ''
    )
    const [cantidadComunProtocolo, setCantidadComunProtocolo] = useState('1')
    const [protocoloItems, setProtocoloItems] = useState<ProtocoloCargaEditable[]>([])
    const [fechaProtocolo, setFechaProtocolo] = useState(() => fechaAInputLocalSimple(new Date()))
    const [cargandoProtocolo, setCargandoProtocolo] = useState(false)
    const [procesandoProtocolo, setProcesandoProtocolo] = useState(false)
    const [errorProtocolo, setErrorProtocolo] = useState<string | null>(null)
    const [mostrarPedidoLaboratorio, setMostrarPedidoLaboratorio] = useState(false)
    const [guardandoPedidoLaboratorio, setGuardandoPedidoLaboratorio] = useState(false)
    const [fechaPedidoLaboratorio, setFechaPedidoLaboratorio] = useState(() => fechaAInputLocalSimple(new Date()))
    const [numeroProtocoloLaboratorio, setNumeroProtocoloLaboratorio] = useState('')
    const [diagnosticoLaboratorio, setDiagnosticoLaboratorio] = useState('')
    const [practicaEditando, setPracticaEditando] = useState<PracticaItem | null>(null)
    const [draftPracticaEditando, setDraftPracticaEditando] = useState<PracticaEditDraft | null>(null)
    const [guardandoPracticaEditando, setGuardandoPracticaEditando] = useState(false)
    const [anulandoOrdenKey, setAnulandoOrdenKey] = useState<string | null>(null)
    const [ordenesAnuladasTemporal, setOrdenesAnuladasTemporal] = useState<string[]>([])
    const [eliminandoPracticaPendienteId, setEliminandoPracticaPendienteId] = useState<number | null>(null)
    const colaGeneracionRef = useRef<Promise<void>>(Promise.resolve())
    const colaGuardadoBackgroundRef = useRef<Promise<void>>(Promise.resolve())
    const practicaIdsEnGeneracionRef = useRef<Set<number>>(new Set())

    const hayGeneracionesEnBackground = tareasGeneracionPendientes > 0
    const hayGuardadosEnBackground = tareasGuardadoPendientes > 0

    const protocoloSeleccionado = useMemo(
        () => PROTOCOLOS_PREDEFINIDOS.find((protocolo) => protocolo.id === protocoloSeleccionadoId) ?? null,
        [protocoloSeleccionadoId]
    )

    useEffect(() => {
        setPracticas(
            practicasIniciales
                .filter((practica) => practicaActiva(practica.estado))
                .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
        )
    }, [practicasIniciales])

    useEffect(() => {
        setGenerandoOrdenes(hayGeneracionesEnBackground)
    }, [hayGeneracionesEnBackground])

    useEffect(() => {
        let cancelled = false

        const cargarProfesionales = async () => {
            try {
                const res = await fetch('/api/cirugia/profesionales', { cache: 'no-store' })
                const json = await res.json().catch(() => null)
                const data: unknown[] = Array.isArray(json?.data) ? json.data : []

                if (!cancelled) {
                    const filtrados = data
                        .filter((profesional: unknown): profesional is ProfesionalConMatricula => {
                            if (!profesional || typeof profesional !== 'object') return false
                            const candidato = profesional as {
                                id?: unknown
                                nombre?: unknown
                                matricula?: unknown
                            }
                            return (
                                typeof candidato.id === 'number' &&
                                typeof candidato.nombre === 'string' &&
                                typeof candidato.matricula === 'number' &&
                                candidato.matricula > 0
                            )
                        })
                        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

                    setProfesionalesConMatricula(filtrados)
                }
            } catch {
                if (!cancelled) setProfesionalesConMatricula([])
            }
        }

        void cargarProfesionales()

        return () => {
            cancelled = true
        }
    }, [])

    const obtenerClasificacionPractica = (practica: PracticaItem): string => {
        return (
            normalizarClasificacionAgrupacion(clasificacionPorPracticaId[practica.id]) ??
            clasificacionInferidaPractica(practica)
        )
    }

    const practicasVigentes = useMemo(
        () => practicas.filter((practica) => practicaActiva(practica.estado)),
        [practicas]
    )

    const practicasPendientes = useMemo(
        () => practicasVigentes.filter((practica) => !practicaTuvoOrdenGenerada(practica)),
        [practicasVigentes]
    )

    const practicaIdsEnGeneracionSet = useMemo(
        () => new Set(practicaIdsEnGeneracion),
        [practicaIdsEnGeneracion]
    )

    const practicasPendientesDisponibles = useMemo(
        () => practicasPendientes.filter((practica) => !practicaIdsEnGeneracionSet.has(practica.id)),
        [practicasPendientes, practicaIdsEnGeneracionSet]
    )

    const idsInternacionCirugiaObjetivo = useMemo(() => {
        if (!modoCirugia) return new Set<number>()
        return new Set(contextoCirugia?.practicaIdsInternacion ?? [])
    }, [modoCirugia, contextoCirugia])

    const idsCirugiaObjetivoExtendidos = useMemo(() => {
        if (!modoCirugia) return new Set<number>()
        if (practicaIdsCirugiaLocales.length > 0) {
            return new Set(practicaIdsCirugiaLocales)
        }
        return new Set(contextoCirugia?.practicaIdsInternacion ?? [])
    }, [modoCirugia, contextoCirugia, practicaIdsCirugiaLocales])

    const idsPendientesCirugiaObjetivo = useMemo(() => {
        if (!modoCirugia) return [] as number[]

        const idsPendientes = practicasPendientesDisponibles
            .filter((practica) => idsCirugiaObjetivoExtendidos.has(practica.id))
            .map((practica) => practica.id)

        return idsPendientes
    }, [modoCirugia, practicasPendientesDisponibles, idsCirugiaObjetivoExtendidos])

    useEffect(() => {
        if (!modoCirugia) {
            if (practicaIdsCirugiaLocales.length > 0) {
                setPracticaIdsCirugiaLocales([])
            }
            return
        }

        const activos = new Set(practicas.filter((practica) => practicaActiva(practica.estado)).map((practica) => practica.id))
        setPracticaIdsCirugiaLocales((prev) => {
            const filtrados = prev.filter((id) => activos.has(id))
            if (filtrados.length === prev.length) return prev
            return filtrados
        })
    }, [modoCirugia, practicas, practicaIdsCirugiaLocales.length])

    const idsPendientesCirugiaObjetivoSet = useMemo(
        () => new Set(idsPendientesCirugiaObjetivo),
        [idsPendientesCirugiaObjetivo]
    )

    const practicasAutorizadas = useMemo(
        () => practicasVigentes.filter((practica) => (practica.ordenPractica?.length ?? 0) > 0),
        [practicasVigentes]
    )

    useEffect(() => {
        const pendientes = new Set(
            modoCirugia ? idsPendientesCirugiaObjetivo : practicasPendientesDisponibles.map((practica) => practica.id)
        )
        setPracticasSeleccionadas((prev) => prev.filter((id) => pendientes.has(id)))
    }, [modoCirugia, practicasPendientesDisponibles, idsPendientesCirugiaObjetivo])

    const practicasPendientesOrdenadas = useMemo(() => {
        const lista = [...practicasPendientesDisponibles]
        lista.sort((a, b) => {
            const clasA = obtenerClasificacionPractica(a)
            const clasB = obtenerClasificacionPractica(b)
            if (clasA !== clasB) {
                const codigoA = (clasA.split('+')[0] ?? '').trim()
                const codigoB = (clasB.split('+')[0] ?? '').trim()
                const ordenA = ORDEN_CLASIFICACION_LISTA[codigoA] ?? 99
                const ordenB = ORDEN_CLASIFICACION_LISTA[codigoB] ?? 99
                if (ordenA !== ordenB) return ordenA - ordenB
                return clasA.localeCompare(clasB)
            }

            return new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
        })
        return lista
    }, [practicasPendientesDisponibles, clasificacionPorPracticaId])

    const practicasPendientesAgrupadas = useMemo(() => {
        const grupos = new Map<string, PracticaItem[]>()
        for (const practica of practicasPendientesOrdenadas) {
            const clasificacion = obtenerClasificacionPractica(practica)
            const lista = grupos.get(clasificacion)
            if (lista) lista.push(practica)
            else grupos.set(clasificacion, [practica])
        }

        return Array.from(grupos.entries()).map(([clasificacion, items]) => ({
            clasificacion,
            items,
        }))
    }, [practicasPendientesOrdenadas, clasificacionPorPracticaId])

    const idsPendientesSeleccionadas = useMemo(() => {
        const pendientesIds = new Set(practicasPendientesDisponibles.map((practica) => practica.id))
        return practicasSeleccionadas.filter((id) => pendientesIds.has(id))
    }, [practicasPendientesDisponibles, practicasSeleccionadas])

    const idsPendientesSeleccionadasCirugia = useMemo(
        () => practicasSeleccionadas.filter((id) => idsPendientesCirugiaObjetivoSet.has(id)),
        [practicasSeleccionadas, idsPendientesCirugiaObjetivoSet]
    )

    const practicasPendientesCirugiaObjetivoAgrupadas = useMemo(() => {
        const grupos = new Map<string, PracticaItem[]>()
        for (const practica of practicasPendientesOrdenadas) {
            if (!idsPendientesCirugiaObjetivoSet.has(practica.id)) continue
            const clasificacion = obtenerClasificacionPractica(practica)
            const lista = grupos.get(clasificacion)
            if (lista) lista.push(practica)
            else grupos.set(clasificacion, [practica])
        }

        return Array.from(grupos.entries()).map(([clasificacion, items]) => ({
            clasificacion,
            items,
        }))
    }, [practicasPendientesOrdenadas, idsPendientesCirugiaObjetivoSet, clasificacionPorPracticaId])

    const idsPendientesEditor = modoCirugia
        ? idsPendientesCirugiaObjetivo
        : practicasPendientesDisponibles.map((practica) => practica.id)

    const idsPendientesSeleccionadasEditor = modoCirugia
        ? idsPendientesSeleccionadasCirugia
        : idsPendientesSeleccionadas

    const practicasPendientesEditorAgrupadas = modoCirugia
        ? practicasPendientesCirugiaObjetivoAgrupadas
        : practicasPendientesAgrupadas

    const idsPendientesSesion = useMemo(() => {
        const pendientes = new Set(practicasPendientesDisponibles.map((practica) => practica.id))
        return Array.from(
            new Set(
                guardadasSesion
                    .map((item) => item.practicaId)
                    .filter((id) => pendientes.has(id))
            )
        )
    }, [guardadasSesion, practicasPendientesDisponibles])

    const idsPendientesSesionSet = useMemo(
        () => new Set(idsPendientesSesion),
        [idsPendientesSesion]
    )

    const pendientesPrevias = useMemo(() => {
        const pendientesObjetivo = new Set(idsPendientesEditor)

        const ordenarClasificacion = (clasificacion: string): number => {
            const codigo = (clasificacion.split('+')[0] ?? '').trim()
            return ORDEN_CLASIFICACION_LISTA[codigo] ?? 99
        }

        return practicasPendientesDisponibles
            .filter((practica) => {
                if (idsPendientesSesionSet.has(practica.id)) return false
                if (modoCirugia) return true
                return pendientesObjetivo.has(practica.id)
            })
            .map((practica) => ({
                practica,
                clasificacion:
                    normalizarClasificacionAgrupacion(clasificacionPorPracticaId[practica.id]) ??
                    clasificacionInferidaPractica(practica),
            }))
            .sort((a, b) => {
                const ordenA = ordenarClasificacion(a.clasificacion)
                const ordenB = ordenarClasificacion(b.clasificacion)
                if (ordenA !== ordenB) return ordenA - ordenB
                return new Date(b.practica.fecha).getTime() - new Date(a.practica.fecha).getTime()
            })
    }, [
        modoCirugia,
        idsPendientesEditor,
        practicasPendientesDisponibles,
        idsPendientesSesionSet,
        clasificacionPorPracticaId,
    ])

    useEffect(() => {
        const pendientes = new Set(practicasPendientesDisponibles.map((practica) => practica.id))
        setGuardadasSesion((prev) => {
            const filtradas = prev.filter((item) => pendientes.has(item.practicaId))
            return filtradas.length === prev.length ? prev : filtradas
        })
    }, [practicasPendientesDisponibles])

    const ordenesAutorizadas = useMemo(
        () => agruparPracticasAutorizadasPorOrden(practicasAutorizadas),
        [practicasAutorizadas]
    )

    const ordenesPendientesAutorizacion = useMemo(
        () => ordenesAutorizadas.filter((grupo) => !grupoTieneNumeroAutorizacion(grupo)),
        [ordenesAutorizadas]
    )

    const ordenesConAutorizacion = useMemo(
        () => ordenesAutorizadas.filter((grupo) => grupoTieneNumeroAutorizacion(grupo)),
        [ordenesAutorizadas]
    )

    const ordenesGeneradasSesionSet = useMemo(
        () => new Set(ordenesGeneradasSesion),
        [ordenesGeneradasSesion]
    )

    const ordenesAnuladasTemporalSet = useMemo(
        () => new Set(ordenesAnuladasTemporal),
        [ordenesAnuladasTemporal]
    )

    const matriculaPorProfesionalId = useMemo(() => {
        const map = new Map<number, number>()
        for (const profesional of profesionalesConMatricula) {
            map.set(profesional.id, profesional.matricula)
        }
        return map
    }, [profesionalesConMatricula])

    const registrarProfesionalCreado = (profesional: {
        id: number
        nombre: string
        matricula?: number | null
    }) => {
        if (!(typeof profesional.matricula === 'number' && profesional.matricula > 0)) return
        const matricula = profesional.matricula

        setProfesionalesConMatricula((prev) => {
            if (prev.some((item) => item.id === profesional.id)) return prev

            const next = [
                ...prev,
                {
                    id: profesional.id,
                    nombre: profesional.nombre,
                    matricula,
                },
            ]

            next.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
            return next
        })
    }

    const profesionalIdPorMatricula = useMemo(() => {
        const map = new Map<number, number>()
        for (const profesional of profesionalesConMatricula) {
            map.set(profesional.matricula, profesional.id)
        }
        return map
    }, [profesionalesConMatricula])

    const matriculaFirmanteSugerida = useMemo(() => {
        if (modoCirugia && matriculaTratanteDefault != null && matriculaTratanteDefault > 0) {
            return matriculaTratanteDefault
        }

        const idsRelevantes = modoCirugia
            ? idsPendientesCirugiaObjetivo
            : idsPendientesSeleccionadas.length > 0
                ? idsPendientesSeleccionadas
                : practicasPendientesDisponibles.map((practica) => practica.id)

        for (const practicaId of idsRelevantes) {
            const practica = practicas.find((item) => item.id === practicaId)
            if (!practica) continue

            const matriculaEspecialista = practica.matriculaEspecialista
            if (matriculaEspecialista == null || matriculaEspecialista <= 0) continue
            if (matriculaEspecialista === MATRICULA_PATOLOGIA_DEFAULT) continue
            if (practica.codigoPractica.trim().startsWith('15')) continue

            return matriculaEspecialista
        }

        return matriculaTratanteDefault ?? null
    }, [modoCirugia, idsPendientesCirugiaObjetivo, idsPendientesSeleccionadas, practicasPendientesDisponibles, practicas, matriculaTratanteDefault])

    useEffect(() => {
        const profesionalIdSugerido =
            matriculaFirmanteSugerida != null
                ? (profesionalIdPorMatricula.get(matriculaFirmanteSugerida) ?? null)
                : null

        if (!profesionalIdSugerido) return
        if (firmanteEditadoManualmente) return

        const siguiente = String(profesionalIdSugerido)
        if (medicoFirmanteId === siguiente) return

        setMedicoFirmanteId(siguiente)
    }, [
        medicoFirmanteId,
        matriculaFirmanteSugerida,
        profesionalIdPorMatricula,
        firmanteEditadoManualmente,
    ])

    const firmaPrevistaTexto = useMemo(() => {
        // Fuera de cirugia, mientras no elijan firmante a mano la orden la firma el tratante.
        if (!modoCirugia && !firmanteEditadoManualmente) {
            const tratante = matriculaTratanteDefault != null
                ? profesionalesConMatricula.find((profesional) => profesional.matricula === matriculaTratanteDefault)
                : null
            if (tratante) return `${tratante.nombre} · MP ${tratante.matricula} (medico tratante)`
            if (matriculaTratanteDefault != null) return `Matricula ${matriculaTratanteDefault} (medico tratante)`
            return 'Sin firmante seleccionado. Se usara el profesional de la internacion.'
        }

        const profesionalSeleccionadoId = Number.parseInt(medicoFirmanteId, 10)
        if (Number.isFinite(profesionalSeleccionadoId)) {
            const profesionalSeleccionado = profesionalesConMatricula.find(
                (profesional) => profesional.id === profesionalSeleccionadoId
            )
            if (profesionalSeleccionado) {
                return `${profesionalSeleccionado.nombre} · MP ${profesionalSeleccionado.matricula}`
            }
        }

        if (matriculaFirmanteSugerida != null) {
            const sugerido = profesionalesConMatricula.find(
                (profesional) => profesional.matricula === matriculaFirmanteSugerida
            )
            if (sugerido) {
                return `${sugerido.nombre} · MP ${sugerido.matricula} (sugerido)`
            }

            return `Matricula ${matriculaFirmanteSugerida} (sugerida)`
        }

        return 'Sin firmante seleccionado. Se usara el profesional de la internacion.'
    }, [
        medicoFirmanteId,
        profesionalesConMatricula,
        matriculaFirmanteSugerida,
        modoCirugia,
        firmanteEditadoManualmente,
        matriculaTratanteDefault,
    ])

    const firmanteCirugiaValido = useMemo(() => {
        if (!modoCirugia) return true

        const profesionalSeleccionadoId = Number.parseInt(medicoFirmanteId, 10)
        if (!Number.isFinite(profesionalSeleccionadoId)) return false

        const matricula = matriculaPorProfesionalId.get(profesionalSeleccionadoId)
        return typeof matricula === 'number' && matricula > 0
    }, [modoCirugia, medicoFirmanteId, matriculaPorProfesionalId])

    const registrarGuardadasSesion = (creadas: PracticaItem[], entradasCrear: PracticaCargaEntrada[]) => {
        if (creadas.length === 0) return

        const nuevas = creadas.map((practicaCreada, idx) => {
            const entrada = entradasCrear[idx]
            return {
                id: `${practicaCreada.id}-${Date.now()}-${idx}`,
                practicaId: practicaCreada.id,
                codigo: practicaCreada.codigoPractica.trim(),
                descripcion: descripcionParaListaSesion(descripcionParaMostrar(practicaCreada)),
                cantidad: Number(practicaCreada.cantidad),
                clasificacion: entrada?.clasificacion ?? 'HE',
                fecha: formatearFechaArgentina(practicaCreada.fecha, {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                }),
            }
        })

        setGuardadasSesion((prev) => [...nuevas, ...prev])
    }

    const registrarGuardadasSesionDesdePracticas = (
        creadas: PracticaItem[],
        clasificacionPorNuevaPracticaId?: Record<number, string>
    ) => {
        if (creadas.length === 0) return

        const nuevas = creadas.map((practicaCreada, idx) => ({
            id: `cirugia-${practicaCreada.id}-${Date.now()}-${idx}`,
            practicaId: practicaCreada.id,
            codigo: practicaCreada.codigoPractica.trim(),
            descripcion: descripcionParaListaSesion(descripcionParaMostrar(practicaCreada)),
            cantidad: Number(practicaCreada.cantidad),
            clasificacion:
                clasificacionPorNuevaPracticaId?.[practicaCreada.id] ??
                clasificacionInferidaPractica(practicaCreada),
            fecha: formatearFechaArgentina(practicaCreada.fecha, {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
            }),
        }))

        setGuardadasSesion((prev) => [...nuevas, ...prev])
    }

    const guardarPracticasInternacion = async (entradasCrear: PracticaCargaEntrada[]): Promise<GuardarPracticasResult> => {
        try {
            type ResultadoGuardadoPractica =
                | { ok: true; idx: number; practica: PracticaItem }
                | { ok: false; idx: number; error: string }

            const tareas = entradasCrear.map((entrada, idx) => ({ entrada, idx }))
            const resultados: ResultadoGuardadoPractica[] = new Array(tareas.length)
            let cursor = 0

            await Promise.all(
                Array.from({ length: Math.min(CONCURRENCIA_GUARDADO_PRACTICAS, tareas.length) }, async () => {
                    while (true) {
                        const indiceActual = cursor
                        const tarea = tareas[indiceActual]
                        cursor += 1
                        if (!tarea) return

                        try {
                            const res = await fetch(`/api/internacion/${ingresoId}/practicas?skipRevalidate=1&skipPrecioFallback=1`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(tarea.entrada.payload),
                            })
                            const json = await res.json().catch(() => null)

                            if (!res.ok) {
                                resultados[tarea.idx] = {
                                    ok: false,
                                    idx: tarea.idx,
                                    error: json?.error ?? 'No se pudo registrar la practica',
                                }
                                continue
                            }

                            resultados[tarea.idx] = {
                                ok: true,
                                idx: tarea.idx,
                                practica: json.data as PracticaItem,
                            }
                        } catch {
                            resultados[tarea.idx] = {
                                ok: false,
                                idx: tarea.idx,
                                error: 'Error de conexion al guardar practicas',
                            }
                        }
                    }
                })
            )

            const practicasCreadas: PracticaItem[] = []
            const clasificacionesCreadas: Record<number, string> = {}

            for (const resultado of resultados) {
                if (!resultado?.ok) continue
                practicasCreadas.push(resultado.practica)
                clasificacionesCreadas[resultado.practica.id] = entradasCrear[resultado.idx]?.clasificacion ?? 'HE'
            }

            setPracticas((prev) => [...practicasCreadas, ...prev])
            setClasificacionPorPracticaId((prev) => ({
                ...prev,
                ...clasificacionesCreadas,
            }))
            registrarGuardadasSesion(practicasCreadas, entradasCrear)

            const primeraFalla = resultados.find((resultado) => resultado && !resultado.ok)
            if (primeraFalla && !primeraFalla.ok) {
                setMensajeError(primeraFalla.error)
                return {
                    ok: false,
                    error: practicasCreadas.length > 0
                        ? `Se guardaron ${practicasCreadas.length} prácticas y otras fallaron. ${primeraFalla.error}`
                        : primeraFalla.error,
                    practicaIds: practicasCreadas.map((practica) => practica.id),
                }
            }

            return { ok: true, practicaIds: practicasCreadas.map((practica) => practica.id) }
        } catch {
            const mensaje = 'Error de conexion al guardar practicas'
            setMensajeError(mensaje)
            return { ok: false, error: mensaje }
        }
    }

    const guardarPracticasCirugia = async (
        entradasCrear: PracticaCargaEntrada[]
    ): Promise<GuardarPracticasResult> => {
        if (!contextoCirugia) {
            const mensaje = 'No se encontro contexto de cirugia para guardar practicas'
            setMensajeError(mensaje)
            return { ok: false, error: mensaje }
        }

        try {
            const prePanel = await fetch(`/api/internacion/${ingresoId}/panel-clinico`, {
                cache: 'no-store',
            })
            const preJson = await prePanel.json().catch(() => null)
            const preIdsBackend = new Set<number>(practicas.map((practica) => practica.id))
            if (Array.isArray(preJson?.data?.practicasCirugiaEspejo)) {
                for (const practica of preJson.data.practicasCirugiaEspejo as Array<{ id: number }>) {
                    preIdsBackend.add(practica.id)
                }
            }

            const practicasExpandida = entradasCrear.map((entrada) => ({
                convenioId: entrada.payload.convenioId,
                codigo: entrada.payload.codigoPractica,
                descripcion: entrada.payload.descripcionPractica,
                fecha: entrada.payload.fecha,
                cantidad: entrada.payload.cantidad,
                importeBaseUnitario: entrada.payload.importeBaseUnitario,
                matriculaEspecialista: entrada.payload.matriculaEspecialista,
                matriculaAnestesista: entrada.payload.matriculaAnestesista,
            }))

            const res = await fetch(`/api/internacion/${ingresoId}/cirugia-urgencia`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cirugiaId: contextoCirugia.cirugiaId,
                    pacienteId: contextoCirugia.pacienteId,
                    fechaCirugia: fechaAInputLocalSimple(contextoCirugia.fechaCirugia),
                    horaCirugia: null,
                    camaId: null,
                    obraSocialId: contextoCirugia.obraSocialId,
                    planId: contextoCirugia.planId,
                    obraSocialCoseguroId: contextoCirugia.obraSocialCoseguroId,
                    numeroAfiliado: contextoCirugia.numeroAfiliado,
                    diagnostico: null,
                    observaciones: null,
                    practicas: practicasExpandida,
                    diferenciales: {
                        esFeriado: false,
                        esNocturna: false,
                        mismaViaPatologia: false,
                        diferentesViasPatologia: false,
                        diferentesViasDiferentesPatologia: false,
                    },
                }),
            })

            const json = await res.json().catch(() => null)
            if (!res.ok) {
                const mensaje = json?.error ?? 'No se pudo registrar la practica en la cirugia seleccionada'
                setMensajeError(mensaje)
                return { ok: false, error: mensaje }
            }

            const practicaIdsInternacionCreadas = Array.isArray(json?.data?.practicaIdsInternacionCreadas)
                ? (json.data.practicaIdsInternacionCreadas as unknown[])
                    .filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0)
                : []

            const clasificacionDesdeIdsRespuesta: Record<number, string> = {}
            for (const [idx, practicaId] of practicaIdsInternacionCreadas.entries()) {
                clasificacionDesdeIdsRespuesta[practicaId] = entradasCrear[idx]?.clasificacion ?? 'HE'
            }

            const practicasOptimistasDesdeRespuesta = practicaIdsInternacionCreadas
                .map((practicaId, idx) => {
                    const entrada = entradasCrear[idx]
                    if (!entrada) return null

                    const codigo = entrada.payload.codigoPractica.trim()
                    const descripcion = descripcionParaListaSesion(entrada.payload.descripcionPractica?.trim() ?? codigo)

                    return {
                        id: practicaId,
                        ingresoId,
                        convenioId: entrada.payload.convenioId,
                        codigoPractica: codigo,
                        descripcionPractica: descripcion,
                        numeroProtocoloLaboratorio: null,
                        diagnosticoLaboratorio: null,
                        fecha: new Date(entrada.payload.fecha),
                        cantidad: Number(entrada.payload.cantidad ?? 1),
                        // El optimista tiene que espejar lo que guarda el server: total, no unitario.
                        importeTotal: entrada.payload.importeBaseUnitario != null
                            ? Number((entrada.payload.importeBaseUnitario * Number(entrada.payload.cantidad ?? 1)).toFixed(2))
                            : null,
                        numeroAutorizacion: entrada.payload.numeroAutorizacion ?? null,
                        matriculaEspecialista: entrada.payload.matriculaEspecialista ?? null,
                        matriculaAnestesista: entrada.payload.matriculaAnestesista ?? null,
                        puestoNumero: null,
                        ordenNumero: null,
                        ordenItem: null,
                        facturada: false,
                        ordenPractica: [],
                        facturable: entrada.payload.facturable,
                        estado: 'A',
                        usuario: 'CIRUGIA',
                        tuvoOrdenGenerada: false,
                    } as PracticaItem
                })
                .filter((practica): practica is PracticaItem => practica != null)

            const resPanel = await fetch(`/api/internacion/${ingresoId}/panel-clinico`, {
                cache: 'no-store',
            })
            const jsonPanel = await resPanel.json().catch(() => null)

            if (!resPanel.ok || !Array.isArray(jsonPanel?.data?.practicas)) {
                if (practicasOptimistasDesdeRespuesta.length > 0) {
                    setPracticas((prev) => {
                        const activasPrevias = prev.filter((practica) => practicaActiva(practica.estado))
                        const map = new Map<number, PracticaItem>(
                            activasPrevias.map((practica) => [practica.id, practica])
                        )
                        for (const practica of practicasOptimistasDesdeRespuesta) {
                            map.set(practica.id, practica)
                        }

                        return Array.from(map.values()).sort(
                            (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
                        )
                    })

                    setPracticaIdsCirugiaLocales((prev) =>
                        Array.from(new Set([...prev, ...practicasOptimistasDesdeRespuesta.map((practica) => practica.id)]))
                    )
                    setClasificacionPorPracticaId((prev) => ({
                        ...prev,
                        ...clasificacionDesdeIdsRespuesta,
                    }))
                    registrarGuardadasSesionDesdePracticas(
                        practicasOptimistasDesdeRespuesta,
                        clasificacionDesdeIdsRespuesta
                    )
                    router.refresh()
                    return {
                        ok: true,
                        practicaIds: practicasOptimistasDesdeRespuesta.map((practica) => practica.id),
                    }
                }

                setMensajeError('Las practicas se guardaron, pero no se pudo actualizar la lista sin recargar')
                return { ok: true }
            }

            const practicasPanelBase = (jsonPanel.data.practicas as PracticaItem[])
            const practicasCirugiaEspejoRaw = Array.isArray(jsonPanel?.data?.practicasCirugiaEspejo)
                ? (jsonPanel.data.practicasCirugiaEspejo as Array<{
                    id: number
                    codigoPractica: string
                    descripcionPractica?: string | null
                    fecha: string | Date
                    cantidad: number
                    numeroAutorizacion: string | null
                    facturable: boolean
                    puestoNumero: number | null
                    ordenNumero: number | null
                    estado: string | null
                    usuarioRegistro: string | null
                    matriculaEspecialista: number | null
                    matriculaAnestesista: number | null
                    tuvoOrdenGenerada?: boolean
                    ordenPractica?: Array<{
                        puestoNumero: number
                        ordenNumero: number
                        item: number
                        numeroAutorizacion: string | null
                        descripcionPractica?: string | null
                        clasificacionAgrupacion?: string | null
                        efectorMatricula?: number | null
                        fechaEmision?: string | Date | null
                    }>
                }>)
                : []

            const descripcionPorPracticaId = new Map<number, string>()
            const descripcionPorCodigo = new Map<string, string>()
            for (const practica of practicasPanelBase) {
                const descripcionPorId = practica.descripcionPractica?.trim()
                if (descripcionPorId) {
                    descripcionPorPracticaId.set(practica.id, descripcionPorId)
                }

                const codigo = practica.codigoPractica.trim().toUpperCase()
                const descripcion = practica.descripcionPractica?.trim()
                if (codigo && descripcion) descripcionPorCodigo.set(codigo, descripcion)
            }
            for (const entrada of entradasCrear) {
                const codigo = entrada.payload.codigoPractica.trim().toUpperCase()
                const descripcion = entrada.payload.descripcionPractica?.trim()
                if (codigo && descripcion) descripcionPorCodigo.set(codigo, descripcion)
            }

            const practicasCirugiaEspejo: PracticaItem[] = practicasCirugiaEspejoRaw.map((practica) => {
                const codigoTrim = practica.codigoPractica.trim()
                const codigoLookup = codigoTrim.toUpperCase()
                const descripcionPorId = descripcionPorPracticaId.get(practica.id) ?? null
                const ordenPractica = Array.isArray(practica.ordenPractica)
                    ? practica.ordenPractica.map((orden) => ({
                        puestoNumero: orden.puestoNumero,
                        ordenNumero: orden.ordenNumero,
                        item: orden.item,
                        numeroAutorizacion: orden.numeroAutorizacion ?? null,
                        clasificacionAgrupacion: orden.clasificacionAgrupacion ?? null,
                        efectorMatricula: orden.efectorMatricula ?? null,
                        fechaEmision: orden.fechaEmision ? new Date(orden.fechaEmision) : null,
                    }))
                    : []
                const descripcionDesdeOrden = Array.isArray(practica.ordenPractica)
                    ? (practica.ordenPractica
                        .map((orden) => orden.descripcionPractica?.trim() ?? '')
                        .find((item) => item.length > 0) ?? null)
                    : null
                const descripcionBackend = practica.descripcionPractica?.trim() ?? null

                return {
                    id: practica.id,
                    ingresoId,
                    convenioId: contextoCirugia.obraSocialId ?? convenioId ?? 0,
                    codigoPractica: codigoTrim,
                    descripcionPractica:
                        descripcionDesdeOrden ??
                        descripcionBackend ??
                        descripcionPorId ??
                        descripcionPorCodigo.get(codigoLookup) ??
                        codigoTrim,
                    numeroProtocoloLaboratorio: null,
                    diagnosticoLaboratorio: null,
                    fecha: new Date(practica.fecha),
                    cantidad: Number(practica.cantidad ?? 1),
                    importeTotal: null,
                    numeroAutorizacion: practica.numeroAutorizacion ?? null,
                    matriculaEspecialista: practica.matriculaEspecialista ?? null,
                    matriculaAnestesista: practica.matriculaAnestesista ?? null,
                    puestoNumero: practica.puestoNumero ?? null,
                    ordenNumero: practica.ordenNumero ?? null,
                    ordenItem: ordenPractica[0]?.item ?? null,
                    facturada:
                        ordenPractica.length > 0 ||
                        ((practica.puestoNumero ?? 0) > 0 && (practica.ordenNumero ?? 0) > 0),
                    ordenPractica,
                    facturable: Boolean(practica.facturable),
                    estado: practica.estado ?? 'A',
                    usuario: (practica.usuarioRegistro ?? 'CIRUGIA').trim() || 'CIRUGIA',
                    tuvoOrdenGenerada:
                        practica.tuvoOrdenGenerada === true ||
                        ordenPractica.length > 0 ||
                        (
                            practica.puestoNumero != null &&
                            practica.ordenNumero != null &&
                            Number(practica.puestoNumero) > 0 &&
                            Number(practica.ordenNumero) > 0
                        ),
                }
            })

            const practicasUnicasPorId = new Map<number, PracticaItem>()
            for (const practica of practicasCirugiaEspejo) {
                practicasUnicasPorId.set(practica.id, practica)
            }

            const practicasNuevasPorIds = practicaIdsInternacionCreadas
                .map((practicaId) => practicasUnicasPorId.get(practicaId))
                .filter((practica): practica is PracticaItem => practica != null)

            const practicasNoPrevias = Array.from(practicasUnicasPorId.values())
                .filter((practica) => !preIdsBackend.has(practica.id))
                // El backend inserta en orden; mantener ASC por id permite alinear
                // entrada->práctica cuando hay códigos repetidos y el match exacto falla.
                .sort((a, b) => a.id - b.id)

            const practicasNoPreviasDisponibles = [...practicasNoPrevias]
            const practicasNuevasDelLote: PracticaItem[] = []
            const clasificacionPorNuevaPracticaId: Record<number, string> = {
                ...clasificacionDesdeIdsRespuesta,
            }

            const entradasSinMatch: number[] = []

            for (const [idxEntrada, entrada] of entradasCrear.entries()) {
                const codigoEsperado = entrada.payload.codigoPractica.trim().toUpperCase()
                const cantidadEsperada = Number(entrada.payload.cantidad ?? 1)
                const matriculaEspecialistaEsperada = entrada.payload.matriculaEspecialista ?? null
                const matriculaAnestesistaEsperada = entrada.payload.matriculaAnestesista ?? null

                const idxExacta = practicasNoPreviasDisponibles.findIndex((practica) =>
                    practica.codigoPractica.trim().toUpperCase() === codigoEsperado &&
                    Number(practica.cantidad ?? 1) === cantidadEsperada &&
                    (practica.matriculaEspecialista ?? null) === matriculaEspecialistaEsperada &&
                    (practica.matriculaAnestesista ?? null) === matriculaAnestesistaEsperada
                )

                const idxCodigo = idxExacta >= 0
                    ? idxExacta
                    : practicasNoPreviasDisponibles.findIndex(
                        (practica) => practica.codigoPractica.trim().toUpperCase() === codigoEsperado
                    )

                if (idxCodigo < 0) {
                    entradasSinMatch.push(idxEntrada)
                    continue
                }

                const [match] = practicasNoPreviasDisponibles.splice(idxCodigo, 1)
                if (!match) {
                    entradasSinMatch.push(idxEntrada)
                    continue
                }

                practicasNuevasDelLote.push(match)
                clasificacionPorNuevaPracticaId[match.id] = entrada.clasificacion ?? 'HE'
            }

            if (
                practicasNoPreviasDisponibles.length > 0 &&
                entradasSinMatch.length === practicasNoPreviasDisponibles.length
            ) {
                for (let i = 0; i < practicasNoPreviasDisponibles.length; i += 1) {
                    const practica = practicasNoPreviasDisponibles[i]
                    const idxEntrada = entradasSinMatch[i]
                    const entrada = idxEntrada != null ? entradasCrear[idxEntrada] : undefined
                    if (!practica) continue

                    practicasNuevasDelLote.push(practica)
                    clasificacionPorNuevaPracticaId[practica.id] = entrada?.clasificacion ?? 'HE'
                }
                practicasNoPreviasDisponibles.length = 0
            }

            const practicasNuevas = practicasNuevasPorIds.length > 0
                ? practicasNuevasPorIds
                : practicasNuevasDelLote.length > 0
                ? practicasNuevasDelLote
                : (practicasNoPrevias.length === entradasCrear.length ? practicasNoPrevias : [])

            const practicasActualizadas = Array.from(practicasUnicasPorId.values())
                .filter((practica) => practicaActiva(practica.estado))
                .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())

            setPracticas(practicasActualizadas)

            if (practicasNuevas.length > 0) {
                setPracticaIdsCirugiaLocales((prev) =>
                    Array.from(new Set([...prev, ...practicasNuevas.map((practica) => practica.id)]))
                )

                for (const practica of practicasNuevas) {
                    if (clasificacionPorNuevaPracticaId[practica.id]) continue
                    clasificacionPorNuevaPracticaId[practica.id] = clasificacionInferidaPractica(practica)
                }

                setClasificacionPorPracticaId((prev) => ({
                    ...prev,
                    ...clasificacionPorNuevaPracticaId,
                }))
                registrarGuardadasSesionDesdePracticas(practicasNuevas, clasificacionPorNuevaPracticaId)
            }

            return { ok: true }
        } catch {
            const mensaje = 'Error de conexion al guardar practicas de cirugia'
            setMensajeError(mensaje)
            return { ok: false, error: mensaje }
        }
    }

    const handleGuardarPracticas = async (
        entradasCrear: PracticaCargaEntrada[],
        options?: { background?: boolean }
    ): Promise<GuardarPracticasResult> => {
        setMensajeError(null)

        if (contextoCirugia) {
            if (options?.background) {
                const cantidadEncolada = entradasCrear.length
                setTareasGuardadoPendientes((prev) => prev + cantidadEncolada)

                colaGuardadoBackgroundRef.current = colaGuardadoBackgroundRef.current
                    .catch(() => undefined)
                    .then(async () => {
                        const resultado = await guardarPracticasCirugia(entradasCrear)
                        if (!resultado.ok) {
                            setMensajeError(resultado.error ?? 'No se pudo registrar la practica en la cirugia seleccionada')
                        }
                    })
                    .finally(() => {
                        setTareasGuardadoPendientes((prev) => Math.max(0, prev - cantidadEncolada))
                    })

                return { ok: true }
            }

            return guardarPracticasCirugia(entradasCrear)
        }

        if (options?.background) {
            const cantidadEncolada = entradasCrear.length
            setTareasGuardadoPendientes((prev) => prev + cantidadEncolada)

            colaGuardadoBackgroundRef.current = colaGuardadoBackgroundRef.current
                .catch(() => undefined)
                .then(async () => {
                    const resultado = await guardarPracticasInternacion(entradasCrear)
                    if (!resultado.ok) {
                        setMensajeError(resultado.error ?? 'No se pudo registrar la practica')
                    }
                })
                .finally(() => {
                    setTareasGuardadoPendientes((prev) => Math.max(0, prev - cantidadEncolada))
                })

            return { ok: true }
        }

        return guardarPracticasInternacion(entradasCrear)
    }

    const handleGuardarPracticasModoRapido = async (
        entradasCrear: PracticaCargaEntrada[]
    ): Promise<GuardarPracticasResult> => handleGuardarPracticas(entradasCrear, { background: true })

    const alternarSeleccionPractica = (practicaId: number, checked: boolean) => {
        setPracticasSeleccionadas((prev) => {
            if (checked) {
                if (prev.includes(practicaId)) return prev
                return [...prev, practicaId]
            }
            return prev.filter((id) => id !== practicaId)
        })
    }

    const alternarSeleccionLista = (ids: number[], checked: boolean) => {
        if (!checked) {
            setPracticasSeleccionadas((prev) => prev.filter((id) => !ids.includes(id)))
            return
        }

        setPracticasSeleccionadas((prev) => {
            const next = new Set(prev)
            for (const id of ids) next.add(id)
            return Array.from(next)
        })
    }

    const alternarSeleccionTodasPendientes = (checked: boolean) => {
        alternarSeleccionLista(practicasPendientes.map((practica) => practica.id), checked)
    }

    const eliminarPracticaPendiente = async (practicaId: number) => {
        const practica = practicas.find((item) => item.id === practicaId)
        if (!practica) return

        if (!practicaActiva(practica.estado) || practicaTuvoOrdenGenerada(practica)) {
            setMensajeError('Solo se pueden eliminar practicas pendientes sin orden generada')
            return
        }

        if (typeof window !== 'undefined') {
            const confirmar = window.confirm('Se eliminara la practica seleccionada. Desea continuar?')
            if (!confirmar) return
        }

        setMensajeError(null)
        setEliminandoPracticaPendienteId(practicaId)
        try {
            const res = await fetch(`/api/internacion/${ingresoId}/practicas/${practicaId}`, {
                method: 'DELETE',
                cache: 'no-store',
            })

            const json = await res.json().catch(() => null)
            if (!res.ok) {
                setMensajeError(json?.error ?? 'No se pudo eliminar la practica pendiente')
                return
            }

            setPracticas((prev) => prev.filter((item) => item.id !== practicaId))
            setGuardadasSesion((prev) => prev.filter((item) => item.practicaId !== practicaId))
            setPracticasSeleccionadas((prev) => prev.filter((id) => id !== practicaId))
            setPracticaIdsCirugiaLocales((prev) => prev.filter((id) => id !== practicaId))
            setClasificacionPorPracticaId((prev) => {
                if (!(practicaId in prev)) return prev
                const next = { ...prev }
                delete next[practicaId]
                return next
            })
        } catch {
            setMensajeError('Error de conexion al eliminar la practica pendiente')
        } finally {
            setEliminandoPracticaPendienteId(null)
        }
    }

    const abrirImpresionOrdenes = (ordenes: OrdenRef[]) => {
        if (ordenes.length === 0) return

        const ordenesParam = ordenes
            .map((orden) => `${orden.puestoNumero}-${orden.numero}`)
            .join(',')
        const url = `/dashboard/ambulatorio/imprimir?ordenes=${encodeURIComponent(ordenesParam)}`
        const ventanaImpresion = abrirVentanaImpresionPendiente()
        navegarVentanaImpresion(ventanaImpresion, url)
    }

    const ejecutarGeneracionOrdenesTask = async (task: GeneracionOrdenTask): Promise<boolean> => {
        const practicaIds = task.practicaIds
        if (practicaIds.length === 0) {
            return false
        }

        const firmanteProfesionalId = task.firmanteProfesionalId ?? ''
        const profesionalIdFirmante = Number.parseInt(firmanteProfesionalId, 10)

        if (modoCirugia && !Number.isFinite(profesionalIdFirmante)) {
            setMensajeError('Selecciona medico firmante antes de generar o imprimir ordenes')
            return false
        }

        const matriculaDesdeSeleccion = Number.isFinite(profesionalIdFirmante)
            ? (matriculaPorProfesionalId.get(profesionalIdFirmante) ?? null)
            : null

        // Fuera de cirugia, la sugerencia automatica no se manda como firmante: si el
        // usuario no eligio a nadie, la orden la firma el tratante de la internacion.
        const medicoFirmanteMatricula = modoCirugia
            ? (matriculaDesdeSeleccion ?? matriculaFirmanteSugerida)
            : task.firmanteExplicito
                ? matriculaDesdeSeleccion
                : null

        if (modoCirugia && (medicoFirmanteMatricula == null || medicoFirmanteMatricula <= 0)) {
            setMensajeError('Selecciona un medico firmante valido antes de generar o imprimir ordenes')
            return false
        }

        const clasificacionPayload = Object.fromEntries(
            practicaIds.map((id) => {
                const clasificacionForzada = task.clasificacionPorPracticaId?.[id] ?? 'HE'
                return [String(id), normalizarClasificacionAgrupacion(clasificacionForzada) ?? clasificacionForzada]
            })
        )

        const requierePopupSeleccionImpresionSesion =
            Boolean(task.imprimirDespues) && task.origen === 'sesion'
        const ventanaImpresion =
            task.imprimirDespues
                ? (task.ventanaImpresionPrefijada ??
                    (!requierePopupSeleccionImpresionSesion ? abrirVentanaImpresionPendiente() : null))
                : null
        let impresionDisparada = false

        try {
            const result = await generarOrdenesDesdeInternacionAction({
                ingresoId,
                practicaIds,
                clasificacionPorPracticaId: clasificacionPayload,
                agruparEnUnaOrden: task.agruparEnUnaOrden,
                separarPorSubitem: Boolean(task.separarPorSubitem),
                titularOrdenAgrupada: task.agruparEnUnaOrden ? (task.titularOrdenAgrupada ?? null) : undefined,
                cirujanoFirmanteMatricula: medicoFirmanteMatricula ?? undefined,
                origenGeneracion: modoCirugia ? 'CIRUGIA' : 'PRACTICAS',
            })

            if ('error' in result && result.error) {
                setMensajeError(result.error)
                return false
            }

            const asignaciones = Array.isArray((result as { asignaciones?: unknown }).asignaciones)
                ? ((result as {
                    asignaciones: Array<{ practicaId: number; puestoNumero: number; numero: number; item: number }>
                }).asignaciones)
                : []

            const grupos = Array.isArray((result as { ordenesPorGrupo?: unknown }).ordenesPorGrupo)
                ? ((result as {
                    ordenesPorGrupo: Array<{ clasificacion: string; puestoNumero: number; numero: number; practicaIds: number[] }>
                }).ordenesPorGrupo)
                : []

            const asignacionesPorPracticaId = new Map<number, Array<{ puestoNumero: number; numero: number; item: number }>>()
            for (const asignacion of asignaciones) {
                const prev = asignacionesPorPracticaId.get(asignacion.practicaId) ?? []
                prev.push({
                    puestoNumero: asignacion.puestoNumero,
                    numero: asignacion.numero,
                    item: asignacion.item,
                })
                asignacionesPorPracticaId.set(asignacion.practicaId, prev)
            }

            const asignacionFallbackPorPracticaId = new Map<number, Array<{ puestoNumero: number; numero: number; item: number }>>()

            for (const grupo of grupos) {
                grupo.practicaIds.forEach((practicaId, idx) => {
                    const prev = asignacionFallbackPorPracticaId.get(practicaId) ?? []
                    prev.push({
                        puestoNumero: grupo.puestoNumero,
                        numero: grupo.numero,
                        item: idx + 1,
                    })
                    asignacionFallbackPorPracticaId.set(practicaId, prev)
                })
            }

            const ordenesGeneradasMap = new Map<string, { puestoNumero: number; numero: number }>()
            for (const grupo of grupos) {
                const key = `${grupo.puestoNumero}-${grupo.numero}`
                ordenesGeneradasMap.set(key, {
                    puestoNumero: grupo.puestoNumero,
                    numero: grupo.numero,
                })
            }
            for (const asignacion of asignaciones) {
                const key = `${asignacion.puestoNumero}-${asignacion.numero}`
                if (ordenesGeneradasMap.has(key)) continue
                ordenesGeneradasMap.set(key, {
                    puestoNumero: asignacion.puestoNumero,
                    numero: asignacion.numero,
                })
            }
            const ordenesGeneradasUnicas = Array.from(ordenesGeneradasMap.values())

            setPracticas((prev) => prev.map((practica) => {
                const asignadas = [
                    ...(asignacionesPorPracticaId.get(practica.id) ?? []),
                    ...(asignacionFallbackPorPracticaId.get(practica.id) ?? []),
                ]
                if (asignadas.length === 0) return practica

                const ordenesExistentes = new Set(
                    practica.ordenPractica.map((orden) => `${orden.puestoNumero}-${orden.ordenNumero}-${orden.item}`)
                )
                const ordenesNuevas = [...practica.ordenPractica]

                for (const asignada of asignadas) {
                    const keyOrden = `${asignada.puestoNumero}-${asignada.numero}-${asignada.item}`
                    if (ordenesExistentes.has(keyOrden)) continue
                    ordenesExistentes.add(keyOrden)
                    ordenesNuevas.push({
                        puestoNumero: asignada.puestoNumero,
                        ordenNumero: asignada.numero,
                        item: asignada.item,
                        numeroAutorizacion: null,
                        fechaEmision: practica.fecha,
                    })
                }

                if (ordenesNuevas.length === practica.ordenPractica.length) return practica

                return {
                    ...practica,
                    ordenPractica: ordenesNuevas,
                    tuvoOrdenGenerada: true,
                }
            }))

            setPracticasSeleccionadas((prev) => prev.filter((id) => !practicaIds.includes(id)))

            if (ordenesGeneradasUnicas.length > 0) {
                if (task.origen === 'sesion' || task.origen === 'protocolo') {
                    const nuevasOrdenesSesion = ordenesGeneradasUnicas.map((orden) => `${orden.puestoNumero}-${orden.numero}`)
                    setOrdenesGeneradasSesion((prev) => Array.from(new Set([...nuevasOrdenesSesion, ...prev])))
                }
                const idsGeneradas = new Set(practicaIds)
                setGuardadasSesion((prev) => prev.filter((item) => !idsGeneradas.has(item.practicaId)))
            }

            if (task.imprimirDespues && ordenesGeneradasUnicas.length > 0) {
                const ordenesUnicas = ordenesGeneradasUnicas

                if (requierePopupSeleccionImpresionSesion && ordenesUnicas.length > 1) {
                    setPopupImpresionSesion({
                        ordenes: ordenesUnicas,
                        seleccionadas: ordenesUnicas.map(claveOrden),
                    })
                } else {
                    const ordenesParam = ordenesUnicas
                        .map((orden) => `${orden.puestoNumero}-${orden.numero}`)
                        .join(',')
                    const url = `/dashboard/ambulatorio/imprimir?ordenes=${encodeURIComponent(ordenesParam)}`
                    navegarVentanaImpresion(ventanaImpresion, url)
                    impresionDisparada = true
                }
            }

            return true
        } catch {
            setMensajeError('Error al generar ordenes desde internacion')
            return false
        } finally {
            if (!impresionDisparada) {
                cerrarVentanaImpresion(ventanaImpresion)
            }
        }
    }

    const encolarGeneracionOrdenes = (
        imprimirDespues: boolean,
        practicaIdsObjetivo?: number[],
        agruparEnUnaOrden = false,
        opciones?: {
            titularOrdenAgrupada?: string | null
            origen?: OrigenGeneracionOrden
            firmanteProfesionalId?: string
            firmanteExplicito?: boolean
            separarPorPractica?: boolean
            separarPorSubitem?: boolean
            clasificacionPorPracticaId?: Record<number, string>
            ventanaImpresionPrefijada?: Window | null
        }
    ): boolean => {
        const origen = opciones?.origen ?? 'default'
        const separarPorSubitem = opciones?.separarPorSubitem ?? (modoCirugia && origen === 'sesion')
        const practicaIdsEntrada = practicaIdsObjetivo ?? idsPendientesSeleccionadas
        const permitirIdsNoSincronizados =
            Array.isArray(practicaIdsObjetivo) && practicaIdsObjetivo.length > 0
        const practicaIds = Array.from(new Set(practicaIdsEntrada)).filter((id) => {
            if (practicaIdsEnGeneracionRef.current.has(id)) return false
            const practica = practicas.find((item) => item.id === id)
            if (!practica) return permitirIdsNoSincronizados
            if (!practicaActiva(practica.estado)) return false
            return !practicaTuvoOrdenGenerada(practica)
        })

        if (practicaIds.length === 0) {
            setMensajeError('No hay practicas pendientes disponibles para generar ordenes')
            return false
        }

        if (modoCirugia) {
            const firmanteProfesionalId = opciones?.firmanteProfesionalId ?? medicoFirmanteId
            const profesionalIdFirmante = Number.parseInt(firmanteProfesionalId, 10)
            if (!Number.isFinite(profesionalIdFirmante)) {
                setMensajeError('Selecciona medico firmante antes de generar o imprimir ordenes')
                return false
            }

            const medicoFirmanteMatricula = matriculaPorProfesionalId.get(profesionalIdFirmante) ?? null
            if (medicoFirmanteMatricula == null || medicoFirmanteMatricula <= 0) {
                setMensajeError('Selecciona un medico firmante valido antes de generar o imprimir ordenes')
                return false
            }
        }

        const firmanteProfesionalIdFinal = opciones?.firmanteProfesionalId ?? medicoFirmanteId
        const firmanteExplicitoFinal = opciones?.firmanteExplicito ?? firmanteEditadoManualmente
        const clasificacionSnapshot = Object.fromEntries(
            practicaIds.map((id) => {
                const clasificacionForzada = opciones?.clasificacionPorPracticaId?.[id]
                if (clasificacionForzada) {
                    return [id, normalizarClasificacionAgrupacion(clasificacionForzada) ?? clasificacionForzada]
                }
                const practica = practicas.find((item) => item.id === id)
                return [id, practica ? obtenerClasificacionPractica(practica) : 'HE']
            })
        )

        const tasks: GeneracionOrdenTask[] =
            opciones?.separarPorPractica && practicaIds.length > 1
                ? practicaIds.map((practicaId) => ({
                    practicaIds: [practicaId],
                    imprimirDespues,
                    agruparEnUnaOrden: false,
                    separarPorSubitem,
                    origen,
                    titularOrdenAgrupada: opciones?.titularOrdenAgrupada,
                    firmanteProfesionalId: firmanteProfesionalIdFinal,
                    firmanteExplicito: firmanteExplicitoFinal,
                    clasificacionPorPracticaId: clasificacionSnapshot,
                    ventanaImpresionPrefijada: opciones?.ventanaImpresionPrefijada,
                }))
                : [{
                    practicaIds,
                    imprimirDespues,
                    agruparEnUnaOrden,
                    separarPorSubitem,
                    origen,
                    titularOrdenAgrupada: opciones?.titularOrdenAgrupada,
                    firmanteProfesionalId: firmanteProfesionalIdFinal,
                    firmanteExplicito: firmanteExplicitoFinal,
                    clasificacionPorPracticaId: clasificacionSnapshot,
                    ventanaImpresionPrefijada: opciones?.ventanaImpresionPrefijada,
                }]

        setMensajeError(null)

        for (const task of tasks) {
            const idsTask = task.practicaIds
            idsTask.forEach((id) => practicaIdsEnGeneracionRef.current.add(id))
            setPracticaIdsEnGeneracion((prev) => Array.from(new Set([...prev, ...idsTask])))
            setPracticasSeleccionadas((prev) => prev.filter((id) => !idsTask.includes(id)))
            setTareasGeneracionPendientes((prev) => prev + 1)

            colaGeneracionRef.current = colaGeneracionRef.current
                .catch(() => undefined)
                .then(async () => {
                    try {
                        await ejecutarGeneracionOrdenesTask(task)
                    } finally {
                        idsTask.forEach((id) => practicaIdsEnGeneracionRef.current.delete(id))
                        setPracticaIdsEnGeneracion((prev) => prev.filter((id) => !idsTask.includes(id)))
                        setTareasGeneracionPendientes((prev) => Math.max(0, prev - 1))
                    }
                })
        }

        return true
    }

    const solicitarConfirmacionOrdenUnica = (imprimirDespues: boolean) => {
        if (modoCirugia && !firmanteCirugiaValido) {
            setMensajeError('Selecciona medico firmante (cirujano) antes de generar o imprimir')
            return
        }

        if (idsPendientesSeleccionadasEditor.length === 0) {
            setMensajeError('Selecciona al menos una practica pendiente para generar ordenes')
            return
        }

        const agruparEnUnaOrden = !generarImprimirPorSeparadoEditor
        const separarPorPractica = generarImprimirPorSeparadoEditor

        const practicasSeleccionadasParaOrden = practicas.filter((practica) =>
            idsPendientesSeleccionadasEditor.includes(practica.id)
        )

        const titulosDisponibles = Array.from(
            new Set(
                practicasSeleccionadasParaOrden.map((practica) =>
                    tituloDesdeClasificacion(obtenerClasificacionPractica(practica))
                )
            )
        )

        const firmantesDisponibles = Array.from(
            new Set(
                practicasSeleccionadasParaOrden
                    .map((practica) => practica.matriculaEspecialista)
                    .filter((matricula): matricula is number => typeof matricula === 'number' && matricula > 0)
            )
        )

        const requiereElegirTitulo = agruparEnUnaOrden && titulosDisponibles.length > 1
        const requiereElegirFirmante = firmantesDisponibles.length > 1
        const titularSeleccionado = titulosDisponibles[0] ?? 'HONORARIOS'

        if (!requiereElegirTitulo && !requiereElegirFirmante) {
            encolarGeneracionOrdenes(
                imprimirDespues,
                idsPendientesSeleccionadasEditor,
                agruparEnUnaOrden,
                {
                    titularOrdenAgrupada: titularSeleccionado,
                    separarPorPractica,
                }
            )
            return
        }

        setConfirmacionOrdenUnica({
            imprimirDespues,
            agruparEnUnaOrden,
            separarPorPractica,
            practicaIds: idsPendientesSeleccionadasEditor,
            titulosDisponibles,
            requiereElegirTitulo,
            requiereElegirFirmante,
            titularSeleccionado,
            firmanteSeleccionadoId: medicoFirmanteId,
        })
    }

    const confirmarGeneracionOrdenUnica = () => {
        if (!confirmacionOrdenUnica) return

        const siguienteFirmanteId = confirmacionOrdenUnica.firmanteSeleccionadoId
        if (confirmacionOrdenUnica.requiereElegirFirmante && !siguienteFirmanteId) {
            setMensajeError('Selecciona medico firmante para continuar con una sola orden')
            return
        }

        // Solo cuenta como eleccion explicita si el dialogo pidio elegir firmante.
        const firmanteExplicito =
            confirmacionOrdenUnica.requiereElegirFirmante || firmanteEditadoManualmente

        if (siguienteFirmanteId && confirmacionOrdenUnica.requiereElegirFirmante) {
            setMedicoFirmanteId(siguienteFirmanteId)
            setFirmanteEditadoManualmente(true)
        }

        const payload = {
            titularOrdenAgrupada: confirmacionOrdenUnica.titularSeleccionado,
            firmanteProfesionalId: siguienteFirmanteId,
            firmanteExplicito,
            separarPorPractica: confirmacionOrdenUnica.separarPorPractica,
        }

        const { imprimirDespues, practicaIds, agruparEnUnaOrden } = confirmacionOrdenUnica
        setConfirmacionOrdenUnica(null)
        encolarGeneracionOrdenes(imprimirDespues, practicaIds, agruparEnUnaOrden, payload)
    }

    const solicitarGeneracionDesdeSesion = () => {
        if (modoCirugia && !firmanteCirugiaValido) {
            setMensajeError('Selecciona medico firmante (cirujano) antes de generar o imprimir')
            return
        }

        const idsSesion = idsPendientesSesion
        if (idsSesion.length === 0) {
            setMensajeError('No hay practicas guardadas en esta sesión para generar ordenes')
            return
        }

        const practicasSesion = practicas.filter((practica) => idsSesion.includes(practica.id))
        const mapa = new Map<string, { clasificacion: string; titulo: string; cantidad: number }>()

        practicasSesion.forEach((practica) => {
            const clasificacion = obtenerClasificacionPractica(practica)
            const titulo = tituloDesdeClasificacion(clasificacion)
            const clave = `${clasificacion}::${titulo}`
            const existente = mapa.get(clave)
            if (existente) {
                existente.cantidad += 1
                return
            }
            mapa.set(clave, { clasificacion, titulo, cantidad: 1 })
        })

        const opciones = Array.from(mapa.values())

        if (opciones.length <= 1) {
            encolarGeneracionOrdenes(true, idsSesion, false, { origen: 'sesion' })
            return
        }

        setPopupSubitemsSesion({
            opciones,
            seleccionadas: opciones.map((opcion) => opcion.clasificacion),
        })
    }

    const alternarSubitemPopupSesion = (clasificacion: string, checked: boolean) => {
        setPopupSubitemsSesion((prev) => {
            if (!prev) return prev
            if (checked) {
                if (prev.seleccionadas.includes(clasificacion)) return prev
                return { ...prev, seleccionadas: [...prev.seleccionadas, clasificacion] }
            }
            return {
                ...prev,
                seleccionadas: prev.seleccionadas.filter((id) => id !== clasificacion),
            }
        })
    }

    const confirmarGeneracionSubitemsSesion = () => {
        if (!popupSubitemsSesion) return
        const clasificacionesSeleccionadas = new Set(popupSubitemsSesion.seleccionadas)
        if (clasificacionesSeleccionadas.size === 0) {
            setMensajeError('Selecciona al menos un titulo de subitem para generar e imprimir')
            return
        }

        const idsSesion = idsPendientesSesion
        const idsFiltrados = practicas
            .filter(
                (practica) =>
                    idsSesion.includes(practica.id) &&
                    clasificacionesSeleccionadas.has(obtenerClasificacionPractica(practica))
            )
            .map((practica) => practica.id)

        setPopupSubitemsSesion(null)

        if (idsFiltrados.length === 0) {
            setMensajeError('No hay practicas de los titulos seleccionados para generar')
            return
        }

        encolarGeneracionOrdenes(true, idsFiltrados, false, { origen: 'sesion' })
    }

    const alternarOrdenPopupImpresionSesion = (clave: string, checked: boolean) => {
        setPopupImpresionSesion((prev) => {
            if (!prev) return prev
            if (checked) {
                if (prev.seleccionadas.includes(clave)) return prev
                return { ...prev, seleccionadas: [...prev.seleccionadas, clave] }
            }
            return { ...prev, seleccionadas: prev.seleccionadas.filter((id) => id !== clave) }
        })
    }

    const imprimirSeleccionPopupSesion = () => {
        if (!popupImpresionSesion) return
        const seleccion = new Set(popupImpresionSesion.seleccionadas)
        const ordenes = popupImpresionSesion.ordenes.filter((orden) => seleccion.has(claveOrden(orden)))
        if (ordenes.length === 0) {
            setMensajeError('Selecciona al menos una orden para imprimir')
            return
        }
        abrirImpresionOrdenes(ordenes)
        setPopupImpresionSesion(null)
    }

    const limpiarPedidoLaboratorio = () => {
        setFechaPedidoLaboratorio(fechaAInputLocalSimple(new Date()))
        setNumeroProtocoloLaboratorio('')
        setDiagnosticoLaboratorio('')
    }

    /** Firmante de la primera orden activa que contiene la practica. */
    const firmanteDePractica = (practica: PracticaItem): FirmanteOrden | null => {
        for (const orden of practica.ordenPractica ?? []) {
            const firmante = firmantesOrden.find(
                (item) =>
                    item.puestoNumero === orden.puestoNumero &&
                    item.ordenNumero === orden.ordenNumero
            )
            if (firmante) return firmante
        }
        return null
    }

    const abrirEdicionPractica = (practica: PracticaItem) => {
        const cantidad = Number.isFinite(Number(practica.cantidad)) && Number(practica.cantidad) > 0
            ? Number(practica.cantidad)
            : 1
        const importeBaseUnitario =
            practica.importeTotal != null && cantidad > 0
                ? Number(practica.importeTotal) / cantidad
                : null

        setMensajeError(null)
        setPracticaEditando(practica)
        setDraftPracticaEditando({
            convenioId: Number(practica.convenioId) > 0 ? Number(practica.convenioId) : (convenioId ?? 0),
            codigoPractica: practica.codigoPractica.trim(),
            descripcionPractica: practica.descripcionPractica ?? '',
            fecha: fechaAInputLocalSimple(practica.fecha),
            cantidad: String(cantidad),
            numeroAutorizacion: practica.numeroAutorizacion ?? '',
            numeroProtocoloLaboratorio: practica.numeroProtocoloLaboratorio ?? '',
            diagnosticoLaboratorio: practica.diagnosticoLaboratorio ?? '',
            matriculaEspecialista: practica.matriculaEspecialista != null ? String(practica.matriculaEspecialista) : '',
            matriculaAnestesista: practica.matriculaAnestesista != null ? String(practica.matriculaAnestesista) : '',
            firmanteMatricula: (() => {
                const matricula = firmanteDePractica(practica)?.matricula
                return matricula != null ? String(matricula) : ''
            })(),
            facturable: practica.facturable,
            importeBaseUnitario: importeBaseUnitario != null && Number.isFinite(importeBaseUnitario)
                ? String(Number(importeBaseUnitario.toFixed(2)))
                : '',
        })
    }

    const cerrarEdicionPractica = () => {
        if (guardandoPracticaEditando) return
        setPracticaEditando(null)
        setDraftPracticaEditando(null)
    }

    const guardarEdicionPractica = async () => {
        if (!practicaEditando || !draftPracticaEditando) return

        const cantidad = Number.parseInt(draftPracticaEditando.cantidad, 10)
        if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 999) {
            setMensajeError('La cantidad debe estar entre 1 y 999')
            return
        }

        const codigoPractica = draftPracticaEditando.codigoPractica.trim().toUpperCase()
        if (!codigoPractica) {
            setMensajeError('El codigo de practica es obligatorio')
            return
        }

        if (!draftPracticaEditando.fecha) {
            setMensajeError('La fecha de la practica es obligatoria')
            return
        }

        const convenioIdFinal =
            Number.isFinite(Number(draftPracticaEditando.convenioId)) && Number(draftPracticaEditando.convenioId) > 0
                ? Number(draftPracticaEditando.convenioId)
                : null

        const payload = {
            convenioId: convenioIdFinal,
            codigoPractica,
            descripcionPractica: draftPracticaEditando.descripcionPractica.trim() || null,
            fecha: fechaSoloPracticaAISOString(draftPracticaEditando.fecha),
            cantidad,
            numeroAutorizacion: draftPracticaEditando.numeroAutorizacion.trim() || null,
            numeroProtocoloLaboratorio: draftPracticaEditando.numeroProtocoloLaboratorio.trim() || null,
            diagnosticoLaboratorio: draftPracticaEditando.diagnosticoLaboratorio.trim() || null,
            facturable: draftPracticaEditando.facturable,
            importeBaseUnitario:
                draftPracticaEditando.importeBaseUnitario.trim() !== ''
                    ? Number(draftPracticaEditando.importeBaseUnitario)
                    : null,
            matriculaEspecialista:
                draftPracticaEditando.matriculaEspecialista.trim() !== ''
                    ? Number(draftPracticaEditando.matriculaEspecialista)
                    : null,
            matriculaAnestesista:
                draftPracticaEditando.matriculaAnestesista.trim() !== ''
                    ? Number(draftPracticaEditando.matriculaAnestesista)
                    : null,
            firmanteMatricula:
                draftPracticaEditando.firmanteMatricula.trim() !== ''
                    ? Number(draftPracticaEditando.firmanteMatricula)
                    : null,
        }

        setMensajeError(null)
        setGuardandoPracticaEditando(true)
        try {
            const res = await fetch(`/api/internacion/${ingresoId}/practicas/${practicaEditando.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                cache: 'no-store',
            })

            const json = await res.json().catch(() => null)
            if (!res.ok) {
                setMensajeError(json?.error ?? 'No se pudo editar la practica')
                return
            }

            const actualizada = (json?.data ?? null) as PracticaItem | null
            if (actualizada) {
                setPracticas((prev) => prev.map((practica) => {
                    if (practica.id !== actualizada.id) return practica
                    return {
                        ...actualizada,
                        tuvoOrdenGenerada:
                            actualizada.tuvoOrdenGenerada ??
                            practica.tuvoOrdenGenerada ??
                            practicaTuvoOrdenGenerada(practica),
                    }
                }))
                setClasificacionPorPracticaId((prev) => ({
                    ...prev,
                    [actualizada.id]: clasificacionInferidaPractica(actualizada),
                }))
            }

            cerrarEdicionPractica()
            // El firmante vive en la cabecera de la orden: lo trae el server component.
            router.refresh()
        } catch {
            setMensajeError('Error de conexion al editar la practica')
        } finally {
            setGuardandoPracticaEditando(false)
        }
    }

    const anularOrdenDesdeGrupo = async (puestoNumero: number, ordenNumero: number, grupoKey: string) => {
        if (typeof window !== 'undefined') {
            const confirmar = window.confirm(
                `Se anulara la orden ${formatearNumeroOrden(puestoNumero, ordenNumero)}. Desea continuar?`
            )
            if (!confirmar) return
        }

        setMensajeError(null)
        setAnulandoOrdenKey(grupoKey)
        try {
            const result = await anularOrdenAction(puestoNumero, ordenNumero)
            if ('error' in result && result.error) {
                setMensajeError(result.error)
                return
            }

            setPracticas((prev) => prev.map((practica) => {
                const ordenesRestantes = (practica.ordenPractica ?? []).filter(
                    (orden) => !(orden.puestoNumero === puestoNumero && orden.ordenNumero === ordenNumero)
                )

                if (ordenesRestantes.length === (practica.ordenPractica ?? []).length) {
                    return practica
                }

                return {
                    ...practica,
                    ordenPractica: ordenesRestantes,
                    facturada: false,
                    tuvoOrdenGenerada: true,
                }
            }))

            const claveOrdenAnulada = `${puestoNumero}-${ordenNumero}`
            setOrdenesAnuladasTemporal((prev) =>
                Array.from(new Set([...prev, `${puestoNumero}:${ordenNumero}`]))
            )
            setOrdenesGeneradasSesion((prev) => prev.filter((clave) => clave !== claveOrdenAnulada))
            setOrdenEditandoAutorizacionKey((prev) => (prev === grupoKey ? null : prev))
            setBorradorNumeroAutorizacion('')
            router.refresh()
        } catch {
            setMensajeError('Error al anular la orden')
        } finally {
            setAnulandoOrdenKey(null)
        }
    }

    const crearPedidoLaboratorio = async () => {
        const numeroProtocolo = numeroProtocoloLaboratorio.trim()
        const diagnostico = diagnosticoLaboratorio.trim()

        if (!numeroProtocolo) {
            setMensajeError('Ingresa el numero de protocolo')
            return
        }

        setMensajeError(null)
        setGuardandoPedidoLaboratorio(true)
        try {
            const result = await crearPedidoLaboratorioAction({
                ingresoId,
                fecha: fechaSoloPracticaAISOString(fechaPedidoLaboratorio),
                numeroProtocolo,
                diagnostico,
            })

            if ('error' in result && result.error) {
                setMensajeError(result.error)
                return
            }

            if ('puestoNumero' in result && 'numero' in result) {
                const keyOrden = `${result.puestoNumero}-${result.numero}`
                setOrdenesGeneradasSesion((prev) => Array.from(new Set([keyOrden, ...prev])))
            }

            limpiarPedidoLaboratorio()
            setMostrarPedidoLaboratorio(false)
            router.refresh()
        } catch {
            setMensajeError('Error de conexion al generar el pedido de laboratorio')
        } finally {
            setGuardandoPedidoLaboratorio(false)
        }
    }

    const iniciarEdicionAutorizacionOrden = (grupo: GrupoPracticasAutorizadas) => {
        if (grupo.tipo !== 'orden' || grupo.puestoNumero == null || grupo.ordenNumero == null) return
        setMensajeError(null)
        setOrdenEditandoAutorizacionKey(grupo.key)
        setBorradorNumeroAutorizacion(grupo.numeroAutorizacion ?? '')
    }

    const cancelarEdicionAutorizacionOrden = () => {
        if (guardandoAutorizacionOrdenKey) return
        setOrdenEditandoAutorizacionKey(null)
        setBorradorNumeroAutorizacion('')
    }

    const guardarAutorizacionOrden = async (grupo: GrupoPracticasAutorizadas) => {
        if (grupo.tipo !== 'orden' || grupo.puestoNumero == null || grupo.ordenNumero == null) return

        const numeroAutorizacion = borradorNumeroAutorizacion.trim()
        if (!numeroAutorizacion) {
            setMensajeError('Ingresa un numero de autorizacion para guardar')
            return
        }

        const numeroNormalizado = numeroAutorizacion.slice(0, 15)
        setMensajeError(null)
        setGuardandoAutorizacionOrdenKey(grupo.key)
        try {
            const result = await actualizarNumeroAutorizacionAction(
                grupo.puestoNumero,
                grupo.ordenNumero,
                numeroNormalizado
            )

            if (result?.error) {
                setMensajeError(result.error)
                return
            }

            setPracticas((prev) => prev.map((practica) => {
                const tieneOrden = practica.ordenPractica.some(
                    (orden) =>
                        orden.puestoNumero === grupo.puestoNumero &&
                        orden.ordenNumero === grupo.ordenNumero
                )
                if (!tieneOrden) return practica

                return {
                    ...practica,
                    numeroAutorizacion: numeroNormalizado,
                    ordenPractica: practica.ordenPractica.map((orden) =>
                        orden.puestoNumero === grupo.puestoNumero && orden.ordenNumero === grupo.ordenNumero
                            ? { ...orden, numeroAutorizacion: numeroNormalizado }
                            : orden
                    ),
                }
            }))

            setOrdenEditandoAutorizacionKey(null)
            setBorradorNumeroAutorizacion('')
        } catch {
            setMensajeError('No se pudo guardar el numero de autorizacion de la orden')
        } finally {
            setGuardandoAutorizacionOrdenKey(null)
        }
    }

    const resolverNomencladorExactoPorCodigo = async (
        codigo: string,
        opciones?: { ignorarConvenio?: boolean }
    ): Promise<NomencladorItemProtocolo | null> => {
        const codigoNormalizado = codigo.trim().toUpperCase()
        if (codigoNormalizado.length < 2) return null

        const qs = new URLSearchParams({
            q: codigoNormalizado,
            exact: '1',
            limit: '20',
        })
        if (!opciones?.ignorarConvenio && convenioId != null) {
            qs.set('convenioId', String(convenioId))
        }

        const res = await fetch(`/api/practicas-nomenclador?${qs.toString()}`, {
            cache: 'no-store',
        })
        const json = await res.json().catch(() => null)
        const items: NomencladorItemProtocolo[] = Array.isArray(json?.data) ? json.data : []
        return items.find((item) => item.codigo.trim().toUpperCase() === codigoNormalizado) ?? null
    }

    const cargarProtocoloSeleccionado = async () => {
        if (!protocoloSeleccionado) {
            setErrorProtocolo('Selecciona un protocolo antes de precargar codigos')
            return
        }

        setErrorProtocolo(null)
        setCargandoProtocolo(true)

        try {
            const resultados = await Promise.all(
                protocoloSeleccionado.codigos.map(async (codigo) => ({
                    codigo,
                    nomenclador: await resolverNomencladorExactoPorCodigo(codigo, {
                        ignorarConvenio: true,
                    }),
                }))
            )

            const faltantes = resultados
                .filter((item) => !item.nomenclador)
                .map((item) => item.codigo)

            const matriculaDefault =
                matriculaTratanteDefault != null && matriculaTratanteDefault > 0
                    ? String(matriculaTratanteDefault)
                    : ''

            const editables: ProtocoloCargaEditable[] = resultados
                .filter((item): item is { codigo: string; nomenclador: NomencladorItemProtocolo } => Boolean(item.nomenclador))
                .map(({ codigo, nomenclador }) => {
                    const requiereMatriculaTratante = nomenclador.valorEspecialista != null
                    return {
                        convenioId: nomenclador.convenioId,
                        codigo: nomenclador.codigo.trim(),
                        descripcion: nomenclador.descripcion,
                        clasificacion: clasificacionProtocoloPorCodigo(protocoloSeleccionado, codigo, nomenclador),
                        cantidad: cantidadComunProtocolo,
                        requiereMatriculaTratante,
                        matriculaTratante: requiereMatriculaTratante ? matriculaDefault : '',
                        matriculaAnestesista:
                            nomenclador.valorAnestesista != null ? MATRICULA_ANESTESISTA_DEFAULT : null,
                        importeBaseUnitario: importeBaseDesdeNomenclador(nomenclador),
                        valorReferencial: nomenclador.valor,
                    }
                })

            setProtocoloItems(editables)

            if (editables.length === 0) {
                setErrorProtocolo('No se encontraron codigos del protocolo en el nomenclador')
                return
            }

            if (faltantes.length > 0) {
                setErrorProtocolo(
                    `Se cargaron codigos parciales. No encontrados: ${faltantes.join(', ')}`
                )
            }
        } catch {
            setErrorProtocolo('No se pudieron precargar los codigos del protocolo')
        } finally {
            setCargandoProtocolo(false)
        }
    }

    const actualizarCantidadComunProtocolo = (cantidad: string) => {
        setCantidadComunProtocolo(cantidad)
        setProtocoloItems((prev) => prev.map((item) => ({ ...item, cantidad })))
    }

    const actualizarProtocoloItem = (
        codigo: string,
        patch: Partial<Pick<ProtocoloCargaEditable, 'matriculaTratante'>>
    ) => {
        setProtocoloItems((prev) =>
            prev.map((item) => (item.codigo === codigo ? { ...item, ...patch } : item))
        )
    }

    const construirEntradasProtocolo = (): {
        entradas: PracticaCargaEntrada[]
        error?: string
    } => {
        if (protocoloItems.length === 0) {
            return {
                entradas: [],
                error: 'Primero precarga un protocolo',
            }
        }

        if (!fechaProtocolo) {
            return {
                entradas: [],
                error: 'Selecciona una fecha valida para el protocolo',
            }
        }

        const fecha = fechaSoloPracticaAISOString(fechaProtocolo)
        const cantidadComun = Number.parseInt(cantidadComunProtocolo, 10)
        if (!Number.isFinite(cantidadComun) || cantidadComun <= 0 || cantidadComun > 999) {
            return {
                entradas: [],
                error: 'Ingresa una cantidad comun valida (1-999) para el protocolo',
            }
        }

        const entradas: PracticaCargaEntrada[] = []

        for (const item of protocoloItems) {
            let matriculaEspecialista: number | null = null
            if (item.requiereMatriculaTratante) {
                const parsed = Number.parseInt(item.matriculaTratante.trim(), 10)
                if (!Number.isFinite(parsed) || parsed <= 0) {
                    return {
                        entradas: [],
                        error: `Ingresa matricula del medico tratante para el codigo ${item.codigo}`,
                    }
                }
                matriculaEspecialista = parsed
            }

            entradas.push({
                payload: {
                    convenioId: item.convenioId,
                    codigoPractica: item.codigo,
                    descripcionPractica: item.descripcion,
                    fecha,
                    cantidad: cantidadComun,
                    numeroAutorizacion: null,
                    matriculaEspecialista,
                    matriculaAnestesista: item.matriculaAnestesista,
                    facturable: true,
                    importeBaseUnitario: item.importeBaseUnitario,
                },
                clasificacion: item.clasificacion,
            })
        }

        return { entradas }
    }

    const ejecutarProtocolo = async (imprimirDespues: boolean) => {
        setMensajeError(null)
        setErrorProtocolo(null)
        const ventanaImpresionProtocolo = imprimirDespues ? abrirVentanaImpresionPendiente() : null

        const { entradas, error } = construirEntradasProtocolo()
        if (error) {
            setErrorProtocolo(error)
            cerrarVentanaImpresion(ventanaImpresionProtocolo)
            return
        }

        setProcesandoProtocolo(true)
        try {
            const resultadoGuardado = await handleGuardarPracticas(entradas)
            if (!resultadoGuardado.ok) {
                setErrorProtocolo(resultadoGuardado.error ?? 'No se pudo guardar el protocolo')
                cerrarVentanaImpresion(ventanaImpresionProtocolo)
                return
            }

            const practicaIds = resultadoGuardado.practicaIds ?? []
            if (practicaIds.length === 0) {
                setErrorProtocolo('El protocolo se guardo, pero no se pudieron identificar practicas para generar ordenes')
                cerrarVentanaImpresion(ventanaImpresionProtocolo)
                return
            }

            const clasificacionPorPracticaId = Object.fromEntries(
                practicaIds.map((practicaId, idx) => [
                    practicaId,
                    entradas[idx]?.clasificacion ?? 'HE',
                ])
            )

            const okGeneracion = encolarGeneracionOrdenes(imprimirDespues, practicaIds, false, {
                origen: 'protocolo',
                clasificacionPorPracticaId,
                firmanteProfesionalId: medicoFirmanteId,
                ventanaImpresionPrefijada: ventanaImpresionProtocolo,
            })

            if (okGeneracion) {
                setProtocoloItems([])
            } else {
                cerrarVentanaImpresion(ventanaImpresionProtocolo)
            }
        } finally {
            setProcesandoProtocolo(false)
        }
    }

    const todasPendientesSeleccionadas =
        idsPendientesEditor.length > 0 && idsPendientesEditor.every((id) => practicasSeleccionadas.includes(id))

    const gruposFiltradosHistoricos = ordenesAutorizadas.filter((grupo) => {
        if (
            grupo.tipo === 'orden' &&
            grupo.puestoNumero != null &&
            grupo.ordenNumero != null &&
            ordenesAnuladasTemporalSet.has(`${grupo.puestoNumero}:${grupo.ordenNumero}`)
        ) {
            return false
        }

        const yaAutorizada = grupoTieneNumeroAutorizacion(grupo)
        return yaAutorizada ? mostrarOrdenesYaAutorizadas : mostrarOrdenesPendientesAutorizacion
    })

    const gruposHistoricosBuscadosYOrdenados = useMemo(() => {
        const query = normalizarBusqueda(busquedaHistorico)

        const filtrados = gruposFiltradosHistoricos.filter((grupo) => {
            if (!query) return true

            const numeroOrden =
                grupo.tipo === 'orden' && grupo.puestoNumero != null && grupo.ordenNumero != null
                    ? formatearNumeroOrden(grupo.puestoNumero, grupo.ordenNumero)
                    : ''
            const numeroAut = grupo.numeroAutorizacion ?? ''
            const codigos = grupo.practicas.map((p) => p.codigoPractica.trim()).join(' ')
            const descripciones = grupo.practicas.map((p) => descripcionParaMostrar(p)).join(' ')
            const textoGrupo = normalizarBusqueda(`${numeroOrden} ${numeroAut} ${codigos} ${descripciones}`)
            return textoGrupo.includes(query)
        })

        return [...filtrados].sort((a, b) => {
            const aConAut = grupoTieneNumeroAutorizacion(a) ? 1 : 0
            const bConAut = grupoTieneNumeroAutorizacion(b) ? 1 : 0
            if (aConAut !== bConAut) return aConAut - bConAut
            return 0
        })
    }, [gruposFiltradosHistoricos, busquedaHistorico])

    const totalPaginasHistorico = Math.max(
        1,
        Math.ceil(gruposHistoricosBuscadosYOrdenados.length / ORDENES_HISTORICO_POR_PAGINA)
    )

    useEffect(() => {
        setPaginaHistorico(1)
    }, [busquedaHistorico, mostrarOrdenesPendientesAutorizacion, mostrarOrdenesYaAutorizadas])

    useEffect(() => {
        setPaginaHistorico((prev) => Math.min(prev, totalPaginasHistorico))
    }, [totalPaginasHistorico])

    const gruposHistoricosPaginados = useMemo(() => {
        const inicio = (paginaHistorico - 1) * ORDENES_HISTORICO_POR_PAGINA
        return gruposHistoricosBuscadosYOrdenados.slice(inicio, inicio + ORDENES_HISTORICO_POR_PAGINA)
    }, [gruposHistoricosBuscadosYOrdenados, paginaHistorico])

    const renderGrupoOrden = (grupo: GrupoPracticasAutorizadas) => {
        const abierta = ordenesAutorizadasAbiertas[grupo.key] ?? false
        const expandida = ordenesAutorizadasExpandidas[grupo.key] ?? false
        const editandoAutorizacion = ordenEditandoAutorizacionKey === grupo.key
        const guardandoAutorizacionOrden = guardandoAutorizacionOrdenKey === grupo.key
        const grupoPermiteEditarAutorizacion =
            puedeCrear &&
            grupo.tipo === 'orden' &&
            grupo.puestoNumero != null &&
            grupo.ordenNumero != null
        const limitePracticas = 3
        const practicasVisibles = expandida ? grupo.practicas : grupo.practicas.slice(0, limitePracticas)
        const restantes = Math.max(0, grupo.practicas.length - practicasVisibles.length)
        const destinoAbrir = obtenerDestinoGrupoPracticasAutorizadas(grupo)
        const sinAutorizacion = !grupoTieneNumeroAutorizacion(grupo)
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
        const subitemsResumen = ordenarSubitems(
            Array.from(
                grupo.practicas.reduce((set, practica) => {
                    for (const subitem of subitemsPracticaPorGrupo(practica, grupo)) {
                        set.add(subitem)
                    }
                    return set
                }, new Set<string>())
            )
        ).join('+') || '-'
        const claveOrdenSesion =
            grupo.tipo === 'orden' && grupo.puestoNumero != null && grupo.ordenNumero != null
                ? `${grupo.puestoNumero}-${grupo.ordenNumero}`
                : null
        const generadaEnSesion = claveOrdenSesion != null && ordenesGeneradasSesionSet.has(claveOrdenSesion)
        const grupoFacturado = grupo.practicas.some((practica) => practicaFacturada(practica))
        const puedeAnularGrupo =
            grupo.tipo === 'orden' &&
            grupo.puestoNumero != null &&
            grupo.ordenNumero != null &&
            !grupoFacturado
        const grupoAnulandose = anulandoOrdenKey === grupo.key

        const contenedorClase = generadaEnSesion
            ? 'border border-blue-300 bg-blue-100/60'
            : sinAutorizacion
                ? 'border border-amber-300 bg-amber-100/60'
                : 'border border-emerald-200 bg-emerald-50/40'

        const tituloClase = generadaEnSesion
            ? 'text-blue-900'
            : sinAutorizacion
                ? 'text-amber-900'
                : 'text-emerald-900'

        const hoverClase = generadaEnSesion
            ? 'hover:bg-blue-200/50'
            : sinAutorizacion
                ? 'hover:bg-amber-200/50'
                : 'hover:bg-emerald-100/40'

        const contadorClase = generadaEnSesion
            ? 'text-blue-800'
            : sinAutorizacion
                ? 'text-amber-800'
                : 'text-emerald-700'

        const badgeEstadoClase = generadaEnSesion
            ? 'text-blue-800'
            : grupoTieneNumeroAutorizacion(grupo)
                ? 'text-emerald-800'
                : 'text-amber-900 font-semibold'

        const bloqueDetalleClase = generadaEnSesion
            ? 'rounded-md border border-blue-200 bg-white/80 p-1.5'
            : 'rounded-md border border-emerald-200 bg-white/70 p-1.5'

        const tituloDetalleClase = generadaEnSesion
            ? 'text-[11px] font-semibold uppercase tracking-wide text-blue-700'
            : 'text-[11px] font-semibold uppercase tracking-wide text-emerald-700'

        const botonExpandirClase = generadaEnSesion
            ? 'rounded border border-blue-300 px-2 py-0.5 text-[11px] font-medium text-blue-800 hover:bg-blue-50'
            : 'rounded border border-emerald-300 px-2 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-50'

        const itemClase = generadaEnSesion
            ? 'rounded border border-blue-100 bg-white px-2 py-1'
            : 'rounded border border-emerald-100 bg-white px-2 py-1'

        const itemTextoClase = generadaEnSesion ? 'text-blue-900' : 'text-emerald-900'
        const itemFechaClase = generadaEnSesion ? 'text-[11px] text-blue-700' : 'text-[11px] text-emerald-700'
        const restantesClase = generadaEnSesion ? 'mt-1 text-[11px] text-blue-700' : 'mt-1 text-[11px] text-emerald-700'
        const estadoSesionEtiqueta = generadaEnSesion ? 'Sesión actual' : null
        const fechaResumenOrden = formatearFechaArgentina(grupo.fechaReferencia, {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        })
        const matriculasEjecutantes = grupo.tipo === 'orden'
            ? Array.from(new Set(
                grupo.practicas.flatMap((practica) =>
                    practica.ordenPractica
                        .filter((orden) =>
                            orden.puestoNumero === grupo.puestoNumero &&
                            orden.ordenNumero === grupo.ordenNumero
                        )
                        .map((orden) => orden.efectorMatricula)
                        .filter((matricula): matricula is number =>
                            typeof matricula === 'number' && Number.isFinite(matricula) && matricula > 0
                        )
                )
            )).sort((a, b) => a - b)
            : []

        return (
            <div
                key={grupo.key}
                className={`rounded-lg p-2 text-xs ${contenedorClase}`}
            >
                <button
                    type="button"
                    onClick={() => setOrdenesAutorizadasAbiertas((prev) => ({
                        ...prev,
                        [grupo.key]: !(prev[grupo.key] ?? false),
                    }))}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-1 py-0 text-left ${hoverClase}`}
                >
                    <span className={`flex min-w-0 items-center gap-2 ${tituloClase}`}>
                        <ChevronRight className={`h-4 w-4 transition-transform ${abierta ? 'rotate-90' : ''}`} />
                        <span className="shrink-0 font-semibold">
                            {grupo.tipo === 'orden' && grupo.puestoNumero && grupo.ordenNumero
                                ? `Orden ${formatearNumeroOrden(grupo.puestoNumero, grupo.ordenNumero)}`
                                : `Autorizacion ${grupo.numeroAutorizacion ?? '-'}`}
                            {grupo.tipo === 'orden' && ` · Matricula efector: ${matriculasEjecutantes.join(', ') || '-'}`}
                        </span>
                        <span className={`min-w-0 truncate text-[10px] ${contadorClase}`}>
                            Cod/Cant: {codigosResumen}{codigosRestantes > 0 ? ` +${codigosRestantes}` : ''} · Subitem: {subitemsResumen} · Fecha: {fechaResumenOrden}
                        </span>
                        {estadoSesionEtiqueta && (
                            <span className="rounded border border-blue-300 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                                {estadoSesionEtiqueta}
                            </span>
                        )}
                    </span>
                    <span className={`text-[11px] ${contadorClase}`}>
                        {grupo.practicas.length} practica(s)
                    </span>
                </button>

                {abierta && (
                    <div className="mt-1.5 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                            {destinoAbrir && (
                                <Link
                                    href={destinoAbrir}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={generadaEnSesion
                                        ? 'inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-900 hover:bg-blue-200'
                                        : 'inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-900 hover:bg-emerald-200'}
                                >
                                    Abrir orden
                                </Link>
                            )}
                            {grupoPermiteEditarAutorizacion && (
                                <button
                                    type="button"
                                    onClick={() => iniciarEdicionAutorizacionOrden(grupo)}
                                    disabled={guardandoAutorizacionOrden}
                                    className={generadaEnSesion
                                        ? 'inline-flex items-center rounded-full border border-blue-300 bg-white px-2 py-0.5 text-[11px] font-medium text-blue-800 hover:bg-blue-50 disabled:opacity-50'
                                        : 'inline-flex items-center rounded-full border border-emerald-300 bg-white px-2 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50'}
                                >
                                    {grupo.numeroAutorizacion ? 'Editar N° autorizacion' : 'Agregar N° autorizacion'}
                                </button>
                            )}
                            {puedeCrear && grupo.tipo === 'orden' && grupo.puestoNumero != null && grupo.ordenNumero != null && (
                                <button
                                    type="button"
                                    onClick={() => void anularOrdenDesdeGrupo(grupo.puestoNumero as number, grupo.ordenNumero as number, grupo.key)}
                                    disabled={grupoAnulandose || !puedeAnularGrupo}
                                    title={!puedeAnularGrupo ? 'La orden ya esta facturada' : 'Anular orden'}
                                    className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                                >
                                    {grupoAnulandose && <Loader2 className="h-3 w-3 animate-spin" />}
                                    {grupoAnulandose ? 'Anulando...' : 'Anular orden'}
                                </button>
                            )}
                            <span className={badgeEstadoClase}>
                                Estado: {grupoTieneNumeroAutorizacion(grupo) ? 'Autorizada' : 'Pendiente de autorizacion'}
                            </span>
                        </div>

                        {editandoAutorizacion && grupoPermiteEditarAutorizacion && (
                            <div className="rounded-md border border-blue-200 bg-white/90 p-2">
                                <label className="block text-[11px] font-medium text-blue-900">
                                    N° autorizacion
                                    <input
                                        type="text"
                                        maxLength={15}
                                        value={borradorNumeroAutorizacion}
                                        onChange={(e) => setBorradorNumeroAutorizacion(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault()
                                                void guardarAutorizacionOrden(grupo)
                                            }
                                            if (e.key === 'Escape') {
                                                e.preventDefault()
                                                cancelarEdicionAutorizacionOrden()
                                            }
                                        }}
                                        className="mt-1 w-full rounded border border-blue-300 bg-white px-2 py-1 text-xs text-blue-900"
                                        placeholder="Ej: 123456"
                                    />
                                </label>
                                <div className="mt-2 flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => void guardarAutorizacionOrden(grupo)}
                                        disabled={guardandoAutorizacionOrden}
                                        className="inline-flex items-center rounded border border-blue-300 bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                                    >
                                        {guardandoAutorizacionOrden ? 'Guardando...' : 'Guardar autorizacion'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={cancelarEdicionAutorizacionOrden}
                                        disabled={guardandoAutorizacionOrden}
                                        className="inline-flex items-center rounded border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className={bloqueDetalleClase}>
                            <div className="flex items-center justify-between gap-2">
                                <p className={tituloDetalleClase}>
                                    Practicas de la orden ({grupo.practicas.length})
                                </p>
                                {grupo.practicas.length > limitePracticas && (
                                    <button
                                        type="button"
                                        onClick={() => setOrdenesAutorizadasExpandidas((prev) => ({
                                            ...prev,
                                            [grupo.key]: !(prev[grupo.key] ?? false),
                                        }))}
                                        className={botonExpandirClase}
                                    >
                                        {expandida ? 'Contraer' : 'Expandir'}
                                    </button>
                                )}
                            </div>

                            <div className="mt-1.5 space-y-1">
                                {practicasVisibles.map((practica) => {
                                    const subitemsPractica = subitemsPracticaPorGrupo(practica, grupo).join('+') || '-'

                                    return (
                                        <div key={`${grupo.key}-${practica.id}`} className={itemClase}>
                                            <div className={`flex items-center justify-between gap-2 ${itemTextoClase}`}>
                                                <span className="font-mono text-[11px]">{practica.codigoPractica.trim()}</span>
                                                <span className="font-medium">Cant. {practica.cantidad}</span>
                                            </div>
                                            <p className={itemTextoClase}>{descripcionParaMostrar(practica)}</p>
                                            <p className={itemFechaClase}>
                                                Subitem: {subitemsPractica} · {formatearFechaArgentina(practica.fecha, {
                                                    day: '2-digit',
                                                    month: '2-digit',
                                                    year: 'numeric',
                                                })}
                                            </p>
                                            <div className="mt-1 flex items-center justify-end gap-2">
                                                {practicaFacturada(practica) && (
                                                    <span className="inline-flex rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                                                        Facturada
                                                    </span>
                                                )}
                                                {puedeCrear && (
                                                    <button
                                                        type="button"
                                                        onClick={() => abrirEdicionPractica(practica)}
                                                        disabled={guardandoPracticaEditando}
                                                        title="Editar practica"
                                                        className="inline-flex items-center rounded border border-blue-200 bg-white px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                                                    >
                                                        Editar
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            {!expandida && restantes > 0 && (
                                <p className={restantesClase}>+{restantes} practica(s) mas</p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        )
    }

    return (
        <>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
                <div className="order-2 space-y-4 lg:order-0 lg:col-start-1">
                    {puedeCrear ? (
                        <PracticaCargaForm
                            convenioId={convenioId}
                            sectorInternacionActual={sectorInternacionActual}
                            matriculaTratanteDefault={matriculaTratanteDefault}
                            onGuardar={handleGuardarPracticasModoRapido}
                            titulo={modoCirugia ? 'Carga rapida de practicas de cirugia' : 'Carga rapida de practicas'}
                            modoCargaRapida
                            autoFocusBusqueda
                            soloFechaPractica
                            ocultarContextoBusquedaRapida
                        />
                    ) : (
                        <div className="his-card p-4 text-sm text-gray-700">
                            No tenes permisos para cargar practicas en esta internacion.
                        </div>
                    )}

                    {puedeCrear && !modoCirugia && (
                        <div className="his-card p-4 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <h3 className="text-sm font-semibold text-gray-900">Protocolos de practicas</h3>
                                {protocoloItems.length > 0 && (
                                    <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                                        {protocoloItems.length} codigo(s) cargado(s)
                                    </span>
                                )}
                            </div>

                            <p className="text-xs text-gray-600">
                                Selecciona un protocolo, precarga los codigos, ajusta matricula tratante y el medico firmante. La cantidad se aplica igual para todos los codigos del protocolo.
                            </p>

                            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                                <label className="text-xs text-gray-700">
                                    Protocolo
                                    <select
                                        value={protocoloSeleccionadoId}
                                        onChange={(e) => {
                                            setProtocoloSeleccionadoId(e.target.value)
                                            setCantidadComunProtocolo('1')
                                            setProtocoloItems([])
                                            setErrorProtocolo(null)
                                        }}
                                        className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800"
                                    >
                                        {PROTOCOLOS_PREDEFINIDOS.map((protocolo) => (
                                            <option key={protocolo.id} value={protocolo.id}>
                                                {protocolo.nombre}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label className="text-xs text-gray-700">
                                    Fecha del protocolo
                                    <input
                                        type="date"
                                        value={fechaProtocolo}
                                        onChange={(e) => setFechaProtocolo(e.target.value)}
                                        className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800"
                                    />
                                </label>

                                <label className="text-xs text-gray-700">
                                    Cantidad comun
                                    <input
                                        type="number"
                                        min={1}
                                        max={999}
                                        step={1}
                                        value={cantidadComunProtocolo}
                                        onChange={(e) => actualizarCantidadComunProtocolo(e.target.value)}
                                        className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800"
                                    />
                                </label>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => void cargarProtocoloSeleccionado()}
                                    disabled={cargandoProtocolo || procesandoProtocolo}
                                    className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                >
                                    {cargandoProtocolo && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                                    Precargar codigos del protocolo
                                </button>
                            </div>

                            <label className="block w-full text-[11px] text-gray-700">
                                Medico firmante del protocolo
                                <ProfesionalSelect
                                    profesionales={profesionalesConMatricula}
                                    value={medicoFirmanteId}
                                    onChange={(nextValue) => {
                                        setMedicoFirmanteId(nextValue)
                                        setFirmanteEditadoManualmente(true)
                                    }}
                                    permitirCargaManual
                                    textoBotonCargaManual="Agregar firmante manual (nombre + matricula)"
                                    onProfesionalCreado={registrarProfesionalCreado}
                                    autoSelectOnSearch={false}
                                    disabled={procesandoProtocolo}
                                    placeholderOption="-- Seleccionar firmante --"
                                    searchPlaceholder="Buscar por nombre o matricula"
                                    selectClassName="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 disabled:bg-gray-100 disabled:text-gray-500"
                                    searchClassName="mt-1 w-full rounded border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-900 disabled:bg-gray-100 disabled:text-gray-500"
                                />
                                <span className="mt-1 block text-[10px] text-gray-600">
                                    Firma prevista: {firmaPrevistaTexto}
                                </span>
                            </label>

                            {protocoloItems.length > 0 && (
                                <div className="max-h-[40vh] space-y-2 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-2">
                                    {protocoloItems.map((item) => (
                                        <div key={item.codigo} className="rounded border border-gray-200 bg-white p-2">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <span className="font-mono text-xs text-gray-700">{item.codigo}</span>
                                                <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                                    {item.clasificacion}
                                                </span>
                                            </div>
                                            <p className="mt-1 text-xs text-gray-700">{item.descripcion}</p>
                                            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                                                <label className="text-[11px] text-gray-600">
                                                    Cantidad comun
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        max={999}
                                                        step={1}
                                                        value={item.cantidad}
                                                        readOnly
                                                        className="mt-1 w-full rounded border border-gray-300 bg-gray-100 px-2 py-1 text-xs text-gray-700"
                                                    />
                                                </label>

                                                <label className="text-[11px] text-gray-600">
                                                    Matricula tratante
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        step={1}
                                                        value={item.matriculaTratante}
                                                        onChange={(e) =>
                                                            actualizarProtocoloItem(item.codigo, {
                                                                matriculaTratante: e.target.value,
                                                            })
                                                        }
                                                        disabled={!item.requiereMatriculaTratante}
                                                        placeholder={item.requiereMatriculaTratante ? 'Ej: 12345' : 'No aplica'}
                                                        className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-800 disabled:bg-gray-100 disabled:text-gray-500"
                                                    />
                                                </label>

                                                <div className="text-[11px] text-gray-600">
                                                    Valor referencia
                                                    <p className="mt-1 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700">
                                                        {item.valorReferencial != null ? item.valorReferencial.toFixed(2) : '-'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {errorProtocolo && (
                                <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                                    {errorProtocolo}
                                </p>
                            )}

                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => void ejecutarProtocolo(true)}
                                    disabled={
                                        procesandoProtocolo ||
                                        cargandoProtocolo ||
                                        protocoloItems.length === 0
                                    }
                                    className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {procesandoProtocolo ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Printer className="h-3.5 w-3.5" />
                                    )}
                                    Generar protocolo e imprimir
                                </button>
                            </div>
                        </div>
                    )}

                    {mensajeError && (
                        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                            {mensajeError}
                        </p>
                    )}

                    {hayGeneracionesEnBackground && (
                        <p className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-xs text-blue-800">
                            Generando ordenes en segundo plano: {tareasGeneracionPendientes} tarea(s) en cola. Puedes seguir cargando practicas y encolando nuevas ordenes.
                        </p>
                    )}

                    {hayGuardadosEnBackground && (
                        <p className="rounded-lg border border-cyan-200 bg-cyan-50 p-2 text-xs text-cyan-800">
                            Guardando practicas en segundo plano: {tareasGuardadoPendientes} item(s) en cola. Puedes seguir cargando sin esperar.
                        </p>
                    )}

                    {modoCirugia && (
                        <div className="his-card p-4 space-y-3">
                            <p className="text-xs text-gray-700">
                                Practicas pendientes de esta cirugia: {idsPendientesCirugiaObjetivo.length}
                            </p>

                            <label className="block w-full text-[11px] text-emerald-900">
                                Cirujano firmante
                                <ProfesionalSelect
                                    profesionales={profesionalesConMatricula}
                                    value={medicoFirmanteId}
                                    onChange={(nextValue) => {
                                        setMedicoFirmanteId(nextValue)
                                        setFirmanteEditadoManualmente(true)
                                    }}
                                    permitirCargaManual
                                    textoBotonCargaManual="Agregar firmante manual (nombre + matricula)"
                                    onProfesionalCreado={registrarProfesionalCreado}
                                    autoSelectOnSearch={false}
                                    placeholderOption="-- Seleccionar firmante --"
                                    searchPlaceholder="Buscar por nombre o matricula"
                                    selectClassName="mt-1 w-full rounded border border-emerald-300 bg-white px-2 py-1 text-xs text-emerald-900 disabled:bg-emerald-100 disabled:text-emerald-700"
                                    searchClassName="mt-1 w-full rounded border border-emerald-200 bg-white px-2 py-1 text-[11px] text-emerald-900 disabled:bg-emerald-100 disabled:text-emerald-700"
                                />
                                <span className="mt-1 block text-[10px] text-emerald-700">
                                    Se sugiere automáticamente el primer especialista no patólogo de las prácticas seleccionadas.
                                </span>
                                <span className="block text-[10px] text-emerald-800">Firma prevista: {firmaPrevistaTexto}</span>
                            </label>
                        </div>
                    )}

                    <div className="his-card p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-sm font-semibold text-gray-900">Gestion de grupos de practicas</h3>
                            <button
                                type="button"
                                onClick={() => setMostrarEditorGrupos((prev) => !prev)}
                                className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                            >
                                <Settings2 className="h-3.5 w-3.5" />
                                Editar grupos de practicas
                                {mostrarEditorGrupos ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                        </div>

                        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                            Pendientes para generar: {idsPendientesEditor.length} · Seleccionadas: {idsPendientesSeleccionadasEditor.length}
                        </div>

                        {mostrarEditorGrupos && (
                            <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50/70 p-3">
                                <label className="inline-flex items-center gap-2 text-xs text-amber-900">
                                    <input
                                        type="checkbox"
                                        checked={todasPendientesSeleccionadas}
                                        onChange={(e) => alternarSeleccionLista(idsPendientesEditor, e.target.checked)}
                                        className="h-4 w-4 rounded border-amber-300 text-amber-700 focus:ring-amber-500"
                                    />
                                    {modoCirugia
                                        ? 'Seleccionar todas las practicas pendientes de esta cirugia'
                                        : 'Seleccionar todas las practicas pendientes'}
                                </label>

                                <div className="space-y-1 rounded-md border border-amber-200 bg-white/80 p-2">
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                                        Modo de generacion
                                    </p>
                                    <label className="inline-flex items-center gap-2 text-xs text-amber-900">
                                        <input
                                            type="radio"
                                            name={`modo-generacion-${ingresoId}`}
                                            checked={!generarImprimirPorSeparadoEditor}
                                            onChange={() => setGenerarImprimirPorSeparadoEditor(false)}
                                            className="h-4 w-4 border-amber-300 text-amber-700 focus:ring-amber-500"
                                        />
                                        Generar todas juntas en una sola orden
                                    </label>
                                    <label className="inline-flex items-center gap-2 text-xs text-amber-900">
                                        <input
                                            type="radio"
                                            name={`modo-generacion-${ingresoId}`}
                                            checked={generarImprimirPorSeparadoEditor}
                                            onChange={() => {
                                                setGenerarImprimirPorSeparadoEditor(true)
                                                alternarSeleccionLista(idsPendientesEditor, true)
                                            }}
                                            className="h-4 w-4 border-amber-300 text-amber-700 focus:ring-amber-500"
                                        />
                                        Generar e imprimir por separado (una orden por practica)
                                    </label>
                                </div>

                                {practicasPendientesEditorAgrupadas.length === 0 ? (
                                    <p className="text-xs text-gray-500">
                                        {modoCirugia
                                            ? 'No hay practicas pendientes de esta cirugia para editar grupos.'
                                            : 'No hay practicas pendientes para editar grupos.'}
                                    </p>
                                ) : (
                                    <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
                                        {practicasPendientesEditorAgrupadas.map((grupo) => (
                                            <div key={`pend-${grupo.clasificacion}`} className="rounded-md border border-gray-200 bg-white p-1.5">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="inline-flex items-center rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                                        {grupo.clasificacion}
                                                    </span>
                                                    <span className="text-[11px] text-gray-600">
                                                        Titulo de la orden: {tituloDesdeClasificacion(grupo.clasificacion)}
                                                    </span>
                                                </div>
                                                <div className="mt-2 space-y-1.5">
                                                    {grupo.items.map((practica) => (
                                                        <div
                                                            key={practica.id}
                                                            className="flex flex-col gap-1 rounded border border-gray-200 bg-gray-50 px-1.5 py-1 text-[11px] md:flex-row md:flex-wrap md:items-center"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={practicasSeleccionadas.includes(practica.id)}
                                                                onChange={(e) => alternarSeleccionPractica(practica.id, e.target.checked)}
                                                                className="h-3.5 w-3.5 rounded border-gray-300 text-amber-700 focus:ring-amber-500"
                                                            />
                                                            <span className="font-mono text-[10px] text-gray-500">{practica.codigoPractica.trim()}</span>
                                                            <span className="min-w-0 truncate font-medium text-gray-800">
                                                                {descripcionParaMostrar(practica)}
                                                            </span>
                                                            <span className="text-[10px] text-gray-500">Cant: {practica.cantidad}</span>
                                                            <span className="text-[10px] text-gray-500">
                                                                Fecha: {formatearFechaArgentina(practica.fecha, {
                                                                    day: '2-digit',
                                                                    month: '2-digit',
                                                                    year: 'numeric',
                                                                })}
                                                            </span>
                                                            <span className="text-[10px] text-gray-500">Clasif.</span>
                                                            <input
                                                                type="text"
                                                                value={obtenerClasificacionPractica(practica)}
                                                                onChange={(e) => {
                                                                    const raw = e.target.value.toUpperCase()
                                                                    setClasificacionPorPracticaId((prev) => ({
                                                                        ...prev,
                                                                        [practica.id]: normalizarClasificacionAgrupacion(raw) ?? raw.replace(/\s+/g, ''),
                                                                    }))
                                                                }}
                                                                className="w-20 rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-700"
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {idsPendientesSeleccionadasEditor.length > 0 ? (
                                    <>
                                        <label className="block w-full text-[11px] text-amber-900">
                                            Medico firmante
                                            <ProfesionalSelect
                                                profesionales={profesionalesConMatricula}
                                                value={medicoFirmanteId}
                                                onChange={(nextValue) => {
                                                    setMedicoFirmanteId(nextValue)
                                                    setFirmanteEditadoManualmente(true)
                                                }}
                                                permitirCargaManual
                                                textoBotonCargaManual="Agregar firmante manual (nombre + matricula)"
                                                onProfesionalCreado={registrarProfesionalCreado}
                                                autoSelectOnSearch={false}
                                                placeholderOption="-- Seleccionar firmante --"
                                                searchPlaceholder="Buscar por nombre o matricula"
                                                selectClassName="mt-1 w-full rounded border border-amber-300 bg-white px-2 py-1 text-xs text-amber-900 disabled:bg-amber-100 disabled:text-amber-700"
                                                searchClassName="mt-1 w-full rounded border border-amber-200 bg-white px-2 py-1 text-[11px] text-amber-900 disabled:bg-amber-100 disabled:text-amber-700"
                                            />
                                            <span className="mt-1 block text-[10px] text-amber-800">Firma prevista: {firmaPrevistaTexto}</span>
                                        </label>

                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => solicitarConfirmacionOrdenUnica(false)}
                                                disabled={modoCirugia && !firmanteCirugiaValido}
                                                className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                            >
                                                {generandoOrdenes && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                                                {generarImprimirPorSeparadoEditor ? 'Generar por practica' : 'Generar una orden'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => solicitarConfirmacionOrdenUnica(true)}
                                                disabled={modoCirugia && !firmanteCirugiaValido}
                                                className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                                            >
                                                <Printer className="h-3.5 w-3.5" />
                                                {generarImprimirPorSeparadoEditor ? 'Generar e imprimir por practica' : 'Generar una orden e imprimir'}
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <p className="rounded-md border border-amber-200 bg-white px-2 py-1.5 text-[11px] text-amber-900">
                                        Selecciona una o mas practicas para habilitar la generacion de ordenes y el medico firmante.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {
                    <div className="his-card p-4 space-y-3">
                        <h3 className="text-sm font-semibold text-gray-900">Ordenes generadas</h3>

                        <div className="space-y-1">
                            <button
                                type="button"
                                onClick={() => setMostrarOrdenesPendientesAutorizacion((prev) => !prev)}
                                className="flex w-full items-center justify-between rounded border border-amber-200 bg-amber-50/50 px-2 py-1 text-left"
                            >
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                                    Sin numero de autorizacion ({ordenesPendientesAutorizacion.length})
                                </span>
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800">
                                    {mostrarOrdenesPendientesAutorizacion ? 'Contraer' : 'Expandir'}
                                    {mostrarOrdenesPendientesAutorizacion ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setMostrarOrdenesYaAutorizadas((prev) => !prev)}
                                className="flex w-full items-center justify-between rounded border border-emerald-200 bg-emerald-50/50 px-2 py-1 text-left"
                            >
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                    Con numero de autorizacion ({ordenesConAutorizacion.length})
                                </span>
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-800">
                                    {mostrarOrdenesYaAutorizadas ? 'Contraer' : 'Expandir'}
                                    {mostrarOrdenesYaAutorizadas ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                </span>
                            </button>
                        </div>

                        {ordenesAutorizadas.length === 0 ? (
                            <p className="text-xs text-gray-500">Todavia no hay ordenes generadas.</p>
                        ) : (
                            <div className="space-y-2">
                                <button
                                    type="button"
                                    onClick={() => setMostrarOrdenesHistoricas((prev) => !prev)}
                                    className="flex w-full items-center justify-between rounded border border-gray-300 bg-gray-50 px-2 py-1 text-left"
                                >
                                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                                        Historico de ordenes ({ordenesAutorizadas.length})
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-800">
                                        {mostrarOrdenesHistoricas ? 'Contraer' : 'Expandir'}
                                        {mostrarOrdenesHistoricas ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                    </span>
                                </button>

                                {mostrarOrdenesHistoricas && (
                                    <div className="rounded border border-gray-200 bg-gray-50 p-2">
                                        <input
                                            type="text"
                                            value={busquedaHistorico}
                                            onChange={(e) => setBusquedaHistorico(e.target.value)}
                                            placeholder="Buscar por orden, autorizacion, codigo o descripcion"
                                            className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700"
                                        />
                                    </div>
                                )}

                                {mostrarOrdenesHistoricas && gruposHistoricosBuscadosYOrdenados.length === 0 ? (
                                    <p className="rounded border border-gray-200 bg-gray-50/60 px-2 py-1 text-[11px] text-gray-600">
                                        No hay ordenes historicas que coincidan con los filtros actuales.
                                    </p>
                                ) : (
                                    mostrarOrdenesHistoricas && gruposHistoricosPaginados.map(renderGrupoOrden)
                                )}

                                {mostrarOrdenesHistoricas && gruposHistoricosBuscadosYOrdenados.length > 0 && (
                                    <div className="flex items-center justify-between rounded border border-gray-200 bg-white px-2 py-1.5 text-[11px] text-gray-700">
                                        <span>Pagina {paginaHistorico} de {totalPaginasHistorico}</span>
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => setPaginaHistorico((prev) => Math.max(1, prev - 1))}
                                                disabled={paginaHistorico <= 1}
                                                className="rounded border border-gray-300 px-2 py-0.5 disabled:opacity-50"
                                            >
                                                Anterior
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setPaginaHistorico((prev) => Math.min(totalPaginasHistorico, prev + 1))}
                                                disabled={paginaHistorico >= totalPaginasHistorico}
                                                className="rounded border border-gray-300 px-2 py-0.5 disabled:opacity-50"
                                            >
                                                Siguiente
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    }

                    {puedeCrear && !modoCirugia && (
                        <div className="his-card p-4 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <h3 className="text-sm font-semibold text-gray-900">Pedido de laboratorio</h3>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMostrarPedidoLaboratorio((prev) => !prev)
                                        if (mostrarPedidoLaboratorio) {
                                            limpiarPedidoLaboratorio()
                                        }
                                    }}
                                    className="inline-flex items-center rounded-md border border-indigo-300 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                                >
                                    {mostrarPedidoLaboratorio ? 'Ocultar' : 'Nuevo pedido'}
                                </button>
                            </div>

                            <p className="text-xs text-gray-600">
                                Crea la practica de laboratorio (codigo 66) con numero de protocolo y diagnostico.
                            </p>

                            {mostrarPedidoLaboratorio && (
                                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                                    <label className="text-xs text-gray-700">
                                        Fecha
                                        <input
                                            type="date"
                                            value={fechaPedidoLaboratorio}
                                            onChange={(e) => setFechaPedidoLaboratorio(e.target.value)}
                                            className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800"
                                        />
                                    </label>

                                    <label className="text-xs text-gray-700">
                                        Numero de protocolo
                                        <input
                                            type="text"
                                            value={numeroProtocoloLaboratorio}
                                            onChange={(e) => setNumeroProtocoloLaboratorio(e.target.value)}
                                            placeholder="Ej: 123456"
                                            className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800"
                                        />
                                    </label>

                                    <label className="text-xs text-gray-700">
                                        Diagnostico
                                        <input
                                            type="text"
                                            value={diagnosticoLaboratorio}
                                            onChange={(e) => setDiagnosticoLaboratorio(e.target.value)}
                                            placeholder="Opcional"
                                            className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800"
                                        />
                                    </label>

                                    <div className="md:col-span-3 flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => void crearPedidoLaboratorio()}
                                            disabled={guardandoPedidoLaboratorio}
                                            className="inline-flex items-center rounded-md border border-indigo-200 bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                                        >
                                            {guardandoPedidoLaboratorio ? 'Generando...' : 'Generar pedido'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setMostrarPedidoLaboratorio(false)
                                                limpiarPedidoLaboratorio()
                                            }}
                                            disabled={guardandoPedidoLaboratorio}
                                            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="order-1 space-y-4 lg:order-0 lg:col-start-2">
                    <div className="his-card p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            <ClipboardList className="h-4 w-4 text-blue-600" />
                            <h3 className="text-sm font-semibold text-gray-900">Codigos agregados en esta sesión</h3>
                        </div>
                        <p className="text-xs text-gray-600">
                            {modoCirugia
                                ? `Este panel confirma al instante cada codigo guardado para la cirugia #${contextoCirugia?.cirugiaId}.`
                                : 'Este panel confirma al instante cada codigo guardado para validar la carga sin perder ritmo.'}
                        </p>

                        <>
                            <div className="rounded-md border border-blue-100 bg-blue-50/60 px-2 py-1.5 text-[11px] text-blue-800">
                                Pendientes de esta sesión: {idsPendientesSesion.length}
                            </div>

                            {pendientesPrevias.length > 0 && (
                                <div className="rounded-md border border-amber-200 bg-amber-50/70 p-2">
                                    <p className="text-[11px] font-semibold text-amber-900">
                                        Pendientes previas sin orden: {pendientesPrevias.length}
                                    </p>
                                    <p className="mt-0.5 text-[10px] text-amber-800">
                                        Si no las necesitas, puedes eliminarlas antes de cargar nuevas para evitar mezcla.
                                    </p>
                                    <div className="mt-2 max-h-44 space-y-1 overflow-y-auto pr-1">
                                        {pendientesPrevias.map(({ practica, clasificacion }) => {
                                            const eliminando = eliminandoPracticaPendienteId === practica.id
                                            return (
                                                <div
                                                    key={`previa-${practica.id}`}
                                                    className="flex items-start justify-between gap-2 rounded border border-amber-200 bg-white px-2 py-1"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="font-mono text-[10px] text-amber-900">{practica.codigoPractica.trim()}</p>
                                                        <p className="truncate text-[11px] text-gray-700">{descripcionParaListaSesion(descripcionParaMostrar(practica))}</p>
                                                        <p className="text-[10px] text-gray-500">
                                                            Cant: {practica.cantidad} · Clasif: {clasificacion} · Fecha: {formatearFechaArgentina(practica.fecha, {
                                                                day: '2-digit',
                                                                month: '2-digit',
                                                                year: 'numeric',
                                                            })}
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => void eliminarPracticaPendiente(practica.id)}
                                                        disabled={eliminando}
                                                        title="Eliminar practica pendiente"
                                                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:opacity-50"
                                                    >
                                                        {eliminando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                                    </button>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => encolarGeneracionOrdenes(false, idsPendientesSesion, false, { origen: 'sesion' })}
                                    disabled={idsPendientesSesion.length === 0 || (modoCirugia && !firmanteCirugiaValido)}
                                    className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    {generandoOrdenes && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                                    Generar orden (sesión)
                                </button>
                                <button
                                    type="button"
                                    onClick={solicitarGeneracionDesdeSesion}
                                    disabled={idsPendientesSesion.length === 0 || (modoCirugia && !firmanteCirugiaValido)}
                                    className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                                >
                                    <Printer className="h-3.5 w-3.5" />
                                    Generar orden e imprimir (sesión)
                                </button>
                            </div>

                            {modoCirugia && !firmanteCirugiaValido && (
                                <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                                    Selecciona un medico firmante para generar o imprimir ordenes de la sesión.
                                </p>
                            )}
                        </>

                        {guardadasSesion.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-500">
                                No hay practicas pendientes en esta sesión.
                            </p>
                        ) : (
                            <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
                                {guardadasSesion.map((item) => (
                                    <div key={item.id} className="rounded-lg border border-blue-100 bg-blue-50/50 p-2.5">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="rounded border border-blue-100 bg-white px-2 py-1 font-mono text-xs font-semibold text-blue-700">
                                                {item.codigo}
                                            </span>
                                            <div className="inline-flex items-center gap-1.5">
                                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                                    Guardada
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => void eliminarPracticaPendiente(item.practicaId)}
                                                    disabled={eliminandoPracticaPendienteId === item.practicaId}
                                                    title="Eliminar practica pendiente"
                                                    className="inline-flex h-6 w-6 items-center justify-center rounded border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:opacity-50"
                                                >
                                                    {eliminandoPracticaPendienteId === item.practicaId
                                                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                        : <Trash2 className="h-3.5 w-3.5" />}
                                                </button>
                                            </div>
                                        </div>
                                        <p className="mt-1 text-xs text-gray-700">{item.descripcion}</p>
                                        <p className="mt-1 text-[11px] text-gray-600">
                                            Cant: {item.cantidad} · Clasif: {item.clasificacion} · Fecha: {item.fecha}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {practicaEditando && draftPracticaEditando && (
                <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/35 p-4 sm:items-center">
                    <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-blue-200 bg-white shadow-xl">
                        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900">Editar practica</h3>
                                <p className="text-xs text-gray-600">
                                    Puedes corregir fecha, cantidad, medicos y otros datos antes de facturar.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={cerrarEdicionPractica}
                                disabled={guardandoPracticaEditando}
                                className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                                Cerrar
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-4 py-3">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <label className="text-xs text-gray-600">
                                Codigo
                                <input
                                    type="text"
                                    value={draftPracticaEditando.codigoPractica}
                                    onChange={(e) => setDraftPracticaEditando((prev) => prev ? {
                                        ...prev,
                                        codigoPractica: e.target.value,
                                    } : prev)}
                                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-900"
                                />
                            </label>
                            <label className="text-xs text-gray-600">
                                Fecha
                                <input
                                    type="date"
                                    value={draftPracticaEditando.fecha}
                                    onChange={(e) => setDraftPracticaEditando((prev) => prev ? {
                                        ...prev,
                                        fecha: e.target.value,
                                    } : prev)}
                                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-900"
                                />
                            </label>
                            <label className="text-xs text-gray-600 md:col-span-2">
                                Descripcion
                                <input
                                    type="text"
                                    value={draftPracticaEditando.descripcionPractica}
                                    onChange={(e) => setDraftPracticaEditando((prev) => prev ? {
                                        ...prev,
                                        descripcionPractica: e.target.value,
                                    } : prev)}
                                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-900"
                                />
                            </label>
                            <label className="text-xs text-gray-600">
                                Cantidad
                                <input
                                    type="number"
                                    min={1}
                                    max={999}
                                    value={draftPracticaEditando.cantidad}
                                    onChange={(e) => setDraftPracticaEditando((prev) => prev ? {
                                        ...prev,
                                        cantidad: e.target.value,
                                    } : prev)}
                                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-900"
                                />
                            </label>
                            <label className="text-xs text-gray-600">
                                N° autorizacion
                                <input
                                    type="text"
                                    value={draftPracticaEditando.numeroAutorizacion}
                                    onChange={(e) => setDraftPracticaEditando((prev) => prev ? {
                                        ...prev,
                                        numeroAutorizacion: e.target.value,
                                    } : prev)}
                                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-900"
                                />
                            </label>
                            <label className="text-xs text-gray-600 md:col-span-2">
                                Medico que ejecuta la practica
                                <ProfesionalSelect
                                    profesionales={profesionalesConMatricula}
                                    value={(() => {
                                        const matricula = Number.parseInt(draftPracticaEditando.matriculaEspecialista, 10)
                                        if (!Number.isFinite(matricula) || matricula <= 0) return ''
                                        const profesional = profesionalesConMatricula.find(
                                            (item) => item.matricula === matricula
                                        )
                                        return profesional ? String(profesional.id) : ''
                                    })()}
                                    onChange={(nextValue) => {
                                        const profesionalId = Number.parseInt(nextValue, 10)
                                        const profesional = Number.isFinite(profesionalId)
                                            ? profesionalesConMatricula.find((item) => item.id === profesionalId)
                                            : null
                                        setDraftPracticaEditando((prev) => prev ? {
                                            ...prev,
                                            matriculaEspecialista: profesional ? String(profesional.matricula) : '',
                                        } : prev)
                                    }}
                                    permitirCargaManual
                                    textoBotonCargaManual="Agregar profesional manual (nombre + matricula)"
                                    onProfesionalCreado={registrarProfesionalCreado}
                                    autoSelectOnSearch={false}
                                    placeholderOption="-- Sin efector --"
                                    searchPlaceholder="Buscar por nombre o matricula"
                                    disabled={guardandoPracticaEditando}
                                    selectClassName="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 disabled:bg-gray-100"
                                    searchClassName="mt-1 w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-[11px] text-gray-700 disabled:bg-gray-100"
                                />
                            </label>
                            <label className="text-xs text-gray-600 md:col-span-2">
                                Medico que suscribe la orden
                                <ProfesionalSelect
                                    profesionales={profesionalesConMatricula}
                                    value={(() => {
                                        const matricula = Number.parseInt(draftPracticaEditando.firmanteMatricula, 10)
                                        if (!Number.isFinite(matricula) || matricula <= 0) return ''
                                        const profesional = profesionalesConMatricula.find(
                                            (item) => item.matricula === matricula
                                        )
                                        return profesional ? String(profesional.id) : ''
                                    })()}
                                    onChange={(nextValue) => {
                                        const profesionalId = Number.parseInt(nextValue, 10)
                                        const profesional = Number.isFinite(profesionalId)
                                            ? profesionalesConMatricula.find((item) => item.id === profesionalId)
                                            : null
                                        setDraftPracticaEditando((prev) => prev ? {
                                            ...prev,
                                            firmanteMatricula: profesional ? String(profesional.matricula) : '',
                                        } : prev)
                                    }}
                                    permitirCargaManual
                                    textoBotonCargaManual="Agregar profesional manual (nombre + matricula)"
                                    onProfesionalCreado={registrarProfesionalCreado}
                                    autoSelectOnSearch={false}
                                    placeholderOption="-- Sin cambios --"
                                    searchPlaceholder="Buscar por nombre o matricula"
                                    disabled={guardandoPracticaEditando}
                                    selectClassName="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 disabled:bg-gray-100"
                                    searchClassName="mt-1 w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-[11px] text-gray-700 disabled:bg-gray-100"
                                />
                                <span className="mt-1 block text-[10px] text-gray-500">
                                    Es quien firma el imprimible. Se aplica a la orden que contiene esta practica.
                                </span>
                            </label>
                            <label className="text-xs text-gray-600">
                                Matricula especialista
                                <input
                                    type="number"
                                    min={1}
                                    value={draftPracticaEditando.matriculaEspecialista}
                                    onChange={(e) => setDraftPracticaEditando((prev) => prev ? {
                                        ...prev,
                                        matriculaEspecialista: e.target.value,
                                    } : prev)}
                                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-900"
                                />
                            </label>
                            <label className="text-xs text-gray-600">
                                Matricula anestesista
                                <input
                                    type="number"
                                    min={1}
                                    value={draftPracticaEditando.matriculaAnestesista}
                                    onChange={(e) => setDraftPracticaEditando((prev) => prev ? {
                                        ...prev,
                                        matriculaAnestesista: e.target.value,
                                    } : prev)}
                                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-900"
                                />
                            </label>
                            <label className="text-xs text-gray-600">
                                Importe base unitario
                                <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={draftPracticaEditando.importeBaseUnitario}
                                    onChange={(e) => setDraftPracticaEditando((prev) => prev ? {
                                        ...prev,
                                        importeBaseUnitario: e.target.value,
                                    } : prev)}
                                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-900"
                                />
                            </label>
                            <label className="text-xs text-gray-600">
                                N° protocolo laboratorio
                                <input
                                    type="text"
                                    value={draftPracticaEditando.numeroProtocoloLaboratorio}
                                    onChange={(e) => setDraftPracticaEditando((prev) => prev ? {
                                        ...prev,
                                        numeroProtocoloLaboratorio: e.target.value,
                                    } : prev)}
                                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-900"
                                />
                            </label>
                            <label className="text-xs text-gray-600 md:col-span-2">
                                Diagnostico laboratorio
                                <input
                                    type="text"
                                    value={draftPracticaEditando.diagnosticoLaboratorio}
                                    onChange={(e) => setDraftPracticaEditando((prev) => prev ? {
                                        ...prev,
                                        diagnosticoLaboratorio: e.target.value,
                                    } : prev)}
                                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-900"
                                />
                            </label>
                        </div>

                        <label className="mt-3 inline-flex items-center gap-2 text-xs text-gray-700">
                            <input
                                type="checkbox"
                                checked={draftPracticaEditando.facturable}
                                onChange={(e) => setDraftPracticaEditando((prev) => prev ? {
                                    ...prev,
                                    facturable: e.target.checked,
                                } : prev)}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            Facturable
                        </label>
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3">
                            <button
                                type="button"
                                onClick={cerrarEdicionPractica}
                                disabled={guardandoPracticaEditando}
                                className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => void guardarEdicionPractica()}
                                disabled={guardandoPracticaEditando}
                                className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                                {guardandoPracticaEditando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                {guardandoPracticaEditando ? 'Guardando...' : 'Guardar cambios'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {confirmacionOrdenUnica && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
                    <div className="w-full max-w-xl rounded-xl border border-amber-200 bg-white p-4 shadow-xl">
                        <h4 className="text-sm font-semibold text-amber-900">
                            {confirmacionOrdenUnica.agruparEnUnaOrden
                                ? 'Confirmar una sola orden'
                                : 'Confirmar generacion por separado'}
                        </h4>
                        <p className="mt-1 text-xs text-gray-700">
                            {confirmacionOrdenUnica.agruparEnUnaOrden
                                ? 'Las practicas seleccionadas se generaran en una unica orden.'
                                : 'Las practicas seleccionadas se generaran por separado: una orden por cada practica.'}
                        </p>

                        <div className="mt-3 space-y-3">
                            {confirmacionOrdenUnica.requiereElegirTitulo && (
                                <label className="block text-xs text-amber-900">
                                    Divergencia de titulo detectada. Selecciona el titulo final de la orden
                                    <select
                                        value={confirmacionOrdenUnica.titularSeleccionado}
                                        onChange={(e) =>
                                            setConfirmacionOrdenUnica((prev) =>
                                                prev
                                                    ? { ...prev, titularSeleccionado: e.target.value }
                                                    : prev
                                            )
                                        }
                                        className="mt-1 w-full rounded border border-amber-300 bg-white px-2 py-1.5 text-xs text-amber-900"
                                    >
                                        {confirmacionOrdenUnica.titulosDisponibles.map((titulo) => (
                                            <option key={titulo} value={titulo}>
                                                {titulo}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            )}

                            {confirmacionOrdenUnica.requiereElegirFirmante && (
                                <label className="block text-xs text-amber-900">
                                    Divergencia de medico firmante detectada. Selecciona el firmante final
                                    <ProfesionalSelect
                                        profesionales={profesionalesConMatricula}
                                        value={confirmacionOrdenUnica.firmanteSeleccionadoId}
                                        onChange={(nextValue) =>
                                            setConfirmacionOrdenUnica((prev) =>
                                                prev
                                                    ? { ...prev, firmanteSeleccionadoId: nextValue }
                                                    : prev
                                            )
                                        }
                                        permitirCargaManual
                                        textoBotonCargaManual="Agregar firmante manual (nombre + matricula)"
                                        onProfesionalCreado={registrarProfesionalCreado}
                                        autoSelectOnSearch={false}
                                        placeholderOption="-- Seleccionar firmante --"
                                        searchPlaceholder="Buscar por nombre o matricula"
                                        selectClassName="mt-1 w-full rounded border border-amber-300 bg-white px-2 py-1 text-xs text-amber-900 disabled:bg-amber-100 disabled:text-amber-700"
                                        searchClassName="mt-1 w-full rounded border border-amber-200 bg-white px-2 py-1 text-[11px] text-amber-900 disabled:bg-amber-100 disabled:text-amber-700"
                                    />
                                </label>
                            )}
                        </div>

                        <div className="mt-4 flex flex-wrap justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setConfirmacionOrdenUnica(null)}
                                className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={confirmarGeneracionOrdenUnica}
                                className="inline-flex items-center rounded border border-amber-300 bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                            >
                                Confirmar y generar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {popupSubitemsSesion && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
                    <div className="w-full max-w-xl rounded-xl border border-blue-200 bg-white p-4 shadow-xl">
                        <h4 className="text-sm font-semibold text-blue-900">Codigos de sesión: titulos a generar e imprimir</h4>
                        <p className="mt-1 text-xs text-gray-700">
                            Marca los titulos de subitems que deseas incluir en esta generacion.
                        </p>

                        <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto rounded border border-blue-100 bg-blue-50/40 p-2">
                            {popupSubitemsSesion.opciones.map((opcion) => {
                                const checked = popupSubitemsSesion.seleccionadas.includes(opcion.clasificacion)
                                return (
                                    <label
                                        key={opcion.clasificacion}
                                        className="flex items-center justify-between gap-2 rounded border border-blue-100 bg-white px-2 py-1 text-xs text-blue-900"
                                    >
                                        <span className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={(e) => alternarSubitemPopupSesion(opcion.clasificacion, e.target.checked)}
                                                className="h-3.5 w-3.5 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="font-semibold">{opcion.titulo}</span>
                                            <span className="text-[11px] text-blue-700">({opcion.clasificacion})</span>
                                        </span>
                                        <span className="text-[11px] font-medium text-blue-800">{opcion.cantidad} codigo(s)</span>
                                    </label>
                                )
                            })}
                        </div>

                        <div className="mt-4 flex flex-wrap justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setPopupSubitemsSesion(null)}
                                className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={confirmarGeneracionSubitemsSesion}
                                className="inline-flex items-center gap-1 rounded border border-blue-300 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                                <Printer className="h-3.5 w-3.5" />
                                Generar e imprimir seleccionados
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {popupImpresionSesion && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
                    <div className="w-full max-w-xl rounded-xl border border-blue-200 bg-white p-4 shadow-xl">
                        <h4 className="text-sm font-semibold text-blue-900">Impresion de ordenes generadas</h4>
                        <p className="mt-1 text-xs text-gray-700">
                            Se generaron varias ordenes por tipo de item. Puedes imprimir todas o seleccionar cuales.
                        </p>

                        <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto rounded border border-blue-100 bg-blue-50/40 p-2">
                            {popupImpresionSesion.ordenes.map((orden) => {
                                const clave = claveOrden(orden)
                                const checked = popupImpresionSesion.seleccionadas.includes(clave)
                                return (
                                    <label
                                        key={clave}
                                        className="flex items-center gap-2 rounded border border-blue-100 bg-white px-2 py-1 text-xs text-blue-900"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={(e) => alternarOrdenPopupImpresionSesion(clave, e.target.checked)}
                                            className="h-3.5 w-3.5 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="font-medium">
                                            Orden {formatearNumeroOrden(orden.puestoNumero, orden.numero)}
                                        </span>
                                    </label>
                                )
                            })}
                        </div>

                        <div className="mt-4 flex flex-wrap justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setPopupImpresionSesion(null)}
                                className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                            >
                                No imprimir
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    abrirImpresionOrdenes(popupImpresionSesion.ordenes)
                                    setPopupImpresionSesion(null)
                                }}
                                className="inline-flex items-center gap-1 rounded border border-blue-300 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                            >
                                <Printer className="h-3.5 w-3.5" />
                                Imprimir todas
                            </button>
                            <button
                                type="button"
                                onClick={imprimirSeleccionPopupSesion}
                                className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                            >
                                <Printer className="h-3.5 w-3.5" />
                                Imprimir seleccionadas
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </>
    )
}
