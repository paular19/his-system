'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Scissors, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { generarOrdenesDesdeInternacionAction } from '@/modules/orden/actions'
import { fechaAInputLocal, formatearFechaArgentina } from '@/lib/utils/argentina-date'
import { PracticaCargaForm, type PracticaCargaEntrada } from '@/components/internacion/practica-carga-form'

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
    ordenPractica: Array<{
        puestoNumero: number
        ordenNumero: number
        item: number
        numeroAutorizacion: string | null
    }>
}

type EstadoPracticaCirugia = {
    practicaInternacionIdPendiente: number | null
    ordenesGeneradas: Array<{
        puestoNumero: number
        ordenNumero: number
        item: number
        numeroAutorizacion: string | null
    }>
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

    useEffect(() => {
        setCirugias(cirugiasIniciales)
    }, [cirugiasIniciales])

    const practicaIdsCirugias = useMemo(
        () => cirugias.flatMap((cirugia) => cirugia.practicas.map((practica) => practica.id)),
        [cirugias]
    )

    const estadoPracticaCirugiaPorId = useMemo(() => {
        const practicasCirugiaOrdenadas = cirugias.flatMap((cirugia) =>
            cirugia.practicas.map((practica) => ({
                practicaIdCirugia: practica.id,
                codigo: practica.codigo.trim().toUpperCase(),
            }))
        )

        const pendientesPorCodigo = new Map<string, number[]>()
        const ordenadasPorCodigo = new Map<
            string,
            Array<{
                puestoNumero: number
                ordenNumero: number
                item: number
                numeroAutorizacion: string | null
            }>
        >()

        for (const practica of practicasInternacion) {
            const estado = (practica.estado ?? 'A').trim().toUpperCase()
            if (estado === 'X') continue

            const codigo = practica.codigoPractica.trim().toUpperCase()
            if ((practica.ordenPractica?.length ?? 0) === 0) {
                const pendientes = pendientesPorCodigo.get(codigo) ?? []
                pendientes.push(practica.id)
                pendientesPorCodigo.set(codigo, pendientes)
                continue
            }

            const ordenes = ordenadasPorCodigo.get(codigo) ?? []
            ordenes.push(...practica.ordenPractica)
            ordenadasPorCodigo.set(codigo, ordenes)
        }

        const estadoPorId = new Map<number, EstadoPracticaCirugia>()

        for (const practica of practicasCirugiaOrdenadas) {
            const pendientes = pendientesPorCodigo.get(practica.codigo) ?? []
            const practicaInternacionIdPendiente = pendientes.shift() ?? null
            pendientesPorCodigo.set(practica.codigo, pendientes)

            const ordenesDisponibles = ordenadasPorCodigo.get(practica.codigo) ?? []
            const ordenesGeneradas = practicaInternacionIdPendiente == null && ordenesDisponibles.length > 0
                ? [ordenesDisponibles.shift()!]
                : []
            ordenadasPorCodigo.set(practica.codigo, ordenesDisponibles)

            estadoPorId.set(practica.practicaIdCirugia, {
                practicaInternacionIdPendiente,
                ordenesGeneradas,
            })
        }

        return estadoPorId
    }, [cirugias, practicasInternacion])

    const practicaIdsPendientesCirugia = useMemo(
        () => practicaIdsCirugias.filter((id) => (estadoPracticaCirugiaPorId.get(id)?.practicaInternacionIdPendiente ?? null) != null),
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

        const printWindow =
            imprimirDespues && typeof window !== 'undefined'
                ? window.open('about:blank', '_blank')
                : null

        const practicasCirugiaSeleccionadas = cirugias
            .flatMap((cirugia) => cirugia.practicas)
            .filter((practica) => practicasSeleccionadasVigentes.includes(practica.id))

        const practicaIdInternacionPorPracticaCirugiaId = new Map<number, number>()
        for (const practicaCirugia of practicasCirugiaSeleccionadas) {
            const practicaIdInternacion =
                estadoPracticaCirugiaPorId.get(practicaCirugia.id)?.practicaInternacionIdPendiente ?? null
            if (practicaIdInternacion == null) {
                continue
            }
            practicaIdInternacionPorPracticaCirugiaId.set(practicaCirugia.id, practicaIdInternacion)
        }

        const practicaIdsInternacionSeleccionadas = practicasSeleccionadasVigentes
            .map((id) => practicaIdInternacionPorPracticaCirugiaId.get(id) ?? null)
            .filter((id): id is number => id != null)

        if (practicaIdsInternacionSeleccionadas.length === 0) {
            setError('No se encontraron practicas pendientes de internacion para la seleccion de cirugia')
            printWindow?.close()
            return
        }

        setError(null)
        setGenerandoOrdenAgrupada(true)
        try {
            const result = await generarOrdenesDesdeInternacionAction({
                ingresoId,
                practicaIds: practicaIdsInternacionSeleccionadas,
                agruparEnUnaOrden: true,
            })

            if ('error' in result && result.error) {
                setError(result.error)
                printWindow?.close()
                return
            }

            const grupos = Array.isArray((result as { ordenesPorGrupo?: unknown }).ordenesPorGrupo)
                ? ((result as {
                    ordenesPorGrupo: Array<{ puestoNumero: number; numero: number; practicaIds: number[] }>
                }).ordenesPorGrupo)
                : []

            if (grupos.length === 0) {
                setError('No se generaron ordenes para las practicas seleccionadas')
                printWindow?.close()
                return
            }

            const ordenesParam = grupos
                .map((orden) => `${orden.puestoNumero}-${orden.numero}`)
                .join(',')

            const idsAsignadosInternacion = new Set(grupos.flatMap((grupo) => grupo.practicaIds))
            const idsAsignadosCirugia = new Set<number>()
            for (const [practicaIdCirugia, practicaIdInternacion] of practicaIdInternacionPorPracticaCirugiaId.entries()) {
                if (idsAsignadosInternacion.has(practicaIdInternacion)) {
                    idsAsignadosCirugia.add(practicaIdCirugia)
                }
            }

            setPracticasSeleccionadasImpresion((prev) => prev.filter((id) => !idsAsignadosCirugia.has(id)))

            if (imprimirDespues) {
                const url = `/dashboard/ambulatorio/imprimir?ordenes=${encodeURIComponent(ordenesParam)}`
                if (printWindow) {
                    printWindow.location.assign(url)
                } else if (typeof window !== 'undefined') {
                    window.open(url, '_blank')
                }
                router.refresh()
                return
            }

            router.refresh()
        } catch {
            setError('No se pudo generar la orden agrupada')
            printWindow?.close()
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
                                    <div className="text-xs text-emerald-800">
                                        Practicas seleccionadas para generar una sola orden: {practicasSeleccionadasVigentes.length}
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
                                const practicaIdsCirugia = c.practicas.map((practica) => practica.id)
                                const practicaIdsPendientesCirugiaItem = practicaIdsCirugia.filter(
                                    (id) => (estadoPracticaCirugiaPorId.get(id)?.practicaInternacionIdPendiente ?? null) != null
                                )
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
                                                    className="text-xs font-medium text-blue-700 border border-blue-200 rounded-md px-2 py-1 hover:bg-blue-50"
                                                >
                                                    Ver ficha quirurgica
                                                </Link>
                                            </div>
                                        </div>

                                        <div>
                                            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Practicas</p>
                                            {c.practicas.length === 0 ? (
                                                <p className="text-xs text-gray-500">Sin practicas registradas.</p>
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
                                                            {c.practicas.map((p) => (
                                                                <tr key={p.id} className="text-gray-700">
                                                                    {puedeCrear && (
                                                                        <td className="px-2 py-1 border-b align-middle">
                                                                            {(() => {
                                                                                const estadoPractica = estadoPracticaCirugiaPorId.get(p.id)
                                                                                const esPendiente = (estadoPractica?.practicaInternacionIdPendiente ?? null) != null
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
                                                                    <td className="px-2 py-1 border-b">
                                                                        {(() => {
                                                                            const estadoPractica = estadoPracticaCirugiaPorId.get(p.id)
                                                                            const primeraOrden = estadoPractica?.ordenesGeneradas?.[0]

                                                                            if (p.numeroAutorizacion) return p.numeroAutorizacion
                                                                            if (primeraOrden) {
                                                                                return `Orden ${primeraOrden.puestoNumero}-${primeraOrden.ordenNumero}`
                                                                            }
                                                                            return 'Pendiente'
                                                                        })()}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
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
