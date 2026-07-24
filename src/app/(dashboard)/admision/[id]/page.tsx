import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect, notFound } from 'next/navigation'
import { obtenerIngreso } from '@/modules/admision/service'
import type { Metadata } from 'next'
import { FichaIngresoClient } from '@/components/admision/ficha-ingreso-client'
import { logServerPerf } from '@/lib/perf/server-perf'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  return { title: `Ingreso #${id}` }
}

export default async function FichaIngresoPage({ params }: PageProps) {
  const tInicio = Date.now()
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'ADMISION', 'LEER')) redirect('/dashboard')

  const { id } = await params
  const ingresoId = parseInt(id, 10)
  if (isNaN(ingresoId)) notFound()

  const tIngresoInicio = Date.now()
  let ingreso
  try {
    ingreso = await obtenerIngreso(ingresoId, usuario.clerkId)
  } catch (error) {
    if (error instanceof Error && /no encontrado/i.test(error.message)) {
      notFound()
    }

    console.error(`[admision] Error cargando ingreso ${ingresoId}`, error)
    throw error
  }
  const msIngreso = Date.now() - tIngresoInicio

  const puedeModificar = tienePermiso(usuario.rol, 'ADMISION', 'MODIFICAR')
  const puedeAgregarDiagnostico = tienePermiso(usuario.rol, 'ADMISION', 'CREAR')
  const puedeGenerarAutorizacion = tienePermiso(usuario.rol, 'AMBULATORIO', 'CREAR')

  // Serializar campos Decimal → tipos planos para Client Components
  const tSerializacionInicio = Date.now()
  const ingresoSerializado = {
    ...ingreso,
    paciente: ingreso.paciente
      ? { ...ingreso.paciente, cuil: ingreso.paciente.cuil?.toNumber() ?? null }
      : ingreso.paciente,
    practicas: ingreso.practicas.map((p) => ({
      ...p,
      cantidad: Number(String(p.cantidad)),
    })),
  }
  const msSerializacion = Date.now() - tSerializacionInicio

  logServerPerf('admision.ficha', {
    ingresoId,
    msIngreso,
    msSerializacion,
    practicas: ingreso.practicas.length,
    totalMs: Date.now() - tInicio,
  })

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
