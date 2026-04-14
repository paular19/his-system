import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import { Activity } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Cotizador de Prestaciones' }

export default async function CotizadorPage() {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'COTIZADOR', 'LEER')) redirect('/dashboard')

  return (
    <>
      <Header titulo="Cotizador de Prestaciones" />
      <div className="p-6">
        <div className="his-card p-12 text-center">
          <Activity className="h-10 w-10 mx-auto text-gray-300 mb-3" />
          <h3 className="text-base font-medium text-gray-600">Cotizador de Prestaciones</h3>
          <p className="text-sm text-gray-400 mt-1">En desarrollo - Próxima etapa</p>
        </div>
      </div>
    </>
  )
}
