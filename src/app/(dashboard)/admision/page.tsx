import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import { buscarIngresos } from '@/modules/admision/service'
import { formatearFecha } from '@/lib/utils'
import Link from 'next/link'
import { Plus, Search, ClipboardList } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Admisión' }

interface PageProps {
  searchParams: Promise<{
    q?: string
    tipoIngresoCodigo?: string
    estado?: string
    pagina?: string
  }>
}

const BADGE_ESTADO: Record<string, string> = {
  A: 'his-badge-activo',
  E: 'his-badge-inactivo',
  P: 'his-badge-urgente',
  X: 'his-badge-inactivo',
}

const LABEL_ESTADO: Record<string, string> = {
  A: 'Activo',
  E: 'Egresado',
  P: 'Pendiente',
  X: 'Anulado',
}

export default async function AdmisionPage({ searchParams }: PageProps) {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'ADMISION', 'LEER')) redirect('/dashboard')

  const params = await searchParams
  const resultado = await buscarIngresos({
    q: params.q,
    tipoIngresoCodigo: params.tipoIngresoCodigo,
    estado: params.estado,
    pagina: params.pagina ? parseInt(params.pagina, 10) : 1,
    porPagina: 20,
  })

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
            <select
              name="estado"
              defaultValue={params.estado ?? ''}
              className="rounded-md border border-gray-300 px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos los estados</option>
              <option value="A">Activo</option>
              <option value="E">Egresado</option>
              <option value="P">Pendiente</option>
              <option value="X">Anulado</option>
            </select>
            <button
              type="submit"
              className="rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
            >
              Buscar
            </button>
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
                  <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {resultado.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
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
                        {ingreso.estado ? (
                          <span
                            className={
                              BADGE_ESTADO[ingreso.estado] ?? 'his-badge-inactivo'
                            }
                          >
                            {LABEL_ESTADO[ingreso.estado] ?? ingreso.estado}
                          </span>
                        ) : (
                          '-'
                        )}
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
          {resultado.paginacion.totalPaginas > 1 && (
            <div className="border-t px-4 py-3 flex items-center justify-between text-xs text-gray-500">
              <span>
                Mostrando {resultado.items.length} de {resultado.paginacion.total} resultados
              </span>
              <div className="flex items-center gap-1">
                {Array.from(
                  { length: resultado.paginacion.totalPaginas },
                  (_, i) => i + 1
                ).map((p) => (
                  <Link
                    key={p}
                    href={`/dashboard/admision?q=${params.q ?? ''}&estado=${params.estado ?? ''}&pagina=${p}`}
                    className={`rounded px-2 py-1 ${p === resultado.paginacion.pagina
                        ? 'bg-blue-600 text-white'
                        : 'hover:bg-gray-100'
                      }`}
                  >
                    {p}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
