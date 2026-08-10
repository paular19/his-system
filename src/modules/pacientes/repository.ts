import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { generarNombreCompleto } from '@/lib/utils'
import type { CrearPacienteInput, ActualizarPacienteInput, BusquedaPacienteInput } from './schemas'
import type { ResultadoPaginado } from '@/types'
import type { PacienteConRelaciones, PacienteBusqueda } from './types'
import { obtenerTokensBusquedaFlexible } from '@/lib/utils/busqueda-flexible'

// Selección de campos para incluir en relaciones
const incluirRelaciones = {
  pais: true,
  provincia: true,
  localidad: true,
  profesion: true,
  obraSocial: true,
} as const

type PacienteCreateData = Prisma.PacienteUncheckedCreateInput

export type PacienteDuplicadoInfo = {
  id: number
  historiaClinica: number | null
}

export type PacienteCreadoMinimo = {
  id: number
  nombreCompleto: string
}

// ============================================
// REPOSITORIO PACIENTES
// Única capa de acceso a datos. Sin SQL directo.
// ============================================

async function construirDatosCreacionPaciente(
  data: CrearPacienteInput,
  usuarioAlta: string
): Promise<PacienteCreateData> {
  const nombreCompleto = generarNombreCompleto(data.apellido, data.nombre)
  const ahora = new Date()
  const obraSocialCoseguroId = data.obraSocialId ? (data.obraSocialCoseguroId ?? null) : null

  return {
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
    profesionalCabeceraId: data.profesionalCabeceraId ?? null,
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
    planId: null,
    numeroAfiliado: data.numeroAfiliado ?? null,
    obraSocialCoseguroId,
    nombreTutor: data.nombreTutor ?? null,
    telefonoTutor: data.telefonoTutor ?? null,
    empleoTutor: data.empleoTutor ?? null,
    observaciones: data.observaciones ?? null,
    usuarioAlta,
    fechaAlta: ahora,
    fechaModificacion: ahora,
  }
}

export async function crearPaciente(
  data: CrearPacienteInput,
  usuarioAlta: string
): Promise<PacienteConRelaciones> {
  const dataCreate = await construirDatosCreacionPaciente(data, usuarioAlta)

  return prisma.paciente.create({
    data: dataCreate,
    include: incluirRelaciones,
  })
}

