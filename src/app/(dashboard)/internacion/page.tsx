import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import { obtenerMapaCamas, obtenerInternacionesActivas } from '@/modules/internacion/service'
import { SeccionSector } from '@/components/internacion/seccion-sector'
import { PrintButton } from '@/components/ui/print-button'
import { prisma } from '@/lib/db'
import Link from 'next/link'
import {
  BedDouble,
  Plus,
  User,
  Calendar,
  History,
} from 'lucide-react'
import { InternacionFiltros } from '@/components/internacion/internacion-filtros'
import { InternacionFechaSelector } from '@/components/internacion/internacion-fecha-selector'
import type { Metadata } from 'next'
import { filtrarObrasSocialesPrincipales } from '@/lib/utils/coseguros'
import {
  claveDiaArgentina,
  fechaDesdeClaveArgentina,
  formatearFechaArgentina,
  formatearFechaHoraArgentina,
} from '@/lib/utils/argentina-date'

export const metadata: Metadata = { title: 'Internación — Mapa de Camas' }

interface PageProps {
  searchParams: Promise<{
    q?: string
    obraSocialId?: string
    fecha?: string
  }>
}

export default async function InternacionPage({ searchParams }: PageProps) {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'INTERNACION', 'LEER')) redirect('/dashboard')

  const params = await searchParams
  const q = params.q?.trim() ?? ''
  const obraSocialId = params.obraSocialId ? Number(params.obraSocialId) : undefined
  const obraSocialIdFiltro = obraSocialId && Number.isFinite(obraSocialId) ? obraSocialId : undefined
  const fechaHoyKey = claveDiaArgentina(new Date()) ?? new Date().toISOString().slice(0, 10)
  const fechasDisponibles = Array.from({ length: 5 }, (_, idx) => {
    const fecha = new Date(Date.now() + idx * 86_400_000)
    const key = claveDiaArgentina(fecha) ?? fechaHoyKey
    return {
      key,
      labelCorta: formatearFechaArgentina(fecha, {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
      }),
      labelLarga: formatearFechaArgentina(fecha, {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }),
    }
  })

  const fechaSeleccionada =
    params.fecha && fechasDisponibles.some((f) => f.key === params.fecha)
      ? params.fecha
      : fechaHoyKey
  const fechaReferencia = fechaDesdeClaveArgentina(fechaSeleccionada)
  const fechaLabel =
    fechasDisponibles.find((f) => f.key === fechaSeleccionada)?.labelLarga ??
    formatearFechaArgentina(fechaReferencia)

  const [mapa, internaciones, obrasSocialesRaw] = await Promise.all([
    obtenerMapaCamas(fechaReferencia, obraSocialIdFiltro),
    obtenerInternacionesActivas(
      {
        pagina: 1,
        porPagina: 100,
        q: q || undefined,
        obraSocialId: obraSocialIdFiltro,
        fechaReferencia,
      },
      usuario.codigoUsuario
    ),
    prisma.obraSocial.findMany({
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
  ])
  const obrasSociales = filtrarObrasSocialesPrincipales(obrasSocialesRaw)

  const puedeCrear = tienePermiso(usuario.rol, 'INTERNACION', 'CREAR')
  const hayFiltros = Boolean(q || obraSocialIdFiltro)
  const mostrarSoloOcupadas = Boolean(obraSocialIdFiltro)
  const qNormalizado = q
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

  const sectoresFiltradosPorBusqueda = qNormalizado
    ? mapa.sectores
      .map((sector) => {
        const camasFiltradas = sector.camas.filter((cama) => {
          const ocupante = cama.ocupante
          if (!ocupante) return false

          const camposBusqueda = [
            ocupante.nombre,
            ocupante.obraSocialNombre ?? '',
            ocupante.profesionalTratanteNombre ?? '',
            ocupante.diagnostico ?? '',
            String(ocupante.numeroIngreso),
            ocupante.numeroDocumento != null ? String(ocupante.numeroDocumento) : '',
            ocupante.historiaClinica != null ? String(ocupante.historiaClinica) : '',
          ]

          return camposBusqueda.some((valor) =>
            valor
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toLowerCase()
              .includes(qNormalizado)
          )
        })

        return {
          ...sector,
          total: camasFiltradas.length,
          disponibles: camasFiltradas.filter((c) => c.estado === 'DISPONIBLE').length,
          ocupadas: camasFiltradas.filter((c) => c.estado === 'OCUPADA').length,
          reservadas: camasFiltradas.filter((c) => c.estado === 'RESERVADA').length,
          mantenimiento: camasFiltradas.filter((c) => c.estado === 'MANTENIMIENTO').length,
          camas: camasFiltradas,
        }
      })
      .filter((sector) => sector.camas.length > 0)
    : mapa.sectores

  const sectoresMapa = mostrarSoloOcupadas
    ? sectoresFiltradosPorBusqueda.filter((sector) => sector.camas.some((cama) => cama.estado === 'OCUPADA'))
    : sectoresFiltradosPorBusqueda

  return (
    <>
      <Header titulo="Internación" />
      <div className="p-4 space-y-4">

        {/* Acciones */}
        <div className="flex items-center justify-between print:hidden">
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

        <InternacionFechaSelector
          fechas={fechasDisponibles.map((f) => ({ key: f.key, labelCorta: f.labelCorta }))}
          fechaSeleccionada={fechaSeleccionada}
          q={q}
          obraSocialIdFiltro={obraSocialIdFiltro}
        />
        <p className="-mt-3 text-xs text-gray-500 print:hidden">Fecha seleccionada: {fechaLabel}</p>

        <InternacionFiltros
          q={q}
          obraSocialIdFiltro={obraSocialIdFiltro}
          obrasSociales={obrasSociales}
          hayFiltros={hayFiltros}
          fechaReferencia={fechaSeleccionada}
        />

        {/* Mapa visual por sector */}
        <div className="space-y-4 print:hidden">
          {sectoresMapa.length === 0 ? (
            <div className="his-card p-6 text-center text-sm text-gray-500">
              {q
                ? 'No hay camas que coincidan con la búsqueda aplicada.'
                : 'No hay camas ocupadas para la obra social seleccionada.'}
            </div>
          ) : (
            sectoresMapa.map((sector) => (
              <SeccionSector key={sector.sector} sector={sector} soloOcupadas={mostrarSoloOcupadas} />
            ))
          )}
        </div>

        {/* Lista de internaciones activas */}
        <div className="ips-print-sheet">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">
              Internaciones activas
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({internaciones.paginacion.total})
              </span>
            </h2>
            <PrintButton
              label="Imprimir resultado"
              className="print:hidden flex items-center gap-2 rounded-md border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-3 py-2"
            />
          </div>

          {hayFiltros && (
            <p className="hidden print:block text-xs text-gray-700 mb-2">
              Filtros aplicados:
              {` Fecha: ${fechaLabel}.`}
              {q ? ` Persona: ${q}.` : ''}
              {obraSocialIdFiltro
                ? ` Obra social: ${obrasSociales.find((o) => o.id === obraSocialIdFiltro)?.nombre ?? 'N/A'}.`
                : ''}
            </p>
          )}

          {internaciones.items.length === 0 ? (
            <div className="his-card p-8 text-center">
              <BedDouble className="h-8 w-8 mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">No hay internaciones activas</p>
            </div>
          ) : (
            <div className="his-card overflow-x-auto ips-print-table">
              <table className="w-full text-sm min-w-[980px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Paciente
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Cama
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Ingreso
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Médico tratante
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Diagnóstico
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Coseguro
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Obra social
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
                          <User className="h-4 w-4 text-gray-400 shrink-0" />
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
                      <td className="px-4 py-3">
                        {item.fechaIngreso ? (
                          <div className="flex items-center gap-1 text-gray-600">
                            <Calendar className="h-3.5 w-3.5" />
                            {formatearFechaHoraArgentina(item.fechaIngreso, {
                              weekday: 'short',
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {item.profesionalTratante?.nombre ?? (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-[320px]">
                        <p className="line-clamp-2 leading-tight">
                          {item.descripcionPatologia?.trim() || '—'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${item.tieneCoseguro
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-gray-100 text-gray-700'
                            }`}
                        >
                          {item.tieneCoseguro ? 'Si' : 'No'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {item.obraSocial?.nombre ?? <span className="text-gray-400">—</span>}
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
