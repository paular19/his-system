import { Header } from '@/components/layout/header'
import { PrintButton } from '@/components/ui/print-button'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { prisma } from '@/lib/db'
import { FichaQuirurgicaNotasCirujano } from '@/components/internacion/ficha-quirurgica-notas-cirujano'
import { FichaQuirurgicaAltaCirugia } from '@/components/internacion/ficha-quirurgica-alta-cirugia'
import {
  formatearFechaArgentina,
  formatearFechaHoraArgentina,
} from '@/lib/utils/argentina-date'
import { ChevronRight } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

export const metadata: Metadata = { title: 'Ficha Quirurgica' }

interface PageProps {
  params: Promise<{ id: string }>
}

function parseObservacionesCirugia(value: string | null | undefined): {
  diagnostico: string | null
  observaciones: string | null
} {
  if (!value || !value.trim()) {
    return { diagnostico: null, observaciones: null }
  }

  let diagnostico: string | null = null
  let observaciones: string | null = null

  const tokens = value
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  for (const token of tokens) {
    const [rawKey, ...rest] = token.split(':')
    const key = rawKey?.trim().toLowerCase()
    const parsedValue = rest.join(':').trim()

    if (!key || !parsedValue) continue
    if (key === 'diagnostico') diagnostico = parsedValue
    if (key === 'observaciones') observaciones = parsedValue
  }

  return {
    diagnostico,
    observaciones: observaciones ?? value,
  }
}

