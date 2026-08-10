import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import { obtenerMapaCamas, obtenerInternacionesActivas } from '@/modules/internacion/service'
import { SeccionSector } from '@/components/internacion/seccion-sector'
import { PrintButton } from '@/components/ui/print-button'
import { prisma } from '@/lib/db'
import Link from 'next/link'
import Image from 'next/image'
import {
  BedDouble,
  Plus,
  History,
  ClipboardList,
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
import { normalizarTextoBusquedaFlexible, obtenerTokensBusquedaFlexible } from '@/lib/utils/busqueda-flexible'

export const metadata: Metadata = { title: 'Internación — Mapa de Camas' }

interface PageProps {
  searchParams: Promise<{
    q?: string
    obraSocialId?: string
    fecha?: string
  }>
}

function calcularDiasInternacion(fechaIngreso: Date | null, fechaCorte: Date): number {
  if (!fechaIngreso) return 0

  const ingresoKey = claveDiaArgentina(fechaIngreso)
  const corteKey = claveDiaArgentina(fechaCorte)
  if (!ingresoKey || !corteKey) return 0

  const ingresoUtc = Date.parse(`${ingresoKey}T00:00:00Z`)
  const corteUtc = Date.parse(`${corteKey}T00:00:00Z`)
  return Math.max(0, Math.floor((corteUtc - ingresoUtc) / 86_400_000))
}

function calcularEdad(
  fechaNacimiento: Date | null | undefined,
  edadRegistrada: number | null,
  fechaCorte: Date
): number | null {
  if (!fechaNacimiento) return edadRegistrada

  let edad = fechaCorte.getFullYear() - fechaNacimiento.getFullYear()
  const mes = fechaCorte.getMonth() - fechaNacimiento.getMonth()
  if (mes < 0 || (mes === 0 && fechaCorte.getDate() < fechaNacimiento.getDate())) edad -= 1
  return edad >= 0 ? edad : edadRegistrada
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

  const [mapa, internaciones, obrasSocialesRaw, cirugiasProgramadasPendientes] = await Promise.all([
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
    prisma.ingreso.findMany({
      where: {
        tipoIngresoCodigo: 'INT',
        estado: 'A',
        camaId: null,
        ingresoSubtipo: {
          is: {
            subtipoAdmisionCodigo: 'PRG',
            fechaTurno: null,
          },
        },
      },
      select: {
        id: true,
        numeroIngreso: true,
        nombre: true,
        fechaIngreso: true,
        paciente: { select: { nombreCompleto: true } },
      },
      orderBy: { fechaIngreso: 'desc' },
    }),
  ])
  const obrasSociales = filtrarObrasSocialesPrincipales(obrasSocialesRaw)

  const puedeCrear = tienePermiso(usuario.rol, 'INTERNACION', 'CREAR')
  const hayFiltros = Boolean(q || obraSocialIdFiltro)
  const mostrarSoloOcupadas = Boolean(obraSocialIdFiltro)
  const qNormalizado = normalizarTextoBusquedaFlexible(q)
  const qTokens = obtenerTokensBusquedaFlexible(q)
  const internacionesConDias = internaciones.items.map((item) => ({
    ...item,
    diasInternacion: calcularDiasInternacion(item.fechaIngreso, fechaReferencia),
  }))
  const resumenPorObraSocial = Array.from(
    internacionesConDias.reduce((resumen, item) => {
      const nombre = item.obraSocial?.nombre?.trim() || 'Sin obra social'
      const actual = resumen.get(nombre) ?? { nombre, internados: 0, dias: 0 }
      actual.internados += 1
      actual.dias += item.diasInternacion
      resumen.set(nombre, actual)
      return resumen
    }, new Map<string, { nombre: string; internados: number; dias: number }>()).values()
  ).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

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

          const textoBusqueda = normalizarTextoBusquedaFlexible(camposBusqueda.join(' '))

          if (qTokens.length === 0) return true

          return qTokens.every((token) => textoBusqueda.includes(token))
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

        {cirugiasProgramadasPendientes.length > 0 && (
          <div className="his-card p-4 border border-amber-200 bg-amber-50/60 print:hidden">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="h-4 w-4 text-amber-700" />
              <h3 className="text-sm font-semibold text-amber-900">
                Cirugias programadas pendientes de cama y fecha
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-180 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-amber-800 border-b border-amber-200">
                    <th className="py-2 pr-4">Paciente</th>
                    <th className="py-2 pr-4">Ingreso</th>
                    <th className="py-2 pr-4">Creada</th>
                    <th className="py-2 pr-4">Estado</th>
                    <th className="py-2">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {cirugiasProgramadasPendientes.map((item) => (
                    <tr key={`prg-pendiente-${item.id}`} className="border-b border-amber-100 last:border-b-0">
                      <td className="py-2 pr-4 text-gray-900 font-medium">
                        {item.paciente?.nombreCompleto ?? item.nombre ?? '—'}
                      </td>
                      <td className="py-2 pr-4 text-gray-700">INT-{item.numeroIngreso}</td>
                      <td className="py-2 pr-4 text-gray-700">
                        {item.fechaIngreso ? formatearFechaHoraArgentina(item.fechaIngreso) : '—'}
                      </td>
                      <td className="py-2 pr-4">
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          Sin cama y sin fecha de cirugia
                        </span>
                      </td>
                      <td className="py-2">
                        <Link
                          href={`/dashboard/internacion/${item.id}`}
                          className="text-xs font-medium text-blue-700 hover:text-blue-900"
                        >
                          Abrir ficha
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Lista de internaciones activas */}
        <div className="ips-print-sheet">
          <div className="hidden print:flex items-center justify-between border-b border-gray-400 pb-3 mb-3">
            <div className="flex items-center gap-4">
              <Image src="/logo-clinica.png" alt="Logo de la clínica" width={104} height={72} className="h-auto w-26" />
              <div>
                <h1 className="text-lg font-bold text-gray-900">Clínica Sanar</h1>
                <p className="text-xs text-gray-700">Email: admisionsanar@gmail.com</p>
                <p className="text-xs text-gray-700">Tel. 0387 431-8111</p>
                <p className="text-xs text-gray-700">Av. Sarmiento 566</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-base font-semibold text-gray-900">Censo de internación</p>
              <p className="text-xs text-gray-700">Fecha: {fechaLabel}</p>
            </div>
          </div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">
              Internaciones activas
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({internaciones.paginacion.total})
              </span>
            </h2>
            <PrintButton
              label="Imprimir censo"
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
            <div className="space-y-4">
              <div className="his-card overflow-x-auto ips-print-table censo-print-table">
              <table className="w-full text-sm min-w-300">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Ingreso
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      HC
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Paciente
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      DNI / Edad / Afiliado
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Cobertura
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Habitación
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Médico tratante
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Días / Egreso
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {internacionesConDias.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/internacion/${item.id}`}
                          className="font-medium text-blue-700 hover:text-blue-900 print:text-gray-900"
                        >
                          #{item.numeroIngreso}
                        </Link>
                        <p className="text-xs text-gray-500">
                          {item.fechaIngreso ? formatearFechaHoraArgentina(item.fechaIngreso) : '—'}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {item.paciente?.historiaClinica ?? '—'}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {item.paciente?.nombreCompleto ?? item.nombre ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        <p>DNI {item.paciente?.numeroDocumento ?? '—'}</p>
                        <p>Edad {calcularEdad(item.paciente?.fechaNacimiento, item.edad, fechaReferencia) ?? '—'}</p>
                        <p>Af. {item.numeroAfiliado?.trim() || '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        <p className="font-medium text-gray-900">{item.obraSocial?.nombre ?? '—'}</p>
                        <p className="text-xs text-gray-500">Coseguro: {item.coseguroNombre ?? 'No'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{item.cama?.sector ?? '—'}</p>
                        <p className="text-xs text-gray-500">
                          Hab. {item.cama?.habitacion ?? '—'} · Cama {item.cama?.identificador ?? '—'}
                        </p>
                        <p className={`text-xs font-medium ${item.habitacionBloqueada ? 'text-amber-700' : 'text-emerald-700'}`}>
                          {item.habitacionBloqueada ? 'Habitación bloqueada' : 'Habitación no bloqueada'}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        <p>{item.profesionalTratante?.nombre ?? '—'}</p>
                        <p className="text-xs text-gray-500">MP {item.profesionalTratante?.matricula ?? '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        <p className="font-medium text-gray-900">{item.diasInternacion} días</p>
                        <p className="text-xs text-gray-500">
                          Egreso: {item.fechaEgreso ? formatearFechaHoraArgentina(item.fechaEgreso) : '—'}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>

              <div className="his-card overflow-hidden ips-print-table">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Obra social</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Internados</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Días totales</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {resumenPorObraSocial.map((fila) => (
                      <tr key={fila.nombre}>
                        <td className="px-4 py-3 font-medium text-gray-900">{fila.nombre}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{fila.internados}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{fila.dias}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="px-4 py-3">Total general</td>
                      <td className="px-4 py-3 text-right">{internacionesConDias.length}</td>
                      <td className="px-4 py-3 text-right">
                        {internacionesConDias.reduce((total, item) => total + item.diasInternacion, 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
