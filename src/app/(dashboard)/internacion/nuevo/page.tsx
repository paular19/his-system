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
import {
  getCatalogoCoberturaAtencion,
  getProfesionalesActivosCatalogo,
} from '@/lib/catalogos/atencion-cache'

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
  const [profesionales, camasDisponibles, catalogoCobertura] = await Promise.all([
    getProfesionalesActivosCatalogo(),
    obtenerCamasDisponibles(),
    getCatalogoCoberturaAtencion(),
  ])

  const { obraSociales, planes } = catalogoCobertura

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
