import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect, notFound } from 'next/navigation'
import { obtenerPaciente } from '@/modules/pacientes/service'
import { PacienteForm } from '@/components/pacientes/paciente-form'
import { prisma } from '@/lib/db'
import { asegurarCosegurosIPSS } from '@/lib/utils/coseguros'
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

  // Convertir tipos Prisma a valores compatibles con inputs HTML
  const valoresIniciales = {
    apellido: paciente.apellido,
    nombre: paciente.nombre,
    tipoDocumento: paciente.tipoDocumento ?? undefined,
    numeroDocumento: paciente.numeroDocumento ?? undefined,
    // cuil: Decimal → string para el input de texto
    cuil: paciente.cuil?.toString() ?? undefined,
    // fechaNacimiento: Date → YYYY-MM-DD para input type="date"
    fechaNacimiento: paciente.fechaNacimiento
      ? paciente.fechaNacimiento.toISOString().split('T')[0]
      : undefined,
    sexo: paciente.sexo ?? undefined,
    estadoCivil: paciente.estadoCivil ?? undefined,
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
    empleoTutor: paciente.empleoTutor ?? undefined,
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
          planes={planes}
          coseguros={coseguros}
        />
      </div>
    </>
  )
}
