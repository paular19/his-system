import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect, notFound } from 'next/navigation'
import { obtenerOrden } from '@/modules/orden/repository'
import { AutorizacionPrint } from '@/components/orden/autorizacion-print'
import { PrintActions } from '@/components/orden/print-actions'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Impresión de Autorizaciones' }

interface PageProps {
  searchParams: Promise<{ ordenes?: string }>
}

function parseOrdenesParam(raw: string): Array<{ puestoNumero: number; numero: number }> {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [p, n] = part.split('-')
      const puestoNumero = Number.parseInt((p ?? '').trim(), 10)
      const numero = Number.parseInt((n ?? '').trim(), 10)
      return { puestoNumero, numero }
    })
    .filter((x) => Number.isFinite(x.puestoNumero) && Number.isFinite(x.numero))
}

export default async function ImprimirAutorizacionesPage({ searchParams }: PageProps) {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'AMBULATORIO', 'LEER')) redirect('/dashboard')

  const params = await searchParams
  const raw = params.ordenes?.trim() ?? ''
  if (!raw) notFound()

  const refs = parseOrdenesParam(raw)
  if (refs.length === 0) notFound()

  const ordenes = (
    await Promise.all(refs.map((r) => obtenerOrden(r.puestoNumero, r.numero)))
  ).filter((o): o is NonNullable<typeof o> => Boolean(o))

  if (ordenes.length === 0) notFound()

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <PrintActions imprimirLabel="Imprimir todas las órdenes" volverLabel="Volver" />

      {ordenes.map((orden) => (
        <AutorizacionPrint
          key={`${orden.puestoNumero}-${orden.numero}`}
          orden={orden}
          nombreClinica="CLINICA SAN RAFAEL"
          usuario={usuario.codigoUsuario}
          mostrarAcciones={false}
        />
      ))}
    </div>
  )
}
