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
  obraSocial: true,
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

  const where: Prisma.PacienteWhereInput = {}

  if (q) {
    const esNumerico = /^\d+$/.test(q)
    if (esNumerico) {
      const num = parseInt(q, 10)
      where.OR = [
        { numeroDocumento: num },
        { historiaClinica: num },
      ]
    } else {
      where.OR = [
        { apellido: { contains: q, mode: 'insensitive' } },
        { nombre: { contains: q, mode: 'insensitive' } },
      ]
    }
  }

  if (numeroDocumento) where.numeroDocumento = numeroDocumento
  if (apellido) where.apellido = { contains: apellido, mode: 'insensitive' }
  if (nombre) where.nombre = { contains: nombre, mode: 'insensitive' }
  if (historiaClinica) where.historiaClinica = historiaClinica

  const [total, items] = await prisma.$transaction([
    prisma.paciente.count({ where }),
    prisma.paciente.findMany({
      where,
      skip,
      take: porPagina,
      select: {
        id: true,
        historiaClinica: true,
        apellido: true,
        nombre: true,
        nombreCompleto: true,
        domicilio: true,
        tipoDocumento: true,
        numeroDocumento: true,
        fechaNacimiento: true,
        sexo: true,
        telefonoFijo: true,
        celular1: true,
        email: true,
        obraSocialId: true,
        planId: true,
        obraSocialCoseguroId: true,
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
      orderBy: [
        { apellido: 'asc' },
        { nombre: 'asc' },
      ],
    }),
  ])

  return {
    items: items.map((item) => ({
      id: item.id,
      historiaClinica: item.historiaClinica,
      apellido: item.apellido,
      nombre: item.nombre,
      nombreCompleto: item.nombreCompleto,
      domicilio: item.domicilio,
      tipoDocumento: item.tipoDocumento,
      numeroDocumento: item.numeroDocumento,
      fechaNacimiento: item.fechaNacimiento,
      sexo: item.sexo,
      telefonoFijo: item.telefonoFijo,
      celular1: item.celular1,
      email: item.email,
      obraSocialId: item.obraSocialId,
      planId: item.planId,
      obraSocialCoseguroId: item.obraSocialCoseguroId,
      obraSocialNombre: item.obraSocial?.nombre ?? null,
      planDescripcion: item.plan?.descripcion ?? null,
      numeroAfiliado: item.numeroAfiliado,
      fechaAlta: item.fechaAlta,
    })),
    paginacion: {
      pagina,
      porPagina,
      total,
      totalPaginas: Math.ceil(total / porPagina),
    },
  }
}

