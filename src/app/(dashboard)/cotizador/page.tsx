import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { PresupuestoCotizador } from '@/components/cotizador/presupuesto-cotizador'

export const metadata: Metadata = { title: 'Presupuesto de Practicas' }

export default async function CotizadorPage() {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'COTIZADOR', 'LEER')) redirect('/dashboard')

  return (
    <>
      <Header titulo="Presupuesto" />
      <PresupuestoCotizador usuario={usuario.codigoUsuario} />
    </>
  )
}
