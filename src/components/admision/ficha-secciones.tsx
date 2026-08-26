'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, Loader2, Pencil, X } from 'lucide-react'
import { ProfesionalSelect } from '@/components/ui/profesional-select'
import { getCatalogosFichaAdmisionAction, updateIngresoAction } from '@/modules/admision/actions'
import type { ActualizarIngresoInput } from '@/modules/admision/schemas'
import type { CatalogosFichaAdmision, IngresoDetalle } from '@/modules/admision/types'
import { formatearFecha, formatearFechaHora } from '@/lib/utils'
import { limpiarObservacionesAdmision } from '@/modules/admision/utils'

// ============================================================
// Catalogos — se cargan una sola vez por sesion de pagina
// ============================================================

const CATALOGOS_VACIOS: CatalogosFichaAdmision = {
    profesionales: [],
    motivosEgreso: [],
    obrasSociales: [],
    planes: [],
    coseguros: [],
}

let catalogosPromesa: Promise<CatalogosFichaAdmision> | null = null

function cargarCatalogos(): Promise<CatalogosFichaAdmision> {
    if (!catalogosPromesa) {
        catalogosPromesa = getCatalogosFichaAdmisionAction().catch((error) => {
            catalogosPromesa = null
            throw error
        })
    }
    return catalogosPromesa
}

/**
 * Carga los catalogos la primera vez que una seccion entra en edicion.
 * Devuelve `cargando` para poder deshabilitar los selects mientras tanto.
 */
export function useCatalogosAdmision() {
    const [catalogos, setCatalogos] = useState<CatalogosFichaAdmision>(CATALOGOS_VACIOS)
    const [cargando, setCargando] = useState(false)
    const montado = useRef(true)

    useEffect(() => {
        montado.current = true
        return () => {
            montado.current = false
        }
    }, [])

    const asegurarCargados = useCallback(async () => {
        setCargando(true)
        try {
            const data = await cargarCatalogos()
            if (montado.current) setCatalogos(data)
        } finally {
            if (montado.current) setCargando(false)
        }
    }, [])

    return { catalogos, cargandoCatalogos: cargando, asegurarCatalogos: asegurarCargados }
}

// ============================================================
// Helpers de conversion de valores
// ============================================================

