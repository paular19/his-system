import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect, notFound } from 'next/navigation'
import { obtenerIngreso } from '@/modules/admision/service'
import type { Metadata } from 'next'
import { FichaIngresoClient } from '@/components/admision/ficha-ingreso-client'
import { FichaAdmisionPrint } from '@/components/admision/ficha-admision-print'
import Link from 'next/link'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  return { title: `Ingreso #${id}` }
}

export default async function FichaIngresoPage({ params }: PageProps) {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'ADMISION', 'LEER')) redirect('/dashboard')

  const { id } = await params
  const ingresoId = parseInt(id, 10)
  if (isNaN(ingresoId)) notFound()

  let ingreso
  try {
    ingreso = await obtenerIngreso(ingresoId, usuario.clerkId)
  } catch {
    notFound()
  }

  const puedeModificar = tienePermiso(usuario.rol, 'ADMISION', 'MODIFICAR')
  const puedeAgregarDiagnostico = tienePermiso(usuario.rol, 'ADMISION', 'CREAR')
  const puedeGenerarAutorizacion = tienePermiso(usuario.rol, 'AMBULATORIO', 'CREAR')

  // Serializar Decimal → string para evitar error de Client Component
  const ingresoSerializado = {
    ...ingreso,
    paciente: ingreso.paciente
      ? { ...ingreso.paciente, cuil: ingreso.paciente.cuil?.toString() ?? null }
      : ingreso.paciente,
  }

  return (
    <>
      <Header
        titulo={`${ingreso.tipoIngreso?.descripcion ?? ingreso.tipoIngresoCodigo} — ${ingreso.tipoIngresoCodigo}-${ingreso.numeroIngreso}`}
      />
      <FichaIngresoClient
        ingreso={ingresoSerializado as typeof ingreso}
        puedeModificar={puedeModificar}
        puedeAgregarDiagnostico={puedeAgregarDiagnostico}
        puedeGenerarAutorizacion={puedeGenerarAutorizacion}
      />
    </>
  )
}

function DataItem({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{value ?? '-'}</dd>
    </div>
  )
}

// Inline client widget for adding a diagnosis — uses a hidden form + fetch
function DiagnosticoInlineForm({ ingresoId }: { ingresoId: number }) {
  // This is a server component; the actual interactive form is extracted to a client component
  return (
    <Link
      href={`/dashboard/admision/${ingresoId}/diagnostico`}
      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
    >
      + Agregar diagnóstico
    </Link>
  )
}
