import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import Link from 'next/link'
import { ChevronRight, FileText } from 'lucide-react'
import type { Metadata } from 'next'
import { PrintButton } from '@/components/ui/print-button'
import { nombreProfesionalParaMostrar } from '@/lib/profesionales'
import {
  parseObservacionesInternacion,
  REQUISITOS_DOCUMENTALES,
} from '@/modules/internacion/observaciones-meta'
import {
  formatearFechaArgentina,
  formatearFechaHoraArgentina,
} from '@/lib/utils/argentina-date'
import { calcularEdad } from '@/lib/utils'

export const metadata: Metadata = { title: 'Informe de Hospitalización' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function InformeHospitalizacionPage({ params }: PageProps) {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'INTERNACION', 'LEER')) redirect('/dashboard')

  const { id } = await params
  const ingresoId = parseInt(id, 10)
  if (isNaN(ingresoId)) notFound()

  const ingreso = await prisma.ingreso.findUnique({
    where: { id: ingresoId },
    include: {
      paciente: true,
      tipoIngreso: true,
      tipoInternacion: true,
      motivoEgreso: true,
      profesionalGuardia: true,
      profesionalTratante: true,
      cama: true,
      obraSocial: true,
      plan: true,
      ingresoSubtipo: {
        select: {
          profesionalDerivanteNombre: true,
        },
      },
      ingresoPatologias: {
        orderBy: { fecha: 'desc' },
        take: 10,
      },
      informes: {
        orderBy: { fecha: 'desc' },
        take: 1,
        include: {
          profesionalEfector: true,
          profesionalPrescriptor: true,
        },
      },
    },
  })

  if (!ingreso || ingreso.tipoIngresoCodigo !== 'INT') notFound()

  const [obraSocialCoseguro, profesionalDerivante, historialTratanteAudits] = await Promise.all([
    ingreso.obraSocialCoseguroId
      ? prisma.obraSocial.findUnique({
        where: { id: ingreso.obraSocialCoseguroId },
        select: { nombre: true },
      })
      : Promise.resolve(null),
    ingreso.profesionalDerivanteId
      ? prisma.profesional.findUnique({
        where: { id: ingreso.profesionalDerivanteId },
        select: { nombre: true },
      })
      : Promise.resolve(null),
    prisma.auditLog.findMany({
      where: {
        entidad: 'Ingreso',
        registroId: String(ingresoId),
        accion: 'MODIFICAR',
        detalle: { startsWith: 'Médico tratante actualizado:' },
      },
      orderBy: { fecha: 'desc' },
      select: {
        id: true,
        detalle: true,
        usuario: true,
        fecha: true,
      },
    }),
  ])

  const informe = ingreso.informes[0] ?? null
  const observacionesParseadas = parseObservacionesInternacion(ingreso.observaciones)
  const totalDepositos = observacionesParseadas.depositosRegistros.reduce(
    (acc, item) => acc + item.importe,
    0
  )
  const checksMarcados = REQUISITOS_DOCUMENTALES.filter(
    (item) => observacionesParseadas.checklistDocumental[item.key]
  )

  const historialTratante = historialTratanteAudits
    .map((item) => {
      const detalle = item.detalle ?? ''
      const partes = detalle.split('→')
      if (partes.length < 2) return null

      const origen = partes[0]?.replace('Médico tratante actualizado:', '').trim() ?? ''
      const destino = partes[1]?.trim() ?? ''

      const matchAnterior = origen.match(/^(.*)\s+\((?:ID\s+)?(\d+|N\/A)\)$/i)
      const matchNuevo = destino.match(/^(.*)\s+\((?:ID\s+)?(\d+)\)$/i)

      const anterior = matchAnterior?.[1]?.trim() ?? null
      const nuevo = matchNuevo?.[1]?.trim() ?? destino.trim()
      if (!nuevo) return null

      return {
        id: item.id,
        anterior:
          anterior && anterior.length > 0 && anterior !== 'Sin tratante'
            ? nombreProfesionalParaMostrar(anterior)
            : null,
        nuevo: nombreProfesionalParaMostrar(nuevo),
        usuario: item.usuario,
        fecha: item.fecha,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)

  const fmt = (d: Date | null | undefined) =>
    formatearFechaHoraArgentina(d, {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  const fmtDate = (d: Date | null | undefined) =>
    formatearFechaArgentina(d, { day: 'numeric', month: 'numeric', year: 'numeric' })

  const edad = () => {
    const fn = ingreso.paciente?.fechaNacimiento
    if (!fn) return ingreso.edad ? `${ingreso.edad} años` : '—'
    const a = calcularEdad(fn)
    return a === null ? '—' : `${a} años`
  }

  const telefonoPaciente =
    ingreso.paciente?.celular1?.trim() ||
    ingreso.paciente?.telefonoFijo?.trim() ||
    '—'

  const medicoCabecera = ingreso.profesionalGuardia?.nombre
    ? nombreProfesionalParaMostrar(ingreso.profesionalGuardia.nombre)
    : '—'

  const medicoDerivante = profesionalDerivante?.nombre
    ? nombreProfesionalParaMostrar(profesionalDerivante.nombre)
    : ingreso.ingresoSubtipo?.profesionalDerivanteNombre
      ? nombreProfesionalParaMostrar(ingreso.ingresoSubtipo.profesionalDerivanteNombre)
      : '—'

  const estadoLabel = (e: string | null) => {
    switch (e) {
      case 'A': return 'Abierto'
      case 'C': return 'Cerrado'
      default: return e ?? '—'
    }
  }

  return (
    <>
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 7mm;
          }

          .informe-hospitalizacion-print {
            font-size: 11px;
            line-height: 1.2;
          }

          .informe-hospitalizacion-print .informe-observaciones {
            max-height: 4.8em;
            overflow: hidden;
          }
        }
      `}</style>
      <Header titulo="Informe de Hospitalización" />
      <div className="informe-hospitalizacion-print p-6 max-w-4xl space-y-6 print:space-y-3">
        {/* Breadcrumb (no-print) */}
        <nav className="flex items-center gap-1 text-xs text-gray-500 print:hidden">
          <Link href="/dashboard/internacion" className="hover:text-gray-700">Internación</Link>
          <ChevronRight className="h-3 w-3" />
          <Link href={`/dashboard/admision/${ingresoId}`} className="hover:text-gray-700">
            INT-{ingreso.numeroIngreso}
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-gray-900 font-medium">Informe</span>
        </nav>

        {/* Acciones (no-print) */}
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

        {/* Cabecera del informe */}
        <div className="border-b-2 pb-4 print:pb-3">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-1">
              {/* Logo visible solo en impresión */}
              <img src="/logo-clinica.png" alt="Logo Clínica" className="hidden print:block" style={{ maxWidth: 110, marginBottom: 4 }} />
              <p className="hidden print:block text-xs text-gray-500">Av. Sarmiento 566, Salta Capital, Argentina · Tel: 3872537289</p>
              <h1 className="text-2xl font-bold text-gray-900 print:text-xl">Informe de Hospitalización</h1>
              {informe && (
                <p className="text-xs text-gray-500 mt-1">
                  Emitido: {fmtDate(informe.fecha)} &nbsp;·&nbsp; Estado:{' '}
                  <span className={informe.estado === 'C' ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
                    {estadoLabel(informe.estado)}
                  </span>
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-3xl font-mono font-bold text-blue-700 print:text-2xl">INT-{ingreso.numeroIngreso}</p>
              <p className="text-xs text-gray-500 print:text-[10px]">Código de Ingreso</p>
            </div>
          </div>
        </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:gap-4 print:text-sm">
          {/* Datos del Paciente */}
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b pb-2 mb-3 print:pb-1 print:mb-2">Información del Paciente</h2>
            <dl className="space-y-1.5 print:space-y-1">
                <DataRow label="Apellidos y nombres" value={ingreso.paciente?.nombreCompleto ?? ingreso.nombre ?? '—'} />
                <DataRow label="Historia Clínica" value={ingreso.paciente?.historiaClinica?.toString() ?? '—'} />
                <DataRow label="Tipo y número de documento" value={`${ingreso.paciente?.tipoDocumento ?? '—'} ${ingreso.paciente?.numeroDocumento ?? '—'}`} />
                <DataRow label="Fecha de nacimiento" value={fmtDate(ingreso.paciente?.fechaNacimiento)} />
              <DataRow label="Edad" value={edad()} />
                <DataRow label="Sexo" value={ingreso.paciente?.sexo === 'M' ? 'Masculino' : ingreso.paciente?.sexo === 'F' ? 'Femenino' : '—'} />
                <DataRow label="Domicilio" value={ingreso.paciente?.domicilio ?? '—'} />
                <DataRow label="Teléfono" value={telefonoPaciente} />
                <DataRow label="Familiar responsable" value={ingreso.nombreTutor ?? '—'} />
                <DataRow label="Teléfono familiar" value={ingreso.telefonoTutor ?? '—'} />
            </dl>
          </div>

            {/* Datos de Internación */}
          <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b pb-2 mb-3 print:pb-1 print:mb-2">Internación</h2>
            <dl className="space-y-1.5 print:space-y-1">
                <DataRow label="Número de ingreso" value={`INT-${ingreso.numeroIngreso}`} />
                <DataRow label="Fecha y hora de ingreso" value={fmt(ingreso.fechaIngreso)} />
                <DataRow
                  label="Habitación"
                  value={
                    ingreso.cama
                      ? `${ingreso.cama.habitacion ? `Hab. ${ingreso.cama.habitacion} · ` : ''}${ingreso.cama.identificador}`
                      : '—'
                  }
                />
                <DataRow label="Diagnóstico" value={ingreso.descripcionPatologia ?? '—'} />
            </dl>
          </div>

            {/* Cobertura */}
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b pb-2 mb-3 print:pb-1 print:mb-2">Cobertura</h2>
            <dl className="space-y-1.5 print:space-y-1">
                <DataRow
                  label="Obra social"
                  value={
                    ingreso.plan?.descripcion
                      ? `${ingreso.obraSocial?.nombre ?? '—'} (${ingreso.plan.descripcion})`
                      : (ingreso.obraSocial?.nombre ?? '—')
                  }
                />
                <DataRow label="Coseguro" value={obraSocialCoseguro?.nombre ?? 'No corresponde'} />
                <DataRow label="Nro. afiliado OS" value={ingreso.numeroAfiliado ?? '—'} />
            </dl>
          </div>

          {/* Profesionales */}
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b pb-2 mb-3 print:pb-1 print:mb-2">Médicos</h2>
            <dl className="space-y-1.5 print:space-y-1">
                <DataRow label="Médico de cabecera" value={medicoCabecera} />
                <DataRow label="Médico derivante" value={medicoDerivante} />
                <DataRow
                  label="Médico tratante"
                  value={ingreso.profesionalTratante?.nombre ? nombreProfesionalParaMostrar(ingreso.profesionalTratante.nombre) : '—'}
                />
            </dl>

              <div className="mt-3 print:hidden">
                <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">Historial médico tratante</p>
                {historialTratante.length === 0 ? (
                  <p className="text-xs text-gray-500">Sin cambios registrados.</p>
                ) : (
                  <ul className="space-y-1 text-xs text-gray-700">
                    {historialTratante.map((item) => (
                      <li key={item.id}>
                        {item.anterior ? `${item.anterior} → ` : 'Sin tratante → '}
                        <span className="font-medium">{item.nuevo}</span>
                        <span className="text-gray-500"> · {fmt(item.fecha)} · usuario {item.usuario}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
          </div>
        </div>

          {/* Diagnósticos adicionales */}
          {ingreso.ingresoPatologias.length > 0 && (
          <div className="border-t pt-4 print:pt-2">
              <h2 className="text-sm font-semibold text-gray-900 mb-2 print:mb-1 print:text-xs">Diagnósticos registrados</h2>
              <p className="hidden print:block text-xs text-gray-700">
                Se registran {ingreso.ingresoPatologias.length} diagnóstico(s) en la ficha clínica.
              </p>
              <ul className="space-y-1 text-xs print:hidden">
                {ingreso.ingresoPatologias.map((p) => (
                  <li key={p.id} className="text-gray-700">
                    • {p.descripcion ?? `Patología ${p.patologiaId}`}
                  </li>
                ))}
              </ul>
          </div>
        )}

          {/* Observaciones + checklist */}
          <div className="border-t pt-4 print:pt-2">
            <h2 className="text-sm font-semibold text-gray-900 mb-2 print:mb-1 print:text-xs">Observaciones</h2>
            <p className="informe-observaciones text-xs text-gray-700 whitespace-pre-wrap">
              {observacionesParseadas.observaciones?.trim() || 'Sin observaciones.'}
            </p>

            <div className="mt-3">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Checks documentales marcados</p>
              {checksMarcados.length === 0 ? (
                <p className="text-xs text-gray-500">Sin checks marcados.</p>
              ) : (
                <ul className="space-y-1 text-xs text-gray-700">
                  {checksMarcados.map((item) => (
                    <li key={item.key}>• {item.label}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Depósitos */}
          <div className="border-t pt-4 print:pt-2">
            <h2 className="text-sm font-semibold text-gray-900 mb-2 print:mb-1 print:text-xs">Depósitos</h2>
            {observacionesParseadas.depositosRegistros.length === 0 ? (
              <p className="text-xs text-gray-500">Sin depósitos registrados.</p>
            ) : (
              <>
                <p className="hidden print:block text-xs text-gray-700">
                  Registros: {observacionesParseadas.depositosRegistros.length} · Total: {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(totalDepositos)}
                </p>
                <div className="overflow-x-auto print:hidden">
                  <table className="min-w-full divide-y divide-gray-200 text-xs">
                    <thead>
                      <tr className="text-left uppercase tracking-wide text-gray-500">
                        <th className="px-2 py-2">Fecha</th>
                        <th className="px-2 py-2">Importe</th>
                        <th className="px-2 py-2">Observaciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {observacionesParseadas.depositosRegistros.map((item) => (
                        <tr key={item.id} className="text-gray-700">
                          <td className="px-2 py-2">{fmtDate(new Date(item.fecha))}</td>
                          <td className="px-2 py-2">
                            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(item.importe)}
                          </td>
                          <td className="px-2 py-2">{item.observaciones?.trim() || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {informe && (
          <div className="border-t pt-4 print:pt-2 print:hidden">
              <h2 className="text-sm font-semibold text-gray-900 mb-2 print:mb-1 print:text-xs">Estado del informe</h2>
              <dl className="space-y-1.5 print:space-y-1">
                <DataRow label="Fecha de emisión" value={fmtDate(informe.fecha)} />
                <DataRow label="Estado" value={estadoLabel(informe.estado)} />
              </dl>
          </div>
        )}

        {/* Footer para impresión */}
        <div className="hidden print:block border-t pt-4 mt-8 text-center text-xs text-gray-400">
          <p>Informe generado automáticamente - Válido con firma autorizada</p>
          <p>{new Date().toLocaleString('es-AR', { hour12: false })}</p>
        </div>
      </div>
    </>
  )
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500 font-medium">{label}</dt>
      <dd className="text-gray-900 text-right font-medium">{value}</dd>
    </div>
  )
}
