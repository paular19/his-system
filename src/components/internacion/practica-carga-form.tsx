'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Loader2, Plus, Search, X } from 'lucide-react'
import {
    ComponenteSelector,
    calcularTotalSeleccionado,
    seleccionPorDefecto,
    type ComponenteSeleccion,
    type ComponenteValores,
} from '@/components/ui/componente-selector'
import {
    esSubitemAnestesista,
    esSubitemEspecialista,
    type SubitemCodigo,
    obtenerSubitemsSeleccionados,
    valorUnitarioPorSubitem,
} from '@/lib/practicas-subitems'
import { fechaAInputLocal, fechaHoraAInputLocal } from '@/lib/utils/argentina-date'
import { normalizarClasificacionAgrupacion } from '@/modules/orden/clasificacion'

interface NomencladorItem {
    convenioId: number
    codigo: string
    descripcion: string
    valor: number | null
    valorEspecialista: number | null
    valorAyudante: number | null
    valorAnestesista: number | null
    valorGastos: number | null
}

type TipoInternacionFiltro = 'UTI' | 'INTERNACION_NORMAL'

interface ProfesionalConMatricula {
    id: number
    nombre: string
    matricula: number
}

export interface PracticaCargaPayload {
    convenioId: number
    codigoPractica: string
    descripcionPractica: string
    fecha: string
    cantidad: number
    numeroAutorizacion: string | null
    matriculaEspecialista: number | null
    matriculaAnestesista: number | null
    facturable: boolean
    importeBaseUnitario: number | null
}

export interface PracticaCargaEntrada {
    payload: PracticaCargaPayload
    clasificacion: string
}

interface GuardarResult {
    ok: boolean
    error?: string
}

interface PracticaCargaFormProps {
    convenioId: number | null
    matriculaTratanteDefault?: number | null
    sectorInternacionActual?: string | null
    onGuardar: (entradas: PracticaCargaEntrada[]) => Promise<GuardarResult>
    onCancel?: () => void
    titulo?: string
    modoCargaRapida?: boolean
    autoFocusBusqueda?: boolean
    soloFechaPractica?: boolean
    onGuardadoExitoso?: (entradas: PracticaCargaEntrada[]) => void
    ocultarContextoBusquedaRapida?: boolean
}

const formatoMoneda = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
})

const MATRICULA_ANESTESISTA_DEFAULT = 6
const MATRICULA_GASTOS_INTERNACION_DEFAULT = 9995

function etiquetaSubitem(subitem: SubitemCodigo): string {
    if (subitem === 'HE') return 'Honorario Especialista (HE)'
    if (subitem === 'HA') return 'Honorario Anestesista (HA)'
    if (subitem === 'GA') return 'Derechos/Gastos (GA)'
    if (subitem === 'A1') return 'Ayudante 1 (A1)'
    if (subitem === 'A2') return 'Ayudante 2 (A2)'
    return 'Ayudante 3 (A3)'
}

function esSectorUti(sector: string | null | undefined): boolean {
    const normalized = (sector ?? '').trim().toUpperCase()
    return normalized === 'CU' || normalized === 'UTI' || normalized === 'TERAPIA_INTENSIVA'
}

function esCodigoPracticaCompleto(value: string): boolean {
    return /^[A-Z0-9]{1,8}$/.test(value.trim().toUpperCase())
}

function fechaPracticaAISOString(value: string, soloFechaPractica: boolean): string {
    if (soloFechaPractica) {
        return new Date(`${value}T12:00:00-03:00`).toISOString()
    }
    return new Date(value).toISOString()
}

