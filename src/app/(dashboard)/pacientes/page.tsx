import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import { buscarPacientes } from '@/modules/pacientes/service'
import { formatearFecha, calcularEdad } from '@/lib/utils'
import Link from 'next/link'
import { Plus, Search, User } from 'lucide-react'
import type { Metadata } from 'next'
import { cache } from 'react'
import { PaginationControls } from '@/components/ui/pagination-controls'

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 20
const LIMIT_OPTIONS = [10, 20, 50, 100] as const

interface SearchParamsInput {
  q?: string
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
    page,
    limit,
  }
}

function buildQueryString(params: { q?: string; page: number; limit: number }) {
  const sp = new URLSearchParams()
  if (params.q) sp.set('q', params.q)
  sp.set('page', String(params.page))
  sp.set('limit', String(params.limit))
  return sp.toString()
}

const buscarPacientesCached = cache(buscarPacientes)

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const raw = await searchParams
  const normalizados = normalizarSearchParams(raw)
  const filtros = normalizados.q ? ` - ${normalizados.q}` : ''
  const pageSuffix = normalizados.page > 1 ? ` - Página ${normalizados.page}` : ''

  return {
    title: `Pacientes${filtros}${pageSuffix}`,
    alternates: {
      canonical: `/dashboard/pacientes?${buildQueryString(normalizados)}`,
    },
  }
}

