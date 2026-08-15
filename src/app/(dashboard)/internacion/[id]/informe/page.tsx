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
        .ih-doc { font-family: Arial, Helvetica, sans-serif; color: #111; }

        /* --- Encabezado --- */
        .ih-header { border-bottom: 2.5px solid #111; padding-bottom: 8px; }
        .ih-header-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .ih-header-clinica { display: flex; flex-direction: column; gap: 2px; }
        .ih-header-sub { font-size: 11px; color: #444; }
        .ih-doc-titulo {
          font-size: 20px; font-weight: bold; letter-spacing: 1.4px;
          text-transform: uppercase; margin: 4px 0 0;
        }
        .ih-ident { display: flex; gap: 10px; }
        .ih-ident-caja {
          border: 1.5px solid #111; padding: 3px 10px; text-align: center; min-width: 108px;
        }
        .ih-ident-valor { font-family: 'Courier New', monospace; font-size: 18px; font-weight: bold; }
        .ih-ident-label {
          font-size: 9px; text-transform: uppercase; letter-spacing: 0.6px; color: #444;
        }

        /* --- Secciones --- */
        .ih-cols { display: grid; grid-template-columns: 1fr; gap: 12px; }
        @media (min-width: 768px) { .ih-cols { grid-template-columns: 1fr 1fr; } }

        .ih-seccion { border: 1px solid #111; break-inside: avoid; page-break-inside: avoid; }
        .ih-seccion-titulo {
          background: #e6e6e6;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          font-size: 11px; font-weight: bold;
          text-transform: uppercase; letter-spacing: 0.9px;
          padding: 4px 8px; border-bottom: 1px solid #111; margin: 0;
        }
        .ih-seccion-cuerpo { padding: 4px 8px 6px; }

        /* --- Renglones --- */
        .ih-fila {
          display: flex; align-items: baseline; gap: 6px;
          padding: 3px 0 2px; border-bottom: 1px dotted #b0b0b0;
        }
        .ih-fila:last-child { border-bottom: none; }
        .ih-fila-label {
          font-size: 10px; color: #444; text-transform: uppercase;
          letter-spacing: 0.3px; white-space: nowrap;
        }
        .ih-fila-guia { flex: 1 1 auto; min-width: 8px; }
        .ih-fila-valor { font-size: 12px; font-weight: bold; text-align: right; }

        /* --- Pie de firmas --- */
        .ih-firmas {
          display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 28px;
          break-inside: avoid; page-break-inside: avoid;
        }
        .ih-firma { border-top: 1px solid #111; padding-top: 3px; text-align: center; }
        .ih-firma span {
          font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: #444;
        }

        @media print {
          @page { size: A4 portrait; margin: 7mm; }

          .informe-hospitalizacion-print { font-size: 11px; line-height: 1.25; }
          .ih-cols { grid-template-columns: 1fr 1fr; gap: 8px; }
          .ih-seccion-cuerpo { padding: 3px 6px 4px; }
          .ih-fila { padding: 2px 0 1.5px; }
          .ih-fila-label { font-size: 8pt; }
          .ih-fila-valor { font-size: 9pt; }
          .ih-doc-titulo { font-size: 15pt; }
          .ih-ident-valor { font-size: 13pt; }
          .ih-firmas { margin-top: 16px; gap: 28px; }
        }
      `}</style>

      <Header titulo="Informe de Hospitalización" />

      <div className="ih-doc informe-hospitalizacion-print p-6 max-w-4xl space-y-5 print:space-y-3">
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

        <div className="ih-header">
          <div className="ih-header-row">
            <div className="ih-header-clinica">
              <img
                src="/logo-clinica.png"
                alt="Logo Clínica"
                className="hidden print:block"
                style={{ maxWidth: 110, marginBottom: 4 }}
              />
              <p className="ih-header-sub hidden print:block">
                Av. Sarmiento 566, Salta Capital, Argentina · Tel: 3872537289
              </p>
              <h1 className="ih-doc-titulo">Informe de Hospitalización</h1>
            </div>
            <div className="ih-ident">
              <div className="ih-ident-caja">
                <p className="ih-ident-valor">INT-{ingreso.numeroIngreso}</p>
                <p className="ih-ident-label">N° de ingreso</p>
              </div>
              <div className="ih-ident-caja">
                <p className="ih-ident-valor">{ingreso.paciente?.historiaClinica ?? '—'}</p>
                <p className="ih-ident-label">Historia clínica</p>
              </div>
            </div>
          </div>
        </div>

        <div className="ih-cols">
          <section className="ih-seccion">
            <h2 className="ih-seccion-titulo">Datos del paciente</h2>
            <div className="ih-seccion-cuerpo">
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
            </div>
          </section>

          <section className="ih-seccion">
            <h2 className="ih-seccion-titulo">Datos del ingreso</h2>
            <div className="ih-seccion-cuerpo">
              <DataRow label="N° ingreso" value={`INT-${ingreso.numeroIngreso}`} />
              <DataRow label="Fecha y hora" value={fmt(ingreso.fechaIngreso)} />
              <DataRow label="Habitación" value={habitacion} />
              <DataRow label="Diagnóstico" value={diagnostico} />
              <DataRow label="Clínica derivante" value={observacionesParseadas.clinicaDerivante ?? '—'} />
              <DataRow label="Médico tratante" value={medicoTratanteUltimo} />
              <DataRow label="Médico derivante" value={medicoDerivante} />
            </div>
          </section>

          <section className="ih-seccion">
            <h2 className="ih-seccion-titulo">Responsable del paciente</h2>
            <div className="ih-seccion-cuerpo">
              <DataRow label="Familiar responsable" value={ingreso.nombreTutor ?? '—'} />
              <DataRow label="Teléfono del responsable" value={ingreso.telefonoTutor ?? '—'} />
              <DataRow label="Domicilio" value={ingreso.paciente?.domicilio ?? '—'} />
            </div>
          </section>
        </div>

        <div className="ih-firmas">
          <div className="ih-firma">
            <span>Firma del paciente / responsable</span>
          </div>
          <div className="ih-firma">
            <span>Firma y sello — Admisión</span>
          </div>
        </div>
      </div>
    </>
  )
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="ih-fila">
      <span className="ih-fila-label">{label}</span>
      <span className="ih-fila-guia" aria-hidden="true" />
      <span className="ih-fila-valor">{value}</span>
    </div>
  )
}
