'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Trash2, Scissors, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { crearPedidoLaboratorioAction, generarOrdenesDesdeInternacionAction } from '@/modules/orden/actions'
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

type PracticaFormItem = {
    _key: string
    convenioId: number
    codigoPractica: string
    descripcionPractica: string
    cantidad: number
    importeTotal: number | null
    matriculaEspecialista: number | null
    matriculaAnestesista: number | null
    clasificacion: string
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
    matriculaTratanteDefault?: number | null
}

function normalizarNombreObraSocial(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}


export function CirugiaUrgenciaSection({
    ingresoId,
    pacienteId,
    obraSocialIdInicial,
    planIdInicial,
    obraSocialCoseguroIdInicial,
    numeroAfiliadoInicial,
    puedeCrear,
    obraSociales,
    planes,
    coseguros,
    camasDisponibles,
    cirugias: cirugiasIniciales,
    matriculaTratanteDefault,
}: CirugiaUrgenciaSectionProps) {
    const router = useRouter()

    const [cirugias, setCirugias] = useState<CirugiaUrgenciaItem[]>(cirugiasIniciales)
    const [expandido, setExpandido] = useState(true)
    const [mostrarForm, setMostrarForm] = useState(false)
    const [mostrarPedidoLaboratorio, setMostrarPedidoLaboratorio] = useState(false)
    const [guardando, setGuardando] = useState(false)
    const [guardandoPedidoLaboratorio, setGuardandoPedidoLaboratorio] = useState(false)
    const [generandoOrdenAgrupada, setGenerandoOrdenAgrupada] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [numeroProtocoloLaboratorio, setNumeroProtocoloLaboratorio] = useState('')
    const [diagnosticoLaboratorio, setDiagnosticoLaboratorio] = useState('')

    const [fechaCirugia, setFechaCirugia] = useState(fechaAInputLocal())
    const [horaCirugia, setHoraCirugia] = useState('')
    const [camaId, setCamaId] = useState('')

    const [obraSocialId, setObraSocialId] = useState(obraSocialIdInicial ? String(obraSocialIdInicial) : '')
    const [planId, setPlanId] = useState(planIdInicial ? String(planIdInicial) : '')
    const [obraSocialCoseguroId, setObraSocialCoseguroId] = useState(
        obraSocialCoseguroIdInicial ? String(obraSocialCoseguroIdInicial) : ''
    )
    const [numeroAfiliado, setNumeroAfiliado] = useState(numeroAfiliadoInicial ?? '')

    const [diagnostico, setDiagnostico] = useState('')
    const [observaciones, setObservaciones] = useState('')

    const [practicas, setPracticas] = useState<PracticaFormItem[]>([])
    const [practicasSeleccionadasImpresion, setPracticasSeleccionadasImpresion] = useState<number[]>([])

    const [esFeriado, setEsFeriado] = useState(false)
    const [esNocturna, setEsNocturna] = useState(false)
    const [esCirugiaMultiple, setEsCirugiaMultiple] = useState(false)
    const [mismaViaPatologia, setMismaViaPatologia] = useState(false)
    const [diferentesViasPatologia, setDiferentesViasPatologia] = useState(false)
    const [diferentesViasDiferentesPatologia, setDiferentesViasDiferentesPatologia] = useState(false)

    const obraSocialIdNumero = obraSocialId ? Number.parseInt(obraSocialId, 10) : null
    const obraSocialSeleccionada = obraSociales.find((o) => o.id === obraSocialIdNumero)
    const nombreObraSocialNormalizado = normalizarNombreObraSocial(obraSocialSeleccionada?.nombre ?? '')
    const tokensObraSocial = nombreObraSocialNormalizado.split(' ')
    const esIPSS = tokensObraSocial.includes('IPSS') || tokensObraSocial.includes('IPS')
    const esCoberturaConCoseguro = esIPSS
    const cosegurosDisponibles = esIPSS ? coseguros : []

    const planesFiltrados = useMemo(
        () => planes.filter((p) => !obraSocialIdNumero || p.obraSocialId === obraSocialIdNumero),
        [planes, obraSocialIdNumero]
    )
    const puedeGuardar = useMemo(() => {
        return Boolean(fechaCirugia && practicas.length > 0)
    }, [fechaCirugia, practicas.length])

    const practicaIdsCirugias = useMemo(
        () => cirugias.flatMap((cirugia) => cirugia.practicas.map((practica) => practica.id)),
        [cirugias]
    )
    const setPracticaIdsCirugias = useMemo(
        () => new Set(practicaIdsCirugias),
        [practicaIdsCirugias]
    )
    const practicasSeleccionadasVigentes = useMemo(
        () => practicasSeleccionadasImpresion.filter((id) => setPracticaIdsCirugias.has(id)),
        [practicasSeleccionadasImpresion, setPracticaIdsCirugias]
    )

    const puedeIrAAutorizaciones = cirugias.length > 0

    const guardarPracticasEnBorrador = async (entradas: PracticaCargaEntrada[]) => {
        if (entradas.length === 0) return { ok: false, error: 'No hay practicas para agregar' }

        setPracticas((prev) => [
            ...prev,
            ...entradas.map((entrada) => ({
                _key: `${entrada.payload.convenioId}-${entrada.payload.codigoPractica}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                convenioId: entrada.payload.convenioId,
                codigoPractica: entrada.payload.codigoPractica,
                descripcionPractica: entrada.payload.descripcionPractica,
                cantidad: entrada.payload.cantidad,
                importeTotal: entrada.payload.importeBaseUnitario,
                matriculaEspecialista: entrada.payload.matriculaEspecialista,
                matriculaAnestesista: entrada.payload.matriculaAnestesista,
                clasificacion: entrada.clasificacion,
            })),
        ])

        return { ok: true }
    }

    const quitarPractica = (key: string) => {
        setPracticas((prev) => prev.filter((x) => x._key !== key))
    }

    const limpiarForm = () => {
        setFechaCirugia(fechaAInputLocal())
        setHoraCirugia('')
        setCamaId('')
        setDiagnostico('')
        setObservaciones('')
        setPracticas([])
        setEsFeriado(false)
        setEsNocturna(false)
        setEsCirugiaMultiple(false)
        setMismaViaPatologia(false)
        setDiferentesViasPatologia(false)
        setDiferentesViasDiferentesPatologia(false)
        setError(null)
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

    const generarEImprimirOrdenAgrupada = async () => {
        if (practicasSeleccionadasVigentes.length === 0) {
            setError('Selecciona al menos una practica de cirugia para imprimir en una sola orden')
            return
        }

        setError(null)
        setGenerandoOrdenAgrupada(true)
        try {
            const result = await generarOrdenesDesdeInternacionAction({
                ingresoId,
                practicaIds: practicasSeleccionadasVigentes,
                agruparEnUnaOrden: true,
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

            const idsAsignados = new Set(grupos.flatMap((grupo) => grupo.practicaIds))
            setPracticasSeleccionadasImpresion((prev) => prev.filter((id) => !idsAsignados.has(id)))
            router.push(`/dashboard/ambulatorio/imprimir?ordenes=${encodeURIComponent(ordenesParam)}`)
        } catch {
            setError('No se pudo generar la orden agrupada para impresion')
        } finally {
            setGenerandoOrdenAgrupada(false)
        }
    }

    const limpiarPedidoLaboratorio = () => {
        setNumeroProtocoloLaboratorio('')
        setDiagnosticoLaboratorio('')
    }

    const crearPedidoLaboratorio = async () => {
        const numeroProtocolo = numeroProtocoloLaboratorio.trim()
        const diagnostico = diagnosticoLaboratorio.trim()

        if (!numeroProtocolo) {
            setError('Ingresa el numero de protocolo')
            return
        }

        if (!diagnostico) {
            setError('Ingresa el diagnostico')
            return
        }

        setError(null)
        setGuardandoPedidoLaboratorio(true)
        try {
            const result = await crearPedidoLaboratorioAction({
                ingresoId,
                numeroProtocolo,
                diagnostico,
            })

            if ('error' in result && result.error) {
                setError(result.error)
                return
            }

            limpiarPedidoLaboratorio()
            setMostrarPedidoLaboratorio(false)
            if ('puestoNumero' in result && 'numero' in result) {
                router.push(`/dashboard/ambulatorio/${result.puestoNumero}/${result.numero}`)
                return
            }

            router.refresh()
        } catch {
            setError('No se pudo generar el pedido de laboratorio')
        } finally {
            setGuardandoPedidoLaboratorio(false)
        }
    }

    const guardarCirugiaUrgencia = async () => {
        if (!puedeGuardar) {
            setError('Completa fecha y al menos una practica')
            return
        }

        if (
            esCirugiaMultiple &&
            !mismaViaPatologia &&
            !diferentesViasPatologia &&
            !diferentesViasDiferentesPatologia
        ) {
            setError('Marca al menos una regla para cirugia multiple')
            return
        }

        setError(null)
        setGuardando(true)

        try {
            const practicasExpandida = practicas.map((p) => ({
                convenioId: p.convenioId,
                codigo: p.codigoPractica,
                descripcion: p.descripcionPractica,
                cantidad: p.cantidad,
                importeTotal: p.importeTotal,
                matriculaEspecialista: p.matriculaEspecialista,
                matriculaAnestesista: p.matriculaAnestesista,
            }))

            const res = await fetch(`/api/internacion/${ingresoId}/cirugia-urgencia`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pacienteId,
                    fechaCirugia,
                    horaCirugia: horaCirugia || null,
                    camaId: camaId ? Number.parseInt(camaId, 10) : null,
                    obraSocialId: obraSocialId ? Number.parseInt(obraSocialId, 10) : null,
                    planId: planId ? Number.parseInt(planId, 10) : null,
                    obraSocialCoseguroId: obraSocialCoseguroId
                        && esCoberturaConCoseguro
                        ? Number.parseInt(obraSocialCoseguroId, 10)
                        : null,
                    numeroAfiliado: numeroAfiliado || null,
                    diagnostico: diagnostico || null,
                    observaciones: observaciones || null,
                    practicas: practicasExpandida,
                    diferenciales: {
                        esFeriado,
                        esNocturna,
                        mismaViaPatologia: esCirugiaMultiple && mismaViaPatologia,
                        diferentesViasPatologia: esCirugiaMultiple && diferentesViasPatologia,
                        diferentesViasDiferentesPatologia: esCirugiaMultiple && diferentesViasDiferentesPatologia,
                    },
                }),
            })

            const json = await res.json()
            if (!res.ok) {
                setError(json.error ?? 'No se pudo registrar la cirugia')
                return
            }

            setCirugias((prev) => [json.data, ...prev])
            limpiarForm()
            setMostrarForm(false)
            router.refresh()
        } catch {
            setError('Error de conexion al guardar la cirugia')
        } finally {
            setGuardando(false)
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
                            onClick={() => {
                                setMostrarPedidoLaboratorio((v) => !v)
                                if (mostrarPedidoLaboratorio) limpiarPedidoLaboratorio()
                            }}
                            className="flex items-center gap-1 text-xs font-medium text-indigo-700 hover:text-indigo-800 border border-indigo-200 rounded-lg px-2.5 py-1 hover:bg-indigo-50"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Nuevo pedido de laboratorio
                        </button>
                        {puedeIrAAutorizaciones && (
                            <Link
                                href={`/dashboard/ambulatorio/nueva?ingresoId=${ingresoId}`}
                                className="flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 border border-emerald-200 rounded-lg px-2.5 py-1 hover:bg-emerald-50"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                Generar autorizacion
                            </Link>
                        )}
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

                    {mostrarPedidoLaboratorio && puedeCrear && (
                        <div className="space-y-3 border border-indigo-100 bg-indigo-50/40 rounded-xl p-4">
                            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                                Nuevo pedido de laboratorio
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Numero de protocolo</label>
                                    <input
                                        type="text"
                                        value={numeroProtocoloLaboratorio}
                                        onChange={(e) => setNumeroProtocoloLaboratorio(e.target.value)}
                                        placeholder="Ej: 123456"
                                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Diagnostico</label>
                                    <input
                                        type="text"
                                        value={diagnosticoLaboratorio}
                                        onChange={(e) => setDiagnosticoLaboratorio(e.target.value)}
                                        placeholder="Diagnostico clinico"
                                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => void crearPedidoLaboratorio()}
                                    disabled={guardandoPedidoLaboratorio}
                                    className="flex items-center gap-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg px-3 py-1.5 hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    {guardandoPedidoLaboratorio ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                    Generar orden
                                </button>
                                <button
                                    type="button"
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

                    {mostrarForm && puedeCrear && (
                        <div className="space-y-4 border border-blue-100 bg-blue-50/40 rounded-xl p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Obra Social</label>
                                    <select
                                        value={obraSocialId}
                                        onChange={(e) => {
                                            setObraSocialId(e.target.value)
                                            setPlanId('')
                                            setObraSocialCoseguroId('')
                                        }}
                                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                    >
                                        <option value="">-- Seleccionar obra social --</option>
                                        {obraSociales.map((os) => (
                                            <option key={os.id} value={String(os.id)}>
                                                {os.nombre}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Plan</label>
                                    <select
                                        value={planId}
                                        onChange={(e) => setPlanId(e.target.value)}
                                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                    >
                                        <option value="">-- Seleccionar plan --</option>
                                        {planesFiltrados.map((plan) => (
                                            <option key={plan.id} value={String(plan.id)}>
                                                {plan.nombre}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Numero de afiliado</label>
                                    <input
                                        type="text"
                                        value={numeroAfiliado}
                                        onChange={(e) => setNumeroAfiliado(e.target.value)}
                                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                        placeholder="123456789"
                                    />
                                </div>

                                {esCoberturaConCoseguro && (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Coseguro</label>
                                        <select
                                            value={obraSocialCoseguroId}
                                            onChange={(e) => setObraSocialCoseguroId(e.target.value)}
                                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                        >
                                            <option value="">-- Sin coseguro --</option>
                                            {cosegurosDisponibles.map((c) => (
                                                <option key={c.id} value={String(c.id)}>
                                                    {c.nombre}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Diagnostico</label>
                                <textarea
                                    value={diagnostico}
                                    onChange={(e) => setDiagnostico(e.target.value)}
                                    rows={2}
                                    maxLength={500}
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-none"
                                    placeholder="Diagnostico o motivo clinico"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Observaciones</label>
                                <textarea
                                    value={observaciones}
                                    onChange={(e) => setObservaciones(e.target.value)}
                                    rows={2}
                                    maxLength={2000}
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-none"
                                    placeholder="Observaciones clinicas y administrativas"
                                />
                            </div>

                            <div className="space-y-3">
                                <PracticaCargaForm
                                    convenioId={obraSocialIdNumero}
                                    matriculaTratanteDefault={matriculaTratanteDefault}
                                    onGuardar={guardarPracticasEnBorrador}
                                    titulo="Nueva practica"
                                />

                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Practicas agregadas a la cirugia</label>
                                    {practicas.length > 0 ? (
                                        <div className="divide-y border rounded-md bg-white">
                                            {practicas.map((p) => (
                                                <div key={p._key} className="flex items-center gap-2 px-3 py-2 text-xs">
                                                    <span className="font-mono text-gray-500 w-20 shrink-0">{p.codigoPractica.trim()}</span>
                                                    <span className="flex-1 text-gray-800">{p.descripcionPractica}</span>
                                                    <span className="text-gray-500">Cant: {p.cantidad}</span>
                                                    {p.clasificacion && (
                                                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                                                            {p.clasificacion}
                                                        </span>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => quitarPractica(p._key)}
                                                        className="text-red-400 hover:text-red-600"
                                                        title="Quitar practica"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-gray-400">No se han agregado practicas.</p>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
                                    <input
                                        type="date"
                                        value={fechaCirugia}
                                        onChange={(e) => setFechaCirugia(e.target.value)}
                                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Hora</label>
                                    <input
                                        type="time"
                                        value={horaCirugia}
                                        onChange={(e) => setHoraCirugia(e.target.value)}
                                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Cama internacion</label>
                                    <select
                                        value={camaId}
                                        onChange={(e) => setCamaId(e.target.value)}
                                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                    >
                                        <option value="">-- Seleccionar cama (opcional) --</option>
                                        {camasDisponibles.map((cama) => (
                                            <option key={cama.id} value={String(cama.id)}>
                                                {cama.identificador} ({cama.sector})
                                                {cama.habitacion ? ` - Hab. ${cama.habitacion}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-2 gap-x-4 text-sm text-gray-700">
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={esFeriado}
                                        onChange={(e) => setEsFeriado(e.target.checked)}
                                        className="w-4 h-4 text-blue-600 rounded"
                                    />
                                    Es feriado
                                </label>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={esNocturna}
                                        onChange={(e) => setEsNocturna(e.target.checked)}
                                        className="w-4 h-4 text-blue-600 rounded"
                                    />
                                    Cirugia nocturna
                                </label>
                                <label className="flex items-center gap-2 md:col-span-2">
                                    <input
                                        type="checkbox"
                                        checked={esCirugiaMultiple}
                                        onChange={(e) => {
                                            const checked = e.target.checked
                                            setEsCirugiaMultiple(checked)
                                            if (!checked) {
                                                setMismaViaPatologia(false)
                                                setDiferentesViasPatologia(false)
                                                setDiferentesViasDiferentesPatologia(false)
                                            }
                                        }}
                                        className="w-4 h-4 text-blue-600 rounded"
                                    />
                                    Cirugia multiple
                                </label>

                                {esCirugiaMultiple && (
                                    <>
                                        <label className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={mismaViaPatologia}
                                                onChange={(e) => setMismaViaPatologia(e.target.checked)}
                                                className="w-4 h-4 text-blue-600 rounded"
                                            />
                                            Misma via, diferentes patologias
                                        </label>
                                        <label className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={diferentesViasPatologia}
                                                onChange={(e) => setDiferentesViasPatologia(e.target.checked)}
                                                className="w-4 h-4 text-blue-600 rounded"
                                            />
                                            Diferentes vias, misma patologia
                                        </label>
                                        <label className="flex items-center gap-2 md:col-span-2">
                                            <input
                                                type="checkbox"
                                                checked={diferentesViasDiferentesPatologia}
                                                onChange={(e) => setDiferentesViasDiferentesPatologia(e.target.checked)}
                                                className="w-4 h-4 text-blue-600 rounded"
                                            />
                                            Diferentes vias, diferentes patologias
                                        </label>
                                    </>
                                )}
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t border-blue-100">
                                <button
                                    type="button"
                                    onClick={() => {
                                        limpiarForm()
                                        setMostrarForm(false)
                                    }}
                                    className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                    disabled={guardando}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void guardarCirugiaUrgencia()}
                                    disabled={guardando || !puedeGuardar}
                                    className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {guardando ? 'Guardando...' : 'Registrar cirugia'}
                                </button>
                            </div>
                        </div>
                    )}

                    {cirugias.length === 0 ? (
                        <p className="text-sm text-gray-500">No hay cirugias registradas.</p>
                    ) : (
                        <div className="space-y-3">
                            {puedeCrear && (
                                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                                    <div className="text-xs text-emerald-800">
                                        Practicas seleccionadas para una sola orden: {practicasSeleccionadasVigentes.length}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => alternarSeleccionTodasCirugia(practicaIdsCirugias, true)}
                                            disabled={practicaIdsCirugias.length === 0 || generandoOrdenAgrupada}
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
                                            onClick={() => void generarEImprimirOrdenAgrupada()}
                                            disabled={practicasSeleccionadasVigentes.length === 0 || generandoOrdenAgrupada}
                                            className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                        >
                                            {generandoOrdenAgrupada && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                            {generandoOrdenAgrupada ? 'Generando...' : 'Imprimir en una sola orden'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {cirugias.map((c) => {
                                const practicaIdsCirugia = c.practicas.map((practica) => practica.id)
                                const todasSeleccionadasCirugia =
                                    practicaIdsCirugia.length > 0
                                    && practicaIdsCirugia.every((id) => practicasSeleccionadasVigentes.includes(id))

                                return (
                                    <article key={c.id} className="border rounded-lg p-3 bg-white space-y-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b">
                                            <p className="text-sm font-medium text-gray-900">
                                                {formatearFechaArgentina(c.fechaCirugia)} {c.horaCirugia ? ` ${c.horaCirugia}` : ''}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-500">Cirugia #{c.id}</span>
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
                                                                            onChange={(e) => alternarSeleccionTodasCirugia(practicaIdsCirugia, e.target.checked)}
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
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={practicasSeleccionadasVigentes.includes(p.id)}
                                                                                onChange={(e) => alternarSeleccionPracticaCirugia(p.id, e.target.checked)}
                                                                                className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-700 focus:ring-emerald-500"
                                                                            />
                                                                        </td>
                                                                    )}
                                                                    <td className="px-2 py-1 border-b font-mono">{p.codigo}</td>
                                                                    <td className="px-2 py-1 border-b">{p.descripcion}</td>
                                                                    <td className="px-2 py-1 border-b text-right">{String(Number(p.cantidad))}</td>
                                                                    <td className="px-2 py-1 border-b">{p.numeroAutorizacion ?? '-'}</td>
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
