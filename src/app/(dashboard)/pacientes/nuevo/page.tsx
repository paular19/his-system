import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import { PacienteForm } from '@/components/pacientes/paciente-form'
import { getCatalogoPacienteForm } from '@/lib/catalogos/pacientes-cache'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Nuevo Paciente' }

export default async function NuevoPacientePage() {
  const [usuario, catalogo] = await Promise.all([
    getUsuarioSesion(),
    getCatalogoPacienteForm(),
  ])

  if (!tienePermiso(usuario.rol, 'PACIENTES', 'CREAR')) {
    redirect('/dashboard/pacientes')
  }

  const { obraSociales, coseguros } = catalogo

  return (
    <>
      <Header titulo="Nuevo Paciente" />
      <div className="p-6 max-w-4xl space-y-4">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-xs text-gray-500">
          <Link href="/dashboard/pacientes" className="hover:text-gray-700">
            Pacientes
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-gray-900 font-medium">Nuevo Paciente</span>
        </nav>

        <PacienteForm
          obraSociales={obraSociales}
          coseguros={coseguros}
        />
      </div>
    </>
  )
}