export function aInputFecha(value: Date | string | null | undefined): string {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

export function aInputFechaHora(value: Date | string | null | undefined): string {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    return `${aInputFecha(date)}T${hh}:${mm}`
}

/** Convierte el valor de un input local (AR) a Date, respetando el huso -03:00. */
export function desdeInputFecha(value: string): Date | null {
    const raw = value.trim()
    if (!raw) return null
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T12:00:00-03:00`)
    const normalizado = raw.length === 16 ? `${raw}:00` : raw
    const parsed = new Date(`${normalizado}-03:00`)
    return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** Texto vacio se guarda como null (borra el dato) en vez de quedar sin efecto. */
function aTextoOpcional(value: string | undefined): string | null {
    const raw = (value ?? '').trim()
    return raw.length > 0 ? raw : null
}

function aIdOpcional(value: string | undefined): number | null {
    const raw = (value ?? '').trim()
    if (!raw) return null
    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

// ============================================================
// Primitivas de UI
// ============================================================

const INPUT_CLASS =
    'w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500'

export function Campo({
    label,
    children,
    ancho = 'normal',
}: {
    label: string
    children: React.ReactNode
    ancho?: 'normal' | 'completo'
}) {
    return (
        <div className={ancho === 'completo' ? 'col-span-full' : undefined}>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">
                {label}
            </label>
            {children}
        </div>
    )
}

export function Vista({
    label,
    value,
    ancho = 'normal',
}: {
    label: string
    value?: string | null
    ancho?: 'normal' | 'completo'
}) {
    return (
        <div className={ancho === 'completo' ? 'col-span-full' : undefined}>
            <dt className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">{label}</dt>
            <dd className={`text-sm ${value ? 'text-gray-900' : 'text-gray-400'}`}>
                {value || '—'}
            </dd>
        </div>
    )
}

/**
 * Select con buscador para listas largas (obras sociales, coseguros).
 * Filtra las opciones sin perder la seleccion actual.
 */
export function SelectBuscable({
    opciones,
    value,
    onChange,
    placeholder = '— Sin seleccionar —',
    buscarPlaceholder = 'Buscar...',
    disabled = false,
}: {
    opciones: Array<{ id: number; nombre: string }>
    value: string
    onChange: (value: string) => void
    placeholder?: string
    buscarPlaceholder?: string
    disabled?: boolean
}) {
    const [termino, setTermino] = useState('')

    const normalizar = (texto: string) =>
        texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

    const filtradas = useMemo(() => {
        const q = normalizar(termino)
        const base = q ? opciones.filter((o) => normalizar(o.nombre).includes(q)) : opciones
        const actual = opciones.find((o) => String(o.id) === value)
        if (actual && !base.some((o) => o.id === actual.id)) return [actual, ...base]
        return base
    }, [opciones, termino, value])

    return (
        <div className="space-y-1">
            <input
                type="text"
                value={termino}
                onChange={(e) => setTermino(e.target.value)}
                placeholder={buscarPlaceholder}
                disabled={disabled}
                className="w-full rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-100"
            />
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                className={INPUT_CLASS}
            >
                <option value="">{placeholder}</option>
                {filtradas.map((o) => (
                    <option key={o.id} value={String(o.id)}>
                        {o.nombre}
                    </option>
                ))}
            </select>
            {termino && (
                <p className="text-[11px] text-gray-400">
                    {filtradas.length} coincidencia(s)
                </p>
            )}
        </div>
    )
}

export function InputTexto(props: React.InputHTMLAttributes<HTMLInputElement>) {
    return <input type="text" {...props} className={INPUT_CLASS} />
}

export function InputFecha(props: React.InputHTMLAttributes<HTMLInputElement>) {
    return <input type="date" {...props} className={INPUT_CLASS} />
}

export function InputFechaHora(props: React.InputHTMLAttributes<HTMLInputElement>) {
    return <input type="datetime-local" {...props} className={INPUT_CLASS} />
}

export function AreaTexto(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return <textarea {...props} className={`${INPUT_CLASS} resize-y`} />
}

export function SelectSimple(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return <select {...props} className={INPUT_CLASS} />
}

// ============================================================
// Card con edicion inline
// ============================================================

interface SeccionEditableProps<T> {
    titulo: string
    puedeModificar: boolean
    /** Valores del formulario a partir del ingreso actual. */
    valoresIniciales: () => T
    /** Persiste los cambios. Si lanza, el error se muestra sin cerrar el form. */
    onGuardar: (valores: T) => Promise<void>
    /** Se llama al entrar en edicion (ej. cargar catalogos). */
    onAbrir?: () => void
    vista: React.ReactNode
    campos: (ctx: {
        valores: T
        setValor: <K extends keyof T>(campo: K, valor: T[K]) => void
        guardando: boolean
    }) => React.ReactNode
    accionesCabecera?: React.ReactNode
    /** Clases del grid del formulario y de la vista. */
    grid?: string
}

export function SeccionEditable<T extends Record<string, unknown>>({
    titulo,
    puedeModificar,
    valoresIniciales,
    onGuardar,
    onAbrir,
    vista,
    campos,
    accionesCabecera,
    grid = 'grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3',
}: SeccionEditableProps<T>) {
    const [editando, setEditando] = useState(false)
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [exito, setExito] = useState(false)
    const [valores, setValores] = useState<T>(() => valoresIniciales())
    const exitoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        return () => {
            if (exitoTimeoutRef.current) clearTimeout(exitoTimeoutRef.current)
        }
    }, [])

    const setValor = useCallback(<K extends keyof T>(campo: K, valor: T[K]) => {
        setValores((prev) => ({ ...prev, [campo]: valor }))
    }, [])

    const abrir = () => {
        setValores(valoresIniciales())
        setError(null)
        setExito(false)
        setEditando(true)
        onAbrir?.()
    }

    const cerrar = () => {
        setEditando(false)
        setError(null)
    }

    const submit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        if (guardando) return

        setGuardando(true)
        setError(null)
        try {
            await onGuardar(valores)
            setEditando(false)
            setExito(true)
            if (exitoTimeoutRef.current) clearTimeout(exitoTimeoutRef.current)
            exitoTimeoutRef.current = setTimeout(() => setExito(false), 4000)
        } catch (err) {
            setError(
                err instanceof Error && err.message.trim().length > 0
                    ? err.message
                    : 'No se pudieron guardar los cambios'
            )
        } finally {
            setGuardando(false)
        }
    }

    return (
        <div className="his-card p-5">
            <div className="mb-4 flex items-center justify-between gap-3 border-b pb-2">
                <h3 className="text-sm font-semibold text-gray-700">{titulo}</h3>
                <div className="flex items-center gap-3">
                    {accionesCabecera}
                    {puedeModificar && !editando && (
                        <button
                            type="button"
                            onClick={abrir}
                            title={`Editar ${titulo.toLowerCase()}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 transition-colors hover:text-blue-600"
                        >
                            <Pencil className="h-3.5 w-3.5" />
                            Editar
                        </button>
                    )}
                </div>
            </div>

            {exito && !editando && (
                <div className="mb-3 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Cambios guardados.
                </div>
            )}

            {editando ? (
                <form
                    onSubmit={submit}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape' && !guardando) cerrar()
                    }}
                >
                    <div className={grid}>{campos({ valores, setValor, guardando })}</div>

                    {error && (
                        <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="mt-4 flex items-center gap-2 border-t pt-3">
                        <button
                            type="submit"
                            disabled={guardando}
                            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            {guardando ? 'Guardando...' : 'Guardar'}
                        </button>
                        <button
                            type="button"
                            onClick={cerrar}
                            disabled={guardando}
                            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
                        >
                            <X className="h-3.5 w-3.5" />
                            Cancelar
                        </button>
                        <span className="text-xs text-gray-400">Esc para cancelar</span>
                    </div>
                </form>
            ) : (
                <dl className={grid}>{vista}</dl>
            )}
        </div>
    )
}

// ============================================================
// Secciones concretas de la ficha
// ============================================================

const LABEL_ESTADO: Record<string, string> = {
    A: 'Activo',
    E: 'Egresado',
    P: 'Pendiente',
    X: 'Anulado',
}

interface SeccionProps {
    ingreso: IngresoDetalle
    puedeModificar: boolean
    /** Notifica al contenedor para refrescar datos derivados (ej. imprimible). */
    onGuardado?: (parcial: Partial<IngresoDetalle>) => void
}

