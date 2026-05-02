import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import { obtenerMapaCamas, obtenerInternacionesActivas } from '@/modules/internacion/service'
import { SeccionSector } from '@/components/internacion/seccion-sector'
import Link from 'next/link'
import {
  BedDouble,
  CheckCircle,
  XCircle,
  Clock,
  Wrench,
  Plus,
  User,
  Calendar,
  History,
} from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Internación — Mapa de Camas' }

export default async function InternacionPage() {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'INTERNACION', 'LEER')) redirect('/dashboard')

  const [mapa, internaciones] = await Promise.all([
    obtenerMapaCamas(),
    obtenerInternacionesActivas(
      { pagina: 1, porPagina: 10 },
      usuario.codigoUsuario
    ),
  ])

  const puedeCrear = tienePermiso(usuario.rol, 'INTERNACION', 'CREAR')

  return (
    <>
      <Header titulo="Internación" />
      <div className="p-6 space-y-6">

        {/* Acciones */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Mapa de camas</h2>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/internacion/historial"
              className="flex items-center gap-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <History className="h-4 w-4" />
              Historial
            </Link>
            {puedeCrear && (
              <Link
                href="/dashboard/internacion/nuevo"
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                <Plus className="h-4 w-4" />
                Nueva internación
              </Link>
            )}
          </div>
        </div>

        {/* Tarjetas resumen totales */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="his-card p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{mapa.totales.disponibles}</p>
                <p className="text-xs text-gray-500">Disponibles</p>
              </div>
            </div>
          </div>
          <div className="his-card p-4">
            <div className="flex items-center gap-3">
              <XCircle className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{mapa.totales.ocupadas}</p>
                <p className="text-xs text-gray-500">Ocupadas</p>
              </div>
            </div>
          </div>
          <div className="his-card p-4">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{mapa.totales.reservadas}</p>
                <p className="text-xs text-gray-500">Reservadas</p>
              </div>
            </div>
          </div>
          <div className="his-card p-4">
            <div className="flex items-center gap-3">
              <Wrench className="h-8 w-8 text-gray-400" />
              <div>
                <p className="text-2xl font-bold text-gray-900">{mapa.totales.mantenimiento}</p>
                <p className="text-xs text-gray-500">Mantenimiento</p>
              </div>
            </div>
          </div>
        </div>

        {/* Resumen por sector */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {mapa.sectores.map((sector) => (
            <div key={sector.sector} className="his-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <BedDouble className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-semibold text-gray-900">{sector.label}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xl font-bold text-green-600">{sector.disponibles}</p>
                  <p className="text-xs text-gray-500">Libres</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-red-600">{sector.ocupadas}</p>
                  <p className="text-xs text-gray-500">Ocupadas</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-600">{sector.total}</p>
                  <p className="text-xs text-gray-500">Total</p>
                </div>
              </div>
              <div className="mt-3 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{
                    width:
                      sector.total > 0
                        ? `${Math.round((sector.ocupadas / sector.total) * 100)}%`
                        : '0%',
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Mapa visual por sector */}
        <div className="space-y-4">
          {mapa.sectores.map((sector) => (
            <SeccionSector key={sector.sector} sector={sector} />
          ))}
        </div>

        {/* Lista de internaciones activas */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">
              Internaciones activas
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({internaciones.paginacion.total})
              </span>
            </h2>
          </div>

          {internaciones.items.length === 0 ? (
            <div className="his-card p-8 text-center">
              <BedDouble className="h-8 w-8 mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">No hay internaciones activas</p>
            </div>
          ) : (
            <div className="his-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Paciente
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Cama
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">
                      Médico tratante
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">
                      Ingreso
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">
                      Alta prevista
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {internaciones.items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/internacion/${item.id}`}
                          className="flex items-center gap-2 hover:text-blue-600"
                        >
                          <User className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          <div>
                            <p className="font-medium text-gray-900 leading-tight">
                              {item.paciente?.nombreCompleto ?? item.nombre ?? '—'}
                            </p>
                            <p className="text-xs text-gray-500">
                              Ingreso #{item.numeroIngreso}
                            </p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {item.cama ? (
                          <div>
                            <span className="font-medium text-gray-900">
                              {item.cama.identificador}
                            </span>
                            {item.cama.habitacion && (
                              <p className="text-xs text-gray-500">Hab. {item.cama.habitacion}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-gray-700">
                        {item.profesionalTratante?.nombre ?? (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {item.fechaIngreso ? (
                          <div className="flex items-center gap-1 text-gray-600">
                            <Calendar className="h-3.5 w-3.5" />
                            {item.fechaIngreso.toLocaleDateString('es-AR')}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {item.fechaEgresoPrevista ? (
                          <span className="text-gray-600">
                            {item.fechaEgresoPrevista.toLocaleDateString('es-AR')}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