export async function crearPacienteMinimo(
  data: CrearPacienteInput,
  usuarioAlta: string
): Promise<PacienteCreadoMinimo> {
  const dataCreate = await construirDatosCreacionPaciente(data, usuarioAlta)

  return prisma.paciente.create({
    data: dataCreate,
    select: {
      id: true,
      nombreCompleto: true,
    },
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

export async function obtenerPacientePorCUIL(
  cuil: string
): Promise<PacienteConRelaciones | null> {
  return prisma.paciente.findFirst({
    where: { cuil: new Prisma.Decimal(cuil) },
    include: incluirRelaciones,
  })
}

export async function obtenerPacienteDuplicadoPorDNI(
  numeroDocumento: number
): Promise<PacienteDuplicadoInfo | null> {
  return prisma.paciente.findUnique({
    where: { numeroDocumento },
    select: {
      id: true,
      historiaClinica: true,
    },
  })
}

export async function obtenerPacienteDuplicadoPorCUIL(
  cuil: string
): Promise<PacienteDuplicadoInfo | null> {
  return prisma.paciente.findFirst({
    where: { cuil: new Prisma.Decimal(cuil) },
    select: {
      id: true,
      historiaClinica: true,
    },
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
  const pacienteActual = await prisma.paciente.findUniqueOrThrow({
    where: { id },
    select: {
      apellido: true,
      nombre: true,
      obraSocialId: true,
      obraSocialCoseguroId: true,
      fechaNacimiento: true,
    },
  })

  const obraSocialIdFinal =
    data.obraSocialId !== undefined
      ? (data.obraSocialId ?? null)
      : pacienteActual.obraSocialId

  const obraSocialCoseguroFinalInput =
    data.obraSocialCoseguroId !== undefined
      ? (data.obraSocialCoseguroId ?? null)
      : pacienteActual.obraSocialCoseguroId

  const obraSocialCoseguroFinal = obraSocialIdFinal ? obraSocialCoseguroFinalInput : null

  const updateData: Record<string, unknown> = {
    fechaModificacion: new Date(),
    planId: null,
  }

  if (data.apellido !== undefined) updateData.apellido = data.apellido.toUpperCase()
  if (data.nombre !== undefined) updateData.nombre = data.nombre
  if (data.apellido !== undefined || data.nombre !== undefined) {
    const apellido = data.apellido?.toUpperCase() ?? pacienteActual.apellido
    const nombre = data.nombre ?? pacienteActual.nombre
    updateData.nombreCompleto = generarNombreCompleto(apellido, nombre)
  }

  const camposDirectos = [
    'tipoDocumento', 'numeroDocumento', 'cuil', 'fechaNacimiento', 'sexo',
    'estadoCivil', 'paisId', 'profesionId', 'profesionalCabeceraId', 'domicilio', 'provinciaId',
    'localidadId', 'barrioId', 'telefonoFijo', 'telefonoLaboral', 'celular1',
    'celular2', 'email', 'obraSocialId', 'numeroAfiliado',
    'nombreTutor', 'telefonoTutor', 'empleoTutor',
    'observaciones',
  ] as const

  for (const campo of camposDirectos) {
    if (data[campo] !== undefined) {
      updateData[campo] = data[campo]
    }
  }

  if (
    data.obraSocialId !== undefined ||
    data.obraSocialCoseguroId !== undefined ||
    obraSocialCoseguroFinal !== pacienteActual.obraSocialCoseguroId
  ) {
    updateData.obraSocialCoseguroId = obraSocialCoseguroFinal
  }

  const fechaNacimientoFinal =
    data.fechaNacimiento !== undefined
      ? (data.fechaNacimiento ?? null)
      : pacienteActual.fechaNacimiento

  return prisma.$transaction(async (tx) => {
    // Registrar en historial antes de actualizar
    await tx.pacienteHistorial.create({
      data: {
        pacienteId: id,
        tipoCambio: 'M',
        usuarioCambio: usuarioModificacion,
        fechaCambio: new Date(),
      },
    })

    const actualizado = await tx.paciente.update({
      where: { id },
      data: updateData,
      include: incluirRelaciones,
    })

    if (data.fechaNacimiento !== undefined) {
      await tx.ingreso.updateMany({
        where: { pacienteId: id },
        data: {
          fechaNacimiento: fechaNacimientoFinal,
        },
      })
    }

    return actualizado
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
      const tokens = obtenerTokensBusquedaFlexible(q)
      const tokensBusqueda = tokens.length > 0 ? tokens : [q.trim()]

      const construirCondicionTexto = (texto: string): Prisma.PacienteWhereInput => ({
        OR: [
          { apellido: { contains: texto, mode: 'insensitive' } },
          { nombre: { contains: texto, mode: 'insensitive' } },
          { nombreCompleto: { contains: texto, mode: 'insensitive' } },
        ],
      })

      where.AND = tokensBusqueda.map((token) => construirCondicionTexto(token))
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

  const idsCoseguro = Array.from(
    new Set(items.map((item) => item.obraSocialCoseguroId).filter((id): id is number => id != null))
  )
  const coseguros = idsCoseguro.length > 0
    ? await prisma.obraSocial.findMany({
      where: { id: { in: idsCoseguro } },
      select: { id: true, nombre: true },
    })
    : []
  const coseguroPorId = new Map(coseguros.map((item) => [item.id, item.nombre]))

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
      obraSocialCoseguroNombre: item.obraSocialCoseguroId
        ? (coseguroPorId.get(item.obraSocialCoseguroId) ?? null)
        : null,
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

