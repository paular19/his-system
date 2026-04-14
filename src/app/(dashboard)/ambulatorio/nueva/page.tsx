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

export const metadata: Metadata = { title: 'Nueva Autorización' }

interface PageProps {
  searchParams: Promise<{ pacienteId?: string }>
}

export default async function NuevaAutorizacionPage({ searchParams }: PageProps) {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'AMBULATORIO', 'CREAR')) {
    redirect('/dashboard/ambulatorio')
  }

  const [obraSocialesRows, planes, profesionales, tiposIngreso] = await Promise.all([
    prisma.$queryRaw<Array<{ id: number; nombre: string }>>`
      SELECT "OSID"::int AS id, BTRIM("OSNom") AS nombre
      FROM "ObraSocial"
      WHERE BTRIM("OSEstad") = 'A'
      ORDER BY "OSNom" ASC
    `,
    prisma.planObraSocial.findMany({
      where: { estado: 'A' },
      select: { id: true, descripcion: true, obraSocialId: true },
      orderBy: { descripcion: 'asc' },
    }),
    prisma.profesional.findMany({
      where: { estado: 'A' },
      select: { id: true, nombre: true, matricula: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.tipoIngreso.findMany({
      orderBy: { descripcion: 'asc' },
    }),
  ])

  // Pre-cargar paciente si viene por query param
  const params = await searchParams
  let pacienteInicial: PacienteResumen | null = null

  if (params.pacienteId) {
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

        <ConsultaForm
          obraSociales={obraSocialesRows}
          planes={planes.map((p) => ({
            id: p.id,
            descripcion: p.descripcion,
            obraSocialId: p.obraSocialId,
          }))}
          profesionales={profesionales}
          pacienteInicial={pacienteInicial}
          usuario={usuario.codigoUsuario}
          tiposIngreso={tiposIngreso.map((t) => ({ codigo: t.codigo, descripcion: t.descripcion }))}
        />
      </div>
    </>
  )
}
