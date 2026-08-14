'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Plus, Scissors, ChevronDown, ChevronUp, Loader2, ChevronRight, Pencil, Trash2, Ban } from 'lucide-react'
import { anularOrdenAction, generarOrdenesDesdeInternacionAction } from '@/modules/orden/actions'
import { normalizarClasificacionAgrupacion } from '@/modules/orden/clasificacion'
import { fechaAInputLocal, fechaHoraAInputLocal, formatearFechaArgentina } from '@/lib/utils/argentina-date'
import { ProfesionalSelect } from '@/components/ui/profesional-select'
import { formatearNumeroOrden } from '@/modules/orden/types'
import { useBackgroundRefresh } from '@/lib/utils/client-mutation'
import {
    abrirVentanaImpresionPendiente,
    cerrarVentanaImpresion,
    navegarVentanaImpresion,
} from '@/lib/utils/print-window'

type OpcionObraSocial = {
    id: number
    nombre: string
    requiereCoseguro: boolean
}

type OpcionPlan = {
    id: number
    nombre: string
    obraSocialId: number | null
}

type OpcionCoseguro = {
    id: number
    nombre: string
}

type OpcionCama = {
    id: number
    identificador: string
    sector: string
    habitacion: string | null
}

type CirugiaUrgenciaItem = {
    id: number
    fechaCirugia: string | Date
    horaCirugia: string | null
    numeroAutorizacion: string | null
    observaciones: string | null
    cama: {
        id: number
        identificador: string
        sector: string
        habitacion: string | null
    } | null
    practicas: Array<{
        id: number
        codigo: string
        descripcion: string
        cantidad: number
        numeroAutorizacion: string | null
    }>
    diferenciales: Array<{
        esFeriado: boolean
        esNocturna: boolean
        mismaViaPatologia: boolean
        diferentesViasPatologia: boolean
        diferentesViasDiferentesPatologia: boolean
        dobleCirugia?: boolean
    }>
}

type PracticaInternacionItem = {
    id: number
    codigoPractica: string
    fecha: string | Date
    cantidad: number
    numeroAutorizacion: string | null
    facturable: boolean
    facturada: boolean
    estado: string | null
    usuario?: string | null
    matriculaEspecialista?: number | null
    matriculaAnestesista?: number | null
    puestoNumero?: number | null
    ordenNumero?: number | null
    tuvoOrdenGenerada?: boolean
    ordenPractica: Array<{
        puestoNumero: number
        ordenNumero: number
        item: number
        numeroAutorizacion: string | null
        fechaEmision?: string | Date | null
    }>
}

type EstadoPracticaCirugia = {
    pendiente: boolean
    practicaInternacionId: number
    ordenesGeneradas: Array<{
        puestoNumero: number
        ordenNumero: number
        item: number
        numeroAutorizacion: string | null
    }>
}

type GrupoPracticasAutorizadasCirugia = {
    key: string
    tipo: 'orden' | 'autorizacion'
    puestoNumero: number | null
    ordenNumero: number | null
    numeroAutorizacion: string | null
    fechaReferencia: Date | null
    totalCantidad: number
    practicas: CirugiaUrgenciaItem['practicas']
}

type ProfesionalConMatricula = {
    id: number
    nombre: string
    matricula: number
}

type PracticaCirugiaEditDraft = {
    codigoPractica: string
    fecha: string
    cantidad: string
    numeroAutorizacion: string
    matriculaEspecialista: string
    matriculaAnestesista: string
    facturable: boolean
}

type GeneracionOrdenCirugiaTask = {
    practicaIdsCirugia: number[]
    vinculaciones: Array<{
        practicaIdCirugia: number
        practicaIdInternacion: number
    }>
    practicaIdsInternacion: number[]
    imprimirDespues: boolean
    cirujanoFirmanteMatricula: number | undefined
}

const MATRICULA_PATOLOGIA_DEFAULT = 2675
const ORDENES_GENERADAS_POR_PAGINA = 5
const PRACTICAS_PENDIENTES_POR_PAGINA = 8
type SectorPracticaFiltro = 'UTI' | 'PISO'

function normalizarNumeroAutorizacion(value: string | null | undefined): string | null {
    const normalizado = value?.trim() ?? ''
    return normalizado.length > 0 ? normalizado : null
}

function esSectorUti(sector: string | null | undefined): boolean {
    const normalized = (sector ?? '').trim().toUpperCase()
    return normalized === 'CU' || normalized === 'UTI' || normalized === 'TERAPIA_INTENSIVA'
}

function grupoTieneNumeroAutorizacion(grupo: GrupoPracticasAutorizadasCirugia): boolean {
    return normalizarNumeroAutorizacion(grupo.numeroAutorizacion) != null
}

function practicaInternacionFacturada(practica: PracticaInternacionItem | null | undefined): boolean {
    if (!practica) return false
    return Boolean(practica.facturada)
}

function practicaInternacionTuvoOrdenGenerada(practica: PracticaInternacionItem | null | undefined): boolean {
    if (!practica) return false
    if (practica.tuvoOrdenGenerada === true) return true
    if ((practica.ordenPractica?.length ?? 0) > 0) return true
    return (
        practica.puestoNumero != null &&
        practica.ordenNumero != null &&
        Number(practica.puestoNumero) > 0 &&
        Number(practica.ordenNumero) > 0
    )
}

function siglasIncluidasDesdeTexto(value: string | null | undefined): string | null {
    const raw = (value ?? '').toUpperCase()
    const grupos = raw.match(/\(([^)]+)\)/g) ?? []
    for (const grupo of grupos) {
        const inner = grupo.slice(1, -1)
        if (!inner) continue
        const tokens = inner
            .split('+')
            .map((token) => token.trim())
            .filter(Boolean)
        if (tokens.length === 0) continue
        const normalizados = tokens
            .map((token) => normalizarClasificacionAgrupacion(token))
            .filter((token): token is string => token != null)
        if (normalizados.length > 0) {
            return normalizados.join('+')
        }
    }
    return null
}

function siglasIncluidasPracticaCirugia(
    practicaCirugia: { codigo: string; descripcion: string },
    practicaInternacion: PracticaInternacionItem | null | undefined
): string {
    const desdeInternacion =
        siglasIncluidasDesdeTexto(practicaInternacion?.codigoPractica) ??
        siglasIncluidasDesdeTexto(
            (practicaInternacion as unknown as { descripcionPractica?: string | null })?.descripcionPractica
        )
    if (desdeInternacion) return desdeInternacion

    const desdeCirugia = siglasIncluidasDesdeTexto(practicaCirugia.descripcion)
    if (desdeCirugia) return desdeCirugia

    if (practicaInternacion?.codigoPractica.trim() === '66') return 'HE'

    const matEsp = practicaInternacion?.matriculaEspecialista ?? null
    const matAn = practicaInternacion?.matriculaAnestesista ?? null
    if (matAn && !matEsp) return 'HA'
    if (matEsp && !matAn) return 'HE'
    return 'HE'
}

interface CirugiaUrgenciaSectionProps {
    ingresoId: number
    pacienteId: number | null
    sectorInternacionActual?: string | null
    sectorPorPracticaId?: Record<number, SectorPracticaFiltro>
    puedeCrear: boolean
    obraSociales: OpcionObraSocial[]
    planes: OpcionPlan[]
    coseguros: OpcionCoseguro[]
    camasDisponibles: OpcionCama[]
    cirugias: CirugiaUrgenciaItem[]
    practicasInternacion: PracticaInternacionItem[]
    matriculaTratanteDefault?: number | null
}


