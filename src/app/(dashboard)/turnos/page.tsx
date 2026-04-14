import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import Link from 'next/link'
import { CalendarClock, UserCheck, Clock, AlertCircle } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Turnos' }

interface PageProps {
  searchParams: Promise<{ fecha?: string; profesionalId?: string }>
}

export default async function TurnosPage({ searchParams }: PageProps) {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'ADMISION', 'LEER')) redirect('/dashboard')

  const params = await searchParams
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const manana = new Date(hoy)
  manana.setDate(manana.getDate() + 1)

  const fechaParam = params.fecha ?? hoy.toISOString().split('T')[0]
  const fechaFiltro = new Date(fechaParam + 'T00:00:00')
  const fechaFiltroFin = new Date(fechaParam + 'T23:59:59')

  const profesionalIdFiltro = params.profesionalId
    ? parseInt(params.profesionalId, 10)
    : undefined

  const [turnos, profesionales] = await Promise.all([
    prisma.turno.findMany({
      where: {
        fechaTurno: { gte: fechaFiltro, lte: fechaFiltroFin },
        ...(profesionalIdFiltro ? { profesionalId: profesionalIdFiltro } : {}),
      },
      include: {
        profesional: { select: { nombre: true } },
        paciente: { select: { nombreCompleto: true, historiaClinica: true } },
        obraSocial: { select: { nombre: true } },
        ingreso: { select: { id: true, tipoIngresoCodigo: true, numeroIngreso: true } },
      },
      orderBy: { fechaTurno: 'asc' },
    }),
    prisma.profesional.findMany({
      where: { estado: 'A' },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
  ])

  const estadoLabel = (e: string | null | undefined) => {
    switch (e) {
      case 'L': return { text: 'Libre',      cls: 'bg-gray-100 text-gray-600' }
      case 'R': return { text: 'Reservado',  cls: 'bg-blue-100 text-blue-700' }
      case 'P': return { text: 'Presente',   cls: 'bg-yellow-100 text-yellow-700' }
      case 'A': return { text: 'Atendido',   cls: 'bg-green-100 text-green-700' }
      case 'X': return { text: 'Anulado',    cls: 'bg-red-100 text-red-600' }
      default:  return { text: e ?? '—',     cls: 'bg-gray-100 text-gray-500' }
    }
  }

  const reservados  = turnos.filter((t) => t.estado === 'R').length
  const presentes   = turnos.filter((t) => t.estado === 'P').length
  const atendidos   = turnos.filter((t) => t.estado === 'A').length

  return (
    <>
      <Header titulo="Turnos" />
      <div className="p-6 space-y-5">

        {/* Filtros */}
        <form method="GET" className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Fecha</label>
            <input
              type="date"
              name="fecha"
              defaultValue={fechaParam}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="min-w-52">
            <label className="text-xs font-medium text-gray-600 block mb-1">Profesional</label>
            <select
              name="profesionalId"
              defaultValue={params.profesionalId ?? ''}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos</option>
              {profesionales.map((p) => (
                <option key={p.id} value={String(p.id)}>{p.nombre}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Filtrar
          </button>
        </form>

        {/* Resumen del día */}
        <div className="grid grid-cols-3 gap-4">
          <div className="his-card p-4 flex items-center gap-3">
            <CalendarClock className="h-8 w-8 text-blue-500" />
            <div>
              <p className="text-2xl font-bold text-gray-900">{reservados}</p>
              <p className="text-xs text-gray-500">Reservados</p>
            </div>
          </div>
          <div className="his-card p-4 flex items-center gap-3">
            <Clock className="h-8 w-8 text-yellow-500" />
            <div>
              <p className="text-2xl font-bold text-gray-900">{presentes}</p>
              <p className="text-xs text-gray-500">En espera</p>
            </div>
          </div>
          <div className="his-card p-4 flex items-center gap-3">
            <UserCheck className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold text-gray-900">{atendidos}</p>
              <p className="text-xs text-gray-500">Atendidos</p>
            </div>
          </div>
        </div>

        {/* Tabla de turnos */}
        {turnos.length === 0 ? (
          <div className="his-card flex flex-col items-center justify-center py-16 text-center space-y-2">
            <AlertCircle className="h-10 w-10 text-gray-300" />
            <p className="text-sm text-gray-500">No hay turnos para la fecha seleccionada.</p>
          </div>
        ) : (
          <div className="his-card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b">
                <tr>
                  <th className="px-4 py-3 text-left">Hora</th>
                  <th className="px-4 py-3 text-left">Paciente</th>
                  <th className="px-4 py-3 text-left">Profesional</th>
                  <th className="px-4 py-3 text-left">Obra Social</th>
                  <th className="px-4 py-3 text-left">Teléfono</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-left">Ingreso</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {turnos.map((t) => {
                  const { text, cls } = estadoLabel(t.estado)
                  const nombrePaciente =
                    t.paciente?.nombreCompleto ?? t.nombrePaciente ?? '—'
                  return (
                    <tr key={`${t.profesionalId}-${t.fechaTurno.toISOString()}`} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700 whitespace-nowrap">
                        {new Date(t.fechaTurno).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 text-xs">{nombrePaciente}</p>
                        {t.paciente?.historiaClinica && (
                          <p className="text-xs text-gray-400">HC {t.paciente.historiaClinica}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {t.profesional?.nombre ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {t.obraSocial?.nombre ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{t.telefono ?? '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
                          {text}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {t.ingreso ? (
                          <Link
                            href={`/dashboard/admision/${t.ingreso.id}`}
                            className="text-blue-600 hover:underline font-mono"
                          >
                            {t.ingreso.tipoIngresoCodigo}-{t.ingreso.numeroIngreso}
                          </Link>
                        ) : (
                          t.pacienteId ? (
                            <Link
                              href={`/dashboard/admision/nuevo?pacienteId=${t.pacienteId}`}
                              className="text-green-600 hover:underline text-xs"
                            >
                              + Admitir
                            </Link>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {t.pacienteId && (
                          <Link
                            href={`/dashboard/pacientes/${t.pacienteId}`}
                            className="text-blue-600 hover:underline text-xs"
                          >
                            Ver paciente
                          </Link>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
