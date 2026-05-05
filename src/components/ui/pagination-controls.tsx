'use client'

import { useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

interface PaginationControlsProps {
    currentPage: number
    totalPages: number
    totalItems: number
    pageSize: number
    allowedPageSizes?: number[]
    pageParam?: string
    pageSizeParam?: string
    className?: string
}

function clampPage(page: number, totalPages: number) {
    if (totalPages < 1) return 1
    if (page < 1) return 1
    if (page > totalPages) return totalPages
    return page
}

function getPageWindow(currentPage: number, totalPages: number) {
    const pages = new Set<number>([1, totalPages, currentPage])
    for (let p = currentPage - 1; p <= currentPage + 1; p += 1) {
        if (p > 1 && p < totalPages) pages.add(p)
    }

    const sorted = Array.from(pages).sort((a, b) => a - b)
    const withEllipsis: Array<number | 'ellipsis'> = []
    let previous: number | undefined

    for (const page of sorted) {
        if (previous && page - previous > 1) {
            withEllipsis.push('ellipsis')
        }
        withEllipsis.push(page)
        previous = page
    }

    return withEllipsis
}

export function PaginationControls({
    currentPage,
    totalPages,
    totalItems,
    pageSize,
    allowedPageSizes = [10, 20, 50, 100],
    pageParam = 'page',
    pageSizeParam = 'limit',
    className,
}: PaginationControlsProps) {
    const pathname = usePathname()
    const router = useRouter()
    const searchParams = useSearchParams()

    const safeTotalPages = Math.max(1, totalPages)
    const safeCurrentPage = clampPage(currentPage, safeTotalPages)

    const pageItems = useMemo(
        () => getPageWindow(safeCurrentPage, safeTotalPages),
        [safeCurrentPage, safeTotalPages]
    )

    const navigate = (nextPage: number, nextPageSize = pageSize) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set(pageParam, String(clampPage(nextPage, safeTotalPages)))
        params.set(pageSizeParam, String(nextPageSize))
        const href = `${pathname}?${params.toString()}`
        router.push(href as never, { scroll: false })
    }

    const from = totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1
    const to = Math.min(safeCurrentPage * pageSize, totalItems)

    return (
        <nav
            className={`px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${className ?? ''}`}
            aria-label="Paginación"
        >
            <div className="text-xs text-gray-500">
                Mostrando {from}-{to} de {totalItems} resultados
            </div>

            <div className="flex items-center gap-3">
                <label className="text-xs text-gray-600" htmlFor="page-size-select">
                    Items por página
                </label>
                <select
                    id="page-size-select"
                    className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={pageSize}
                    onChange={(event) => navigate(1, Number(event.target.value))}
                    aria-label="Cambiar cantidad de items por página"
                >
                    {allowedPageSizes.map((size) => (
                        <option key={size} value={size}>
                            {size}
                        </option>
                    ))}
                </select>

                <div className="flex items-center gap-1" role="group" aria-label="Navegación de páginas">
                    <button
                        type="button"
                        onClick={() => navigate(safeCurrentPage - 1)}
                        disabled={safeCurrentPage <= 1}
                        className="rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Página anterior"
                    >
                        Anterior
                    </button>

                    {pageItems.map((item, index) => {
                        if (item === 'ellipsis') {
                            return (
                                <span
                                    key={`ellipsis-${index}`}
                                    className="px-2 py-1.5 text-xs text-gray-400"
                                    aria-hidden="true"
                                >
                                    ...
                                </span>
                            )
                        }

                        const isActive = item === safeCurrentPage
                        return (
                            <button
                                key={item}
                                type="button"
                                onClick={() => navigate(item)}
                                className={`rounded border px-2 py-1.5 text-xs ${isActive
                                        ? 'border-blue-600 bg-blue-600 text-white'
                                        : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                                    }`}
                                aria-label={`Ir a página ${item}`}
                                aria-current={isActive ? 'page' : undefined}
                            >
                                {item}
                            </button>
                        )
                    })}

                    <button
                        type="button"
                        onClick={() => navigate(safeCurrentPage + 1)}
                        disabled={safeCurrentPage >= safeTotalPages}
                        className="rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Página siguiente"
                    >
                        Siguiente
                    </button>
                </div>
            </div>
        </nav>
    )
}
