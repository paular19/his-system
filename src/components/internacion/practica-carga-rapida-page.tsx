'use client'

import { useEffect, useMemo, useState } from 'react'
import {
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    ChevronUp,
    ClipboardList,
    Loader2,
    Printer,
    Settings2,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PracticaCargaForm, type PracticaCargaEntrada } from '@/components/internacion/practica-carga-form'
import type { PracticaItem } from '@/modules/internacion/types'
import { formatearFechaArgentina } from '@/lib/utils/argentina-date'
import { normalizarClasificacionAgrupacion, tituloDesdeClasificacion } from '@/modules/orden/clasificacion'
import { generarOrdenesDesdeInternacionAction } from '@/modules/orden/actions'
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

type ProtocoloPredefinido = {
    id: string
    nombre: string
    codigos: string[]
}

type ComponenteOrden = 'HE' | 'HA' | 'GA' | 'HP' | 'A1' | 'A2' | 'A3'

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

type ProtocoloCargaEditable = {
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

interface PracticaCargaRapidaPageProps {
    ingresoId: number
    convenioId: number | null
    sectorInternacionActual?: string | null
    matriculaTratanteDefault?: number | null
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

const ORDENES_HISTORICO_POR_PAGINA = 8
const PROTOCOLOS_PREDEFINIDOS: ProtocoloPredefinido[] = [
    {
        id: 'SALA_COMUN_COMPARTIDA',
        nombre: 'SALA O HABITACION COMUN COMPARTIDA',
        codigos: ['431001', '430101', '420301'],
    },
    {
        id: 'SALA_COMUN_BLOQUEADA',
        nombre: 'SALA O HABITACION COMUN BLOQUEADA',
        codigos: ['431001', '430101', '430106', '420301'],
    },
    {
        id: 'SALA_USADA_8_HORAS',
        nombre: 'SALA O HABITACION USADA POR 8 HORAS',
        codigos: ['431001', '430130', '420301'],
    },
    {
        id: 'CODIGOS_UTI_TERAPIA_INTENSIVA',
        nombre: 'CODIGOS UTI - TERAPIA INTENSIVA',
        codigos: ['400101', '431002'],
    },
]

function claveOrden(ref: OrdenRef): string {
    return `${ref.puestoNumero}-${ref.numero}`
}

function practicaActiva(estado: string | null | undefined): boolean {
    return (estado?.trim().toUpperCase() ?? 'A') !== 'X'
}

function practicaFacturada(practica: PracticaItem): boolean {
    if (typeof practica.facturada === 'boolean') return practica.facturada
    return Boolean((practica.puestoNumero ?? 0) > 0 && (practica.ordenNumero ?? 0) > 0)
}

function descripcionParaMostrar(practica: Pick<PracticaItem, 'descripcionPractica' | 'codigoPractica'>): string {
    const descripcion = practica.descripcionPractica?.trim()
    if (descripcion && descripcion.length > 0) return descripcion
    return practica.codigoPractica.trim()
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
    const [mostrarOrdenesPendientesAutorizacion, setMostrarOrdenesPendientesAutorizacion] = useState(true)
    const [mostrarOrdenesYaAutorizadas, setMostrarOrdenesYaAutorizadas] = useState(true)
    const [ordenesAutorizadasAbiertas, setOrdenesAutorizadasAbiertas] = useState<Record<string, boolean>>({})
    const [ordenesAutorizadasExpandidas, setOrdenesAutorizadasExpandidas] = useState<Record<string, boolean>>({})
    const [mostrarOrdenesHistoricas, setMostrarOrdenesHistoricas] = useState(true)
    const [busquedaHistorico, setBusquedaHistorico] = useState('')
    const [paginaHistorico, setPaginaHistorico] = useState(1)
    const [ordenesGeneradasSesion, setOrdenesGeneradasSesion] = useState<string[]>([])
    const [confirmacionOrdenUnica, setConfirmacionOrdenUnica] = useState<ConfirmacionOrdenUnicaState | null>(null)
    const [popupImpresionSesion, setPopupImpresionSesion] = useState<PopupImpresionSesionState | null>(null)
    const [popupSubitemsSesion, setPopupSubitemsSesion] = useState<PopupSubitemsSesionState | null>(null)
    const [generarImprimirPorSeparadoEditor, setGenerarImprimirPorSeparadoEditor] = useState(false)
    const [protocoloSeleccionadoId, setProtocoloSeleccionadoId] = useState(
        PROTOCOLOS_PREDEFINIDOS[0]?.id ?? ''
    )
    const [protocoloItems, setProtocoloItems] = useState<ProtocoloCargaEditable[]>([])
    const [fechaProtocolo, setFechaProtocolo] = useState(() => fechaAInputLocalSimple(new Date()))
    const [cargandoProtocolo, setCargandoProtocolo] = useState(false)
    const [procesandoProtocolo, setProcesandoProtocolo] = useState(false)
    const [errorProtocolo, setErrorProtocolo] = useState<string | null>(null)

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
        () => practicasVigentes.filter((practica) => (practica.ordenPractica?.length ?? 0) === 0),
        [practicasVigentes]
    )

    const idsInternacionCirugiaObjetivo = useMemo(() => {
        if (!modoCirugia) return new Set<number>()
        return new Set(contextoCirugia?.practicaIdsInternacion ?? [])
    }, [modoCirugia, contextoCirugia])

    const idsPendientesCirugiaObjetivo = useMemo(() => {
        if (!modoCirugia) return [] as number[]

        const idsPendientes = practicasPendientes
            .filter((practica) => {
                if (idsInternacionCirugiaObjetivo.size > 0) {
                    return idsInternacionCirugiaObjetivo.has(practica.id)
                }
                return (practica.usuario ?? '').trim().toUpperCase() === 'CIRUGIA'
            })
            .map((practica) => practica.id)

        return idsPendientes
    }, [modoCirugia, practicasPendientes, idsInternacionCirugiaObjetivo])

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
            modoCirugia ? idsPendientesCirugiaObjetivo : practicasPendientes.map((practica) => practica.id)
        )
        setPracticasSeleccionadas((prev) => prev.filter((id) => pendientes.has(id)))
    }, [modoCirugia, practicasPendientes, idsPendientesCirugiaObjetivo])

    const practicasPendientesOrdenadas = useMemo(() => {
        const lista = [...practicasPendientes]
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
    }, [practicasPendientes, clasificacionPorPracticaId])

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
        const pendientesIds = new Set(practicasPendientes.map((practica) => practica.id))
        return practicasSeleccionadas.filter((id) => pendientesIds.has(id))
    }, [practicasPendientes, practicasSeleccionadas])

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
        : practicasPendientes.map((practica) => practica.id)

    const idsPendientesSeleccionadasEditor = modoCirugia
        ? idsPendientesSeleccionadasCirugia
        : idsPendientesSeleccionadas

    const practicasPendientesEditorAgrupadas = modoCirugia
        ? practicasPendientesCirugiaObjetivoAgrupadas
        : practicasPendientesAgrupadas

    const idsPendientesSesion = useMemo(() => {
        const pendientes = new Set(practicasPendientes.map((practica) => practica.id))
        return Array.from(
            new Set(
                guardadasSesion
                    .map((item) => item.practicaId)
                    .filter((id) => pendientes.has(id))
            )
        )
    }, [guardadasSesion, practicasPendientes])

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

    const matriculaPorProfesionalId = useMemo(() => {
        const map = new Map<number, number>()
        for (const profesional of profesionalesConMatricula) {
            map.set(profesional.id, profesional.matricula)
        }
        return map
    }, [profesionalesConMatricula])

    const profesionalIdPorMatricula = useMemo(() => {
        const map = new Map<number, number>()
        for (const profesional of profesionalesConMatricula) {
            map.set(profesional.matricula, profesional.id)
        }
        return map
    }, [profesionalesConMatricula])

    const matriculaFirmanteSugerida = useMemo(() => {
        const idsRelevantes = modoCirugia
            ? idsPendientesCirugiaObjetivo
            : idsPendientesSeleccionadas.length > 0
                ? idsPendientesSeleccionadas
                : practicasPendientes.map((practica) => practica.id)

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
    }, [modoCirugia, idsPendientesCirugiaObjetivo, idsPendientesSeleccionadas, practicasPendientes, practicas, matriculaTratanteDefault])

    useEffect(() => {
        const profesionalIdSugerido =
            matriculaFirmanteSugerida != null
                ? (profesionalIdPorMatricula.get(matriculaFirmanteSugerida) ?? null)
                : null

        if (!profesionalIdSugerido) return
        if (firmanteEditadoManualmente && medicoFirmanteId) return

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
    }, [medicoFirmanteId, profesionalesConMatricula, matriculaFirmanteSugerida])

    const registrarGuardadasSesion = (creadas: PracticaItem[], entradasCrear: PracticaCargaEntrada[]) => {
        if (creadas.length === 0) return

        const nuevas = creadas.map((practicaCreada, idx) => {
            const entrada = entradasCrear[idx]
            return {
                id: `${practicaCreada.id}-${Date.now()}-${idx}`,
                practicaId: practicaCreada.id,
                codigo: practicaCreada.codigoPractica.trim(),
                descripcion: descripcionParaMostrar(practicaCreada),
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

    const registrarGuardadasSesionDesdeEntradas = (entradasCrear: PracticaCargaEntrada[]) => {
        if (entradasCrear.length === 0) return

        const nuevas = entradasCrear.map((entrada, idx) => ({
            id: `cirugia-${Date.now()}-${idx}`,
            practicaId: -1 * (Date.now() + idx),
            codigo: entrada.payload.codigoPractica.trim(),
            descripcion: (entrada.payload.descripcionPractica ?? '').trim() || entrada.payload.codigoPractica.trim(),
            cantidad: Number(entrada.payload.cantidad ?? 1),
            clasificacion: entrada.clasificacion ?? 'HE',
            fecha: formatearFechaArgentina(entrada.payload.fecha, {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
            }),
        }))

        setGuardadasSesion((prev) => [...nuevas, ...prev])
    }

    const handleGuardarPracticas = async (entradasCrear: PracticaCargaEntrada[]): Promise<GuardarPracticasResult> => {
        setMensajeError(null)

        if (contextoCirugia) {
            if (!contextoCirugia.obraSocialId) {
                const mensaje = 'La internacion no tiene obra social asignada. Actualizala para cargar practicas de cirugia.'
                setMensajeError(mensaje)
                return { ok: false, error: mensaje }
            }

            try {
                const practicasExpandida = entradasCrear.map((entrada) => ({
                    convenioId: entrada.payload.convenioId,
                    codigo: entrada.payload.codigoPractica,
                    descripcion: entrada.payload.descripcionPractica,
                    cantidad: entrada.payload.cantidad,
                    importeTotal: entrada.payload.importeBaseUnitario,
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

                registrarGuardadasSesionDesdeEntradas(entradasCrear)
                router.refresh()
                return { ok: true }
            } catch {
                const mensaje = 'Error de conexion al guardar practicas de cirugia'
                setMensajeError(mensaje)
                return { ok: false, error: mensaje }
            }
        }

        try {
            const practicasCreadas: PracticaItem[] = []
            const clasificacionesCreadas: Record<number, string> = {}

            for (const [idx, entrada] of entradasCrear.entries()) {
                const res = await fetch(`/api/internacion/${ingresoId}/practicas`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(entrada.payload),
                })
                const json = await res.json().catch(() => null)
                if (!res.ok) {
                    if (practicasCreadas.length > 0) {
                        setPracticas((prev) => [...practicasCreadas, ...prev])
                        registrarGuardadasSesion(practicasCreadas, entradasCrear)
                    }
                    const mensaje = json?.error ?? 'No se pudo registrar la practica'
                    setMensajeError(mensaje)
                    return { ok: false, error: mensaje }
                }

                const creada = json.data as PracticaItem
                practicasCreadas.push(creada)
                clasificacionesCreadas[creada.id] = entradasCrear[idx]?.clasificacion ?? 'HE'
            }

            setPracticas((prev) => [...practicasCreadas, ...prev])
            setClasificacionPorPracticaId((prev) => ({
                ...prev,
                ...clasificacionesCreadas,
            }))
            registrarGuardadasSesion(practicasCreadas, entradasCrear)
            return { ok: true, practicaIds: practicasCreadas.map((practica) => practica.id) }
        } catch {
            const mensaje = 'Error de conexion al guardar practicas'
            setMensajeError(mensaje)
            return { ok: false, error: mensaje }
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

    const abrirImpresionOrdenes = (ordenes: OrdenRef[]) => {
        if (ordenes.length === 0) return

        const ordenesParam = ordenes
            .map((orden) => `${orden.puestoNumero}-${orden.numero}`)
            .join(',')
        const url = `/dashboard/ambulatorio/imprimir?ordenes=${encodeURIComponent(ordenesParam)}`
        const ventanaImpresion = abrirVentanaImpresionPendiente()
        navegarVentanaImpresion(ventanaImpresion, url)
    }

    const ejecutarGeneracionOrdenes = async (
        imprimirDespues: boolean,
        practicaIdsObjetivo?: number[],
        agruparEnUnaOrden = false,
        opciones?: {
            titularOrdenAgrupada?: string | null
            origen?: 'default' | 'sesion'
            firmanteProfesionalId?: string
            separarPorPractica?: boolean
            clasificacionPorPracticaId?: Record<number, string>
        }
    ) => {
        const practicaIds = practicaIdsObjetivo ?? idsPendientesSeleccionadas

        if (practicaIds.length === 0) {
            setMensajeError('Selecciona al menos una practica pendiente para generar ordenes')
            return
        }

        // Modo editor: generar e imprimir por separado debe crear una orden por práctica.
        if (opciones?.separarPorPractica && practicaIds.length > 1) {
            for (const practicaId of practicaIds) {
                await ejecutarGeneracionOrdenes(imprimirDespues, [practicaId], false, {
                    ...opciones,
                    separarPorPractica: false,
                })
            }
            return
        }

        const firmanteProfesionalId = opciones?.firmanteProfesionalId ?? medicoFirmanteId
        const profesionalIdFirmante = Number.parseInt(firmanteProfesionalId, 10)
        const medicoFirmanteMatricula = Number.isFinite(profesionalIdFirmante)
            ? (matriculaPorProfesionalId.get(profesionalIdFirmante) ?? null)
            : matriculaFirmanteSugerida

        const clasificacionPayload = Object.fromEntries(
            practicaIds.map((id) => {
                const clasificacionForzada = opciones?.clasificacionPorPracticaId?.[id]
                if (clasificacionForzada) {
                    return [String(id), normalizarClasificacionAgrupacion(clasificacionForzada) ?? clasificacionForzada]
                }
                const practica = practicas.find((item) => item.id === id)
                const clasificacion = practica ? obtenerClasificacionPractica(practica) : 'HE'
                return [String(id), clasificacion]
            })
        )

        setMensajeError(null)
        setGenerandoOrdenes(true)
        const requierePopupSeleccionImpresionSesion =
            Boolean(imprimirDespues) && (opciones?.origen ?? 'default') === 'sesion'
        const ventanaImpresion =
            imprimirDespues && !requierePopupSeleccionImpresionSesion
                ? abrirVentanaImpresionPendiente()
                : null
        let impresionDisparada = false

        try {
            const result = await generarOrdenesDesdeInternacionAction({
                ingresoId,
                practicaIds,
                clasificacionPorPracticaId: clasificacionPayload,
                agruparEnUnaOrden,
                titularOrdenAgrupada: agruparEnUnaOrden ? (opciones?.titularOrdenAgrupada ?? null) : undefined,
                cirujanoFirmanteMatricula: medicoFirmanteMatricula ?? undefined,
            })

            if ('error' in result && result.error) {
                setMensajeError(result.error)
                return
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

            const asignacionPorPracticaId = new Map(asignaciones.map((item) => [item.practicaId, item] as const))
            const asignacionFallbackPorPracticaId = new Map<number, { puestoNumero: number; numero: number; item: number }>()

            for (const grupo of grupos) {
                grupo.practicaIds.forEach((practicaId, idx) => {
                    if (asignacionFallbackPorPracticaId.has(practicaId)) return
                    asignacionFallbackPorPracticaId.set(practicaId, {
                        puestoNumero: grupo.puestoNumero,
                        numero: grupo.numero,
                        item: idx + 1,
                    })
                })
            }

            setPracticas((prev) => prev.map((practica) => {
                const asignada =
                    asignacionPorPracticaId.get(practica.id) ??
                    asignacionFallbackPorPracticaId.get(practica.id)
                if (!asignada) return practica

                const yaVinculada = practica.ordenPractica.some(
                    (orden) =>
                        orden.puestoNumero === asignada.puestoNumero &&
                        orden.ordenNumero === asignada.numero &&
                        orden.item === asignada.item
                )
                if (yaVinculada) return practica

                return {
                    ...practica,
                    ordenPractica: [
                        ...practica.ordenPractica,
                        {
                            puestoNumero: asignada.puestoNumero,
                            ordenNumero: asignada.numero,
                            item: asignada.item,
                            numeroAutorizacion: null,
                        },
                    ],
                }
            }))

            setPracticasSeleccionadas((prev) => prev.filter((id) => !practicaIds.includes(id)))

            if (grupos.length > 0) {
                if ((opciones?.origen ?? 'default') === 'sesion') {
                    const nuevasOrdenesSesion = Array.from(
                        new Set(grupos.map((grupo) => `${grupo.puestoNumero}-${grupo.numero}`))
                    )
                    setOrdenesGeneradasSesion((prev) => Array.from(new Set([...nuevasOrdenesSesion, ...prev])))
                }
                const idsGeneradas = new Set(practicaIds)
                setGuardadasSesion((prev) => prev.filter((item) => !idsGeneradas.has(item.practicaId)))
            }

            if (imprimirDespues && grupos.length > 0) {
                const ordenesUnicas = Array.from(
                    new Set(grupos.map((grupo) => `${grupo.puestoNumero}-${grupo.numero}`))
                ).map((clave) => {
                    const [puestoNumeroRaw, numeroRaw] = clave.split('-')
                    return {
                        puestoNumero: Number.parseInt(puestoNumeroRaw ?? '', 10),
                        numero: Number.parseInt(numeroRaw ?? '', 10),
                    }
                }).filter((orden) => Number.isFinite(orden.puestoNumero) && Number.isFinite(orden.numero))

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
        } catch {
            setMensajeError('Error al generar ordenes desde internacion')
        } finally {
            if (!impresionDisparada) {
                cerrarVentanaImpresion(ventanaImpresion)
            }
            setGenerandoOrdenes(false)
        }
    }

    const solicitarConfirmacionOrdenUnica = (imprimirDespues: boolean) => {
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
            void ejecutarGeneracionOrdenes(
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

        if (siguienteFirmanteId) {
            setMedicoFirmanteId(siguienteFirmanteId)
            setFirmanteEditadoManualmente(true)
        }

        const payload = {
            titularOrdenAgrupada: confirmacionOrdenUnica.titularSeleccionado,
            firmanteProfesionalId: siguienteFirmanteId,
            separarPorPractica: confirmacionOrdenUnica.separarPorPractica,
        }

        const { imprimirDespues, practicaIds, agruparEnUnaOrden } = confirmacionOrdenUnica
        setConfirmacionOrdenUnica(null)
        void ejecutarGeneracionOrdenes(imprimirDespues, practicaIds, agruparEnUnaOrden, payload)
    }

    const solicitarGeneracionDesdeSesion = () => {
        const idsSesion = idsPendientesSesion
        if (idsSesion.length === 0) {
            setMensajeError('No hay practicas guardadas en esta sesion para generar ordenes')
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
            void ejecutarGeneracionOrdenes(true, idsSesion, false, { origen: 'sesion' })
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

        void ejecutarGeneracionOrdenes(true, idsFiltrados, false, { origen: 'sesion' })
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

    const resolverNomencladorExactoPorCodigo = async (
        codigo: string
    ): Promise<NomencladorItemProtocolo | null> => {
        const codigoNormalizado = codigo.trim().toUpperCase()
        if (codigoNormalizado.length < 2) return null

        const qs = new URLSearchParams({
            q: codigoNormalizado,
            exact: '1',
            limit: '20',
        })
        if (convenioId != null) qs.set('convenioId', String(convenioId))

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
                    nomenclador: await resolverNomencladorExactoPorCodigo(codigo),
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
                .map(({ nomenclador }) => {
                    const requiereMatriculaTratante = nomenclador.valorEspecialista != null
                    return {
                        codigo: nomenclador.codigo.trim(),
                        descripcion: nomenclador.descripcion,
                        clasificacion: clasificacionDefaultDesdeNomenclador(nomenclador),
                        cantidad: '1',
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

    const actualizarProtocoloItem = (
        codigo: string,
        patch: Partial<Pick<ProtocoloCargaEditable, 'cantidad' | 'matriculaTratante'>>
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
        const entradas: PracticaCargaEntrada[] = []

        for (const item of protocoloItems) {
            const cantidad = Number.parseInt(item.cantidad, 10)
            if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 999) {
                return {
                    entradas: [],
                    error: `Cantidad invalida para el codigo ${item.codigo}`,
                }
            }

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
                    convenioId: convenioId ?? 0,
                    codigoPractica: item.codigo,
                    descripcionPractica: item.descripcion,
                    fecha,
                    cantidad,
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

        const { entradas, error } = construirEntradasProtocolo()
        if (error) {
            setErrorProtocolo(error)
            return
        }

        setProcesandoProtocolo(true)
        try {
            const resultadoGuardado = await handleGuardarPracticas(entradas)
            if (!resultadoGuardado.ok) {
                setErrorProtocolo(resultadoGuardado.error ?? 'No se pudo guardar el protocolo')
                return
            }

            const practicaIds = resultadoGuardado.practicaIds ?? []
            if (practicaIds.length === 0) {
                setErrorProtocolo('El protocolo se guardo, pero no se pudieron identificar practicas para generar ordenes')
                return
            }

            const clasificacionPorPracticaId = Object.fromEntries(
                practicaIds.map((practicaId, idx) => [
                    practicaId,
                    entradas[idx]?.clasificacion ?? 'HE',
                ])
            )

            await ejecutarGeneracionOrdenes(imprimirDespues, practicaIds, false, {
                origen: 'default',
                clasificacionPorPracticaId,
            })
        } finally {
            setProcesandoProtocolo(false)
        }
    }

    const todasPendientesSeleccionadas =
        idsPendientesEditor.length > 0 && idsPendientesEditor.every((id) => practicasSeleccionadas.includes(id))

    const gruposFiltradosHistoricos = ordenesAutorizadas.filter((grupo) => {
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
        const limitePracticas = 3
        const practicasVisibles = expandida ? grupo.practicas : grupo.practicas.slice(0, limitePracticas)
        const restantes = Math.max(0, grupo.practicas.length - practicasVisibles.length)
        const destinoAbrir = obtenerDestinoGrupoPracticasAutorizadas(grupo)
        const sinAutorizacion = !grupoTieneNumeroAutorizacion(grupo)
        const codigosGrupo = Array.from(
            new Set(
                grupo.practicas
                    .map((practica) => practica.codigoPractica.trim())
                    .filter((codigo) => codigo.length > 0)
            )
        )
        const codigosResumen = codigosGrupo.slice(0, 6).join(', ')
        const codigosRestantes = Math.max(0, codigosGrupo.length - 6)
        const claveOrdenSesion =
            grupo.tipo === 'orden' && grupo.puestoNumero != null && grupo.ordenNumero != null
                ? `${grupo.puestoNumero}-${grupo.ordenNumero}`
                : null
        const generadaEnSesion = claveOrdenSesion != null && ordenesGeneradasSesionSet.has(claveOrdenSesion)

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
            ? 'rounded-md border border-blue-200 bg-white/80 p-2'
            : 'rounded-md border border-emerald-200 bg-white/70 p-2'

        const tituloDetalleClase = generadaEnSesion
            ? 'text-[11px] font-semibold uppercase tracking-wide text-blue-700'
            : 'text-[11px] font-semibold uppercase tracking-wide text-emerald-700'

        const botonExpandirClase = generadaEnSesion
            ? 'rounded border border-blue-300 px-2 py-0.5 text-[11px] font-medium text-blue-800 hover:bg-blue-50'
            : 'rounded border border-emerald-300 px-2 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-50'

        const itemClase = generadaEnSesion
            ? 'rounded border border-blue-100 bg-white px-2 py-1.5'
            : 'rounded border border-emerald-100 bg-white px-2 py-1.5'

        const itemTextoClase = generadaEnSesion ? 'text-blue-900' : 'text-emerald-900'
        const itemFechaClase = generadaEnSesion ? 'text-[11px] text-blue-700' : 'text-[11px] text-emerald-700'
        const restantesClase = generadaEnSesion ? 'mt-1 text-[11px] text-blue-700' : 'mt-1 text-[11px] text-emerald-700'
        const estadoSesionEtiqueta = generadaEnSesion ? 'Sesion actual' : null

        return (
            <div
                key={grupo.key}
                className={`rounded-lg p-2.5 text-xs ${contenedorClase}`}
            >
                <button
                    type="button"
                    onClick={() => setOrdenesAutorizadasAbiertas((prev) => ({
                        ...prev,
                        [grupo.key]: !(prev[grupo.key] ?? false),
                    }))}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-1 py-0.5 text-left ${hoverClase}`}
                >
                    <span className={`flex min-w-0 items-center gap-2 ${tituloClase}`}>
                        <ChevronRight className={`h-4 w-4 transition-transform ${abierta ? 'rotate-90' : ''}`} />
                        <span className="font-semibold">
                            {grupo.tipo === 'orden' && grupo.puestoNumero && grupo.ordenNumero
                                ? `Orden ${formatearNumeroOrden(grupo.puestoNumero, grupo.ordenNumero)}`
                                : `Autorizacion ${grupo.numeroAutorizacion ?? '-'}`}
                        </span>
                        {estadoSesionEtiqueta && (
                            <span className="rounded border border-blue-300 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                                {estadoSesionEtiqueta}
                            </span>
                        )}
                        <span className={`min-w-0 truncate text-[10px] ${contadorClase}`}>
                            Codigos: {codigosResumen}{codigosRestantes > 0 ? ` +${codigosRestantes}` : ''}
                        </span>
                    </span>
                    <span className={`text-[11px] ${contadorClase}`}>
                        {grupo.practicas.length} practica(s)
                    </span>
                </button>

                {abierta && (
                    <div className="mt-2 space-y-2">
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
                            <span className={badgeEstadoClase}>
                                Estado: {grupoTieneNumeroAutorizacion(grupo) ? 'Autorizada' : 'Pendiente de autorizacion'}
                            </span>
                        </div>

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

                            <div className="mt-2 space-y-1.5">
                                {practicasVisibles.map((practica) => (
                                    <div key={`${grupo.key}-${practica.id}`} className={itemClase}>
                                        <div className={`flex items-center justify-between gap-2 ${itemTextoClase}`}>
                                            <span className="font-mono text-[11px]">{practica.codigoPractica.trim()}</span>
                                            <span className="font-medium">Cant. {practica.cantidad}</span>
                                        </div>
                                        <p className={itemTextoClase}>{descripcionParaMostrar(practica)}</p>
                                        <p className={itemFechaClase}>
                                            {formatearFechaArgentina(practica.fecha, {
                                                day: '2-digit',
                                                month: '2-digit',
                                                year: 'numeric',
                                            })}
                                        </p>
                                        {practicaFacturada(practica) && (
                                            <span className="mt-1 inline-flex rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                                                Facturada
                                            </span>
                                        )}
                                    </div>
                                ))}
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
                            onGuardar={handleGuardarPracticas}
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
                                Selecciona un protocolo, precarga los codigos y ajusta solamente matricula tratante y cantidad por item.
                            </p>

                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                <label className="text-xs text-gray-700">
                                    Protocolo
                                    <select
                                        value={protocoloSeleccionadoId}
                                        onChange={(e) => {
                                            setProtocoloSeleccionadoId(e.target.value)
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
                                                    Cantidad
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        max={999}
                                                        step={1}
                                                        value={item.cantidad}
                                                        onChange={(e) =>
                                                            actualizarProtocoloItem(item.codigo, {
                                                                cantidad: e.target.value,
                                                            })
                                                        }
                                                        className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-800"
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
                                    onClick={() => void ejecutarProtocolo(false)}
                                    disabled={
                                        procesandoProtocolo ||
                                        cargandoProtocolo ||
                                        generandoOrdenes ||
                                        protocoloItems.length === 0
                                    }
                                    className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    {(procesandoProtocolo || generandoOrdenes) && (
                                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                    )}
                                    Generar protocolo
                                </button>

                                <button
                                    type="button"
                                    onClick={() => void ejecutarProtocolo(true)}
                                    disabled={
                                        procesandoProtocolo ||
                                        cargandoProtocolo ||
                                        generandoOrdenes ||
                                        protocoloItems.length === 0
                                    }
                                    className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                                >
                                    {(procesandoProtocolo || generandoOrdenes) ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Printer className="h-3.5 w-3.5" />
                                    )}
                                    Generar e imprimir protocolo
                                </button>
                            </div>
                        </div>
                    )}

                    {mensajeError && (
                        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                            {mensajeError}
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
                                    disabled={generandoOrdenes || profesionalesConMatricula.length === 0}
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

                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => void ejecutarGeneracionOrdenes(false, idsPendientesCirugiaObjetivo, false)}
                                    disabled={generandoOrdenes || idsPendientesCirugiaObjetivo.length === 0}
                                    className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    {generandoOrdenes && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                                    Generar orden
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void ejecutarGeneracionOrdenes(true, idsPendientesCirugiaObjetivo, false)}
                                    disabled={generandoOrdenes || idsPendientesCirugiaObjetivo.length === 0}
                                    className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                                >
                                    <Printer className="h-3.5 w-3.5" />
                                    Generar e imprimir
                                </button>
                            </div>

                            <p className="text-[11px] text-emerald-800">
                                Estas acciones generan por item. Si queres agrupar libremente, usa Editar grupos de practicas.
                            </p>
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

                                <label className="inline-flex items-center gap-2 text-xs text-amber-900">
                                    <input
                                        type="checkbox"
                                        checked={generarImprimirPorSeparadoEditor}
                                        onChange={(e) => {
                                            const checked = e.target.checked
                                            setGenerarImprimirPorSeparadoEditor(checked)
                                            if (checked) {
                                                alternarSeleccionLista(idsPendientesEditor, true)
                                            }
                                        }}
                                        className="h-4 w-4 rounded border-amber-300 text-amber-700 focus:ring-amber-500"
                                    />
                                    Generar e imprimir por separado (una orden por practica)
                                </label>

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
                                                disabled={generandoOrdenes || profesionalesConMatricula.length === 0}
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
                                                disabled={generandoOrdenes}
                                                className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                            >
                                                {generandoOrdenes && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                                                {generarImprimirPorSeparadoEditor ? 'Generar por practica' : 'Generar una orden'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => solicitarConfirmacionOrdenUnica(true)}
                                                disabled={generandoOrdenes}
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

                    {!modoCirugia && (
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
                    )}
                </div>

                <div className="order-1 space-y-4 lg:order-0 lg:col-start-2">
                    <div className="his-card p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            <ClipboardList className="h-4 w-4 text-blue-600" />
                            <h3 className="text-sm font-semibold text-gray-900">Codigos agregados en esta sesion</h3>
                        </div>
                        <p className="text-xs text-gray-600">
                            {modoCirugia
                                ? `Este panel confirma al instante cada codigo guardado para la cirugia #${contextoCirugia?.cirugiaId}.`
                                : 'Este panel confirma al instante cada codigo guardado para validar la carga sin perder ritmo.'}
                        </p>

                        {!modoCirugia && (
                            <>
                                <div className="rounded-md border border-blue-100 bg-blue-50/60 px-2 py-1.5 text-[11px] text-blue-800">
                                    Pendientes de esta sesion: {idsPendientesSesion.length}
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() => void ejecutarGeneracionOrdenes(false, idsPendientesSesion, false, { origen: 'sesion' })}
                                        disabled={generandoOrdenes || idsPendientesSesion.length === 0}
                                        className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                    >
                                        {generandoOrdenes && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                                        Generar orden (sesion)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={solicitarGeneracionDesdeSesion}
                                        disabled={generandoOrdenes || idsPendientesSesion.length === 0}
                                        className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                                    >
                                        <Printer className="h-3.5 w-3.5" />
                                        Generar orden e imprimir (sesion)
                                    </button>
                                </div>
                            </>
                        )}

                        {guardadasSesion.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-500">
                                Todavia no agregaste practicas en esta sesion.
                            </p>
                        ) : (
                            <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
                                {guardadasSesion.map((item) => (
                                    <div key={item.id} className="rounded-lg border border-blue-100 bg-blue-50/50 p-2.5">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="rounded border border-blue-100 bg-white px-2 py-1 font-mono text-xs font-semibold text-blue-700">
                                                {item.codigo}
                                            </span>
                                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                                Guardada
                                            </span>
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
                                        disabled={generandoOrdenes || profesionalesConMatricula.length === 0}
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
                                disabled={generandoOrdenes}
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
                        <h4 className="text-sm font-semibold text-blue-900">Codigos de sesion: titulos a generar e imprimir</h4>
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
                                disabled={generandoOrdenes}
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
