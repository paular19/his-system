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
    type SubitemCodigo,
    obtenerSubitemsSeleccionados,
    valorUnitarioPorSubitem,
} from '@/lib/practicas-subitems'
import { fechaAInputLocal, fechaHoraAInputLocal } from '@/lib/utils/argentina-date'
import { contieneClasificacion, normalizarClasificacionAgrupacion } from '@/modules/orden/clasificacion'

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
const MATRICULA_AYUDANTE_DEFAULT = 995

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

function clasificacionManualDefaultDesdePractica(practica: NomencladorItem): string {
    const soloAnestesia = practica.valorAnestesista != null && practica.valorEspecialista == null && practica.valorGastos == null
    if (soloAnestesia) return 'HA'

    const soloGastos = practica.valorGastos != null && practica.valorEspecialista == null && practica.valorAnestesista == null
    if (soloGastos) return 'GA'

    return 'HE'
}

function alinearClasificacionesPorSubitem(
    subitemsActuales: SubitemCodigo[],
    clasificacionesActuales: string[],
    subitemsBase: SubitemCodigo[]
): string[] {
    if (subitemsActuales.length === 0) return []

    const clavesBase = new Map<string, string>()
    const contadorBase = new Map<string, number>()

    for (let idx = 0; idx < subitemsBase.length; idx += 1) {
        const subitemBase = subitemsBase[idx]
        if (!subitemBase) continue

        const ocurrenciaBase = (contadorBase.get(subitemBase) ?? 0) + 1
        contadorBase.set(subitemBase, ocurrenciaBase)

        const clave = `${subitemBase}#${ocurrenciaBase}`
        const clasificacionBase =
            normalizarClasificacionAgrupacion(clasificacionesActuales[idx]) ??
            clasificacionesActuales[idx]?.trim().toUpperCase() ??
            ''

        if (clasificacionBase) clavesBase.set(clave, clasificacionBase)
    }

    const contadorActual = new Map<string, number>()
    return subitemsActuales.map((subitemActual) => {
        const ocurrenciaActual = (contadorActual.get(subitemActual) ?? 0) + 1
        contadorActual.set(subitemActual, ocurrenciaActual)
        const clave = `${subitemActual}#${ocurrenciaActual}`
        return clavesBase.get(clave) ?? subitemActual
    })
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
    const [matriculaAyudante, setMatriculaAyudante] = useState(String(MATRICULA_AYUDANTE_DEFAULT))

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
            componenteSeleccion,
            { incluirSinValor: true }
        )
    }, [practicaSeleccionada, componenteSeleccion])

    const clasificacionesSubitemsAlineadasForm = useMemo(
        () =>
            alinearClasificacionesPorSubitem(
                subitemsSeleccionadosForm,
                clasificacionPorSubitemNuevo,
                subitemsPreviosRef.current
            ),
        [subitemsSeleccionadosForm, clasificacionPorSubitemNuevo]
    )

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
                value: clasificacionesSubitemsAlineadasForm[idx] ?? subitem,
            }

            if (subitem === 'HE') porComponente.especialista.push(entrada)
            else if (subitem === 'HA') porComponente.anestesista.push(entrada)
            else if (subitem === 'GA') porComponente.gastos.push(entrada)
            else porComponente.ayudante.push(entrada)
        }

        return porComponente
    }, [subitemsSeleccionadosForm, clasificacionesSubitemsAlineadasForm])

    const clasificacionesActivasForm = useMemo(
        () => clasificacionesSubitemsAlineadasForm,
        [clasificacionesSubitemsAlineadasForm]
    )

    const requiereEspecialistaForm = useMemo(
        () =>
            clasificacionesActivasForm.some(
                (clasificacion) =>
                    contieneClasificacion(clasificacion, 'HE') || contieneClasificacion(clasificacion, 'HP')
            ),
        [clasificacionesActivasForm]
    )

    const requiereAnestesistaForm = useMemo(
        () => clasificacionesActivasForm.some((clasificacion) => contieneClasificacion(clasificacion, 'HA')),
        [clasificacionesActivasForm]
    )

    const requiereGastosForm = useMemo(
        () => clasificacionesActivasForm.some((clasificacion) => contieneClasificacion(clasificacion, 'GA')),
        [clasificacionesActivasForm]
    )

    const requiereAyudanteForm = useMemo(
        () =>
            clasificacionesActivasForm.some(
                (clasificacion) =>
                    contieneClasificacion(clasificacion, 'A1') ||
                    contieneClasificacion(clasificacion, 'A2') ||
                    contieneClasificacion(clasificacion, 'A3')
            ),
        [clasificacionesActivasForm]
    )

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
            const subitemsPrevios = subitemsPreviosRef.current
            const clavesPrevias = new Map<string, string>()
            const contadorPrevio = new Map<string, number>()
            for (let idx = 0; idx < subitemsPrevios.length; idx += 1) {
                const subitemPrevio = subitemsPrevios[idx]
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

            // Mantener el ref sincronizado con la misma instantánea que produjo `next`.
            subitemsPreviosRef.current = subitemsSeleccionadosForm
            return next
        })
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

        const qs = new URLSearchParams({
            q: codigoNormalizado,
            exact: '1',
            limit: '20',
        })
        if (convenioId) qs.set('convenioId', String(convenioId))

        const res = await fetch(`/api/practicas-nomenclador?${qs.toString()}`, {
            cache: 'no-store',
        })
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
        setMatriculaAyudante(String(MATRICULA_AYUDANTE_DEFAULT))
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
        let componenteSeleccionActual = componenteSeleccion
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

            const matchLocal = resultados.find(
                (item) => item.codigo.trim().toUpperCase() === codigoManual
            )

            if (matchLocal) {
                practicaBase = matchLocal
                setPracticaSeleccionada(matchLocal)
                setBusqueda(modoCargaRapida ? matchLocal.codigo.trim() : matchLocal.descripcion)
                setResultados([])
                const seleccionSugerida = seleccionPorDefecto({
                    valorEspecialista: matchLocal.valorEspecialista,
                    valorAyudante: matchLocal.valorAyudante,
                    valorAnestesista: matchLocal.valorAnestesista,
                    valorGastos: matchLocal.valorGastos,
                    valorTotal: matchLocal.valor,
                })
                componenteSeleccionActual = seleccionSugerida
                setComponenteSeleccion(seleccionSugerida)
            }

            if (!practicaBase && modoCargaRapida) {
                const practicaManualRapida: NomencladorItem = {
                    convenioId: convenioId ?? 0,
                    codigo: codigoManual,
                    descripcion: codigoManual,
                    valor: null,
                    valorEspecialista: null,
                    valorAyudante: null,
                    valorAnestesista: null,
                    valorGastos: null,
                }

                practicaBase = practicaManualRapida
                setPracticaSeleccionada(practicaManualRapida)
                setBusqueda(codigoManual)
                setResultados([])
                setComponenteSeleccion({ especialista: 0, ayudante: 0, anestesista: 0, gastos: 0 })
            }

            if (!practicaBase) {
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
                    const seleccionSugerida = seleccionPorDefecto({
                        valorEspecialista: matchExacto.valorEspecialista,
                        valorAyudante: matchExacto.valorAyudante,
                        valorAnestesista: matchExacto.valorAnestesista,
                        valorGastos: matchExacto.valorGastos,
                        valorTotal: matchExacto.valor,
                    })
                    componenteSeleccionActual = seleccionSugerida
                    setComponenteSeleccion(seleccionSugerida)
                } catch {
                    setError('No se pudo validar la practica en nomenclador')
                    return
                } finally {
                    setBuscando(false)
                }
            }
        }

        const subitemsSeleccionados = practicaBase
            ? obtenerSubitemsSeleccionados(
                {
                    valorEspecialista: practicaBase.valorEspecialista,
                    valorAyudante: practicaBase.valorAyudante,
                    valorAnestesista: practicaBase.valorAnestesista,
                    valorGastos: practicaBase.valorGastos,
                },
                componenteSeleccionActual,
                { incluirSinValor: true }
            )
            : []

        const clasificacionManualDefault = practicaBase
            ? clasificacionManualDefaultDesdePractica(practicaBase)
            : 'HE'

        const clasificacionesSubitems = alinearClasificacionesPorSubitem(
            subitemsSeleccionados,
            clasificacionPorSubitemNuevo,
            subitemsPreviosRef.current
        )
        const clasificacionesReferencia =
            clasificacionesSubitems.length > 0
                ? clasificacionesSubitems
                : [clasificacionManualDefault]

        const requiereEspecialista = clasificacionesReferencia.some(
            (clasificacion) =>
                contieneClasificacion(clasificacion, 'HE') || contieneClasificacion(clasificacion, 'HP')
        )
        const requiereAnestesista = clasificacionesReferencia.some((clasificacion) => contieneClasificacion(clasificacion, 'HA'))
        const requiereGastos = clasificacionesReferencia.some((clasificacion) => contieneClasificacion(clasificacion, 'GA'))
        const requiereAyudante = clasificacionesReferencia.some(
            (clasificacion) =>
                contieneClasificacion(clasificacion, 'A1') ||
                contieneClasificacion(clasificacion, 'A2') ||
                contieneClasificacion(clasificacion, 'A3')
        )

        if (requiereEspecialista && !matriculaEspecialista.trim()) {
            setError('Ingrese matricula para honorario especialista')
            return
        }
        if (requiereAnestesista && !matriculaAnestesista.trim()) {
            setError('Ingrese matricula para honorario anestesista')
            return
        }
        if (requiereGastos && !matriculaGastos.trim()) {
            setError('Ingrese matricula para derechos/gastos')
            return
        }
        if (requiereAyudante && !matriculaAyudante.trim()) {
            setError('Ingrese matricula para ayudante')
            return
        }

        const matriculaEspecialistaNormalizada =
            matriculaEspecialista.trim() !== ''
                ? Number.parseInt(matriculaEspecialista, 10) || null
                : null
        const matriculaAnestesistaNormalizada =
            matriculaAnestesista.trim() !== ''
                ? Number.parseInt(matriculaAnestesista, 10) || null
                : null
        const matriculaGastosNormalizada =
            matriculaGastos.trim() !== ''
                ? Number.parseInt(matriculaGastos, 10) || null
                : null
        const matriculaAyudanteNormalizada =
            matriculaAyudante.trim() !== ''
                ? Number.parseInt(matriculaAyudante, 10) || null
                : null
        const cantidadGeneral = Number.parseInt(cantidadGeneralPractica, 10)

        if (
            !Number.isFinite(cantidadGeneral) || cantidadGeneral <= 0 || cantidadGeneral > 999
        ) {
            setError('La cantidad general debe estar entre 1 y 999')
            return
        }

        const body: PracticaCargaPayload = {
            convenioId: practicaBase?.convenioId ?? convenioId ?? 0,
            codigoPractica: practicaBase?.codigo ?? busqueda.trim().slice(0, 8).toUpperCase(),
            descripcionPractica: practicaBase?.descripcion ?? busqueda.trim(),
            fecha: fechaPracticaAISOString(fecha, soloFechaPractica),
            cantidad: cantidadGeneral,
            numeroAutorizacion: numeroAutorizacion.trim() || null,
            matriculaEspecialista:
                requiereEspecialista
                    ? matriculaEspecialistaNormalizada
                    : requiereAyudante
                    ? matriculaAyudanteNormalizada
                    : requiereGastos
                    ? matriculaGastosNormalizada
                    : null,
            matriculaAnestesista:
                requiereAnestesista
                    ? matriculaAnestesistaNormalizada
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
                      const total = calcularTotalSeleccionado(vals, componenteSeleccionActual)
                      return total > 0 ? total : null
                  })()
                : null,
        }

        const resolverMatriculasPorClasificacion = (clasificacion: string): {
            matriculaEspecialista: number | null
            matriculaAnestesista: number | null
        } => {
            const usaEspecialista =
                contieneClasificacion(clasificacion, 'HE') || contieneClasificacion(clasificacion, 'HP')
            const usaAnestesista = contieneClasificacion(clasificacion, 'HA')
            const usaAyudante =
                contieneClasificacion(clasificacion, 'A1') ||
                contieneClasificacion(clasificacion, 'A2') ||
                contieneClasificacion(clasificacion, 'A3')
            const usaGastos = contieneClasificacion(clasificacion, 'GA')

            return {
                matriculaEspecialista: usaEspecialista
                    ? matriculaEspecialistaNormalizada
                    : usaAyudante
                    ? matriculaAyudanteNormalizada
                    : usaGastos
                    ? matriculaGastosNormalizada
                    : null,
                matriculaAnestesista: usaAnestesista ? matriculaAnestesistaNormalizada : null,
            }
        }

        const entradasCrear: PracticaCargaEntrada[] = (() => {
            if (!(subitemsSeleccionados.length > 0 && practicaBase)) {
                return [{ payload: body, clasificacion: clasificacionManualDefault }]
            }

            if (crearPracticaTodaJunta) {
                const clasificacionUnica =
                    normalizarClasificacionAgrupacion(clasificacionesSubitems.join('+')) ??
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
                const clasificacionIndividual = clasificacionesSubitems[idx] ?? subitem
                const matriculasClasificacion = resolverMatriculasPorClasificacion(clasificacionIndividual)

                return {
                    payload: {
                        ...body,
                        descripcionPractica: `${body.descripcionPractica} · ${etiquetaSubitem(subitem)}`,
                        importeBaseUnitario: valorUnitario,
                        matriculaEspecialista: matriculasClasificacion.matriculaEspecialista,
                        matriculaAnestesista: matriculasClasificacion.matriculaAnestesista,
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
        <div className="border border-blue-100 bg-blue-50/40 rounded-xl p-3 space-y-2">
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
                        <p className="mb-1 text-[11px] text-gray-500">
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
                            if (e.key !== 'Enter' || !modoCargaRapida || guardando || buscando) return
                            e.preventDefault()

                            if (!practicaSeleccionada) {
                                const codigoBuscado = busqueda.trim().toUpperCase()
                                const exacta = resultados.find(
                                    (item) => item.codigo.trim().toUpperCase() === codigoBuscado
                                )

                                if (exacta) {
                                    seleccionarPractica(exacta, true)
                                    return
                                }

                                if (resultados.length > 0) {
                                    const primera = resultados[0]
                                    if (primera) {
                                        seleccionarPractica(primera, true)
                                        return
                                    }
                                }

                                if (esCodigoPracticaCompleto(codigoBuscado)) {
                                    void (async () => {
                                        setError(null)
                                        setBuscando(true)
                                        try {
                                            const matchExacto = await resolverPracticaExactaPorCodigo(codigoBuscado)
                                            if (!matchExacto) {
                                                setError('Selecciona una practica valida del listado de nomenclador antes de guardar')
                                                return
                                            }
                                            seleccionarPractica(matchExacto, true)
                                        } catch {
                                            setError('No se pudo validar la practica en nomenclador')
                                        } finally {
                                            setBuscando(false)
                                        }
                                    })()
                                    return
                                }

                                setError('Presiona Enter sobre una practica del listado para seleccionarla')
                                return
                            }

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
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <label className="inline-flex items-center gap-2 text-xs text-gray-600">
                        <input
                            type="checkbox"
                            checked={crearPracticaTodaJunta}
                            onChange={(e) => setCrearPracticaTodaJunta(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Cargar practica toda junta (un solo registro con subitems)
                    </label>
                    <div>
                        <label className="mb-0.5 block text-xs text-gray-500">Cantidad general</label>
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
                </div>
            )}

            <div className="grid grid-cols-1 gap-2">
                <div>
                    <label className="mb-0.5 block text-xs text-gray-500">{soloFechaPractica ? 'Fecha' : 'Fecha y hora'}</label>
                    <input
                        type={soloFechaPractica ? 'date' : 'datetime-local'}
                        value={fecha}
                        onChange={(e) => setFecha(e.target.value)}
                        className="his-input text-sm w-full"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 gap-2">
                <div>
                    <label className="mb-0.5 block text-xs text-gray-500">Nro. autorizacion</label>
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
                <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                    {requiereEspecialistaForm && (
                        <div className="space-y-1">
                            <label className="block text-[11px] text-gray-500">Matricula especialista (HE)</label>
                            <select
                                value={matriculaEspecialista}
                                onChange={(e) => setMatriculaEspecialista(e.target.value)}
                                className="his-input h-8 w-full text-xs"
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
                                className="his-input h-8 w-full text-xs"
                            />
                        </div>
                    )}
                    {requiereAnestesistaForm && (
                        <div className="space-y-1">
                            <label className="block text-[11px] text-gray-500">Matricula anestesista (HA)</label>
                            <select
                                value={matriculaAnestesista}
                                onChange={(e) => setMatriculaAnestesista(e.target.value)}
                                className="his-input h-8 w-full text-xs"
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
                                className="his-input h-8 w-full text-xs"
                            />
                        </div>
                    )}
                    {requiereGastosForm && (
                        <div className="space-y-1">
                            <label className="block text-[11px] text-gray-500">Matricula derechos/gastos (GA)</label>
                            <select
                                value={matriculaGastos}
                                onChange={(e) => setMatriculaGastos(e.target.value)}
                                className="his-input h-8 w-full text-xs"
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
                                className="his-input h-8 w-full text-xs"
                            />
                        </div>
                    )}
                    {requiereAyudanteForm && (
                        <div className="space-y-1">
                            <label className="block text-[11px] text-gray-500">Matricula ayudante (AY)</label>
                            <select
                                value={matriculaAyudante}
                                onChange={(e) => setMatriculaAyudante(e.target.value)}
                                className="his-input h-8 w-full text-xs"
                            >
                                <option value="">Seleccionar matricula...</option>
                                {profesionalesConMatricula.map((profesional) => (
                                    <option key={`ayu-${profesional.id}`} value={String(profesional.matricula)}>
                                        {profesional.matricula} - {profesional.nombre}
                                    </option>
                                ))}
                            </select>
                            <input
                                type="number"
                                min={1}
                                value={matriculaAyudante}
                                onChange={(e) => setMatriculaAyudante(e.target.value)}
                                placeholder="Ej: 995"
                                className="his-input h-8 w-full text-xs"
                            />
                        </div>
                    )}
                </div>
            )}

            {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
            )}

            <div className="flex gap-2 pt-0.5">
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
