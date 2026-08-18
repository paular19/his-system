import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import Link from 'next/link'
import { CalendarRange, ChevronRight, History } from 'lucide-react'
import type { Metadata } from 'next'
import {
  diferenciaDiasCalendarioArgentina,
  formatearFechaArgentina,
} from '@/lib/utils/argentina-date'
import { obtenerTokensBusquedaFlexible } from '@/lib/utils/busqueda-flexible'
import { filtrarObrasSocialesPrincipales } from '@/lib/utils/coseguros'

export const metadata: Metadata = { title: 'Historial de Internaciones' }

const FECHA_KEY_VALIDA = /^\d{4}-\d{2}-\d{2}$/

// Los <input type="date"> devuelven el dia calendario argentino; hay que anclarlo
// al offset -03:00 para no correr el rango un dia al comparar contra timestamps.
function inicioDiaArgentina(clave: string): Date {
  return new Date(`${clave}T00:00:00.000-03:00`)
}

function finDiaArgentina(clave: string): Date {
  return new Date(`${clave}T23:59:59.999-03:00`)
}

// Normaliza un par desde/hasta de la query string. Si el rango esta invertido se
// descarta entero (pero se conserva lo tipeado para no vaciarle los inputs al usuario).
function normalizarRango(desdeRaw?: string, hastaRaw?: string) {
  const desde = desdeRaw && FECHA_KEY_VALIDA.test(desdeRaw) ? desdeRaw : ''
  const hasta = hastaRaw && FECHA_KEY_VALIDA.test(hastaRaw) ? hastaRaw : ''
  const invalido = Boolean(desde && hasta && desde > hasta)
  return {
    desde,
    hasta,
    invalido,
    desdeFiltro: invalido ? '' : desde,
    hastaFiltro: invalido ? '' : hasta,
  }
}

function condicionRango(campo: 'fechaIngreso' | 'fechaEgreso', desde: string, hasta: string) {
  if (!desde && !hasta) return []
  return [{
    [campo]: {
      ...(desde ? { gte: inicioDiaArgentina(desde) } : {}),
      ...(hasta ? { lte: finDiaArgentina(hasta) } : {}),
    },
  }]
}

interface PageProps {
  searchParams: Promise<{
    pagina?: string
    q?: string
    obraSocialId?: string
    ingresoDesde?: string
    ingresoHasta?: string
    egresoDesde?: string
    egresoHasta?: string
  }>
}

