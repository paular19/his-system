import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import { buscarPacientes } from '@/modules/pacientes/service'
import { formatearFecha, calcularEdad } from '@/lib/utils'
import Link from 'next/link'
import { Plus, Search, User } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Pacientes' }

interface PageProps {
  searchParams: Promise<{ q?: string; pagina?: string }>
}

export default async function PacientesPage({ searchParams }: PageProps) {
  const usuario = await getUsuarioSesion()

  if (!tienePermiso(usuario.rol, 'PACIENTES', 'LEER')) {
    redirect('/dashboard')
  }

  const params = await searchParams
  const resultado = await buscarPacientes({
    q: params.q,
    pagina: params.pagina ? parseInt(params.pagina, 10) : 1,
    porPagina: 20,
  })

  const puedeCrear = tienePermiso(usuario.rol, 'PACIENTES', 'CREAR')

  const paginaActual = resultado.paginacion.pagina
  const totalPaginas = resultado.paginacion.totalPaginas
  const paginasCompactas: Array<number | '...'> = (() => {
    if (totalPaginas <= 7) {
      return Array.from({ length: totalPaginas }, (_, i) => i + 1)
    }

    const pages: Array<number | '...'> = [1]
    const inicio = Math.max(2, paginaActual - 1)
    const fin = Math.min(totalPaginas - 1, paginaActual + 1)

    if (inicio > 2) pages.push('...')
    for (let p = inicio; p <= fin; p += 1) pages.push(p)
    if (fin < totalPaginas - 1) pages.push('...')

    pages.push(totalPaginas)
    return pages
  })()

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

          {/* Paginación */}
          {resultado.paginacion.totalPaginas > 1 && (
            <div className="border-t px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-gray-500">
              <span>
                Mostrando {resultado.items.length} de {resultado.paginacion.total} resultados
              </span>
              <div className="flex items-center gap-1 flex-wrap">
                {paginaActual > 1 && (
                  <Link
                    href={`/dashboard/pacientes?q=${params.q ?? ''}&pagina=${paginaActual - 1}`}
                    className="rounded px-2 py-1 hover:bg-gray-100"
                  >
                    Anterior
                  </Link>
                )}

                {paginasCompactas.map((p, idx) =>
                  p === '...' ? (
                    <span key={`ellipsis-${idx}`} className="px-1 text-gray-400">
                      ...
                    </span>
                  ) : (
                    <Link
                      key={p}
                      href={`/dashboard/pacientes?q=${params.q ?? ''}&pagina=${p}`}
                      className={`rounded px-2 py-1 ${p === resultado.paginacion.pagina
                          ? 'bg-blue-600 text-white'
                          : 'hover:bg-gray-100'
                        }`}
                    >
                      {p}
                    </Link>
                  )
                )}

                {paginaActual < totalPaginas && (
                  <Link
                    href={`/dashboard/pacientes?q=${params.q ?? ''}&pagina=${paginaActual + 1}`}
                    className="rounded px-2 py-1 hover:bg-gray-100"
                  >
                    Siguiente
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
