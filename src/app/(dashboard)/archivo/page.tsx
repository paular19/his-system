export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { Archive, FileSearch, Search } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PaginationControls } from '@/components/ui/pagination-controls'
import { getUsuarioSesion } from '@/lib/auth'
import { calcularEdad, formatearFechaCalendario } from '@/lib/utils'
import { consultarArchivo, resumenArchivo } from '@/modules/archivo/service'

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 20
const LIMIT_OPTIONS = [10, 20, 50, 100] as const

interface SearchParamsInput {
  q?: string
  page?: string
  limit?: string
  soloHC?: string
}

interface PageProps {
  searchParams: Promise<SearchParamsInput>
}

export const metadata: Metadata = {
  title: 'Repositorio del sistema anterior',
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return parsed
}

export default async function ArchivoPage({ searchParams }: PageProps) {
  // Modulo de consulta abierto a todos los roles del sistema.
  await getUsuarioSesion()

  const params = await searchParams
  const q = params.q?.trim() || ''
  const soloHC = params.soloHC === '1'
  const page = parsePositiveInt(params.page, DEFAULT_PAGE)
  const parsedLimit = parsePositiveInt(params.limit, DEFAULT_LIMIT)
  const limit = LIMIT_OPTIONS.includes(parsedLimit as (typeof LIMIT_OPTIONS)[number])
    ? parsedLimit
    : DEFAULT_LIMIT

  const [resultado, resumen] = await Promise.all([
    consultarArchivo({ q, soloConHistoriaClinica: soloHC, pagina: page, porPagina: limit }),
    resumenArchivo(),
  ])

  const busquedaVacia = q.length < 2

  return (
    <>
      <Header titulo="Repositorio del sistema anterior" />

      <div className="p-4 sm:p-6 space-y-4">
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <Archive className="h-5 w-5 shrink-0 text-amber-700" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-amber-900">
                Copia de consulta de la base anterior
              </p>
              <p className="text-sm text-amber-900">
                Estos datos son una copia congelada del sistema viejo y sirven para ubicar el legajo
                en el archivo fisico con la historia clinica que tenia entonces. No se editan, no se
                mezclan con los pacientes del sistema nuevo y la numeracion no coincide con la actual.
              </p>
              <p className="text-xs text-amber-800">
                {resumen.total.toLocaleString('es-AR')} pacientes archivados ·{' '}
                {resumen.conHistoriaClinica.toLocaleString('es-AR')} con historia clinica vieja ·{' '}
                {(resumen.total - resumen.conHistoriaClinica).toLocaleString('es-AR')} sin numero asignado
              </p>
            </div>
          </div>
        </section>

        <form method="GET" className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="relative flex-1 sm:max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Apellido, nombre, documento o historia clinica vieja..."
              className="w-full rounded-md border border-gray-300 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="soloHC"
              value="1"
              defaultChecked={soloHC}
              className="h-4 w-4 rounded border-gray-300"
            />
            Solo los que tienen historia clinica
          </label>
          <button
            type="submit"
            className="rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
          >
            Buscar
          </button>
          <input type="hidden" name="page" value="1" />
          <input type="hidden" name="limit" value={String(limit)} />
        </form>

        <div className="his-card overflow-hidden">
          {busquedaVacia ? (
            <div className="px-4 py-12 text-center text-gray-400">
              <FileSearch className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>Escribi al menos 2 caracteres para buscar en el archivo</p>
              <p className="text-xs mt-1">
                Podes buscar por apellido, por documento o directamente por el numero de historia
                clinica viejo
              </p>
            </div>
          ) : resultado.items.length === 0 ? (
            <div className="px-4 py-12 text-center text-gray-400">
              <FileSearch className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>No se encontro nadie en el archivo anterior</p>
              <p className="text-xs mt-1">
                para la busqueda: <span className="font-medium">&quot;{q}&quot;</span>
              </p>
            </div>
          ) : (
            <>
              {/* Mobile: tarjetas */}
              <div className="lg:hidden divide-y divide-gray-100">
                {resultado.items.map((item) => {
                  const edad = calcularEdad(item.fechaNacimiento)
                  return (
                    <div key={item.pacienteIdViejo} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-gray-900 leading-tight">
                            {item.nombreCompleto}
                          </p>
                          <p className="text-xs text-gray-500">
                            {item.tipoDocumento?.trim()} {item.numeroDocumento ?? '-'}
                          </p>
                        </div>
                        {item.historiaClinicaVieja != null ? (
                          <span className="shrink-0 rounded-md bg-amber-100 px-2 py-1 text-sm font-semibold text-amber-900">
                            HC {item.historiaClinicaVieja}
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-500">
                            Sin HC
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <span className="text-gray-400">Nacimiento</span>
                        <span className="text-gray-700">
                          {formatearFechaCalendario(item.fechaNacimiento)}
                          {edad !== null && <span className="text-gray-400"> ({edad} anios)</span>}
                        </span>
                        <span className="text-gray-400">Contacto</span>
                        <span className="text-gray-700">
                          {item.celular1 ?? item.telefonoFijo ?? item.celular2 ?? '-'}
                        </span>
                        <span className="text-gray-400">Alta en el sistema viejo</span>
                        <span className="text-gray-700">{formatearFechaCalendario(item.fechaAlta)}</span>
                      </div>

                      <p className="text-xs text-gray-500 line-clamp-2">{item.domicilio ?? '-'}</p>
                    </div>
                  )
                })}
              </div>

              {/* Desktop: tabla */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-sm table-auto">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left">
                      <th className="px-3 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wider w-[14%]">
                        HC vieja
                      </th>
                      <th className="px-2 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wider w-[26%]">
                        Paciente
                      </th>
                      <th className="px-2 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wider w-[16%]">
                        Nacimiento
                      </th>
                      <th className="px-2 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wider w-[28%]">
                        Contacto / Domicilio
                      </th>
                      <th className="px-3 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wider w-[16%]">
                        Alta sistema viejo
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {resultado.items.map((item) => {
                      const edad = calcularEdad(item.fechaNacimiento)
                      return (
                        <tr key={item.pacienteIdViejo} className="hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-2.5 align-top">
                            {item.historiaClinicaVieja != null ? (
                              <span className="inline-block rounded-md bg-amber-100 px-2 py-1 text-base font-semibold text-amber-900 tabular-nums">
                                {item.historiaClinicaVieja}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">Sin HC en el sistema viejo</span>
                            )}
                          </td>
                          <td className="px-2 py-2.5 align-top">
                            <div className="font-medium text-gray-900">{item.nombreCompleto}</div>
                            <div className="text-xs text-gray-400">
                              {item.tipoDocumento?.trim()} {item.numeroDocumento ?? '-'}
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-gray-600 align-top">
                            {formatearFechaCalendario(item.fechaNacimiento)}
                            {edad !== null && (
                              <span className="ml-1 text-xs text-gray-400">({edad} anios)</span>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-gray-600 align-top">
                            <div>{item.celular1 ?? item.telefonoFijo ?? item.celular2 ?? '-'}</div>
                            <div className="text-xs text-gray-400 line-clamp-2">
                              {item.domicilio ?? '-'}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-gray-600 align-top">
                            {formatearFechaCalendario(item.fechaAlta)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

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
            </>
          )}
        </div>
      </div>
    </>
  )
}
