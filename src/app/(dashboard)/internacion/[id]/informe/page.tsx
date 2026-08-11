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
import { parseObservacionesInternacion } from '@/modules/internacion/observaciones-meta'
import { formatearFechaArgentina, formatearFechaHoraArgentina } from '@/lib/utils/argentina-date'
import { calcularEdad } from '@/lib/utils'

export const metadata: Metadata = { title: 'Informe de Hospitalización' }

interface PageProps {
  params: Promise<{ id: string }>
}

function extraerNombreTratanteDesdeDetalle(detalle: string | null | undefined): string | null {
  if (!detalle) return null
  const partes = detalle.split('→')
  if (partes.length < 2) return null

  const destino = partes[1]?.trim() ?? ''
  if (!destino) return null

  const matchNuevo = destino.match(/^(.*)\s+\((?:ID\s+)?(\d+)\)$/i)
  const nombre = (matchNuevo?.[1]?.trim() ?? destino).trim()
  if (!nombre) return null

  return nombreProfesionalParaMostrar(nombre)
}

export default async function InformeHospitalizacionPage({ params }: PageProps) {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'INTERNACION', 'LEER')) redirect('/dashboard')

  const { id } = await params
  const ingresoId = Number.parseInt(id, 10)
  if (!Number.isFinite(ingresoId)) notFound()

  const ingreso = await prisma.ingreso.findUnique({
    where: { id: ingresoId },
    include: {
      paciente: true,
      profesionalTratante: true,
      cama: {
        select: {
          identificador: true,
          habitacion: true,
        },
      },
      obraSocial: {
        select: { nombre: true },
      },
      ingresoSubtipo: {
        select: { profesionalDerivanteNombre: true },
      },
      ingresoPatologias: {
        where: { estado: 'A' },
        select: { descripcion: true },
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        take: 1,
      },
    },
  })

  if (!ingreso || ingreso.tipoIngresoCodigo !== 'INT') notFound()

  const [profesionalDerivante, ultimoCambioTratante] = await Promise.all([
    ingreso.profesionalDerivanteId
      ? prisma.profesional.findUnique({
        where: { id: ingreso.profesionalDerivanteId },
        select: { nombre: true },
      })
      : Promise.resolve(null),
    prisma.auditLog.findFirst({
      where: {
        entidad: 'Ingreso',
        registroId: String(ingresoId),
        accion: 'MODIFICAR',
        detalle: { startsWith: 'Médico tratante actualizado:' },
      },
      orderBy: { fecha: 'desc' },
      select: { detalle: true },
    }),
  ])

  const observacionesParseadas = parseObservacionesInternacion(ingreso.observaciones)

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
    const fechaNacimiento = ingreso.paciente?.fechaNacimiento
    if (!fechaNacimiento) return ingreso.edad ? `${ingreso.edad} años` : '—'
    const anios = calcularEdad(fechaNacimiento)
    return anios == null ? '—' : `${anios} años`
  }

  const telefonoPaciente =
    ingreso.paciente?.celular1?.trim() || ingreso.paciente?.telefonoFijo?.trim() || '—'

  const medicoDerivante = profesionalDerivante?.nombre
    ? nombreProfesionalParaMostrar(profesionalDerivante.nombre)
    : ingreso.ingresoSubtipo?.profesionalDerivanteNombre
      ? nombreProfesionalParaMostrar(ingreso.ingresoSubtipo.profesionalDerivanteNombre)
      : '—'

  const medicoTratanteUltimo =
    extraerNombreTratanteDesdeDetalle(ultimoCambioTratante?.detalle) ||
    (ingreso.profesionalTratante?.nombre
      ? nombreProfesionalParaMostrar(ingreso.profesionalTratante.nombre)
      : '—')

  const habitacion = ingreso.cama
    ? `${ingreso.cama.habitacion ? `Hab. ${ingreso.cama.habitacion} · ` : ''}${ingreso.cama.identificador}`
    : '—'
  const diagnostico = ingreso.ingresoPatologias[0]?.descripcion ?? ingreso.descripcionPatologia ?? '—'

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
        }
      `}</style>

      <Header titulo="Informe de Hospitalización" />

      <div className="informe-hospitalizacion-print p-6 max-w-4xl space-y-6 print:space-y-3">
        <nav className="flex items-center gap-1 text-xs text-gray-500 print:hidden">
          <Link href="/dashboard/internacion" className="hover:text-gray-700">Internación</Link>
          <ChevronRight className="h-3 w-3" />
          <Link href={`/dashboard/internacion/${ingresoId}`} className="hover:text-gray-700">
            INT-{ingreso.numeroIngreso}
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-gray-900 font-medium">Informe</span>
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
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-1">
              <img
                src="/logo-clinica.png"
                alt="Logo Clínica"
                className="hidden print:block"
                style={{ maxWidth: 110, marginBottom: 4 }}
              />
              <p className="hidden print:block text-xs text-gray-500">
                Av. Sarmiento 566, Salta Capital, Argentina · Tel: 3872537289
              </p>
              <h1 className="text-2xl font-bold text-gray-900 print:text-xl">Informe de Hospitalización</h1>
            </div>
            <div className="text-right">
              <p className="text-3xl font-mono font-bold text-blue-700 print:text-2xl">INT-{ingreso.numeroIngreso}</p>
              <p className="text-xs text-gray-500 print:text-[10px]">Número de ingreso</p>
              <p className="mt-1 text-xl font-mono font-bold text-gray-900 print:text-lg">
                HC {ingreso.paciente?.historiaClinica ?? '—'}
              </p>
              <p className="text-xs text-gray-500 print:text-[10px]">Historia clínica</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:gap-4 print:text-sm">
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b pb-2 mb-3 print:pb-1 print:mb-2">
              Datos del Paciente
            </h2>
            <dl className="space-y-1.5 print:space-y-1">
              <DataRow label="N° historia clínica" value={ingreso.paciente?.historiaClinica?.toString() ?? '—'} />
              <DataRow label="N° admisión" value={String(ingreso.id)} />
              <DataRow label="Nombre del paciente" value={ingreso.paciente?.nombreCompleto ?? ingreso.nombre ?? '—'} />
              <DataRow label="Obra social" value={ingreso.obraSocial?.nombre ?? '—'} />
              <DataRow label="N° afiliado" value={ingreso.numeroAfiliado ?? '—'} />
              <DataRow label="Tipo de documento" value={ingreso.paciente?.tipoDocumento ?? '—'} />
              <DataRow label="Documento" value={ingreso.paciente?.numeroDocumento?.toString() ?? '—'} />
              <DataRow label="Fecha de nacimiento" value={fmtDate(ingreso.paciente?.fechaNacimiento)} />
              <DataRow label="Edad" value={edad()} />
              <DataRow
                label="Sexo"
                value={ingreso.paciente?.sexo === 'M' ? 'Masculino' : ingreso.paciente?.sexo === 'F' ? 'Femenino' : '—'}
              />
              <DataRow label="Domicilio" value={ingreso.paciente?.domicilio ?? '—'} />
              <DataRow label="Teléfono" value={telefonoPaciente} />
              <DataRow label="Familiar responsable" value={ingreso.nombreTutor ?? '—'} />
              <DataRow label="Teléfono familiar responsable" value={ingreso.telefonoTutor ?? '—'} />
            </dl>
          </div>

          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b pb-2 mb-3 print:pb-1 print:mb-2">
              Datos del Ingreso
            </h2>
            <dl className="space-y-1.5 print:space-y-1">
              <DataRow label="N° ingreso" value={`INT-${ingreso.numeroIngreso}`} />
              <DataRow label="Fecha y hora" value={fmt(ingreso.fechaIngreso)} />
              <DataRow label="Habitación" value={habitacion} />
              <DataRow label="Diagnóstico" value={diagnostico} />
              <DataRow label="Clínica derivante" value={observacionesParseadas.clinicaDerivante ?? '—'} />
              <DataRow label="Médico tratante" value={medicoTratanteUltimo} />
              <DataRow label="Médico derivante" value={medicoDerivante} />
            </dl>
          </div>
        </div>

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