export function SeccionDatosAdmision({
    ingreso,
    puedeModificar,
    onGuardado,
    esIngresoAmbulatorio,
    esGuardia,
    ocultarEgresoPrevisto,
    profesionalTratanteNombre,
    profesionalTratanteMatricula,
}: SeccionProps & {
    esIngresoAmbulatorio: boolean
    esGuardia: boolean
    ocultarEgresoPrevisto: boolean
    profesionalTratanteNombre: string | null
    profesionalTratanteMatricula: number | null
}) {
    const router = useRouter()
    const { catalogos, cargandoCatalogos, asegurarCatalogos } = useCatalogosAdmision()
    const esInternacion = ingreso.tipoIngresoCodigo === 'INT'

    const [datos, setDatos] = useState(() => ({
        fechaIngreso: ingreso.fechaIngreso,
        fechaEgreso: ingreso.fechaEgreso,
        fechaEgresoPrevista: ingreso.fechaEgresoPrevista,
        estado: (ingreso.estado ?? '').trim().toUpperCase(),
        motivoEgresoCodigo: ingreso.motivoEgresoCodigo ?? null,
        profesionalGuardiaId: ingreso.profesionalGuardiaId ?? null,
        profesionalGuardiaNombre: ingreso.profesionalGuardia?.nombre ?? null,
        profesionalTratanteId: ingreso.profesionalTratanteId ?? null,
        profesionalTratanteNombre,
        profesionalTratanteMatricula,
    }))

    useEffect(() => {
        setDatos({
            fechaIngreso: ingreso.fechaIngreso,
            fechaEgreso: ingreso.fechaEgreso,
            fechaEgresoPrevista: ingreso.fechaEgresoPrevista,
            estado: (ingreso.estado ?? '').trim().toUpperCase(),
            motivoEgresoCodigo: ingreso.motivoEgresoCodigo ?? null,
            profesionalGuardiaId: ingreso.profesionalGuardiaId ?? null,
            profesionalGuardiaNombre: ingreso.profesionalGuardia?.nombre ?? null,
            profesionalTratanteId: ingreso.profesionalTratanteId ?? null,
            profesionalTratanteNombre,
            profesionalTratanteMatricula,
        })
    }, [
        ingreso.fechaIngreso,
        ingreso.fechaEgreso,
        ingreso.fechaEgresoPrevista,
        ingreso.estado,
        ingreso.motivoEgresoCodigo,
        ingreso.profesionalGuardiaId,
        ingreso.profesionalGuardia?.nombre,
        ingreso.profesionalTratanteId,
        profesionalTratanteNombre,
        profesionalTratanteMatricula,
    ])

    const motivoEgresoDescripcion = catalogos.motivosEgreso.find(
        (m) => m.codigo === datos.motivoEgresoCodigo
    )?.descripcion

    return (
        <SeccionEditable
            titulo="Datos de la Admisión"
            puedeModificar={puedeModificar}
            onAbrir={() => void asegurarCatalogos()}
            valoresIniciales={() => ({
                fechaIngreso: aInputFechaHora(datos.fechaIngreso),
                fechaEgreso: aInputFechaHora(datos.fechaEgreso),
                fechaEgresoPrevista: aInputFecha(datos.fechaEgresoPrevista),
                estado: datos.estado,
                motivoEgresoCodigo: datos.motivoEgresoCodigo ?? '',
                profesionalGuardiaId: datos.profesionalGuardiaId ? String(datos.profesionalGuardiaId) : '',
                profesionalTratanteId: datos.profesionalTratanteId ? String(datos.profesionalTratanteId) : '',
            })}
            onGuardar={async (v) => {
                const payload: ActualizarIngresoInput = {
                    fechaIngreso: desdeInputFecha(v.fechaIngreso) ?? undefined,
                    estado: (v.estado || undefined) as ActualizarIngresoInput['estado'],
                    profesionalGuardiaId: aIdOpcional(v.profesionalGuardiaId),
                    ...(!esIngresoAmbulatorio ? { fechaEgreso: desdeInputFecha(v.fechaEgreso) } : {}),
                    ...(!ocultarEgresoPrevisto
                        ? { fechaEgresoPrevista: desdeInputFecha(v.fechaEgresoPrevista) }
                        : {}),
                    ...(!esGuardia ? { profesionalTratanteId: aIdOpcional(v.profesionalTratanteId) } : {}),
                    ...(esInternacion ? { motivoEgresoCodigo: aTextoOpcional(v.motivoEgresoCodigo) } : {}),
                }

                await updateIngresoAction(ingreso.id, payload)

                const profesionalGuardiaId = aIdOpcional(v.profesionalGuardiaId)
                const profesionalTratanteId = aIdOpcional(v.profesionalTratanteId)
                const nombrePorId = (id: number | null) =>
                    id ? (catalogos.profesionales.find((p) => p.id === id)?.nombre ?? null) : null
                // La matricula se muestra aparte del nombre: si no se actualiza junto con el
                // profesional, la vista sigue mostrando la del tratante original.
                const matriculaPorId = (id: number | null) =>
                    id ? (catalogos.profesionales.find((p) => p.id === id)?.matricula ?? null) : null

                setDatos((prev) => ({
                    ...prev,
                    fechaIngreso: desdeInputFecha(v.fechaIngreso) ?? prev.fechaIngreso,
                    fechaEgreso: esIngresoAmbulatorio ? prev.fechaEgreso : desdeInputFecha(v.fechaEgreso),
                    fechaEgresoPrevista: ocultarEgresoPrevisto
                        ? prev.fechaEgresoPrevista
                        : desdeInputFecha(v.fechaEgresoPrevista),
                    estado: v.estado,
                    motivoEgresoCodigo: esInternacion
                        ? aTextoOpcional(v.motivoEgresoCodigo)
                        : prev.motivoEgresoCodigo,
                    profesionalGuardiaId,
                    profesionalGuardiaNombre: nombrePorId(profesionalGuardiaId) ?? prev.profesionalGuardiaNombre,
                    profesionalTratanteId: esGuardia ? prev.profesionalTratanteId : profesionalTratanteId,
                    profesionalTratanteNombre: esGuardia
                        ? prev.profesionalTratanteNombre
                        : nombrePorId(profesionalTratanteId),
                    profesionalTratanteMatricula: esGuardia
                        ? prev.profesionalTratanteMatricula
                        : matriculaPorId(profesionalTratanteId),
                }))

                onGuardado?.({
                    fechaIngreso: desdeInputFecha(v.fechaIngreso) ?? ingreso.fechaIngreso,
                    fechaEgreso: esIngresoAmbulatorio ? ingreso.fechaEgreso : desdeInputFecha(v.fechaEgreso),
                    estado: v.estado || null,
                })

                router.refresh()
            }}
            vista={
                <>
                    <Vista
                        label="Tipo de Ingreso"
                        value={
                            ingreso.ingresoSubtipo?.subtipoAdmision?.descripcion
                            ?? ingreso.tipoIngreso?.descripcion
                            ?? ingreso.tipoIngresoCodigo
                        }
                    />
                    <Vista
                        label="Número de Ingreso"
                        value={`${ingreso.tipoIngresoCodigo}-${ingreso.numeroIngreso}`}
                    />
                    <Vista label="Estado" value={LABEL_ESTADO[datos.estado] ?? datos.estado} />
                    <Vista label="Fecha de Ingreso" value={formatearFechaHora(datos.fechaIngreso)} />
                    {!esIngresoAmbulatorio && (
                        <Vista label="Fecha de Egreso / Alta" value={formatearFechaHora(datos.fechaEgreso)} />
                    )}
                    {!ocultarEgresoPrevisto && (
                        <Vista label="Egreso Previsto" value={formatearFecha(datos.fechaEgresoPrevista)} />
                    )}
                    {esInternacion && (
                        <Vista
                            label="Motivo de Egreso"
                            value={motivoEgresoDescripcion ?? datos.motivoEgresoCodigo}
                        />
                    )}
                    <Vista label="Profesional Guardia" value={datos.profesionalGuardiaNombre} />
                    {!esGuardia && (
                        <Vista label="Profesional Tratante" value={datos.profesionalTratanteNombre} />
                    )}
                    {!esGuardia && (
                        <Vista
                            label="Matrícula Tratante"
                            value={
                                datos.profesionalTratanteMatricula
                                    ? String(datos.profesionalTratanteMatricula)
                                    : null
                            }
                        />
                    )}
                    <Vista label="Profesional Interviniente" value={ingreso.profesionalInterviniente?.nombre} />
                    {ingreso.cama && (
                        <Vista
                            label="Cama"
                            value={`${ingreso.cama.identificador} (${ingreso.cama.sector}${ingreso.cama.habitacion ? ` · ${ingreso.cama.habitacion}` : ''})`}
                        />
                    )}
                </>
            }
            campos={({ valores, setValor, guardando }) => (
                <>
                    <Campo label="Fecha y hora de ingreso">
                        <InputFechaHora
                            value={valores.fechaIngreso}
                            onChange={(e) => setValor('fechaIngreso', e.target.value)}
                            disabled={guardando}
                        />
                    </Campo>
                    {!esIngresoAmbulatorio && (
                        <Campo label="Fecha y hora de egreso / alta">
                            <InputFechaHora
                                value={valores.fechaEgreso}
                                onChange={(e) => setValor('fechaEgreso', e.target.value)}
                                disabled={guardando}
                            />
                        </Campo>
                    )}
                    {!ocultarEgresoPrevisto && (
                        <Campo label="Egreso previsto">
                            <InputFecha
                                value={valores.fechaEgresoPrevista}
                                onChange={(e) => setValor('fechaEgresoPrevista', e.target.value)}
                                disabled={guardando}
                            />
                        </Campo>
                    )}
                    <Campo label="Estado">
                        <SelectSimple
                            value={valores.estado}
                            onChange={(e) => setValor('estado', e.target.value)}
                            disabled={guardando}
                        >
                            <option value="">— Sin estado —</option>
                            <option value="A">Activo</option>
                            <option value="E">Egresado</option>
                            <option value="P">Pendiente</option>
                            <option value="X">Anulado</option>
                        </SelectSimple>
                    </Campo>
                    {esInternacion && (
                        <Campo label="Motivo de egreso">
                            <SelectSimple
                                value={valores.motivoEgresoCodigo}
                                onChange={(e) => setValor('motivoEgresoCodigo', e.target.value)}
                                disabled={guardando || cargandoCatalogos}
                            >
                                <option value="">— Sin motivo —</option>
                                {catalogos.motivosEgreso.map((m) => (
                                    <option key={m.codigo} value={m.codigo}>
                                        {m.descripcion}
                                    </option>
                                ))}
                            </SelectSimple>
                        </Campo>
                    )}
                    <Campo label="Profesional guardia">
                        <ProfesionalSelect
                            profesionales={catalogos.profesionales}
                            value={valores.profesionalGuardiaId}
                            onChange={(next) => setValor('profesionalGuardiaId', next)}
                            disabled={guardando || cargandoCatalogos}
                            placeholderOption="— Sin profesional —"
                            selectClassName={INPUT_CLASS}
                        />
                    </Campo>
                    {!esGuardia && (
                        <Campo label="Profesional tratante">
                            <ProfesionalSelect
                                profesionales={catalogos.profesionales}
                                value={valores.profesionalTratanteId}
                                onChange={(next) => setValor('profesionalTratanteId', next)}
                                disabled={guardando || cargandoCatalogos}
                                placeholderOption="— Sin profesional —"
                                selectClassName={INPUT_CLASS}
                            />
                        </Campo>
                    )}
                    {cargandoCatalogos && (
                        <p className="col-span-full inline-flex items-center gap-1.5 text-xs text-gray-500">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Cargando profesionales...
                        </p>
                    )}
                </>
            )}
        />
    )
}

