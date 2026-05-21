'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Stethoscope, Search, Plus, Loader2, X, ChevronDown, ChevronUp } from 'lucide-react'
import type { PracticaItem } from '@/modules/internacion/types'
import { formatearNumeroOrden } from '@/modules/orden/types'
import {
    ComponenteSelector,
    type ComponenteValores,
    type ComponenteSeleccion,
    calcularTotalSeleccionado,
    seleccionPorDefecto,
} from '@/components/ui/componente-selector'

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

const formatoMoneda = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
})

const MATRICULA_ANESTESISTA_DEFAULT = 6

interface PracticaSectionProps {
    ingresoId: number
    convenioId: number | null
    practicas: PracticaItem[]
    puedeCrear: boolean
    matriculaTratanteDefault?: number | null
}

export function PracticaSection({
    ingresoId,
    convenioId,
    practicas: practicasIniciales,
    puedeCrear,
    matriculaTratanteDefault,
}: PracticaSectionProps) {
    const router = useRouter()
    const [practicas, setPracticas] = useState<PracticaItem[]>(practicasIniciales)
    const [mostrarForm, setMostrarForm] = useState(false)
    const [expandido, setExpandido] = useState(true)

    // Búsqueda nomenclador
    const [busqueda, setBusqueda] = useState('')
    const [resultados, setResultados] = useState<NomencladorItem[]>([])
    const [buscando, setBuscando] = useState(false)
    const [practicaSeleccionada, setPracticaSeleccionada] = useState<NomencladorItem | null>(null)

    // Selector de componentes
    const [componenteSeleccion, setComponenteSeleccion] = useState<ComponenteSeleccion>({
        especialista: 0, ayudante: 0, anestesista: 0, gastos: 0,
    })

    // Campos del form
    const [cantidad, setCantidad] = useState('1')
    const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 16))
    const [numeroAutorizacion, setNumeroAutorizacion] = useState('')
    const [matriculaEspecialista, setMatriculaEspecialista] = useState(
        matriculaTratanteDefault ? String(matriculaTratanteDefault) : ''
    )
    const [matriculaAnestesista, setMatriculaAnestesista] = useState(
        String(MATRICULA_ANESTESISTA_DEFAULT)
    )

    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
                setResultados(Array.isArray(json.data) ? json.data : [])
            } catch {
                setResultados([])
            } finally {
                setBuscando(false)
            }
        }, 350)
    }

    const seleccionarPractica = (p: NomencladorItem) => {
        setPracticaSeleccionada(p)
        setBusqueda(p.descripcion)
        setResultados([])
        const valores: ComponenteValores = {
            valorEspecialista: p.valorEspecialista,
            valorAyudante: p.valorAyudante,
            valorAnestesista: p.valorAnestesista,
            valorGastos: p.valorGastos,
            valorTotal: p.valor,
        }
        setComponenteSeleccion(seleccionPorDefecto(valores))
    }

    const limpiarForm = () => {
        setBusqueda('')
        setResultados([])
        setPracticaSeleccionada(null)
        setComponenteSeleccion({ especialista: 0, ayudante: 0, anestesista: 0, gastos: 0 })
        setCantidad('1')
        setFecha(new Date().toISOString().slice(0, 16))
        setNumeroAutorizacion('')
        setMatriculaEspecialista(matriculaTratanteDefault ? String(matriculaTratanteDefault) : '')
        setMatriculaAnestesista(String(MATRICULA_ANESTESISTA_DEFAULT))
        setError(null)
    }

    const handleGuardar = async () => {
        setError(null)
        if (!practicaSeleccionada && !busqueda.trim()) {
            return setError('Seleccioná una práctica del nomenclador o escribí un código')
        }
        const cantNum = parseFloat(cantidad)
        if (isNaN(cantNum) || cantNum <= 0) {
            return setError('La cantidad debe ser mayor a 0')
        }
        if ((practicaSeleccionada?.valorEspecialista != null) && !matriculaEspecialista.trim()) {
            return setError('Ingrese matrícula para honorario especialista')
        }
        if ((practicaSeleccionada?.valorAnestesista != null) && !matriculaAnestesista.trim()) {
            return setError('Ingrese matrícula para honorario anestesista')
        }

        const requiereEspecialista = practicaSeleccionada?.valorEspecialista != null
        const requiereAnestesista = practicaSeleccionada?.valorAnestesista != null

        const body = {
            convenioId: practicaSeleccionada?.convenioId ?? convenioId ?? 0,
            codigoPractica: practicaSeleccionada?.codigo ?? busqueda.trim().slice(0, 8).toUpperCase(),
            descripcionPractica: practicaSeleccionada?.descripcion ?? busqueda.trim(),
            fecha: new Date(fecha).toISOString(),
            cantidad: cantNum,
            numeroAutorizacion: numeroAutorizacion.trim() || null,
            matriculaEspecialista:
                requiereEspecialista && matriculaEspecialista.trim()
                    ? parseInt(matriculaEspecialista, 10) || null
                    : null,
            matriculaAnestesista:
                requiereAnestesista && matriculaAnestesista.trim()
                    ? parseInt(matriculaAnestesista, 10) || null
                    : null,
            facturable: true,
            importeBaseUnitario: practicaSeleccionada
                ? (() => {
                    const vals: ComponenteValores = {
                        valorEspecialista: practicaSeleccionada.valorEspecialista,
                        valorAyudante: practicaSeleccionada.valorAyudante,
                        valorAnestesista: practicaSeleccionada.valorAnestesista,
                        valorGastos: practicaSeleccionada.valorGastos,
                        valorTotal: practicaSeleccionada.valor,
                    }
                    const t = calcularTotalSeleccionado(vals, componenteSeleccion)
                    return t > 0 ? t : null
                })()
                : null,
        }

        setGuardando(true)
        try {
            const res = await fetch(`/api/internacion/${ingresoId}/practicas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const json = await res.json()
            if (!res.ok) {
                setError(json.error ?? 'Error al registrar la práctica')
                return
            }
            setPracticas((prev) => [json.data, ...prev])
            router.refresh()
            limpiarForm()
            setMostrarForm(false)
        } catch {
            setError('Error de conexión')
        } finally {
            setGuardando(false)
        }
    }

    const fmtFecha = (d: Date | string) =>
        new Date(d).toLocaleString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })

    const practicasPendientes = practicas.filter((p) => (p.ordenPractica?.length ?? 0) === 0)
    const practicasAutorizadas = practicas.filter((p) => (p.ordenPractica?.length ?? 0) > 0)
    const mostrarBotonGenerar = puedeCrear && practicas.length > 0
    const botonGenerarHabilitado = practicasPendientes.length > 0

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
                    {mostrarBotonGenerar && (
                        botonGenerarHabilitado ? (
                            <Link
                                href={`/dashboard/ambulatorio/nueva?ingresoId=${ingresoId}`}
                                className="flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 border border-emerald-200 rounded-lg px-2.5 py-1 hover:bg-emerald-50"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                Generar autorización
                            </Link>
                        ) : (
                            <button
                                type="button"
                                disabled
                                title="No hay prácticas pendientes de autorización"
                                className="flex items-center gap-1 text-xs font-medium text-gray-400 border border-gray-200 rounded-lg px-2.5 py-1 bg-gray-50 cursor-not-allowed"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                Generar autorización
                            </button>
                        )
                    )}
                    {puedeCrear && (
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
                    )}
                </div>
            </div>

            {expandido && (
                <div className="p-4 space-y-4">
                    {/* Formulario */}
                    {mostrarForm && puedeCrear && (
                        <div className="border border-blue-100 bg-blue-50/40 rounded-xl p-4 space-y-3">
                            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                                Nueva práctica
                            </p>

                            {/* Búsqueda nomenclador */}
                            <div className="relative">
                                <label className="block text-xs text-gray-500 mb-1">
                                    Buscar en nomenclador
                                </label>
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                                    <input
                                        type="text"
                                        value={busqueda}
                                        onChange={(e) => buscarPractica(e.target.value)}
                                        placeholder="Código o descripción (mín. 2 caracteres)..."
                                        className="his-input pl-8 pr-8 text-sm w-full"
                                    />
                                    {buscando && (
                                        <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 animate-spin" />
                                    )}
                                    {practicaSeleccionada && (
                                        <button
                                            onClick={() => { setPracticaSeleccionada(null); setBusqueda('') }}
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

                            {/* Selector de componentes */}
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
                                />
                            )}

                            {/* Fecha y cantidad */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Fecha y hora</label>
                                    <input
                                        type="datetime-local"
                                        value={fecha}
                                        onChange={(e) => setFecha(e.target.value)}
                                        className="his-input text-sm w-full"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Cantidad</label>
                                    <input
                                        type="number"
                                        min="0.25"
                                        step="0.25"
                                        value={cantidad}
                                        onChange={(e) => setCantidad(e.target.value)}
                                        className="his-input text-sm w-full"
                                    />
                                </div>
                            </div>

                            {/* Nro autorización */}
                            <div className="grid grid-cols-1 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Nro. autorización</label>
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
                                            <label className="block text-xs text-gray-500 mb-1">Matrícula especialista (HE)</label>
                                            <input
                                                type="number"
                                                min={1}
                                                value={matriculaEspecialista}
                                                onChange={(e) => setMatriculaEspecialista(e.target.value)}
                                                placeholder="Ej: 12345"
                                                className="his-input text-sm w-full"
                                            />
                                        </div>
                                    )}
                                    {practicaSeleccionada.valorAnestesista != null && (
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">Matrícula anestesista (HA)</label>
                                            <input
                                                type="number"
                                                min={1}
                                                value={matriculaAnestesista}
                                                onChange={(e) => setMatriculaAnestesista(e.target.value)}
                                                placeholder="Ej: 12345"
                                                className="his-input text-sm w-full"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {error && (
                                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
                                    {error}
                                </p>
                            )}

                            <div className="flex gap-2 pt-1">
                                <button
                                    onClick={handleGuardar}
                                    disabled={guardando}
                                    className="flex items-center gap-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {guardando ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Plus className="h-3.5 w-3.5" />
                                    )}
                                    Guardar
                                </button>
                                <button
                                    onClick={() => { setMostrarForm(false); limpiarForm() }}
                                    className="text-xs text-gray-500 hover:text-gray-700 border rounded-lg px-3 py-1.5 hover:bg-gray-50"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Lista de prácticas */}
                    {practicas.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-3">
                            Sin prácticas registradas
                        </p>
                    ) : (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                                    Pendientes de autorización ({practicasPendientes.length})
                                </p>
                                {practicasPendientes.length === 0 ? (
                                    <p className="text-xs text-gray-400">No hay prácticas pendientes.</p>
                                ) : (
                                    practicasPendientes.map((p) => (
                                        <div
                                            key={p.id}
                                            className="flex items-start justify-between gap-3 text-xs border rounded-lg p-2.5 bg-white"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-mono text-gray-400 shrink-0">
                                                        {p.codigoPractica.trim()}
                                                    </span>
                                                    <span className="font-medium text-gray-800 truncate">
                                                        {p.descripcionPractica ?? p.codigoPractica.trim()}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3 mt-1 text-gray-500 flex-wrap">
                                                    <span>{fmtFecha(p.fecha)}</span>
                                                    <span>Cant: {p.cantidad}</span>
                                                    {p.numeroAutorizacion && <span>Aut: {p.numeroAutorizacion}</span>}
                                                    <span
                                                        className={`px-1.5 py-0.5 rounded ${p.facturable
                                                            ? 'bg-green-50 text-green-700'
                                                            : 'bg-gray-100 text-gray-500'
                                                            }`}
                                                    >
                                                        {p.facturable ? 'Facturable' : 'No facturable'}
                                                    </span>
                                                </div>
                                            </div>
                                            {p.estado && p.estado !== 'A' && (
                                                <span className="text-gray-400 shrink-0">{p.estado}</span>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="space-y-2">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                    Ya autorizadas ({practicasAutorizadas.length})
                                </p>
                                {practicasAutorizadas.length === 0 ? (
                                    <p className="text-xs text-gray-400">No hay prácticas autorizadas.</p>
                                ) : (
                                    practicasAutorizadas.map((p) => (
                                        <div
                                            key={p.id}
                                            className="flex items-start justify-between gap-3 text-xs border border-emerald-200 rounded-lg p-2.5 bg-emerald-50/40"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-mono text-emerald-800/70 shrink-0">
                                                        {p.codigoPractica.trim()}
                                                    </span>
                                                    <span className="font-medium text-emerald-900 truncate">
                                                        {p.descripcionPractica ?? p.codigoPractica.trim()}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3 mt-1 text-emerald-700 flex-wrap">
                                                    <span>{fmtFecha(p.fecha)}</span>
                                                    <span>Cant: {p.cantidad}</span>
                                                    <span className="font-medium">
                                                        {formatearNumeroOrden(
                                                            p.ordenPractica?.[0]!.puestoNumero,
                                                            p.ordenPractica?.[0]!.ordenNumero,
                                                            p.ordenPractica?.[0]!.item
                                                        )}
                                                        {p.ordenPractica?.[0]!.numeroAutorizacion
                                                            ? ` · ${p.ordenPractica?.[0]!.numeroAutorizacion}`
                                                            : ' · falta N° de autorización'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
