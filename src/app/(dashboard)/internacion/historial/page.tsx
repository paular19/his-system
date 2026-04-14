import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import Link from 'next/link'
import { ChevronRight, History } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Historial de Internaciones' }

interface PageProps {
  searchParams: Promise<{
    pagina?: string
    q?: string
    estado?: string
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
  const estado = params.estado ?? ''

  const where = {
    tipoIngresoCodigo: 'I',
    ...(estado ? { estado } : {}),
    ...(q
      ? {
          OR: [
            { nombre: { contains: q, mode: 'insensitive' as const } },
            { paciente: { nombreCompleto: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  }

  const [ingresos, total] = await Promise.all([
    prisma.ingreso.findMany({
      where,
      include: {
        paciente: { select: { nombreCompleto: true, historiaClinica: true } },
        tipoInternacion: { select: { descripcion: true } },
        profesionalTratante: { select: { nombre: true } },
        cama: { select: { identificador: true, habitacion: true, sector: true } },
        motivoEgreso: { select: { descripcion: true } },
      },
      orderBy: { fechaIngreso: 'desc' },
      skip,
      take: porPagina,
    }),
    prisma.ingreso.count({ where }),
  ])

  const totalPaginas = Math.ceil(total / porPagina)

  const estadoLabel = (e: string | null) => {
    switch (e) {
      case 'A': return { text: 'Activo',   cls: 'his-badge-activo' }
      case 'C': return { text: 'Cerrado',  cls: 'his-badge-inactivo' }
      case 'I': return { text: 'Inactivo', cls: 'his-badge-inactivo' }
      default:  return { text: e ?? '—',   cls: 'his-badge-inactivo' }
    }
  }

  const diasEstancia = (desde: Date | null, hasta: Date | null) => {
    if (!desde) return '—'
    const fin = hasta ?? new Date()
    const dias = Math.floor((fin.getTime() - desde.getTime()) / 86_400_000)
    return `${dias} d`
  }

  const buildQs = (overrides: Record<string, string>) => {
    const base = { ...(q ? { q } : {}), ...(estado ? { estado } : {}), pagina: String(pagina) }
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
            <label className="text-xs font-medium text-gray-600 block mb-1">Buscar paciente</label>
            <input
              name="q"
              defaultValue={q}
              placeholder="Nombre o apellido..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Estado</label>
            <select
              name="estado"
              defaultValue={estado}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos</option>
              <option value="A">Activo</option>
              <option value="C">Cerrado</option>
              <option value="I">Inactivo</option>
            </select>
          </div>
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Filtrar
          </button>
          {(q || estado) && (
            <Link
              href="/dashboard/internacion/historial"
              className="rounded-md border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Limpiar
            </Link>
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
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-left">Cama</th>
                  <th className="px-4 py-3 text-left">Ingreso</th>
                  <th className="px-4 py-3 text-left">Egreso</th>
                  <th className="px-4 py-3 text-center">Días</th>
                  <th className="px-4 py-3 text-left">Médico Tratante</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ingresos.map((ing) => {
                  const { text, cls } = estadoLabel(ing.estado)
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
                        {ing.tipoInternacion?.descripcion ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                        {ing.cama
                          ? `${ing.cama.habitacion ?? ''} ${ing.cama.identificador}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {ing.fechaIngreso
                          ? new Date(ing.fechaIngreso).toLocaleDateString('es-AR')
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {ing.fechaEgreso
                          ? new Date(ing.fechaEgreso).toLocaleDateString('es-AR')
                          : <span className="text-green-600 font-medium">En curso</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-600">
                        {diasEstancia(ing.fechaIngreso, ing.fechaEgreso)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {ing.profesionalTratante?.nombre ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cls}>{text}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/dashboard/admision/${ing.id}`}
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
