import { Header } from '@/components/layout/header'
import { PrintButton } from '@/components/ui/print-button'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { prisma } from '@/lib/db'
import { nombreProfesionalParaMostrar } from '@/lib/profesionales'
import { calcularEdad } from '@/lib/utils'
import { FichaQuirurgicaNotasCirujano } from '@/components/internacion/ficha-quirurgica-notas-cirujano'
import { FichaQuirurgicaAltaCirugia } from '@/components/internacion/ficha-quirurgica-alta-cirugia'
import {
  formatearFechaArgentina,
  formatearFechaHoraArgentina,
} from '@/lib/utils/argentina-date'
import { ChevronRight, FileText, Scissors } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

export const metadata: Metadata = { title: 'Ficha Quirurgica' }

interface PageProps {
  params: Promise<{ id: string }>
}

type ObservacionesCirugiaMeta = {
  tipo: string | null
  diagnostico: string | null
  observaciones: string | null
  obraSocialId: number | null
  planId: number | null
  coseguroId: number | null
  afiliado: string | null
  extra: string[]
}

function parseEntero(value: string): number | null {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function parseObservacionesCirugia(value: string | null | undefined): ObservacionesCirugiaMeta {
  if (!value || !value.trim()) {
    return {
      tipo: null,
      diagnostico: null,
      observaciones: null,
      obraSocialId: null,
      planId: null,
      coseguroId: null,
      afiliado: null,
      extra: [],
    }
  }

  const meta: ObservacionesCirugiaMeta = {
    tipo: null,
    diagnostico: null,
    observaciones: null,
    obraSocialId: null,
    planId: null,
    coseguroId: null,
    afiliado: null,
    extra: [],
  }

  const tokens = value
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  for (const token of tokens) {
    const [rawKey, ...rest] = token.split(':')
    const key = rawKey?.trim().toLowerCase()
    const parsedValue = rest.join(':').trim()

    if (!key || !parsedValue) {
      meta.extra.push(token)
      continue
    }

    if (key === 'tipo') {
      meta.tipo = parsedValue
      continue
    }

    if (key === 'diagnostico') {
      meta.diagnostico = parsedValue
      continue
    }

    if (key === 'observaciones') {
      meta.observaciones = parsedValue
      continue
    }

    if (key === 'obrasocialid') {
      meta.obraSocialId = parseEntero(parsedValue)
      continue
    }

    if (key === 'planid') {
      meta.planId = parseEntero(parsedValue)
      continue
    }

    if (key === 'coseguroid') {
      meta.coseguroId = parseEntero(parsedValue)
      continue
    }

    if (key === 'afiliado') {
      meta.afiliado = parsedValue
      continue
    }

    meta.extra.push(token)
  }

  return meta
}

function boolToLabel(value: boolean): string {
  return value ? 'Si' : 'No'
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
      numeroIngreso: true,
      tipoIngresoCodigo: true,
      nombre: true,
      fechaIngreso: true,
      fechaEgresoPrevista: true,
      fechaEgreso: true,
      descripcionPatologia: true,
      numeroAfiliado: true,
      paciente: {
        select: {
          id: true,
          historiaClinica: true,
          nombreCompleto: true,
          tipoDocumento: true,
          numeroDocumento: true,
          fechaNacimiento: true,
          sexo: true,
        },
      },
      obraSocial: { select: { id: true, nombre: true } },
      plan: { select: { id: true, descripcion: true } },
      cama: { select: { id: true, identificador: true, sector: true, habitacion: true } },
      profesionalGuardia: { select: { id: true, nombre: true } },
      profesionalTratante: { select: { id: true, nombre: true } },
      cirugiasProgramadas: {
        where: { internacionId: ingresoId },
        orderBy: [{ fechaCirugia: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          fechaCirugia: true,
          horaCirugia: true,
          numeroAutorizacion: true,
          observaciones: true,
          cama: {
            select: {
              id: true,
              identificador: true,
              sector: true,
              habitacion: true,
            },
          },
          practicas: {
            orderBy: { id: 'asc' },
            select: {
              id: true,
              codigo: true,
              descripcion: true,
              cantidad: true,
              numeroAutorizacion: true,
            },
          },
          diferenciales: {
            select: {
              esFeriado: true,
              esNocturna: true,
              mismaViaPatologia: true,
              diferentesViasPatologia: true,
              diferentesViasDiferentesPatologia: true,
              dobleCirugia: true,
            },
          },
        },
      },
      evoluciones: {
        where: {
          OR: [
            { tipo: 'MEDICA' },
            { descripcion: { contains: 'cirug', mode: 'insensitive' } },
            { descripcion: { contains: 'quirurg', mode: 'insensitive' } },
          ],
        },
        orderBy: { fecha: 'desc' },
        take: 10,
        select: {
          id: true,
          fecha: true,
          tipo: true,
          descripcion: true,
          profesional: {
            select: {
              nombre: true,
            },
          },
        },
      },
    },
  })

  if (!ingreso || ingreso.tipoIngresoCodigo !== 'INT') notFound()

  const cirugias = ingreso.cirugiasProgramadas.map((cirugia) => {
    const meta = parseObservacionesCirugia(cirugia.observaciones)

    const diferencialesConsolidados = cirugia.diferenciales.reduce(
      (acc, row) => ({
        esFeriado: acc.esFeriado || row.esFeriado,
        esNocturna: acc.esNocturna || row.esNocturna,
        mismaViaPatologia: acc.mismaViaPatologia || row.mismaViaPatologia,
        diferentesViasPatologia: acc.diferentesViasPatologia || row.diferentesViasPatologia,
        diferentesViasDiferentesPatologia:
          acc.diferentesViasDiferentesPatologia || row.diferentesViasDiferentesPatologia,
        dobleCirugia: acc.dobleCirugia || row.dobleCirugia,
      }),
      {
        esFeriado: false,
        esNocturna: false,
        mismaViaPatologia: false,
        diferentesViasPatologia: false,
        diferentesViasDiferentesPatologia: false,
        dobleCirugia: false,
      }
    )

    return {
      ...cirugia,
      meta,
      diferencialesConsolidados,
    }
  })

  const obraSocialIds = Array.from(
    new Set(cirugias.map((c) => c.meta.obraSocialId).filter((id): id is number => id != null))
  )
  const planIds = Array.from(
    new Set(cirugias.map((c) => c.meta.planId).filter((id): id is number => id != null))
  )
  const coseguroIds = Array.from(
    new Set(cirugias.map((c) => c.meta.coseguroId).filter((id): id is number => id != null))
  )

  const [obrasSocialesMeta, planesMeta, cosegurosMeta] = await Promise.all([
    obraSocialIds.length > 0
      ? prisma.obraSocial.findMany({
          where: { id: { in: obraSocialIds } },
          select: { id: true, nombre: true },
        })
      : Promise.resolve([]),
    planIds.length > 0
      ? prisma.planObraSocial.findMany({
          where: { id: { in: planIds } },
          select: { id: true, descripcion: true },
        })
      : Promise.resolve([]),
    coseguroIds.length > 0
      ? prisma.obraSocial.findMany({
          where: { id: { in: coseguroIds } },
          select: { id: true, nombre: true },
        })
      : Promise.resolve([]),
  ])

  const obraSocialMap = new Map(obrasSocialesMeta.map((os) => [os.id, os.nombre]))
  const planMap = new Map(planesMeta.map((plan) => [plan.id, plan.descripcion]))
  const coseguroMap = new Map(cosegurosMeta.map((os) => [os.id, os.nombre]))

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

  const edad = (() => {
    if (!ingreso.paciente?.fechaNacimiento) return '—'
    const value = calcularEdad(ingreso.paciente.fechaNacimiento)
    return value == null ? '—' : `${value} anos`
  })()

  const sexoLabel =
    ingreso.paciente?.sexo === 'M'
      ? 'Masculino'
      : ingreso.paciente?.sexo === 'F'
        ? 'Femenino'
        : '—'

  return (
    <>
      <Header titulo="Ficha Quirurgica" />

      <div className="p-6 max-w-5xl space-y-6 print:space-y-4">
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
          <Link
            href={`/dashboard/internacion/${ingresoId}`}
            className="flex items-center gap-2 rounded-md border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <FileText className="h-4 w-4" />
            Detalle
          </Link>
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

        <section className="his-card p-4 print:p-3">
          <div className="flex items-center gap-2 mb-3">
            <Scissors className="h-4 w-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-900">Datos del paciente e internacion</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <DataRow label="Paciente" value={ingreso.paciente?.nombreCompleto ?? ingreso.nombre ?? '—'} />
            <DataRow
              label="Documento"
              value={`${ingreso.paciente?.tipoDocumento ?? '—'} ${
                ingreso.paciente?.numeroDocumento?.toLocaleString('es-AR') ?? '—'
              }`}
            />
            <DataRow label="Edad" value={edad} />
            <DataRow label="Sexo" value={sexoLabel} />
            <DataRow label="Ingreso" value={fmtDateTime(ingreso.fechaIngreso)} />
            <DataRow label="Alta prevista" value={fmtDate(ingreso.fechaEgresoPrevista)} />
            <DataRow
              label="Cama actual"
              value={
                ingreso.cama
                  ? `${ingreso.cama.identificador} (${ingreso.cama.sector})${
                      ingreso.cama.habitacion ? ` - Hab. ${ingreso.cama.habitacion}` : ''
                    }`
                  : '—'
              }
            />
            <DataRow
              label="Tratante"
              value={
                ingreso.profesionalTratante?.nombre
                  ? nombreProfesionalParaMostrar(ingreso.profesionalTratante.nombre)
                  : '—'
              }
            />
            <DataRow
              label="Guardia"
              value={
                ingreso.profesionalGuardia?.nombre
                  ? nombreProfesionalParaMostrar(ingreso.profesionalGuardia.nombre)
                  : '—'
              }
            />
            <DataRow label="Obra social" value={ingreso.obraSocial?.nombre ?? '—'} />
            <DataRow label="Plan" value={ingreso.plan?.descripcion ?? '—'} />
            <DataRow label="Afiliado" value={ingreso.numeroAfiliado ?? '—'} />
          </div>

          {ingreso.descripcionPatologia?.trim() && (
            <div className="mt-3 border-t pt-3">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Diagnostico base</p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{ingreso.descripcionPatologia}</p>
            </div>
          )}
        </section>

        {puedeCrearCirugia && ingreso.paciente?.id != null && (
          <FichaQuirurgicaAltaCirugia ingresoId={ingresoId} pacienteId={ingreso.paciente.id} />
        )}

        <section className="space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Informacion quirurgica</h2>

          {cirugias.length === 0 ? (
            <div className="his-card p-5 text-sm text-gray-500">No hay cirugias registradas para esta internacion.</div>
          ) : (
            cirugias.map((cirugia) => {
              const obraSocialCirugiaId = cirugia.meta.obraSocialId ?? ingreso.obraSocial?.id ?? null
              const planCirugiaId = cirugia.meta.planId ?? ingreso.plan?.id ?? null
              const coseguroCirugiaId = cirugia.meta.coseguroId
              const afiliadoCirugia = cirugia.meta.afiliado ?? ingreso.numeroAfiliado ?? '—'
              const tipoCirugiaMultipleInicial = cirugia.diferencialesConsolidados.mismaViaPatologia
                ? 'MISMA_VIA_DISTINTA_PATOLOGIA'
                : cirugia.diferencialesConsolidados.diferentesViasDiferentesPatologia
                  ? 'DISTINTA_VIA_DISTINTA_PATOLOGIA'
                  : ''
              const cirugiasMultiplesInicial =
                cirugia.diferencialesConsolidados.dobleCirugia ||
                cirugia.diferencialesConsolidados.mismaViaPatologia ||
                cirugia.diferencialesConsolidados.diferentesViasPatologia ||
                cirugia.diferencialesConsolidados.diferentesViasDiferentesPatologia

              return (
                <article key={cirugia.id} className="his-card p-4 print:p-3 space-y-3 break-inside-avoid">
                  <div className="flex items-center justify-between gap-2 border-b pb-2">
                    <h3 className="text-sm font-semibold text-gray-900">Cirugia #{cirugia.id}</h3>
                    <span className="text-xs text-gray-500">
                      {fmtDate(cirugia.fechaCirugia)} {cirugia.horaCirugia ? `· ${cirugia.horaCirugia}` : ''}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <DataRow label="Fecha" value={fmtDate(cirugia.fechaCirugia)} />
                    <DataRow label="Hora" value={cirugia.horaCirugia || '—'} />
                    <DataRow label="Nro autorizacion" value={cirugia.numeroAutorizacion ?? '—'} />
                    <DataRow
                      label="Cama quirurgica"
                      value={
                        cirugia.cama
                          ? `${cirugia.cama.identificador} (${cirugia.cama.sector})${
                              cirugia.cama.habitacion ? ` - Hab. ${cirugia.cama.habitacion}` : ''
                            }`
                          : '—'
                      }
                    />
                    <DataRow
                      label="Obra social"
                      value={
                        obraSocialCirugiaId != null
                          ? obraSocialMap.get(obraSocialCirugiaId) ?? ingreso.obraSocial?.nombre ?? `ID ${obraSocialCirugiaId}`
                          : ingreso.obraSocial?.nombre ?? '—'
                      }
                    />
                    <DataRow
                      label="Plan"
                      value={
                        planCirugiaId != null
                          ? planMap.get(planCirugiaId) ?? ingreso.plan?.descripcion ?? `ID ${planCirugiaId}`
                          : ingreso.plan?.descripcion ?? '—'
                      }
                    />
                    <DataRow
                      label="Coseguro"
                      value={
                        coseguroCirugiaId != null
                          ? coseguroMap.get(coseguroCirugiaId) ?? `ID ${coseguroCirugiaId}`
                          : '—'
                      }
                    />
                    <DataRow label="Afiliado" value={afiliadoCirugia} />
                  </div>

                  {cirugia.meta.diagnostico && (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Diagnostico quirurgico</p>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{cirugia.meta.diagnostico}</p>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Diferenciales</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm">
                      <DataRow label="Es feriado" value={boolToLabel(cirugia.diferencialesConsolidados.esFeriado)} />
                      <DataRow label="Cirugia nocturna" value={boolToLabel(cirugia.diferencialesConsolidados.esNocturna)} />
                      <DataRow
                        label="Misma via / distinta patologia"
                        value={boolToLabel(cirugia.diferencialesConsolidados.mismaViaPatologia)}
                      />
                      <DataRow
                        label="Diferentes vias / misma patologia"
                        value={boolToLabel(cirugia.diferencialesConsolidados.diferentesViasPatologia)}
                      />
                      <DataRow
                        label="Diferentes vias / distinta patologia"
                        value={boolToLabel(cirugia.diferencialesConsolidados.diferentesViasDiferentesPatologia)}
                      />
                      <DataRow
                        label="Doble cirugia"
                        value={boolToLabel(cirugia.diferencialesConsolidados.dobleCirugia)}
                      />
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Practicas</p>
                    {cirugia.practicas.length === 0 ? (
                      <p className="text-sm text-gray-500">Sin practicas registradas.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs border rounded-md">
                          <thead className="bg-gray-50 text-gray-600">
                            <tr>
                              <th className="text-left px-2 py-1 border-b">Codigo</th>
                              <th className="text-left px-2 py-1 border-b">Descripcion</th>
                              <th className="text-right px-2 py-1 border-b">Cant.</th>
                              <th className="text-left px-2 py-1 border-b">Autorizacion</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cirugia.practicas.map((practica) => (
                              <tr key={practica.id} className="text-gray-700">
                                <td className="px-2 py-1 border-b font-mono">{practica.codigo}</td>
                                <td className="px-2 py-1 border-b">{practica.descripcion}</td>
                                <td className="px-2 py-1 border-b text-right">{String(Number(practica.cantidad))}</td>
                                <td className="px-2 py-1 border-b">{practica.numeroAutorizacion ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {(cirugia.meta.observaciones || cirugia.meta.extra.length > 0 || cirugia.observaciones) && (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Observaciones</p>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">
                        {cirugia.meta.observaciones ?? cirugia.observaciones ?? '—'}
                      </p>
                      {cirugia.meta.extra.length > 0 && (
                        <ul className="mt-1 text-xs text-gray-500 list-disc pl-4">
                          {cirugia.meta.extra.map((extra, index) => (
                            <li key={`${cirugia.id}-extra-${index}`}>{extra}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  <FichaQuirurgicaNotasCirujano
                    ingresoId={ingresoId}
                    cirugiaId={cirugia.id}
                    fechaCirugiaLabel={fmtDate(cirugia.fechaCirugia)}
                    fechaCirugiaInput={cirugia.fechaCirugia.toISOString().slice(0, 10)}
                    cirugiasMultiplesInicial={cirugiasMultiplesInicial}
                    tipoCirugiaMultipleInicial={tipoCirugiaMultipleInicial}
                    pacienteNombre={ingreso.paciente?.nombreCompleto ?? ingreso.nombre ?? null}
                    pacienteDni={ingreso.paciente?.numeroDocumento != null ? String(ingreso.paciente.numeroDocumento) : null}
                    obraSocial={
                      obraSocialCirugiaId != null
                        ? obraSocialMap.get(obraSocialCirugiaId) ?? ingreso.obraSocial?.nombre ?? null
                        : ingreso.obraSocial?.nombre ?? null
                    }
                    cirujanoInicial={
                      ingreso.profesionalTratante?.nombre
                        ? nombreProfesionalParaMostrar(ingreso.profesionalTratante.nombre)
                        : null
                    }
                    diagnosticoInicial={cirugia.meta.diagnostico}
                    observacionesIniciales={cirugia.meta.observaciones}
                  />
                </article>
              )
            })
          )}
        </section>

        {ingreso.evoluciones.length > 0 && (
          <section className="his-card p-4 print:p-3">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Notas clinicas relacionadas</h2>
            <div className="space-y-2 text-xs">
              {ingreso.evoluciones.map((ev) => (
                <div key={ev.id} className="border-l-2 border-slate-300 pl-2 py-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-900">{fmtDateTime(ev.fecha)}</span>
                    <span className="text-gray-500">{ev.tipo}</span>
                  </div>
                  <p className="text-gray-700 whitespace-pre-wrap mt-0.5">{ev.descripcion}</p>
                  {ev.profesional?.nombre && (
                    <p className="text-gray-500 mt-0.5">{nombreProfesionalParaMostrar(ev.profesional.nombre)}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  )
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-gray-500 font-medium">{label}</dt>
      <dd className="text-gray-900 text-right">{value}</dd>
    </div>
  )
}