export function SeccionResponsable({ ingreso, puedeModificar, onGuardado }: SeccionProps) {
    const router = useRouter()

    const [datos, setDatos] = useState(() => ({
        nombreTutor: ingreso.nombreTutor ?? null,
        telefonoTutor: ingreso.telefonoTutor ?? null,
    }))

    useEffect(() => {
        setDatos({
            nombreTutor: ingreso.nombreTutor ?? null,
            telefonoTutor: ingreso.telefonoTutor ?? null,
        })
    }, [ingreso.nombreTutor, ingreso.telefonoTutor])

    const domicilio = ingreso.paciente?.domicilio ?? null

    return (
        <SeccionEditable
            titulo="Responsable del Paciente"
            puedeModificar={puedeModificar}
            valoresIniciales={() => ({
                nombreTutor: datos.nombreTutor ?? '',
                telefonoTutor: datos.telefonoTutor ?? '',
            })}
            onGuardar={async (v) => {
                const nombreTutor = aTextoOpcional(v.nombreTutor)
                const telefonoTutor = aTextoOpcional(v.telefonoTutor)

                await updateIngresoAction(ingreso.id, { nombreTutor, telefonoTutor })

                setDatos({ nombreTutor, telefonoTutor })
                onGuardado?.({ nombreTutor, telefonoTutor })
                router.refresh()
            }}
            vista={
                <>
                    <Vista label="Familiar / Responsable" value={datos.nombreTutor} />
                    <Vista label="Teléfono del responsable" value={datos.telefonoTutor} />
                    <Vista label="Domicilio del paciente" value={domicilio} />
                </>
            }
            campos={({ valores, setValor, guardando }) => (
                <>
                    <Campo label="Familiar / Responsable">
                        <InputTexto
                            value={valores.nombreTutor}
                            onChange={(e) => setValor('nombreTutor', e.target.value)}
                            maxLength={100}
                            placeholder="Nombre y apellido"
                            disabled={guardando}
                        />
                    </Campo>
                    <Campo label="Teléfono del responsable">
                        <InputTexto
                            value={valores.telefonoTutor}
                            onChange={(e) => setValor('telefonoTutor', e.target.value)}
                            maxLength={50}
                            placeholder="Teléfono de contacto"
                            disabled={guardando}
                        />
                    </Campo>
                    <Campo label="Domicilio del paciente">
                        <p className="rounded-md bg-gray-50 px-2.5 py-1.5 text-sm text-gray-600">
                            {domicilio || '—'}
                            <span className="mt-0.5 block text-[11px] text-gray-400">
                                Se edita desde la ficha del paciente
                            </span>
                        </p>
                    </Campo>
                </>
            )}
        />
    )
}