export default async function FichaQuirurgicaPage({ params }: PageProps) {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'INTERNACION', 'LEER')) redirect('/dashboard')

  const puedeCrearCirugia =
    tienePermiso(usuario.rol, 'INTERNACION', 'CREAR') ||
    tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR')

  const { id } = await params
  const ingresoId = Number.parseInt(id, 10)
  if (Number.isNaN(ingresoId)) notFound()

  const ingreso = await prisma.ingreso.findUnique({
    where: { id: ingresoId },
    select: {
      id: true,
      nombre: true,
      numeroIngreso: true,
      tipoIngresoCodigo: true,
      obraSocial: {
        select: {
          nombre: true,
        },
      },
      profesionalTratante: {
        select: {
          nombre: true,
          matricula: true,
        },
      },
      paciente: {
        select: {
          id: true,
          historiaClinica: true,
          nombreCompleto: true,
          numeroDocumento: true,
        },
      },
      cirugiasProgramadas: {
        where: { internacionId: ingresoId },
        orderBy: [{ fechaCirugia: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          fechaCirugia: true,
          horaCirugia: true,
          observaciones: true,
          diferenciales: {
            select: {
              mismaViaPatologia: true,
              diferentesViasPatologia: true,
              diferentesViasDiferentesPatologia: true,
              dobleCirugia: true,
            },
          },
        },
      },
    },
  })

  if (!ingreso || ingreso.tipoIngresoCodigo !== 'INT') notFound()

  const cirugias = ingreso.cirugiasProgramadas.map((cirugia) => {
    const diferencialesConsolidados = cirugia.diferenciales.reduce(
      (acc, row) => ({
        mismaViaPatologia: acc.mismaViaPatologia || row.mismaViaPatologia,
        diferentesViasPatologia: acc.diferentesViasPatologia || row.diferentesViasPatologia,
        diferentesViasDiferentesPatologia:
          acc.diferentesViasDiferentesPatologia || row.diferentesViasDiferentesPatologia,
        dobleCirugia: acc.dobleCirugia || row.dobleCirugia,
      }),
      {
        mismaViaPatologia: false,
        diferentesViasPatologia: false,
        diferentesViasDiferentesPatologia: false,
        dobleCirugia: false,
      }
    )

    const tipoCirugiaMultipleInicial = diferencialesConsolidados.diferentesViasDiferentesPatologia
      ? 'DISTINTA_VIA_DISTINTA_PATOLOGIA'
      : diferencialesConsolidados.mismaViaPatologia
        ? 'MISMA_VIA_DISTINTA_PATOLOGIA'
        : diferencialesConsolidados.diferentesViasPatologia
          ? 'MISMA_VIA_MISMA_PATOLOGIA'
          : ''

    const tipoCirugiaMultipleInicialTyped = tipoCirugiaMultipleInicial as
      | ''
      | 'MISMA_VIA_MISMA_PATOLOGIA'
      | 'MISMA_VIA_DISTINTA_PATOLOGIA'
      | 'DISTINTA_VIA_DISTINTA_PATOLOGIA'

    const cirugiasMultiplesInicial =
      diferencialesConsolidados.dobleCirugia ||
      diferencialesConsolidados.mismaViaPatologia ||
      diferencialesConsolidados.diferentesViasPatologia ||
      diferencialesConsolidados.diferentesViasDiferentesPatologia

    const meta = parseObservacionesCirugia(cirugia.observaciones)

    return {
      ...cirugia,
      tipoCirugiaMultipleInicial: tipoCirugiaMultipleInicialTyped,
      cirugiasMultiplesInicial,
      diagnosticoInicial: meta.diagnostico,
      observacionesIniciales: meta.observaciones,
    }
  })

  const fmtDate = (d: Date | null | undefined) =>
    formatearFechaArgentina(d, { day: '2-digit', month: '2-digit', year: 'numeric' })

  const fmtDateTime = (d: Date | null | undefined) =>
    formatearFechaHoraArgentina(d, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <>
      <Header titulo="Ficha Quirurgica" />

      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm;
          }

          .ficha-quirurgica-sheet {
            width: 100%;
            max-width: 194mm;
            margin: 0 auto;
          }

          .ficha-quirurgica-sheet .his-card {
            box-shadow: none !important;
            border-color: #cbd5e1 !important;
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

      <div className="ficha-quirurgica-sheet p-6 max-w-5xl space-y-6 print:space-y-2 print:p-2">
        <nav className="flex items-center gap-1 text-xs text-gray-500 print:hidden">
          <Link href="/dashboard/internacion" className="hover:text-gray-700">
            Internacion
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link href={`/dashboard/internacion/${ingresoId}`} className="hover:text-gray-700">
            INT-{ingreso.numeroIngreso}
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-gray-900 font-medium">Ficha Quirurgica</span>
        </nav>

        <div className="flex justify-end gap-2 print:hidden">
          <PrintButton
            label="Imprimir"
            className="flex items-center gap-2 rounded-md border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          />
        </div>

        <div className="border-b-2 pb-4 print:pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <img
                src="/logo-clinica.png"
                alt="Logo Clinica"
                className="hidden print:block"
                style={{ maxWidth: 110, marginBottom: 4 }}
              />
              <h1 className="text-2xl font-bold text-gray-900 print:text-xl">Ficha Quirurgica</h1>
              <p className="text-xs text-gray-500 mt-1">
                Internacion INT-{ingreso.numeroIngreso} · Generada: {fmtDateTime(new Date())}
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-mono font-bold text-slate-700 print:text-2xl">
                HC {ingreso.paciente?.historiaClinica ?? '—'}
              </p>
              <p className="text-xs text-gray-500">Historia Clinica</p>
            </div>
          </div>
        </div>

        {puedeCrearCirugia && ingreso.paciente?.id != null && cirugias.length === 0 && (
          <FichaQuirurgicaAltaCirugia ingresoId={ingresoId} pacienteId={ingreso.paciente.id} />
        )}

        <section className="space-y-4">
          <h2 className="text-base font-semibold text-gray-900 print:mb-1">Fichas por cirugia</h2>

          {cirugias.length === 0 ? (
            <div className="his-card p-5 text-sm text-gray-500">No hay cirugias registradas para esta internacion.</div>
          ) : (
            cirugias.map((cirugia) => (
              <article id={`cirugia-${cirugia.id}`} key={cirugia.id} className="his-card p-4 print:p-2 space-y-3 print:space-y-2 break-inside-avoid">
                <div className="flex items-center justify-between gap-2 border-b pb-2">
                  <h3 className="text-sm font-semibold text-gray-900">Cirugia #{cirugia.id}</h3>
                  <span className="text-xs text-gray-500">
                    {fmtDate(cirugia.fechaCirugia)} {cirugia.horaCirugia ? `· ${cirugia.horaCirugia}` : ''}
                  </span>
                </div>

                <FichaQuirurgicaNotasCirujano
                  ingresoId={ingresoId}
                  cirugiaId={cirugia.id}
                  fechaCirugiaLabel={fmtDate(cirugia.fechaCirugia)}
                  fechaCirugiaInput={cirugia.fechaCirugia.toISOString().slice(0, 10)}
                  cirugiasMultiplesInicial={cirugia.cirugiasMultiplesInicial}
                  tipoCirugiaMultipleInicial={cirugia.tipoCirugiaMultipleInicial}
                  pacienteNombre={ingreso.paciente?.nombreCompleto ?? ingreso.nombre ?? null}
                  pacienteDni={ingreso.paciente?.numeroDocumento != null ? String(ingreso.paciente.numeroDocumento) : null}
                  obraSocial={ingreso.obraSocial?.nombre ?? null}
                  cirujanoInicial={ingreso.profesionalTratante?.nombre ?? null}
                  diagnosticoInicial={cirugia.diagnosticoInicial}
                  observacionesIniciales={cirugia.observacionesIniciales}
                  cirujanoMatricula={ingreso.profesionalTratante?.matricula ?? null}
                />
              </article>
            ))
          )}
        </section>
      </div>
    </>
  )
}
