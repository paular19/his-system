import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import { buscarIngresos } from '@/modules/admision/service'
import { formatearFecha } from '@/lib/utils'
import Link from 'next/link'
import { Plus, Search, ClipboardList } from 'lucide-react'
import type { Metadata } from 'next'
import { cache } from 'react'
import { PaginationControls } from '@/components/ui/pagination-controls'

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 20
const LIMIT_OPTIONS = [10, 20, 50, 100] as const

interface SearchParamsInput {
  q?: string
  tipoIngresoCodigo?: string
  page?: string
  limit?: string
  pagina?: string
  porPagina?: string
}

interface PageProps {
  searchParams: Promise<SearchParamsInput>
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return parsed
}

function normalizarSearchParams(params: SearchParamsInput) {
  const pageRaw = params.page ?? params.pagina
  const limitRaw = params.limit ?? params.porPagina

  const page = parsePositiveInt(pageRaw, DEFAULT_PAGE)
  const parsedLimit = parsePositiveInt(limitRaw, DEFAULT_LIMIT)
  const limit = LIMIT_OPTIONS.includes(parsedLimit as (typeof LIMIT_OPTIONS)[number])
    ? parsedLimit
    : DEFAULT_LIMIT

  return {
    q: params.q?.trim() || undefined,
    tipoIngresoCodigo: params.tipoIngresoCodigo || undefined,
    page,
    limit,
  }
}

function buildQueryString(params: {
  q?: string
  tipoIngresoCodigo?: string
  page: number
  limit: number
}) {
  const sp = new URLSearchParams()
  if (params.q) sp.set('q', params.q)
  if (params.tipoIngresoCodigo) sp.set('tipoIngresoCodigo', params.tipoIngresoCodigo)
  sp.set('page', String(params.page))
  sp.set('limit', String(params.limit))
  return sp.toString()
}

const buscarIngresosCached = cache(buscarIngresos)

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const raw = await searchParams
  const normalizados = normalizarSearchParams(raw)
  const filtros = normalizados.q ? ` - ${normalizados.q}` : ''
  const pageSuffix = normalizados.page > 1 ? ` - Página ${normalizados.page}` : ''

  return {
    title: `Admisión${filtros}${pageSuffix}`,
    alternates: {
      canonical: `/dashboard/admision?${buildQueryString(normalizados)}`,
    },
  }
}

export default async function AdmisionPage({ searchParams }: PageProps) {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'ADMISION', 'LEER')) redirect('/dashboard')

  const rawParams = await searchParams
  const params = normalizarSearchParams(rawParams)

  const canonicalQuery = buildQueryString(params)
  const hasLegacyParams = Boolean(rawParams.pagina || rawParams.porPagina)
  const hasNonCanonicalQuery = buildQueryString({
    q: rawParams.q?.trim() || undefined,
    tipoIngresoCodigo: rawParams.tipoIngresoCodigo || undefined,
    page: parsePositiveInt(rawParams.page ?? rawParams.pagina, DEFAULT_PAGE),
    limit: LIMIT_OPTIONS.includes(parsePositiveInt(rawParams.limit ?? rawParams.porPagina, DEFAULT_LIMIT) as (typeof LIMIT_OPTIONS)[number])
      ? parsePositiveInt(rawParams.limit ?? rawParams.porPagina, DEFAULT_LIMIT)
      : DEFAULT_LIMIT,
  }) !== canonicalQuery

  if (hasLegacyParams || hasNonCanonicalQuery) {
    redirect(`/dashboard/admision?${canonicalQuery}`)
  }

  let resultado
  try {
    // cache() evita trabajo duplicado en el mismo request para los mismos filtros.
    resultado = await buscarIngresosCached({
      q: params.q,
      tipoIngresoCodigo: params.tipoIngresoCodigo,
      pagina: params.page,
      porPagina: params.limit,
    })
  } catch (error) {
    throw new Error(
      `No fue posible cargar los ingresos: ${error instanceof Error ? error.message : 'error desconocido'}`
    )
  }

  if (resultado.paginacion.totalPaginas > 0 && params.page > resultado.paginacion.totalPaginas) {
    const qs = buildQueryString({
      ...params,
      page: resultado.paginacion.totalPaginas,
    })
    redirect(`/dashboard/admision?${qs}`)
  }

  const puedeCrear = tienePermiso(usuario.rol, 'ADMISION', 'CREAR')

  return (
    <>
      <Header titulo="Admisión" />
      <div className="p-6 space-y-5">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <form method="GET" className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-72">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                name="q"
                defaultValue={params.q}
                placeholder="Buscar por paciente, nro. ingreso..."
                className="w-full rounded-md border border-gray-300 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              className="rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
            >
              Buscar
            </button>
            <input type="hidden" name="page" value="1" />
            <input type="hidden" name="limit" value={String(params.limit)} />
          </form>

          {puedeCrear && (
            <Link
              href="/dashboard/admision/nuevo"
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors shrink-0"
            >
              <Plus className="h-4 w-4" />
              Nueva Admisión
            </Link>
          )}
        </div>

        {/* Tabla */}
        <div className="his-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left">
                  <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                    Nro. Ingreso
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                    Paciente
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                    Fecha Ingreso
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {resultado.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                      <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p>No se encontraron ingresos</p>
                      {params.q && (
                        <p className="text-xs mt-1">
                          para la búsqueda:{' '}
                          <span className="font-medium">&quot;{params.q}&quot;</span>
                        </p>
                      )}
                    </td>
                  </tr>
                ) : (
                  resultado.items.map((ingreso) => (
                    <tr key={ingreso.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-gray-700">
                        {ingreso.tipoIngresoCodigo}-{ingreso.numeroIngreso}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">
                          {ingreso.paciente?.nombreCompleto ?? ingreso.nombre ?? '-'}
                        </div>
                        {ingreso.paciente && (
                          <div className="text-xs text-gray-400">
                            DNI {ingreso.paciente.numeroDocumento ?? '-'}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {ingreso.ingresoSubtipo?.subtipoAdmision?.descripcion
                          ?? ingreso.tipoIngreso?.descripcion
                          ?? ingreso.tipoIngresoCodigo}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {formatearFecha(ingreso.fechaIngreso)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/admision/${ingreso.id}`}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                        >
                          Ver ficha
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <PaginationControls
            className="border-t"
            currentPage={resultado.paginacion.pagina}
            totalPages={Math.max(1, resultado.paginacion.totalPaginas)}
            totalItems={resultado.paginacion.total}
            pageSize={resultado.paginacion.porPagina}
            allowedPageSizes={LIMIT_OPTIONS as unknown as number[]}
            pageParam="page"
            pageSizeParam="limit"
          />
        </div>
      </div>
    </>
  )
}
