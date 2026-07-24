'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Stethoscope, Search, Plus, Loader2, X, ChevronDown, ChevronUp, ChevronRight, Trash2, Pencil } from 'lucide-react'
import type { PracticaItem } from '@/modules/internacion/types'
import { formatearNumeroOrden } from '@/modules/orden/types'
import { anularOrdenAction, generarOrdenesDesdeInternacionAction } from '@/modules/orden/actions'
import { fechaAInputLocal } from '@/lib/utils/argentina-date'
import { normalizarClasificacionAgrupacion, tituloDesdeClasificacion } from '@/modules/orden/clasificacion'
import {
    agruparPracticasAutorizadasPorOrden,
    obtenerDestinoGrupoPracticasAutorizadas,
    type GrupoPracticasAutorizadas,
} from '@/lib/practicas-autorizadas'
import { ProfesionalSelect } from '@/components/ui/profesional-select'

interface ProfesionalConMatricula {
    id: number
    nombre: string
    matricula: number
}

const formatoMoneda = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
})

const MATRICULA_PATOLOGIA_DEFAULT = 2675
const PRACTICAS_LISTA_POR_PAGINA = 8
const TIMEOUT_ELIMINAR_PRACTICA_MS = 45000
type SectorPracticaFiltro = 'UTI' | 'PISO'
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

function normalizarBusquedaLista(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
}

function esSectorUti(sector: string | null | undefined): boolean {
    const normalized = (sector ?? '').trim().toUpperCase()
    return normalized === 'CU' || normalized === 'UTI' || normalized === 'TERAPIA_INTENSIVA'
}

function practicaActiva(estado: string | null | undefined): boolean {
    return (estado?.trim().toUpperCase() ?? 'A') !== 'X'
}

function esPedidoLaboratorio(practica: Pick<PracticaItem, 'codigoPractica' | 'numeroProtocoloLaboratorio' | 'diagnosticoLaboratorio'>): boolean {
    return practica.codigoPractica.trim() === '66' && (
        (practica.numeroProtocoloLaboratorio?.trim().length ?? 0) > 0 ||
        (practica.diagnosticoLaboratorio?.trim().length ?? 0) > 0
    )
}

