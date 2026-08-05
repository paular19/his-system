import { Header } from '@/components/layout/header'
import { getUsuarioSesionLectura } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { formatearFecha, formatearFechaCalendario, calcularEdad } from '@/lib/utils'
import Link from 'next/link'
import { ChevronRight, Pencil, ClipboardList, BedDouble } from 'lucide-react'
import type { Metadata } from 'next'
import { PacienteHospitalizacionPrint } from '@/components/pacientes/paciente-hospitalizacion-print'
import { AltaInternacionButton } from '@/components/internacion/alta-internacion-button'
import { ConfirmarCamaReservadaButton } from '@/components/internacion/confirmar-cama-reservada-button'
import { registrarAudit } from '@/lib/security/audit'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  return { title: `Paciente #${id}` }
}

export default async function FichaPacientePage({ params }: PageProps) {
  const usuario = await getUsuarioSesionLectura()

  if (!tienePermiso(usuario.rol, 'PACIENTES', 'LEER')) {
    redirect('/dashboard')
  }

  const { id } = await params
  const pacienteId = parseInt(id, 10)
  if (isNaN(pacienteId)) notFound()

  const paciente = await prisma.paciente.findUnique({
    where: { id: pacienteId },
    select: {
      id: true,
      historiaClinica: true,
      apellido: true,
      nombre: true,
      nombreCompleto: true,
      tipoDocumento: true,
      numeroDocumento: true,
      fechaNacimiento: true,
      sexo: true,
      domicilio: true,
      telefonoFijo: true,
      celular1: true,
      email: true,
      obraSocialId: true,
      planId: true,
      numeroAfiliado: true,
      observaciones: true,
      obraSocial: {
        select: {
          nombre: true,
        },
      },
    },
  })

  if (!paciente) {
    notFound()
  }

  void registrarAudit({
    usuario: usuario.codigoUsuario,
    accion: 'CONSULTAR',
    entidad: 'Paciente',
    registroId: paciente.id,
  })

  const edad = calcularEdad(paciente.fechaNacimiento)
  const puedeModificar = tienePermiso(usuario.rol, 'PACIENTES', 'MODIFICAR')
  const puedeCrearInternacion = tienePermiso(usuario.rol, 'INTERNACION', 'CREAR')

  // Workaround: evitar prisma.ingreso.findMany por panic de Query Engine en prod con casos puntuales.
  type IngresoBaseRow = {
    id: number
    numeroIngreso: number
    tipoIngresoCodigo: string
    fechaIngreso: Date | null
    fechaEgreso: Date | null
    fechaEgresoPrevista: Date | null
    estado: string | null
    nombre: string | null
    profesionalGuardiaId: number | null
    profesionalTratanteId: number | null
    obraSocialId: number | null
    planId: number | null
    camaId: number | null
  }

  const ingresosBaseOrdenados = await prisma.$queryRaw<IngresoBaseRow[]>`
      SELECT
        "IngID" AS id,
        "IngNro" AS "numeroIngreso",
        "TigCodig" AS "tipoIngresoCodigo",
        "IngFchIngreso" AS "fechaIngreso",
        "IngFchEgreso" AS "fechaEgreso",
        "IngFchEgresoPrevista" AS "fechaEgresoPrevista",
        "IngEstad" AS estado,
        "IngNom" AS nombre,
        "PrfIDGuardia" AS "profesionalGuardiaId",
        "PrfIDTratante" AS "profesionalTratanteId",
        "OSID" AS "obraSocialId",
        "PosID" AS "planId",
        "CamID" AS "camaId"
      FROM "Ingreso"
      WHERE "PacID" = ${paciente.id}
      ORDER BY "IngFchIngreso" DESC NULLS LAST, "IngID" DESC
      LIMIT 100
    `

  const ingresoIds = ingresosBaseOrdenados.map((ing) => ing.id)
  const tipoIngresoCodigos = Array.from(new Set(ingresosBaseOrdenados.map((ing) => ing.tipoIngresoCodigo)))
  const profesionalIds = Array.from(
    new Set(
      ingresosBaseOrdenados
        .flatMap((ing) => [ing.profesionalGuardiaId, ing.profesionalTratanteId])
        .filter((id): id is number => typeof id === 'number')
    )
  )
  const obraSocialIds = Array.from(
    new Set(ingresosBaseOrdenados.map((ing) => ing.obraSocialId).filter((id): id is number => typeof id === 'number'))
  )
  const planIds = Array.from(
    new Set(ingresosBaseOrdenados.map((ing) => ing.planId).filter((id): id is number => typeof id === 'number'))
  )
  const camaIds = Array.from(
    new Set(ingresosBaseOrdenados.map((ing) => ing.camaId).filter((id): id is number => typeof id === 'number'))
  )

  const [
    patologiasRows,
    practicasBaseRows,
    tiposIngresoRows,
    ingresoSubtipoRows,
    subtiposRows,
    profesionalesRows,
    obrasRows,
    planesRows,
    camasRows,
  ] = await Promise.all([
    ingresoIds.length > 0
      ? prisma.ingresoPatologia.findMany({
        where: { ingresoId: { in: ingresoIds } },
        select: {
          id: true,
          ingresoId: true,
          descripcion: true,
          fecha: true,
        },
      })
      : Promise.resolve([]),
    ingresoIds.length > 0
      ? prisma.practica.findMany({
        where: {
          ingresoId: { in: ingresoIds },
          OR: [{ estado: 'A' }, { estado: null }],
        },
        select: {
          id: true,
          ingresoId: true,
          codigoPractica: true,
          cantidad: true,
          fecha: true,
          numeroAutorizacion: true,
        },
      })
      : Promise.resolve([]),
    tipoIngresoCodigos.length > 0
      ? prisma.tipoIngreso.findMany({
        where: { codigo: { in: tipoIngresoCodigos } },
        select: { codigo: true, descripcion: true },
      })
      : Promise.resolve([]),
    ingresoIds.length > 0
      ? prisma.ingresoSubtipo.findMany({
        where: { ingresoId: { in: ingresoIds } },
        select: { ingresoId: true, subtipoAdmisionCodigo: true },
      })
      : Promise.resolve([]),
    ingresoIds.length > 0
      ? prisma.subtipoAdmision.findMany({
        where: { estado: 'A' },
        select: { codigo: true, descripcion: true },
      })
      : Promise.resolve([]),
    profesionalIds.length > 0
      ? prisma.profesional.findMany({
        where: { id: { in: profesionalIds } },
        select: { id: true, nombre: true },
      })
      : Promise.resolve([]),
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
    camaIds.length > 0
      ? prisma.cama.findMany({
        where: { id: { in: camaIds } },
        select: { id: true, identificador: true, sector: true, habitacion: true, estado: true },
      })
      : Promise.resolve([]),
  ])

  const codigosPractica = Array.from(new Set(practicasBaseRows.map((row) => row.codigoPractica)))
  const nomencladorRows = codigosPractica.length > 0
    ? await prisma.nomencladorPractica.findMany({
      where: { codigo: { in: codigosPractica } },
      select: { codigo: true, descripcion: true },
    })
    : []

  const patologiasByIngreso = new Map<number, Array<{ id: number; descripcion: string | null; fecha: Date }>>()
  for (const row of patologiasRows) {
    const lista = patologiasByIngreso.get(row.ingresoId) ?? []
    lista.push({ id: row.id, descripcion: row.descripcion, fecha: row.fecha })
    patologiasByIngreso.set(row.ingresoId, lista)
  }

  const nomencladorByCodigo = new Map(
    nomencladorRows.map((row) => [row.codigo, row.descripcion])
  )

  const practicasRows = practicasBaseRows
    .map((row) => ({
      ...row,
      nomencladorPractica: (() => {
        const descripcion = nomencladorByCodigo.get(row.codigoPractica)
        return descripcion ? { descripcion } : null
      })(),
    }))
    .sort((a, b) => {
      const aFecha = a.fecha.getTime()
      const bFecha = b.fecha.getTime()
      if (aFecha !== bFecha) return bFecha - aFecha
      return b.id - a.id
    })

  const practicasByIngreso = new Map<number, Array<(typeof practicasRows)[number]>>()
  for (const row of practicasRows) {
    const lista = practicasByIngreso.get(row.ingresoId) ?? []
    lista.push(row)
    practicasByIngreso.set(row.ingresoId, lista)
  }

  const tiposIngresoByCodigo = new Map(
    tiposIngresoRows.map((row) => [row.codigo, { descripcion: row.descripcion }])
  )

  const subtipoDescripcionByCodigo = new Map(
    subtiposRows.map((row) => [row.codigo, row.descripcion])
  )

  const ingresoSubtipoByIngresoId = new Map<number, {
    subtipoAdmisionCodigo: string
    subtipoAdmision: { descripcion: string | null }
  }>()
  for (const row of ingresoSubtipoRows) {
    ingresoSubtipoByIngresoId.set(row.ingresoId, {
      subtipoAdmisionCodigo: row.subtipoAdmisionCodigo,
      subtipoAdmision: {
        descripcion: subtipoDescripcionByCodigo.get(row.subtipoAdmisionCodigo) ?? null,
      },
    })
  }

  const profesionalById = new Map(
    profesionalesRows.map((row) => [row.id, { nombre: row.nombre }])
  )

  const obraSocialById = new Map(
    obrasRows.map((row) => [row.id, { nombre: row.nombre }])
  )

  const planById = new Map(
    planesRows.map((row) => [row.id, { descripcion: row.descripcion }])
  )

  const camaById = new Map(
    camasRows.map((row) => [row.id, {
      identificador: row.identificador,
      sector: row.sector,
      habitacion: row.habitacion,
      estado: row.estado,
    }])
  )

  const ingresos = ingresosBaseOrdenados.map((ing) => ({
    ...ing,
    tipoIngreso: tiposIngresoByCodigo.get(ing.tipoIngresoCodigo) ?? null,
    ingresoSubtipo: ingresoSubtipoByIngresoId.get(ing.id) ?? null,
    profesionalGuardia:
      ing.profesionalGuardiaId != null
        ? (profesionalById.get(ing.profesionalGuardiaId) ?? null)
        : null,
    profesionalTratante:
      ing.profesionalTratanteId != null
        ? (profesionalById.get(ing.profesionalTratanteId) ?? null)
        : null,
    obraSocial:
      ing.obraSocialId != null
        ? (obraSocialById.get(ing.obraSocialId) ?? null)
        : null,
    plan:
      ing.planId != null
        ? (planById.get(ing.planId) ?? null)
        : null,
    cama:
      ing.camaId != null
        ? (camaById.get(ing.camaId) ?? null)
        : null,
    ingresoPatologias: patologiasByIngreso.get(ing.id) ?? [],
    practicas: practicasByIngreso.get(ing.id) ?? [],
  }))

  const ingresosPrint = ingresos.map((ing) => ({
    ...ing,
    practicas: ing.practicas.map((p) => ({
      ...p,
      cantidad: Number(p.cantidad),
    })),
  }))

  const obraSocialPaciente = paciente.obraSocial ?? null

  const internaciones = ingresos.filter((ing) => normalizarCodigo(ing.tipoIngresoCodigo) === 'INT')
  const internacionActiva =
    internaciones.find((ing) => normalizarCodigo(ing.estado) === 'A') ?? null
  const internacionReservaPendiente =
    internaciones.find((ing) => puedeConfirmarReserva(ing)) ?? null
  const puedeConfirmarReserva = (ingreso: {
    camaId: number | null
    cama: { estado: string; identificador: string; sector: string; habitacion: string | null } | null
    estado: string | null
  }) => (
    ingreso.camaId != null
    && ingreso.cama?.estado === 'RESERVADA'
    && normalizarCodigo(ingreso.estado) !== 'E'
  )

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
            {puedeCrearInternacion && (
              <Link
                href={`/dashboard/internacion/nuevo?pacienteId=${paciente.id}`}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                <BedDouble className="h-4 w-4" />
                Nueva Internación
              </Link>
            )}
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
        {ingresosPrint.length > 0 ? (
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
        ) : (
          <div className="his-card p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-2 pb-2 border-b">Informe de Hospitalización</h3>
            <p className="text-sm text-gray-400">El paciente no tiene admisiones para imprimir.</p>
          </div>
        )}

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
                <div className="flex flex-col gap-2">
                  <AltaInternacionButton
                    ingresoId={internacionActiva.id}
                    label="Marcar alta"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 transition-colors"
                  />
                  {puedeConfirmarReserva(internacionActiva) && (
                    <ConfirmarCamaReservadaButton
                      camaId={internacionActiva.camaId as number}
                      label="Confirmar cama reservada"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {internacionReservaPendiente && internacionReservaPendiente.id !== internacionActiva?.id && (
          <div className="his-card border border-amber-200 bg-amber-50/60 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Reserva de cama pendiente</p>
                <h3 className="mt-1 text-lg font-semibold text-gray-900">
                  {internacionReservaPendiente.cama
                    ? `Cama ${internacionReservaPendiente.cama.identificador}`
                    : `Ingreso #${internacionReservaPendiente.numeroIngreso}`}
                </h3>
                <p className="text-sm text-gray-600">
                  {internacionReservaPendiente.fechaIngreso
                    ? `Ingreso ${formatearFecha(internacionReservaPendiente.fechaIngreso)}`
                    : 'Sin fecha de ingreso registrada'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <ConfirmarCamaReservadaButton
                  camaId={internacionReservaPendiente.camaId as number}
                  label="Confirmar cama reservada"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
                />
                <Link
                  href={`/dashboard/internacion/${internacionReservaPendiente.id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Ver ficha
                </Link>
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
                  ? `${formatearFechaCalendario(paciente.fechaNacimiento)} (${edad} años)`
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
                    <div className="flex items-center gap-2">
                      {puedeConfirmarReserva(ing) && (
                        <ConfirmarCamaReservadaButton
                          camaId={ing.camaId as number}
                          label="Confirmar cama"
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
                        />
                      )}
                      <Link
                        href={`/dashboard/internacion/${ing.id}`}
                        className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Ver ficha
                      </Link>
                    </div>
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
