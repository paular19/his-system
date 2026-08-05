import { Header } from '@/components/layout/header'
import { getUsuarioSesionLectura } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect, notFound } from 'next/navigation'
import { obtenerIngreso } from '@/modules/admision/service'
import type { Metadata } from 'next'
import { FichaIngresoClient } from '@/components/admision/ficha-ingreso-client'
import { logServerPerf } from '@/lib/perf/server-perf'
import { Suspense } from 'react'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  return { title: `Ingreso #${id}` }
}

type PrefetchFichaData = {
  nombre: string | null
  documento: string | null
  obraSocial: string | null
}

function resolverQueryString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null
  if (typeof value === 'string') return value.trim() || null
  return null
}

function resolverPrefetch(searchParamsRaw: Record<string, string | string[] | undefined>): PrefetchFichaData {
  const nombre = resolverQueryString(searchParamsRaw.prefetchNombre)?.slice(0, 80) ?? null
  const documento = resolverQueryString(searchParamsRaw.prefetchDocumento)?.slice(0, 20) ?? null
  const obraSocial = resolverQueryString(searchParamsRaw.prefetchObraSocial)?.slice(0, 80) ?? null

  return { nombre, documento, obraSocial }
}

function FichaIngresoFallback({ ingresoId, prefetch }: { ingresoId: number; prefetch: PrefetchFichaData }) {
  return (
    <div className="p-6 max-w-4xl space-y-5 animate-pulse">
      <div className="h-4 w-48 rounded bg-gray-200" />

      <div className="space-y-2">
        <h2 className="text-xl font-bold text-gray-900">
          {prefetch.nombre ?? `Cargando ingreso #${ingresoId}...`}
        </h2>
        <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 flex-wrap">
          <span className="font-mono font-medium text-blue-600">AMB-{ingresoId}</span>
          {prefetch.documento && <span>Doc.: {prefetch.documento}</span>}
          {prefetch.obraSocial && <span>O.S.: {prefetch.obraSocial}</span>}
        </div>
      </div>

      <div className="his-card p-5 space-y-3">
        <div className="h-4 w-40 rounded bg-gray-200" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="h-12 rounded bg-gray-100" />
          <div className="h-12 rounded bg-gray-100" />
          <div className="h-12 rounded bg-gray-100" />
        </div>
      </div>

      <div className="his-card p-5 space-y-3">
        <div className="h-4 w-44 rounded bg-gray-200" />
        <div className="h-28 rounded bg-gray-100" />
      </div>
    </div>
  )
}

async function FichaIngresoContenido({
  ingresoId,
  clerkId,
  puedeModificar,
  puedeAgregarDiagnostico,
  puedeGenerarAutorizacion,
}: {
  ingresoId: number
  clerkId: string
  puedeModificar: boolean
  puedeAgregarDiagnostico: boolean
  puedeGenerarAutorizacion: boolean
}) {
  const tInicio = Date.now()

  const tIngresoInicio = Date.now()
  let ingreso
  try {
    ingreso = await obtenerIngreso(ingresoId, clerkId)
  } catch (error) {
    if (error instanceof Error && /no encontrado/i.test(error.message)) {
      notFound()
    }

    console.error(`[admision] Error cargando ingreso ${ingresoId}`, error)
    throw error
  }
  const msIngreso = Date.now() - tIngresoInicio

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

export default async function FichaIngresoPage({ params, searchParams }: PageProps) {
  const [usuario, paramsResueltos, query] = await Promise.all([
    getUsuarioSesionLectura(),
    params,
    searchParams,
  ])

  if (!tienePermiso(usuario.rol, 'ADMISION', 'LEER')) redirect('/dashboard')

  const { id } = paramsResueltos
  const ingresoId = parseInt(id, 10)
  if (isNaN(ingresoId)) notFound()

  const prefetch = resolverPrefetch(query)

  const puedeModificar = tienePermiso(usuario.rol, 'ADMISION', 'MODIFICAR')
  const puedeAgregarDiagnostico = tienePermiso(usuario.rol, 'ADMISION', 'CREAR')
  const puedeGenerarAutorizacion = tienePermiso(usuario.rol, 'AMBULATORIO', 'CREAR')

  return (
    <Suspense fallback={<FichaIngresoFallback ingresoId={ingresoId} prefetch={prefetch} />}>
      <FichaIngresoContenido
        ingresoId={ingresoId}
        clerkId={usuario.clerkId}
        puedeModificar={puedeModificar}
        puedeAgregarDiagnostico={puedeAgregarDiagnostico}
        puedeGenerarAutorizacion={puedeGenerarAutorizacion}
      />
    </Suspense>
  )
}
