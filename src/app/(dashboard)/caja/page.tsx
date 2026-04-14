import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import { Calculator } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Caja' }

export default async function CajaPage() {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'CAJA', 'LEER')) redirect('/dashboard')

  return (
    <>
      <Header titulo="Caja" />
      <div className="p-6">
        <div className="his-card p-12 text-center">
          <Calculator className="h-10 w-10 mx-auto text-gray-300 mb-3" />
          <h3 className="text-base font-medium text-gray-600">Módulo de Caja</h3>
          <p className="text-sm text-gray-400 mt-1">En desarrollo - Próxima etapa</p>
        </div>
      </div>
    </>
  )
}