export function SeccionCobertura({
    ingreso,
    puedeModificar,
    onGuardado,
}: SeccionProps) {
    const router = useRouter()
    const { catalogos, cargandoCatalogos, asegurarCatalogos } = useCatalogosAdmision()

    const [datos, setDatos] = useState(() => ({
        obraSocialId: ingreso.obraSocialId ?? null,
        obraSocialNombre: ingreso.obraSocial?.nombre ?? null,
        numeroAfiliado: ingreso.numeroAfiliado ?? null,
        obraSocialCoseguroId: ingreso.obraSocialCoseguroId ?? null,
        obraSocialCoseguroNombre: ingreso.obraSocialCoseguroNombre ?? null,
        numeroAfiliadoCoseguro: ingreso.numeroAfiliadoCoseguro ?? null,
    }))

    useEffect(() => {
        setDatos({
            obraSocialId: ingreso.obraSocialId ?? null,
            obraSocialNombre: ingreso.obraSocial?.nombre ?? null,
            numeroAfiliado: ingreso.numeroAfiliado ?? null,
            obraSocialCoseguroId: ingreso.obraSocialCoseguroId ?? null,
            obraSocialCoseguroNombre: ingreso.obraSocialCoseguroNombre ?? null,
            numeroAfiliadoCoseguro: ingreso.numeroAfiliadoCoseguro ?? null,
        })
    }, [
        ingreso.obraSocialId,
        ingreso.obraSocial?.nombre,
        ingreso.numeroAfiliado,
        ingreso.obraSocialCoseguroId,
        ingreso.obraSocialCoseguroNombre,
        ingreso.numeroAfiliadoCoseguro,
    ])

    return (
        <SeccionEditable
            titulo="Cobertura Médica"
            puedeModificar={puedeModificar}
            onAbrir={() => void asegurarCatalogos()}
            grid="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2"
            valoresIniciales={() => ({
                obraSocialId: datos.obraSocialId ? String(datos.obraSocialId) : '',
                numeroAfiliado: datos.numeroAfiliado ?? '',
                obraSocialCoseguroId: datos.obraSocialCoseguroId ? String(datos.obraSocialCoseguroId) : '',
                numeroAfiliadoCoseguro: datos.numeroAfiliadoCoseguro ?? '',
            })}
            onGuardar={async (v) => {
                const obraSocialId = aIdOpcional(v.obraSocialId)
                const obraSocialCoseguroId = obraSocialId ? aIdOpcional(v.obraSocialCoseguroId) : null
                const numeroAfiliado = aTextoOpcional(v.numeroAfiliado)
                const numeroAfiliadoCoseguro = obraSocialCoseguroId
                    ? aTextoOpcional(v.numeroAfiliadoCoseguro)
                    : null

                await updateIngresoAction(ingreso.id, {
                    obraSocialId,
                    numeroAfiliado,
                    obraSocialCoseguroId,
                    numeroAfiliadoCoseguro,
                })

                const obraSocialNombre = obraSocialId
                    ? (catalogos.obrasSociales.find((os) => os.id === obraSocialId)?.nombre
                        ?? datos.obraSocialNombre
                        ?? `ID ${obraSocialId}`)
                    : null
                const obraSocialCoseguroNombre = obraSocialCoseguroId
                    ? (catalogos.coseguros.find((c) => c.id === obraSocialCoseguroId)?.nombre
                        ?? `ID ${obraSocialCoseguroId}`)
                    : null

                setDatos({
                    obraSocialId,
                    obraSocialNombre,
                    numeroAfiliado,
                    obraSocialCoseguroId,
                    obraSocialCoseguroNombre,
                    numeroAfiliadoCoseguro,
                })

                onGuardado?.({
                    obraSocialId,
                    numeroAfiliado,
                    obraSocialCoseguroId,
                    obraSocialCoseguroNombre,
                    obraSocial: obraSocialId ? { id: obraSocialId, nombre: obraSocialNombre ?? '' } : null,
                })

                router.refresh()
            }}
            vista={
                <>
                    <Vista label="Obra Social" value={datos.obraSocialNombre ?? 'Particular'} />
                    <Vista label="Número de Afiliado" value={datos.numeroAfiliado} />
                    <Vista label="Coseguro" value={datos.obraSocialCoseguroNombre} />
                    <Vista label="N° Afiliado Coseguro" value={datos.numeroAfiliadoCoseguro} />
                </>
            }
            campos={({ valores, setValor, guardando }) => {
                const obraSocialSeleccionada = catalogos.obrasSociales.find(
                    (os) => String(os.id) === valores.obraSocialId
                )
                const permiteCoseguro = Boolean(valores.obraSocialId)

                return (
                    <>
                        <Campo label="Obra social">
                            <SelectBuscable
                                opciones={catalogos.obrasSociales}
                                value={valores.obraSocialId}
                                onChange={(next) => {
                                    setValor('obraSocialId', next)
                                    if (!next) {
                                        setValor('obraSocialCoseguroId', '')
                                        setValor('numeroAfiliadoCoseguro', '')
                                    }
                                }}
                                placeholder="Particular (sin obra social)"
                                buscarPlaceholder="Buscar obra social..."
                                disabled={guardando || cargandoCatalogos}
                            />
                            {obraSocialSeleccionada?.requiereCoseguro && (
                                <p className="mt-1 text-[11px] text-amber-700">
                                    Esta obra social requiere coseguro.
                                </p>
                            )}
                        </Campo>
                        <Campo label="Número de afiliado">
                            <InputTexto
                                value={valores.numeroAfiliado}
                                onChange={(e) => setValor('numeroAfiliado', e.target.value)}
                                maxLength={50}
                                disabled={guardando}
                            />
                        </Campo>
                        <Campo label="Coseguro">
                            <SelectBuscable
                                opciones={catalogos.coseguros}
                                value={valores.obraSocialCoseguroId}
                                onChange={(next) => {
                                    setValor('obraSocialCoseguroId', next)
                                    if (!next) setValor('numeroAfiliadoCoseguro', '')
                                }}
                                placeholder="— Sin coseguro —"
                                buscarPlaceholder="Buscar coseguro..."
                                disabled={guardando || cargandoCatalogos || !permiteCoseguro}
                            />
                            {!permiteCoseguro && (
                                <p className="mt-1 text-[11px] text-gray-400">
                                    Elegí una obra social para poder cargar coseguro.
                                </p>
                            )}
                        </Campo>
                        <Campo label="N° afiliado coseguro">
                            <InputTexto
                                value={valores.numeroAfiliadoCoseguro}
                                onChange={(e) => setValor('numeroAfiliadoCoseguro', e.target.value)}
                                maxLength={50}
                                disabled={guardando || !valores.obraSocialCoseguroId}
                            />
                        </Campo>
                        {cargandoCatalogos && (
                            <p className="col-span-full inline-flex items-center gap-1.5 text-xs text-gray-500">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Cargando obras sociales...
                            </p>
                        )}
                    </>
                )
            }}
        />
    )
}

