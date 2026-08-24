'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Loader2, Printer, Search } from 'lucide-react'
import {
    CATEGORIAS_PRACTICA,
    CATEGORIA_PRACTICA_LABEL,
    type CategoriaPractica,
} from '@/modules/facturacion/categorias-practica'
import type {
    EstadoLoteLiquidacion,
    LiquidacionResumen,
    ProfesionalEfectorItem,
} from '@/modules/liquidacion-profesionales/types'
import { formatearFechaArgentina } from '@/lib/utils/argentina-date'
import { LiquidacionPrint } from './liquidacion-print'
import { descargarLiquidacionPdf } from './liquidacion-pdf'

type ObraSocialItem = { id: number; nombre: string }

const ESTADOS_LOTE: Array<{ id: EstadoLoteLiquidacion; label: string }> = [
    { id: 'PEN', label: 'Pendientes' },
    { id: 'CON', label: 'Confirmados' },
]

function formatMonto(n: number): string {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)
}

function formatCantidad(n: number): string {
    return new Intl.NumberFormat('es-AR', {
        minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
        maximumFractionDigits: 2,
    }).format(n)
}

function formatFecha(value: Date | string): string {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return formatearFechaArgentina(date)
}

/** Primer y ultimo dia del mes corriente, en formato de <input type="date">. */
function rangoMesActual(): { desde: string; hasta: string } {
    const hoy = new Date()
    const anio = hoy.getFullYear()
    const mes = hoy.getMonth()
    const aClave = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { desde: aClave(new Date(anio, mes, 1)), hasta: aClave(new Date(anio, mes + 1, 0)) }
}

