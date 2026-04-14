import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { generarNombreCompleto } from '@/lib/utils'
import type { CrearPacienteInput, ActualizarPacienteInput, BusquedaPacienteInput } from './schemas'
import type { ResultadoPaginado } from '@/types'
import type { PacienteConRelaciones, PacienteBusqueda } from './types'

// Selección de campos para incluir en relaciones
const incluirRelaciones = {
  pais: true,
  provincia: true,
  localidad: true,
  profesion: true,
} as const

// ============================================
// REPOSITORIO PACIENTES
// Única capa de acceso a datos. Sin SQL directo.
// ============================================

export async function crearPaciente(
  data: CrearPacienteInput,
  usuarioAlta: string
): Promise<PacienteConRelaciones> {
  const nombreCompleto = generarNombreCompleto(data.apellido, data.nombre)
  const ahora = new Date()

  return prisma.paciente.create({
    data: {
      apellido: data.apellido.toUpperCase(),
      nombre: data.nombre,
      nombreCompleto,
      tipoDocumento: data.tipoDocumento ?? null,
      numeroDocumento: data.numeroDocumento ?? null,
      cuil: data.cuil ? data.cuil : null,
      fechaNacimiento: data.fechaNacimiento ?? null,
      sexo: data.sexo ?? null,
      estadoCivil: data.estadoCivil ?? null,
      paisId: data.paisId ?? null,
      profesionId: data.profesionId ?? null,
      domicilio: data.domicilio ?? null,
      provinciaId: data.provinciaId ?? null,
      localidadId: data.localidadId ?? null,
      barrioId: data.barrioId ?? null,
      telefonoFijo: data.telefonoFijo ?? null,
      telefonoLaboral: data.telefonoLaboral ?? null,
      celular1: data.celular1 ?? null,
      celular2: data.celular2 ?? null,
      email: data.email ?? null,
      obraSocialId: data.obraSocialId ?? null,
      planId: data.planId ?? null,
      numeroAfiliado: data.numeroAfiliado ?? null,
      obraSocialCoseguroId: data.obraSocialCoseguroId ?? null,
      nombreTutor: data.nombreTutor ?? null,
      telefonoTutor: data.telefonoTutor ?? null,
      empleoTutor: data.empleoTutor ?? null,
      observaciones: data.observaciones ?? null,
      usuarioAlta,
      fechaAlta: ahora,
      fechaModificacion: ahora,
    },
    include: incluirRelaciones,
  })
}

export async function obtenerPacientePorId(
  id: number
): Promise<PacienteConRelaciones | null> {
  return prisma.paciente.findUnique({
    where: { id },
    include: incluirRelaciones,
  })
}

export async function obtenerPacientePorDNI(
  numeroDocumento: number
): Promise<PacienteConRelaciones | null> {
  return prisma.paciente.findUnique({
    where: { numeroDocumento },
    include: incluirRelaciones,
  })
}

export async function obtenerPacientePorHC(
  historiaClinica: number
): Promise<PacienteConRelaciones | null> {
  return prisma.paciente.findUnique({
    where: { historiaClinica },
    include: incluirRelaciones,
  })
}