export function SeccionDiagnostico({ ingreso, puedeModificar, onGuardado }: SeccionProps) {
    const router = useRouter()

    const [datos, setDatos] = useState(() => ({
        descripcionPatologia: ingreso.descripcionPatologia ?? null,
        descripcionPatologiaDefinitiva: ingreso.descripcionPatologiaDefinitiva ?? null,
    }))

    useEffect(() => {
        setDatos({
            descripcionPatologia: ingreso.descripcionPatologia ?? null,
            descripcionPatologiaDefinitiva: ingreso.descripcionPatologiaDefinitiva ?? null,
        })
    }, [ingreso.descripcionPatologia, ingreso.descripcionPatologiaDefinitiva])

    return (
        <SeccionEditable
            titulo="Diagnóstico"
            puedeModificar={puedeModificar}
            grid="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2"
            valoresIniciales={() => ({
                descripcionPatologia: datos.descripcionPatologia ?? '',
                descripcionPatologiaDefinitiva: datos.descripcionPatologiaDefinitiva ?? '',
            })}
            onGuardar={async (v) => {
                const descripcionPatologia = aTextoOpcional(v.descripcionPatologia)
                const descripcionPatologiaDefinitiva = aTextoOpcional(v.descripcionPatologiaDefinitiva)

                await updateIngresoAction(ingreso.id, {
                    descripcionPatologia,
                    descripcionPatologiaDefinitiva,
                })

                setDatos({ descripcionPatologia, descripcionPatologiaDefinitiva })
                onGuardado?.({ descripcionPatologia, descripcionPatologiaDefinitiva })
                router.refresh()
            }}
            vista={
                <>
                    <Vista label="Presuntivo" value={datos.descripcionPatologia} ancho="completo" />
                    <Vista label="Definitivo" value={datos.descripcionPatologiaDefinitiva} ancho="completo" />
                </>
            }
            campos={({ valores, setValor, guardando }) => (
                <>
                    <Campo label="Diagnóstico presuntivo" ancho="completo">
                        <AreaTexto
                            rows={3}
                            maxLength={500}
                            value={valores.descripcionPatologia}
                            onChange={(e) => setValor('descripcionPatologia', e.target.value)}
                            disabled={guardando}
                        />
                    </Campo>
                    <Campo label="Diagnóstico definitivo" ancho="completo">
                        <AreaTexto
                            rows={3}
                            maxLength={500}
                            value={valores.descripcionPatologiaDefinitiva}
                            onChange={(e) => setValor('descripcionPatologiaDefinitiva', e.target.value)}
                            disabled={guardando}
                        />
                    </Campo>
                </>
            )}
        />
    )
}

