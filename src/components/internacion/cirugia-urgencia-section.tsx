'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Search, Trash2, Scissors, ChevronDown, ChevronUp } from 'lucide-react'
import {
    ComponenteSelector,
    calcularTotalSeleccionado,
    seleccionPorDefecto,
    type ComponenteSeleccion,
    type ComponenteValores,
} from '@/components/ui/componente-selector'

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

type NomencladorPracticaItem = {
    convenioId: number
    codigo: string
    descripcion: string
    valor?: number | null
    valorEspecialista?: number | null
    valorAyudante?: number | null
    valorAnestesista?: number | null
    valorGastos?: number | null
}

type PracticaFormItem = {
    _key: string
    convenioId: number
    codigo: string
    descripcion: string
    cantidad: number
    requiereMatriculaEspecialista: boolean
    requiereMatriculaAnestesista: boolean
    matriculaEspecialista: number | null
    matriculaAnestesista: number | null
    desglose: ComponenteValores
    seleccionComponentes: ComponenteSeleccion
}

const MATRICULA_ANESTESISTA_DEFAULT = 6

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
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [fechaCirugia, setFechaCirugia] = useState(new Date().toISOString().slice(0, 10))
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

    const [terminoBusquedaPractica, setTerminoBusquedaPractica] = useState('')
    const [buscandoPractica, setBuscandoPractica] = useState(false)
    const [resultadosPractica, setResultadosPractica] = useState<NomencladorPracticaItem[]>([])
    const [practicas, setPracticas] = useState<PracticaFormItem[]>([])

    const [esFeriado, setEsFeriado] = useState(false)
    const [esNocturna, setEsNocturna] = useState(false)
    const [mismaViaPatologia, setMismaViaPatologia] = useState(false)
    const [diferentesViasPatologia, setDiferentesViasPatologia] = useState(false)
    const [diferentesViasDiferentesPatologia, setDiferentesViasDiferentesPatologia] = useState(false)

    const obraSocialIdNumero = obraSocialId ? Number.parseInt(obraSocialId, 10) : null
    const obraSocialSeleccionada = obraSociales.find((o) => o.id === obraSocialIdNumero)
    const esIPSS = obraSocialSeleccionada?.nombre?.toUpperCase().includes('IPSS') ?? false

    const planesFiltrados = useMemo(
        () => planes.filter((p) => !obraSocialIdNumero || p.obraSocialId === obraSocialIdNumero),
        [planes, obraSocialIdNumero]
    )

    const puedeGuardar = useMemo(() => {
        return Boolean(fechaCirugia && practicas.length > 0)
    }, [fechaCirugia, practicas.length])

    const puedeIrAAutorizaciones = cirugias.length > 0

    const buscarPracticaNomenclador = async (termino: string) => {
        if (!obraSocialIdNumero || termino.trim().length < 2) {
            setResultadosPractica([])
            return
        }

        setBuscandoPractica(true)
        try {
            const qs = new URLSearchParams({
                q: termino.trim(),
                convenioId: String(obraSocialIdNumero),
            })
            const res = await fetch(`/api/practicas-nomenclador?${qs.toString()}`)
            const json = await res.json()
            setResultadosPractica(Array.isArray(json.data) ? json.data : [])
        } catch {
            setResultadosPractica([])
            setError('No se pudo buscar prácticas en el nomenclador')
        } finally {
            setBuscandoPractica(false)
        }
    }

    const agregarPractica = (p: NomencladorPracticaItem) => {
        setPracticas((prev) => {
            const existe = prev.find((x) => x.codigo.trim() === p.codigo.trim())
            if (existe) {
                return prev.map((x) =>
                    x.codigo.trim() === p.codigo.trim() ? { ...x, cantidad: x.cantidad + 1 } : x
                )
            }

            return [
                ...prev,
                {
                    _key: `${p.convenioId}-${p.codigo}-${Date.now()}`,
                    convenioId: p.convenioId,
                    codigo: p.codigo.trim().slice(0, 50),
                    descripcion: p.descripcion,
                    cantidad: 1,
                    requiereMatriculaEspecialista: Number(p.valorEspecialista ?? 0) > 0,
                    requiereMatriculaAnestesista: Number(p.valorAnestesista ?? 0) > 0,
                    matriculaEspecialista: matriculaTratanteDefault ?? null,
                    matriculaAnestesista: MATRICULA_ANESTESISTA_DEFAULT,
                    desglose: {
                        valorEspecialista: p.valorEspecialista ?? null,
                        valorAyudante: p.valorAyudante ?? null,
                        valorAnestesista: p.valorAnestesista ?? null,
                        valorGastos: p.valorGastos ?? null,
                        valorTotal: p.valor ?? null,
                    },
                    seleccionComponentes: seleccionPorDefecto({
                        valorEspecialista: p.valorEspecialista ?? null,
                        valorAyudante: p.valorAyudante ?? null,
                        valorAnestesista: p.valorAnestesista ?? null,
                        valorGastos: p.valorGastos ?? null,
                        valorTotal: p.valor ?? null,
                    }),
                },
            ]
        })

        setResultadosPractica([])
        setTerminoBusquedaPractica('')
    }

    const quitarPractica = (key: string) => {
        setPracticas((prev) => prev.filter((x) => x._key !== key))
    }

    const limpiarForm = () => {
        setFechaCirugia(new Date().toISOString().slice(0, 10))
        setHoraCirugia('')
        setCamaId('')
        setDiagnostico('')
        setObservaciones('')
        setTerminoBusquedaPractica('')
        setResultadosPractica([])
        setPracticas([])
        setEsFeriado(false)
        setEsNocturna(false)
        setMismaViaPatologia(false)
        setDiferentesViasPatologia(false)
        setDiferentesViasDiferentesPatologia(false)
        setError(null)
    }

    const guardarCirugiaUrgencia = async () => {
        if (!puedeGuardar) {
            setError('Completá fecha y al menos una práctica')
            return
        }

        const practicaSinMatricula = practicas.find(
            (p) =>
                (p.requiereMatriculaEspecialista &&
                    p.seleccionComponentes.especialista > 0 &&
                    !p.matriculaEspecialista) ||
                (p.requiereMatriculaAnestesista &&
                    p.seleccionComponentes.anestesista > 0 &&
                    !p.matriculaAnestesista)
        )
        if (practicaSinMatricula) {
            setError('Complete matrícula en prácticas con HE/HA antes de registrar la cirugía')
            return
        }

        setError(null)
        setGuardando(true)

        try {
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
                        ? Number.parseInt(obraSocialCoseguroId, 10)
                        : null,
                    numeroAfiliado: numeroAfiliado || null,
                    diagnostico: diagnostico || null,
                    observaciones: observaciones || null,
                    practicas: practicas.map((p) => ({
                        convenioId: p.convenioId,
                        codigo: p.codigo,
                        descripcion: p.descripcion,
                        cantidad: p.cantidad,
                        importeTotal: Number(
                            (
                                calcularTotalSeleccionado(p.desglose, p.seleccionComponentes) *
                                p.cantidad
                            ).toFixed(2)
                        ),
                        matriculaEspecialista:
                            p.seleccionComponentes.especialista > 0 ? p.matriculaEspecialista : null,
                        matriculaAnestesista:
                            p.seleccionComponentes.anestesista > 0 ? p.matriculaAnestesista : null,
                    })),
                    diferenciales: {
                        esFeriado,
                        esNocturna,
                        mismaViaPatologia,
                        diferentesViasPatologia,
                        diferentesViasDiferentesPatologia,
                    },
                }),
            })

            const json = await res.json()
            if (!res.ok) {
                setError(json.error ?? 'No se pudo registrar la cirugía de urgencia')
                return
            }

            setCirugias((prev) => [json.data, ...prev])
            limpiarForm()
            setMostrarForm(false)
            router.refresh()
        } catch {
            setError('Error de conexión al guardar la cirugía de urgencia')
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
                    Cirugía de urgencia
                    <span className="text-xs font-normal text-gray-400 ml-1">({cirugias.length})</span>
                    {expandido ? (
                        <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
                    ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                    )}
                </button>

                {puedeCrear && (
                    <div className="flex items-center gap-2">
                        {puedeIrAAutorizaciones && (
                            <Link
                                href={`/dashboard/ambulatorio/nueva?ingresoId=${ingresoId}`}
                                className="flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 border border-emerald-200 rounded-lg px-2.5 py-1 hover:bg-emerald-50"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                Generar autorización
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
                                                {os.requiereCoseguro ? ' (requiere coseguro)' : ''}
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
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Número de afiliado</label>
                                    <input
                                        type="text"
                                        value={numeroAfiliado}
                                        onChange={(e) => setNumeroAfiliado(e.target.value)}
                                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                        placeholder="123456789"
                                    />
                                </div>

                                {esIPSS && (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Coseguro (solo IPSS)</label>
                                        <select
                                            value={obraSocialCoseguroId}
                                            onChange={(e) => setObraSocialCoseguroId(e.target.value)}
                                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                                        >
                                            <option value="">-- Sin coseguro --</option>
                                            {coseguros.map((c) => (
                                                <option key={c.id} value={String(c.id)}>
                                                    {c.nombre}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Diagnóstico</label>
                                <textarea
                                    value={diagnostico}
                                    onChange={(e) => setDiagnostico(e.target.value)}
                                    rows={2}
                                    maxLength={500}
                                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-none"
                                    placeholder="Diagnóstico o motivo clínico"
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
                                    placeholder="Observaciones clínicas y administrativas"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Prácticas</label>
                                <div className="flex gap-2 mb-2">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <input
                                            type="text"
                                            value={terminoBusquedaPractica}
                                            onChange={(e) => setTerminoBusquedaPractica(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault()
                                                    void buscarPracticaNomenclador(terminoBusquedaPractica)
                                                }
                                            }}
                                            placeholder="Buscar por código o descripción"
                                            className="w-full rounded-md border border-gray-300 pl-8 pr-3 py-2 text-sm"
                                            disabled={!obraSocialIdNumero}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => void buscarPracticaNomenclador(terminoBusquedaPractica)}
                                        disabled={buscandoPractica || terminoBusquedaPractica.trim().length < 2 || !obraSocialIdNumero}
                                        className="rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                                    >
                                        {buscandoPractica ? 'Buscando...' : 'Buscar'}
                                    </button>
                                </div>

                                {resultadosPractica.length > 0 && (
                                    <div className="mb-3 rounded-md border bg-white shadow-sm max-h-44 overflow-y-auto divide-y">
                                        {resultadosPractica.map((p) => (
                                            <button
                                                key={`${p.convenioId}-${p.codigo}`}
                                                type="button"
                                                onClick={() => agregarPractica(p)}
                                                className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors text-sm"
                                            >
                                                <span className="font-mono text-xs text-gray-500 mr-2">{p.codigo}</span>
                                                {p.descripcion}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {practicas.length > 0 ? (
                                    <div className="divide-y border rounded-md bg-white">
                                        {practicas.map((p) => (
                                            <div key={p._key} className="px-3 py-3 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-xs text-gray-500 w-20 shrink-0">{p.codigo}</span>
                                                    <span className="flex-1 text-sm text-gray-800">{p.descripcion}</span>

                                                    <input
                                                        type="number"
                                                        min={1}
                                                        value={p.cantidad}
                                                        onChange={(e) => {
                                                            const value = Number.parseInt(e.target.value, 10)
                                                            setPracticas((prev) =>
                                                                prev.map((x) =>
                                                                    x._key === p._key
                                                                        ? { ...x, cantidad: Number.isFinite(value) ? Math.max(1, value) : 1 }
                                                                        : x
                                                                )
                                                            )
                                                        }}
                                                        className="w-14 rounded border border-gray-300 px-2 py-1 text-xs text-center"
                                                    />

                                                    {p.requiereMatriculaEspecialista && (
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            value={p.matriculaEspecialista ?? ''}
                                                            onChange={(e) => {
                                                                const value = e.target.value.trim()
                                                                setPracticas((prev) =>
                                                                    prev.map((x) =>
                                                                        x._key === p._key
                                                                            ? {
                                                                                ...x,
                                                                                matriculaEspecialista: value ? Number.parseInt(value, 10) || null : null,
                                                                            }
                                                                            : x
                                                                    )
                                                                )
                                                            }}
                                                            className="w-24 rounded border border-gray-300 px-2 py-1 text-xs"
                                                            placeholder="Mat. HE"
                                                        />
                                                    )}

                                                    {p.requiereMatriculaAnestesista && (
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            value={p.matriculaAnestesista ?? ''}
                                                            onChange={(e) => {
                                                                const value = e.target.value.trim()
                                                                setPracticas((prev) =>
                                                                    prev.map((x) =>
                                                                        x._key === p._key
                                                                            ? {
                                                                                ...x,
                                                                                matriculaAnestesista: value ? Number.parseInt(value, 10) || null : null,
                                                                            }
                                                                            : x
                                                                    )
                                                                )
                                                            }}
                                                            className="w-24 rounded border border-gray-300 px-2 py-1 text-xs"
                                                            placeholder="Mat. HA"
                                                        />
                                                    )}

                                                    <button
                                                        type="button"
                                                        onClick={() => quitarPractica(p._key)}
                                                        className="text-red-400 hover:text-red-600"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>

                                                <ComponenteSelector
                                                    valores={p.desglose}
                                                    seleccion={p.seleccionComponentes}
                                                    onChange={(nuevaSeleccion) => {
                                                        setPracticas((prev) =>
                                                            prev.map((x) =>
                                                                x._key === p._key
                                                                    ? { ...x, seleccionComponentes: nuevaSeleccion }
                                                                    : x
                                                            )
                                                        )
                                                    }}
                                                    disabled={guardando}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-400">No se han agregado prácticas.</p>
                                )}
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
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Cama internación</label>
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
                                    Cirugía nocturna
                                </label>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={mismaViaPatologia}
                                        onChange={(e) => setMismaViaPatologia(e.target.checked)}
                                        className="w-4 h-4 text-blue-600 rounded"
                                    />
                                    Misma vía, diferentes patologías
                                </label>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={diferentesViasPatologia}
                                        onChange={(e) => setDiferentesViasPatologia(e.target.checked)}
                                        className="w-4 h-4 text-blue-600 rounded"
                                    />
                                    Diferentes vías, misma patología
                                </label>
                                <label className="flex items-center gap-2 md:col-span-2">
                                    <input
                                        type="checkbox"
                                        checked={diferentesViasDiferentesPatologia}
                                        onChange={(e) => setDiferentesViasDiferentesPatologia(e.target.checked)}
                                        className="w-4 h-4 text-blue-600 rounded"
                                    />
                                    Diferentes vías, diferentes patologías
                                </label>
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
                                    {guardando ? 'Guardando...' : 'Registrar cirugía de urgencia'}
                                </button>
                            </div>
                        </div>
                    )}

                    {cirugias.length === 0 ? (
                        <p className="text-sm text-gray-500">No hay cirugías de urgencia registradas.</p>
                    ) : (
                        <div className="space-y-3">
                            {cirugias.map((c) => (
                                <div key={c.id} className="border rounded-lg p-3 bg-white">
                                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                        <p className="text-sm font-medium text-gray-900">
                                            {new Date(c.fechaCirugia).toLocaleDateString('es-AR')} {c.horaCirugia ? `· ${c.horaCirugia}` : ''}
                                        </p>
                                        <span className="text-xs text-gray-500">Cirugía #{c.id}</span>
                                    </div>
                                    {c.cama && (
                                        <p className="text-xs text-gray-600 mb-1">
                                            Cama: {c.cama.identificador} ({c.cama.sector})
                                            {c.cama.habitacion ? ` - Hab. ${c.cama.habitacion}` : ''}
                                        </p>
                                    )}
                                    {c.practicas.length > 0 && (
                                        <ul className="text-xs text-gray-700 space-y-1">
                                            {c.practicas.map((p) => (
                                                <li key={p.id}>
                                                    {p.codigo} - {p.descripcion} · Cant. {p.cantidad}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
