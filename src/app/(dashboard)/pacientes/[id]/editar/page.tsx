import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect, notFound } from 'next/navigation'
import { obtenerPaciente } from '@/modules/pacientes/service'
import { PacienteForm } from '@/components/pacientes/paciente-form'
import { getCatalogoPacienteForm } from '@/lib/catalogos/pacientes-cache'
import { fechaCalendarioAInput } from '@/lib/utils'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { Metadata } from 'next'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  return { title: `Editar Paciente #${id}` }
}

export default async function EditarPacientePage({ params }: PageProps) {
  const usuario = await getUsuarioSesion()

  if (!tienePermiso(usuario.rol, 'PACIENTES', 'MODIFICAR')) {
    redirect('/dashboard/pacientes')
  }

  const { id } = await params
  const pacienteId = parseInt(id, 10)
  if (isNaN(pacienteId)) notFound()

  let paciente
  try {
    paciente = await obtenerPaciente(pacienteId, usuario.clerkId)
  } catch {
    notFound()
  }

  const { obraSociales, coseguros } = await getCatalogoPacienteForm()

  // Convertir tipos Prisma a valores compatibles con inputs HTML
  const valoresIniciales = {
    apellido: paciente.apellido,
    nombre: paciente.nombre,
    tipoDocumento: paciente.tipoDocumento ?? undefined,
    numeroDocumento: paciente.numeroDocumento ?? undefined,
    // fechaNacimiento: Date → YYYY-MM-DD para input type="date"
    fechaNacimiento: paciente.fechaNacimiento
      ? fechaCalendarioAInput(paciente.fechaNacimiento)
      : undefined,
    sexo: paciente.sexo ?? undefined,
    paisId: paciente.paisId ?? undefined,
    profesionId: paciente.profesionId ?? undefined,
    domicilio: paciente.domicilio ?? undefined,
    provinciaId: paciente.provinciaId ?? undefined,
    localidadId: paciente.localidadId ?? undefined,
    barrioId: paciente.barrioId ?? undefined,
    telefonoFijo: paciente.telefonoFijo ?? undefined,
    telefonoLaboral: paciente.telefonoLaboral ?? undefined,
    celular1: paciente.celular1 ?? undefined,
    celular2: paciente.celular2 ?? undefined,
    email: paciente.email ?? undefined,
    obraSocialId: paciente.obraSocialId ?? undefined,
    planId: paciente.planId ?? undefined,
    numeroAfiliado: paciente.numeroAfiliado ?? undefined,
    obraSocialCoseguroId: paciente.obraSocialCoseguroId ?? undefined,
    nombreTutor: paciente.nombreTutor ?? undefined,
    telefonoTutor: paciente.telefonoTutor ?? undefined,
    observaciones: paciente.observaciones ?? undefined,
  }

  return (
    <>
      <Header titulo={`Editar: ${paciente.nombreCompleto}`} />
      <div className="p-6 max-w-4xl space-y-4">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-xs text-gray-500">
          <Link href="/dashboard/pacientes" className="hover:text-gray-700">
            Pacientes
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link
            href={`/dashboard/pacientes/${pacienteId}`}
            className="hover:text-gray-700"
          >
            {paciente.nombreCompleto}
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-gray-900 font-medium">Editar</span>
        </nav>

        <PacienteForm
          pacienteId={pacienteId}
          valoresIniciales={valoresIniciales}
          obraSociales={obraSociales}
          coseguros={coseguros}
        />
      </div>
    </>
  )
}