export default async function PacientesPage({ searchParams }: PageProps) {
  const usuario = await getUsuarioSesion()

  if (!tienePermiso(usuario.rol, 'PACIENTES', 'LEER')) {
    redirect('/dashboard')
  }

  const rawParams = await searchParams
  const params = normalizarSearchParams(rawParams)

  const canonicalQuery = buildQueryString(params)
  const hasLegacyParams = Boolean(rawParams.pagina || rawParams.porPagina)
  const hasNonCanonicalQuery = buildQueryString({
    q: rawParams.q?.trim() || undefined,
    page: parsePositiveInt(rawParams.page ?? rawParams.pagina, DEFAULT_PAGE),
    limit: LIMIT_OPTIONS.includes(parsePositiveInt(rawParams.limit ?? rawParams.porPagina, DEFAULT_LIMIT) as (typeof LIMIT_OPTIONS)[number])
      ? parsePositiveInt(rawParams.limit ?? rawParams.porPagina, DEFAULT_LIMIT)
      : DEFAULT_LIMIT,
  }) !== canonicalQuery

  if (hasLegacyParams || hasNonCanonicalQuery) {
    redirect(`/dashboard/pacientes?${canonicalQuery}`)
  }

  const resultado = await buscarPacientesCached({
    q: params.q,
    pagina: params.page,
    porPagina: params.limit,
  })

  const totalPaginas = resultado?.paginacion?.totalPaginas ?? 1
  const paginaActual = resultado?.paginacion?.pagina ?? 1

  if (totalPaginas > 0 && params.page > totalPaginas) {
    const qs = buildQueryString({
      ...params,
      page: totalPaginas,
    })
    redirect(`/dashboard/pacientes?${qs}`)
  }

  const puedeCrear = tienePermiso(usuario.rol, 'PACIENTES', 'CREAR')

  return (
    <>
      <Header titulo="Pacientes" />
      <div className="p-4 sm:p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <form method="GET" className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-72">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                name="q"
                defaultValue={params.q}
                placeholder="Buscar por nombre, apellido o DNI..."
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
              href="/dashboard/pacientes/nuevo"
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors shrink-0"
            >
              <Plus className="h-4 w-4" />
              Nuevo Paciente
            </Link>
          )}
        </div>

        {/* Tabla */}
        <div className="his-card overflow-hidden">
          {/* Mobile / Tablet: tarjetas para evitar scroll horizontal */}
          <div className="lg:hidden divide-y divide-gray-100">
            {resultado.items.length === 0 ? (
              <div className="px-4 py-12 text-center text-gray-400">
                <User className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>No se encontraron pacientes</p>
                {params.q && (
                  <p className="text-xs mt-1">
                    para la búsqueda:{' '}
                    <span className="font-medium">&quot;{params.q}&quot;</span>
                  </p>
                )}
              </div>
            ) : (
              resultado.items.map((paciente) => {
                const edad = calcularEdad(paciente.fechaNacimiento)
                const contactoPrincipal = paciente.celular1 ?? paciente.telefonoFijo ?? paciente.email ?? '-'
                return (
                  <div key={paciente.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-gray-900 leading-tight">{paciente.nombreCompleto}</p>
                        <p className="text-xs text-gray-500">
                          {paciente.tipoDocumento?.trim()} {paciente.numeroDocumento ?? '-'}
                        </p>
                      </div>
                      <Link
                        href={`/dashboard/pacientes/${paciente.id}`}
                        className="text-blue-600 hover:text-blue-800 text-xs font-medium whitespace-nowrap"
                      >
                        Ver ficha
                      </Link>
                    </div>

                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <span className="text-gray-400">Obra social</span>
                      <span className="text-gray-700">{paciente.obraSocialNombre ?? '-'}</span>
                      <span className="text-gray-400">Plan</span>
                      <span className="text-gray-700">{paciente.planDescripcion ?? '-'}</span>
                      <span className="text-gray-400">Afiliado</span>
                      <span className="text-gray-700">{paciente.numeroAfiliado ?? '-'}</span>
                      <span className="text-gray-400">Contacto</span>
                      <span className="text-gray-700">{contactoPrincipal}</span>
                      <span className="text-gray-400">Nacimiento</span>
                      <span className="text-gray-700">
                        {formatearFecha(paciente.fechaNacimiento)}
                        {edad !== null && <span className="text-gray-400"> ({edad} años)</span>}
                      </span>
                      <span className="text-gray-400">HC</span>
                      <span className="text-gray-700">{paciente.historiaClinica ?? '-'}</span>
                    </div>

                    <p className="text-xs text-gray-500 line-clamp-2">{paciente.domicilio ?? '-'}</p>
                  </div>
                )
              })
            )}
          </div>

          {/* Desktop: tabla compacta */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm table-auto">
              <thead>
                <tr className="border-b bg-gray-50 text-left">
                  <th className="pl-3 pr-1 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wider w-[22%]">Paciente</th>
                  <th className="pl-1 pr-2 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wider w-[30%]">Obra Social / Plan</th>
                  <th className="px-2 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wider w-[28%]">Contacto / Domicilio</th>
                  <th className="px-2 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wider w-[12%]">Nacimiento / HC</th>
                  <th className="px-3 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wider w-[8%]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {resultado.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                      <User className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p>No se encontraron pacientes</p>
                      {params.q && (
                        <p className="text-xs mt-1">
                          para la búsqueda:{' '}
                          <span className="font-medium">&quot;{params.q}&quot;</span>
                        </p>
                      )}
                    </td>
                  </tr>
                ) : (
                  resultado.items.map((paciente) => {
                    const edad = calcularEdad(paciente.fechaNacimiento)
                    const contactoPrincipal = paciente.celular1 ?? paciente.telefonoFijo ?? paciente.email ?? '-'
                    return (
                      <tr key={paciente.id} className="hover:bg-gray-50 transition-colors">
                        <td className="pl-3 pr-1 py-2.5 align-top">
                          <div className="font-medium text-gray-900">
                            {paciente.nombreCompleto}
                          </div>
                          <div className="text-xs text-gray-400">
                            {paciente.tipoDocumento?.trim()} {paciente.numeroDocumento ?? '-'}
                          </div>
                        </td>
                        <td className="pl-1 pr-2 py-2.5 text-gray-600 align-top">
                          <div>{paciente.obraSocialNombre ?? '-'}</div>
                          <div className="text-xs text-gray-400">Plan: {paciente.planDescripcion ?? '-'}</div>
                          <div className="text-xs text-gray-400">Afiliado: {paciente.numeroAfiliado ?? '-'}</div>
                        </td>
                        <td className="px-2 py-2.5 text-gray-600 align-top">
                          <div>{contactoPrincipal}</div>
                          <div className="text-xs text-gray-400 line-clamp-2">{paciente.domicilio ?? '-'}</div>
                        </td>
                        <td className="px-2 py-2.5 text-gray-600 align-top">
                          {formatearFecha(paciente.fechaNacimiento)}
                          {edad !== null && (
                            <span className="ml-1 text-xs text-gray-400">({edad} años)</span>
                          )}
                          <div className="text-xs text-gray-400 mt-0.5">HC: {paciente.historiaClinica ?? '-'}</div>
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <Link
                            href={`/dashboard/pacientes/${paciente.id}`}
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                          >
                            Ver ficha
                          </Link>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <PaginationControls
            className="border-t"
            currentPage={paginaActual}
            totalPages={Math.max(1, totalPaginas)}
            totalItems={resultado?.paginacion?.total ?? 0}
            pageSize={resultado?.paginacion?.porPagina ?? 10}
            allowedPageSizes={LIMIT_OPTIONS as unknown as number[]}
            pageParam="page"
            pageSizeParam="limit"
          />
        </div>
      </div>
    </>
  )
}
