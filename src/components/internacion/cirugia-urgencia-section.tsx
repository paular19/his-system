'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Scissors, ChevronDown, ChevronUp, Loader2, ChevronRight } from 'lucide-react'
import { generarOrdenesDesdeInternacionAction } from '@/modules/orden/actions'
import { fechaAInputLocal, formatearFechaArgentina } from '@/lib/utils/argentina-date'
import { PracticaCargaForm, type PracticaCargaEntrada } from '@/components/internacion/practica-carga-form'
import { ProfesionalSelect } from '@/components/ui/profesional-select'
import { formatearNumeroOrden } from '@/modules/orden/types'

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
    cantidad: number
    estado: string | null
    usuario?: string | null
    matriculaEspecialista?: number | null
    matriculaAnestesista?: number | null
    ordenPractica: Array<{
        puestoNumero: number
        ordenNumero: number
        item: number
        numeroAutorizacion: string | null
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
    totalCantidad: number
    practicas: CirugiaUrgenciaItem['practicas']
}

type ProfesionalConMatricula = {
    id: number
    nombre: string
    matricula: number
}

const MATRICULA_PATOLOGIA_DEFAULT = 2675

function normalizarNumeroAutorizacion(value: string | null | undefined): string | null {
    const normalizado = value?.trim() ?? ''
    return normalizado.length > 0 ? normalizado : null
}

