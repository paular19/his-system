'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, Trash2 } from 'lucide-react'
import { BuscarPaciente } from '@/components/admision/buscar-paciente'
import { crearCirugiaProgramadaAction } from '@/modules/cirugia/actions'
import {
    ComponenteSelector,
    calcularTotalSeleccionado,
    seleccionPorDefecto,
    type ComponenteSeleccion,
    type ComponenteValores,
} from '@/components/ui/componente-selector'
import type { PacienteResumen } from '@/modules/admision/types'

interface ObraSocialOption {
    id: number
    nombre: string
    requiereCoseguro: boolean
}

interface PlanOption {
    id: number
    nombre: string
    obraSocialId: number | null
}

interface CoseguroOption {
    id: number
    nombre: string
}

interface NomencladorPracticaItem {
    convenioId: number
    codigo: string
    descripcion: string
    valorEspecialista?: number | null
    valorAyudante?: number | null
    valorAnestesista?: number | null
    valorGastos?: number | null
}

interface PracticaFormItem {
    _key: string
    convenioId: number
    codigo: string
    descripcion: string
    cantidad: number
    seleccionada: boolean
    desglose: ComponenteValores
    seleccionComponentes: ComponenteSeleccion
    requiereMatriculaEspecialista: boolean
    requiereMatriculaAnestesista: boolean
    matriculaEspecialista: number | null
    matriculaAnestesista: number | null
}

interface MedicacionFormItem {
    nombre: string
    dosis: string
    viaAdministracion: string
    frecuencia: string
    observaciones: string
}

interface DescartableFormItem {
    nombre: string
    cantidad: number
    observaciones: string
}

interface CirugiaProgramadaFormProps {
    obraSociales: ObraSocialOption[]
    planes: PlanOption[]
    coseguros: CoseguroOption[]
}

