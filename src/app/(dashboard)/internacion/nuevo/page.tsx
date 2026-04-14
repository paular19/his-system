import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { obtenerCamasDisponibles } from '@/modules/internacion/service'
import { InternacionForm } from '@/components/internacion/internacion-form'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { Metadata } from 'next'
import type { PacienteResumen } from '@/modules/admision/types'

export const metadata: Metadata = { title: 'Nueva Internación' }

interface PageProps {
  searchParams: Promise<{ pacienteId?: string; camaId?: string }>
}

export default async function NuevaInternacionPage({ searchParams }: PageProps) {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'INTERNACION', 'CREAR')) {
    redirect('/dashboard/internacion')
  }

  const params = await searchParams

  // Datos necesarios para el formulario
  const [profesionales, camasDisponibles] = await Promise.all([
    prisma.profesional.findMany({
      where: { estado: 'A' },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
    obtenerCamasDisponibles(),
  ])

  let obraSociales: Array<{ id: number; nombre: string; requiereCoseguro: boolean }> = []
  let planes: Array<{ id: number; nombre: string; obraSocialId: number | null }> = []

  try {
    const rows = await prisma.$queryRaw<
      Array<{ id: number; nombre: string; requiereCoseguro: boolean; activa: boolean }>
    >`
      SELECT
        "OSID"::int AS id,
        COALESCE(NULLIF(BTRIM("OSNom"), ''), 'Sin nombre') AS nombre,
        CASE
          WHEN LOWER(BTRIM(COALESCE("OSReqCoseg", ''))) IN ('s', 'si', 'sí', '1') THEN true
          ELSE false
        END AS "requiereCoseguro",
        CASE
          WHEN LOWER(BTRIM(COALESCE("OSEstad", 'A'))) = 'a' THEN true
          ELSE false
        END AS activa
      FROM "ObraSocial"
      ORDER BY nombre ASC
    `
    obraSociales = rows
      .filter((r) => r.activa)
      .map(({ id, nombre, requiereCoseguro }) => ({ id, nombre, requiereCoseguro }))
  } catch {
    // Tabla puede estar vacía
  }

  try {
    planes = await prisma.$queryRaw<Array<{ id: number; nombre: string; obraSocialId: number | null }>>`
      SELECT
        "PosID"::int AS id,
        COALESCE(NULLIF(BTRIM("PosDescrip"), ''), CONCAT('Plan ', "PosID"::text)) AS nombre,
        "OSID"::int AS "obraSocialId"
      FROM "PlanOSoc"
      ORDER BY nombre ASC
    `
  } catch {
    // Tabla puede no existir
  }

  // Paciente inicial si viene por query param
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

  const camaInicial = params.camaId ? parseInt(params.camaId, 10) : null

  return (
    <>
      <Header titulo="Nueva Internación" />
      <div className="p-6 max-w-4xl space-y-4">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-xs text-gray-500">
          <Link href="/dashboard/internacion" className="hover:text-gray-700">
            Internación
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-gray-900 font-medium">Nueva internación</span>
        </nav>

        <InternacionForm
          profesionales={profesionales}
          obraSociales={obraSociales}
          planes={planes}
          camasDisponibles={camasDisponibles}
          pacienteInicial={pacienteInicial}
          camaInicial={isNaN(camaInicial ?? NaN) ? null : camaInicial}
        />
      </div>
    </>
  )
}
