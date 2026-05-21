import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { ConsultaForm } from '@/components/orden/consulta-form'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { Metadata } from 'next'
import type { PacienteResumen } from '@/modules/admision/types'
import {
  buscarAdmisionesActivasPorPaciente,
  obtenerContextoAdmisionParaOrden,
} from '@/modules/orden/repository'

export const metadata: Metadata = { title: 'Nueva Autorización' }

interface PageProps {
  searchParams: Promise<{ pacienteId?: string; q?: string; ingresoId?: string; modo?: string }>
}

export default async function NuevaAutorizacionPage({ searchParams }: PageProps) {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'AMBULATORIO', 'CREAR')) {
    redirect('/dashboard/ambulatorio')
  }

  const [obraSocialesRows, profesionales] = await Promise.all([
    prisma.$queryRaw<Array<{ id: number; nombre: string }>>`
      SELECT "OSID"::int AS id, BTRIM("OSNom") AS nombre
      FROM "ObraSocial"
      WHERE BTRIM("OSEstad") = 'A'
      ORDER BY "OSNom" ASC
    `,
    prisma.profesional.findMany({
      where: { estado: 'A' },
      select: { id: true, nombre: true, matricula: true },
      orderBy: { nombre: 'asc' },
    }),
  ])

  // Pre-cargar paciente si viene por query param
  const params = await searchParams
  let pacienteInicial: PacienteResumen | null = null
  const q = params.q?.trim() ?? ''
  const ingresoId = params.ingresoId ? parseInt(params.ingresoId, 10) : NaN
  const modoInicial = params.modo === 'AGRUPADA' ? 'AGRUPADA' : params.modo === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'MASIVA'

  const [admisiones, admisionSeleccionada] = await Promise.all([
    q.length >= 2 ? buscarAdmisionesActivasPorPaciente(q) : Promise.resolve([]),
    Number.isFinite(ingresoId) && ingresoId > 0
      ? obtenerContextoAdmisionParaOrden(ingresoId)
      : Promise.resolve(null),
  ])

  if (!admisionSeleccionada && params.pacienteId) {
    const pacienteId = parseInt(params.pacienteId, 10)
    if (!isNaN(pacienteId)) {
      const p = await prisma.paciente.findUnique({
        where: { id: pacienteId },
        select: {
          id: true,
          historiaClinica: true,
          nombreCompleto: true,
          tipoDocumento: true,
          numeroDocumento: true,
          obraSocialId: true,
          numeroAfiliado: true,
        },
      })
      if (p) {
        pacienteInicial = {
          id: p.id,
          historiaClinica: p.historiaClinica,
          nombreCompleto: p.nombreCompleto,
          tipoDocumento: p.tipoDocumento,
          numeroDocumento: p.numeroDocumento,
          obraSocialId: p.obraSocialId,
          numeroAfiliado: p.numeroAfiliado,
        }
      }
    }
  }

  if (admisionSeleccionada?.paciente) {
    pacienteInicial = {
      id: admisionSeleccionada.paciente.id,
      historiaClinica: null,
      nombreCompleto: admisionSeleccionada.paciente.nombreCompleto,
      tipoDocumento: admisionSeleccionada.paciente.tipoDocumento,
      numeroDocumento: admisionSeleccionada.paciente.numeroDocumento,
      obraSocialId: admisionSeleccionada.obraSocialId ?? admisionSeleccionada.paciente.obraSocialId,
      numeroAfiliado: admisionSeleccionada.numeroAfiliado ?? admisionSeleccionada.paciente.numeroAfiliado,
    }
  }

  return (
    <>
      <Header titulo="Nueva Autorización" />
      <div className="p-6 max-w-4xl space-y-4">
        <nav className="flex items-center gap-1 text-xs text-gray-500">
          <Link href="/dashboard/ambulatorio" className="hover:text-gray-700">
            Autorizaciones
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-gray-900 font-medium">Nueva Autorización</span>
        </nav>

        <section className="space-y-3">
          <form className="flex gap-2" method="GET">
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar admisión: nombre o DNI del paciente"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Buscar
            </button>
          </form>

          {q.length >= 2 && (
            <div className="rounded-md border divide-y max-h-64 overflow-y-auto">
              {admisiones.length === 0 ? (
                <p className="px-3 py-2 text-sm text-gray-500">Sin admisiones activas para esa búsqueda.</p>
              ) : (
                admisiones.map((adm) => {
                  const seleccionada = admisionSeleccionada?.id === adm.id
                  const nombrePaciente = adm.paciente?.nombreCompleto ?? adm.nombre ?? 'Sin nombre'
                  return (
                    <Link
                      key={adm.id}
                      href={`/dashboard/ambulatorio/nueva?q=${encodeURIComponent(q)}&ingresoId=${adm.id}`}
                      className={`block px-3 py-2 text-sm hover:bg-gray-50 ${seleccionada ? 'bg-blue-50' : 'bg-white'}`}
                    >
                      <p className="font-medium text-gray-900">
                        {adm.tipoIngresoCodigo}-{adm.numeroIngreso} · {nombrePaciente}
                      </p>
                      <p className="text-xs text-gray-500">
                        DNI: {adm.paciente?.numeroDocumento ?? '-'} · Ingreso:{' '}
                        {adm.fechaIngreso
                          ? new Date(adm.fechaIngreso).toLocaleString('es-AR')
                          : 'Sin fecha'}
                      </p>
                    </Link>
                  )
                })
              )}
            </div>
          )}

          {admisionSeleccionada && (
            <p className="text-xs text-blue-700 font-medium">
              ✓ Admisión {admisionSeleccionada.tipoIngresoCodigo}-{admisionSeleccionada.numeroIngreso} seleccionada
            </p>
          )}
        </section>

        {!admisionSeleccionada ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Buscá y seleccioná una admisión para cargar la autorización.
          </div>
        ) : (
          <ConsultaForm
            obraSociales={obraSocialesRows}
            profesionales={profesionales}
            pacienteInicial={pacienteInicial}
            admisionInicial={admisionSeleccionada}
            usuario={usuario.codigoUsuario}
            modoInicial={modoInicial}
          />
        )}
      </div>
    </>
  )
}
