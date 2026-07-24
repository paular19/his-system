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
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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

type GuardadaSesionItem = {
    id: string
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

type ComponenteOrden = 'HE' | 'HA' | 'GA' | 'HP' | 'A1' | 'A2' | 'A3'
type ModoAgrupacionPersonalizada = 'VARIAS_LINEAS' | 'MISMA_LINEA'

interface PracticaCargaRapidaPageProps {
    ingresoId: number
    convenioId: number | null
    sectorInternacionActual?: string | null
    matriculaTratanteDefault?: number | null
    puedeCrear: boolean
    practicasIniciales: PracticaItem[]
}

const MATRICULA_PATOLOGIA_DEFAULT = 2675
const ORDEN_CLASIFICACION_LISTA: Record<string, number> = {
    HE: 1,
    HA: 2,
    GA: 3,
    HP: 4,
    A1: 5,
    A2: 6,
    A3: 7,
}

const COMPONENTES_IMPRESION: Array<{ codigo: ComponenteOrden; label: string }> = [
    { codigo: 'HE', label: 'Honorarios especialista (HE)' },
    { codigo: 'HA', label: 'Honorarios anestesista (HA)' },
    { codigo: 'GA', label: 'Derechos/Gastos (GA)' },
    { codigo: 'HP', label: 'Honorarios patologia (HP)' },
    { codigo: 'A1', label: 'Ayudante 1 (A1)' },
    { codigo: 'A2', label: 'Ayudante 2 (A2)' },
    { codigo: 'A3', label: 'Ayudante 3 (A3)' },
]

const COMPONENTES_ORDEN: readonly ComponenteOrden[] = ['HE', 'HA', 'GA', 'HP', 'A1', 'A2', 'A3']

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

function esComponenteOrden(value: string): value is ComponenteOrden {
    return COMPONENTES_ORDEN.includes(value as ComponenteOrden)
}

function componentesDesdeClasificacion(clasificacion: string | null | undefined): ComponenteOrden[] {
    const normalizada = normalizarClasificacionAgrupacion(clasificacion)
    if (!normalizada) return []
    return normalizada
        .split('+')
        .filter(esComponenteOrden)
}

export function PracticaCargaRapidaPage({
    ingresoId,
    convenioId,
    sectorInternacionActual,
    matriculaTratanteDefault,
    puedeCrear,
    practicasIniciales,
}: PracticaCargaRapidaPageProps) {
    const router = useRouter()
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
    const [modoAgrupacionPersonalizada, setModoAgrupacionPersonalizada] = useState<ModoAgrupacionPersonalizada>('VARIAS_LINEAS')
    const [tituloOrdenPersonalizada, setTituloOrdenPersonalizada] = useState('')
    const [tituloEditadoManualmente, setTituloEditadoManualmente] = useState(false)
    const [generandoOrdenes, setGenerandoOrdenes] = useState(false)
    const [mostrarPopupImpresion, setMostrarPopupImpresion] = useState(false)
    const [componentesImpresion, setComponentesImpresion] = useState<Record<ComponenteOrden, boolean>>({
        HE: true,
        HA: true,
        GA: true,
        HP: true,
        A1: true,
        A2: true,
        A3: true,
    })
    const [mostrarOrdenesPendientesAutorizacion, setMostrarOrdenesPendientesAutorizacion] = useState(true)
    const [mostrarOrdenesYaAutorizadas, setMostrarOrdenesYaAutorizadas] = useState(true)
    const [ordenesAutorizadasAbiertas, setOrdenesAutorizadasAbiertas] = useState<Record<string, boolean>>({})
    const [ordenesAutorizadasExpandidas, setOrdenesAutorizadasExpandidas] = useState<Record<string, boolean>>({})
    const [ordenesGeneradasSesionKeys, setOrdenesGeneradasSesionKeys] = useState<string[]>([])
    const [mostrarOrdenesSesion, setMostrarOrdenesSesion] = useState(true)
    const [mostrarOrdenesHistoricas, setMostrarOrdenesHistoricas] = useState(true)

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

    const practicasAutorizadas = useMemo(
        () => practicasVigentes.filter((practica) => (practica.ordenPractica?.length ?? 0) > 0),
        [practicasVigentes]
    )

    useEffect(() => {
        const pendientes = new Set(practicasPendientes.map((practica) => practica.id))
        setPracticasSeleccionadas((prev) => prev.filter((id) => pendientes.has(id)))
    }, [practicasPendientes])

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

    const componentesSeleccionados = useMemo(() => {
        const encontrados = new Set<ComponenteOrden>()
        for (const practicaId of idsPendientesSeleccionadas) {
            const practica = practicas.find((item) => item.id === practicaId)
            if (!practica) continue
            const clasificacion = obtenerClasificacionPractica(practica)
            for (const componente of componentesDesdeClasificacion(clasificacion)) {
                encontrados.add(componente)
            }
        }

        return COMPONENTES_ORDEN.filter((componente) => encontrados.has(componente))
    }, [idsPendientesSeleccionadas, practicas, clasificacionPorPracticaId])

    const mezclaComponentesSeleccionados = componentesSeleccionados.length > 1

    const tituloSugeridoOrdenPersonalizada = useMemo(() => {
        if (componentesSeleccionados.length === 0) return 'ORDEN PERSONALIZADA'
        return tituloDesdeClasificacion(componentesSeleccionados.join('+'))
    }, [componentesSeleccionados])

    useEffect(() => {
        if (!tituloEditadoManualmente) {
            setTituloOrdenPersonalizada(tituloSugeridoOrdenPersonalizada)
        }
    }, [tituloSugeridoOrdenPersonalizada, tituloEditadoManualmente])

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

    const ordenesAutorizadasSesion = useMemo(() => {
        const keysSesion = new Set(ordenesGeneradasSesionKeys)
        return ordenesAutorizadas.filter((grupo) => {
            if (grupo.tipo !== 'orden') return false
            if (grupo.puestoNumero == null || grupo.ordenNumero == null) return false
            return keysSesion.has(`${grupo.puestoNumero}-${grupo.ordenNumero}`)
        })
    }, [ordenesAutorizadas, ordenesGeneradasSesionKeys])

    const ordenesAutorizadasHistoricas = useMemo(() => {
        const keysSesion = new Set(ordenesGeneradasSesionKeys)
        return ordenesAutorizadas.filter((grupo) => {
            if (grupo.tipo !== 'orden') return true
            if (grupo.puestoNumero == null || grupo.ordenNumero == null) return true
            return !keysSesion.has(`${grupo.puestoNumero}-${grupo.ordenNumero}`)
        })
    }, [ordenesAutorizadas, ordenesGeneradasSesionKeys])

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
        const idsRelevantes = idsPendientesSeleccionadas.length > 0
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
    }, [idsPendientesSeleccionadas, practicasPendientes, practicas, matriculaTratanteDefault])

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

    const handleGuardarPracticas = async (entradasCrear: PracticaCargaEntrada[]) => {
        setMensajeError(null)

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
            return { ok: true }
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

    const alternarSeleccionTodasPendientes = (checked: boolean) => {
        const ids = practicasPendientes.map((practica) => practica.id)
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

    const abrirPopupImpresion = () => {
        if (idsPendientesSeleccionadas.length === 0) {
            setMensajeError('Selecciona al menos una practica pendiente para generar ordenes')
            return
        }

        const disponibles = new Set<ComponenteOrden>()
        for (const practicaId of idsPendientesSeleccionadas) {
            const practica = practicas.find((item) => item.id === practicaId)
            if (!practica) continue
            const clasificacion = obtenerClasificacionPractica(practica)
            for (const componente of componentesDesdeClasificacion(clasificacion)) {
                disponibles.add(componente)
            }
        }

        setComponentesImpresion((prev) => {
            const next = { ...prev }
            for (const componente of COMPONENTES_ORDEN) {
                next[componente] = disponibles.size === 0 ? true : disponibles.has(componente)
            }
            return next
        })
        setMostrarPopupImpresion(true)
    }

    const ejecutarGeneracionOrdenes = async (imprimirDespues: boolean, componentesFiltro?: Set<ComponenteOrden>) => {
        if (idsPendientesSeleccionadas.length === 0) {
            setMensajeError('Selecciona al menos una practica pendiente para generar ordenes')
            return
        }

        const agruparEnUnaOrden = modoAgrupacionPersonalizada === 'MISMA_LINEA'
        const titularOrdenAgrupada = tituloOrdenPersonalizada.trim()

        if (agruparEnUnaOrden && titularOrdenAgrupada.length === 0) {
            setMensajeError('Define el titulo de la orden personalizada para continuar')
            return
        }

        const profesionalIdFirmante = Number.parseInt(medicoFirmanteId, 10)
        const medicoFirmanteMatricula = Number.isFinite(profesionalIdFirmante)
            ? (matriculaPorProfesionalId.get(profesionalIdFirmante) ?? null)
            : matriculaFirmanteSugerida

        const clasificacionPayload = Object.fromEntries(
            idsPendientesSeleccionadas.map((id) => {
                const practica = practicas.find((item) => item.id === id)
                const clasificacion = practica ? obtenerClasificacionPractica(practica) : 'HE'
                return [String(id), clasificacion]
            })
        )

        setMensajeError(null)
        setGenerandoOrdenes(true)

        try {
            const result = await generarOrdenesDesdeInternacionAction({
                ingresoId,
                practicaIds: idsPendientesSeleccionadas,
                clasificacionPorPracticaId: clasificacionPayload,
                agruparEnUnaOrden,
                titularOrdenAgrupada: agruparEnUnaOrden ? titularOrdenAgrupada : undefined,
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

            const asignacionPorPracticaId = new Map(asignaciones.map((item) => [item.practicaId, item] as const))

            setPracticas((prev) => prev.map((practica) => {
                const asignada = asignacionPorPracticaId.get(practica.id)
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

            setPracticasSeleccionadas((prev) => prev.filter((id) => !idsPendientesSeleccionadas.includes(id)))

            const grupos = Array.isArray((result as { ordenesPorGrupo?: unknown }).ordenesPorGrupo)
                ? ((result as {
                    ordenesPorGrupo: Array<{ clasificacion: string; puestoNumero: number; numero: number; practicaIds: number[] }>
                }).ordenesPorGrupo)
                : []

            if (grupos.length > 0) {
                const nuevasKeys = grupos.map((grupo) => `${grupo.puestoNumero}-${grupo.numero}`)
                setOrdenesGeneradasSesionKeys((prev) => Array.from(new Set([...nuevasKeys, ...prev])))
            }

            if (imprimirDespues && grupos.length > 0) {
                const gruposFiltrados = componentesFiltro && componentesFiltro.size > 0
                    ? grupos.filter((grupo) => {
                        const clasificacion = normalizarClasificacionAgrupacion(grupo.clasificacion) ?? grupo.clasificacion
                        if (Array.from(componentesFiltro).some((componente) => clasificacion.split('+').includes(componente))) {
                            return true
                        }

                        return grupo.practicaIds.some((practicaId) => {
                            const clasificacionPractica = clasificacionPayload[String(practicaId)]
                            if (!clasificacionPractica) return false
                            return Array.from(componentesFiltro).some((componente) =>
                                componentesDesdeClasificacion(clasificacionPractica).includes(componente)
                            )
                        })
                    })
                    : grupos

                if (gruposFiltrados.length === 0) {
                    setMensajeError('No hay ordenes generadas para los componentes seleccionados en la impresion')
                } else {
                    const ordenesUnicas = Array.from(
                        new Set(gruposFiltrados.map((grupo) => `${grupo.puestoNumero}-${grupo.numero}`))
                    )
                    const url = `/dashboard/ambulatorio/imprimir?ordenes=${encodeURIComponent(ordenesUnicas.join(','))}`
                    if (typeof window !== 'undefined') {
                        window.open(url, '_blank')
                    }
                }
            }

            router.refresh()
        } catch {
            setMensajeError('Error al generar ordenes desde internacion')
        } finally {
            setGenerandoOrdenes(false)
        }
    }

    const confirmarImpresionPorComponentes = () => {
        const componentesSeleccionados = new Set<ComponenteOrden>(
            COMPONENTES_IMPRESION
                .filter((item) => componentesImpresion[item.codigo])
                .map((item) => item.codigo)
        )

        if (componentesSeleccionados.size === 0) {
            setMensajeError('Marca al menos un componente para imprimir')
            return
        }

        setMostrarPopupImpresion(false)
        void ejecutarGeneracionOrdenes(true, componentesSeleccionados)
    }

    const todasPendientesSeleccionadas =
        practicasPendientes.length > 0 && practicasPendientes.every((practica) => practicasSeleccionadas.includes(practica.id))

    const gruposFiltradosSesion = ordenesAutorizadasSesion.filter((grupo) => {
        const yaAutorizada = grupoTieneNumeroAutorizacion(grupo)
        return yaAutorizada ? mostrarOrdenesYaAutorizadas : mostrarOrdenesPendientesAutorizacion
    })

    const gruposFiltradosHistoricos = ordenesAutorizadasHistoricas.filter((grupo) => {
        const yaAutorizada = grupoTieneNumeroAutorizacion(grupo)
        return yaAutorizada ? mostrarOrdenesYaAutorizadas : mostrarOrdenesPendientesAutorizacion
    })

    const renderGrupoOrden = (grupo: GrupoPracticasAutorizadas) => {
        const abierta = ordenesAutorizadasAbiertas[grupo.key] ?? false
        const expandida = ordenesAutorizadasExpandidas[grupo.key] ?? false
        const limitePracticas = 3
        const practicasVisibles = expandida ? grupo.practicas : grupo.practicas.slice(0, limitePracticas)
        const restantes = Math.max(0, grupo.practicas.length - practicasVisibles.length)
        const destinoAbrir = obtenerDestinoGrupoPracticasAutorizadas(grupo)
        const sinAutorizacion = !grupoTieneNumeroAutorizacion(grupo)

        return (
            <div
                key={grupo.key}
                className={`rounded-lg p-2.5 text-xs ${
                    sinAutorizacion
                        ? 'border border-amber-300 bg-amber-100/60'
                        : 'border border-emerald-200 bg-emerald-50/40'
                }`}
            >
                <button
                    type="button"
                    onClick={() => setOrdenesAutorizadasAbiertas((prev) => ({
                        ...prev,
                        [grupo.key]: !(prev[grupo.key] ?? false),
                    }))}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-1 py-0.5 text-left ${
                        sinAutorizacion ? 'hover:bg-amber-200/50' : 'hover:bg-emerald-100/40'
                    }`}
                >
                    <span className={`flex items-center gap-2 ${sinAutorizacion ? 'text-amber-900' : 'text-emerald-900'}`}>
                        <ChevronRight className={`h-4 w-4 transition-transform ${abierta ? 'rotate-90' : ''}`} />
                        <span className="font-semibold">
                            {grupo.tipo === 'orden' && grupo.puestoNumero && grupo.ordenNumero
                                ? `Orden ${formatearNumeroOrden(grupo.puestoNumero, grupo.ordenNumero)}`
                                : `Autorizacion ${grupo.numeroAutorizacion ?? '-'}`}
                        </span>
                    </span>
                    <span className={`text-[11px] ${sinAutorizacion ? 'text-amber-800' : 'text-emerald-700'}`}>
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
                                    className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-900 hover:bg-emerald-200"
                                >
                                    Abrir orden
                                </Link>
                            )}
                            <span className={grupoTieneNumeroAutorizacion(grupo) ? 'text-emerald-800' : 'text-amber-900 font-semibold'}>
                                Estado: {grupoTieneNumeroAutorizacion(grupo) ? 'Autorizada' : 'Pendiente de autorizacion'}
                            </span>
                        </div>

                        <div className="rounded-md border border-emerald-200 bg-white/70 p-2">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                    Practicas de la orden ({grupo.practicas.length})
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

                            <div className="mt-2 space-y-1.5">
                                {practicasVisibles.map((practica) => (
                                    <div key={`${grupo.key}-${practica.id}`} className="rounded border border-emerald-100 bg-white px-2 py-1.5">
                                        <div className="flex items-center justify-between gap-2 text-emerald-900">
                                            <span className="font-mono text-[11px]">{practica.codigoPractica.trim()}</span>
                                            <span className="font-medium">Cant. {practica.cantidad}</span>
                                        </div>
                                        <p className="text-emerald-900">{descripcionParaMostrar(practica)}</p>
                                        <p className="text-[11px] text-emerald-700">
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
                                <p className="mt-1 text-[11px] text-emerald-700">+{restantes} practica(s) mas</p>
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
                <div className="space-y-4">
                    {puedeCrear ? (
                        <PracticaCargaForm
                            convenioId={convenioId}
                            sectorInternacionActual={sectorInternacionActual}
                            matriculaTratanteDefault={matriculaTratanteDefault}
                            onGuardar={handleGuardarPracticas}
                            titulo="Carga rapida de practicas"
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

                    {mensajeError && (
                        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                            {mensajeError}
                        </p>
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
                            Pendientes para generar: {practicasPendientes.length} · Seleccionadas: {idsPendientesSeleccionadas.length}
                        </div>

                        {mostrarEditorGrupos && (
                            <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50/70 p-3">
                                <label className="inline-flex items-center gap-2 text-xs text-amber-900">
                                    <input
                                        type="checkbox"
                                        checked={todasPendientesSeleccionadas}
                                        onChange={(e) => alternarSeleccionTodasPendientes(e.target.checked)}
                                        className="h-4 w-4 rounded border-amber-300 text-amber-700 focus:ring-amber-500"
                                    />
                                    Seleccionar todas las practicas pendientes
                                </label>

                                {practicasPendientesAgrupadas.length === 0 ? (
                                    <p className="text-xs text-gray-500">No hay practicas pendientes para editar grupos.</p>
                                ) : (
                                    <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
                                        {practicasPendientesAgrupadas.map((grupo) => (
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

                                {idsPendientesSeleccionadas.length > 0 ? (
                                    <>
                                        <div className="space-y-2 rounded-md border border-amber-200 bg-white p-2">
                                            <p className="text-[11px] font-medium text-amber-900">
                                                Flujo de agrupacion (como en ficha de internacion)
                                            </p>
                                            <label className="inline-flex items-center gap-2 text-xs text-amber-900">
                                                <input
                                                    type="radio"
                                                    name="modo-agrupacion-personalizada"
                                                    checked={modoAgrupacionPersonalizada === 'VARIAS_LINEAS'}
                                                    onChange={() => setModoAgrupacionPersonalizada('VARIAS_LINEAS')}
                                                    className="h-3.5 w-3.5 border-amber-300 text-amber-700 focus:ring-amber-500"
                                                />
                                                Varias lineas (separar por componente)
                                            </label>
                                            <label className="inline-flex items-center gap-2 text-xs text-amber-900">
                                                <input
                                                    type="radio"
                                                    name="modo-agrupacion-personalizada"
                                                    checked={modoAgrupacionPersonalizada === 'MISMA_LINEA'}
                                                    onChange={() => setModoAgrupacionPersonalizada('MISMA_LINEA')}
                                                    className="h-3.5 w-3.5 border-amber-300 text-amber-700 focus:ring-amber-500"
                                                />
                                                Una misma linea (una orden personalizada)
                                            </label>

                                            <p className="text-[10px] text-amber-800">
                                                Componentes seleccionados: {componentesSeleccionados.length > 0 ? componentesSeleccionados.join(' + ') : 'Sin componentes detectados'}
                                            </p>

                                            {mezclaComponentesSeleccionados && (
                                                <p className="text-[10px] text-amber-800">
                                                    Mezcla detectada (derechos, especialista, anestesista, etc.). Elegi si queres un solo titulo o varios por componente.
                                                </p>
                                            )}

                                            {modoAgrupacionPersonalizada === 'MISMA_LINEA' && (
                                                <label className="block text-[11px] text-amber-900">
                                                    Titulo de la orden personalizada
                                                    <input
                                                        type="text"
                                                        value={tituloOrdenPersonalizada}
                                                        onChange={(e) => {
                                                            setTituloOrdenPersonalizada(e.target.value)
                                                            setTituloEditadoManualmente(true)
                                                        }}
                                                        placeholder="Ej: DERECHOS + HONORARIO ESPECIALISTA"
                                                        className="mt-1 w-full rounded border border-amber-300 bg-white px-2 py-1 text-xs text-amber-900"
                                                    />
                                                </label>
                                            )}
                                        </div>

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
                                                onClick={() => void ejecutarGeneracionOrdenes(false)}
                                                disabled={generandoOrdenes}
                                                className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                            >
                                                {generandoOrdenes && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                                                Generar orden
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void ejecutarGeneracionOrdenes(true)}
                                                disabled={generandoOrdenes}
                                                className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                                            >
                                                <Printer className="h-3.5 w-3.5" />
                                                Generar orden e imprimir
                                            </button>
                                            <button
                                                type="button"
                                                onClick={abrirPopupImpresion}
                                                disabled={generandoOrdenes}
                                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                                            >
                                                <Printer className="h-3.5 w-3.5" />
                                                Imprimir por componentes
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <p className="rounded-md border border-amber-200 bg-white px-2 py-1.5 text-[11px] text-amber-900">
                                        Selecciona una o mas practicas para habilitar el flujo de agrupacion, titulo y medico firmante.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

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
                                    onClick={() => setMostrarOrdenesSesion((prev) => !prev)}
                                    className="flex w-full items-center justify-between rounded border border-blue-200 bg-blue-50/50 px-2 py-1 text-left"
                                >
                                    <span className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">
                                        Generadas en esta sesion ({ordenesAutorizadasSesion.length})
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-800">
                                        {mostrarOrdenesSesion ? 'Contraer' : 'Expandir'}
                                        {mostrarOrdenesSesion ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                    </span>
                                </button>

                                {mostrarOrdenesSesion && gruposFiltradosSesion.length === 0 ? (
                                    <p className="rounded border border-blue-100 bg-blue-50/40 px-2 py-1 text-[11px] text-blue-700">
                                        En esta sesion no hay ordenes que coincidan con los filtros actuales.
                                    </p>
                                ) : (
                                    mostrarOrdenesSesion && gruposFiltradosSesion.map(renderGrupoOrden)
                                )}

                                <button
                                    type="button"
                                    onClick={() => setMostrarOrdenesHistoricas((prev) => !prev)}
                                    className="flex w-full items-center justify-between rounded border border-gray-300 bg-gray-50 px-2 py-1 text-left"
                                >
                                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                                        Historico de ordenes ({ordenesAutorizadasHistoricas.length})
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-800">
                                        {mostrarOrdenesHistoricas ? 'Contraer' : 'Expandir'}
                                        {mostrarOrdenesHistoricas ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                    </span>
                                </button>

                                {mostrarOrdenesHistoricas && gruposFiltradosHistoricos.length === 0 ? (
                                    <p className="rounded border border-gray-200 bg-gray-50/60 px-2 py-1 text-[11px] text-gray-600">
                                        No hay ordenes historicas que coincidan con los filtros actuales.
                                    </p>
                                ) : (
                                    mostrarOrdenesHistoricas && gruposFiltradosHistoricos.map(renderGrupoOrden)
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="his-card p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            <ClipboardList className="h-4 w-4 text-blue-600" />
                            <h3 className="text-sm font-semibold text-gray-900">Codigos agregados en esta sesion</h3>
                        </div>
                        <p className="text-xs text-gray-600">
                            Este panel confirma al instante cada codigo guardado para validar la carga sin perder ritmo.
                        </p>

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

            {mostrarPopupImpresion && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
                    <div className="w-full max-w-md space-y-3 rounded-xl border border-blue-200 bg-white p-4 shadow-xl">
                        <h3 className="text-sm font-semibold text-gray-900">Seleccionar componentes para imprimir</h3>
                        <p className="text-xs text-gray-600">
                            Marca que grupos queres imprimir despues de generar las ordenes.
                        </p>

                        <div className="space-y-2">
                            {COMPONENTES_IMPRESION.map((componente) => (
                                <label key={`imp-${componente.codigo}`} className="inline-flex w-full items-center gap-2 text-xs text-gray-700">
                                    <input
                                        type="checkbox"
                                        checked={componentesImpresion[componente.codigo]}
                                        onChange={(e) => setComponentesImpresion((prev) => ({
                                            ...prev,
                                            [componente.codigo]: e.target.checked,
                                        }))}
                                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    {componente.label}
                                </label>
                            ))}
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => setMostrarPopupImpresion(false)}
                                className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={confirmarImpresionPorComponentes}
                                disabled={generandoOrdenes}
                                className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                                {generandoOrdenes && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                Generar e imprimir
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
