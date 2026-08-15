'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Loader2, Search } from 'lucide-react'
import { ActualizarPracticaSchema } from '@/modules/internacion/schemas'
import { claveDiaArgentina, fechaDesdeClaveArgentina } from '@/lib/utils/argentina-date'

export interface PracticaEditable {
    id: number
    ingresoId: number
    convenioId: number
    codigoPractica: string
    descripcionPractica: string | null
    fecha: Date | string
    cantidad: number
    importeTotal?: number | null
    numeroAutorizacion: string | null
    matriculaEspecialista?: number | null
    matriculaAnestesista?: number | null
    facturable: boolean
    facturada?: boolean
}

interface ResultadoNomenclador {
    convenioId: number
    codigo: string
    descripcion: string
}

const INPUT_CLASS =
    'w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100'

function aInputFecha(value: Date | string | null | undefined): string {
    const clave = claveDiaArgentina(value)
    if (clave) return clave
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toISOString().slice(0, 10)
}

function normalizarFechaArgentina(value: string): Date {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
        return fechaDesdeClaveArgentina(value.trim())
    }
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

/**
 * Cambios a aplicar sobre una practica. Lo que no viene se toma de la practica actual,
 * porque el PATCH del backend espera el payload completo.
 */
export interface CambiosPractica {
    convenioId?: number
    codigoPractica?: string
    descripcionPractica?: string | null
    fecha?: Date
    cantidad?: number
    numeroAutorizacion?: string | null
}

