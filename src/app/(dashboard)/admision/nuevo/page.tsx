import { Header } from '@/components/layout/header'
import { getUsuarioSesionLectura } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { AdmisionForm } from '@/components/admision/admision-form'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { Metadata } from 'next'
import type { PacienteResumen } from '@/modules/admision/types'
import {
  getCatalogoCoberturaAtencionBasico,
  getProfesionalesActivosCatalogo,
  getSubtiposAdmisionCatalogo,
} from '@/lib/catalogos/atencion-cache'

export const metadata: Metadata = { title: 'Nueva Admisión' }

interface PageProps {
  searchParams: Promise<{ pacienteId?: string }>
}

export default async function NuevaAdmisionPage({ searchParams }: PageProps) {
  const usuario = await getUsuarioSesionLectura()
  if (!tienePermiso(usuario.rol, 'ADMISION', 'CREAR')) {
    redirect('/dashboard/admision')
  }

  const [
    profesionales,
    subtipos,
    catalogoCobertura,
  ] = await Promise.all([
    getProfesionalesActivosCatalogo(),
    getSubtiposAdmisionCatalogo(),
    getCatalogoCoberturaAtencionBasico(),
  ])

  const { obraSociales, coseguros } = catalogoCobertura

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
          apellido: true,
          nombre: true,
          nombreCompleto: true,
          tipoDocumento: true,
          numeroDocumento: true,
          sexo: true,
          fechaNacimiento: true,
          domicilio: true,
          telefonoFijo: true,
          celular1: true,
          email: true,
          obraSocialId: true,
          planId: true,
          obraSocialCoseguroId: true,
          numeroAfiliado: true,
        },
      })
      if (p) {
        pacienteInicial = {
          id: p.id,
          historiaClinica: p.historiaClinica,
          apellido: p.apellido,
          nombre: p.nombre,
          nombreCompleto: p.nombreCompleto,
          tipoDocumento: p.tipoDocumento,
          numeroDocumento: p.numeroDocumento,
          sexo: p.sexo,
          fechaNacimiento: p.fechaNacimiento,
          domicilio: p.domicilio,
          telefonoFijo: p.telefonoFijo,
          celular1: p.celular1,
          email: p.email,
          obraSocialId: p.obraSocialId,
          planId: p.planId,
          obraSocialCoseguroId: p.obraSocialCoseguroId,
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
          coseguros={coseguros}
          subtipos={subtipos}
          pacienteInicial={pacienteInicial}
        />
      </div>
    </>
  )
}
