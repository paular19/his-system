import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import { PacienteForm } from '@/components/pacientes/paciente-form'
import { prisma } from '@/lib/db'
import { asegurarCosegurosIPSS } from '@/lib/utils/coseguros'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Nuevo Paciente' }

export default async function NuevoPacientePage() {
  const usuario = await getUsuarioSesion()

  if (!tienePermiso(usuario.rol, 'PACIENTES', 'CREAR')) {
    redirect('/dashboard/pacientes')
  }

  const [obraSocialesRows, planesRows] = await Promise.all([
    prisma.obraSocial.findMany({
      select: { id: true, nombre: true, requiereCoseguro: true, estado: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.planObraSocial.findMany({
      where: { estado: 'A' },
      select: { id: true, descripcion: true, obraSocialId: true },
      orderBy: { descripcion: 'asc' },
    }),
  ])

  const obraSociales = obraSocialesRows
    .filter((os) => (os.estado ?? '').trim().toUpperCase() === 'A')
    .map((os) => {
      const req = (os.requiereCoseguro ?? '').trim().toUpperCase()
      return {
        id: os.id,
        nombre: os.nombre.trim(),
        requiereCoseguro: ['S', 'SI', '1', 'TRUE', 'T'].includes(req),
      }
    })

  const planes = planesRows.map((plan) => ({
    id: plan.id,
    descripcion: plan.descripcion,
    obraSocialId: plan.obraSocialId,
  }))

  const coseguros = await asegurarCosegurosIPSS()

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
          planes={planes}
          coseguros={coseguros}
        />
      </div>
    </>
  )
}
