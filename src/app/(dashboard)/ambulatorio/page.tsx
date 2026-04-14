import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import { listarOrdenes } from '@/modules/orden/repository'
import { formatearNumeroOrden } from '@/modules/orden/types'
import Link from 'next/link'
import { Plus, FileText } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Autorizaciones' }

interface PageProps {
  searchParams: Promise<{ pagina?: string }>
}

export default async function AmbulatorioPage({ searchParams }: PageProps) {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'AMBULATORIO', 'LEER')) redirect('/dashboard')

  const params = await searchParams
  const pagina = params.pagina ? parseInt(params.pagina, 10) : 1
  const porPagina = 20
  const skip = (pagina - 1) * porPagina

  const { ordenes, total } = await listarOrdenes({ skip, take: porPagina, solo: 'ambulatorio' })
  const totalPaginas = Math.ceil(total / porPagina)
  const puedeCrear = tienePermiso(usuario.rol, 'AMBULATORIO', 'CREAR')

  return (
    <>
      <Header titulo="Autorizaciones" />
      <div className="p-6 space-y-5">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {total} autorización{total !== 1 ? 'es' : ''} registrada{total !== 1 ? 's' : ''}
          </p>
          {puedeCrear && (
            <Link
              href="/dashboard/ambulatorio/nueva"
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Nueva Autorización
            </Link>
          )}
        </div>

        {/* Tabla */}
        {ordenes.length === 0 ? (
          <div className="his-card flex flex-col items-center justify-center py-16 text-center space-y-3">
            <FileText className="h-10 w-10 text-gray-300" />
            <p className="text-sm text-gray-500">No hay autorizaciones registradas.</p>
            {puedeCrear && (
              <Link
                href="/dashboard/ambulatorio/nueva"
                className="text-sm text-blue-600 hover:underline font-medium"
              >
                Generar la primera
              </Link>
            )}
          </div>
        ) : (
          <div className="his-card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b">
                <tr>
                  <th className="px-4 py-3 text-left">N° Orden</th>
                  <th className="px-4 py-3 text-left">Paciente</th>
                  <th className="px-4 py-3 text-left">Obra Social</th>
                  <th className="px-4 py-3 text-left">Plan</th>
                  <th className="px-4 py-3 text-left">Fecha</th>
                  <th className="px-4 py-3 text-center">Prácticas</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ordenes.map((orden) => (
                  <tr key={`${orden.puestoNumero}-${orden.numero}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">
                      {formatearNumeroOrden(orden.puestoNumero, orden.numero)}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {orden.nombrePaciente}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{orden.obraSocialNombre}</td>
                    <td className="px-4 py-3 text-gray-600">{orden.planDescripcion}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(orden.fechaEmision).toLocaleDateString('es-AR')}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">
                      {orden.cantidadItems}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={
                          orden.estado === 'A' ? 'his-badge-activo' : 'his-badge-inactivo'
                        }
                      >
                        {orden.estado === 'A' ? 'Activa' : 'Anulada'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/ambulatorio/${orden.puestoNumero}/${orden.numero}`}
                        className="text-blue-600 hover:underline text-xs font-medium"
                      >
                        Ver / Imprimir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-center gap-2">
            {pagina > 1 && (
              <Link
                href={`?pagina=${pagina - 1}`}
                className="rounded border px-3 py-1.5 text-xs hover:bg-gray-50"
              >
                Anterior
              </Link>
            )}
            <span className="text-xs text-gray-500">
              Página {pagina} de {totalPaginas}
            </span>
            {pagina < totalPaginas && (
              <Link
                href={`?pagina=${pagina + 1}`}
                className="rounded border px-3 py-1.5 text-xs hover:bg-gray-50"
              >
                Siguiente
              </Link>
            )}
          </div>
        )}
      </div>
    </>
  )
}
