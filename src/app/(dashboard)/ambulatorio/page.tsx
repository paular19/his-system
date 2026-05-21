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
  searchParams: Promise<{ tab?: string; pagina?: string; porPagina?: string; q?: string }>
}

export default async function AmbulatorioPage({ searchParams }: PageProps) {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'AMBULATORIO', 'LEER')) redirect('/dashboard')

  const params = await searchParams
  const tabActual =
    params.tab === 'confirmadas'
      ? 'confirmadas'
      : params.tab === 'anuladas'
        ? 'anuladas'
        : 'pendientes'
  const pagina = params.pagina ? Math.max(1, parseInt(params.pagina, 10)) : 1
  const porPaginaParsed = params.porPagina ? parseInt(params.porPagina, 10) : 20
  const porPagina = [10, 20, 50, 100].includes(porPaginaParsed) ? porPaginaParsed : 20
  const q = params.q?.trim() ?? ''
  const skip = (pagina - 1) * porPagina

  const [resPendientes, resConfirmadas, resAnuladas] = await Promise.all([
    listarOrdenes({
      estadoTab: 'pendientes',
      q,
      skip: tabActual === 'pendientes' ? skip : 0,
      take: tabActual === 'pendientes' ? porPagina : 0,
    }),
    listarOrdenes({
      estadoTab: 'confirmadas',
      q,
      skip: tabActual === 'confirmadas' ? skip : 0,
      take: tabActual === 'confirmadas' ? porPagina : 0,
    }),
    listarOrdenes({
      estadoTab: 'anuladas',
      q,
      skip: tabActual === 'anuladas' ? skip : 0,
      take: tabActual === 'anuladas' ? porPagina : 0,
    }),
  ])

  const totalActual =
    tabActual === 'pendientes'
      ? resPendientes.total
      : tabActual === 'confirmadas'
        ? resConfirmadas.total
        : resAnuladas.total
  const totalPaginas = Math.max(1, Math.ceil(totalActual / porPagina))

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
            {resConfirmadas.total} confirmada{resConfirmadas.total !== 1 ? 's' : ''} ·{' '}
            {resAnuladas.total} anulada{resAnuladas.total !== 1 ? 's' : ''}
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

        <form method="GET" className="flex gap-2">
          <input type="hidden" name="tab" value={tabActual} />
          <input type="hidden" name="porPagina" value={String(porPagina)} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por paciente, afiliado, N° de orden o N° de autorización"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Buscar
          </button>
        </form>

        <OrdenesTabs
          pendientes={resPendientes.ordenes}
          confirmadas={resConfirmadas.ordenes}
          anuladas={resAnuladas.ordenes}
          totalPendientes={resPendientes.total}
          totalConfirmadas={resConfirmadas.total}
          totalAnuladas={resAnuladas.total}
          puedeModificar={puedeCargarAutorizacion}
          tabActual={tabActual}
          pagina={pagina}
          porPagina={porPagina}
          totalPaginas={totalPaginas}
        />
      </div>
    </>
  )
}