export default async function HistorialInternacionPage({ searchParams }: PageProps) {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'INTERNACION', 'LEER')) redirect('/dashboard')

  const params = await searchParams
  const pagina = Math.max(1, parseInt(params.pagina ?? '1', 10))
  const porPagina = 20
  const skip = (pagina - 1) * porPagina
  const q = params.q?.trim() ?? ''
  const qTokens = obtenerTokensBusquedaFlexible(q)
  const tieneFiltroTexto = qTokens.length > 0

  const obraSocialIdRaw = params.obraSocialId ? Number(params.obraSocialId) : undefined
  const obraSocialIdFiltro =
    obraSocialIdRaw && Number.isFinite(obraSocialIdRaw) ? obraSocialIdRaw : undefined

  const rangoIngreso = normalizarRango(params.ingresoDesde, params.ingresoHasta)
  const rangoEgreso = normalizarRango(params.egresoDesde, params.egresoHasta)

  const where = {
    tipoIngresoCodigo: 'INT',
    ...(obraSocialIdFiltro ? { obraSocialId: obraSocialIdFiltro } : {}),
    AND: [
      {
        OR: [
          { estado: 'E' },
          { fechaEgreso: { not: null } },
        ],
      },
      ...condicionRango('fechaIngreso', rangoIngreso.desdeFiltro, rangoIngreso.hastaFiltro),
      ...condicionRango('fechaEgreso', rangoEgreso.desdeFiltro, rangoEgreso.hastaFiltro),
      ...(tieneFiltroTexto
        ? [{
          OR: [
            {
              AND: qTokens.map((token) => ({
                nombre: { contains: token, mode: 'insensitive' as const },
              })),
            },
            {
              AND: qTokens.map((token) => ({
                paciente: { nombreCompleto: { contains: token, mode: 'insensitive' as const } },
              })),
            },
          ],
        }]
        : []),
    ],
  }

  const [ingresos, total, obrasSocialesRaw] = await Promise.all([
    prisma.ingreso.findMany({
      where,
      include: {
        paciente: { select: { nombreCompleto: true, historiaClinica: true } },
        profesionalTratante: { select: { nombre: true } },
        cama: { select: { identificador: true, habitacion: true, sector: true } },
        motivoEgreso: { select: { descripcion: true } },
        obraSocial: { select: { nombre: true } },
      },
      // En histórico interesa priorizar el momento del alta, no la fecha de ingreso.
      orderBy: [{ fechaEgreso: 'desc' }, { id: 'desc' }],
      skip,
      take: porPagina,
    }),
    prisma.ingreso.count({ where }),
    prisma.obraSocial.findMany({
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
  ])

  const obrasSociales = filtrarObrasSocialesPrincipales(obrasSocialesRaw)
  const hayFiltros = Boolean(
    q ||
    obraSocialIdFiltro ||
    rangoIngreso.desde ||
    rangoIngreso.hasta ||
    rangoEgreso.desde ||
    rangoEgreso.hasta
  )
  // Un rango de egreso deja fuera a los que siguen internados: no tienen fecha de alta.
  const filtraPorEgreso = Boolean(rangoEgreso.desdeFiltro || rangoEgreso.hastaFiltro)

  const totalPaginas = Math.ceil(total / porPagina)

  const diasEstancia = (desde: Date | null, hasta: Date | null) => {
    if (!desde) return '—'
    const dias = diferenciaDiasCalendarioArgentina(desde, hasta ?? new Date())
    if (dias === null) return '—'
    return `${Math.max(0, dias)} d`
  }

  const buildQs = (overrides: Record<string, string>) => {
    const base = {
      ...(q ? { q } : {}),
      ...(obraSocialIdFiltro ? { obraSocialId: String(obraSocialIdFiltro) } : {}),
      ...(rangoIngreso.desde ? { ingresoDesde: rangoIngreso.desde } : {}),
      ...(rangoIngreso.hasta ? { ingresoHasta: rangoIngreso.hasta } : {}),
      ...(rangoEgreso.desde ? { egresoDesde: rangoEgreso.desde } : {}),
      ...(rangoEgreso.hasta ? { egresoHasta: rangoEgreso.hasta } : {}),
      pagina: String(pagina),
    }
    return new URLSearchParams({ ...base, ...overrides }).toString()
  }

  return (
    <>
      <Header titulo="Historial de Internaciones" />
      <div className="p-6 space-y-5">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-xs text-gray-500">
          <Link href="/dashboard/internacion" className="hover:text-gray-700">Internación</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-gray-900 font-medium">Historial</span>
        </nav>

        {/* Filtros */}
        <form method="GET" className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label htmlFor="historial-q" className="text-xs font-medium text-gray-600 block mb-1">Buscar paciente</label>
            <input
              id="historial-q"
              name="q"
              defaultValue={q}
              placeholder="Nombre o apellido..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="min-w-56">
            <label htmlFor="historial-obra-social" className="text-xs font-medium text-gray-600 block mb-1">Obra social</label>
            <select
              id="historial-obra-social"
              name="obraSocialId"
              defaultValue={obraSocialIdFiltro ? String(obraSocialIdFiltro) : ''}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas</option>
              {obrasSociales.map((obra) => (
                <option key={obra.id} value={obra.id}>{obra.nombre}</option>
              ))}
            </select>
          </div>
          <fieldset className="rounded-md border border-gray-200 bg-gray-50 px-3 pb-2 pt-1">
            <legend className="flex items-center gap-1 px-1 text-xs font-semibold text-gray-700">
              <CalendarRange className="h-3.5 w-3.5" />
              Fecha de ingreso
            </legend>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label htmlFor="historial-ingreso-desde" className="text-xs font-medium text-gray-600 block mb-1">Desde</label>
                <input
                  id="historial-ingreso-desde"
                  name="ingresoDesde"
                  type="date"
                  defaultValue={rangoIngreso.desde}
                  max={rangoIngreso.hasta || undefined}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="historial-ingreso-hasta" className="text-xs font-medium text-gray-600 block mb-1">Hasta</label>
                <input
                  id="historial-ingreso-hasta"
                  name="ingresoHasta"
                  type="date"
                  defaultValue={rangoIngreso.hasta}
                  min={rangoIngreso.desde || undefined}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="rounded-md border border-gray-200 bg-gray-50 px-3 pb-2 pt-1">
            <legend className="flex items-center gap-1 px-1 text-xs font-semibold text-gray-700">
              <CalendarRange className="h-3.5 w-3.5" />
              Fecha de egreso
            </legend>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label htmlFor="historial-egreso-desde" className="text-xs font-medium text-gray-600 block mb-1">Desde</label>
                <input
                  id="historial-egreso-desde"
                  name="egresoDesde"
                  type="date"
                  defaultValue={rangoEgreso.desde}
                  max={rangoEgreso.hasta || undefined}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="historial-egreso-hasta" className="text-xs font-medium text-gray-600 block mb-1">Hasta</label>
                <input
                  id="historial-egreso-hasta"
                  name="egresoHasta"
                  type="date"
                  defaultValue={rangoEgreso.hasta}
                  min={rangoEgreso.desde || undefined}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </fieldset>

          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Filtrar
          </button>
          {hayFiltros && (
            <Link
              href="/dashboard/internacion/historial"
              className="rounded-md border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Limpiar
            </Link>
          )}

          <p className="basis-full text-xs text-gray-500">
            Los rangos son inclusivos y se combinan entre si: con ambos cargados se listan las
            internaciones que ingresaron dentro del primer rango <strong>y</strong> egresaron dentro
            del segundo.
            {filtraPorEgreso && ' El rango de egreso excluye las internaciones en curso, que todavia no tienen fecha de alta.'}
          </p>
          {(rangoIngreso.invalido || rangoEgreso.invalido) && (
            <p className="basis-full text-xs text-red-600">
              {rangoIngreso.invalido && rangoEgreso.invalido
                ? 'En ambos rangos la fecha desde es posterior a la fecha hasta. Se ignoraron los dos.'
                : `En el rango de ${rangoIngreso.invalido ? 'ingreso' : 'egreso'} la fecha desde es posterior a la fecha hasta. Se ignoro ese rango.`}
            </p>
          )}
        </form>

        <p className="text-sm text-gray-500">
          {total} internación{total !== 1 ? 'es' : ''} encontrada{total !== 1 ? 's' : ''}
        </p>

        {ingresos.length === 0 ? (
          <div className="his-card flex flex-col items-center justify-center py-16 text-center space-y-2">
            <History className="h-10 w-10 text-gray-300" />
            <p className="text-sm text-gray-500">No se encontraron internaciones.</p>
          </div>
        ) : (
          <div className="his-card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b">
                <tr>
                  <th className="px-4 py-3 text-left">Código</th>
                  <th className="px-4 py-3 text-left">Paciente</th>
                  <th className="px-4 py-3 text-left">Cobertura</th>
                  <th className="px-4 py-3 text-left">Cama</th>
                  <th className="px-4 py-3 text-left">Ingreso</th>
                  <th className="px-4 py-3 text-left">Egreso</th>
                  <th className="px-4 py-3 text-center">Días</th>
                  <th className="px-4 py-3 text-left">Médico Tratante</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ingresos.map((ing) => {
                  return (
                    <tr key={ing.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">
                        I-{ing.numeroIngreso}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 text-xs">
                          {ing.paciente?.nombreCompleto ?? ing.nombre ?? '—'}
                        </p>
                        {ing.paciente?.historiaClinica && (
                          <p className="text-xs text-gray-400">HC {ing.paciente.historiaClinica}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {ing.obraSocial?.nombre ?? 'Sin obra social'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                        {ing.cama
                          ? `${ing.cama.habitacion ?? ''} ${ing.cama.identificador}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {ing.fechaIngreso ? formatearFechaArgentina(ing.fechaIngreso) : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {ing.fechaEgreso
                          ? formatearFechaArgentina(ing.fechaEgreso)
                          : <span className="text-green-600 font-medium">En curso</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-600">
                        {diasEstancia(ing.fechaIngreso, ing.fechaEgreso)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {ing.profesionalTratante?.nombre ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/dashboard/internacion/${ing.id}`}
                          className="text-blue-600 hover:underline text-xs font-medium"
                        >
                          Ver
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-center gap-2">
            {pagina > 1 && (
              <Link
                href={`?${buildQs({ pagina: String(pagina - 1) })}`}
                className="rounded border px-3 py-1.5 text-xs hover:bg-gray-50"
              >
                Anterior
              </Link>
            )}
            <span className="text-xs text-gray-500">Página {pagina} de {totalPaginas}</span>
            {pagina < totalPaginas && (
              <Link
                href={`?${buildQs({ pagina: String(pagina + 1) })}`}
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