export function PracticaCargaForm({
    convenioId,
    matriculaTratanteDefault,
    sectorInternacionActual,
    onGuardar,
    onCancel,
    titulo = 'Nueva practica',
    modoCargaRapida = false,
    autoFocusBusqueda = false,
    soloFechaPractica = false,
    onGuardadoExitoso,
    ocultarContextoBusquedaRapida = false,
}: PracticaCargaFormProps) {
    const datalistId = `clasificacion-practica-list-${useId().replace(/:/g, '')}`

    const [busqueda, setBusqueda] = useState('')
    const [tipoInternacionFiltro, setTipoInternacionFiltro] = useState<TipoInternacionFiltro>(
        esSectorUti(sectorInternacionActual) ? 'UTI' : 'INTERNACION_NORMAL'
    )
    const [resultados, setResultados] = useState<NomencladorItem[]>([])
    const [buscando, setBuscando] = useState(false)
    const [practicaSeleccionada, setPracticaSeleccionada] = useState<NomencladorItem | null>(null)

    const [componenteSeleccion, setComponenteSeleccion] = useState<ComponenteSeleccion>({
        especialista: 0,
        ayudante: 0,
        anestesista: 0,
        gastos: 0,
    })

    const [fecha, setFecha] = useState(() => (soloFechaPractica ? fechaAInputLocal() : fechaHoraAInputLocal()))
    const [numeroAutorizacion, setNumeroAutorizacion] = useState('')
    const [cantidadGeneralPractica, setCantidadGeneralPractica] = useState('1')
    const [crearPracticaTodaJunta, setCrearPracticaTodaJunta] = useState(false)
    const [matriculaEspecialista, setMatriculaEspecialista] = useState(
        matriculaTratanteDefault ? String(matriculaTratanteDefault) : ''
    )
    const [matriculaAnestesista, setMatriculaAnestesista] = useState(String(MATRICULA_ANESTESISTA_DEFAULT))
    const [matriculaGastos, setMatriculaGastos] = useState(String(MATRICULA_GASTOS_INTERNACION_DEFAULT))

    const [profesionalesConMatricula, setProfesionalesConMatricula] = useState<ProfesionalConMatricula[]>([])

    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [clasificacionPorSubitemNuevo, setClasificacionPorSubitemNuevo] = useState<string[]>([])

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const subitemsPreviosRef = useRef<SubitemCodigo[]>([])
    const busquedaInputRef = useRef<HTMLInputElement | null>(null)

    const subitemsSeleccionadosForm = useMemo(() => {
        if (!practicaSeleccionada) return [] as SubitemCodigo[]
        return obtenerSubitemsSeleccionados(
            {
                valorEspecialista: practicaSeleccionada.valorEspecialista,
                valorAyudante: practicaSeleccionada.valorAyudante,
                valorAnestesista: practicaSeleccionada.valorAnestesista,
                valorGastos: practicaSeleccionada.valorGastos,
            },
            componenteSeleccion
        )
    }, [practicaSeleccionada, componenteSeleccion])

    const clasificacionesPorComponenteForm = useMemo(() => {
        const porComponente: Record<
            keyof ComponenteSeleccion,
            Array<{ index: number; label: string; value: string }>
        > = {
            especialista: [],
            ayudante: [],
            anestesista: [],
            gastos: [],
        }

        const contador = new Map<string, number>()
        for (const [idx, subitem] of subitemsSeleccionadosForm.entries()) {
            const actual = (contador.get(subitem) ?? 0) + 1
            contador.set(subitem, actual)
            const totalSubitem = subitemsSeleccionadosForm.filter((x) => x === subitem).length
            const sufijo = totalSubitem > 1 ? ` #${actual}` : ''
            const entrada = {
                index: idx,
                label: `${subitem}${sufijo}`,
                value: clasificacionPorSubitemNuevo[idx] ?? subitem,
            }

            if (subitem === 'HE') porComponente.especialista.push(entrada)
            else if (subitem === 'HA') porComponente.anestesista.push(entrada)
            else if (subitem === 'GA') porComponente.gastos.push(entrada)
            else porComponente.ayudante.push(entrada)
        }

        return porComponente
    }, [subitemsSeleccionadosForm, clasificacionPorSubitemNuevo])

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
                if (!cancelled) {
                    setProfesionalesConMatricula([])
                }
            }
        }

        void cargarProfesionales()

        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        setTipoInternacionFiltro(esSectorUti(sectorInternacionActual) ? 'UTI' : 'INTERNACION_NORMAL')
    }, [sectorInternacionActual])

    useEffect(() => {
        if (!autoFocusBusqueda) return
        const frame = window.requestAnimationFrame(() => {
            busquedaInputRef.current?.focus()
        })
        return () => window.cancelAnimationFrame(frame)
    }, [autoFocusBusqueda])

    useEffect(() => {
        if (subitemsSeleccionadosForm.length === 0) {
            setClasificacionPorSubitemNuevo([])
            subitemsPreviosRef.current = []
            return
        }

        setClasificacionPorSubitemNuevo((prev) => {
            const clavesPrevias = new Map<string, string>()
            const contadorPrevio = new Map<string, number>()
            for (let idx = 0; idx < subitemsPreviosRef.current.length; idx += 1) {
                const subitemPrevio = subitemsPreviosRef.current[idx]
                if (!subitemPrevio) continue
                const ocurrenciaPrevia = (contadorPrevio.get(subitemPrevio) ?? 0) + 1
                contadorPrevio.set(subitemPrevio, ocurrenciaPrevia)
                const clave = `${subitemPrevio}#${ocurrenciaPrevia}`
                const clasificacionPrevia =
                    normalizarClasificacionAgrupacion(prev[idx]) ?? prev[idx]?.trim().toUpperCase() ?? ''
                if (clasificacionPrevia) clavesPrevias.set(clave, clasificacionPrevia)
            }

            const contadorActual = new Map<string, number>()
            const next = subitemsSeleccionadosForm.map((subitem) => {
                const ocurrenciaActual = (contadorActual.get(subitem) ?? 0) + 1
                contadorActual.set(subitem, ocurrenciaActual)
                const clave = `${subitem}#${ocurrenciaActual}`
                return clavesPrevias.get(clave) ?? subitem
            })

            return next
        })

        subitemsPreviosRef.current = subitemsSeleccionadosForm
    }, [subitemsSeleccionadosForm])

    const buscarPractica = (q: string) => {
        setBusqueda(q)
        setPracticaSeleccionada(null)
        if (debounceRef.current) clearTimeout(debounceRef.current)
        if (q.trim().length < 2) {
            setResultados([])
            return
        }
        debounceRef.current = setTimeout(async () => {
            setBuscando(true)
            try {
                const qs = new URLSearchParams({ q: q.trim() })
                if (convenioId) qs.set('convenioId', String(convenioId))
                const res = await fetch(`/api/practicas-nomenclador?${qs.toString()}`)
                const json = await res.json()
                const items: NomencladorItem[] = Array.isArray(json.data) ? json.data : []
                setResultados(items)

                if (modoCargaRapida && esCodigoPracticaCompleto(q)) {
                    const codigoBuscado = q.trim().toUpperCase()
                    const exacta = items.find((item) => item.codigo.trim().toUpperCase() === codigoBuscado)
                    if (exacta) {
                        seleccionarPractica(exacta, true)
                    }
                }
            } catch {
                setResultados([])
            } finally {
                setBuscando(false)
            }
        }, 350)
    }

    const seleccionarPractica = (p: NomencladorItem, mantenerCodigoEnBusqueda = false) => {
        setPracticaSeleccionada(p)
        setBusqueda(mantenerCodigoEnBusqueda || modoCargaRapida ? p.codigo.trim() : p.descripcion)
        setResultados([])
        setClasificacionPorSubitemNuevo([])
        subitemsPreviosRef.current = []
        const valores: ComponenteValores = {
            valorEspecialista: p.valorEspecialista,
            valorAyudante: p.valorAyudante,
            valorAnestesista: p.valorAnestesista,
            valorGastos: p.valorGastos,
            valorTotal: p.valor,
        }
        setComponenteSeleccion(seleccionPorDefecto(valores))
    }

    const resolverPracticaExactaPorCodigo = async (codigo: string): Promise<NomencladorItem | null> => {
        const codigoNormalizado = codigo.trim().toUpperCase()
        if (!esCodigoPracticaCompleto(codigoNormalizado)) return null

        const qs = new URLSearchParams({ q: codigoNormalizado })
        if (convenioId) qs.set('convenioId', String(convenioId))

        const res = await fetch(`/api/practicas-nomenclador?${qs.toString()}`)
        const json = await res.json().catch(() => null)
        const items: NomencladorItem[] = Array.isArray(json?.data) ? json.data : []
        return items.find((item) => item.codigo.trim().toUpperCase() === codigoNormalizado) ?? null
    }

    const limpiarForm = () => {
        setBusqueda('')
        setResultados([])
        setPracticaSeleccionada(null)
        setComponenteSeleccion({ especialista: 0, ayudante: 0, anestesista: 0, gastos: 0 })
        setClasificacionPorSubitemNuevo([])
        setFecha(soloFechaPractica ? fechaAInputLocal() : fechaHoraAInputLocal())
        setNumeroAutorizacion('')
        setCantidadGeneralPractica('1')
        setCrearPracticaTodaJunta(false)
        setMatriculaEspecialista(matriculaTratanteDefault ? String(matriculaTratanteDefault) : '')
        setMatriculaAnestesista(String(MATRICULA_ANESTESISTA_DEFAULT))
        setMatriculaGastos(String(MATRICULA_GASTOS_INTERNACION_DEFAULT))
        setError(null)

        if (autoFocusBusqueda) {
            window.requestAnimationFrame(() => {
                busquedaInputRef.current?.focus()
            })
        }
    }

    const handleCancelar = () => {
        limpiarForm()
        onCancel?.()
    }

    const handleGuardar = async () => {
        setError(null)
        let practicaBase = practicaSeleccionada
        if (!practicaBase && !busqueda.trim()) {
            setError('Selecciona una practica del nomenclador o escribe un codigo')
            return
        }

        if (!practicaBase) {
            const codigoManual = busqueda.trim().toUpperCase()
            if (!esCodigoPracticaCompleto(codigoManual)) {
                setError('El codigo manual debe tener entre 1 y 8 caracteres alfanumericos')
                return
            }

            setBuscando(true)
            try {
                const matchExacto = await resolverPracticaExactaPorCodigo(codigoManual)

                if (!matchExacto) {
                    setError('Selecciona una practica valida del listado de nomenclador antes de guardar')
                    return
                }

                practicaBase = matchExacto
                setPracticaSeleccionada(matchExacto)
                setBusqueda(modoCargaRapida ? matchExacto.codigo.trim() : matchExacto.descripcion)
                setResultados([])
                setComponenteSeleccion(
                    seleccionPorDefecto({
                        valorEspecialista: matchExacto.valorEspecialista,
                        valorAyudante: matchExacto.valorAyudante,
                        valorAnestesista: matchExacto.valorAnestesista,
                        valorGastos: matchExacto.valorGastos,
                        valorTotal: matchExacto.valor,
                    })
                )
            } catch {
                setError('No se pudo validar la practica en nomenclador')
                return
            } finally {
                setBuscando(false)
            }
        }

        if (practicaBase?.valorEspecialista != null && !matriculaEspecialista.trim()) {
            setError('Ingrese matricula para honorario especialista')
            return
        }
        if (practicaBase?.valorAnestesista != null && !matriculaAnestesista.trim()) {
            setError('Ingrese matricula para honorario anestesista')
            return
        }
        if ((practicaBase?.valorGastos != null) && componenteSeleccion.gastos > 0 && !matriculaGastos.trim()) {
            setError('Ingrese matricula para derechos/gastos')
            return
        }

        const requiereEspecialista = practicaBase?.valorEspecialista != null
        const requiereAnestesista = practicaBase?.valorAnestesista != null
        const requiereGastos = (practicaBase?.valorGastos != null) && componenteSeleccion.gastos > 0
        const matriculaGastosNormalizada =
            matriculaGastos.trim() !== ''
                ? Number.parseInt(matriculaGastos, 10) || null
                : null
        const cantidadGeneral = Number.parseInt(cantidadGeneralPractica, 10)
        const cantidadGeneralFinal = crearPracticaTodaJunta ? cantidadGeneral : 1

        if (
            crearPracticaTodaJunta &&
            (!Number.isFinite(cantidadGeneralFinal) || cantidadGeneralFinal <= 0 || cantidadGeneralFinal > 999)
        ) {
            setError('La cantidad general debe estar entre 1 y 999')
            return
        }

        const body: PracticaCargaPayload = {
            convenioId: practicaBase?.convenioId ?? convenioId ?? 0,
            codigoPractica: practicaBase?.codigo ?? busqueda.trim().slice(0, 8).toUpperCase(),
            descripcionPractica: practicaBase?.descripcion ?? busqueda.trim(),
            fecha: fechaPracticaAISOString(fecha, soloFechaPractica),
            cantidad: cantidadGeneralFinal,
            numeroAutorizacion: numeroAutorizacion.trim() || null,
            matriculaEspecialista:
                requiereEspecialista && matriculaEspecialista.trim()
                    ? Number.parseInt(matriculaEspecialista, 10) || null
                    : requiereGastos
                    ? matriculaGastosNormalizada
                    : null,
            matriculaAnestesista:
                requiereAnestesista && matriculaAnestesista.trim()
                    ? Number.parseInt(matriculaAnestesista, 10) || null
                    : null,
            facturable: true,
            importeBaseUnitario: practicaBase
                ? (() => {
                      const vals: ComponenteValores = {
                          valorEspecialista: practicaBase.valorEspecialista,
                          valorAyudante: practicaBase.valorAyudante,
                          valorAnestesista: practicaBase.valorAnestesista,
                          valorGastos: practicaBase.valorGastos,
                          valorTotal: practicaBase.valor,
                      }
                      const total = calcularTotalSeleccionado(vals, componenteSeleccion)
                      return total > 0 ? total : null
                  })()
                : null,
        }

        const subitemsSeleccionados = subitemsSeleccionadosForm

        const clasificacionManualDefault =
            practicaBase && practicaBase.valorAnestesista != null && practicaBase.valorEspecialista == null
                ? 'HA'
                : 'HE'

        const entradasCrear: PracticaCargaEntrada[] = (() => {
            if (!(subitemsSeleccionados.length > 0 && practicaBase)) {
                return [{ payload: body, clasificacion: clasificacionManualDefault }]
            }

            if (crearPracticaTodaJunta) {
                const clasificacionesSeleccionadas = subitemsSeleccionados.map(
                    (subitem, idx) =>
                        normalizarClasificacionAgrupacion(clasificacionPorSubitemNuevo[idx]) ?? subitem
                )

                const clasificacionUnica =
                    normalizarClasificacionAgrupacion(clasificacionesSeleccionadas.join('+')) ??
                    clasificacionManualDefault

                return [
                    {
                        payload: {
                            ...body,
                            descripcionPractica: body.descripcionPractica,
                        },
                        clasificacion: clasificacionUnica,
                    },
                ]
            }

            return subitemsSeleccionados.map((subitem, idx) => {
                const valorUnitario = valorUnitarioPorSubitem(subitem, {
                    valorEspecialista: practicaBase.valorEspecialista,
                    valorAyudante: practicaBase.valorAyudante,
                    valorAnestesista: practicaBase.valorAnestesista,
                    valorGastos: practicaBase.valorGastos,
                })
                const clasificacionIndividual =
                    normalizarClasificacionAgrupacion(clasificacionPorSubitemNuevo[idx]) ?? subitem

                return {
                    payload: {
                        ...body,
                        descripcionPractica: `${body.descripcionPractica} · ${etiquetaSubitem(subitem)}`,
                        cantidad: 1,
                        importeBaseUnitario: valorUnitario,
                        matriculaEspecialista: esSubitemEspecialista(subitem)
                            ? body.matriculaEspecialista
                            : subitem === 'GA'
                            ? matriculaGastosNormalizada
                            : null,
                        matriculaAnestesista: esSubitemAnestesista(subitem)
                            ? body.matriculaAnestesista
                            : null,
                    },
                    clasificacion: clasificacionIndividual,
                }
            })
        })()

        setGuardando(true)
        try {
            const resultado = await onGuardar(entradasCrear)
            if (!resultado.ok) {
                setError(resultado.error ?? 'No se pudo guardar la practica')
                return
            }

            onGuardadoExitoso?.(entradasCrear)
            limpiarForm()
            onCancel?.()
        } catch {
            setError('Error de conexion')
        } finally {
            setGuardando(false)
        }
    }

    return (
        <div className="border border-blue-100 bg-blue-50/40 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{titulo}</p>

            <div className="relative">
                {!ocultarContextoBusquedaRapida && (
                    <>
                        <div className="mb-1 flex flex-wrap items-end justify-between gap-2">
                            <label className="block text-xs text-gray-500">Buscar en nomenclador</label>
                            <label className="inline-flex items-center gap-2 text-xs text-gray-600">
                                Tipo de internación
                                <select
                                    value={tipoInternacionFiltro}
                                    onChange={(e) => {
                                        const next = e.target.value as TipoInternacionFiltro
                                        setTipoInternacionFiltro(next)
                                    }}
                                    className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700"
                                >
                                    <option value="INTERNACION_NORMAL">PISO (Internación normal)</option>
                                    <option value="UTI">UTI (CU)</option>
                                </select>
                            </label>
                        </div>
                        <p className="mb-2 text-[11px] text-gray-500">
                            Este selector determina el contexto del paciente. No filtra por códigos porque el nomenclador no distingue UTI/PISO.
                        </p>
                    </>
                )}
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                    <input
                        ref={busquedaInputRef}
                        type="text"
                        value={busqueda}
                        onChange={(e) => buscarPractica(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key !== 'Enter' || !modoCargaRapida || guardando) return
                            e.preventDefault()
                            void handleGuardar()
                        }}
                        autoFocus={autoFocusBusqueda}
                        placeholder="Codigo o descripcion (min. 2 caracteres)..."
                        className="his-input pl-8 pr-8 text-sm w-full"
                    />
                    {buscando && (
                        <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 animate-spin" />
                    )}
                    {practicaSeleccionada && (
                        <button
                            onClick={() => {
                                setPracticaSeleccionada(null)
                                setBusqueda('')
                            }}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
                {resultados.length > 0 && (
                    <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto text-sm">
                        {resultados.map((r) => (
                            <li key={`${r.convenioId}-${r.codigo}`}>
                                <button
                                    type="button"
                                    onClick={() => seleccionarPractica(r)}
                                    className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-start gap-2"
                                >
                                    <span className="font-mono text-xs text-gray-400 shrink-0 pt-0.5">
                                        {r.codigo.trim()}
                                    </span>
                                    <span className="min-w-0 flex-1 text-gray-800">{r.descripcion}</span>
                                    <span className="shrink-0 text-xs font-medium text-gray-500">
                                        {r.valor != null ? formatoMoneda.format(r.valor) : '-'}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {practicaSeleccionada && (
                <ComponenteSelector
                    valores={{
                        valorEspecialista: practicaSeleccionada.valorEspecialista,
                        valorAyudante: practicaSeleccionada.valorAyudante,
                        valorAnestesista: practicaSeleccionada.valorAnestesista,
                        valorGastos: practicaSeleccionada.valorGastos,
                        valorTotal: practicaSeleccionada.valor,
                    }}
                    seleccion={componenteSeleccion}
                    onChange={setComponenteSeleccion}
                    disabled={guardando}
                    clasificacionesPorComponente={clasificacionesPorComponenteForm}
                    onClasificacionChange={(index, value) => {
                        const raw = value.toUpperCase()
                        setClasificacionPorSubitemNuevo((prev) => {
                            const next = [...prev]
                            next[index] = normalizarClasificacionAgrupacion(raw) ?? raw.replace(/\s+/g, '')
                            return next
                        })
                    }}
                    clasificacionListId={datalistId}
                />
            )}

            {practicaSeleccionada && subitemsSeleccionadosForm.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="inline-flex items-center gap-2 text-xs text-gray-600">
                        <input
                            type="checkbox"
                            checked={crearPracticaTodaJunta}
                            onChange={(e) => setCrearPracticaTodaJunta(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Cargar practica toda junta (un solo registro con subitems)
                    </label>
                    {crearPracticaTodaJunta && (
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Cantidad general</label>
                            <input
                                type="number"
                                min={1}
                                max={999}
                                step={1}
                                value={cantidadGeneralPractica}
                                onChange={(e) => setCantidadGeneralPractica(e.target.value)}
                                className="his-input text-sm w-full"
                            />
                        </div>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 gap-3">
                <div>
                    <label className="block text-xs text-gray-500 mb-1">{soloFechaPractica ? 'Fecha' : 'Fecha y hora'}</label>
                    <input
                        type={soloFechaPractica ? 'date' : 'datetime-local'}
                        value={fecha}
                        onChange={(e) => setFecha(e.target.value)}
                        className="his-input text-sm w-full"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
                <div>
                    <label className="block text-xs text-gray-500 mb-1">Nro. autorizacion</label>
                    <input
                        type="text"
                        value={numeroAutorizacion}
                        onChange={(e) => setNumeroAutorizacion(e.target.value)}
                        placeholder="Opcional"
                        className="his-input text-sm w-full"
                    />
                </div>
            </div>

            {practicaSeleccionada && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {practicaSeleccionada.valorEspecialista != null && (
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Matricula especialista (HE)</label>
                            <select
                                value={matriculaEspecialista}
                                onChange={(e) => setMatriculaEspecialista(e.target.value)}
                                className="his-input text-sm w-full"
                            >
                                <option value="">Seleccionar matricula...</option>
                                {profesionalesConMatricula.map((profesional) => (
                                    <option key={`esp-${profesional.id}`} value={String(profesional.matricula)}>
                                        {profesional.matricula} - {profesional.nombre}
                                    </option>
                                ))}
                            </select>
                            <input
                                type="number"
                                min={1}
                                value={matriculaEspecialista}
                                onChange={(e) => setMatriculaEspecialista(e.target.value)}
                                placeholder="Ej: 12345"
                                className="his-input text-sm w-full mt-2"
                            />
                        </div>
                    )}
                    {practicaSeleccionada.valorAnestesista != null && (
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Matricula anestesista (HA)</label>
                            <select
                                value={matriculaAnestesista}
                                onChange={(e) => setMatriculaAnestesista(e.target.value)}
                                className="his-input text-sm w-full"
                            >
                                <option value="">Seleccionar matricula...</option>
                                {profesionalesConMatricula.map((profesional) => (
                                    <option key={`ane-${profesional.id}`} value={String(profesional.matricula)}>
                                        {profesional.matricula} - {profesional.nombre}
                                    </option>
                                ))}
                            </select>
                            <input
                                type="number"
                                min={1}
                                value={matriculaAnestesista}
                                onChange={(e) => setMatriculaAnestesista(e.target.value)}
                                placeholder="Ej: 12345"
                                className="his-input text-sm w-full mt-2"
                            />
                        </div>
                    )}
                    {practicaSeleccionada.valorGastos != null && (
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Matricula derechos/gastos (GA)</label>
                            <select
                                value={matriculaGastos}
                                onChange={(e) => setMatriculaGastos(e.target.value)}
                                className="his-input text-sm w-full"
                            >
                                <option value="">Seleccionar matricula...</option>
                                {profesionalesConMatricula.map((profesional) => (
                                    <option key={`gto-${profesional.id}`} value={String(profesional.matricula)}>
                                        {profesional.matricula} - {profesional.nombre}
                                    </option>
                                ))}
                            </select>
                            <input
                                type="number"
                                min={1}
                                value={matriculaGastos}
                                onChange={(e) => setMatriculaGastos(e.target.value)}
                                placeholder="Ej: 9995"
                                className="his-input text-sm w-full mt-2"
                            />
                        </div>
                    )}
                </div>
            )}

            {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
            )}

            <div className="flex gap-2 pt-1">
                <button
                    onClick={() => void handleGuardar()}
                    disabled={guardando}
                    className="flex items-center gap-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50"
                >
                    {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    Guardar
                </button>
                <button
                    onClick={handleCancelar}
                    className="text-xs text-gray-500 hover:text-gray-700 border rounded-lg px-3 py-1.5 hover:bg-gray-50"
                >
                    Cancelar
                </button>
            </div>

            <datalist id={datalistId}>
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
        </div>
    )
}