interface CirugiaUrgenciaSectionProps {
    ingresoId: number
    pacienteId: number
    obraSocialIdInicial: number | null
    planIdInicial: number | null
    obraSocialCoseguroIdInicial: number | null
    numeroAfiliadoInicial: string | null
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
    obraSocialIdInicial,
    planIdInicial,
    obraSocialCoseguroIdInicial,
    numeroAfiliadoInicial,
    puedeCrear,
    cirugias: cirugiasIniciales,
    practicasInternacion,
    matriculaTratanteDefault,
}: CirugiaUrgenciaSectionProps) {
    const router = useRouter()

    const [cirugias, setCirugias] = useState<CirugiaUrgenciaItem[]>(cirugiasIniciales)
    const [expandido, setExpandido] = useState(true)
    const [mostrarForm, setMostrarForm] = useState(false)
    const [cirugiaActivaId, setCirugiaActivaId] = useState<number | null>(null)
    const [creandoCirugia, setCreandoCirugia] = useState(false)
    const [generandoOrdenAgrupada, setGenerandoOrdenAgrupada] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [practicasSeleccionadasImpresion, setPracticasSeleccionadasImpresion] = useState<number[]>([])
    const [profesionalesFirmantes, setProfesionalesFirmantes] = useState<ProfesionalConMatricula[]>([])
    const [cirujanoFirmanteId, setCirujanoFirmanteId] = useState('')
    const [firmanteEditadoManualmente, setFirmanteEditadoManualmente] = useState(false)
    const [ordenesAutorizadasAbiertas, setOrdenesAutorizadasAbiertas] = useState<Record<string, boolean>>({})
    const [ordenesAutorizadasExpandidas, setOrdenesAutorizadasExpandidas] = useState<Record<string, boolean>>({})

    useEffect(() => {
        setCirugias(cirugiasIniciales)
    }, [cirugiasIniciales])

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

                const candidata = candidatas.find((item) => {
                    if (usadosPorCodigo.has(item.id)) return false
                    const usuario = (item.usuario ?? '').trim().toUpperCase()
                    return usuario === 'CIRUGIA'
                })
                    ?? candidatas.find((item) => !usadosPorCodigo.has(item.id))

                if (!candidata) continue

                usadosPorCodigo.add(candidata.id)

                const ordenesGeneradas = (candidata.ordenPractica ?? []).map((orden) => ({
                    puestoNumero: orden.puestoNumero,
                    ordenNumero: orden.ordenNumero,
                    item: orden.item,
                    numeroAutorizacion: orden.numeroAutorizacion,
                }))

                estadoPorId.set(practicaCirugia.id, {
                    pendiente: ordenesGeneradas.length === 0,
                    practicaInternacionId: candidata.id,
                    ordenesGeneradas,
                })
            }
        }

        return estadoPorId
    }, [cirugias, practicasInternacion])

    const practicaIdsPendientesCirugia = useMemo(
        () => practicaIdsCirugias.filter((id) => estadoPracticaCirugiaPorId.get(id)?.pendiente === true),
        [practicaIdsCirugias, estadoPracticaCirugiaPorId]
    )

    const setPracticaIdsPendientesCirugia = useMemo(
        () => new Set(practicaIdsPendientesCirugia),
        [practicaIdsPendientesCirugia]
    )

    const practicasSeleccionadasVigentes = useMemo(
        () => practicasSeleccionadasImpresion.filter((id) => setPracticaIdsPendientesCirugia.has(id)),
        [practicasSeleccionadasImpresion, setPracticaIdsPendientesCirugia]
    )

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
                .sort((a, b) => {
                    if (a.tipo !== b.tipo) return a.tipo === 'orden' ? -1 : 1
                    if (a.puestoNumero !== b.puestoNumero) return (b.puestoNumero ?? 0) - (a.puestoNumero ?? 0)
                    if (a.ordenNumero !== b.ordenNumero) return (b.ordenNumero ?? 0) - (a.ordenNumero ?? 0)
                    return a.key.localeCompare(b.key)
                })

            resultado.set(cirugia.id, lista)
        }

        return resultado
    }, [cirugias, estadoPracticaCirugiaPorId])

    const matriculaFirmanteSugerida = useMemo(() => {
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
        practicaIdsPendientesCirugia,
        practicasSeleccionadasVigentes,
        estadoPracticaCirugiaPorId,
        practicasInternacionPorId,
    ])

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

    const limpiarForm = () => {
        setError(null)
    }

    const iniciarNuevaCirugia = async () => {
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
            setCirugiaActivaId(nuevaCirugia.id)
            setMostrarForm(true)
            router.refresh()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo crear la cirugia')
        } finally {
            setCreandoCirugia(false)
        }
    }

    const guardarPracticasEnCirugia = async (entradas: PracticaCargaEntrada[]) => {
        if (entradas.length === 0) return { ok: false, error: 'No hay practicas para agregar' }

        if (!cirugiaActivaId) {
            const mensaje = 'Primero crea una cirugia con el boton Agregar'
            setError(mensaje)
            return { ok: false, error: mensaje }
        }

        if (!obraSocialIdInicial) {
            const mensaje = 'La internacion no tiene obra social asignada. Actualizala para cargar practicas de cirugia.'
            setError(mensaje)
            return { ok: false, error: mensaje }
        }

        setError(null)
        try {
            const practicasExpandida = entradas.map((entrada) => ({
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
                    cirugiaId: cirugiaActivaId,
                    pacienteId,
                    fechaCirugia: fechaAInputLocal(
                        cirugias.find((cirugia) => cirugia.id === cirugiaActivaId)?.fechaCirugia ?? new Date()
                    ),
                    horaCirugia: null,
                    camaId: null,
                    obraSocialId: obraSocialIdInicial,
                    planId: planIdInicial,
                    obraSocialCoseguroId: obraSocialCoseguroIdInicial,
                    numeroAfiliado: numeroAfiliadoInicial ?? null,
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

            const json = await res.json()
            if (!res.ok) {
                const mensaje = json.error ?? 'No se pudo registrar la cirugia'
                setError(mensaje)
                return { ok: false, error: mensaje }
            }

            setCirugias((prev) =>
                prev.map((cirugia) => (cirugia.id === cirugiaActivaId ? (json.data as CirugiaUrgenciaItem) : cirugia))
            )
            router.refresh()
            return { ok: true }
        } catch {
            const mensaje = 'Error de conexion al guardar la cirugia'
            setError(mensaje)
            return { ok: false, error: mensaje }
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

    const generarOrdenAgrupada = async (imprimirDespues: boolean) => {
        if (practicasSeleccionadasVigentes.length === 0) {
            setError('Selecciona al menos una practica de cirugia para generar una sola orden')
            return
        }

        const practicasCirugiaSeleccionadas = cirugias
            .flatMap((cirugia) => cirugia.practicas)
            .filter((practica) => practicasSeleccionadasVigentes.includes(practica.id))

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

        const practicaIdsInternacionSeleccionadas = vinculacionesSeleccionadas
            .map((item) => item.practicaIdInternacion)

        const profesionalIdFirmante = Number.parseInt(cirujanoFirmanteId, 10)
        const cirujanoFirmanteMatricula = Number.isFinite(profesionalIdFirmante)
            ? (matriculaPorProfesionalId.get(profesionalIdFirmante) ?? null)
            : matriculaFirmanteSugerida

        if (practicaIdsInternacionSeleccionadas.length === 0) {
            setError('No se encontraron practicas pendientes de internacion para la seleccion de cirugia')
            return
        }

        setError(null)
        setGenerandoOrdenAgrupada(true)
        try {
            const result = await generarOrdenesDesdeInternacionAction({
                ingresoId,
                practicaIds: practicaIdsInternacionSeleccionadas,
                agruparEnUnaOrden: true,
                cirujanoFirmanteMatricula: cirujanoFirmanteMatricula ?? undefined,
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
            for (const vinculacion of vinculacionesSeleccionadas) {
                if (idsAsignadosInternacion.has(vinculacion.practicaIdInternacion)) {
                    idsAsignadosCirugia.add(vinculacion.practicaIdCirugia)
                }
            }

            setPracticasSeleccionadasImpresion((prev) => prev.filter((id) => !idsAsignadosCirugia.has(id)))

            if (imprimirDespues) {
                const url = `/dashboard/ambulatorio/imprimir?ordenes=${encodeURIComponent(ordenesParam)}`
                if (typeof window !== 'undefined') {
                    window.open(url, '_blank')
                }
                router.refresh()
                return
            }

            router.refresh()
        } catch {
            setError('No se pudo generar la orden agrupada')
        } finally {
            setGenerandoOrdenAgrupada(false)
        }
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

                    {mostrarForm && puedeCrear && (
                        <div className="space-y-4 border border-blue-100 bg-blue-50/40 rounded-xl p-4">
                            <p className="text-xs text-gray-600">
                                Cargando practicas en cirugia #{cirugiaActivaId ?? '—'}. Los datos administrativos y diferenciales se completan en la ficha quirurgica.
                            </p>

                            <PracticaCargaForm
                                convenioId={obraSocialIdInicial}
                                matriculaTratanteDefault={matriculaTratanteDefault}
                                onGuardar={guardarPracticasEnCirugia}
                                onCancel={() => {
                                    limpiarForm()
                                    setMostrarForm(false)
                                    setCirugiaActivaId(null)
                                }}
                                titulo="Nueva practica"
                            />
                        </div>
                    )}

                    {cirugias.length === 0 ? (
                        <p className="text-sm text-gray-500">No hay cirugias registradas.</p>
                    ) : (
                        <div className="space-y-3">
                            {puedeCrear && (
                                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                                    <div className="min-w-65 flex-1 space-y-1">
                                        <div className="text-xs text-emerald-800">
                                            Practicas seleccionadas para generar una sola orden: {practicasSeleccionadasVigentes.length}
                                        </div>
                                        <label className="block text-[11px] font-medium text-emerald-800">
                                            Cirujano firmante
                                            <ProfesionalSelect
                                                profesionales={profesionalesFirmantes}
                                                value={cirujanoFirmanteId}
                                                onChange={(nextValue) => {
                                                    setCirujanoFirmanteId(nextValue)
                                                    setFirmanteEditadoManualmente(true)
                                                }}
                                                disabled={generandoOrdenAgrupada || profesionalesFirmantes.length === 0}
                                                placeholderOption="-- Seleccionar firmante --"
                                                searchPlaceholder="Buscar por nombre o matricula"
                                                selectClassName="mt-1 w-full rounded border border-emerald-300 bg-white px-2 py-1 text-xs text-emerald-900 disabled:bg-emerald-100 disabled:text-emerald-700"
                                                searchClassName="mt-1 w-full rounded border border-emerald-200 bg-white px-2 py-1 text-[11px] text-emerald-900 disabled:bg-emerald-100 disabled:text-emerald-700"
                                            />
                                        </label>
                                        <p className="text-[10px] text-emerald-700">
                                            Se sugiere automáticamente el primer especialista no patólogo de las prácticas seleccionadas.
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => alternarSeleccionTodasCirugia(practicaIdsPendientesCirugia, true)}
                                            disabled={practicaIdsPendientesCirugia.length === 0 || generandoOrdenAgrupada}
                                            className="rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                                        >
                                            Seleccionar todas
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPracticasSeleccionadasImpresion([])}
                                            disabled={practicasSeleccionadasVigentes.length === 0 || generandoOrdenAgrupada}
                                            className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                        >
                                            Limpiar seleccion
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void generarOrdenAgrupada(false)}
                                            disabled={practicasSeleccionadasVigentes.length === 0 || generandoOrdenAgrupada}
                                            className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                                        >
                                            {generandoOrdenAgrupada && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                            {generandoOrdenAgrupada ? 'Generando...' : 'Generar en una sola orden'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void generarOrdenAgrupada(true)}
                                            disabled={practicasSeleccionadasVigentes.length === 0 || generandoOrdenAgrupada}
                                            className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                        >
                                            {generandoOrdenAgrupada && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                            {generandoOrdenAgrupada ? 'Generando...' : 'Generar e imprimir'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {cirugias.map((c) => {
                                const practicasPendientesCirugiaItem = c.practicas.filter((practica) => {
                                    const estadoPractica = estadoPracticaCirugiaPorId.get(practica.id)
                                    return estadoPractica?.pendiente !== false
                                })

                                const practicaIdsCirugia = practicasPendientesCirugiaItem.map((practica) => practica.id)
                                const practicaIdsPendientesCirugiaItem = practicaIdsCirugia.filter(
                                    (id) => estadoPracticaCirugiaPorId.get(id)?.pendiente === true
                                )
                                const gruposAutorizadosCirugia = gruposAutorizadosPorCirugia.get(c.id) ?? []
                                const todasSeleccionadasCirugia =
                                    practicaIdsPendientesCirugiaItem.length > 0
                                    && practicaIdsPendientesCirugiaItem.every((id) => practicasSeleccionadasVigentes.includes(id))

                                return (
                                    <article key={c.id} className="border rounded-lg p-3 bg-white space-y-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b">
                                            <p className="text-sm font-medium text-gray-900">
                                                {formatearFechaArgentina(c.fechaCirugia)} {c.horaCirugia ? ` ${c.horaCirugia}` : ''}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-500">Cirugia #{c.id}</span>
                                                {puedeCrear && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setCirugiaActivaId(c.id)
                                                            setMostrarForm(true)
                                                            setError(null)
                                                        }}
                                                        className="text-xs font-medium text-emerald-700 border border-emerald-200 rounded-md px-2 py-1 hover:bg-emerald-50"
                                                    >
                                                        Agregar practica
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

                                        <div>
                                            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Pendientes de autorizacion</p>
                                            {practicasPendientesCirugiaItem.length === 0 ? (
                                                <p className="text-xs text-gray-500">No hay practicas pendientes.</p>
                                            ) : (
                                                <div className="overflow-x-auto border rounded-md">
                                                    <table className="min-w-full text-xs">
                                                        <thead className="bg-gray-50 text-gray-600">
                                                            <tr>
                                                                {puedeCrear && (
                                                                    <th className="text-left px-2 py-1 border-b w-9">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={todasSeleccionadasCirugia}
                                                                                onChange={(e) => alternarSeleccionTodasCirugia(practicaIdsPendientesCirugiaItem, e.target.checked)}
                                                                            className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-700 focus:ring-emerald-500"
                                                                            title="Seleccionar practicas de esta cirugia"
                                                                        />
                                                                    </th>
                                                                )}
                                                                <th className="text-left px-2 py-1 border-b">Codigo</th>
                                                                <th className="text-left px-2 py-1 border-b">Descripcion</th>
                                                                <th className="text-right px-2 py-1 border-b">Cant.</th>
                                                                <th className="text-left px-2 py-1 border-b">Autorizacion</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {practicasPendientesCirugiaItem.map((p) => (
                                                                <tr key={p.id} className="text-gray-700">
                                                                    {puedeCrear && (
                                                                        <td className="px-2 py-1 border-b align-middle">
                                                                            {(() => {
                                                                                const estadoPractica = estadoPracticaCirugiaPorId.get(p.id)
                                                                                const esPendiente = estadoPractica?.pendiente === true
                                                                                return (
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={practicasSeleccionadasVigentes.includes(p.id)}
                                                                                onChange={(e) => alternarSeleccionPracticaCirugia(p.id, e.target.checked)}
                                                                                disabled={!esPendiente || generandoOrdenAgrupada}
                                                                                className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-700 focus:ring-emerald-500"
                                                                                title={
                                                                                    esPendiente
                                                                                        ? 'Practica pendiente para generar orden'
                                                                                        : 'Esta practica ya tiene orden generada o no esta pendiente'
                                                                                }
                                                                            />
                                                                                )
                                                                            })()}
                                                                        </td>
                                                                    )}
                                                                    <td className="px-2 py-1 border-b font-mono">{p.codigo}</td>
                                                                    <td className="px-2 py-1 border-b">{p.descripcion}</td>
                                                                    <td className="px-2 py-1 border-b text-right">{String(Number(p.cantidad))}</td>
                                                                    <td className="px-2 py-1 border-b">Pendiente</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">
                                                Ya autorizadas ({gruposAutorizadosCirugia.length})
                                            </p>
                                            {gruposAutorizadosCirugia.length === 0 ? (
                                                <p className="text-xs text-gray-400">No hay practicas autorizadas.</p>
                                            ) : (
                                                gruposAutorizadosCirugia.map((grupo) => {
                                                    const grupoKey = `${c.id}-${grupo.key}`
                                                    const abierta = ordenesAutorizadasAbiertas[grupoKey] ?? false
                                                    const expandida = ordenesAutorizadasExpandidas[grupoKey] ?? false
                                                    const limitePracticas = 3
                                                    const practicasVisibles = expandida
                                                        ? grupo.practicas
                                                        : grupo.practicas.slice(0, limitePracticas)
                                                    const restantes = Math.max(0, grupo.practicas.length - practicasVisibles.length)
                                                    const destinoAbrir =
                                                        grupo.tipo === 'orden' && grupo.puestoNumero && grupo.ordenNumero
                                                            ? `/dashboard/ambulatorio/${grupo.puestoNumero}/${grupo.ordenNumero}`
                                                            : grupo.numeroAutorizacion
                                                                ? `/dashboard/ambulatorio?tab=confirmadas&q=${encodeURIComponent(grupo.numeroAutorizacion)}`
                                                                : null
                                                    const tituloGrupo =
                                                        grupo.tipo === 'orden' && grupo.puestoNumero && grupo.ordenNumero
                                                            ? `Orden ${formatearNumeroOrden(grupo.puestoNumero, grupo.ordenNumero)}`
                                                            : `Autorizacion ${grupo.numeroAutorizacion ?? '-'}`

                                                    return (
                                                        <div
                                                            key={grupoKey}
                                                            className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5 text-xs"
                                                        >
                                                            <button
                                                                type="button"
                                                                onClick={() => setOrdenesAutorizadasAbiertas((prev) => ({
                                                                    ...prev,
                                                                    [grupoKey]: !(prev[grupoKey] ?? false),
                                                                }))}
                                                                className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-0.5 text-left hover:bg-emerald-100/40"
                                                            >
                                                                <span className="flex items-center gap-2 text-emerald-900">
                                                                    <ChevronRight className={`h-4 w-4 transition-transform ${abierta ? 'rotate-90' : ''}`} />
                                                                    <span className="font-semibold">{tituloGrupo}</span>
                                                                </span>
                                                                <span className="text-[11px] text-emerald-700">{grupo.practicas.length} practica(s)</span>
                                                            </button>

                                                            {abierta && (
                                                                <div className="mt-2 grid gap-3 md:grid-cols-2">
                                                                    <div className="space-y-1.5 text-emerald-900">
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
                                                                        </div>
                                                                        <p className="text-emerald-800">N° autorizacion: {grupo.numeroAutorizacion ?? '-'}</p>
                                                                        <p className="text-emerald-800">Cantidad total: {grupo.totalCantidad}</p>
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
                                                                                        [grupoKey]: !(prev[grupoKey] ?? false),
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
                                                                                    key={`${grupoKey}-${practica.id}`}
                                                                                    className="rounded border border-emerald-100 bg-white px-2 py-1.5"
                                                                                >
                                                                                    <div className="flex items-center justify-between gap-2 text-emerald-900">
                                                                                        <span className="font-mono text-[11px]">{practica.codigo}</span>
                                                                                        <span className="font-medium">Cant. {practica.cantidad}</span>
                                                                                    </div>
                                                                                    <p className="text-emerald-900">{practica.descripcion}</p>
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
                                                })
                                            )}
                                        </div>
                                    </article>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
