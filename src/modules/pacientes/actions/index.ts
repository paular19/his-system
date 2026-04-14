'use server'

import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import * as service from '../service'
import {
  CrearPacienteSchema,
  ActualizarPacienteSchema,
  BusquedaPacienteSchema,
} from '../schemas'
import type { CrearPacienteInput, ActualizarPacienteInput, BusquedaPacienteInput } from '../schemas'
import type { PacienteConRelaciones, PacienteBusqueda } from '../types'
import type { ResultadoPaginado } from '@/types'

// ============================================
// SERVER ACTIONS - MÓDULO PACIENTES
// Validación de auth + permisos + servicio
// ============================================

export async function crearPacienteAction(
  data: CrearPacienteInput
): Promise<PacienteConRelaciones> {
  const usuario = await getUsuarioSesion()

  if (!tienePermiso(usuario.rol, 'PACIENTES', 'CREAR')) {
    throw new Error('Sin permisos para crear pacientes')
  }

  const validado = CrearPacienteSchema.parse(data)
  return service.crearPaciente(validado, usuario.codigoUsuario)
}

export async function actualizarPacienteAction(
  id: number,
  data: ActualizarPacienteInput
): Promise<PacienteConRelaciones> {
  const usuario = await getUsuarioSesion()

  if (!tienePermiso(usuario.rol, 'PACIENTES', 'MODIFICAR')) {
    throw new Error('Sin permisos para modificar pacientes')
  }

  const validado = ActualizarPacienteSchema.parse(data)
  return service.actualizarPaciente(id, validado, usuario.codigoUsuario)
}

export async function getPacienteByIdAction(
  id: number
): Promise<PacienteConRelaciones> {
  const usuario = await getUsuarioSesion()

  if (!tienePermiso(usuario.rol, 'PACIENTES', 'LEER')) {
    throw new Error('Sin permisos para consultar pacientes')
  }

  return service.obtenerPaciente(id, usuario.clerkId)
}

export async function searchPacientesAction(
  params: BusquedaPacienteInput
): Promise<ResultadoPaginado<PacienteBusqueda>> {
  const usuario = await getUsuarioSesion()

  if (!tienePermiso(usuario.rol, 'PACIENTES', 'LEER')) {
    throw new Error('Sin permisos para buscar pacientes')
  }

  const validado = BusquedaPacienteSchema.parse(params)
  return service.buscarPacientes(validado)
}