export function LiquidacionProfesionalesPanel() {
    const inicial = useMemo(rangoMesActual, [])

    const [desde, setDesde] = useState(inicial.desde)
    const [hasta, setHasta] = useState(inicial.hasta)
    const [obraSocialId, setObraSocialId] = useState<string>('')
    const [matricula, setMatricula] = useState<string>('')
    const [categorias, setCategorias] = useState<CategoriaPractica[]>([])
    const [estadosLote, setEstadosLote] = useState<EstadoLoteLiquidacion[]>(['PEN', 'CON'])

    const [obrasSociales, setObrasSociales] = useState<ObraSocialItem[]>([])
    const [profesionales, setProfesionales] = useState<ProfesionalEfectorItem[]>([])

    const [resumen, setResumen] = useState<LiquidacionResumen | null>(null)
    const [cargando, setCargando] = useState(false)
    const [descargando, setDescargando] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [expandido, setExpandido] = useState<Set<number>>(new Set())

    useEffect(() => {
        let cancelado = false
        fetch('/api/liquidacion-profesionales/filtros')
            .then((r) => r.json())
            .then((json) => {
                if (cancelado || !json.ok) return
                setObrasSociales(json.data.obrasSociales ?? [])
                setProfesionales(json.data.profesionales ?? [])
            })
            .catch(() => undefined)
        return () => {
            cancelado = true
        }
    }, [])

    const buscar = useCallback(async () => {
        if (estadosLote.length === 0) {
            setError('Elegí al menos un estado de lote.')
            return
        }
        setCargando(true)
        setError(null)
        try {
            const params = new URLSearchParams({ desde, hasta, estadosLote: estadosLote.join(',') })
            if (obraSocialId) params.set('obraSocialId', obraSocialId)
            if (matricula) params.set('matricula', matricula)
            if (categorias.length > 0) params.set('categorias', categorias.join(','))

            const res = await fetch(`/api/liquidacion-profesionales?${params.toString()}`)
            const json = await res.json()
            if (!json.ok) {
                setError(json.error ?? 'No se pudo generar la liquidación.')
                setResumen(null)
                return
            }
            setResumen(json.data as LiquidacionResumen)
            setExpandido(new Set())
        } catch {
            setError('No se pudo generar la liquidación.')
            setResumen(null)
        } finally {
            setCargando(false)
        }
    }, [desde, hasta, obraSocialId, matricula, categorias, estadosLote])

    const toggleCategoria = (id: CategoriaPractica) => {
        setCategorias((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
    }

    const toggleEstadoLote = (id: EstadoLoteLiquidacion) => {
        setEstadosLote((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]))
    }

    const toggleProfesional = (matriculaProf: number) => {
        setExpandido((prev) => {
            const siguiente = new Set(prev)
            if (siguiente.has(matriculaProf)) siguiente.delete(matriculaProf)
            else siguiente.add(matriculaProf)
            return siguiente
        })
    }

    const imprimir = () => {
        requestAnimationFrame(() => window.print())
    }

    const descargar = async () => {
        if (!resumen) return
        setDescargando(true)
        try {
            await descargarLiquidacionPdf(resumen)
        } catch {
            setError('No se pudo generar el PDF.')
        } finally {
            setDescargando(false)
        }
    }

    const totalDescartado = resumen
        ? resumen.descartes.gastosDeLaClinica.lineas
        + resumen.descartes.sinEfector.lineas
        + resumen.descartes.anestesia.lineas
        + resumen.descartes.patologia.lineas
        + resumen.descartes.fueraDeCategoria.lineas
        : 0

    return (
        <>
            <div className="p-6 space-y-5 print:hidden">
                {/* Filtros */}
                <div className="his-card p-4 space-y-4">
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                        <label className="block">
                            <span className="text-xs font-medium text-gray-600">Desde</span>
                            <input
                                type="date"
                                value={desde}
                                onChange={(e) => setDesde(e.target.value)}
                                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                            />
                        </label>
                        <label className="block">
                            <span className="text-xs font-medium text-gray-600">Hasta</span>
                            <input
                                type="date"
                                value={hasta}
                                onChange={(e) => setHasta(e.target.value)}
                                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                            />
                        </label>
                        <label className="block">
                            <span className="text-xs font-medium text-gray-600">Obra social</span>
                            <select
                                value={obraSocialId}
                                onChange={(e) => setObraSocialId(e.target.value)}
                                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                            >
                                <option value="">Todas</option>
                                {obrasSociales.map((os) => (
                                    <option key={os.id} value={os.id}>{os.nombre}</option>
                                ))}
                            </select>
                        </label>
                        <label className="block">
                            <span className="text-xs font-medium text-gray-600">Profesional</span>
                            <select
                                value={matricula}
                                onChange={(e) => setMatricula(e.target.value)}
                                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                            >
                                <option value="">Todos</option>
                                {profesionales.map((p) => (
                                    <option key={p.matricula} value={p.matricula}>
                                        {p.matricula} — {p.nombre}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-gray-500 mr-1">Tipo de práctica:</span>
                        <button
                            type="button"
                            onClick={() => setCategorias([])}
                            className={`rounded-full border px-2.5 py-0.5 text-[11px] ${categorias.length === 0
                                ? 'border-blue-500 bg-blue-600 text-white'
                                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                }`}
                        >
                            Todas
                        </button>
                        {CATEGORIAS_PRACTICA.map((cat) => {
                            const activo = categorias.includes(cat.id)
                            const n = resumen?.conteoCategorias[cat.id]
                            return (
                                <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => toggleCategoria(cat.id)}
                                    className={`rounded-full border px-2.5 py-0.5 text-[11px] ${activo
                                        ? 'border-blue-500 bg-blue-600 text-white'
                                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                        }`}
                                >
                                    {CATEGORIA_PRACTICA_LABEL[cat.id]}{n !== undefined ? ` (${n})` : ''}
                                </button>
                            )
                        })}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-gray-500 mr-1">Estado de lote:</span>
                        {ESTADOS_LOTE.map((estado) => {
                            const activo = estadosLote.includes(estado.id)
                            return (
                                <button
                                    key={estado.id}
                                    type="button"
                                    onClick={() => toggleEstadoLote(estado.id)}
                                    className={`rounded-full border px-2.5 py-0.5 text-[11px] ${activo
                                        ? 'border-blue-500 bg-blue-600 text-white'
                                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                        }`}
                                >
                                    {estado.label}
                                </button>
                            )
                        })}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                            type="button"
                            onClick={buscar}
                            disabled={cargando}
                            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                            {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                            Generar liquidación
                        </button>
                        <button
                            type="button"
                            onClick={imprimir}
                            disabled={!resumen}
                            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                            <Printer className="h-4 w-4" />
                            Imprimir
                        </button>
                        <button
                            type="button"
                            onClick={descargar}
                            disabled={!resumen || descargando}
                            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                            {descargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            Descargar PDF
                        </button>
                    </div>

                    {error && <p className="text-sm text-red-600">{error}</p>}
                </div>

                {/* Resultado */}
                {resumen && (
                    <>
                        {resumen.esProvisorio && (
                            <div className="rounded-lg border-2 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                <p className="font-bold uppercase tracking-wide">
                                    Resumen provisorio — no válido para pago
                                </p>
                                <p className="mt-1 text-xs">
                                    {resumen.practicasPendientes} de {resumen.cantidadPracticas} prácticas
                                    ({formatMonto(resumen.totalPendiente)} de {formatMonto(resumen.total)}) salen de lotes
                                    en estado <strong>pendiente</strong>. Un lote pendiente todavía se puede editar o anular,
                                    así que estos importes pueden cambiar. La liquidación definitiva se emite con los
                                    lotes ya confirmados.
                                </p>
                            </div>
                        )}

                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="his-card p-4">
                                <div className="text-2xl font-bold">{resumen.profesionales.length}</div>
                                <div className="text-xs text-gray-500">Profesionales</div>
                            </div>
                            <div className="his-card p-4">
                                <div className="text-2xl font-bold">{resumen.cantidadPracticas}</div>
                                <div className="text-xs text-gray-500">Prácticas</div>
                            </div>
                            <div className="his-card p-4">
                                <div className="text-2xl font-bold">{formatMonto(resumen.totalHonorarios)}</div>
                                <div className="text-xs text-gray-500">Honorarios</div>
                            </div>
                            <div className="his-card p-4">
                                <div className="text-2xl font-bold">{formatMonto(resumen.total)}</div>
                                <div className="text-xs text-gray-500">
                                    Total (incluye {formatMonto(resumen.totalGastos)} de gastos)
                                </div>
                            </div>
                        </div>

                        {totalDescartado > 0 && (
                            <div className="his-card p-4 text-xs text-gray-600 space-y-1">
                                <p className="font-semibold text-gray-700">
                                    Líneas que quedaron fuera de la liquidación ({totalDescartado})
                                </p>
                                <p>
                                    Gastos facturados por la clínica (matrícula 9995 / 9110):{' '}
                                    <strong>{resumen.descartes.gastosDeLaClinica.lineas}</strong> líneas
                                    por {formatMonto(resumen.descartes.gastosDeLaClinica.importe)}. No corresponden a
                                    ningún profesional efector.
                                </p>
                                <p>
                                    Sin matrícula de efector cargada:{' '}
                                    <strong>{resumen.descartes.sinEfector.lineas}</strong> líneas
                                    por {formatMonto(resumen.descartes.sinEfector.importe)}. No se pueden atribuir.
                                </p>
                                <p>
                                    Honorarios de anestesia (HA):{' '}
                                    <strong>{resumen.descartes.anestesia.lineas}</strong> líneas
                                    por {formatMonto(resumen.descartes.anestesia.importe)}. Se liquidan por otro circuito.
                                </p>
                                <p>
                                    Honorarios de patología (HP):{' '}
                                    <strong>{resumen.descartes.patologia.lineas}</strong> líneas
                                    por {formatMonto(resumen.descartes.patologia.importe)}. Se liquidan por otro circuito.
                                </p>
                                {resumen.descartes.fueraDeCategoria.lineas > 0 && (
                                    <p>
                                        Fuera del tipo de práctica filtrado:{' '}
                                        <strong>{resumen.descartes.fueraDeCategoria.lineas}</strong> líneas
                                        por {formatMonto(resumen.descartes.fueraDeCategoria.importe)}.
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="space-y-3">
                            {resumen.profesionales.map((prof) => {
                                const abierto = expandido.has(prof.matricula)
                                return (
                                    <div key={prof.matricula} className="his-card overflow-hidden">
                                        <button
                                            type="button"
                                            onClick={() => toggleProfesional(prof.matricula)}
                                            className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-gray-50"
                                        >
                                            <span className="min-w-0">
                                                <span className="block text-sm font-semibold text-gray-900 truncate">
                                                    {prof.matricula} — {prof.nombre}
                                                </span>
                                                <span className="block text-xs text-gray-500">
                                                    {prof.lineas.length} prácticas
                                                </span>
                                            </span>
                                            <span className="text-right shrink-0">
                                                <span className="block text-sm font-semibold">{formatMonto(prof.total)}</span>
                                                <span className="block text-[11px] text-gray-500">
                                                    Hon. {formatMonto(prof.totalHonorarios)} · Gto. {formatMonto(prof.totalGastos)}
                                                </span>
                                            </span>
                                        </button>

                                        {abierto && (
                                            <div className="overflow-x-auto border-t border-gray-200">
                                                <table className="w-full text-xs">
                                                    <thead className="bg-gray-50 text-gray-600">
                                                        <tr>
                                                            <th className="px-2 py-2 text-left font-semibold">Nro. Ing.</th>
                                                            <th className="px-2 py-2 text-left font-semibold">Paciente</th>
                                                            <th className="px-2 py-2 text-left font-semibold">N Afi.</th>
                                                            <th className="px-2 py-2 text-left font-semibold">Nro. Aut.</th>
                                                            <th className="px-2 py-2 text-left font-semibold">Fecha</th>
                                                            <th className="px-2 py-2 text-left font-semibold">Cod.</th>
                                                            <th className="px-2 py-2 text-left font-semibold">Práctica</th>
                                                            <th className="px-2 py-2 text-left font-semibold">Tipo</th>
                                                            <th className="px-2 py-2 text-right font-semibold">Cant.</th>
                                                            <th className="px-2 py-2 text-right font-semibold">$ Hon</th>
                                                            <th className="px-2 py-2 text-right font-semibold">$ Gto</th>
                                                            <th className="px-2 py-2 text-right font-semibold">$ Total</th>
                                                            <th className="px-2 py-2 text-left font-semibold">Lote</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {prof.lineas.map((linea) => (
                                                            <tr
                                                                key={`${linea.ordenPuestoNumero}-${linea.ordenNumero}-${linea.ordenItem}`}
                                                                className="border-t border-gray-100"
                                                            >
                                                                <td className="px-2 py-1.5">{linea.numeroIngreso}</td>
                                                                <td className="px-2 py-1.5">{linea.paciente}</td>
                                                                <td className="px-2 py-1.5">{linea.numeroAfiliado || '-'}</td>
                                                                <td className="px-2 py-1.5">{linea.numeroAutorizacion || '-'}</td>
                                                                <td className="px-2 py-1.5">{formatFecha(linea.fecha)}</td>
                                                                <td className="px-2 py-1.5 font-mono">{linea.codigoPractica}</td>
                                                                <td className="px-2 py-1.5 max-w-55 truncate" title={linea.descripcionPractica ?? ''}>
                                                                    {linea.descripcionPractica ?? '-'}
                                                                </td>
                                                                <td className="px-2 py-1.5">{linea.subitem}</td>
                                                                <td className="px-2 py-1.5 text-right">{formatCantidad(linea.cantidad)}</td>
                                                                <td className="px-2 py-1.5 text-right">{formatMonto(linea.importeHonorarios)}</td>
                                                                <td className="px-2 py-1.5 text-right">{formatMonto(linea.importeGastos)}</td>
                                                                <td className="px-2 py-1.5 text-right font-semibold">{formatMonto(linea.importeTotal)}</td>
                                                                <td className={`px-2 py-1.5 whitespace-nowrap ${linea.loteEstado === 'PEN' ? 'font-semibold text-amber-700' : 'text-gray-500'}`}>
                                                                    #{linea.loteNumero} ({linea.loteEstado})
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}

                            {resumen.profesionales.length === 0 && (
                                <div className="his-card p-6 text-center text-sm text-gray-500">
                                    No hay prácticas para liquidar con estos filtros.
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Version imprimible: oculta en pantalla, visible al imprimir */}
            {resumen && (
                <div className="hidden print:block">
                    <LiquidacionPrint resumen={resumen} />
                </div>
            )}
        </>
    )
}
