import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect, notFound } from 'next/navigation'
import { obtenerPaciente } from '@/modules/pacientes/service'
import { prisma } from '@/lib/db'
import { formatearFecha, calcularEdad } from '@/lib/utils'
import Link from 'next/link'
import { ChevronRight, Pencil, ClipboardList } from 'lucide-react'
import type { Metadata } from 'next'
import { PacienteHospitalizacionPrint } from '@/components/pacientes/paciente-hospitalizacion-print'
import { AltaInternacionButton } from '@/components/internacion/alta-internacion-button'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  return { title: `Paciente #${id}` }
}

export default async function FichaPacientePage({ params }: PageProps) {
  const usuario = await getUsuarioSesion()

  if (!tienePermiso(usuario.rol, 'PACIENTES', 'LEER')) {
    redirect('/dashboard')
  }

  const { id } = await params
  const pacienteId = parseInt(id, 10)
  if (isNaN(pacienteId)) notFound()

  let paciente
  try {
    paciente = await obtenerPaciente(pacienteId, usuario.clerkId)
  } catch {
    notFound()
  }

  const edad = calcularEdad(paciente.fechaNacimiento)
  const puedeModificar = tienePermiso(usuario.rol, 'PACIENTES', 'MODIFICAR')

  // Optimizado: limitar a últimos 10 ingresos y hacer query más selectiva
  const ingresos = await prisma.ingreso.findMany({
    where: { pacienteId: paciente.id },
    orderBy: [{ fechaIngreso: 'desc' }, { id: 'desc' }],
    take: 10,
    select: {
      id: true,
      numeroIngreso: true,
      tipoIngresoCodigo: true,
      fechaIngreso: true,
      fechaEgreso: true,
      fechaEgresoPrevista: true,
      estado: true,
      nombre: true,
      tipoIngreso: { select: { descripcion: true } },
      ingresoSubtipo: {
        include: {
          subtipoAdmision: { select: { descripcion: true } },
        },
      },
      profesionalGuardia: { select: { nombre: true } },
      profesionalTratante: { select: { nombre: true } },
      obraSocial: { select: { nombre: true } },
      plan: { select: { descripcion: true } },
      cama: { select: { identificador: true, sector: true, habitacion: true } },
      ingresoPatologias: {
        select: { id: true, descripcion: true, fecha: true },
        orderBy: { fecha: 'desc' },
      },
      practicas: {
        where: { OR: [{ estado: 'A' }, { estado: null }] },
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          codigoPractica: true,
          cantidad: true,
          fecha: true,
          numeroAutorizacion: true,
          nomencladorPractica: { select: { descripcion: true } },
        },
      },
    },
  })

  const ingresosPrint = ingresos.map((ing) => ({
    ...ing,
    practicas: ing.practicas.map((p) => ({
      ...p,
      cantidad: Number(p.cantidad),
    })),
  })) as any[]

  const obraSocialPaciente = paciente.obraSocial ?? null

  const internaciones = ingresos.filter((ing) => normalizarCodigo(ing.tipoIngresoCodigo) === 'INT')
  const internacionActiva =
    internaciones.find((ing) => normalizarCodigo(ing.estado) === 'A') ?? null

  return (
    <>
      <Header titulo={paciente.nombreCompleto} />
      <div className="p-6 max-w-4xl space-y-5">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-xs text-gray-500">
          <Link href="/dashboard/pacientes" className="hover:text-gray-700">
            Pacientes
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-gray-900 font-medium">{paciente.nombreCompleto}</span>
        </nav>

        {/* Cabecera */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{paciente.nombreCompleto}</h2>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
              {paciente.historiaClinica && (
                <span className="font-medium text-blue-600">HC: {paciente.historiaClinica}</span>
              )}
              {paciente.tipoDocumento && paciente.numeroDocumento && (
                <span>
                  {paciente.tipoDocumento.trim()} {paciente.numeroDocumento}
                </span>
              )}
              {edad !== null && <span>{edad} años</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/dashboard/admision/nuevo?pacienteId=${paciente.id}`}
              className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
            >
              <ClipboardList className="h-4 w-4" />
              Nueva Admisión
            </Link>
            {puedeModificar && (
              <Link
                href={`/dashboard/pacientes/${paciente.id}/editar`}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Pencil className="h-4 w-4" />
                Editar
              </Link>
            )}
          </div>
        </div>

        {/* Informe imprimible */}
        <PacienteHospitalizacionPrint
          paciente={{
            id: paciente.id,
            nombreCompleto: paciente.nombreCompleto,
            apellido: paciente.apellido,
            nombre: paciente.nombre,
            historiaClinica: paciente.historiaClinica,
            tipoDocumento: paciente.tipoDocumento,
            numeroDocumento: paciente.numeroDocumento,
            fechaNacimiento: paciente.fechaNacimiento,
            sexo: paciente.sexo,
            estadoCivil: paciente.estadoCivil,
            cuil: paciente.cuil ? paciente.cuil.toString() : null,
            domicilio: paciente.domicilio,
            celular1: paciente.celular1,
            telefonoFijo: paciente.telefonoFijo,
            email: paciente.email,
            obraSocialId: paciente.obraSocialId,
            planId: paciente.planId,
            numeroAfiliado: paciente.numeroAfiliado,
            observaciones: paciente.observaciones,
          }}
          ingresos={ingresosPrint}
        />

        {internacionActiva && (
          <div className="his-card border border-rose-200 bg-rose-50/50 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Internación activa</p>
                <h3 className="mt-1 text-lg font-semibold text-gray-900">
                  {internacionActiva.cama ? `Cama ${internacionActiva.cama.identificador}` : `Ingreso #${internacionActiva.numeroIngreso}`}
                </h3>
                <p className="text-sm text-gray-600">
                  {internacionActiva.fechaIngreso
                    ? `Ingreso ${formatearFecha(internacionActiva.fechaIngreso)}`
                    : 'Sin fecha de ingreso registrada'}
                  {internacionActiva.fechaEgresoPrevista ? ` · Alta prevista ${formatearFecha(internacionActiva.fechaEgresoPrevista)}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/dashboard/internacion/${internacionActiva.id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Ver ficha
                </Link>
                <AltaInternacionButton
                  ingresoId={internacionActiva.id}
                  label="Marcar alta"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 transition-colors"
                />
              </div>
            </div>
          </div>
        )}

        {/* Datos de identificación */}
        <div className="his-card p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
            Datos Personales
          </h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
            <DataItem label="Apellido" value={paciente.apellido} />
            <DataItem label="Nombre" value={paciente.nombre} />
            <DataItem
              label="Fecha de Nacimiento"
              value={
                paciente.fechaNacimiento
                  ? `${formatearFecha(paciente.fechaNacimiento)} (${edad} años)`
                  : null
              }
            />
            <DataItem
              label="Sexo"
              value={
                paciente.sexo === 'M'
                  ? 'Masculino'
                  : paciente.sexo === 'F'
                    ? 'Femenino'
                    : null
              }
            />
            <DataItem
              label="Estado Civil"
              value={mapEstadoCivil(paciente.estadoCivil)}
            />
            <DataItem label="CUIL" value={paciente.cuil?.toString()} />
          </dl>
        </div>

        {/* Contacto */}
        <div className="his-card p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">Contacto</h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
            <DataItem label="Domicilio" value={paciente.domicilio} />
            <DataItem label="Celular" value={paciente.celular1} />
            <DataItem label="Teléfono fijo" value={paciente.telefonoFijo} />
            <DataItem label="Email" value={paciente.email} />
          </dl>
        </div>

        {/* Cobertura */}
        <div className="his-card p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
            Cobertura Médica
          </h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <DataItem
              label="Obra Social"
              value={obraSocialPaciente?.nombre ?? null}
            />
            <DataItem label="Número de Afiliado" value={paciente.numeroAfiliado} />
          </dl>
        </div>

        <div className="his-card p-5">
          <div className="flex items-center justify-between gap-3 mb-4 pb-2 border-b">
            <h3 className="text-sm font-semibold text-gray-700">Histórico de internaciones</h3>
            <span className="text-xs text-gray-500">{internaciones.length} registro(s)</span>
          </div>
          <div className="space-y-3">
            {internaciones.length === 0 ? (
              <p className="text-sm text-gray-500">El paciente todavía no tiene internaciones registradas.</p>
            ) : (
              internaciones
                .map((ing) => (
                  <div key={ing.id} className="rounded-xl border border-gray-200 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${normalizarCodigo(ing.estado) === 'A' ? 'bg-green-100 text-green-700' : normalizarCodigo(ing.estado) === 'E' ? 'bg-slate-100 text-slate-700' : 'bg-gray-100 text-gray-500'}`}>
                          {mapEstadoIngreso(ing.estado)}
                        </span>
                        <span className="font-semibold text-gray-900">INT-{ing.numeroIngreso}</span>
                        {ing.cama && <span className="text-sm text-gray-500">{ing.cama.identificador}</span>}
                      </div>
                      <p className="mt-1 text-sm text-gray-600">
                        {ing.fechaIngreso ? `Ingreso ${formatearFecha(ing.fechaIngreso)}` : 'Sin fecha de ingreso'}
                        {ing.fechaEgreso ? ` · Alta ${formatearFecha(ing.fechaEgreso)}` : ''}
                      </p>
                    </div>
                    <Link
                      href={`/dashboard/internacion/${ing.id}`}
                      className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Ver ficha
                    </Link>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* Observaciones */}
        {paciente.observaciones && (
          <div className="his-card p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Observaciones</h3>
            <p className="text-sm text-gray-600 whitespace-pre-line">
              {paciente.observaciones}
            </p>
          </div>
        )}

      </div>
    </>
  )
}

function DataItem({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{value ?? '-'}</dd>
    </div>
  )
}

function mapEstadoCivil(ec: string | null | undefined): string | null {
  const map: Record<string, string> = {
    S: 'Soltero/a',
    C: 'Casado/a',
    D: 'Divorciado/a',
    V: 'Viudo/a',
    U: 'Unión convivencial',
  }
  return ec ? (map[ec] ?? ec) : null
}

function normalizarCodigo(valor: string | null | undefined): string {
  return (valor ?? '').trim().toUpperCase()
}

function mapEstadoIngreso(estado: string | null | undefined): string {
  const codigo = normalizarCodigo(estado)
  if (codigo === 'A') return 'Activa'
  if (codigo === 'E') return 'Egresada'
  if (codigo === 'P') return 'Pendiente'
  if (codigo === 'X') return 'Anulada'
  return codigo || '—'
}
