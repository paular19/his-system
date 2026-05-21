import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import { listarCirugiasProgramadas } from '@/modules/cirugia/service'
import Link from 'next/link'
import { Plus, History, Search } from 'lucide-react'
import type { Metadata } from 'next'
import { PaginationControls } from '@/components/ui/pagination-controls'
import { CirugiaProgramadaTable } from '@/components/cirugia/cirugia-programada-table'

export const metadata: Metadata = { title: 'Cirugias programadas' }

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

export default async function CirugiaPage({ searchParams }: PageProps) {
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
        historico: false,
        q,
        pagina: page,
        porPagina: limit,
    })

    const totalPaginas = Math.max(1, Math.ceil(resultado.total / limit))

    return (
        <>
            <Header titulo="Cirugías programadas" />
            <div className="p-6 space-y-5">
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

                    <div className="flex items-center gap-2">
                        <Link
                            href="/dashboard/cirugia/historico"
                            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                            <History className="h-4 w-4" />
                            Histórico
                        </Link>
                        <Link
                            href="/dashboard/cirugia/nuevo"
                            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                        >
                            <Plus className="h-4 w-4" />
                            Nueva cirugía programada
                        </Link>
                    </div>
                </div>

                <div className="his-card overflow-hidden">
                    <div className="overflow-x-auto">
                        <CirugiaProgramadaTable items={resultado.items} />
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