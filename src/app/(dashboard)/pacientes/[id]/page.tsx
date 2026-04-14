import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect, notFound } from 'next/navigation'
import { obtenerPaciente } from '@/modules/pacientes/service'
import { formatearFecha, calcularEdad } from '@/lib/utils'
import Link from 'next/link'
import { ChevronRight, Pencil, ClipboardList } from 'lucide-react'
import type { Metadata } from 'next'

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
              label="Obra Social ID"
              value={paciente.obraSocialId?.toString()}
            />
            <DataItem label="Número de Afiliado" value={paciente.numeroAfiliado} />
          </dl>
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

        {/* Historial de ingresos (placeholder) */}
        <div className="his-card p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Historial de Ingresos
          </h3>
          <p className="text-sm text-gray-400">Sin ingresos registrados.</p>
        </div>
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
