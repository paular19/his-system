import { Header } from '@/components/layout/header'
import { PrintButton } from '@/components/ui/print-button'
import { FichaViasNotas } from '@/components/internacion/ficha-vias-notas'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { prisma } from '@/lib/db'
import { formatearFechaHoraArgentina } from '@/lib/utils/argentina-date'
import { ChevronRight } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

export const metadata: Metadata = { title: 'Ficha de vias' }

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ viaId?: string }>
}

export default async function FichaViasPage({ params, searchParams }: PageProps) {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'INTERNACION', 'LEER')) redirect('/dashboard')

  const puedeEditar =
    tienePermiso(usuario.rol, 'INTERNACION', 'CREAR') ||
    tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR')

  const { id } = await params
  const ingresoId = Number.parseInt(id, 10)
  if (Number.isNaN(ingresoId)) notFound()

  const { viaId } = await searchParams
  const viaIdInicial = viaId ? Number.parseInt(viaId, 10) : null

  const ingreso = await prisma.ingreso.findUnique({
    where: { id: ingresoId },
    select: {
      id: true,
      numeroIngreso: true,
      tipoIngresoCodigo: true,
      nombre: true,
      obraSocial: { select: { nombre: true } },
      paciente: {
        select: {
          nombreCompleto: true,
          numeroDocumento: true,
        },
      },
    },
  })

  if (!ingreso || ingreso.tipoIngresoCodigo !== 'INT') notFound()

  return (
    <>
      <Header titulo="Ficha de vias" />

      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 6mm;
          }

          .ficha-vias-sheet {
            width: 100%;
            max-width: 194mm;
            margin: 0 auto;
          }

          .ficha-vias-sheet .his-card {
            box-shadow: none !important;
            border-color: #cbd5e1 !important;
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

      <div className="ficha-vias-sheet p-6 max-w-5xl space-y-6 print:space-y-0 print:p-0">
        <nav className="flex items-center gap-1 text-xs text-gray-500 print:hidden">
          <Link href="/dashboard/internacion" className="hover:text-gray-700">
            Internacion
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link href={`/dashboard/internacion/${ingresoId}`} className="hover:text-gray-700">
            INT-{ingreso.numeroIngreso}
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-gray-900 font-medium">Ficha de vias</span>
        </nav>

        <div className="flex justify-end gap-2 print:hidden">
          <PrintButton
            label="Imprimir"
            className="flex items-center gap-2 rounded-md border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          />
        </div>

        <div className="border-b-2 pb-4 print:hidden">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 print:text-xl">Ficha de vias</h1>
              <p className="text-xs text-gray-500 mt-1">
                Internacion INT-{ingreso.numeroIngreso} · Generada: {formatearFechaHoraArgentina(new Date(), {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-800">{ingreso.paciente?.nombreCompleto ?? ingreso.nombre ?? 'Sin nombre'}</p>
              <p className="text-xs text-gray-500">
                DNI {ingreso.paciente?.numeroDocumento != null ? String(ingreso.paciente.numeroDocumento) : '—'}
              </p>
            </div>
          </div>
        </div>

        <FichaViasNotas
          ingresoId={ingresoId}
          numeroIngreso={ingreso.numeroIngreso}
          pacienteNombre={ingreso.paciente?.nombreCompleto ?? ingreso.nombre ?? null}
          pacienteDni={ingreso.paciente?.numeroDocumento != null ? String(ingreso.paciente.numeroDocumento) : null}
          obraSocial={ingreso.obraSocial?.nombre ?? null}
          viaIdInicial={Number.isFinite(viaIdInicial ?? Number.NaN) ? viaIdInicial : null}
          puedeEditar={puedeEditar}
        />
      </div>
    </>
  )
}
