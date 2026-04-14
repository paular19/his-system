import { registrarAudit } from '@/lib/security/audit'
import * as repo from './repository'
import type { CrearPacienteInput, ActualizarPacienteInput, BusquedaPacienteInput } from './schemas'
import type { PacienteConRelaciones, PacienteBusqueda } from './types'
import type { ResultadoPaginado } from '@/types'

// ============================================
// SERVICIO PACIENTES
// Lógica de negocio + auditoría
// ============================================

export async function crearPaciente(
  data: CrearPacienteInput,
  usuario: string,
  ip?: string
): Promise<PacienteConRelaciones> {
  // Verificar duplicado por DNI si se provee
  if (data.numeroDocumento) {
    const existente = await repo.obtenerPacientePorDNI(data.numeroDocumento)
    if (existente) {
      throw new Error(
        `Ya existe un paciente con DNI ${data.numeroDocumento} (HC: ${existente.historiaClinica ?? 'sin HC'})`
      )
    }
  }

  const paciente = await repo.crearPaciente(data, usuario)

  await registrarAudit({
    usuario,
    accion: 'CREAR',
    entidad: 'Paciente',
    registroId: paciente.id,
    detalle: `Paciente creado: ${paciente.nombreCompleto}`,
    direccionIp: ip,
  })

  return paciente
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
    const conMismoDni = await repo.obtenerPacientePorDNI(data.numeroDocumento)
    if (conMismoDni && conMismoDni.id !== id) {
      throw new Error(`Ya existe un paciente con DNI ${data.numeroDocumento}`)
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