export async function actualizarPracticaRequest(
    ingresoId: number,
    practica: PracticaEditable,
    cambios: CambiosPractica
): Promise<{ ok: true } | { ok: false; error: string }> {
    const cantidad = cambios.cantidad ?? Number(practica.cantidad)
    const cantidadValida = Number.isFinite(cantidad) && cantidad > 0 ? Math.floor(cantidad) : 1

    try {
        const payload = ActualizarPracticaSchema.parse({
            convenioId: cambios.convenioId ?? practica.convenioId,
            codigoPractica: (cambios.codigoPractica ?? practica.codigoPractica).trim(),
            descripcionPractica:
                cambios.descripcionPractica !== undefined
                    ? cambios.descripcionPractica
                    : practica.descripcionPractica,
            fecha: cambios.fecha ?? normalizarFechaArgentina(aInputFecha(practica.fecha)),
            cantidad: cantidadValida,
            numeroAutorizacion:
                cambios.numeroAutorizacion !== undefined
                    ? (cambios.numeroAutorizacion?.trim() || null)
                    : (practica.numeroAutorizacion?.trim() || null),
            facturable: Boolean(practica.facturable),
            matriculaEspecialista: practica.matriculaEspecialista ?? null,
            matriculaAnestesista: practica.matriculaAnestesista ?? null,
            importeBaseUnitario:
                practica.importeTotal != null && Number(practica.cantidad) > 0
                    ? Number(practica.importeTotal) / Number(practica.cantidad)
                    : null,
        })

        const res = await fetch(`/api/internacion/${ingresoId}/practicas/${practica.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })

        if (!res.ok) {
            const json = await res.json().catch(() => null)
            return { ok: false, error: json?.error ?? 'No se pudo guardar la práctica' }
        }

        return { ok: true }
    } catch (err) {
        return {
            ok: false,
            error: err instanceof Error && err.message ? err.message : 'No se pudo guardar la práctica',
        }
    }
}

/** Aplica los mismos cambios a varias practicas, de a una, y agrega los errores. */
async function aplicarEnLote(
    ingresoId: number,
    practicas: PracticaEditable[],
    cambios: CambiosPractica,
    onProgreso: (hechas: number) => void
): Promise<{ exitosas: number; errores: string[] }> {
    let exitosas = 0
    const errores: string[] = []

    for (const [indice, practica] of practicas.entries()) {
        const resultado = await actualizarPracticaRequest(ingresoId, practica, cambios)
        if (resultado.ok) exitosas += 1
        else errores.push(`${practica.codigoPractica.trim()}: ${resultado.error}`)
        onProgreso(indice + 1)
    }

    return { exitosas, errores }
}

// ============================================================
// Buscador de codigo de nomenclador
// ============================================================

function BuscadorNomenclador({
    convenioId,
    onSeleccionar,
    disabled,
}: {
    convenioId: number | null
    onSeleccionar: (item: ResultadoNomenclador) => void
    disabled?: boolean
}) {
    const [termino, setTermino] = useState('')
    const [resultados, setResultados] = useState<ResultadoNomenclador[]>([])
    const [buscando, setBuscando] = useState(false)

    useEffect(() => {
        const q = termino.trim()
        if (q.length < 2) {
            setResultados([])
            return
        }

        const timer = setTimeout(async () => {
            setBuscando(true)
            try {
                const params = new URLSearchParams({ q })
                if (convenioId) params.set('convenioId', String(convenioId))
                const res = await fetch(`/api/practicas-nomenclador?${params.toString()}`)
                const json = await res.json().catch(() => null)
                setResultados(json?.ok && Array.isArray(json.data) ? json.data : [])
            } catch {
                setResultados([])
            } finally {
                setBuscando(false)
            }
        }, 350)

        return () => clearTimeout(timer)
    }, [termino, convenioId])

    return (
        <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
                type="text"
                value={termino}
                onChange={(e) => setTermino(e.target.value)}
                placeholder="Buscar otro código o descripción..."
                disabled={disabled}
                className={`${INPUT_CLASS} pl-7`}
            />
            {buscando && (
                <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-gray-400" />
            )}
            {resultados.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
                    {resultados.map((r) => (
                        <button
                            key={`${r.convenioId}-${r.codigo}`}
                            type="button"
                            onClick={() => {
                                onSeleccionar(r)
                                setTermino('')
                                setResultados([])
                            }}
                            className="block w-full px-2.5 py-1.5 text-left hover:bg-blue-50"
                        >
                            <span className="font-mono text-[11px] text-gray-500">{r.codigo.trim()}</span>
                            <span className="ml-2 text-xs text-gray-900">{r.descripcion}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

// ============================================================
// Edicion de una practica (con opcion de aplicar a toda la orden)
// ============================================================

export function PracticaEdicionForm({
    ingresoId,
    practica,
    practicasDelGrupo,
    tituloGrupo,
    onListo,
    onCancelar,
}: {
    ingresoId: number
    practica: PracticaEditable
    /** Todas las practicas de la orden/grupo del que salio esta practica. */
    practicasDelGrupo: PracticaEditable[]
    tituloGrupo: string | null
    onListo: () => Promise<void> | void
    onCancelar: () => void
}) {
    const [codigo, setCodigo] = useState(practica.codigoPractica.trim())
    const [descripcion, setDescripcion] = useState(practica.descripcionPractica ?? '')
    const [convenioId, setConvenioId] = useState(practica.convenioId)
    const [cantidad, setCantidad] = useState(String(practica.cantidad))
    const [fecha, setFecha] = useState(aInputFecha(practica.fecha))
    const [numeroAutorizacion, setNumeroAutorizacion] = useState(practica.numeroAutorizacion ?? '')
    const [aplicarATodas, setAplicarATodas] = useState(false)
    const [guardando, setGuardando] = useState(false)
    const [progreso, setProgreso] = useState(0)
    const [error, setError] = useState<string | null>(null)

    const otras = practicasDelGrupo.filter((p) => p.id !== practica.id)
    const puedeAplicarATodas = otras.length > 0

    const guardar = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        if (guardando) return

        const codigoLimpio = codigo.trim()
        if (!codigoLimpio) {
            setError('El código de práctica es obligatorio')
            return
        }

        setGuardando(true)
        setError(null)
        setProgreso(0)

        try {
            const propagables: CambiosPractica = {
                fecha: fecha ? normalizarFechaArgentina(fecha) : undefined,
                numeroAutorizacion: numeroAutorizacion.trim() || null,
            }

            const principal = await actualizarPracticaRequest(ingresoId, practica, {
                ...propagables,
                convenioId,
                codigoPractica: codigoLimpio,
                descripcionPractica: descripcion.trim() || null,
                cantidad: Number(cantidad),
            })

            if (!principal.ok) {
                setError(principal.error)
                return
            }

            if (aplicarATodas && puedeAplicarATodas) {
                const { errores } = await aplicarEnLote(ingresoId, otras, propagables, setProgreso)
                if (errores.length > 0) {
                    setError(
                        `Se guardó la práctica, pero ${errores.length} de la orden fallaron. ${errores[0]}`
                    )
                    await onListo()
                    return
                }
            }

            await onListo()
        } finally {
            setGuardando(false)
        }
    }

    return (
        <form
            onSubmit={guardar}
            className="mb-3 rounded-md border border-blue-200 bg-blue-50/60 p-3"
            onKeyDown={(e) => {
                if (e.key === 'Escape' && !guardando) onCancelar()
            }}
        >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-blue-800">
                Editar práctica{tituloGrupo ? ` · ${tituloGrupo}` : ''}
            </p>

            <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-3">
                <div>
                    <label className="mb-1 block text-[11px] text-gray-600">Código</label>
                    <input
                        type="text"
                        value={codigo}
                        onChange={(e) => setCodigo(e.target.value)}
                        maxLength={8}
                        disabled={guardando}
                        className={`${INPUT_CLASS} font-mono`}
                    />
                </div>
                <div className="sm:col-span-2">
                    <label className="mb-1 block text-[11px] text-gray-600">
                        Cambiar por otra práctica del nomenclador
                    </label>
                    <BuscadorNomenclador
                        convenioId={convenioId}
                        disabled={guardando}
                        onSeleccionar={(item) => {
                            setCodigo(item.codigo.trim())
                            setDescripcion(item.descripcion)
                            setConvenioId(item.convenioId)
                        }}
                    />
                </div>
                <div className="sm:col-span-3">
                    <label className="mb-1 block text-[11px] text-gray-600">Descripción</label>
                    <input
                        type="text"
                        value={descripcion}
                        onChange={(e) => setDescripcion(e.target.value)}
                        maxLength={200}
                        disabled={guardando}
                        className={INPUT_CLASS}
                        placeholder="Descripción de la práctica"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-[11px] text-gray-600">Cantidad</label>
                    <input
                        type="number"
                        min={1}
                        value={cantidad}
                        onChange={(e) => setCantidad(e.target.value)}
                        disabled={guardando}
                        className={INPUT_CLASS}
                    />
                </div>
                <div>
                    <label className="mb-1 block text-[11px] text-gray-600">Fecha</label>
                    <input
                        type="date"
                        value={fecha}
                        onChange={(e) => setFecha(e.target.value)}
                        disabled={guardando}
                        className={INPUT_CLASS}
                    />
                </div>
                <div>
                    <label className="mb-1 block text-[11px] text-gray-600">N° autorización</label>
                    <input
                        type="text"
                        value={numeroAutorizacion}
                        onChange={(e) => setNumeroAutorizacion(e.target.value)}
                        maxLength={50}
                        disabled={guardando}
                        className={INPUT_CLASS}
                        placeholder="Opcional"
                    />
                </div>
            </div>

            {puedeAplicarATodas && (
                <label className="mt-2 flex items-start gap-2 rounded border border-blue-200 bg-white/70 px-2 py-1.5 text-xs text-blue-900">
                    <input
                        type="checkbox"
                        checked={aplicarATodas}
                        onChange={(e) => setAplicarATodas(e.target.checked)}
                        disabled={guardando}
                        className="mt-0.5 h-3.5 w-3.5 rounded border-blue-300"
                    />
                    <span>
                        Aplicar <strong>N° de autorización y fecha</strong> a las {practicasDelGrupo.length} prácticas
                        de esta orden
                        <span className="block text-[11px] text-blue-700">
                            El código, la descripción y la cantidad se guardan sólo en esta práctica.
                        </span>
                    </span>
                </label>
            )}

            {error && (
                <div className="mt-2 flex items-start gap-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            <div className="mt-2 flex items-center gap-2">
                <button
                    type="submit"
                    disabled={guardando}
                    className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                    {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {guardando
                        ? aplicarATodas && progreso > 0
                            ? `Aplicando ${progreso}/${otras.length}...`
                            : 'Guardando...'
                        : 'Guardar'}
                </button>
                <button
                    type="button"
                    onClick={onCancelar}
                    disabled={guardando}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                    Cancelar
                </button>
            </div>
        </form>
    )
}

// ============================================================
// Edicion masiva de las practicas seleccionadas
// ============================================================

export function PracticasEdicionMasiva({
    ingresoId,
    practicas,
    onListo,
    onCancelar,
}: {
    ingresoId: number
    practicas: PracticaEditable[]
    onListo: () => Promise<void> | void
    onCancelar: () => void
}) {
    const [aplicarFecha, setAplicarFecha] = useState(false)
    const [fecha, setFecha] = useState(aInputFecha(practicas[0]?.fecha))
    const [aplicarAutorizacion, setAplicarAutorizacion] = useState(false)
    const [numeroAutorizacion, setNumeroAutorizacion] = useState('')
    const [aplicarCantidad, setAplicarCantidad] = useState(false)
    const [cantidad, setCantidad] = useState('1')
    const [guardando, setGuardando] = useState(false)
    const [progreso, setProgreso] = useState(0)
    const [error, setError] = useState<string | null>(null)

    const nadaSeleccionado = !aplicarFecha && !aplicarAutorizacion && !aplicarCantidad

    const guardar = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        if (guardando || nadaSeleccionado) return

        setGuardando(true)
        setError(null)
        setProgreso(0)

        try {
            const cambios: CambiosPractica = {
                ...(aplicarFecha && fecha ? { fecha: normalizarFechaArgentina(fecha) } : {}),
                ...(aplicarAutorizacion ? { numeroAutorizacion: numeroAutorizacion.trim() || null } : {}),
                ...(aplicarCantidad ? { cantidad: Number(cantidad) } : {}),
            }

            const { exitosas, errores } = await aplicarEnLote(ingresoId, practicas, cambios, setProgreso)

            if (errores.length > 0) {
                setError(
                    `Se actualizaron ${exitosas} de ${practicas.length}. ${errores.length} fallaron: ${errores[0]}`
                )
                await onListo()
                return
            }

            await onListo()
        } finally {
            setGuardando(false)
        }
    }

    return (
        <form
            onSubmit={guardar}
            className="mb-3 rounded-md border border-indigo-200 bg-indigo-50/60 p-3"
            onKeyDown={(e) => {
                if (e.key === 'Escape' && !guardando) onCancelar()
            }}
        >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-indigo-800">
                Editar {practicas.length} práctica(s) seleccionada(s)
            </p>
            <p className="mb-2 text-[11px] text-indigo-700">
                Sólo se modifican los campos que tildes. El resto queda como está en cada práctica.
            </p>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="rounded border border-indigo-200 bg-white/70 p-2">
                    <label className="mb-1 flex items-center gap-2 text-[11px] font-medium text-indigo-900">
                        <input
                            type="checkbox"
                            checked={aplicarFecha}
                            onChange={(e) => setAplicarFecha(e.target.checked)}
                            disabled={guardando}
                            className="h-3.5 w-3.5 rounded border-indigo-300"
                        />
                        Fecha
                    </label>
                    <input
                        type="date"
                        value={fecha}
                        onChange={(e) => setFecha(e.target.value)}
                        disabled={guardando || !aplicarFecha}
                        className={INPUT_CLASS}
                    />
                </div>
                <div className="rounded border border-indigo-200 bg-white/70 p-2">
                    <label className="mb-1 flex items-center gap-2 text-[11px] font-medium text-indigo-900">
                        <input
                            type="checkbox"
                            checked={aplicarAutorizacion}
                            onChange={(e) => setAplicarAutorizacion(e.target.checked)}
                            disabled={guardando}
                            className="h-3.5 w-3.5 rounded border-indigo-300"
                        />
                        N° autorización
                    </label>
                    <input
                        type="text"
                        value={numeroAutorizacion}
                        onChange={(e) => setNumeroAutorizacion(e.target.value)}
                        maxLength={50}
                        placeholder="Vacío = borrar"
                        disabled={guardando || !aplicarAutorizacion}
                        className={INPUT_CLASS}
                    />
                </div>
                <div className="rounded border border-indigo-200 bg-white/70 p-2">
                    <label className="mb-1 flex items-center gap-2 text-[11px] font-medium text-indigo-900">
                        <input
                            type="checkbox"
                            checked={aplicarCantidad}
                            onChange={(e) => setAplicarCantidad(e.target.checked)}
                            disabled={guardando}
                            className="h-3.5 w-3.5 rounded border-indigo-300"
                        />
                        Cantidad
                    </label>
                    <input
                        type="number"
                        min={1}
                        value={cantidad}
                        onChange={(e) => setCantidad(e.target.value)}
                        disabled={guardando || !aplicarCantidad}
                        className={INPUT_CLASS}
                    />
                </div>
            </div>

            {error && (
                <div className="mt-2 flex items-start gap-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            <div className="mt-2 flex items-center gap-2">
                <button
                    type="submit"
                    disabled={guardando || nadaSeleccionado}
                    className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {guardando
                        ? `Aplicando ${progreso}/${practicas.length}...`
                        : `Aplicar a ${practicas.length} práctica(s)`}
                </button>
                <button
                    type="button"
                    onClick={onCancelar}
                    disabled={guardando}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                    Cancelar
                </button>
            </div>
        </form>
    )
}
