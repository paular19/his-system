import { registrarAudit } from '@/lib/security/audit'
import * as repo from './repository'
import { Prisma } from '@prisma/client'
import type { CrearPacienteInput, ActualizarPacienteInput, BusquedaPacienteInput } from './schemas'
import type { PacienteConRelaciones, PacienteBusqueda } from './types'
import type { ResultadoPaginado } from '@/types'

// ============================================
// SERVICIO PACIENTES
// Lógica de negocio + auditoría
// ============================================

type PacienteCreadoRapido = {
  id: number
}

async function validarDuplicadoCuilParaCreacion(data: CrearPacienteInput): Promise<void> {
  // CUIL no es unico en schema Prisma; se valida explicitamente solo si llega en payload.
  if (data.cuil) {
    const existente = await repo.obtenerPacienteDuplicadoPorCUIL(data.cuil)
    if (existente) {
      throw new Error(
        `Ya existe un paciente con CUIL ${data.cuil} (HC: ${existente.historiaClinica ?? 'sin HC'})`
      )
    }
  }
}

function mapearErrorCreacionPaciente(
  error: unknown,
  data: CrearPacienteInput
): Error {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return error instanceof Error ? error : new Error('Error inesperado')
  }

  if (error.code !== 'P2002') {
    return error
  }

  const targetRaw = error.meta?.target
  const target =
    Array.isArray(targetRaw) ? targetRaw.join(',') : String(targetRaw ?? '')

  if (/numeroDocumento|pacnrodoc|documento/i.test(target)) {
    return new Error(`Ya existe un paciente con DNI ${data.numeroDocumento}`)
  }

  return new Error('Ya existe un paciente con un dato unico ya registrado')
}

export async function crearPaciente(
  data: CrearPacienteInput,
  usuario: string,
  ip?: string
): Promise<PacienteConRelaciones> {
  await validarDuplicadoCuilParaCreacion(data)

  let paciente: PacienteConRelaciones
  try {
    paciente = await repo.crearPaciente(data, usuario)
  } catch (error) {
    throw mapearErrorCreacionPaciente(error, data)
  }

  void registrarAudit({
    usuario,
    accion: 'CREAR',
    entidad: 'Paciente',
    registroId: paciente.id,
    detalle: `Paciente creado: ${paciente.nombreCompleto}`,
    direccionIp: ip,
  })

  return paciente
}

export async function crearPacienteRapido(
  data: CrearPacienteInput,
  usuario: string,
  ip?: string
): Promise<PacienteCreadoRapido> {
  await validarDuplicadoCuilParaCreacion(data)

  let paciente: repo.PacienteCreadoMinimo
  try {
    paciente = await repo.crearPacienteMinimo(data, usuario)
  } catch (error) {
    throw mapearErrorCreacionPaciente(error, data)
  }

  void registrarAudit({
    usuario,
    accion: 'CREAR',
    entidad: 'Paciente',
    registroId: paciente.id,
    detalle: `Paciente creado: ${paciente.nombreCompleto}`,
    direccionIp: ip,
  })

  return { id: paciente.id }
}

export async function obtenerPaciente(
  id: number,
  usuario: string,
  ip?: string
): Promise<PacienteConRelaciones> {
  const paciente = await repo.obtenerPacientePorId(id)

  if (!paciente) {
    throw new Error(`Paciente con ID ${id} no encontrado`)
  }

  await registrarAudit({
    usuario,
    accion: 'CONSULTAR',
    entidad: 'Paciente',
    registroId: id,
    direccionIp: ip,
  })

  return paciente
}

export async function actualizarPaciente(
  id: number,
  data: ActualizarPacienteInput,
  usuario: string,
  ip?: string
): Promise<PacienteConRelaciones> {
  const existe = await repo.obtenerPacientePorId(id)
  if (!existe) {
    throw new Error(`Paciente con ID ${id} no encontrado`)
  }

  // Si se cambia el DNI, verificar que no esté en uso
  if (data.numeroDocumento && data.numeroDocumento !== existe.numeroDocumento) {
    const conMismoDni = await repo.obtenerPacienteDuplicadoPorDNI(data.numeroDocumento)
    if (conMismoDni && conMismoDni.id !== id) {
      throw new Error(`Ya existe un paciente con DNI ${data.numeroDocumento}`)
    }
  }

  // Si se cambia el CUIL, verificar que no esté en uso
  const cuilActual = existe.cuil?.toString() ?? null
  if (data.cuil && data.cuil !== cuilActual) {
    const conMismoCuil = await repo.obtenerPacienteDuplicadoPorCUIL(data.cuil)
    if (conMismoCuil && conMismoCuil.id !== id) {
      throw new Error(`Ya existe un paciente con CUIL ${data.cuil}`)
    }
  }

  const actualizado = await repo.actualizarPaciente(id, data, usuario)

  await registrarAudit({
    usuario,
    accion: 'MODIFICAR',
    entidad: 'Paciente',
    registroId: id,
    detalle: `Paciente modificado: ${actualizado.nombreCompleto}`,
    direccionIp: ip,
  })

  return actualizado
}

export async function buscarPacientes(
  params: BusquedaPacienteInput
): Promise<ResultadoPaginado<PacienteBusqueda>> {
  return repo.buscarPacientes(params)
}

export async function buscarPorDNI(
  numeroDocumento: number
): Promise<PacienteConRelaciones | null> {
  return repo.obtenerPacientePorDNI(numeroDocumento)
}

export async function buscarPorHC(
  historiaClinica: number
): Promise<PacienteConRelaciones | null> {
  return repo.obtenerPacientePorHC(historiaClinica)
}
