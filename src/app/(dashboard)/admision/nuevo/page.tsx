import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { AdmisionForm } from '@/components/admision/admision-form'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { Metadata } from 'next'
import type { PacienteResumen } from '@/modules/admision/types'

export const metadata: Metadata = { title: 'Nueva Admisión' }

interface PageProps {
  searchParams: Promise<{ pacienteId?: string }>
}

export default async function NuevaAdmisionPage({ searchParams }: PageProps) {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'ADMISION', 'CREAR')) {
    redirect('/dashboard/admision')
  }

  const profesionales = await prisma.profesional.findMany({
    where: { estado: 'A' },
    select: { id: true, nombre: true },
    orderBy: { nombre: 'asc' },
  })

  const subtipos = await prisma.subtipoAdmision.findMany({
    where: { estado: 'A' },
    select: { codigo: true, descripcion: true },
    orderBy: { descripcion: 'asc' },
  })

  let obraSociales: Array<{ id: number; nombre: string; requiereCoseguro: boolean }> = []
  let planes: Array<{ id: number; nombre: string; obraSocialId: number | null }> = []

  try {
    const obraSocialesRows = await prisma.$queryRaw<Array<{ id: number; nombre: string; requiereCoseguro: boolean; activa: boolean }>>`
      SELECT
        "OSID"::int AS id,
        COALESCE(
          NULLIF(BTRIM(COALESCE(to_jsonb(os) ->> 'OSNom', to_jsonb(os) ->> 'OBRA_SOCIAL')), ''),
          'Sin nombre'
        ) AS nombre,
        CASE
          WHEN LOWER(BTRIM(COALESCE(to_jsonb(os) ->> 'REQUIERE_COSEGURO', to_jsonb(os) ->> 'OSReqCoseg', 'No'))) IN ('si', 'sí', 's', '1', 'true', 't') THEN true
          ELSE false
        END AS "requiereCoseguro",
        CASE
          WHEN LOWER(BTRIM(COALESCE(to_jsonb(os) ->> 'ESTADO', to_jsonb(os) ->> 'OSEstad', 'Activa'))) IN ('activa', 'activo', 'a', '1', 'true', 't') THEN true
          ELSE false
        END AS activa
      FROM "ObraSocial" os
      ORDER BY nombre ASC
    `
    obraSociales = obraSocialesRows
      .filter((obraSocial) => obraSocial.activa)
      .map(({ id, nombre, requiereCoseguro }) => ({ id, nombre, requiereCoseguro }))
  } catch (error) {
    console.error('[ADMISION] No se pudieron cargar obras sociales:', error)
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
    // PlanOSoc puede no existir aún
  }

  // Pre-cargar paciente si se pasó pacienteId por query param
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
      <Header titulo="Nueva Admisión" />
      <div className="p-6 max-w-4xl space-y-4">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-xs text-gray-500">
          <Link href="/dashboard/admision" className="hover:text-gray-700">
            Admisión
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-gray-900 font-medium">Nueva Admisión</span>
        </nav>

        <AdmisionForm
          profesionales={profesionales}
          obraSociales={obraSociales}
          planes={planes}
          subtipos={subtipos}
          pacienteInicial={pacienteInicial}
        />
      </div>
    </>
  )
}