export function CirugiaProgramadaForm({
    obraSociales,
    planes,
    coseguros,
}: CirugiaProgramadaFormProps) {
    const router = useRouter()
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [paciente, setPaciente] = useState<PacienteResumen | null>(null)
    const [fechaCirugia, setFechaCirugia] = useState(new Date().toISOString().slice(0, 10))

    const [obraSocialId, setObraSocialId] = useState('')
    const [planId, setPlanId] = useState('')
    const [obraSocialCoseguroId, setObraSocialCoseguroId] = useState('')
    const [numeroAfiliado, setNumeroAfiliado] = useState('')

    const [diagnostico, setDiagnostico] = useState('')
    const [observaciones, setObservaciones] = useState('')

    const [terminoBusquedaPractica, setTerminoBusquedaPractica] = useState('')
    const [buscandoPractica, setBuscandoPractica] = useState(false)
    const [resultadosPractica, setResultadosPractica] = useState<NomencladorPracticaItem[]>([])
    const [practicas, setPracticas] = useState<PracticaFormItem[]>([])
    const [medicaciones, setMedicaciones] = useState<MedicacionFormItem[]>([])
    const [nuevaMedNombre, setNuevaMedNombre] = useState('')
    const [nuevaMedDosis, setNuevaMedDosis] = useState('')
    const [nuevaMedVia, setNuevaMedVia] = useState('')
    const [nuevaMedFrecuencia, setNuevaMedFrecuencia] = useState('')
    const [nuevaMedObs, setNuevaMedObs] = useState('')
    const [buscandoMedicamentoCatalogo, setBuscandoMedicamentoCatalogo] = useState(false)
    const [resultadosMedicamentoCatalogo, setResultadosMedicamentoCatalogo] = useState<Array<{ id: number; nombre: string }>>([])
    const medicamentoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [descartables, setDescartables] = useState<DescartableFormItem[]>([])
    const [nuevoDesNombre, setNuevoDesNombre] = useState('')
    const [nuevoDesCantidad, setNuevoDesCantidad] = useState('1')
    const [nuevoDesObs, setNuevoDesObs] = useState('')
    const [buscandoDescartableCatalogo, setBuscandoDescartableCatalogo] = useState(false)
    const [resultadosDescartableCatalogo, setResultadosDescartableCatalogo] = useState<Array<{ id: number; nombre: string }>>([])
    const descartableDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Diferenciales
    const [esFeriado, setEsFeriado] = useState(false)
    const [esNocturna, setEsNocturna] = useState(false)
    const [mismaViaPatologia, setMismaViaPatologia] = useState(false)
    const [diferentesViasPatologia, setDiferentesViasPatologia] = useState(false)
    const [diferentesViasDiferentesPatologia, setDiferentesViasDiferentesPatologia] = useState(false)
    const [dobleCirugia, setDobleCirugia] = useState(false)

    const obraSocialIdNumero = obraSocialId ? Number.parseInt(obraSocialId, 10) : null
    const obraSocialSeleccionada = obraSociales.find((o) => o.id === obraSocialIdNumero)
    const esIPSS = obraSocialSeleccionada?.nombre?.toUpperCase().includes('IPSS') ?? false
    const planesFiltrados = planes.filter(
        (p) => !obraSocialIdNumero || p.obraSocialId === obraSocialIdNumero
    )

    const puedeGenerarAutorizacion = useMemo(() => {
        return Boolean(paciente && fechaCirugia && practicas.length > 0)
    }, [paciente, fechaCirugia, practicas.length])

    const handleSeleccionarPaciente = (p: PacienteResumen | null) => {
        setPaciente(p)
        setObraSocialId(p?.obraSocialId?.toString() ?? '')
        setPlanId(p?.planId?.toString() ?? '')
        setObraSocialCoseguroId(p?.obraSocialCoseguroId?.toString() ?? '')
        setNumeroAfiliado(p?.numeroAfiliado ?? '')
    }

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

    useEffect(() => {
        const termino = terminoBusquedaPractica.trim()
        if (!obraSocialIdNumero || termino.length < 2) {
            setResultadosPractica([])
            return
        }

        const timer = setTimeout(() => {
            void buscarPracticaNomenclador(termino)
        }, 350)

        return () => clearTimeout(timer)
    }, [terminoBusquedaPractica, obraSocialIdNumero])

    useEffect(() => {
        if (practicas.length < 2 && dobleCirugia) {
            setDobleCirugia(false)
        }
    }, [practicas.length, dobleCirugia])

    const buscarMedicamentoCatalogo = (value: string) => {
        setNuevaMedNombre(value)
        if (medicamentoDebounceRef.current) clearTimeout(medicamentoDebounceRef.current)

        const query = value.trim()
        if (query.length < 2) {
            setResultadosMedicamentoCatalogo([])
            return
        }

        medicamentoDebounceRef.current = setTimeout(async () => {
            setBuscandoMedicamentoCatalogo(true)
            try {
                const res = await fetch(`/api/catalogos/medicamentos-uti?q=${encodeURIComponent(query)}&limit=12`)
                const json = await res.json()
                setResultadosMedicamentoCatalogo(Array.isArray(json.data) ? json.data : [])
            } catch {
                setResultadosMedicamentoCatalogo([])
            } finally {
                setBuscandoMedicamentoCatalogo(false)
            }
        }, 300)
    }

    const buscarDescartableCatalogo = (value: string) => {
        setNuevoDesNombre(value)
        if (descartableDebounceRef.current) clearTimeout(descartableDebounceRef.current)

        const query = value.trim()
        if (query.length < 2) {
            setResultadosDescartableCatalogo([])
            return
        }

        descartableDebounceRef.current = setTimeout(async () => {
            setBuscandoDescartableCatalogo(true)
            try {
                const res = await fetch(`/api/catalogos/descartables-uti?q=${encodeURIComponent(query)}&limit=12`)
                const json = await res.json()
                setResultadosDescartableCatalogo(Array.isArray(json.data) ? json.data : [])
            } catch {
                setResultadosDescartableCatalogo([])
            } finally {
                setBuscandoDescartableCatalogo(false)
            }
        }, 300)
    }

    const agregarPractica = (p: NomencladorPracticaItem) => {
        setPracticas((prev) => {
            return [
                ...prev,
                {
                    _key: `${p.convenioId}-${p.codigo}-${Date.now()}`,
                    convenioId: p.convenioId,
                    codigo: p.codigo.trim().slice(0, 50),
                    descripcion: p.descripcion,
                    cantidad: 1,
                    seleccionada: false,
                    desglose: {
                        valorEspecialista: p.valorEspecialista ?? null,
                        valorAyudante: p.valorAyudante ?? null,
                        valorAnestesista: p.valorAnestesista ?? null,
                        valorGastos: p.valorGastos ?? null,
                        valorTotal: null,
                    },
                    seleccionComponentes: seleccionPorDefecto({
                        valorEspecialista: p.valorEspecialista ?? null,
                        valorAyudante: p.valorAyudante ?? null,
                        valorAnestesista: p.valorAnestesista ?? null,
                        valorGastos: p.valorGastos ?? null,
                        valorTotal: null,
                    }),
                    requiereMatriculaEspecialista: Number(p.valorEspecialista ?? 0) > 0,
                    requiereMatriculaAnestesista: Number(p.valorAnestesista ?? 0) > 0,
                    matriculaEspecialista: null,
                    matriculaAnestesista: null,
                },
            ]
        })

        setResultadosPractica([])
        setTerminoBusquedaPractica('')
    }

    const quitarPractica = (key: string) => {
        setPracticas((prev) => prev.filter((x) => x._key !== key))
    }

    const agregarMedicacion = () => {
        if (!nuevaMedNombre.trim()) return

        setMedicaciones((prev) => [
            ...prev,
            {
                nombre: nuevaMedNombre,
                dosis: nuevaMedDosis,
                viaAdministracion: nuevaMedVia,
                frecuencia: nuevaMedFrecuencia,
                observaciones: nuevaMedObs,
            },
        ])

        setNuevaMedNombre('')
        setNuevaMedDosis('')
        setNuevaMedVia('')
        setNuevaMedFrecuencia('')
        setNuevaMedObs('')
        setResultadosMedicamentoCatalogo([])
    }

    const quitarMedicacion = (idx: number) => {
        setMedicaciones((prev) => prev.filter((_, i) => i !== idx))
    }

    const agregarDescartable = () => {
        if (!nuevoDesNombre.trim()) return

        setDescartables((prev) => [
            ...prev,
            {
                nombre: nuevoDesNombre,
                cantidad: Math.max(1, Number.parseInt(nuevoDesCantidad, 10) || 1),
                observaciones: nuevoDesObs,
            },
        ])

        setNuevoDesNombre('')
        setNuevoDesCantidad('1')
        setNuevoDesObs('')
        setResultadosDescartableCatalogo([])
    }

    const quitarDescartable = (idx: number) => {
        setDescartables((prev) => prev.filter((_, i) => i !== idx))
    }

    const handleGenerarAutorizacion = async () => {
        if (!paciente) {
            setError('Debe seleccionar un paciente')
            return
        }

        if (practicas.length === 0) {
            setError('Debe agregar al menos una práctica')
            return
        }

        if (dobleCirugia && practicas.length < 2) {
            setError('Para aplicar doble cirugía, debe cargar al menos dos prácticas')
            return
        }

        setError(null)
        setGuardando(true)

        try {
            const result = await crearCirugiaProgramadaAction({
                pacienteId: paciente.id,
                fechaCirugia,
                horaCirugia: null,
                obraSocialId: obraSocialId ? Number.parseInt(obraSocialId, 10) : null,
                planId: planId ? Number.parseInt(planId, 10) : null,
                obraSocialCoseguroId: obraSocialCoseguroId
                    ? Number.parseInt(obraSocialCoseguroId, 10)
                    : null,
                numeroAfiliado: numeroAfiliado || null,
                diagnostico: diagnostico || null,
                observaciones: observaciones || null,
                camaId: null,
                practicas: practicas.map((p) => ({
                    convenioId: p.convenioId,
                    codigo: p.codigo,
                    descripcion: p.descripcion,
                    cantidad: p.cantidad,
                    importeTotal: Number((calcularTotalSeleccionado(p.desglose, p.seleccionComponentes) * p.cantidad).toFixed(2)),
                    matriculaEspecialista: p.seleccionComponentes.especialista > 0 ? p.matriculaEspecialista : null,
                    matriculaAnestesista: p.seleccionComponentes.anestesista > 0 ? p.matriculaAnestesista : null,
                })),
                medicaciones: medicaciones.length > 0 ? medicaciones : undefined,
                descartables: descartables.length > 0 ? descartables : undefined,
                diferenciales: {
                    esFeriado,
                    esNocturna,
                    mismaViaPatologia,
                    diferentesViasPatologia,
                    diferentesViasDiferentesPatologia,
                    dobleCirugia,
                },
            })

            router.push(`/dashboard/ambulatorio/nueva?ingresoId=${result.ingresoId}`)
            router.refresh()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo generar la autorización')
        } finally {
            setGuardando(false)
        }
    }

    return (
        <div className="space-y-6">
            {error && (
                <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="his-card p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
                    Paciente <span className="text-red-500">*</span>
                </h3>
                <BuscarPaciente
                    onSeleccionar={handleSeleccionarPaciente}
                    pacienteSeleccionado={paciente}
                />

                {paciente && (
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1.5 text-xs text-gray-600">
                        <div>
                            <span className="text-gray-400">HC:</span> {paciente.historiaClinica ?? '-'}
                        </div>
                        <div>
                            <span className="text-gray-400">DNI:</span> {paciente.numeroDocumento ?? '-'}
                        </div>
                        {paciente.fechaNacimiento && (
                            <div>
                                <span className="text-gray-400">Fecha nac.:</span>{' '}
                                {new Date(paciente.fechaNacimiento).toLocaleDateString('es-AR')}
                            </div>
                        )}
                        {paciente.sexo && (
                            <div>
                                <span className="text-gray-400">Sexo:</span>{' '}
                                {paciente.sexo === 'M'
                                    ? 'Masculino'
                                    : paciente.sexo === 'F'
                                        ? 'Femenino'
                                        : paciente.sexo}
                            </div>
                        )}
                        {paciente.domicilio && (
                            <div className="col-span-2 md:col-span-1">
                                <span className="text-gray-400">Domicilio:</span> {paciente.domicilio}
                            </div>
                        )}
                        {paciente.celular1 && (
                            <div>
                                <span className="text-gray-400">Cel.:</span> {paciente.celular1}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="his-card p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">Cobertura Médica</h3>
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
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">-- Seleccionar obra social --</option>
                            {obraSociales.map((os, idx) => (
                                <option key={`${os.id}-${idx}`} value={String(os.id)}>
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
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">-- Seleccionar plan --</option>
                            {planesFiltrados.map((plan, idx) => (
                                <option key={`${plan.id}-${idx}`} value={String(plan.id)}>
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
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="123456789"
                        />
                    </div>

                    {esIPSS && (
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Coseguro (solo IPSS)</label>
                            <select
                                value={obraSocialCoseguroId}
                                onChange={(e) => setObraSocialCoseguroId(e.target.value)}
                                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">-- Sin coseguro --</option>
                                {coseguros.map((c, idx) => (
                                    <option key={`${c.id}-${idx}`} value={String(c.id)}>
                                        {c.nombre}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            </div>

            <div className="his-card p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b">Diagnóstico</h3>
                <textarea
                    value={diagnostico}
                    onChange={(e) => setDiagnostico(e.target.value)}
                    rows={3}
                    maxLength={500}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder="Diagnóstico o motivo clínico de la cirugía programada"
                />
            </div>

            <div className="his-card p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b">Observaciones</h3>
                <textarea
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder="Observaciones clínicas y administrativas"
                />
            </div>

            <div className="his-card p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">Prácticas</h3>
                <div className="flex gap-2 mb-3">
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
                            className="w-full rounded-md border border-gray-300 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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

                {!obraSocialIdNumero && (
                    <p className="mb-3 text-xs text-amber-700">
                        Seleccione una obra social para buscar prácticas del nomenclador.
                    </p>
                )}

                {resultadosPractica.length > 0 && (
                    <div className="mb-3 rounded-md border bg-white shadow-sm max-h-48 overflow-y-auto divide-y">
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
                    <div className="space-y-2">
                        <div className="divide-y border rounded-md">
                            {practicas.map((p) => (
                                <div key={p._key} className="px-3 py-3 space-y-3">
                                    <div className="flex items-center gap-3">
                                        <span className="font-mono text-xs text-gray-500 w-20 shrink-0">{p.codigo}</span>
                                        <span className="flex-1 text-sm text-gray-800">{p.descripcion}</span>

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
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <p className="text-xs text-gray-400">No se han agregado prácticas.</p>
                )}
            </div>

            <div className="his-card p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">Medicamentos</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 p-3 rounded-md bg-gray-50 border">
                    <div className="relative">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Medicamento <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            value={nuevaMedNombre}
                            onChange={(e) => buscarMedicamentoCatalogo(e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                            placeholder="Ej: Fentanilo"
                        />
                        {resultadosMedicamentoCatalogo.length > 0 && (
                            <div className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow-sm max-h-40 overflow-y-auto divide-y">
                                {resultadosMedicamentoCatalogo.map((m) => (
                                    <button
                                        key={m.id}
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                            setNuevaMedNombre(m.nombre)
                                            setResultadosMedicamentoCatalogo([])
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                                    >
                                        {m.nombre}
                                    </button>
                                ))}
                            </div>
                        )}
                        {buscandoMedicamentoCatalogo && (
                            <p className="mt-1 text-xs text-gray-400">Buscando en catálogo UTI...</p>
                        )}
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Dosis</label>
                        <input
                            type="text"
                            value={nuevaMedDosis}
                            onChange={(e) => setNuevaMedDosis(e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                            placeholder="Ej: 50mg"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Vía</label>
                        <input
                            type="text"
                            value={nuevaMedVia}
                            onChange={(e) => setNuevaMedVia(e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                            placeholder="Oral / EV"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Frecuencia</label>
                        <input
                            type="text"
                            value={nuevaMedFrecuencia}
                            onChange={(e) => setNuevaMedFrecuencia(e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                            placeholder="Cada 8 hs"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Observaciones</label>
                        <input
                            type="text"
                            value={nuevaMedObs}
                            onChange={(e) => setNuevaMedObs(e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                            placeholder="Notas"
                        />
                    </div>
                    <div className="flex items-end">
                        <button
                            type="button"
                            onClick={agregarMedicacion}
                            disabled={!nuevaMedNombre.trim()}
                            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                            <Plus className="h-4 w-4" /> Agregar
                        </button>
                    </div>
                </div>
                {medicaciones.length > 0 ? (
                    <div className="divide-y border rounded-md">
                        {medicaciones.map((m, idx) => (
                            <div key={`${m.nombre}-${idx}`} className="flex items-center gap-3 px-3 py-2">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-800">{m.nombre}</p>
                                    <p className="text-xs text-gray-500">
                                        {[m.dosis, m.viaAdministracion, m.frecuencia].filter(Boolean).join(' · ')}
                                        {m.observaciones && <> - {m.observaciones}</>}
                                    </p>
                                </div>
                                <button type="button" onClick={() => quitarMedicacion(idx)} className="text-red-400 hover:text-red-600">
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-xs text-gray-400">No se han agregado medicamentos.</p>
                )}
            </div>

            <div className="his-card p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">Descartables</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 p-3 rounded-md bg-gray-50 border">
                    <div className="relative">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Descartable <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            value={nuevoDesNombre}
                            onChange={(e) => buscarDescartableCatalogo(e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                            placeholder="Ej: Abocath 20"
                        />
                        {resultadosDescartableCatalogo.length > 0 && (
                            <div className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow-sm max-h-40 overflow-y-auto divide-y">
                                {resultadosDescartableCatalogo.map((d) => (
                                    <button
                                        key={d.id}
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                            setNuevoDesNombre(d.nombre)
                                            setResultadosDescartableCatalogo([])
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                                    >
                                        {d.nombre}
                                    </button>
                                ))}
                            </div>
                        )}
                        {buscandoDescartableCatalogo && (
                            <p className="mt-1 text-xs text-gray-400">Buscando en catálogo UTI...</p>
                        )}
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad</label>
                        <input
                            type="number"
                            min={1}
                            value={nuevoDesCantidad}
                            onChange={(e) => setNuevoDesCantidad(e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Observaciones</label>
                        <input
                            type="text"
                            value={nuevoDesObs}
                            onChange={(e) => setNuevoDesObs(e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                            placeholder="Notas"
                        />
                    </div>
                    <div className="flex items-end">
                        <button
                            type="button"
                            onClick={agregarDescartable}
                            disabled={!nuevoDesNombre.trim()}
                            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                            <Plus className="h-4 w-4" /> Agregar
                        </button>
                    </div>
                </div>
                {descartables.length > 0 ? (
                    <div className="divide-y border rounded-md">
                        {descartables.map((d, idx) => (
                            <div key={`${d.nombre}-${idx}`} className="flex items-center gap-3 px-3 py-2">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-800">{d.nombre} <span className="text-xs text-gray-500">x{d.cantidad}</span></p>
                                    {d.observaciones && <p className="text-xs text-gray-500">{d.observaciones}</p>}
                                </div>
                                <button type="button" onClick={() => quitarDescartable(idx)} className="text-red-400 hover:text-red-600">
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-xs text-gray-400">No se han agregado descartables.</p>
                )}
            </div>

            <div className="his-card p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b">Fecha estimativa de cirugía programada</h3>
                <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Fecha estimativa <span className="text-red-500">*</span></label>
                    <input
                        type="date"
                        value={fechaCirugia}
                        onChange={(e) => setFechaCirugia(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="mt-2 text-xs text-gray-500">
                        La hora y la cama definitiva se cargan luego, al confirmar la autorización.
                    </p>
                </div>
            </div>

            <div className="his-card p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">Diferenciales de facturación</h3>
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="esFeriado"
                            checked={esFeriado}
                            onChange={(e) => setEsFeriado(e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded"
                        />
                        <label htmlFor="esFeriado" className="text-sm text-gray-700">
                            Es feriado
                        </label>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="esNocturna"
                            checked={esNocturna}
                            onChange={(e) => setEsNocturna(e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded"
                        />
                        <label htmlFor="esNocturna" className="text-sm text-gray-700">
                            Cirugía nocturna
                        </label>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="mismaViaPatologia"
                            checked={mismaViaPatologia}
                            onChange={(e) => setMismaViaPatologia(e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded"
                        />
                        <label htmlFor="mismaViaPatologia" className="text-sm text-gray-700">
                            Misma vía, diferentes patologías
                        </label>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="diferentesViasPatologia"
                            checked={diferentesViasPatologia}
                            onChange={(e) => setDiferentesViasPatologia(e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded"
                        />
                        <label htmlFor="diferentesViasPatologia" className="text-sm text-gray-700">
                            Diferentes vías, misma patología
                        </label>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="diferentesViasDiferentesPatologia"
                            checked={diferentesViasDiferentesPatologia}
                            onChange={(e) => setDiferentesViasDiferentesPatologia(e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded"
                        />
                        <label htmlFor="diferentesViasDiferentesPatologia" className="text-sm text-gray-700">
                            Diferentes vías, diferentes patologías
                        </label>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="dobleCirugia"
                            checked={dobleCirugia}
                            onChange={(e) => setDobleCirugia(e.target.checked)}
                            disabled={practicas.length < 2}
                            className="w-4 h-4 text-blue-600 rounded"
                        />
                        <label htmlFor="dobleCirugia" className="text-sm text-gray-700">
                            Doble cirugía (una práctica base al 100% y recargo en las restantes)
                        </label>
                    </div>
                    {practicas.length < 2 && (
                        <p className="text-xs text-amber-700">
                            Para habilitar doble cirugía, agregue al menos dos prácticas.
                        </p>
                    )}
                </div>
            </div>

            <div className="flex items-center justify-end gap-3 pb-4">
                <button
                    type="button"
                    onClick={() => router.push('/dashboard/cirugia')}
                    disabled={guardando}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                    Cancelar
                </button>
                <button
                    type="button"
                    onClick={() => void handleGenerarAutorizacion()}
                    disabled={guardando || !puedeGenerarAutorizacion}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                    {guardando ? 'Generando...' : 'Generar autorización'}
                </button>
            </div>
        </div>
    )
}