export function SeccionObservaciones({ ingreso, puedeModificar, onGuardado }: SeccionProps) {
    const router = useRouter()

    const [observaciones, setObservaciones] = useState(
        () => limpiarObservacionesAdmision(ingreso.observaciones)
    )

    useEffect(() => {
        setObservaciones(limpiarObservacionesAdmision(ingreso.observaciones))
    }, [ingreso.observaciones])

    return (
        <SeccionEditable
            titulo="Observaciones"
            puedeModificar={puedeModificar}
            grid="grid grid-cols-1"
            valoresIniciales={() => ({ observaciones: observaciones ?? '' })}
            onGuardar={async (v) => {
                const texto = aTextoOpcional(v.observaciones)
                await updateIngresoAction(ingreso.id, { observaciones: texto })
                setObservaciones(texto)
                onGuardado?.({ observaciones: texto })
                router.refresh()
            }}
            vista={
                <p className={`whitespace-pre-line text-sm ${observaciones ? 'text-gray-600' : 'text-gray-400'}`}>
                    {observaciones || 'Sin observaciones registradas.'}
                </p>
            }
            campos={({ valores, setValor, guardando }) => (
                <AreaTexto
                    rows={5}
                    maxLength={2000}
                    value={valores.observaciones}
                    onChange={(e) => setValor('observaciones', e.target.value)}
                    placeholder="Observaciones sobre la admisión del paciente..."
                    disabled={guardando}
                />
            )}
        />
    )
}