export function CirugiaUrgenciaSection({
    ingresoId,
    pacienteId,
    sectorInternacionActual,
    sectorPorPracticaId,
    puedeCrear,
    cirugias: cirugiasIniciales,
    practicasInternacion,
    matriculaTratanteDefault,
}: CirugiaUrgenciaSectionProps) {
    const { refreshInBackground } = useBackgroundRefresh()

    const [cirugias, setCirugias] = useState<CirugiaUrgenciaItem[]>(cirugiasIniciales)
    const [expandido, setExpandido] = useState(true)
    const [creandoCirugia, setCreandoCirugia] = useState(false)
    const [generandoOrdenAgrupada, setGenerandoOrdenAgrupada] = useState(false)
    const [tareasGeneracionPendientes, setTareasGeneracionPendientes] = useState(0)
    const [practicaIdsCirugiaEnGeneracion, setPracticaIdsCirugiaEnGeneracion] = useState<number[]>([])
    const [error, setError] = useState<string | null>(null)
    const [mostrarUti, setMostrarUti] = useState(true)
    const [mostrarPiso, setMostrarPiso] = useState(true)
    const [practicasSeleccionadasImpresion, setPracticasSeleccionadasImpresion] = useState<number[]>([])
    const [profesionalesFirmantes, setProfesionalesFirmantes] = useState<ProfesionalConMatricula[]>([])
    const [mostrarPendientesAutorizacionPorCirugia, setMostrarPendientesAutorizacionPorCirugia] = useState<Record<number, boolean>>({})
    const [mostrarYaAutorizadasPorCirugia, setMostrarYaAutorizadasPorCirugia] = useState<Record<number, boolean>>({})
    const [cirugiasAbiertas, setCirugiasAbiertas] = useState<Record<number, boolean>>({})
    const [cirujanoFirmanteId, setCirujanoFirmanteId] = useState('')
    const [firmanteEditadoManualmente, setFirmanteEditadoManualmente] = useState(false)
    const [ordenesAutorizadasAbiertas, setOrdenesAutorizadasAbiertas] = useState<Record<string, boolean>>({})
    const [ordenesAutorizadasExpandidas, setOrdenesAutorizadasExpandidas] = useState<Record<string, boolean>>({})
    const [paginaPendientesPorCirugia, setPaginaPendientesPorCirugia] = useState<Record<number, number>>({})
    const [paginaOrdenesGeneradasPorCirugia, setPaginaOrdenesGeneradasPorCirugia] = useState<Record<number, number>>({})
    const [eliminandoPracticaCirugiaId, setEliminandoPracticaCirugiaId] = useState<number | null>(null)
    const [anulandoCirugiaId, setAnulandoCirugiaId] = useState<number | null>(null)
    const [anulandoOrdenGrupoKey, setAnulandoOrdenGrupoKey] = useState<string | null>(null)
    const [ordenesAnuladasTemporal, setOrdenesAnuladasTemporal] = useState<string[]>([])
    const [guardandoPracticaEditando, setGuardandoPracticaEditando] = useState(false)
    const [practicaEditando, setPracticaEditando] = useState<{
        cirugiaId: number
        practicaCirugiaId: number
        practicaInternacionId: number
    } | null>(null)
    const [draftPracticaEditando, setDraftPracticaEditando] = useState<PracticaCirugiaEditDraft | null>(null)
    const colaGeneracionRef = useRef<Promise<void>>(Promise.resolve())
    const practicaIdsEnGeneracionRef = useRef<Set<number>>(new Set())

    const hayGeneracionesEnBackground = tareasGeneracionPendientes > 0

    const recargarPaginaCompleta = () => {
        refreshInBackground()
    }

    useEffect(() => {
        setCirugias(cirugiasIniciales)
    }, [cirugiasIniciales])

    const cirugiasOrdenadas = useMemo(() => {
        const lista = [...cirugias]
        lista.sort((a, b) => {
            const fechaA = new Date(a.fechaCirugia).getTime()
            const fechaB = new Date(b.fechaCirugia).getTime()
            const fechaANormalizada = Number.isFinite(fechaA) ? fechaA : Number.MAX_SAFE_INTEGER
            const fechaBNormalizada = Number.isFinite(fechaB) ? fechaB : Number.MAX_SAFE_INTEGER

            if (fechaANormalizada !== fechaBNormalizada) return fechaANormalizada - fechaBNormalizada
            return a.id - b.id
        })
        return lista
    }, [cirugias])

    useEffect(() => {
        setGenerandoOrdenAgrupada(hayGeneracionesEnBackground)
    }, [hayGeneracionesEnBackground])

    useEffect(() => {
        let cancelled = false

        const cargarFirmantes = async () => {
            try {
                const res = await fetch('/api/cirugia/profesionales', { cache: 'no-store' })
                const json = await res.json().catch(() => null)
                const data: unknown[] = Array.isArray(json?.data) ? json.data : []

                if (cancelled) return

                const profesionales = data
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
                    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))

                setProfesionalesFirmantes(profesionales)
            } catch {
                if (!cancelled) {
                    setProfesionalesFirmantes([])
                }
            }
        }

        void cargarFirmantes()

        return () => {
            cancelled = true
        }
    }, [])

    const practicaIdsCirugias = useMemo(
        () => cirugias.flatMap((cirugia) => cirugia.practicas.map((practica) => practica.id)),
        [cirugias]
    )

    const practicasInternacionPorId = useMemo(
        () => new Map(practicasInternacion.map((practica) => [practica.id, practica] as const)),
        [practicasInternacion]
    )

    const sectorFallbackPracticas: SectorPracticaFiltro = esSectorUti(sectorInternacionActual) ? 'UTI' : 'PISO'
    const coincideFiltroSectorPractica = (practicaId: number): boolean => {
        const sector = sectorPorPracticaId?.[practicaId] ?? sectorFallbackPracticas
        if (sector === 'UTI') return mostrarUti
        return mostrarPiso
    }

    const matriculaPorProfesionalId = useMemo(() => {
        const map = new Map<number, number>()
        for (const profesional of profesionalesFirmantes) {
            map.set(profesional.id, profesional.matricula)
        }
        return map
    }, [profesionalesFirmantes])

    const profesionalIdPorMatricula = useMemo(() => {
        const map = new Map<number, number>()
        for (const profesional of profesionalesFirmantes) {
            map.set(profesional.matricula, profesional.id)
        }
        return map
    }, [profesionalesFirmantes])

    const ordenesAnuladasTemporalSet = useMemo(
        () => new Set(ordenesAnuladasTemporal),
        [ordenesAnuladasTemporal]
    )

    const estadoPracticaCirugiaPorId = useMemo(() => {
        const estadoPorId = new Map<number, EstadoPracticaCirugia>()
        const practicasInternacionPorCodigo = new Map<string, PracticaInternacionItem[]>()

        for (const practica of practicasInternacion) {
            const estado = (practica.estado ?? 'A').trim().toUpperCase()
            if (estado === 'X') continue

            const codigo = practica.codigoPractica.trim().toUpperCase()
            if (!codigo) continue

            const bucket = practicasInternacionPorCodigo.get(codigo) ?? []
            bucket.push(practica)
            practicasInternacionPorCodigo.set(codigo, bucket)
        }

        for (const bucket of practicasInternacionPorCodigo.values()) {
            bucket.sort((a, b) => a.id - b.id)
        }

        for (const cirugia of cirugias) {
            const usadosPorCodigo = new Set<number>()

            for (const practicaCirugia of cirugia.practicas) {
                const codigoCirugia = practicaCirugia.codigo.trim().toUpperCase()
                const candidatas = practicasInternacionPorCodigo.get(codigoCirugia) ?? []

                const candidataPrioritaria = candidatas.find((item) => {
                    if (usadosPorCodigo.has(item.id)) return false
                    const usuario = (item.usuario ?? '').trim().toUpperCase()
                    return usuario === 'CIRUGIA'
                })
                const candidataFallback = candidatas.find((item) => !usadosPorCodigo.has(item.id))
                const candidata = candidataPrioritaria ?? candidataFallback

                if (!candidata) continue

                usadosPorCodigo.add(candidata.id)

                const ordenesGeneradas = (candidata.ordenPractica ?? [])
                    .map((orden) => ({
                        puestoNumero: orden.puestoNumero,
                        ordenNumero: orden.ordenNumero,
                        item: orden.item,
                        numeroAutorizacion: orden.numeroAutorizacion,
                    }))
                    .filter(
                        (orden) => !ordenesAnuladasTemporalSet.has(`${orden.puestoNumero}:${orden.ordenNumero}`)
                    )

                estadoPorId.set(practicaCirugia.id, {
                    pendiente: ordenesGeneradas.length === 0 && !practicaInternacionTuvoOrdenGenerada(candidata),
                    practicaInternacionId: candidata.id,
                    ordenesGeneradas,
                })
            }
        }

        return estadoPorId
    }, [cirugias, practicasInternacion, ordenesAnuladasTemporalSet])

    const practicaIdsCirugiaEnGeneracionSet = useMemo(
        () => new Set(practicaIdsCirugiaEnGeneracion),
        [practicaIdsCirugiaEnGeneracion]
    )

    const practicaIdsPendientesCirugia = useMemo(
        () => practicaIdsCirugias.filter(
            (id) =>
                estadoPracticaCirugiaPorId.get(id)?.pendiente === true &&
                !practicaIdsCirugiaEnGeneracionSet.has(id)
        ),
        [practicaIdsCirugias, estadoPracticaCirugiaPorId, practicaIdsCirugiaEnGeneracionSet]
    )

    const setPracticaIdsPendientesCirugia = useMemo(
        () => new Set(practicaIdsPendientesCirugia),
        [practicaIdsPendientesCirugia]
    )

    const practicasSeleccionadasVigentes = useMemo(
        () => practicasSeleccionadasImpresion.filter((id) => setPracticaIdsPendientesCirugia.has(id)),
        [practicasSeleccionadasImpresion, setPracticaIdsPendientesCirugia]
    )

    useEffect(() => {
        setPracticasSeleccionadasImpresion((prev) => prev.filter((id) => setPracticaIdsPendientesCirugia.has(id)))
    }, [setPracticaIdsPendientesCirugia])

    const gruposAutorizadosPorCirugia = useMemo(() => {
        const resultado = new Map<number, GrupoPracticasAutorizadasCirugia[]>()

        for (const cirugia of cirugias) {
            const grupos = new Map<string, GrupoPracticasAutorizadasCirugia>()

            for (const practica of cirugia.practicas) {
                const estadoPractica = estadoPracticaCirugiaPorId.get(practica.id)
                const ordenesGeneradas = estadoPractica?.ordenesGeneradas ?? []
                const numeroManual = normalizarNumeroAutorizacion(practica.numeroAutorizacion)

                if (ordenesGeneradas.length > 0) {
                    for (const orden of ordenesGeneradas) {
                        const key = `ORD-${orden.puestoNumero}-${orden.ordenNumero}`
                        const existente = grupos.get(key)
                        if (existente) {
                            if (!existente.practicas.some((item) => item.id === practica.id)) {
                                existente.practicas.push(practica)
                                existente.totalCantidad += Number.isFinite(practica.cantidad)
                                    ? Number(practica.cantidad)
                                    : 0
                            }
                            continue
                        }

                        grupos.set(key, {
                            key,
                            tipo: 'orden',
                            puestoNumero: orden.puestoNumero,
                            ordenNumero: orden.ordenNumero,
                            numeroAutorizacion: normalizarNumeroAutorizacion(orden.numeroAutorizacion) ?? numeroManual,
                            fechaReferencia: null,
                            totalCantidad: Number.isFinite(practica.cantidad) ? Number(practica.cantidad) : 0,
                            practicas: [practica],
                        })
                    }
                    continue
                }

                if (!numeroManual) continue

                const key = `AUT-${numeroManual}`
                const existente = grupos.get(key)
                if (existente) {
                    if (!existente.practicas.some((item) => item.id === practica.id)) {
                        existente.practicas.push(practica)
                        existente.totalCantidad += Number.isFinite(practica.cantidad)
                            ? Number(practica.cantidad)
                            : 0
                    }
                    continue
                }

                grupos.set(key, {
                    key,
                    tipo: 'autorizacion',
                    puestoNumero: null,
                    ordenNumero: null,
                    numeroAutorizacion: numeroManual,
                    fechaReferencia: null,
                    totalCantidad: Number.isFinite(practica.cantidad) ? Number(practica.cantidad) : 0,
                    practicas: [practica],
                })
            }

            const lista = Array.from(grupos.values())
                .map((grupo) => ({
                    ...grupo,
                    practicas: [...grupo.practicas].sort((a, b) => {
                        const diffCodigo = a.codigo.localeCompare(b.codigo)
                        if (diffCodigo !== 0) return diffCodigo
                        return a.descripcion.localeCompare(b.descripcion)
                    }),
                }))
                .map((grupo) => {
                    const fechaReferenciaMs = grupo.practicas.reduce((max, practica) => {
                        const estadoPractica = estadoPracticaCirugiaPorId.get(practica.id)
                        const practicaInternacion = estadoPractica
                            ? practicasInternacionPorId.get(estadoPractica.practicaInternacionId)
                            : null

                        let fechaOrdenGrupo: Date | string | null | undefined = null
                        if (grupo.tipo === 'orden' && grupo.puestoNumero != null && grupo.ordenNumero != null) {
                            const ordenPracticaVinculada = practicaInternacion?.ordenPractica.find(
                                (orden) =>
                                    orden.puestoNumero === grupo.puestoNumero &&
                                    orden.ordenNumero === grupo.ordenNumero
                            )
                            fechaOrdenGrupo = ordenPracticaVinculada?.fechaEmision
                        }

                        const ms = fechaOrdenGrupo
                            ? new Date(fechaOrdenGrupo).getTime()
                            : (practicaInternacion ? new Date(practicaInternacion.fecha).getTime() : 0)
                        return Math.max(max, Number.isFinite(ms) ? ms : 0)
                    }, 0)

                    return {
                        ...grupo,
                        fechaReferenciaMs,
                        fechaReferencia: fechaReferenciaMs > 0 ? new Date(fechaReferenciaMs) : null,
                    }
                })
                .sort((a, b) => {
                    if (a.fechaReferenciaMs !== b.fechaReferenciaMs) return a.fechaReferenciaMs - b.fechaReferenciaMs
                    if (a.tipo !== b.tipo) return a.tipo === 'orden' ? -1 : 1
                    if (a.puestoNumero !== b.puestoNumero) return (a.puestoNumero ?? 0) - (b.puestoNumero ?? 0)
                    if (a.ordenNumero !== b.ordenNumero) return (a.ordenNumero ?? 0) - (b.ordenNumero ?? 0)
                    return a.key.localeCompare(b.key)
                })
                .map(({ fechaReferenciaMs: _, ...grupo }) => grupo)

            resultado.set(cirugia.id, lista)
        }

        return resultado
    }, [cirugias, estadoPracticaCirugiaPorId, practicasInternacionPorId])

    const matriculaFirmanteSugerida = useMemo(() => {
        if (matriculaTratanteDefault != null && matriculaTratanteDefault > 0) {
            return matriculaTratanteDefault
        }

        const idsRelevantes = practicasSeleccionadasVigentes.length > 0
            ? practicasSeleccionadasVigentes
            : practicaIdsPendientesCirugia

        for (const practicaCirugiaId of idsRelevantes) {
            const estadoPractica = estadoPracticaCirugiaPorId.get(practicaCirugiaId)
            if (!estadoPractica?.pendiente) continue

            const practica = practicasInternacionPorId.get(estadoPractica.practicaInternacionId)
            if (!practica) continue

            const matriculaEspecialista = practica.matriculaEspecialista
            if (matriculaEspecialista == null || matriculaEspecialista <= 0) continue
            if (matriculaEspecialista === MATRICULA_PATOLOGIA_DEFAULT) continue
            if (practica.codigoPractica.trim().startsWith('15')) continue

            return matriculaEspecialista
        }

        return null
    }, [
        matriculaTratanteDefault,
        practicaIdsPendientesCirugia,
        practicasSeleccionadasVigentes,
        estadoPracticaCirugiaPorId,
        practicasInternacionPorId,
    ])

    const firmaPrevistaTexto = useMemo(() => {
        const profesionalSeleccionadoId = Number.parseInt(cirujanoFirmanteId, 10)
        if (Number.isFinite(profesionalSeleccionadoId)) {
            const profesionalSeleccionado = profesionalesFirmantes.find(
                (profesional) => profesional.id === profesionalSeleccionadoId
            )
            if (profesionalSeleccionado) {
                return `${profesionalSeleccionado.nombre} · MP ${profesionalSeleccionado.matricula}`
            }
        }

        if (matriculaFirmanteSugerida != null) {
            const sugerido = profesionalesFirmantes.find(
                (profesional) => profesional.matricula === matriculaFirmanteSugerida
            )
            if (sugerido) {
                return `${sugerido.nombre} · MP ${sugerido.matricula} (sugerido)`
            }
            return `Matrícula ${matriculaFirmanteSugerida} (sugerida)`
        }

        return 'Sin firmante seleccionado. Se usará el profesional de la internación.'
    }, [cirujanoFirmanteId, profesionalesFirmantes, matriculaFirmanteSugerida])

    useEffect(() => {
        const profesionalIdSugerido =
            matriculaFirmanteSugerida != null
                ? (profesionalIdPorMatricula.get(matriculaFirmanteSugerida) ?? null)
                : null

        if (!profesionalIdSugerido) return
        if (firmanteEditadoManualmente && cirujanoFirmanteId) return

        const siguiente = String(profesionalIdSugerido)
        if (cirujanoFirmanteId === siguiente) return

        setCirujanoFirmanteId(siguiente)
    }, [
        matriculaFirmanteSugerida,
        profesionalIdPorMatricula,
        firmanteEditadoManualmente,
        cirujanoFirmanteId,
    ])

    useEffect(() => {
        if (!cirujanoFirmanteId) return

        const profesionalId = Number.parseInt(cirujanoFirmanteId, 10)
        if (!Number.isFinite(profesionalId) || !matriculaPorProfesionalId.has(profesionalId)) {
            setCirujanoFirmanteId('')
            setFirmanteEditadoManualmente(false)
        }
    }, [cirujanoFirmanteId, matriculaPorProfesionalId])

    useEffect(() => {
        setPaginaPendientesPorCirugia({})
        setPaginaOrdenesGeneradasPorCirugia({})
    }, [mostrarUti, mostrarPiso])

    const abrirEdicionPracticaCirugia = (cirugiaId: number, practicaCirugiaId: number) => {
        const estado = estadoPracticaCirugiaPorId.get(practicaCirugiaId)
        if (!estado) {
            setError('No se encontró la práctica de internación asociada para editar')
            return
        }

        const practicaInternacion = practicasInternacionPorId.get(estado.practicaInternacionId)
        if (!practicaInternacion) {
            setError('No se encontró la práctica de internación asociada para editar')
            return
        }

        setError(null)
        setPracticaEditando({
            cirugiaId,
            practicaCirugiaId,
            practicaInternacionId: practicaInternacion.id,
        })
        setDraftPracticaEditando({
            codigoPractica: practicaInternacion.codigoPractica.trim(),
            fecha: fechaHoraAInputLocal(practicaInternacion.fecha),
            cantidad: String(
                Number.isFinite(Number(practicaInternacion.cantidad)) && Number(practicaInternacion.cantidad) > 0
                    ? Number(practicaInternacion.cantidad)
                    : 1
            ),
            numeroAutorizacion: practicaInternacion.numeroAutorizacion ?? '',
            matriculaEspecialista: practicaInternacion.matriculaEspecialista != null
                ? String(practicaInternacion.matriculaEspecialista)
                : '',
            matriculaAnestesista: practicaInternacion.matriculaAnestesista != null
                ? String(practicaInternacion.matriculaAnestesista)
                : '',
            facturable: Boolean(practicaInternacion.facturable),
        })
    }

    const cerrarEdicionPracticaCirugia = () => {
        if (guardandoPracticaEditando) return
        setPracticaEditando(null)
        setDraftPracticaEditando(null)
    }

    const guardarEdicionPracticaCirugia = async () => {
        if (!practicaEditando || !draftPracticaEditando) return

        const codigoPractica = draftPracticaEditando.codigoPractica.trim().toUpperCase()
        if (!codigoPractica) {
            setError('El código de práctica es obligatorio')
            return
        }

        const cantidad = Number.parseInt(draftPracticaEditando.cantidad, 10)
        if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 999) {
            setError('La cantidad debe estar entre 1 y 999')
            return
        }

        if (!draftPracticaEditando.fecha) {
            setError('La fecha de la práctica es obligatoria')
            return
        }

        const payload = {
            convenioId: null,
            codigoPractica,
            descripcionPractica: null,
            numeroProtocoloLaboratorio: null,
            diagnosticoLaboratorio: null,
            fecha: new Date(draftPracticaEditando.fecha).toISOString(),
            cantidad,
            numeroAutorizacion: draftPracticaEditando.numeroAutorizacion.trim() || null,
            facturable: draftPracticaEditando.facturable,
            importeBaseUnitario: null,
            matriculaEspecialista: draftPracticaEditando.matriculaEspecialista.trim() !== ''
                ? Number(draftPracticaEditando.matriculaEspecialista)
                : null,
            matriculaAnestesista: draftPracticaEditando.matriculaAnestesista.trim() !== ''
                ? Number(draftPracticaEditando.matriculaAnestesista)
                : null,
        }

        setError(null)
        setGuardandoPracticaEditando(true)
        try {
            const res = await fetch(
                `/api/internacion/${ingresoId}/practicas/${practicaEditando.practicaInternacionId}`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    cache: 'no-store',
                }
            )

            const json = await res.json().catch(() => null)
            if (!res.ok) {
                setError(json?.error ?? 'No se pudo editar la práctica')
                return
            }

            cerrarEdicionPracticaCirugia()
            refreshInBackground()
        } catch {
            setError('Error de conexión al editar la práctica')
        } finally {
            setGuardandoPracticaEditando(false)
        }
    }

    const eliminarPracticaPendienteCirugia = async (cirugiaId: number, practicaCirugiaId: number) => {
        const estado = estadoPracticaCirugiaPorId.get(practicaCirugiaId)
        if (!estado?.pendiente) {
            setError('Solo se pueden eliminar prácticas sin orden generada')
            return
        }

        if (typeof window !== 'undefined') {
            const confirmar = window.confirm('Se eliminará la práctica seleccionada. ¿Desea continuar?')
            if (!confirmar) return
        }

        setError(null)
        setEliminandoPracticaCirugiaId(practicaCirugiaId)
        try {
            const res = await fetch(`/api/cirugia/${cirugiaId}/practicas/${practicaCirugiaId}`, {
                method: 'DELETE',
                cache: 'no-store',
            })

            const json = await res.json().catch(() => null)
            if (!res.ok) {
                setError(json?.error ?? 'No se pudo eliminar la práctica de cirugía')
                return
            }

            setPracticasSeleccionadasImpresion((prev) => prev.filter((id) => id !== practicaCirugiaId))
            recargarPaginaCompleta()
        } catch {
            setError('Error de conexión al eliminar la práctica de cirugía')
        } finally {
            setEliminandoPracticaCirugiaId(null)
        }
    }

    const anularOrdenGeneradaCirugia = async (grupoKey: string, puestoNumero: number, ordenNumero: number) => {
        if (typeof window !== 'undefined') {
            const confirmar = window.confirm(
                `Se anulará la orden ${formatearNumeroOrden(puestoNumero, ordenNumero)}. ¿Desea continuar?`
            )
            if (!confirmar) return
        }

        setError(null)
        setAnulandoOrdenGrupoKey(grupoKey)
        try {
            const result = await anularOrdenAction(puestoNumero, ordenNumero)
            if ('error' in result && result.error) {
                setError(result.error)
                return
            }

            setOrdenesAnuladasTemporal((prev) =>
                Array.from(new Set([...prev, `${puestoNumero}:${ordenNumero}`]))
            )

            recargarPaginaCompleta()
        } catch {
            setError('No se pudo anular la orden')
        } finally {
            setAnulandoOrdenGrupoKey(null)
        }
    }

    const anularFichaQuirurgica = async (cirugiaId: number) => {
        const cirugia = cirugias.find((item) => item.id === cirugiaId) ?? null
        const totalPracticas = cirugia?.practicas.length ?? 0

        if (typeof window !== 'undefined') {
            const confirmar = window.confirm(
                totalPracticas > 0
                    ? `Se anulará la ficha quirúrgica ${cirugiaId}. Si tiene prácticas pendientes sin orden/autorización, también se anularán. ¿Desea continuar?`
                    : `Se anulará la ficha quirúrgica ${cirugiaId}. ¿Desea continuar?`
            )
            if (!confirmar) return
        }

        setError(null)
        setAnulandoCirugiaId(cirugiaId)
        try {
            const res = await fetch(`/api/internacion/${ingresoId}/cirugias/${cirugiaId}`, {
                method: 'DELETE',
                cache: 'no-store',
            })

            const json = await res.json().catch(() => null)
            if (!res.ok) {
                setError(json?.error ?? 'No se pudo anular la ficha quirúrgica')
                return
            }

            const idsPracticasCirugia = new Set((cirugia?.practicas ?? []).map((practica) => practica.id))
            setPracticasSeleccionadasImpresion((prev) => prev.filter((id) => !idsPracticasCirugia.has(id)))

            setCirugiasAbiertas((prev) => {
                if (!(cirugiaId in prev)) return prev
                const next = { ...prev }
                delete next[cirugiaId]
                return next
            })

            recargarPaginaCompleta()
        } catch {
            setError('Error de conexión al anular la ficha quirúrgica')
        } finally {
            setAnulandoCirugiaId(null)
        }
    }

    const iniciarNuevaCirugia = async () => {
        if (!pacienteId) {
            setError('No hay paciente asociado para crear una nueva cirugia')
            return
        }

        setError(null)
        setCreandoCirugia(true)

        try {
            const res = await fetch(`/api/internacion/${ingresoId}/cirugias`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pacienteId,
                    fechaCirugia: fechaAInputLocal(),
                    horaCirugia: null,
                    descripcion: 'Creada desde internacion para carga de practicas',
                }),
            })

            const json = await res.json().catch(() => ({}))
            if (!res.ok) {
                throw new Error(json.error ?? 'No se pudo crear la cirugia')
            }

            const nuevaCirugia = json.data as CirugiaUrgenciaItem
            setCirugias((prev) => [nuevaCirugia, ...prev])
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo crear la cirugia')
        } finally {
            setCreandoCirugia(false)
        }
    }

    const alternarSeleccionPracticaCirugia = (practicaId: number, checked: boolean) => {
        setPracticasSeleccionadasImpresion((prev) => {
            if (checked) {
                if (prev.includes(practicaId)) return prev
                return [...prev, practicaId]
            }
            return prev.filter((id) => id !== practicaId)
        })
    }

    const alternarSeleccionTodasCirugia = (practicaIds: number[], checked: boolean) => {
        if (!checked) {
            setPracticasSeleccionadasImpresion((prev) => prev.filter((id) => !practicaIds.includes(id)))
            return
        }

        setPracticasSeleccionadasImpresion((prev) => {
            const next = new Set(prev)
            for (const practicaId of practicaIds) {
                next.add(practicaId)
            }
            return Array.from(next)
        })
    }

    const ejecutarGeneracionOrdenesCirugiaTask = async (task: GeneracionOrdenCirugiaTask) => {
        const ventanaImpresion = task.imprimirDespues ? abrirVentanaImpresionPendiente() : null
        let impresionDisparada = false

        try {
            const result = await generarOrdenesDesdeInternacionAction({
                ingresoId,
                practicaIds: task.practicaIdsInternacion,
                agruparEnUnaOrden: true,
                cirujanoFirmanteMatricula: task.cirujanoFirmanteMatricula,
                origenGeneracion: 'CIRUGIA',
            })

            if ('error' in result && result.error) {
                setError(result.error)
                return
            }

            const grupos = Array.isArray((result as { ordenesPorGrupo?: unknown }).ordenesPorGrupo)
                ? ((result as {
                    ordenesPorGrupo: Array<{ puestoNumero: number; numero: number; practicaIds: number[] }>
                }).ordenesPorGrupo)
                : []

            if (grupos.length === 0) {
                setError('No se generaron ordenes para las practicas seleccionadas')
                return
            }

            const ordenesParam = grupos
                .map((orden) => `${orden.puestoNumero}-${orden.numero}`)
                .join(',')

            const idsAsignadosInternacion = new Set(grupos.flatMap((grupo) => grupo.practicaIds))
            const idsAsignadosCirugia = new Set<number>()
            for (const vinculacion of task.vinculaciones) {
                if (idsAsignadosInternacion.has(vinculacion.practicaIdInternacion)) {
                    idsAsignadosCirugia.add(vinculacion.practicaIdCirugia)
                }
            }

            setPracticasSeleccionadasImpresion((prev) => prev.filter((id) => !idsAsignadosCirugia.has(id)))

            if (task.imprimirDespues) {
                const url = `/dashboard/ambulatorio/imprimir?ordenes=${encodeURIComponent(ordenesParam)}`
                navegarVentanaImpresion(ventanaImpresion, url)
                impresionDisparada = true
            }

            refreshInBackground()
        } catch {
            setError('No se pudo generar la orden agrupada')
        } finally {
            if (!impresionDisparada) {
                cerrarVentanaImpresion(ventanaImpresion)
            }
        }
    }

    const generarOrdenAgrupada = (imprimirDespues: boolean) => {
        if (practicasSeleccionadasVigentes.length === 0) {
            setError('Selecciona al menos una practica de cirugia para generar una sola orden')
            return
        }

        const practicaIdsDisponibles = Array.from(new Set(practicasSeleccionadasVigentes)).filter(
            (id) => !practicaIdsEnGeneracionRef.current.has(id)
        )

        if (practicaIdsDisponibles.length === 0) {
            setError('No hay practicas pendientes disponibles para generar')
            return
        }

        const practicasCirugiaSeleccionadas = cirugias
            .flatMap((cirugia) => cirugia.practicas)
            .filter((practica) => practicaIdsDisponibles.includes(practica.id))

        const vinculacionesSeleccionadas = practicasCirugiaSeleccionadas
            .map((practica) => {
                const estado = estadoPracticaCirugiaPorId.get(practica.id)
                if (!estado || !estado.pendiente) return null
                return {
                    practicaIdCirugia: practica.id,
                    practicaIdInternacion: estado.practicaInternacionId,
                }
            })
            .filter((item): item is { practicaIdCirugia: number; practicaIdInternacion: number } => item != null)

        const practicaIdsInternacionSeleccionadas = Array.from(
            new Set(vinculacionesSeleccionadas.map((item) => item.practicaIdInternacion))
        )

        if (practicaIdsInternacionSeleccionadas.length === 0) {
            setError('No se encontraron practicas pendientes de internacion para la seleccion de cirugia')
            return
        }

        const profesionalIdFirmante = Number.parseInt(cirujanoFirmanteId, 10)
        const cirujanoFirmanteMatricula = Number.isFinite(profesionalIdFirmante)
            ? (matriculaPorProfesionalId.get(profesionalIdFirmante) ?? null)
            : matriculaFirmanteSugerida

        const task: GeneracionOrdenCirugiaTask = {
            practicaIdsCirugia: practicaIdsDisponibles,
            vinculaciones: vinculacionesSeleccionadas,
            practicaIdsInternacion: practicaIdsInternacionSeleccionadas,
            imprimirDespues,
            cirujanoFirmanteMatricula: cirujanoFirmanteMatricula ?? undefined,
        }

        setError(null)
        task.practicaIdsCirugia.forEach((id) => practicaIdsEnGeneracionRef.current.add(id))
        setPracticaIdsCirugiaEnGeneracion((prev) => Array.from(new Set([...prev, ...task.practicaIdsCirugia])))
        setPracticasSeleccionadasImpresion((prev) => prev.filter((id) => !task.practicaIdsCirugia.includes(id)))
        setTareasGeneracionPendientes((prev) => prev + 1)

        colaGeneracionRef.current = colaGeneracionRef.current
            .catch(() => undefined)
            .then(async () => {
                try {
                    await ejecutarGeneracionOrdenesCirugiaTask(task)
                } finally {
                    task.practicaIdsCirugia.forEach((id) => practicaIdsEnGeneracionRef.current.delete(id))
                    setPracticaIdsCirugiaEnGeneracion((prev) => prev.filter((id) => !task.practicaIdsCirugia.includes(id)))
                    setTareasGeneracionPendientes((prev) => Math.max(0, prev - 1))
                }
            })
    }

    return (
        <div className="his-card">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <button
                    onClick={() => setExpandido((v) => !v)}
                    className="flex items-center gap-2 text-sm font-semibold text-gray-900 hover:text-gray-700"
                >
                    <Scissors className="h-4 w-4 text-gray-400" />
                    Cirugia
                    <span className="text-xs font-normal text-gray-400 ml-1">({cirugias.length})</span>
                    {expandido ? (
                        <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
                    ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                    )}
                </button>

                {puedeCrear && (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => void iniciarNuevaCirugia()}
                            disabled={creandoCirugia}
                            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1 hover:bg-blue-50 disabled:opacity-60"
                        >
                            {creandoCirugia ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                            {creandoCirugia ? 'Creando cirugia...' : 'Agregar cirugia'}
                        </button>
                    </div>
                )}
            </div>

            {expandido && (
                <div className="p-4 space-y-4">
                    {error && (
                        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    {hayGeneracionesEnBackground && (
                        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                            Generando órdenes de cirugía en segundo plano: {tareasGeneracionPendientes} tarea(s) en cola.
                        </div>
                    )}

                    {cirugias.length === 0 ? (
                        <p className="text-sm text-gray-500">No hay cirugias registradas.</p>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                                <span className="text-[11px] font-medium text-gray-700">Mostrar prácticas/órdenes cargadas:</span>
                                <label className="inline-flex items-center gap-1.5 text-xs text-gray-700">
                                    <input
                                        type="checkbox"
                                        checked={mostrarUti}
                                        onChange={(e) => setMostrarUti(e.target.checked)}
                                        className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                    />
                                    UTI
                                </label>
                                <label className="inline-flex items-center gap-1.5 text-xs text-gray-700">
                                    <input
                                        type="checkbox"
                                        checked={mostrarPiso}
                                        onChange={(e) => setMostrarPiso(e.target.checked)}
                                        className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                    />
                                    PISO
                                </label>
                            </div>

                            {cirugiasOrdenadas.map((c) => {
                                const cirugiaAbierta = cirugiasAbiertas[c.id] ?? false
                                const practicasPendientesCirugiaItem = c.practicas
                                    .filter((practica) => {
                                        const estadoPractica = estadoPracticaCirugiaPorId.get(practica.id)
                                        return estadoPractica?.pendiente !== false && coincideFiltroSectorPractica(practica.id)
                                    })
                                    .sort((a, b) => {
                                        const estadoA = estadoPracticaCirugiaPorId.get(a.id)
                                        const estadoB = estadoPracticaCirugiaPorId.get(b.id)
                                        const practicaA = estadoA
                                            ? (practicasInternacionPorId.get(estadoA.practicaInternacionId) ?? null)
                                            : null
                                        const practicaB = estadoB
                                            ? (practicasInternacionPorId.get(estadoB.practicaInternacionId) ?? null)
                                            : null

                                        const fechaA = practicaA ? new Date(practicaA.fecha).getTime() : Number.MAX_SAFE_INTEGER
                                        const fechaB = practicaB ? new Date(practicaB.fecha).getTime() : Number.MAX_SAFE_INTEGER

                                        if (fechaA !== fechaB) return fechaA - fechaB
                                        return a.id - b.id
                                    })

                                const practicaIdsCirugia = practicasPendientesCirugiaItem.map((practica) => practica.id)
                                const practicaIdsPendientesCirugiaItem = practicaIdsCirugia.filter(
                                    (id) => estadoPracticaCirugiaPorId.get(id)?.pendiente === true
                                )
                                const gruposAutorizadosCirugia = (gruposAutorizadosPorCirugia.get(c.id) ?? [])
                                    .map((grupo) => {
                                        const practicasFiltradas = grupo.practicas.filter((practica) => coincideFiltroSectorPractica(practica.id))
                                        if (practicasFiltradas.length === 0) return null

                                        return {
                                            ...grupo,
                                            practicas: practicasFiltradas,
                                            totalCantidad: practicasFiltradas.reduce(
                                                (total, practica) => total + (Number.isFinite(practica.cantidad) ? Number(practica.cantidad) : 0),
                                                0
                                            ),
                                        }
                                    })
                                    .filter((grupo): grupo is GrupoPracticasAutorizadasCirugia => grupo != null)

                                const totalPaginasOrdenesGeneradas = Math.max(
                                    1,
                                    Math.ceil(gruposAutorizadosCirugia.length / ORDENES_GENERADAS_POR_PAGINA)
                                )
                                const paginaOrdenesGeneradasActual = Math.min(
                                    paginaOrdenesGeneradasPorCirugia[c.id] ?? 1,
                                    totalPaginasOrdenesGeneradas
                                )
                                const gruposAutorizadosCirugiaPaginados = gruposAutorizadosCirugia.slice(
                                    (paginaOrdenesGeneradasActual - 1) * ORDENES_GENERADAS_POR_PAGINA,
                                    paginaOrdenesGeneradasActual * ORDENES_GENERADAS_POR_PAGINA
                                )
                                const gruposPendientesAutorizacion = gruposAutorizadosCirugia.filter(
                                    (grupo) => !grupoTieneNumeroAutorizacion(grupo)
                                ).length
                                const gruposYaAutorizados = gruposAutorizadosCirugia.filter(
                                    (grupo) => grupoTieneNumeroAutorizacion(grupo)
                                ).length
                                const mostrarPendientesAutorizacion = mostrarPendientesAutorizacionPorCirugia[c.id] ?? true
                                const mostrarYaAutorizadas = mostrarYaAutorizadasPorCirugia[c.id] ?? true
                                const gruposAutorizadosCirugiaVisibles = gruposAutorizadosCirugiaPaginados.filter((grupo) => {
                                    const yaAutorizada = grupoTieneNumeroAutorizacion(grupo)
                                    return yaAutorizada ? mostrarYaAutorizadas : mostrarPendientesAutorizacion
                                })
                                const totalPaginasPendientes = Math.max(
                                    1,
                                    Math.ceil(practicasPendientesCirugiaItem.length / PRACTICAS_PENDIENTES_POR_PAGINA)
                                )
                                const paginaPendientesActual = Math.min(
                                    paginaPendientesPorCirugia[c.id] ?? 1,
                                    totalPaginasPendientes
                                )
                                const practicasPendientesPaginadas = practicasPendientesCirugiaItem.slice(
                                    (paginaPendientesActual - 1) * PRACTICAS_PENDIENTES_POR_PAGINA,
                                    paginaPendientesActual * PRACTICAS_PENDIENTES_POR_PAGINA
                                )

                                return (
                                    <article key={c.id} className="border rounded-lg p-3 bg-white space-y-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b">
                                            <button
                                                type="button"
                                                onClick={() => setCirugiasAbiertas((prev) => ({
                                                    ...prev,
                                                    [c.id]: !(prev[c.id] ?? false),
                                                }))}
                                                className="inline-flex items-center gap-2 text-left"
                                            >
                                                <ChevronRight className={`h-4 w-4 text-gray-500 transition-transform ${cirugiaAbierta ? 'rotate-90' : ''}`} />
                                                <p className="text-sm font-medium text-gray-900">
                                                    {formatearFechaArgentina(c.fechaCirugia)} {c.horaCirugia ? ` ${c.horaCirugia}` : ''}
                                                </p>
                                            </button>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-500">Cirugia #{c.id}</span>
                                                {puedeCrear && (
                                                    <Link
                                                        href={`/dashboard/internacion/${ingresoId}/practicas?cirugiaId=${c.id}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs font-medium text-emerald-700 border border-emerald-200 rounded-md px-2 py-1 hover:bg-emerald-50"
                                                    >
                                                        Agregar practica
                                                    </Link>
                                                )}
                                                {puedeCrear && (
                                                    <button
                                                        type="button"
                                                        onClick={() => void anularFichaQuirurgica(c.id)}
                                                        disabled={anulandoCirugiaId === c.id}
                                                        className="inline-flex items-center gap-1 text-xs font-medium text-red-700 border border-red-200 rounded-md px-2 py-1 hover:bg-red-50 disabled:opacity-60"
                                                    >
                                                        {anulandoCirugiaId === c.id ? (
                                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                        ) : (
                                                            <Ban className="h-3.5 w-3.5" />
                                                        )}
                                                        {anulandoCirugiaId === c.id ? 'Anulando...' : 'Anular ficha'}
                                                    </button>
                                                )}
                                                <Link
                                                    href={`/dashboard/internacion/${ingresoId}/ficha-quirurgica#cirugia-${c.id}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs font-medium text-blue-700 border border-blue-200 rounded-md px-2 py-1 hover:bg-blue-50"
                                                >
                                                    Ver ficha quirurgica
                                                </Link>
                                            </div>
                                        </div>

                                        {cirugiaAbierta && (
                                            <>

                                        <div className="space-y-2">
                                            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">
                                                Órdenes generadas ({gruposAutorizadosCirugia.length})
                                            </p>
                                            <div className="space-y-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setMostrarPendientesAutorizacionPorCirugia((prev) => ({
                                                        ...prev,
                                                        [c.id]: !(prev[c.id] ?? true),
                                                    }))}
                                                    disabled={gruposPendientesAutorizacion === 0}
                                                    className="flex w-full items-center justify-between rounded border border-amber-200 bg-amber-50/50 px-2 py-1 text-left disabled:opacity-60"
                                                >
                                                    <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                                                        Pendientes de autorización ({gruposPendientesAutorizacion})
                                                    </span>
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800">
                                                        {mostrarPendientesAutorizacion ? 'Contraer' : 'Expandir'}
                                                        {mostrarPendientesAutorizacion ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                                    </span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setMostrarYaAutorizadasPorCirugia((prev) => ({
                                                        ...prev,
                                                        [c.id]: !(prev[c.id] ?? true),
                                                    }))}
                                                    disabled={gruposYaAutorizados === 0}
                                                    className="flex w-full items-center justify-between rounded border border-emerald-200 bg-emerald-50/50 px-2 py-1 text-left disabled:opacity-60"
                                                >
                                                    <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                                        Ya autorizadas ({gruposYaAutorizados})
                                                    </span>
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-800">
                                                        {mostrarYaAutorizadas ? 'Contraer' : 'Expandir'}
                                                        {mostrarYaAutorizadas ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                                    </span>
                                                </button>
                                            </div>
                                            {gruposAutorizadosCirugia.length === 0 ? (
                                                <p className="text-xs text-gray-400">No hay órdenes generadas.</p>
                                            ) : gruposAutorizadosCirugiaVisibles.length === 0 ? (
                                                <p className="text-xs text-gray-500">No hay órdenes visibles con los paneles cerrados.</p>
                                            ) : (
                                                gruposAutorizadosCirugiaVisibles.map((grupo) => {
                                                    const grupoKey = `${c.id}-${grupo.key}`
                                                    const abierta = ordenesAutorizadasAbiertas[grupoKey] ?? false
                                                    const expandida = ordenesAutorizadasExpandidas[grupoKey] ?? false
                                                    const limitePracticas = 3
                                                    const practicasVisibles = expandida
                                                        ? grupo.practicas
                                                        : grupo.practicas.slice(0, limitePracticas)
                                                    const restantes = Math.max(0, grupo.practicas.length - practicasVisibles.length)
                                                    const grupoYaAutorizado = grupoTieneNumeroAutorizacion(grupo)
                                                    const destinoAbrir =
                                                        grupo.tipo === 'orden' && grupo.puestoNumero && grupo.ordenNumero
                                                            ? `/dashboard/ambulatorio/${grupo.puestoNumero}/${grupo.ordenNumero}`
                                                            : grupo.numeroAutorizacion
                                                                ? `/dashboard/ambulatorio?tab=confirmadas&q=${encodeURIComponent(grupo.numeroAutorizacion)}`
                                                                : null
                                                    const grupoFacturado = grupo.practicas.some((practicaGrupo) => {
                                                        const estadoPractica = estadoPracticaCirugiaPorId.get(practicaGrupo.id)
                                                        const practicaInternacion = estadoPractica
                                                            ? (practicasInternacionPorId.get(estadoPractica.practicaInternacionId) ?? null)
                                                            : null
                                                        return practicaInternacionFacturada(practicaInternacion)
                                                    })
                                                    const puedeAnularGrupo =
                                                        grupo.tipo === 'orden' &&
                                                        Boolean(grupo.puestoNumero && grupo.ordenNumero) &&
                                                        !grupoFacturado
                                                    const grupoAnulandose = anulandoOrdenGrupoKey === grupoKey
                                                    const tituloGrupo =
                                                        grupo.tipo === 'orden' && grupo.puestoNumero && grupo.ordenNumero
                                                            ? `Orden ${formatearNumeroOrden(grupo.puestoNumero, grupo.ordenNumero)}`
                                                            : `Autorizacion ${grupo.numeroAutorizacion ?? '-'}`
                                                    const codigosConCantidad = Array.from(
                                                        grupo.practicas.reduce((mapa, practica) => {
                                                            const codigo = practica.codigo.trim()
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
                                                    const fechaResumenOrden = grupo.fechaReferencia
                                                        ? formatearFechaArgentina(grupo.fechaReferencia, {
                                                            day: '2-digit',
                                                            month: '2-digit',
                                                            year: 'numeric',
                                                        })
                                                        : '-'

                                                    return (
                                                        <div
                                                            key={grupoKey}
                                                            className={`rounded-lg p-2 text-xs ${
                                                                grupoYaAutorizado
                                                                    ? 'border border-emerald-200 bg-emerald-50/40'
                                                                    : 'border border-amber-300 bg-amber-100/60'
                                                            }`}
                                                        >
                                                            <button
                                                                type="button"
                                                                onClick={() => setOrdenesAutorizadasAbiertas((prev) => ({
                                                                    ...prev,
                                                                    [grupoKey]: !(prev[grupoKey] ?? false),
                                                                }))}
                                                                className={`flex w-full items-center justify-between gap-2 rounded-md px-1 py-0 text-left ${
                                                                    grupoYaAutorizado ? 'hover:bg-emerald-100/40' : 'hover:bg-amber-200/50'
                                                                }`}
                                                            >
                                                                <span className={`flex min-w-0 items-center gap-2 ${grupoYaAutorizado ? 'text-emerald-900' : 'text-amber-900'}`}>
                                                                    <ChevronRight className={`h-4 w-4 transition-transform ${abierta ? 'rotate-90' : ''}`} />
                                                                    <span className="shrink-0 font-semibold">{tituloGrupo}</span>
                                                                    <span className={`min-w-0 truncate text-[10px] ${grupoYaAutorizado ? 'text-emerald-700' : 'text-amber-800'}`}>
                                                                        Cod/Cant: {codigosResumen}{codigosRestantes > 0 ? ` +${codigosRestantes}` : ''} · Fecha: {fechaResumenOrden}
                                                                    </span>
                                                                </span>
                                                                <span className={`text-[11px] ${grupoYaAutorizado ? 'text-emerald-700' : 'text-amber-800'}`}>
                                                                    {grupo.practicas.length} practica(s)
                                                                </span>
                                                            </button>

                                                            {abierta && (
                                                                <div className="mt-1.5 grid gap-2 md:grid-cols-2">
                                                                    <div className="space-y-1.5 text-emerald-900">
                                                                        <div className="flex items-center gap-2 flex-wrap">
                                                                            {destinoAbrir && (
                                                                                <Link
                                                                                    href={destinoAbrir}
                                                                                    target="_blank"
                                                                                    rel="noopener noreferrer"
                                                                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                                                                        grupoYaAutorizado
                                                                                            ? 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'
                                                                                            : 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                                                                                    }`}
                                                                                >
                                                                                    Abrir orden
                                                                                </Link>
                                                                            )}
                                                                            {puedeCrear && grupo.tipo === 'orden' && grupo.puestoNumero && grupo.ordenNumero && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => void anularOrdenGeneradaCirugia(grupoKey, grupo.puestoNumero as number, grupo.ordenNumero as number)}
                                                                                    disabled={grupoAnulandose || !puedeAnularGrupo}
                                                                                    title={!puedeAnularGrupo
                                                                                        ? 'La orden ya está facturada'
                                                                                        : 'Anular orden'}
                                                                                    className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                                                                                >
                                                                                    {grupoAnulandose
                                                                                        ? <Loader2 className="h-3 w-3 animate-spin" />
                                                                                        : <Ban className="h-3 w-3" />}
                                                                                    {grupoAnulandose ? 'Anulando...' : 'Anular orden'}
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                        <p className={grupoYaAutorizado ? 'text-emerald-800' : 'text-amber-900'}>
                                                                            N° autorizacion: {grupo.numeroAutorizacion ?? '-'}
                                                                        </p>
                                                                        <p className={grupoYaAutorizado ? 'text-emerald-800' : 'text-amber-900 font-semibold'}>
                                                                            Estado: {grupoYaAutorizado ? 'Ya autorizada' : 'Pendiente de autorización'}
                                                                        </p>
                                                                        <p className={grupoYaAutorizado ? 'text-emerald-800' : 'text-amber-900'}>Cantidad total: {grupo.totalCantidad}</p>
                                                                    </div>

                                                                    <div className={`rounded-md bg-white/70 p-1.5 ${
                                                                        grupoYaAutorizado ? 'border border-emerald-200' : 'border border-amber-300'
                                                                    }`}>
                                                                        <div className="flex items-center justify-between gap-2">
                                                                            <p className={`text-[11px] font-semibold uppercase tracking-wide ${
                                                                                grupoYaAutorizado ? 'text-emerald-700' : 'text-amber-800'
                                                                            }`}>
                                                                                Practicas de la orden ({grupo.practicas.length})
                                                                            </p>
                                                                            {grupo.practicas.length > limitePracticas && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setOrdenesAutorizadasExpandidas((prev) => ({
                                                                                        ...prev,
                                                                                        [grupoKey]: !(prev[grupoKey] ?? false),
                                                                                    }))}
                                                                                    className="rounded border border-emerald-300 px-2 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-50"
                                                                                >
                                                                                    {expandida ? 'Contraer' : 'Expandir'}
                                                                                </button>
                                                                            )}
                                                                        </div>

                                                                        <div className="mt-1.5 space-y-1">
                                                                            {practicasVisibles.map((practica) => {
                                                                                const estadoPractica = estadoPracticaCirugiaPorId.get(practica.id)
                                                                                const practicaInternacion = estadoPractica
                                                                                    ? (practicasInternacionPorId.get(estadoPractica.practicaInternacionId) ?? null)
                                                                                    : null
                                                                                const estaFacturada = practicaInternacionFacturada(practicaInternacion)
                                                                                const siglasIncluye = siglasIncluidasPracticaCirugia(practica, practicaInternacion)

                                                                                return (
                                                                                    <div
                                                                                        key={`${grupoKey}-${practica.id}`}
                                                                                        className={`rounded bg-white px-2 py-1 ${
                                                                                            grupoYaAutorizado ? 'border border-emerald-100' : 'border border-amber-200'
                                                                                        }`}
                                                                                    >
                                                                                        <div className={`flex items-center justify-between gap-2 ${
                                                                                            grupoYaAutorizado ? 'text-emerald-900' : 'text-amber-900'
                                                                                        }`}>
                                                                                            <span className="font-mono text-[11px]">{practica.codigo}</span>
                                                                                            <span className="font-medium">Cant. {practica.cantidad}</span>
                                                                                        </div>
                                                                                        <p className={grupoYaAutorizado ? 'text-emerald-900' : 'text-amber-900'}>{practica.descripcion}</p>
                                                                                        <p className={grupoYaAutorizado ? 'text-[11px] text-emerald-700' : 'text-[11px] text-amber-800'}>
                                                                                            INCLUYE {siglasIncluye}
                                                                                        </p>
                                                                                        {puedeCrear && (
                                                                                            <div className="mt-1 flex items-center justify-end gap-2">
                                                                                                {estaFacturada && (
                                                                                                    <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                                                                                                        Facturada
                                                                                                    </span>
                                                                                                )}
                                                                                                <button
                                                                                                    type="button"
                                                                                                    onClick={() => abrirEdicionPracticaCirugia(c.id, practica.id)}
                                                                                                    disabled={!practicaInternacion || guardandoPracticaEditando}
                                                                                                    title={
                                                                                                        !practicaInternacion
                                                                                                            ? 'No se encontró la práctica asociada'
                                                                                                            : 'Editar practica'
                                                                                                    }
                                                                                                    className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                                                                                                >
                                                                                                    <Pencil className="h-3.5 w-3.5" />
                                                                                                    Editar
                                                                                                </button>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                )
                                                                            })}
                                                                        </div>

                                                                        {!expandida && restantes > 0 && (
                                                                            <p className="mt-1 text-[11px] text-emerald-700">+{restantes} practica(s) mas</p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )
                                                })
                                            )}
                                            {gruposAutorizadosCirugia.length > ORDENES_GENERADAS_POR_PAGINA && (
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="text-xs text-gray-500">
                                                        Página {paginaOrdenesGeneradasActual} de {totalPaginasOrdenesGeneradas}
                                                    </p>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => setPaginaOrdenesGeneradasPorCirugia((prev) => ({
                                                                ...prev,
                                                                [c.id]: Math.max(1, (prev[c.id] ?? 1) - 1),
                                                            }))}
                                                            disabled={paginaOrdenesGeneradasActual <= 1}
                                                            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                                        >
                                                            Anterior
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setPaginaOrdenesGeneradasPorCirugia((prev) => ({
                                                                ...prev,
                                                                [c.id]: Math.min(totalPaginasOrdenesGeneradas, (prev[c.id] ?? 1) + 1),
                                                            }))}
                                                            disabled={paginaOrdenesGeneradasActual >= totalPaginasOrdenesGeneradas}
                                                            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                                        >
                                                            Siguiente
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                            </>
                                        )}
                                    </article>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {practicaEditando && draftPracticaEditando && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
                    <div className="w-full max-w-xl rounded-xl border border-blue-200 bg-white p-4 shadow-xl space-y-3">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900">Editar práctica de cirugía</h3>
                                <p className="text-xs text-gray-600">
                                    Se puede editar mientras no esté incluida en un lote confirmado.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={cerrarEdicionPracticaCirugia}
                                disabled={guardandoPracticaEditando}
                                className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                                Cerrar
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <label className="text-xs text-gray-600">
                                Código
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
                                Fecha y hora
                                <input
                                    type="datetime-local"
                                    value={draftPracticaEditando.fecha}
                                    onChange={(e) => setDraftPracticaEditando((prev) => prev ? {
                                        ...prev,
                                        fecha: e.target.value,
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
                                N° autorización
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

                            <label className="text-xs text-gray-600">
                                Matrícula especialista
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
                                Matrícula anestesista
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
                        </div>

                        <label className="inline-flex items-center gap-2 text-xs text-gray-700">
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

                        <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                                type="button"
                                onClick={cerrarEdicionPracticaCirugia}
                                disabled={guardandoPracticaEditando}
                                className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => void guardarEdicionPracticaCirugia()}
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
        </div>
    )
}
