import Link from 'next/link'
import { ArrowRight, Search, X } from 'lucide-react'
import type { ResumenBusquedaOrdenes, TabOrden } from '@/modules/orden/repository'

const ETIQUETA_TAB: Record<TabOrden, string> = {
    pendientes: 'Pendientes',
    confirmadas: 'Confirmadas',
    anuladas: 'Anuladas',
}

const ORDEN_TABS: TabOrden[] = ['pendientes', 'confirmadas', 'anuladas']

interface BuscadorOrdenesProps {
    q: string
    tabActual: TabOrden
    porPagina: number
    busqueda: ResumenBusquedaOrdenes | null
    totales: Record<TabOrden, number>
    /** Solapa desde la que se salto automaticamente, si hubo salto. */
    saltoDesde: TabOrden | null
}

function hrefTab(tab: TabOrden, q: string, porPagina: number): string {
    const params = new URLSearchParams({ tab, porPagina: String(porPagina), pagina: '1' })
    if (q) params.set('q', q)
    return `/dashboard/ambulatorio?${params.toString()}`
}

export function BuscadorOrdenes({
    q,
    tabActual,
    porPagina,
    busqueda,
    totales,
    saltoDesde,
}: BuscadorOrdenesProps) {
    const totalGeneral = ORDEN_TABS.reduce((acc, tab) => acc + totales[tab], 0)
    const otrasConResultados = ORDEN_TABS.filter((tab) => tab !== tabActual && totales[tab] > 0)

    return (
        <div className="space-y-2">
            <form method="GET" className="flex gap-2">
                <input type="hidden" name="tab" value={tabActual} />
                <input type="hidden" name="porPagina" value={String(porPagina)} />
                <div className="relative w-full">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                        name="q"
                        defaultValue={q}
                        autoComplete="off"
                        placeholder="Paciente, N° de orden (701 o 0001-00000701), N° de autorización, código de práctica o afiliado"
                        className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <button
                    type="submit"
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                    Buscar
                </button>
                {q && (
                    <Link
                        href={`/dashboard/ambulatorio?tab=${tabActual}&porPagina=${porPagina}`}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                    >
                        <X className="h-4 w-4" />
                        Limpiar
                    </Link>
                )}
            </form>

            {q && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700">
                        Buscando “{q}”
                    </span>

                    {busqueda?.etiqueta && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">
                            Coincide por: {busqueda.etiqueta}
                        </span>
                    )}

                    <span className="text-gray-500">
                        {totalGeneral === 0
                            ? 'Sin resultados en ninguna solapa'
                            : `${totalGeneral} resultado${totalGeneral !== 1 ? 's' : ''} · ${ORDEN_TABS.filter((t) => totales[t] > 0)
                                .map((t) => `${totales[t]} en ${ETIQUETA_TAB[t]}`)
                                .join(' · ')}`}
                    </span>
                </div>
            )}

            {saltoDesde && saltoDesde !== tabActual && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    No había resultados en <strong>{ETIQUETA_TAB[saltoDesde]}</strong>. Te mostramos{' '}
                    <strong>{ETIQUETA_TAB[tabActual]}</strong>, que es donde está lo que buscaste.
                </p>
            )}

            {q && totales[tabActual] === 0 && otrasConResultados.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <span>No hay resultados en {ETIQUETA_TAB[tabActual]}, pero sí en:</span>
                    {otrasConResultados.map((tab) => (
                        <Link
                            key={tab}
                            href={hrefTab(tab, q, porPagina)}
                            className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-0.5 font-medium text-amber-900 hover:bg-amber-100"
                        >
                            {ETIQUETA_TAB[tab]} ({totales[tab]})
                            <ArrowRight className="h-3 w-3" />
                        </Link>
                    ))}
                </div>
            )}

            {q && busqueda?.interpretadaComoNumeroOrden && totalGeneral === 0 && (
                <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                    No existe la orden N° {q}. Verificá el número o buscá por el nombre del paciente.
                </p>
            )}
        </div>
    )
}