function clasificacionInferidaPractica(practica: Pick<PracticaItem, 'codigoPractica' | 'descripcionPractica' | 'matriculaEspecialista' | 'matriculaAnestesista'>): string {
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

interface PracticaSectionProps {
    ingresoId: number
    convenioId: number | null
    sectorInternacionActual?: string | null
    sectorPorPracticaId?: Record<number, SectorPracticaFiltro>
    practicas: PracticaItem[]
    puedeCrear: boolean
    matriculaTratanteDefault?: number | null
    puedeGenerarAutorizacion?: boolean
    refrescarDespuesCambios?: boolean
    permitirGenerarSinPendientes?: boolean
    incluirPracticaIdsEnGenerarAutorizacion?: boolean
    forzarNavegacionCompletaGenerarAutorizacion?: boolean
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
    facturable: boolean
    importeBaseUnitario: string
}

function practicaFacturada(practica: PracticaItem): boolean {
    if (typeof practica.facturada === 'boolean') return practica.facturada
    return Boolean((practica.puestoNumero ?? 0) > 0 && (practica.ordenNumero ?? 0) > 0)
}

function normalizarNumeroAutorizacion(value: string | null | undefined): string | null {
    const normalizada = value?.trim() ?? ''
    return normalizada.length > 0 ? normalizada : null
}

function grupoTieneNumeroAutorizacion(grupo: GrupoPracticasAutorizadas): boolean {
    return normalizarNumeroAutorizacion(grupo.numeroAutorizacion) != null
}

function fechaPracticaAISOString(value: string): string {
    return new Date(`${value}T12:00:00-03:00`).toISOString()
}

export function PracticaSection({
    ingresoId,
    convenioId,
    sectorInternacionActual,
    sectorPorPracticaId,
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
    const [mostrarPedidoLaboratorio, setMostrarPedidoLaboratorio] = useState(false)
    const [expandido, setExpandido] = useState(true)
    const [filtroLista, setFiltroLista] = useState('')
    const [paginaPendientes, setPaginaPendientes] = useState(1)
    const [paginaAutorizadas, setPaginaAutorizadas] = useState(1)
    const [mostrarUti, setMostrarUti] = useState(true)
    const [mostrarPiso, setMostrarPiso] = useState(true)
    const [mostrarOrdenesPendientesAutorizacion, setMostrarOrdenesPendientesAutorizacion] = useState(true)
    const [mostrarOrdenesYaAutorizadas, setMostrarOrdenesYaAutorizadas] = useState(true)
    const [profesionalesConMatricula, setProfesionalesConMatricula] = useState<ProfesionalConMatricula[]>([])

    const [guardandoPedidoLaboratorio, setGuardandoPedidoLaboratorio] = useState(false)
    const [numeroProtocoloLaboratorio, setNumeroProtocoloLaboratorio] = useState('')
    const [diagnosticoLaboratorio, setDiagnosticoLaboratorio] = useState('')
    const [desagrupandoPracticaId, setDesagrupandoPracticaId] = useState<number | null>(null)
    const [eliminandoPracticas, setEliminandoPracticas] = useState(false)
    const [generandoOrdenes, setGenerandoOrdenes] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [practicasSeleccionadas, setPracticasSeleccionadas] = useState<number[]>([])
    const [clasificacionPorPracticaId, setClasificacionPorPracticaId] = useState<Record<number, string>>({})
    const [titularOrdenAgrupada, setTitularOrdenAgrupada] = useState<string>('')
    const [mostrarPopupTitularAgrupada, setMostrarPopupTitularAgrupada] = useState(false)
    const [imprimirTrasAgrupar, setImprimirTrasAgrupar] = useState(false)
    const [clasificacionesExpandidas, setClasificacionesExpandidas] = useState<Record<string, boolean>>({})
    const [medicoFirmanteId, setMedicoFirmanteId] = useState('')
    const [firmanteEditadoManualmente, setFirmanteEditadoManualmente] = useState(false)
    const [ordenesAutorizadasAbiertas, setOrdenesAutorizadasAbiertas] = useState<Record<string, boolean>>({})
    const [ordenesAutorizadasExpandidas, setOrdenesAutorizadasExpandidas] = useState<Record<string, boolean>>({})
    const [practicaEditando, setPracticaEditando] = useState<PracticaItem | null>(null)
    const [draftPracticaEditando, setDraftPracticaEditando] = useState<PracticaEditDraft | null>(null)
    const [guardandoPracticaEditando, setGuardandoPracticaEditando] = useState(false)
    const [anulandoOrdenKey, setAnulandoOrdenKey] = useState<string | null>(null)

    useEffect(() => {
        setPracticas(practicasIniciales)
        const idsValidos = new Set(practicasIniciales.map((p) => p.id))
        setPracticasSeleccionadas((prev) => prev.filter((id) => idsValidos.has(id)))
        setClasificacionPorPracticaId((prev) => {
            const next: Record<number, string> = {}
            for (const [key, value] of Object.entries(prev)) {
                const id = Number(key)
                if (idsValidos.has(id)) {
                    next[id] = value
                }
            }
            return next
        })
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
                        .filter(
                            (profesional: unknown): profesional is ProfesionalConMatricula => {
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
                            }
                        )
                        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

                    setProfesionalesConMatricula(filtrados)
                }
            } catch {
                if (!cancelled) {
                    setProfesionalesConMatricula([])
                }
            }
        }

        cargarProfesionales()

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

    const limpiarPedidoLaboratorio = () => {
        setNumeroProtocoloLaboratorio('')
        setDiagnosticoLaboratorio('')
    }

    const abrirEdicionPractica = (practica: PracticaItem) => {
        if (practicaFacturada(practica)) {
            setError('La práctica ya fue facturada. Anulá la orden en Facturación para poder editarla.')
            return
        }

        const cantidad = Number.isFinite(Number(practica.cantidad)) && Number(practica.cantidad) > 0
            ? Number(practica.cantidad)
            : 1
        const importeBaseUnitario =
            practica.importeTotal != null && cantidad > 0
                ? Number(practica.importeTotal) / cantidad
                : null

        setError(null)
        setPracticaEditando(practica)
        setDraftPracticaEditando({
            convenioId: Number(practica.convenioId) > 0 ? Number(practica.convenioId) : (convenioId ?? 0),
            codigoPractica: practica.codigoPractica.trim(),
            descripcionPractica: practica.descripcionPractica ?? '',
            fecha: fechaAInputLocal(practica.fecha),
            cantidad: String(cantidad),
            numeroAutorizacion: practica.numeroAutorizacion ?? '',
            numeroProtocoloLaboratorio: practica.numeroProtocoloLaboratorio ?? '',
            diagnosticoLaboratorio: practica.diagnosticoLaboratorio ?? '',
            matriculaEspecialista: practica.matriculaEspecialista != null ? String(practica.matriculaEspecialista) : '',
            matriculaAnestesista: practica.matriculaAnestesista != null ? String(practica.matriculaAnestesista) : '',
            facturable: practica.facturable,
            importeBaseUnitario: importeBaseUnitario != null && Number.isFinite(importeBaseUnitario)
                ? String(Number(importeBaseUnitario.toFixed(2)))
                : '',
        })
    }

    const cerrarEdicionPractica = () => {
        setPracticaEditando(null)
        setDraftPracticaEditando(null)
    }

    const guardarEdicionPractica = async () => {
        if (!practicaEditando || !draftPracticaEditando) return

        const cantidad = Number.parseInt(draftPracticaEditando.cantidad, 10)
        if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 999) {
            setError('La cantidad debe estar entre 1 y 999')
            return
        }

        const codigoPractica = draftPracticaEditando.codigoPractica.trim().toUpperCase()
        if (!codigoPractica) {
            setError('El código de práctica es obligatorio')
            return
        }

        if (!draftPracticaEditando.fecha) {
            setError('La fecha de la práctica es obligatoria')
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
            fecha: fechaPracticaAISOString(draftPracticaEditando.fecha),
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
        }

        setError(null)
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
                setError(json?.error ?? 'No se pudo editar la práctica')
                return
            }

            const actualizada = (json?.data ?? null) as PracticaItem | null
            if (actualizada) {
                setPracticas((prev) => prev.map((p) => (p.id === actualizada.id ? actualizada : p)))
                setClasificacionPorPracticaId((prev) => ({
                    ...prev,
                    [actualizada.id]: clasificacionInferidaPractica(actualizada),
                }))
            }

            cerrarEdicionPractica()
            if (refrescarDespuesCambios) {
                router.refresh()
            }
        } catch {
            setError('Error de conexión al editar la práctica')
        } finally {
            setGuardandoPracticaEditando(false)
        }
    }

    const handleCrearPedidoLaboratorio = async () => {
        const numeroProtocolo = numeroProtocoloLaboratorio.trim()
        const diagnostico = diagnosticoLaboratorio.trim()
        const convenioPedidoLaboratorio =
            convenioId ??
            practicas.find((practica) => Number(practica.convenioId) > 0)?.convenioId ??
            0

        if (!numeroProtocolo) {
            setError('Ingresá el número de protocolo')
            return
        }

        setError(null)
        setGuardandoPedidoLaboratorio(true)
        try {
            const res = await fetch(`/api/internacion/${ingresoId}/practicas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    convenioId: convenioPedidoLaboratorio,
                    codigoPractica: '66',
                    descripcionPractica: 'PROTOCOLO BIOQUIMICO',
                    numeroProtocoloLaboratorio: numeroProtocolo,
                    diagnosticoLaboratorio: diagnostico || null,
                    fecha: new Date().toISOString(),
                    cantidad: 1,
                    numeroAutorizacion: null,
                    matriculaEspecialista: null,
                    matriculaAnestesista: null,
                    facturable: true,
                    importeBaseUnitario: null,
                }),
            })
            const json = await res.json()

            if (!res.ok) {
                setError(json?.error ?? 'Error al registrar el pedido de laboratorio')
                return
            }

            setPracticas((prev) => [json.data as PracticaItem, ...prev])
            setClasificacionPorPracticaId((prev) => ({
                ...prev,
                [json.data.id]: 'HE',
            }))
            limpiarPedidoLaboratorio()
            setMostrarPedidoLaboratorio(false)
        } catch {
            setError('Error al guardar el pedido de laboratorio')
        } finally {
            setGuardandoPedidoLaboratorio(false)
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
                setClasificacionPorPracticaId((prev) => {
                    const next = { ...prev }
                    delete next[practicaId]
                    for (const practicaNueva of practicasNuevas) {
                        next[practicaNueva.id] = clasificacionInferidaPractica(practicaNueva)
                    }
                    return next
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

    const alternarExpansionClasificacion = (clasificacion: string) => {
        setClasificacionesExpandidas((prev) => ({
            ...prev,
            [clasificacion]: !prev[clasificacion],
        }))
    }

    const handleEliminarPracticasSeleccionadas = async (idsAEliminar?: number[]) => {
        const seleccionActual = idsAEliminar ? [...idsAEliminar] : [...practicasSeleccionadas]
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
                setClasificacionPorPracticaId((prev) => {
                    const next = { ...prev }
                    for (const id of exitosas) delete next[id]
                    return next
                })
            }

        } finally {
            setEliminandoPracticas(false)
        }
    }

    const handleGenerarOrdenes = async (
        imprimirDespues: boolean,
        agruparEnUnaOrden = false,
        titularOrdenAgrupadaOverride?: string
    ) => {
        if (idsPendientesSeleccionadas.length === 0) {
            setError('Seleccioná al menos una práctica pendiente para generar órdenes')
            return
        }

        setError(null)
        setGenerandoOrdenes(true)
        try {
            const profesionalIdFirmante = Number.parseInt(medicoFirmanteId, 10)
            const medicoFirmanteMatricula = Number.isFinite(profesionalIdFirmante)
                ? (matriculaPorProfesionalId.get(profesionalIdFirmante) ?? null)
                : matriculaFirmanteSugerida

            const clasificacionPayload = Object.fromEntries(
                idsPendientesSeleccionadas.map((id) => {
                    const practica = practicas.find((p) => p.id === id)
                    const clasificacion = practica ? obtenerClasificacionPractica(practica) : 'HE'
                    return [String(id), clasificacion]
                })
            )

            const result = await generarOrdenesDesdeInternacionAction({
                ingresoId,
                practicaIds: idsPendientesSeleccionadas,
                clasificacionPorPracticaId: clasificacionPayload,
                agruparEnUnaOrden,
                titularOrdenAgrupada: agruparEnUnaOrden
                    ? (titularOrdenAgrupadaOverride ?? titularOrdenAgrupada)
                    : undefined,
                cirujanoFirmanteMatricula: medicoFirmanteMatricula ?? undefined,
            })

            if ('error' in result && result.error) {
                setError(result.error)
                return
            }

            const asignaciones = Array.isArray((result as { asignaciones?: unknown }).asignaciones)
                ? ((result as {
                    asignaciones: Array<{ practicaId: number; puestoNumero: number; numero: number; item: number }>
                }).asignaciones)
                : []

            const asignacionPorPracticaId = new Map(
                asignaciones.map((a) => [a.practicaId, a] as const)
            )

            setPracticas((prev) => prev.map((p) => {
                const asignada = asignacionPorPracticaId.get(p.id)
                if (!asignada) return p
                const yaVinculada = p.ordenPractica.some(
                    (op) => op.puestoNumero === asignada.puestoNumero && op.ordenNumero === asignada.numero && op.item === asignada.item
                )
                if (yaVinculada) return p

                return {
                    ...p,
                    ordenPractica: [
                        ...p.ordenPractica,
                        {
                            puestoNumero: asignada.puestoNumero,
                            ordenNumero: asignada.numero,
                            item: asignada.item,
                            numeroAutorizacion: null,
                        },
                    ],
                }
            }))

            const grupos = Array.isArray((result as { ordenesPorGrupo?: unknown }).ordenesPorGrupo)
                ? ((result as {
                    ordenesPorGrupo: Array<{ clasificacion: string; puestoNumero: number; numero: number; practicaIds: number[] }>
                }).ordenesPorGrupo)
                : []
            setPracticasSeleccionadas((prev) => prev.filter((id) => !idsPendientesSeleccionadas.includes(id)))

            if (imprimirDespues && grupos.length > 0) {
                const ordenesParam = grupos
                    .map((o) => `${o.puestoNumero}-${o.numero}`)
                    .join(',')
                const url = `/dashboard/ambulatorio/imprimir?ordenes=${encodeURIComponent(ordenesParam)}`
                if (typeof window !== 'undefined') {
                    window.open(url, '_blank')
                }
            }

            if (refrescarDespuesCambios) {
                router.refresh()
            }
        } catch {
            setError('Error al generar órdenes desde internación')
        } finally {
            setGenerandoOrdenes(false)
        }
    }

    const handleClickAgruparYGenerarOrden = (imprimirDespues: boolean) => {
        if (idsPendientesSeleccionadas.length === 0) {
            setError('Seleccioná al menos una práctica pendiente para generar órdenes')
            return
        }

        setError(null)
        setImprimirTrasAgrupar(imprimirDespues)
        if (requierePopupTitularAgrupada) {
            setMostrarPopupTitularAgrupada(true)
            return
        }

        void handleGenerarOrdenes(imprimirDespues, true)
    }

    const confirmarPopupTitularAgrupada = () => {
        setMostrarPopupTitularAgrupada(false)
        const titularSeleccionado = titularOrdenAgrupada || titularesAgrupadosDisponibles[0] || 'HONORARIOS'
        void handleGenerarOrdenes(imprimirTrasAgrupar, true, titularSeleccionado)
    }

    const handleAnularOrdenDesdeGrupo = async (puestoNumero: number, ordenNumero: number, grupoKey: string) => {
        if (typeof window !== 'undefined') {
            const confirmar = window.confirm(
                `Se anulará la orden ${formatearNumeroOrden(puestoNumero, ordenNumero)}. ¿Desea continuar?`
            )
            if (!confirmar) return
        }

        setError(null)
        setAnulandoOrdenKey(grupoKey)
        try {
            const result = await anularOrdenAction(puestoNumero, ordenNumero)
            if ('error' in result && result.error) {
                setError(result.error)
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
                }
            }))

            if (refrescarDespuesCambios) {
                router.refresh()
            }
        } catch {
            setError('Error al anular la orden')
        } finally {
            setAnulandoOrdenKey(null)
        }
    }

    const fmtFecha = (d: Date | string) =>
        new Date(d).toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        })

    const practicasVigentes = practicas.filter((p) => practicaActiva(p.estado))
    const sectorFallbackPracticas: SectorPracticaFiltro = esSectorUti(sectorInternacionActual) ? 'UTI' : 'PISO'
    const practicasVigentesFiltradasPorSector = useMemo(
        () =>
            practicasVigentes.filter((practica) => {
                const sector = sectorPorPracticaId?.[practica.id] ?? sectorFallbackPracticas
                if (sector === 'UTI') return mostrarUti
                return mostrarPiso
            }),
        [practicasVigentes, sectorPorPracticaId, sectorFallbackPracticas, mostrarUti, mostrarPiso]
    )

    const practicasPendientes = practicasVigentesFiltradasPorSector.filter(
        (p) => (p.ordenPractica?.length ?? 0) === 0
    )
    const practicasAutorizadas = practicasVigentesFiltradasPorSector.filter(
        (p) => (p.ordenPractica?.length ?? 0) > 0
    )
    const idsPendientesSeleccionadas = useMemo(() => {
        const pendientesIds = new Set(practicasPendientes.map((p) => p.id))
        return practicasSeleccionadas.filter((id) => pendientesIds.has(id))
    }, [practicasPendientes, practicasSeleccionadas])

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

        return null
    }, [idsPendientesSeleccionadas, practicasPendientes, practicas])

    const matriculaFirmantePorDefecto = useMemo(() => {
        if (matriculaTratanteDefault != null && matriculaTratanteDefault > 0) {
            return matriculaTratanteDefault
        }
        return matriculaFirmanteSugerida
    }, [matriculaTratanteDefault, matriculaFirmanteSugerida])

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

            return `Matrícula ${matriculaFirmanteSugerida} (sugerida)`
        }

        return 'Sin firmante seleccionado. Se usará el profesional de la internación.'
    }, [medicoFirmanteId, profesionalesConMatricula, matriculaFirmanteSugerida])

    useEffect(() => {
        const profesionalIdSugerido =
            matriculaFirmantePorDefecto != null
                ? (profesionalIdPorMatricula.get(matriculaFirmantePorDefecto) ?? null)
                : null

        if (!profesionalIdSugerido) return
        if (firmanteEditadoManualmente && medicoFirmanteId) return

        const siguiente = String(profesionalIdSugerido)
        if (medicoFirmanteId === siguiente) return

        setMedicoFirmanteId(siguiente)
    }, [
        medicoFirmanteId,
        matriculaFirmantePorDefecto,
        profesionalIdPorMatricula,
        firmanteEditadoManualmente,
    ])

    useEffect(() => {
        if (!medicoFirmanteId) return

        const profesionalId = Number.parseInt(medicoFirmanteId, 10)
        if (!Number.isFinite(profesionalId) || !matriculaPorProfesionalId.has(profesionalId)) {
            setMedicoFirmanteId('')
            setFirmanteEditadoManualmente(false)
        }
    }, [medicoFirmanteId, matriculaPorProfesionalId])

    const titularesAgrupadosDisponibles = useMemo(() => {
        const componentesPresentes = new Set<string>()

        for (const id of idsPendientesSeleccionadas) {
            const practica = practicas.find((p) => p.id === id)
            if (!practica) continue
            const clasificacion = obtenerClasificacionPractica(practica)
            const normalizada = normalizarClasificacionAgrupacion(clasificacion)
            if (!normalizada) continue

            for (const componente of normalizada.split('+')) {
                if (ORDEN_COMPONENTES_CLASIFICACION.includes(componente as (typeof ORDEN_COMPONENTES_CLASIFICACION)[number])) {
                    componentesPresentes.add(componente)
                }
            }
        }

        const clasificacionCombinada = ORDEN_COMPONENTES_CLASIFICACION
            .filter((componente) => componentesPresentes.has(componente))
            .join('+')

        const opciones: string[] = []
        if (clasificacionCombinada) {
            opciones.push(tituloDesdeClasificacion(clasificacionCombinada))
        }

        for (const componente of ORDEN_COMPONENTES_CLASIFICACION) {
            if (!componentesPresentes.has(componente)) continue
            opciones.push(tituloDesdeClasificacion(componente))
        }

        if (opciones.length === 0) return ['HONORARIOS']
        return Array.from(new Set(opciones))
    }, [idsPendientesSeleccionadas, practicas, clasificacionPorPracticaId])

    const matriculasProfesionalesSeleccionadasAgrupadas = useMemo(() => {
        const matriculas = new Set<number>()

        for (const id of idsPendientesSeleccionadas) {
            const practica = practicas.find((p) => p.id === id)
            if (!practica) continue

            if ((practica.matriculaEspecialista ?? 0) > 0) {
                matriculas.add(Number(practica.matriculaEspecialista))
            }
        }

        return Array.from(matriculas)
    }, [idsPendientesSeleccionadas, practicas])

    const hayMultiplesProfesionalesAgrupados = matriculasProfesionalesSeleccionadasAgrupadas.length > 1
    const requierePopupTitularAgrupada =
        titularesAgrupadosDisponibles.length > 1 || hayMultiplesProfesionalesAgrupados

    useEffect(() => {
        if (titularesAgrupadosDisponibles.length === 0) {
            setTitularOrdenAgrupada('')
            return
        }
        if (!titularOrdenAgrupada || !titularesAgrupadosDisponibles.includes(titularOrdenAgrupada)) {
            setTitularOrdenAgrupada(titularesAgrupadosDisponibles[0] ?? 'HONORARIOS')
        }
    }, [titularesAgrupadosDisponibles, titularOrdenAgrupada])

    const puedeGenerarOrdenes = (puedeGenerarAutorizacion ?? puedeCrear)

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

    const practicasPendientesFiltradasOrdenadas = useMemo(() => {
        const lista = [...practicasPendientesFiltradas]
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
    }, [practicasPendientesFiltradas, clasificacionPorPracticaId])

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

    const ordenesAutorizadasFiltradas = useMemo(
        () => agruparPracticasAutorizadasPorOrden(practicasAutorizadasFiltradas),
        [practicasAutorizadasFiltradas]
    )

    const ordenesGeneradasPendientesAutorizacion = useMemo(
        () => ordenesAutorizadasFiltradas.filter((grupo) => !grupoTieneNumeroAutorizacion(grupo)).length,
        [ordenesAutorizadasFiltradas]
    )

    const ordenesGeneradasYaAutorizadas = useMemo(
        () => ordenesAutorizadasFiltradas.filter((grupo) => grupoTieneNumeroAutorizacion(grupo)).length,
        [ordenesAutorizadasFiltradas]
    )

    const totalPaginasPendientes = Math.max(1, Math.ceil(practicasPendientesFiltradasOrdenadas.length / PRACTICAS_LISTA_POR_PAGINA))
    const totalPaginasAutorizadas = Math.max(1, Math.ceil(ordenesAutorizadasFiltradas.length / PRACTICAS_LISTA_POR_PAGINA))
    const paginaPendientesActual = Math.min(paginaPendientes, totalPaginasPendientes)
    const paginaAutorizadasActual = Math.min(paginaAutorizadas, totalPaginasAutorizadas)

    const practicasPendientesPaginadas = useMemo(() => {
        const desde = (paginaPendientesActual - 1) * PRACTICAS_LISTA_POR_PAGINA
        return practicasPendientesFiltradasOrdenadas.slice(desde, desde + PRACTICAS_LISTA_POR_PAGINA)
    }, [paginaPendientesActual, practicasPendientesFiltradasOrdenadas])

    const practicasPendientesPaginadasAgrupadas = useMemo(() => {
        const grupos = new Map<string, PracticaItem[]>()
        for (const practica of practicasPendientesPaginadas) {
            const clasificacion = obtenerClasificacionPractica(practica)
            const lista = grupos.get(clasificacion)
            if (lista) {
                lista.push(practica)
            } else {
                grupos.set(clasificacion, [practica])
            }
        }

        return Array.from(grupos.entries()).map(([clasificacion, items]) => ({
            clasificacion,
            items,
        }))
    }, [practicasPendientesPaginadas, clasificacionPorPracticaId])

    const idsPendientesFiltradas = practicasPendientesFiltradas.map((p) => p.id)
    const todasFiltradasSeleccionadas =
        idsPendientesFiltradas.length > 0 && idsPendientesFiltradas.every((id) => practicasSeleccionadas.includes(id))

    const ordenesAutorizadasPaginadas = useMemo(() => {
        const desde = (paginaAutorizadasActual - 1) * PRACTICAS_LISTA_POR_PAGINA
        return ordenesAutorizadasFiltradas.slice(desde, desde + PRACTICAS_LISTA_POR_PAGINA)
    }, [paginaAutorizadasActual, ordenesAutorizadasFiltradas])

    const ordenesAutorizadasPaginadasVisibles = useMemo(
        () => ordenesAutorizadasPaginadas.filter((grupo) => {
            const yaAutorizada = grupoTieneNumeroAutorizacion(grupo)
            return yaAutorizada ? mostrarOrdenesYaAutorizadas : mostrarOrdenesPendientesAutorizacion
        }),
        [ordenesAutorizadasPaginadas, mostrarOrdenesPendientesAutorizacion, mostrarOrdenesYaAutorizadas]
    )

    useEffect(() => {
        setPaginaPendientes(1)
        setPaginaAutorizadas(1)
    }, [filtroLista, mostrarUti, mostrarPiso])

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
                    {puedeCrear && (
                        <button
                            onClick={() => {
                                setMostrarPedidoLaboratorio((v) => !v)
                                if (mostrarPedidoLaboratorio) limpiarPedidoLaboratorio()
                            }}
                            className="flex items-center gap-1 text-xs font-medium text-indigo-700 hover:text-indigo-800 border border-indigo-200 rounded-lg px-2.5 py-1 hover:bg-indigo-50"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Agregar pedido de laboratorio
                        </button>
                    )}
                    {puedeCrear && (
                        <Link
                            href={`/dashboard/internacion/${ingresoId}/practicas`}
                            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1 hover:bg-blue-50"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Carga rápida de prácticas
                        </Link>
                    )}
                </div>
            </div>

            {expandido && (
                <div className="p-4 space-y-4">
                    {mostrarPedidoLaboratorio && puedeCrear && (
                        <div className="border border-indigo-100 bg-indigo-50/40 rounded-xl p-4 space-y-3">
                            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                                Nuevo pedido de laboratorio
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Número de protocolo</label>
                                    <input
                                        type="text"
                                        value={numeroProtocoloLaboratorio}
                                        onChange={(e) => setNumeroProtocoloLaboratorio(e.target.value)}
                                        placeholder="Ej: 123456"
                                        className="his-input text-sm w-full"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Diagnóstico</label>
                                    <input
                                        type="text"
                                        value={diagnosticoLaboratorio}
                                        onChange={(e) => setDiagnosticoLaboratorio(e.target.value)}
                                        placeholder="Diagnóstico clínico"
                                        className="his-input text-sm w-full"
                                    />
                                </div>
                            </div>
                            {error && (
                                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
                                    {error}
                                </p>
                            )}
                            <div className="flex gap-2 pt-1">
                                <button
                                    onClick={handleCrearPedidoLaboratorio}
                                    disabled={guardandoPedidoLaboratorio}
                                    className="flex items-center gap-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg px-3 py-1.5 hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    {guardandoPedidoLaboratorio ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Plus className="h-3.5 w-3.5" />
                                    )}
                                    Guardar
                                </button>
                                <button
                                    onClick={() => {
                                        setMostrarPedidoLaboratorio(false)
                                        limpiarPedidoLaboratorio()
                                    }}
                                    className="text-xs text-gray-500 hover:text-gray-700 border rounded-lg px-3 py-1.5 hover:bg-gray-50"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}

                    <datalist id="clasificacion-practica-list">
                        <option value="HE" />
                        <option value="HA" />
                        <option value="GA" />
                        <option value="HP" />
                        <option value="A1" />
                        <option value="A2" />
                        <option value="A3" />
                        <option value="HE+GA" />
                        <option value="HE+HA" />
                        <option value="HA+GA" />
                    </datalist>

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
                            <div className="flex flex-wrap items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                                <span className="text-[11px] font-medium text-gray-700">Mostrar prácticas cargadas:</span>
                                <label className="inline-flex items-center gap-1.5 text-xs text-gray-700">
                                    <input
                                        type="checkbox"
                                        checked={mostrarUti}
                                        onChange={(e) => setMostrarUti(e.target.checked)}
                                        className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    UTI
                                </label>
                                <label className="inline-flex items-center gap-1.5 text-xs text-gray-700">
                                    <input
                                        type="checkbox"
                                        checked={mostrarPiso}
                                        onChange={(e) => setMostrarPiso(e.target.checked)}
                                        className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    PISO
                                </label>
                            </div>
                            <div className="space-y-2">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                                    Pendientes de generación ({practicasPendientesFiltradas.length})
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
                                        <label className="w-full max-w-xl text-[11px] text-amber-900">
                                            Médico firmante
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
                                            <span className="mt-1 block text-[10px] text-amber-800">
                                                Por defecto se usa el tratante; podés editarlo antes de generar.
                                            </span>
                                            <span className="block text-[10px] text-amber-800">
                                                Firma prevista: {firmaPrevistaTexto}
                                            </span>
                                        </label>
                                        {puedeGenerarOrdenes && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => void handleGenerarOrdenes(false)}
                                                    disabled={generandoOrdenes || idsPendientesSeleccionadas.length === 0}
                                                    className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                                >
                                                    Generar órdenes
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void handleGenerarOrdenes(true)}
                                                    disabled={generandoOrdenes || idsPendientesSeleccionadas.length === 0}
                                                    className="inline-flex items-center rounded-md border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                                                >
                                                    Generar órdenes e imprimir
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleClickAgruparYGenerarOrden(false)}
                                                    disabled={generandoOrdenes || idsPendientesSeleccionadas.length === 0}
                                                    className="inline-flex items-center rounded-md border border-indigo-200 bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                                                >
                                                    Agrupar y generar órdenes
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleClickAgruparYGenerarOrden(true)}
                                                    disabled={generandoOrdenes || idsPendientesSeleccionadas.length === 0}
                                                    className="inline-flex items-center rounded-md border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                                                >
                                                    Agrupar, generar e imprimir
                                                </button>
                                            </>
                                        )}
                                    </div>
                                )}
                                {practicasPendientesFiltradasOrdenadas.length === 0 ? (
                                    <p className="text-xs text-gray-400">No hay prácticas pendientes de generación.</p>
                                ) : (
                                    practicasPendientesPaginadasAgrupadas.map((grupo) => {
                                        const expandida = Boolean(clasificacionesExpandidas[grupo.clasificacion])
                                        return (
                                            <div
                                                key={`grupo-${grupo.clasificacion}`}
                                                className="text-xs border rounded-lg px-2.5 py-2 bg-white"
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => alternarExpansionClasificacion(grupo.clasificacion)}
                                                        className="inline-flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-100"
                                                    >
                                                        <span>{grupo.clasificacion}</span>
                                                        {expandida ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => alternarExpansionClasificacion(grupo.clasificacion)}
                                                        className="inline-flex items-center rounded border border-gray-300 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                                                    >
                                                        {expandida ? 'Contraer' : `Ampliar (${grupo.items.length})`}
                                                    </button>
                                                </div>
                                                {expandida && (
                                                    <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
                                                        {grupo.items.map((p) => (
                                                            <div
                                                                key={p.id}
                                                                className="flex flex-col gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 md:flex-row md:flex-wrap md:items-center"
                                                            >
                                                                {puedeCrear && (
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={practicasSeleccionadas.includes(p.id)}
                                                                        onChange={(e) => alternarSeleccionPractica(p.id, e.target.checked)}
                                                                        disabled={eliminandoPracticas}
                                                                        className="h-3.5 w-3.5 rounded border-gray-300 text-amber-700 focus:ring-amber-500"
                                                                    />
                                                                )}
                                                                <span className="font-mono text-gray-400 shrink-0">
                                                                    {p.codigoPractica.trim()}
                                                                </span>
                                                                <span className="font-medium text-gray-800 wrap-break-word">
                                                                    {p.descripcionPractica ?? p.codigoPractica.trim()}
                                                                </span>
                                                                <span className="text-gray-500">{fmtFecha(p.fecha)}</span>
                                                                {p.cantidad > 1 && <span className="text-gray-500">Cant: {p.cantidad}</span>}
                                                                {p.numeroAutorizacion && <span className="text-gray-500">Aut: {p.numeroAutorizacion}</span>}
                                                                {esPedidoLaboratorio(p) && (
                                                                    <span className="text-indigo-700">
                                                                        Prot: {p.numeroProtocoloLaboratorio?.trim() || '-'}
                                                                    </span>
                                                                )}
                                                                {!esPedidoLaboratorio(p) && (
                                                                    <span
                                                                        className={`px-1.5 py-0.5 rounded ${p.facturable
                                                                            ? 'bg-green-50 text-green-700'
                                                                            : 'bg-gray-100 text-gray-500'
                                                                            }`}
                                                                    >
                                                                        {p.facturable ? 'Facturable' : 'No facturable'}
                                                                    </span>
                                                                )}
                                                                <span className="text-[11px] text-gray-500">Clasif.</span>
                                                                <input
                                                                    type="text"
                                                                    value={obtenerClasificacionPractica(p)}
                                                                    onChange={(e) => {
                                                                        const raw = e.target.value.toUpperCase()
                                                                        setClasificacionPorPracticaId((prev) => ({
                                                                            ...prev,
                                                                            [p.id]: normalizarClasificacionAgrupacion(raw) ?? raw.replace(/\s+/g, ''),
                                                                        }))
                                                                    }}
                                                                    list="clasificacion-practica-list"
                                                                    className="w-20 rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-700"
                                                                />
                                                                {puedeCrear && p.cantidad > 1 && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => void handleDesagruparPractica(p.id)}
                                                                        disabled={desagrupandoPracticaId === p.id}
                                                                        className="rounded-md border border-blue-200 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                                                                    >
                                                                        {desagrupandoPracticaId === p.id ? '...' : 'Desagrupar'}
                                                                    </button>
                                                                )}
                                                                {p.estado && p.estado !== 'A' && (
                                                                    <span className="text-gray-400">{p.estado}</span>
                                                                )}
                                                                {practicaFacturada(p) && (
                                                                    <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                                                                        Facturada
                                                                    </span>
                                                                )}
                                                                {puedeCrear && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => abrirEdicionPractica(p)}
                                                                        disabled={guardandoPracticaEditando || practicaFacturada(p)}
                                                                        title={practicaFacturada(p)
                                                                            ? 'Práctica facturada. Anulá la orden en Facturación para editar.'
                                                                            : 'Editar práctica'}
                                                                        className="inline-flex h-6 w-6 items-center justify-center rounded border border-blue-200 bg-white text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                                                                    >
                                                                        <Pencil className="h-3.5 w-3.5" />
                                                                    </button>
                                                                )}
                                                                {puedeCrear && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => void handleEliminarPracticasSeleccionadas([p.id])}
                                                                        disabled={eliminandoPracticas}
                                                                        title="Eliminar práctica"
                                                                        aria-label="Eliminar práctica"
                                                                        className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-50"
                                                                    >
                                                                        {eliminandoPracticas
                                                                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                            : <Trash2 className="h-3.5 w-3.5" />}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })
                                )}
                                {practicasPendientesFiltradasOrdenadas.length > PRACTICAS_LISTA_POR_PAGINA && (
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
                                    Órdenes generadas ({ordenesAutorizadasFiltradas.length})
                                </p>
                                <div className="space-y-1">
                                    <button
                                        type="button"
                                        onClick={() => setMostrarOrdenesPendientesAutorizacion((prev) => !prev)}
                                        disabled={ordenesGeneradasPendientesAutorizacion === 0}
                                        className="flex w-full items-center justify-between rounded border border-amber-200 bg-amber-50/50 px-2 py-1 text-left disabled:opacity-60"
                                    >
                                        <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                                            Pendientes de autorización ({ordenesGeneradasPendientesAutorizacion})
                                        </span>
                                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800">
                                            {mostrarOrdenesPendientesAutorizacion ? 'Contraer' : 'Expandir'}
                                            {mostrarOrdenesPendientesAutorizacion ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setMostrarOrdenesYaAutorizadas((prev) => !prev)}
                                        disabled={ordenesGeneradasYaAutorizadas === 0}
                                        className="flex w-full items-center justify-between rounded border border-emerald-200 bg-emerald-50/50 px-2 py-1 text-left disabled:opacity-60"
                                    >
                                        <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                            Ya autorizadas ({ordenesGeneradasYaAutorizadas})
                                        </span>
                                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-800">
                                            {mostrarOrdenesYaAutorizadas ? 'Contraer' : 'Expandir'}
                                            {mostrarOrdenesYaAutorizadas ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                        </span>
                                    </button>
                                </div>
                                {ordenesAutorizadasFiltradas.length === 0 ? (
                                    <p className="text-xs text-gray-400">No hay órdenes generadas.</p>
                                ) : ordenesAutorizadasPaginadasVisibles.length === 0 ? (
                                    <p className="text-xs text-gray-500">No hay órdenes visibles con los paneles cerrados.</p>
                                ) : (
                                    ordenesAutorizadasPaginadasVisibles.map((grupo) => {
                                        const destinoAutorizada = obtenerDestinoGrupoPracticasAutorizadas(grupo)
                                        const destinoOrdenImpresion =
                                            grupo.tipo === 'orden' && grupo.puestoNumero && grupo.ordenNumero
                                                ? `/dashboard/ambulatorio/imprimir?ordenes=${encodeURIComponent(`${grupo.puestoNumero}-${grupo.ordenNumero}`)}`
                                                : null
                                        const grupoFacturado = grupo.practicas.some((practica) => practicaFacturada(practica))
                                        const puedeAnularGrupo =
                                            grupo.tipo === 'orden' &&
                                            Boolean(grupo.puestoNumero && grupo.ordenNumero) &&
                                            !grupoFacturado
                                        const grupoAnulandose = anulandoOrdenKey === grupo.key
                                        const destinoAbrir = destinoOrdenImpresion ?? destinoAutorizada
                                        const limitePracticas = 3
                                        const expandida = ordenesAutorizadasExpandidas[grupo.key] ?? false
                                        const abierta = ordenesAutorizadasAbiertas[grupo.key] ?? false
                                        const practicasVisibles = expandida
                                            ? grupo.practicas
                                            : grupo.practicas.slice(0, limitePracticas)
                                        const restantes = Math.max(0, grupo.practicas.length - practicasVisibles.length)
                                        const grupoYaAutorizado = grupoTieneNumeroAutorizacion(grupo)
                                        const tituloGrupo = grupo.tipo === 'orden' && grupo.puestoNumero && grupo.ordenNumero
                                            ? `Orden ${formatearNumeroOrden(grupo.puestoNumero, grupo.ordenNumero)}`
                                            : `Autorización ${grupo.numeroAutorizacion ?? '-'}`

                                        return (
                                            <div
                                                key={grupo.key}
                                                className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5 text-xs"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => setOrdenesAutorizadasAbiertas((prev) => ({
                                                        ...prev,
                                                        [grupo.key]: !(prev[grupo.key] ?? false),
                                                    }))}
                                                    className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-0.5 text-left hover:bg-emerald-100/40"
                                                >
                                                    <span className="flex items-center gap-2 text-emerald-900">
                                                        <ChevronRight className={`h-4 w-4 transition-transform ${abierta ? 'rotate-90' : ''}`} />
                                                        <span className="font-semibold">{tituloGrupo}</span>
                                                    </span>
                                                    <span className="text-[11px] text-emerald-700">{grupo.practicas.length} práctica(s)</span>
                                                </button>

                                                {abierta && (
                                                    <div className="mt-2 grid gap-3 md:grid-cols-2">
                                                        <div className="space-y-1.5 text-emerald-900">
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
                                                                {puedeCrear && grupo.tipo === 'orden' && grupo.puestoNumero && grupo.ordenNumero && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => void handleAnularOrdenDesdeGrupo(grupo.puestoNumero as number, grupo.ordenNumero as number, grupo.key)}
                                                                        disabled={grupoAnulandose || !puedeAnularGrupo}
                                                                        title={!puedeAnularGrupo
                                                                            ? 'La orden ya está facturada'
                                                                            : 'Anular orden'}
                                                                        className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                                                                    >
                                                                        {grupoAnulandose && <Loader2 className="h-3 w-3 animate-spin" />}
                                                                        {grupoAnulandose ? 'Anulando...' : 'Anular orden'}
                                                                    </button>
                                                                )}
                                                            </div>
                                                            <p className="text-emerald-800">N° autorización: {grupo.numeroAutorizacion ?? '-'}</p>
                                                            <p className={grupoYaAutorizado ? 'text-emerald-800' : 'text-amber-700 font-medium'}>
                                                                Estado: {grupoYaAutorizado ? 'Ya autorizada' : 'Pendiente de autorización'}
                                                            </p>
                                                            <p className="text-emerald-800">Fecha última práctica: {fmtFecha(grupo.fechaReferencia)}</p>
                                                            <p className="text-emerald-800">Cantidad total: {grupo.totalCantidad}</p>
                                                            <p className="text-emerald-800">
                                                                {grupo.matriculasFirmantes.length > 1
                                                                    ? 'Matrículas firmantes'
                                                                    : 'Matrícula firmante'}: {grupo.matriculasFirmantes.length > 0 ? grupo.matriculasFirmantes.join(', ') : '-'}
                                                            </p>
                                                        </div>

                                                        <div className="rounded-md border border-emerald-200 bg-white/70 p-2">
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

                                                            <div className="mt-2 space-y-1.5">
                                                                {practicasVisibles.map((practica) => (
                                                                    <div
                                                                        key={`${grupo.key}-${practica.id}`}
                                                                        className="rounded border border-emerald-100 bg-white px-2 py-1.5"
                                                                    >
                                                                        <div className="flex items-center justify-between gap-2 text-emerald-900">
                                                                            <span className="font-mono text-[11px]">{practica.codigoPractica.trim()}</span>
                                                                            <span className="font-medium">Cant. {practica.cantidad}</span>
                                                                        </div>
                                                                        <p className="text-emerald-900">
                                                                            {practica.descripcionPractica ?? practica.codigoPractica.trim()}
                                                                        </p>
                                                                        <p className="text-[11px] text-emerald-700">{fmtFecha(practica.fecha)}</p>
                                                                        {esPedidoLaboratorio(practica) && (
                                                                            <div className="mt-1 text-[11px] text-indigo-700 space-y-0.5">
                                                                                <p>Protocolo N° {practica.numeroProtocoloLaboratorio?.trim() || '-'}</p>
                                                                                <p>Diagnóstico: {practica.diagnosticoLaboratorio?.trim() || '-'}</p>
                                                                            </div>
                                                                        )}
                                                                        <div className="mt-1 flex items-center justify-end gap-2">
                                                                            {practicaFacturada(practica) && (
                                                                                <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                                                                                    Facturada
                                                                                </span>
                                                                            )}
                                                                            {puedeCrear && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => abrirEdicionPractica(practica)}
                                                                                    disabled={guardandoPracticaEditando || practicaFacturada(practica)}
                                                                                    title={practicaFacturada(practica)
                                                                                        ? 'Práctica facturada. Anulá la orden en Facturación para editar.'
                                                                                        : 'Editar práctica'}
                                                                                    className="inline-flex items-center gap-1 rounded border border-blue-200 bg-white px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                                                                                >
                                                                                    <Pencil className="h-3.5 w-3.5" />
                                                                                    Editar
                                                                                </button>
                                                                            )}
                                                                        </div>
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
                                    })
                                )}
                                {ordenesAutorizadasFiltradas.length > PRACTICAS_LISTA_POR_PAGINA && (
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

            {practicaEditando && draftPracticaEditando && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
                    <div className="w-full max-w-2xl rounded-xl border border-blue-200 bg-white p-4 shadow-xl space-y-3">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900">Editar práctica</h3>
                                <p className="text-xs text-gray-600">
                                    Los cambios impactan en la práctica y, si está autorizada, también en la orden asociada.
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
                                Descripción
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
                                Diagnóstico laboratorio
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

            {mostrarPopupTitularAgrupada && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
                    <div className="w-full max-w-lg rounded-xl border border-amber-200 bg-white p-4 shadow-xl space-y-3">
                        <h3 className="text-sm font-semibold text-gray-900">
                            Seleccionar titular para orden agrupada
                        </h3>
                        <p className="text-xs text-gray-600">
                            Se detectaron múltiples criterios en las prácticas seleccionadas. Elegí el titular antes de generar la orden agrupada.
                        </p>
                        {titularesAgrupadosDisponibles.length > 1 && (
                            <p className="text-xs text-amber-800">
                                Se detectaron varias combinaciones de subitems en simultáneo.
                            </p>
                        )}
                        {hayMultiplesProfesionalesAgrupados && (
                            <p className="text-xs text-amber-800">
                                Se detectaron prácticas con diferentes profesionales cargados.
                            </p>
                        )}

                        <label className="block text-xs text-gray-600">
                            Titular de la orden agrupada
                            <select
                                value={titularOrdenAgrupada}
                                onChange={(e) => setTitularOrdenAgrupada(e.target.value)}
                                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900"
                            >
                                {titularesAgrupadosDisponibles.map((opcion) => (
                                    <option key={`popup-titular-agrupada-${opcion}`} value={opcion}>
                                        {opcion}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => setMostrarPopupTitularAgrupada(false)}
                                className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={confirmarPopupTitularAgrupada}
                                className="rounded border border-indigo-200 bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                            >
                                Generar agrupada
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
