import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import { listarCirugiasProgramadas } from '@/modules/cirugia/service'
import Link from 'next/link'
import { ArrowLeft, Search, History } from 'lucide-react'
import type { Metadata } from 'next'
import { PaginationControls } from '@/components/ui/pagination-controls'

export const metadata: Metadata = { title: 'Historico de cirugias programadas' }

interface SearchParamsInput {
    q?: string
    page?: string
    limit?: string
}

interface PageProps {
    searchParams: Promise<SearchParamsInput>
}

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 20
const LIMIT_OPTIONS = [10, 20, 50, 100] as const

function parsePositiveInt(value: string | undefined, fallback: number) {
    if (!value) return fallback
    const parsed = Number.parseInt(value, 10)
    if (!Number.isFinite(parsed) || parsed < 1) return fallback
    return parsed
}

export default async function HistoricoCirugiaPage({ searchParams }: PageProps) {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'ADMISION', 'LEER')) {
        redirect('/dashboard')
    }

    const params = await searchParams
    const page = parsePositiveInt(params.page, DEFAULT_PAGE)
    const parsedLimit = parsePositiveInt(params.limit, DEFAULT_LIMIT)
    const limit = LIMIT_OPTIONS.includes(parsedLimit as (typeof LIMIT_OPTIONS)[number])
        ? parsedLimit
        : DEFAULT_LIMIT
    const q = params.q?.trim() || undefined

    const resultado = await listarCirugiasProgramadas({
        historico: true,
        q,
        pagina: page,
        porPagina: limit,
    })

    const totalPaginas = Math.max(1, Math.ceil(resultado.total / limit))

    return (
        <>
            <Header titulo="Histórico de cirugías programadas" />
            <div className="p-6 space-y-5">
                <div className="flex items-center justify-between gap-3">
                    <Link
                        href="/dashboard/cirugia"
                        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Volver a programadas
                    </Link>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <form method="GET" className="flex items-center gap-2 w-full sm:w-auto">
                        <div className="relative flex-1 sm:w-80">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                name="q"
                                defaultValue={q}
                                placeholder="Buscar por paciente o DNI"
                                className="w-full rounded-md border border-gray-300 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <button
                            type="submit"
                            className="rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                        >
                            Buscar
                        </button>
                        <input type="hidden" name="page" value="1" />
                        <input type="hidden" name="limit" value={String(limit)} />
                    </form>
                </div>

                <div className="his-card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-gray-50 text-left">
                                    <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                                        Fecha
                                    </th>
                                    <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                                        Hora
                                    </th>
                                    <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                                        Paciente
                                    </th>
                                    <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                                        Cobertura
                                    </th>
                                    <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                                        Prácticas
                                    </th>
                                    <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                                        N° autorización
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {resultado.items.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                                            <History className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                            <p>No hay cirugías históricas</p>
                                        </td>
                                    </tr>
                                ) : (
                                    resultado.items.map((item) => (
                                        <tr key={item.id} className="hover:bg-gray-50 transition-colors cursor-pointer">
                                            <td className="px-4 py-3 text-gray-700">
                                                <Link href={`/dashboard/cirugia/${item.id}`} className="hover:underline">
                                                    {new Date(item.fechaCirugia).toLocaleDateString('es-AR')}
                                                </Link>
                                            </td>
                                            <td className="px-4 py-3 text-gray-700">
                                                <Link href={`/dashboard/cirugia/${item.id}`} className="hover:underline">
                                                    {item.horaCirugia || '-'}
                                                </Link>
                                            </td>
                                            <td className="px-4 py-3">
                                                <Link href={`/dashboard/cirugia/${item.id}`} className="hover:underline">
                                                    <div className="font-medium text-gray-900">{item.paciente.nombreCompleto}</div>
                                                    <div className="text-xs text-gray-400">
                                                        DNI {item.paciente.numeroDocumento ?? '-'} · HC {item.paciente.historiaClinica ?? '-'}
                                                    </div>
                                                </Link>
                                            </td>
                                            <td className="px-4 py-3 text-gray-600 text-xs">
                                                <Link href={`/dashboard/cirugia/${item.id}`} className="hover:underline">
                                                    {item.paciente.obraSocial ?? 'Sin cobertura'}
                                                    {item.paciente.plan ? ` · ${item.paciente.plan}` : ''}
                                                </Link>
                                            </td>
                                            <td className="px-4 py-3 text-gray-700">
                                                <Link href={`/dashboard/cirugia/${item.id}`} className="hover:underline">
                                                    {item.practicasCantidad}
                                                </Link>
                                            </td>
                                            <td className="px-4 py-3 text-gray-700">
                                                <Link href={`/dashboard/cirugia/${item.id}`} className="hover:underline">
                                                    {item.numeroAutorizacion?.trim() || '-'}
                                                </Link>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <PaginationControls
                        className="border-t"
                        currentPage={Math.min(page, totalPaginas)}
                        totalPages={totalPaginas}
                        totalItems={resultado.total}
                        pageSize={limit}
                        allowedPageSizes={LIMIT_OPTIONS as unknown as number[]}
                        pageParam="page"
                        pageSizeParam="limit"
                    />
                </div>
            </div>
        </>
    )
}