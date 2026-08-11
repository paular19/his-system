import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import { obtenerMapaCamas, obtenerInternacionesActivas } from '@/modules/internacion/service'
import { SeccionSector } from '@/components/internacion/seccion-sector'
import { prisma } from '@/lib/db'
import Link from 'next/link'
import {
  BedDouble,
  Plus,
  History,
  ClipboardList,
} from 'lucide-react'
import { InternacionFiltros } from '@/components/internacion/internacion-filtros'
import { InternacionFechaSelector } from '@/components/internacion/internacion-fecha-selector'
import { CensoInternacion, type CensoInternacionRow } from '@/components/internacion/censo-internacion'
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
    ingresoDesde?: string
    ingresoHasta?: string
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
  const fechaKeyValida = /^\d{4}-\d{2}-\d{2}$/
  const ingresoDesde = params.ingresoDesde && fechaKeyValida.test(params.ingresoDesde)
    ? params.ingresoDesde
    : ''
  const ingresoHasta = params.ingresoHasta && fechaKeyValida.test(params.ingresoHasta)
    ? params.ingresoHasta
    : ''
  const rangoIngresoValido = !ingresoDesde || !ingresoHasta || ingresoDesde <= ingresoHasta
  const ingresoDesdeFiltro = rangoIngresoValido ? ingresoDesde : ''
  const ingresoHastaFiltro = rangoIngresoValido ? ingresoHasta : ''
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

  const mapaGlobalPromise = obtenerMapaCamas(fechaReferencia)
  const mapaVisiblePromise = obraSocialIdFiltro
    ? obtenerMapaCamas(fechaReferencia, obraSocialIdFiltro)
    : mapaGlobalPromise
  const [mapa, internaciones, obrasSocialesRaw, cirugiasProgramadasPendientes, mapaGlobal] = await Promise.all([
    mapaVisiblePromise,
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
    mapaGlobalPromise,
  ])
  const obrasSociales = filtrarObrasSocialesPrincipales(obrasSocialesRaw)

  const puedeCrear = tienePermiso(usuario.rol, 'INTERNACION', 'CREAR')
  const puedeBloquearHabitacion =
    tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR') ||
    puedeCrear ||
    tienePermiso(usuario.rol, 'ADMISION', 'MODIFICAR') ||
    tienePermiso(usuario.rol, 'ADMISION', 'CREAR')
  const hayFiltros = Boolean(q || obraSocialIdFiltro || ingresoDesdeFiltro || ingresoHastaFiltro)
  const mostrarSoloOcupadas = Boolean(obraSocialIdFiltro)
  const qNormalizado = normalizarTextoBusquedaFlexible(q)
  const qTokens = obtenerTokensBusquedaFlexible(q)
  const internacionesConDias = internaciones.items.map((item) => ({
    ...item,
    diasInternacion: calcularDiasInternacion(item.fechaIngreso, fechaReferencia),
  }))
  const censoRows: CensoInternacionRow[] = internacionesConDias.map((item) => ({
    id: item.id,
    fechaIngresoKey: claveDiaArgentina(item.fechaIngreso) ?? '',
    ingreso: `#${item.numeroIngreso}`,
    fechaIngreso: item.fechaIngreso ? formatearFechaHoraArgentina(item.fechaIngreso) : '—',
    historiaClinica: String(item.paciente?.historiaClinica ?? '—'),
    paciente: item.paciente?.nombreCompleto ?? item.nombre ?? '—',
    documentoEdadAfiliado: [
      `DNI ${item.paciente?.numeroDocumento ?? '—'}`,
      `Edad ${calcularEdad(item.paciente?.fechaNacimiento, item.edad, fechaReferencia) ?? '—'}`,
      `Af. ${item.numeroAfiliado?.trim() || '—'}`,
    ],
    cobertura: item.obraSocial?.nombre ?? 'Sin obra social',
    coseguro: item.coseguroNombre ?? 'No',
    sector: item.cama?.sector ?? '—',
    habitacionCama: `Hab. ${item.cama?.habitacion ?? '—'} · Cama ${item.cama?.identificador ?? '—'}`,
    estadoHabitacion: item.habitacionBloqueada ? 'Habitación bloqueada' : 'Habitación no bloqueada',
    habitacionBloqueada: item.habitacionBloqueada,
    diagnostico: item.descripcionPatologia?.trim() || '—',
    medicoTratante: item.profesionalTratante?.nombre ?? '—',
    matricula: String(item.profesionalTratante?.matricula ?? '—'),
    diasInternacion: item.diasInternacion,
    egreso: item.fechaEgreso ? formatearFechaHoraArgentina(item.fechaEgreso) : '—',
  }))
  const pdfQuery = new URLSearchParams({ fecha: fechaSeleccionada })
  if (q) pdfQuery.set('q', q)
  if (obraSocialIdFiltro) pdfQuery.set('obraSocialId', String(obraSocialIdFiltro))

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
          ocupadas: camasFiltradas.filter((c) => c.estado === 'OCUPADA' && !c.bloqueada).length,
          bloqueadas: camasFiltradas.filter((c) => c.estado === 'OCUPADA' && c.bloqueada).length,
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

        <section className="print:hidden" aria-labelledby="disponibilidad-total-titulo">
          <h3 id="disponibilidad-total-titulo" className="mb-2 text-sm font-semibold text-gray-800">
            Disponibilidad total · Todos los pisos y UTI
          </h3>
          <div className="flex min-w-0 flex-wrap gap-1">
            <div className="inline-flex items-center gap-0.5 rounded border border-gray-200 border-l-2 border-l-gray-500 bg-white px-1.5 py-0.5">
              <span className="text-[10px] font-medium text-gray-600">Total</span>
              <span className="text-[11px] font-bold text-gray-900">{mapaGlobal.totales.total}</span>
            </div>
            <div className="inline-flex items-center gap-0.5 rounded border border-red-200 border-l-2 border-l-red-500 bg-red-50/60 px-1.5 py-0.5">
              <span className="text-[10px] font-medium text-red-700">Ocupadas</span>
              <span className="text-[11px] font-bold text-red-900">{mapaGlobal.totales.ocupadas}</span>
            </div>
            <div className="inline-flex items-center gap-0.5 rounded border border-zinc-300 border-l-2 border-l-zinc-700 bg-zinc-50 px-1.5 py-0.5">
              <span className="text-[10px] font-medium text-zinc-700">Bloqueadas</span>
              <span className="text-[11px] font-bold text-zinc-900">{mapaGlobal.totales.bloqueadas}</span>
            </div>
            <div className="inline-flex items-center gap-0.5 rounded border border-amber-200 border-l-2 border-l-amber-500 bg-amber-50/60 px-1.5 py-0.5">
              <span className="text-[10px] font-medium text-amber-700">Reservadas</span>
              <span className="text-[11px] font-bold text-amber-900">{mapaGlobal.totales.reservadas}</span>
            </div>
            <div className="inline-flex items-center gap-0.5 rounded border border-slate-300 border-l-2 border-l-slate-500 bg-slate-50 px-1.5 py-0.5">
              <span className="text-[10px] font-medium text-slate-700">Mantenimiento</span>
              <span className="text-[11px] font-bold text-slate-900">{mapaGlobal.totales.mantenimiento}</span>
            </div>
            <div className="inline-flex items-center gap-0.5 rounded border border-emerald-200 border-l-2 border-l-emerald-500 bg-emerald-50/60 px-1.5 py-0.5">
              <span className="text-[10px] font-medium text-emerald-700">Disponibles</span>
              <span className="text-[11px] font-bold text-emerald-900">{mapaGlobal.totales.disponibles}</span>
            </div>
          </div>
        </section>

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
              <SeccionSector
                key={sector.sector}
                sector={sector}
                soloOcupadas={mostrarSoloOcupadas}
                puedeBloquearHabitacion={puedeBloquearHabitacion && fechaSeleccionada === fechaHoyKey}
              />
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

        <CensoInternacion
          rows={censoRows}
          fechaLabel={fechaLabel}
          fechaSeleccionada={fechaSeleccionada}
          ingresoDesdeInicial={ingresoDesdeFiltro}
          ingresoHastaInicial={ingresoHastaFiltro}
          pdfQueryBase={pdfQuery.toString()}
          filtrosBase={[
            `Fecha: ${fechaLabel}`,
            q ? `Persona: ${q}` : '',
            obraSocialIdFiltro
              ? `Obra social: ${obrasSociales.find((obra) => obra.id === obraSocialIdFiltro)?.nombre ?? 'N/A'}`
              : '',
          ].filter(Boolean)}
        />
      </div>
    </>
  )
}
