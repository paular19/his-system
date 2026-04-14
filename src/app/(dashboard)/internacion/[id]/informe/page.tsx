import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import Link from 'next/link'
import { ChevronRight, Printer } from 'lucide-react'
import type { Metadata } from 'next'

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

  if (!ingreso || ingreso.tipoIngresoCodigo !== 'I') notFound()

  const informe = ingreso.informes[0] ?? null

  const fmt = (d: Date | null | undefined) =>
    d ? new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
  const fmtDate = (d: Date | null | undefined) =>
    d ? new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric', year: 'numeric' }) : '—'

  const diasEstancia = () => {
    if (!ingreso.fechaIngreso) return '—'
    const fin = ingreso.fechaEgreso ?? new Date()
    const dias = Math.floor((fin.getTime() - ingreso.fechaIngreso.getTime()) / 86_400_000)
    return `${dias} días`
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
      default:  return e ?? '—'
    }
  }

  return (
    <>
      <Header titulo="Informe de Hospitalización" />
      <div className="p-6 max-w-4xl space-y-4">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-xs text-gray-500">
          <Link href="/dashboard/internacion" className="hover:text-gray-700">Internación</Link>
          <ChevronRight className="h-3 w-3" />
          <Link href={`/dashboard/admision/${ingresoId}`} className="hover:text-gray-700">
            I-{ingreso.numeroIngreso}
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-gray-900 font-medium">Informe de Hospitalización</span>
        </nav>

        {/* Acciones */}
        <div className="flex justify-end gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-md border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
        </div>

        {/* Cabecera del informe */}
        <div className="his-card">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Informe de Hospitalización</h2>
              {informe && (
                <p className="text-xs text-gray-500 mt-0.5">
                  Fecha: {fmtDate(informe.fecha)} &nbsp;·&nbsp; Estado:{' '}
                  <span className={informe.estado === 'C' ? 'text-red-600' : 'text-green-600'}>
                    {estadoLabel(informe.estado)}
                  </span>
                  &nbsp;·&nbsp; Usuario: {informe.usuario}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xl font-mono font-bold text-blue-700">I-{ingreso.numeroIngreso}</p>
              <p className="text-xs text-gray-500">Código de ingreso</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Datos del Paciente */}
          <div className="his-card space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b pb-2">
              Información del Paciente
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Historia Clínica</dt>
                <dd className="font-medium">{ingreso.paciente?.historiaClinica ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Nombre</dt>
                <dd className="font-medium text-right max-w-52">
                  {ingreso.paciente?.nombreCompleto ?? ingreso.nombre ?? '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Documento</dt>
                <dd className="font-medium">
                  {ingreso.paciente?.tipoDocumento ?? ''} {ingreso.paciente?.numeroDocumento ?? '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Sexo</dt>
                <dd className="font-medium">
                  {ingreso.paciente?.sexo === 'M' ? 'Masculino' : ingreso.paciente?.sexo === 'F' ? 'Femenino' : '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Fecha de Nacimiento</dt>
                <dd className="font-medium">{fmtDate(ingreso.paciente?.fechaNacimiento)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Edad</dt>
                <dd className="font-medium">{edad()}</dd>
              </div>
            </dl>
          </div>

          {/* Datos de la Internación */}
          <div className="his-card space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b pb-2">
              Información de la Internación
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Tipo de Ingreso</dt>
                <dd className="font-medium">{ingreso.tipoIngreso.descripcion}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Tipo de Internación</dt>
                <dd className="font-medium">{ingreso.tipoInternacion?.descripcion ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Fecha/Hora Ingreso</dt>
                <dd className="font-medium">{fmt(ingreso.fechaIngreso)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Fecha/Hora Egreso</dt>
                <dd className="font-medium">
                  {ingreso.fechaEgreso ? fmt(ingreso.fechaEgreso) : <span className="text-green-600">En curso</span>}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Días de Internación</dt>
                <dd className="font-medium">{diasEstancia()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Estado</dt>
                <dd className="font-medium">
                  {ingreso.estado === 'A' ? 'Activo' : ingreso.estado === 'C' ? 'Cerrado' : ingreso.estado ?? '—'}
                </dd>
              </div>
            </dl>
          </div>

          {/* Información Médica */}
          <div className="his-card space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b pb-2">
              Información Médica
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Patología de Ingreso</dt>
                <dd className="font-medium text-right max-w-52">
                  {ingreso.descripcionPatologia ?? 'Sin determinar'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Diagnóstico</dt>
                <dd className="font-medium text-right max-w-52">
                  {ingreso.descripcionPatologiaDefinitiva ?? '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Habitación</dt>
                <dd className="font-medium">{ingreso.cama?.habitacion ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Cama</dt>
                <dd className="font-medium">{ingreso.cama?.identificador ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Médico Tratante</dt>
                <dd className="font-medium text-right max-w-52">
                  {ingreso.profesionalTratante?.nombre ?? '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Médico de Guardia</dt>
                <dd className="font-medium text-right max-w-52">
                  {ingreso.profesionalGuardia?.nombre ?? '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Motivo de Egreso</dt>
                <dd className="font-medium">{ingreso.motivoEgreso?.descripcion ?? '—'}</dd>
              </div>
            </dl>
          </div>

          {/* Cobertura */}
          <div className="his-card space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b pb-2">
              Cobertura Médica
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Obra Social</dt>
                <dd className="font-medium text-right max-w-52">
                  {ingreso.obraSocial ? `${ingreso.obraSocial.nombre}` : '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Plan</dt>
                <dd className="font-medium text-right max-w-52">
                  {ingreso.plan?.descripcion ?? '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Nro de Afiliado</dt>
                <dd className="font-medium">{ingreso.numeroAfiliado ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">PMI</dt>
                <dd className="font-medium">
                  {ingreso.pmi === true ? 'Sí' : ingreso.pmi === false ? 'No' : '—'}
                  {ingreso.pmiFechaInicio && ` (${fmtDate(ingreso.pmiFechaInicio)} — ${fmtDate(ingreso.pmiFechaFin)})`}
                </dd>
              </div>
            </dl>
          </div>

          {/* Contacto de Emergencia */}
          <div className="his-card space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b pb-2">
              Contacto de Emergencia
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Tutor / Responsable</dt>
                <dd className="font-medium">{ingreso.nombreTutor ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Teléfono</dt>
                <dd className="font-medium">{ingreso.telefonoTutor ?? '—'}</dd>
              </div>
            </dl>
          </div>

          {/* Datos Administrativos */}
          <div className="his-card space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b pb-2">
              Información Administrativa
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Nro Autorización</dt>
                <dd className="font-medium">{ingreso.numeroAutorizacion ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Sin Cargo</dt>
                <dd className="font-medium">{ingreso.sinCargo ? 'Sí' : 'No'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Importe Seña</dt>
                <dd className="font-medium">
                  {ingreso.senia != null ? `$${Number(ingreso.senia).toLocaleString('es-AR')}` : '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Usuario que Registró</dt>
                <dd className="font-medium">{ingreso.usuario ?? '—'}</dd>
              </div>
              {informe?.profesionalEfector && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Prof. Efector</dt>
                  <dd className="font-medium">{informe.profesionalEfector.nombre}</dd>
                </div>
              )}
              {informe?.profesionalPrescriptor && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Prof. Prescriptor</dt>
                  <dd className="font-medium">{informe.profesionalPrescriptor.nombre}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {ingreso.observaciones && (
          <div className="his-card space-y-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Observaciones
            </h3>
            <p className="text-sm text-gray-700">{ingreso.observaciones}</p>
          </div>
        )}
      </div>
    </>
  )
}