export function SeccionSubtipo({ ingreso, puedeModificar }: SeccionProps) {
    const router = useRouter()
    const { catalogos, cargandoCatalogos, asegurarCatalogos } = useCatalogosAdmision()
    const sub = ingreso.ingresoSubtipo
    const codigo = sub?.subtipoAdmisionCodigo ?? ''

    const [datos, setDatos] = useState(() => ({
        centroDerivante: sub?.centroDerivante ?? null,
        profesionalDerivanteNombre: sub?.profesionalDerivanteNombre ?? null,
        motivoDerivacion: sub?.motivoDerivacion ?? null,
        diagnosticoDerivacion: sub?.diagnosticoDerivacion ?? null,
        practicaCodigo: sub?.practicaCodigo ?? null,
        fechaTurno: sub?.fechaTurno ?? null,
        profesionalIdTurno: sub?.profesionalIdTurno ?? null,
        tipoIndicacion: sub?.tipoIndicacion ?? null,
        descripcionIndicacion: sub?.descripcionIndicacion ?? null,
        profesionalIndicadorNombre: sub?.profesionalIndicadorNombre ?? null,
    }))

    useEffect(() => {
        setDatos({
            centroDerivante: sub?.centroDerivante ?? null,
            profesionalDerivanteNombre: sub?.profesionalDerivanteNombre ?? null,
            motivoDerivacion: sub?.motivoDerivacion ?? null,
            diagnosticoDerivacion: sub?.diagnosticoDerivacion ?? null,
            practicaCodigo: sub?.practicaCodigo ?? null,
            fechaTurno: sub?.fechaTurno ?? null,
            profesionalIdTurno: sub?.profesionalIdTurno ?? null,
            tipoIndicacion: sub?.tipoIndicacion ?? null,
            descripcionIndicacion: sub?.descripcionIndicacion ?? null,
            profesionalIndicadorNombre: sub?.profesionalIndicadorNombre ?? null,
        })
    }, [sub])

    const esDerivacion = codigo === 'DER'
    const esTurno = codigo === 'TUR' || codigo === 'RAY' || codigo === 'PAM'
    const esIndicacion = codigo === 'IND'

    if (!sub || (!esDerivacion && !esTurno && !esIndicacion)) return null

    const titulo = esDerivacion
        ? 'Información de Derivación'
        : esTurno
            ? 'Ingreso por Turno / Práctica'
            : 'Indicación Médica'

    return (
        <SeccionEditable
            titulo={titulo}
            puedeModificar={puedeModificar}
            onAbrir={() => void asegurarCatalogos()}
            grid="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2"
            valoresIniciales={() => ({
                centroDerivante: datos.centroDerivante ?? '',
                profesionalDerivanteNombre: datos.profesionalDerivanteNombre ?? '',
                motivoDerivacion: datos.motivoDerivacion ?? '',
                diagnosticoDerivacion: datos.diagnosticoDerivacion ?? '',
                practicaCodigo: datos.practicaCodigo ?? '',
                fechaTurno: aInputFechaHora(datos.fechaTurno),
                profesionalIdTurno: datos.profesionalIdTurno ? String(datos.profesionalIdTurno) : '',
                tipoIndicacion: datos.tipoIndicacion ?? '',
                descripcionIndicacion: datos.descripcionIndicacion ?? '',
                profesionalIndicadorNombre: datos.profesionalIndicadorNombre ?? '',
            })}
            onGuardar={async (v) => {
                const payload: ActualizarIngresoInput = esDerivacion
                    ? {
                        centroDerivante: aTextoOpcional(v.centroDerivante),
                        profesionalDerivanteNombre: aTextoOpcional(v.profesionalDerivanteNombre),
                        motivoDerivacion: aTextoOpcional(v.motivoDerivacion),
                        diagnosticoDerivacion: aTextoOpcional(v.diagnosticoDerivacion),
                    }
                    : esTurno
                        ? {
                            practicaCodigo: aTextoOpcional(v.practicaCodigo),
                            fechaTurno: desdeInputFecha(v.fechaTurno),
                            profesionalIdTurno: aIdOpcional(v.profesionalIdTurno),
                        }
                        : {
                            tipoIndicacion: aTextoOpcional(v.tipoIndicacion),
                            descripcionIndicacion: aTextoOpcional(v.descripcionIndicacion),
                            profesionalIndicadorNombre: aTextoOpcional(v.profesionalIndicadorNombre),
                        }

                await updateIngresoAction(ingreso.id, payload)

                setDatos((prev) => ({
                    ...prev,
                    ...(esDerivacion
                        ? {
                            centroDerivante: aTextoOpcional(v.centroDerivante),
                            profesionalDerivanteNombre: aTextoOpcional(v.profesionalDerivanteNombre),
                            motivoDerivacion: aTextoOpcional(v.motivoDerivacion),
                            diagnosticoDerivacion: aTextoOpcional(v.diagnosticoDerivacion),
                        }
                        : {}),
                    ...(esTurno
                        ? {
                            practicaCodigo: aTextoOpcional(v.practicaCodigo),
                            fechaTurno: desdeInputFecha(v.fechaTurno),
                            profesionalIdTurno: aIdOpcional(v.profesionalIdTurno),
                        }
                        : {}),
                    ...(esIndicacion
                        ? {
                            tipoIndicacion: aTextoOpcional(v.tipoIndicacion),
                            descripcionIndicacion: aTextoOpcional(v.descripcionIndicacion),
                            profesionalIndicadorNombre: aTextoOpcional(v.profesionalIndicadorNombre),
                        }
                        : {}),
                }))

                router.refresh()
            }}
            vista={
                <>
                    {esDerivacion && (
                        <>
                            <Vista label="Centro derivante" value={datos.centroDerivante} />
                            <Vista label="Profesional derivante" value={datos.profesionalDerivanteNombre} />
                            <Vista label="Motivo de derivación" value={datos.motivoDerivacion} ancho="completo" />
                            <Vista
                                label="Diagnóstico de derivación"
                                value={datos.diagnosticoDerivacion}
                                ancho="completo"
                            />
                        </>
                    )}
                    {esTurno && (
                        <>
                            <Vista label="Código de práctica" value={datos.practicaCodigo} />
                            <Vista label="Fecha de turno" value={formatearFechaHora(datos.fechaTurno)} />
                        </>
                    )}
                    {esIndicacion && (
                        <>
                            <Vista
                                label="Profesional interviniente"
                                value={
                                    ingreso.profesionalInterviniente?.nombre
                                    ?? datos.profesionalIndicadorNombre
                                }
                            />
                            <Vista label="Tipo de indicación" value={datos.tipoIndicacion} />
                            <Vista label="Descripción" value={datos.descripcionIndicacion} ancho="completo" />
                        </>
                    )}
                </>
            }
            campos={({ valores, setValor, guardando }) => (
                <>
                    {esDerivacion && (
                        <>
                            <Campo label="Centro derivante">
                                <InputTexto
                                    value={valores.centroDerivante}
                                    onChange={(e) => setValor('centroDerivante', e.target.value)}
                                    maxLength={200}
                                    disabled={guardando}
                                />
                            </Campo>
                            <Campo label="Profesional derivante">
                                <InputTexto
                                    value={valores.profesionalDerivanteNombre}
                                    onChange={(e) => setValor('profesionalDerivanteNombre', e.target.value)}
                                    maxLength={200}
                                    disabled={guardando}
                                />
                            </Campo>
                            <Campo label="Motivo de derivación" ancho="completo">
                                <AreaTexto
                                    rows={2}
                                    maxLength={500}
                                    value={valores.motivoDerivacion}
                                    onChange={(e) => setValor('motivoDerivacion', e.target.value)}
                                    disabled={guardando}
                                />
                            </Campo>
                            <Campo label="Diagnóstico de derivación" ancho="completo">
                                <AreaTexto
                                    rows={2}
                                    maxLength={500}
                                    value={valores.diagnosticoDerivacion}
                                    onChange={(e) => setValor('diagnosticoDerivacion', e.target.value)}
                                    disabled={guardando}
                                />
                            </Campo>
                        </>
                    )}
                    {esTurno && (
                        <>
                            <Campo label="Código de práctica">
                                <InputTexto
                                    value={valores.practicaCodigo}
                                    onChange={(e) => setValor('practicaCodigo', e.target.value)}
                                    maxLength={50}
                                    disabled={guardando}
                                />
                            </Campo>
                            <Campo label="Fecha y hora de turno">
                                <InputFechaHora
                                    value={valores.fechaTurno}
                                    onChange={(e) => setValor('fechaTurno', e.target.value)}
                                    disabled={guardando}
                                />
                            </Campo>
                            <Campo label="Profesional del turno">
                                <ProfesionalSelect
                                    profesionales={catalogos.profesionales}
                                    value={valores.profesionalIdTurno}
                                    onChange={(next) => setValor('profesionalIdTurno', next)}
                                    disabled={guardando || cargandoCatalogos}
                                    placeholderOption="— Sin profesional —"
                                    selectClassName={INPUT_CLASS}
                                />
                            </Campo>
                        </>
                    )}
                    {esIndicacion && (
                        <>
                            <Campo label="Profesional interviniente">
                                <InputTexto
                                    value={valores.profesionalIndicadorNombre}
                                    onChange={(e) => setValor('profesionalIndicadorNombre', e.target.value)}
                                    maxLength={200}
                                    disabled={guardando}
                                />
                            </Campo>
                            <Campo label="Tipo de indicación">
                                <InputTexto
                                    value={valores.tipoIndicacion}
                                    onChange={(e) => setValor('tipoIndicacion', e.target.value)}
                                    maxLength={100}
                                    disabled={guardando}
                                />
                            </Campo>
                            <Campo label="Descripción" ancho="completo">
                                <AreaTexto
                                    rows={2}
                                    maxLength={500}
                                    value={valores.descripcionIndicacion}
                                    onChange={(e) => setValor('descripcionIndicacion', e.target.value)}
                                    disabled={guardando}
                                />
                            </Campo>
                        </>
                    )}
                </>
            )}
        />
    )
}