export async function actualizarPaciente(
  id: number,
  data: ActualizarPacienteInput,
  usuarioModificacion: string
): Promise<PacienteConRelaciones> {
  const updateData: Record<string, unknown> = {
    fechaModificacion: new Date(),
  }

  if (data.apellido !== undefined) updateData.apellido = data.apellido.toUpperCase()
  if (data.nombre !== undefined) updateData.nombre = data.nombre
  if (data.apellido !== undefined || data.nombre !== undefined) {
    const paciente = await prisma.paciente.findUniqueOrThrow({ where: { id } })
    const apellido = data.apellido?.toUpperCase() ?? paciente.apellido
    const nombre = data.nombre ?? paciente.nombre
    updateData.nombreCompleto = generarNombreCompleto(apellido, nombre)
  }

  const camposDirectos = [
    'tipoDocumento', 'numeroDocumento', 'fechaNacimiento', 'sexo',
    'estadoCivil', 'paisId', 'profesionId', 'domicilio', 'provinciaId',
    'localidadId', 'barrioId', 'telefonoFijo', 'telefonoLaboral', 'celular1',
    'celular2', 'email', 'obraSocialId', 'planId', 'numeroAfiliado',
    'obraSocialCoseguroId', 'nombreTutor', 'telefonoTutor', 'empleoTutor',
    'observaciones',
  ] as const

  for (const campo of camposDirectos) {
    if (data[campo] !== undefined) {
      updateData[campo] = data[campo]
    }
  }

  // Registrar en historial antes de actualizar
  await prisma.pacienteHistorial.create({
    data: {
      pacienteId: id,
      tipoCambio: 'M',
      usuarioCambio: usuarioModificacion,
      fechaCambio: new Date(),
    },
  })

  return prisma.paciente.update({
    where: { id },
    data: updateData,
    include: incluirRelaciones,
  })
}

export async function buscarPacientes(
  params: BusquedaPacienteInput
): Promise<ResultadoPaginado<PacienteBusqueda>> {
  const { pagina, porPagina, q, numeroDocumento, apellido, nombre, historiaClinica } = params
  const skip = (pagina - 1) * porPagina

  // Construir filtros de búsqueda
  type WhereClause = Prisma.PacienteWhereInput
  const where: WhereClause = {}

  if (q) {
    // Búsqueda general: intenta por DNI si es numérico, sino por nombre/apellido
    const esNumerico = /^\d+$/.test(q)
    if (esNumerico) {
      const num = parseInt(q, 10)
      where.OR = [
        { numeroDocumento: num },
        { historiaClinica: num },
        { apellido: { contains: q, mode: 'insensitive' } },
      ]
    } else {
      where.OR = [
        { apellido: { contains: q, mode: 'insensitive' } },
        { nombre: { contains: q, mode: 'insensitive' } },
        { nombreCompleto: { contains: q, mode: 'insensitive' } },
      ]
    }
  }

  if (numeroDocumento) where.numeroDocumento = numeroDocumento
  if (historiaClinica) where.historiaClinica = historiaClinica
  if (apellido) where.apellido = { contains: apellido, mode: 'insensitive' }
  if (nombre) where.nombre = { contains: nombre, mode: 'insensitive' }

  const [total, items] = await prisma.$transaction([
    prisma.paciente.count({ where }),
    prisma.paciente.findMany({
      where,
      select: {
        id: true,
        historiaClinica: true,
        apellido: true,
        nombre: true,
        nombreCompleto: true,
        tipoDocumento: true,
        numeroDocumento: true,
        sexo: true,
        fechaNacimiento: true,
        domicilio: true,
        telefonoFijo: true,
        celular1: true,
        email: true,
        obraSocialId: true,
        numeroAfiliado: true,
        fechaAlta: true,
        obraSocial: {
          select: {
            nombre: true,
          },
        },
        plan: {
          select: {
            descripcion: true,
          },
        },
      },
      orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
      skip,
      take: porPagina,
    }),
  ])

  return {
    items: items.map((p) => ({
      id: p.id,
      historiaClinica: p.historiaClinica,
      nombreCompleto: p.nombreCompleto,
      domicilio: p.domicilio,
      tipoDocumento: p.tipoDocumento,
      numeroDocumento: p.numeroDocumento,
      fechaNacimiento: p.fechaNacimiento,
      sexo: p.sexo,
      telefonoFijo: p.telefonoFijo,
      celular1: p.celular1,
      email: p.email,
      obraSocialId: p.obraSocialId,
      obraSocialNombre: p.obraSocial?.nombre ?? null,
      planDescripcion: p.plan?.descripcion ?? null,
      numeroAfiliado: p.numeroAfiliado,
      fechaAlta: p.fechaAlta,
      estado: 'activo' as const,
    })),
    paginacion: {
      pagina,
      porPagina,
      total,
      totalPaginas: Math.ceil(total / porPagina),
    },
  }
}
