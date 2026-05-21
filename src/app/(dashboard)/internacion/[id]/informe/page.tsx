import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import Link from 'next/link'
import { ChevronRight, FileText } from 'lucide-react'
import type { Metadata } from 'next'
import { PrintButton } from '@/components/ui/print-button'

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
      ingresoPatologias: {
        orderBy: { fecha: 'desc' },
        take: 10,
      },
      evoluciones: {
        orderBy: { fecha: 'desc' },
        take: 20,
        include: { profesional: true },
      },
      medicaciones: {
        where: { estado: { in: ['A', 'S'] } },
        orderBy: { fechaInicio: 'desc' },
        include: { profesional: true },
      },
      practicas: {
        orderBy: { fecha: 'desc' },
        take: 20,
      },
      cirugiasProgramadas: {
        orderBy: [{ fechaCirugia: 'desc' }, { id: 'desc' }],
        include: {
          practicas: {
            orderBy: { id: 'asc' },
          },
        },
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

  const informe = ingreso.informes[0] ?? null
  const cirugia = ingreso.cirugiasProgramadas[0] ?? null

  const fmt = (d: Date | null | undefined) =>
    d ? new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
  const fmtDate = (d: Date | null | undefined) =>
    d ? new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric', year: 'numeric' }) : '—'
  const fmtHora = (h: string | null | undefined) => (h && h.trim() ? h : '—')

  const diasEstancia = () => {
    if (!ingreso.fechaIngreso) return '—'
    const fin = ingreso.fechaEgreso ?? new Date()
    const dias = Math.floor((fin.getTime() - ingreso.fechaIngreso.getTime()) / 86_400_000)
    return `${Math.max(0, dias)} días`
  }

  const edad = () => {
    const fn = ingreso.paciente?.fechaNacimiento
    if (!fn) return ingreso.edad ? `${ingreso.edad} años` : '—'
    const hoy = new Date()
    const nac = new Date(fn)
    let a = hoy.getFullYear() - nac.getFullYear()
    if (hoy < new Date(hoy.getFullYear(), nac.getMonth(), nac.getDate())) a--
    return `${a} años`
  }

  const estadoLabel = (e: string | null) => {
    switch (e) {
      case 'A': return 'Abierto'
      case 'C': return 'Cerrado'
      default: return e ?? '—'
    }
  }

  return (
    <>
      <Header titulo="Informe de Hospitalización" />
      <div className="p-6 max-w-4xl space-y-6 print:space-y-4">
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

        <div className="grid grid-cols-2 gap-6 print:gap-4 print:text-sm">
          {/* Datos del Paciente */}
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b pb-2 mb-3 print:pb-1 print:mb-2">Información del Paciente</h2>
            <dl className="space-y-1.5 print:space-y-1">
              <DataRow label="Historia Clínica" value={ingreso.paciente?.historiaClinica?.toString() ?? '—'} />
              <DataRow label="Nombre" value={ingreso.paciente?.nombreCompleto ?? ingreso.nombre ?? '—'} />
              <DataRow label="Documento" value={`${ingreso.paciente?.tipoDocumento ?? '—'} ${ingreso.paciente?.numeroDocumento ?? '—'}`} />
              <DataRow label="Edad" value={edad()} />
              <DataRow label="Género" value={ingreso.paciente?.sexo === 'M' ? 'Masculino' : ingreso.paciente?.sexo === 'F' ? 'Femenino' : '—'} />
            </dl>
          </div>

          {/* Datos de Hospitalización */}
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b pb-2 mb-3 print:pb-1 print:mb-2">Hospitalización</h2>
            <dl className="space-y-1.5 print:space-y-1">
              <DataRow label="Tipo" value={ingreso.tipoInternacion?.descripcion ?? '—'} />
              <DataRow label="Cama" value={ingreso.cama ? `${ingreso.cama.identificador} (${ingreso.cama.sector})` : '—'} />
              <DataRow label="Ingreso" value={fmt(ingreso.fechaIngreso)} />
              <DataRow label="Alta prevista" value={fmtDate(ingreso.fechaEgresoPrevista)} />
              {ingreso.fechaEgreso && <DataRow label="Alta real" value={fmtDate(ingreso.fechaEgreso)} />}
              <DataRow label="Estancia" value={diasEstancia()} />
            </dl>
          </div>

          {/* Obra Social */}
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b pb-2 mb-3 print:pb-1 print:mb-2">Cobertura</h2>
            <dl className="space-y-1.5 print:space-y-1">
              <DataRow label="Obra Social" value={ingreso.obraSocial?.nombre ?? '—'} />
              <DataRow label="Afiliado" value={ingreso.numeroAfiliado ?? '—'} />
            </dl>
          </div>

          {/* Profesionales */}
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b pb-2 mb-3 print:pb-1 print:mb-2">Médicos</h2>
            <dl className="space-y-1.5 print:space-y-1">
              <DataRow label="Guardia" value={ingreso.profesionalGuardia?.nombre ?? '—'} />
              <DataRow label="Tratante" value={ingreso.profesionalTratante?.nombre ?? '—'} />
              {informe?.profesionalEfector && <DataRow label="Efector" value={informe.profesionalEfector.nombre} />}
              {informe?.profesionalPrescriptor && <DataRow label="Prescriptor" value={informe.profesionalPrescriptor.nombre} />}
            </dl>
          </div>
        </div>

        {/* Cirugía programada (resumen) */}
        {cirugia && (
          <div className="border-t pt-4 print:pt-2">
            <h2 className="text-sm font-semibold text-gray-900 mb-2 print:mb-1 print:text-xs">Cirugía</h2>
            <div className="his-card p-4 print:p-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <DataRow label="Fecha" value={fmtDate(cirugia.fechaCirugia)} />
                <DataRow label="Hora" value={fmtHora(cirugia.horaCirugia)} />
                <DataRow
                  label="Especialista a cargo"
                  value={ingreso.profesionalTratante?.nombre ?? informe?.profesionalEfector?.nombre ?? '—'}
                />
                <DataRow
                  label="N° autorización"
                  value={cirugia.numeroAutorizacion ?? '—'}
                />
              </div>

              <div className="mt-3">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Prácticas</p>
                {cirugia.practicas.length > 0 ? (
                  <ul className="space-y-1 print:space-y-0.5 text-xs">
                    {cirugia.practicas.map((p) => (
                      <li key={p.id} className="text-gray-700">
                        • Cód. {p.codigo} - {p.descripcion} · Cant. {String(p.cantidad)}
                        {p.numeroAutorizacion && (
                          <span className="text-gray-500"> (Auth: {p.numeroAutorizacion})</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-500">Sin prácticas registradas.</p>
                )}
              </div>

              <div className="mt-3">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Observaciones</p>
                <p className="text-xs text-gray-700 whitespace-pre-wrap">
                  {cirugia.observaciones?.trim() || 'Sin observaciones.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Diagnósticos */}
        {(ingreso.descripcionPatologia || ingreso.ingresoPatologias.length > 0) && (
          <div className="border-t pt-4 print:pt-2">
            <h2 className="text-sm font-semibold text-gray-900 mb-2 print:mb-1 print:text-xs">Diagnósticos</h2>
            {ingreso.descripcionPatologia && (
              <p className="text-xs text-gray-700 mb-2 print:mb-1 italic">Patología: {ingreso.descripcionPatologia}</p>
            )}
            {ingreso.ingresoPatologias.length > 0 && (
              <ul className="space-y-1 text-xs print:space-y-0.5">
                {ingreso.ingresoPatologias.map((p) => (
                  <li key={p.id} className="text-gray-700">
                    • {p.descripcion ?? `Patología ${p.patologiaId}`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Medicaciones activas */}
        {ingreso.medicaciones.length > 0 && (
          <div className="border-t pt-4 print:pt-2">
            <h2 className="text-sm font-semibold text-gray-900 mb-2 print:mb-1 print:text-xs">Medicaciones</h2>
            <div className="space-y-2 print:space-y-1 text-xs">
              {ingreso.medicaciones.map((med) => (
                <div key={med.id} className="flex justify-between gap-2">
                  <div className="flex-1">
                    <span className="font-medium text-gray-900">{med.nombre}</span>
                    {med.dosis && <span className="text-gray-600"> - {med.dosis}</span>}
                    {med.viaAdministracion && <span className="text-gray-500 print:hidden"> ({med.viaAdministracion})</span>}
                  </div>
                  <span className="text-gray-500 text-right shrink-0">{med.frecuencia ?? 'S/F'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Prácticas realizadas */}
        {ingreso.practicas.length > 0 && (
          <div className="border-t pt-4 print:pt-2">
            <h2 className="text-sm font-semibold text-gray-900 mb-2 print:mb-1 print:text-xs">Procedimientos Realizados</h2>
            <ul className="space-y-1 print:space-y-0.5 text-xs">
              {ingreso.practicas.map((p) => (
                <li key={p.id} className="text-gray-700">
                  • {fmtDate(p.fecha)} - Cód. {p.codigoPractica} · Cant. {String(p.cantidad)}
                  {p.numeroAutorizacion && <span className="text-gray-500"> (Auth: {p.numeroAutorizacion})</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Evolución clínica (resumen últimas notas) */}
        {ingreso.evoluciones.length > 0 && (
          <div className="border-t pt-4 print:pt-2">
            <h2 className="text-sm font-semibold text-gray-900 mb-2 print:mb-1 print:text-xs">Evolución Clínica (últimas 5 notas)</h2>
            <div className="space-y-3 print:space-y-2 text-xs">
              {ingreso.evoluciones.slice(0, 5).map((ev) => (
                <div key={ev.id} className="border-l-2 border-blue-300 pl-2 print:pl-1 py-1">
                  <div className="flex justify-between items-start">
                    <span className="font-medium text-gray-900">{fmtDate(ev.fecha)}</span>
                    <span className="text-yellow-700 bg-yellow-50 print:bg-transparent px-1.5 py-0.5 rounded text-[10px] print:text-[9px]">
                      {ev.tipo}
                    </span>
                  </div>
                  <p className="text-gray-700 mt-0.5 whitespace-pre-wrap text-[11px] print:text-[10px]">{ev.descripcion}</p>
                  {ev.profesional && (
                    <p className="text-gray-500 text-[10px] print:text-[9px] mt-0.5">Dr. {ev.profesional.nombre}</p>
                  )}
                </div>
              ))}
            </div>
            {ingreso.evoluciones.length > 5 && (
              <p className="text-xs text-gray-500 mt-2 print:mt-1">
                ... y {ingreso.evoluciones.length - 5} notas adicionales en el sistema
              </p>
            )}
          </div>
        )}

        {/* Footer para impresión */}
        <div className="hidden print:block border-t pt-4 mt-8 text-center text-xs text-gray-400">
          <p>Informe generado automáticamente - Válido con firma autorizada</p>
          <p>{new Date().toLocaleString('es-AR')}</p>
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
