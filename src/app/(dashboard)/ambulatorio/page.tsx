import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import { listarOrdenes } from '@/modules/orden/repository'
import { OrdenesTabs } from '@/components/orden/ordenes-tabs'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Autorizaciones' }

interface PageProps {
  searchParams: Promise<{ tab?: string; pagina?: string }>
}

export default async function AmbulatorioPage({ searchParams }: PageProps) {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'AMBULATORIO', 'LEER')) redirect('/dashboard')

  const params = await searchParams
  const tabActual = params.tab === 'confirmadas' ? 'confirmadas' : 'pendientes'
  const pagina = params.pagina ? Math.max(1, parseInt(params.pagina, 10)) : 1
  const porPagina = 20
  const skip = (pagina - 1) * porPagina

  const [resPendientes, resConfirmadas] = await Promise.all([
    listarOrdenes({
      pendiente: true,
      skip: tabActual === 'pendientes' ? skip : 0,
      take: tabActual === 'pendientes' ? porPagina : 0,
    }),
    listarOrdenes({
      pendiente: false,
      skip: tabActual === 'confirmadas' ? skip : 0,
      take: tabActual === 'confirmadas' ? porPagina : 0,
    }),
  ])

  const totalPaginas = Math.ceil(
    (tabActual === 'pendientes' ? resPendientes.total : resConfirmadas.total) / porPagina
  )

  const puedeCrear = tienePermiso(usuario.rol, 'AMBULATORIO', 'CREAR')
  const puedeModificar = tienePermiso(usuario.rol, 'AMBULATORIO', 'MODIFICAR')
  const puedeCargarAutorizacion = puedeModificar || puedeCrear

  return (
    <>
      <Header titulo="Autorizaciones" />
      <div className="p-6 space-y-5">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {resPendientes.total} pendiente{resPendientes.total !== 1 ? 's' : ''} ·{' '}
            {resConfirmadas.total} confirmada{resConfirmadas.total !== 1 ? 's' : ''}
          </p>
          {puedeCrear && (
            <Link
              href="/dashboard/ambulatorio/nueva"
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Nueva Autorización
            </Link>
          )}
        </div>

        <OrdenesTabs
          pendientes={resPendientes.ordenes}
          confirmadas={resConfirmadas.ordenes}
          totalPendientes={resPendientes.total}
          totalConfirmadas={resConfirmadas.total}
          puedeModificar={puedeCargarAutorizacion}
          tabActual={tabActual}
          pagina={pagina}
          totalPaginas={totalPaginas}
        />
      </div>
    </>
  )
}
