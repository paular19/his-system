import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect, notFound } from 'next/navigation'
import { obtenerOrden } from '@/modules/orden/repository'
import { AutorizacionPrint } from '@/components/orden/autorizacion-print'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Autorización' }

interface PageProps {
  params: Promise<{ puestoNumero: string; numero: string }>
}

export default async function AutorizacionPage({ params }: PageProps) {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'AMBULATORIO', 'LEER')) redirect('/dashboard')

  const { puestoNumero: pStr, numero: nStr } = await params
  const puestoNumero = parseInt(pStr, 10)
  const numero = parseInt(nStr, 10)

  if (isNaN(puestoNumero) || isNaN(numero)) notFound()

  const orden = await obtenerOrden(puestoNumero, numero)
  if (!orden) notFound()

  return (
    <div className="p-6 max-w-4xl">
      <AutorizacionPrint
        orden={orden}
        nombreClinica="CLINICA SAN RAFAEL"
        usuario={usuario.codigoUsuario}
      />
    </div>
  )
}
