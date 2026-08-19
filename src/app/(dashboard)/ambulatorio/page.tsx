import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import { listarOrdenesPorSolapa, type TabOrden } from '@/modules/orden/repository'
import { OrdenesTabs } from '@/components/orden/ordenes-tabs'
import { BuscadorOrdenes } from '@/components/orden/buscador-ordenes'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Autorizaciones' }

function esTabValido(value: string | undefined): value is TabOrden {
  return value === 'pendientes' || value === 'confirmadas' || value === 'anuladas'
}

interface PageProps {
  searchParams: Promise<{
    tab?: string
    pagina?: string
    porPagina?: string
    q?: string
    saltoAuto?: string
    desde?: string
  }>
}

export default async function AmbulatorioPage({ searchParams }: PageProps) {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'AMBULATORIO', 'LEER')) redirect('/dashboard')

  const params = await searchParams
  const tabActual: TabOrden =
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

  const resultado = await listarOrdenesPorSolapa({ q, tabActual, skip, take: porPagina })
  const { pendientes: resPendientes, confirmadas: resConfirmadas, anuladas: resAnuladas } = resultado

  const totales: Record<TabOrden, number> = {
    pendientes: resPendientes.total,
    confirmadas: resConfirmadas.total,
    anuladas: resAnuladas.total,
  }
  const totalActual = totales[tabActual]

  // Si la busqueda no dio nada en esta solapa pero si en otra, llevamos al
  // usuario ahi en vez de mostrarle un vacio enganoso. El flag evita rebotes.
  const solapasConResultados = (['pendientes', 'confirmadas', 'anuladas'] as const).filter(
    (tab) => totales[tab] > 0
  )
  const destino = solapasConResultados[0]
  if (q && totalActual === 0 && destino && params.saltoAuto !== '1') {
    const query = new URLSearchParams({
      tab: destino,
      q,
      porPagina: String(porPagina),
      pagina: '1',
      saltoAuto: '1',
      desde: tabActual,
    })
    redirect(`/dashboard/ambulatorio?${query.toString()}`)
  }

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

        <BuscadorOrdenes
          q={q}
          tabActual={tabActual}
          porPagina={porPagina}
          busqueda={resultado.busqueda}
          totales={totales}
          saltoDesde={
            params.saltoAuto === '1' && esTabValido(params.desde) ? params.desde : null
          }
        />

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
          hayBusqueda={Boolean(q)}
        />
      </div>
    </>
  )
}
