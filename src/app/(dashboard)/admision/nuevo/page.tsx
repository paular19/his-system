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
import { asegurarCosegurosIPSS } from '@/lib/utils/coseguros'

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

  const codigosSubtipoAdmision = ['RAY', 'GUA', 'CUR', 'SUT', 'ECG', 'ECO', 'DER', 'TUR']
  const ordenSubtipos = new Map(codigosSubtipoAdmision.map((codigo, i) => [codigo, i]))

  const subtiposRaw = await prisma.subtipoAdmision.findMany({
    where: {
      estado: 'A',
      codigo: { in: codigosSubtipoAdmision },
    },
    select: { codigo: true, descripcion: true },
  })

  const subtipos = subtiposRaw.sort(
    (a, b) => (ordenSubtipos.get(a.codigo) ?? 999) - (ordenSubtipos.get(b.codigo) ?? 999)
  )

  let obraSociales: Array<{ id: number; nombre: string; requiereCoseguro: boolean }> = []
  let planes: Array<{ id: number; nombre: string; obraSocialId: number | null }> = []
  let coseguros: Array<{ id: number; nombre: string }> = []

  try {
    const rows = await prisma.obraSocial.findMany({
      where: { estado: 'A' },
      select: { id: true, nombre: true, requiereCoseguro: true },
      orderBy: { nombre: 'asc' },
    })
    obraSociales = rows.map((os) => ({
      id: os.id,
      nombre: os.nombre,
      requiereCoseguro: os.requiereCoseguro === 'S',
    }))
  } catch (error) {
    console.error('[ADMISION] No se pudieron cargar obras sociales:', error)
  }

  try {
    coseguros = await asegurarCosegurosIPSS()
  } catch (error) {
    console.error('[ADMISION] No se pudieron asegurar/cargar coseguros de IPSS:', error)
  }

  try {
    const rows = await prisma.planObraSocial.findMany({
      where: { estado: 'A' },
      select: { id: true, descripcion: true, obraSocialId: true },
      orderBy: { descripcion: 'asc' },
    })
    planes = rows.map((p) => ({
      id: p.id,
      nombre: p.descripcion,
      obraSocialId: p.obraSocialId,
    }))
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
          planes={planes}
          coseguros={coseguros}
          subtipos={subtipos}
          pacienteInicial={pacienteInicial}
        />
      </div>
    </>
  )
}
