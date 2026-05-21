'use server'

import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import * as service from '../service'
import {
  ActualizarCamaSchema,
  BusquedaInternacionSchema,
  CrearEvolucionSchema,
  CrearMedicacionSchema,
  ActualizarMedicacionSchema,
  CrearDescartableSchema,
  ActualizarDescartableSchema,
  TransferirCamaSchema,
  RegistrarAltaInternacionSchema,
  ActualizarDiagnosticoInternacionSchema,
} from '../schemas'
import type {
  ActualizarCamaInput,
  BusquedaInternacionInput,
  CrearEvolucionInput,
  CrearMedicacionInput,
  ActualizarMedicacionInput,
  CrearDescartableInput,
  ActualizarDescartableInput,
  TransferirCamaInput,
} from '../schemas'
import type {
  CamaConOcupante,
  MapaCamas,
  InternacionListItem,
  InternacionDetalle,
  EvolucionItem,
  MedicacionItem,
  DescartableItem,
  TransferenciaItem,
} from '../types'
import type { Cama } from '@prisma/client'
import type { ResultadoPaginado } from '@/types'

// ============================================
// SERVER ACTIONS — MÓDULO INTERNACIÓN
// ============================================

export async function getMapaCamasAction(): Promise<MapaCamas> {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'INTERNACION', 'LEER')) {
    throw new Error('Sin permisos para consultar el mapa de camas')
  }
  return service.obtenerMapaCamas()
}

export async function getCamasDisponiblesAction(sector?: string): Promise<CamaConOcupante[]> {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'INTERNACION', 'LEER')) {
    throw new Error('Sin permisos para consultar camas')
  }
  return service.obtenerCamasDisponibles(sector)
}

export async function updateEstadoCamaAction(
  id: number,
  data: ActualizarCamaInput
): Promise<Cama> {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR')) {
    throw new Error('Sin permisos para modificar camas')
  }
  const validado = ActualizarCamaSchema.parse(data)
  return service.actualizarEstadoCama(id, validado, usuario.codigoUsuario)
}

export async function getInternacionesActivasAction(
  params: BusquedaInternacionInput
): Promise<ResultadoPaginado<InternacionListItem>> {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'INTERNACION', 'LEER')) {
    throw new Error('Sin permisos para consultar internaciones')
  }
  const validado = BusquedaInternacionSchema.parse(params)
  return service.obtenerInternacionesActivas(validado, usuario.codigoUsuario)
}

export async function getInternacionDetalleAction(id: number): Promise<InternacionDetalle> {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'INTERNACION', 'LEER')) {
    throw new Error('Sin permisos para consultar internaciones')
  }
  return service.obtenerInternacionDetalle(id, usuario.codigoUsuario)
}

// ============================================
// EVOLUCIÓN CLÍNICA
// ============================================

export async function crearEvolucionAction(data: CrearEvolucionInput): Promise<EvolucionItem> {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR')) {
    throw new Error('Sin permisos para registrar evoluciones')
  }
  const validado = CrearEvolucionSchema.parse(data)
  return service.crearEvolucion(validado, usuario.codigoUsuario)
}

// ============================================
// MEDICACIÓN
// ============================================

export async function crearMedicacionAction(data: CrearMedicacionInput): Promise<MedicacionItem> {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR')) {
    throw new Error('Sin permisos para registrar medicaciones')
  }
  const validado = CrearMedicacionSchema.parse(data)
  return service.crearMedicacion(validado, usuario.codigoUsuario)
}

export async function actualizarMedicacionAction(
  id: number,
  data: ActualizarMedicacionInput
): Promise<MedicacionItem> {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR')) {
    throw new Error('Sin permisos para modificar medicaciones')
  }
  const validado = ActualizarMedicacionSchema.parse(data)
  return service.actualizarMedicacion(id, validado, usuario.codigoUsuario)
}

export async function crearDescartableAction(data: CrearDescartableInput): Promise<DescartableItem> {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR')) {
    throw new Error('Sin permisos para registrar descartables')
  }
  const validado = CrearDescartableSchema.parse(data)
  return service.crearDescartable(validado, usuario.codigoUsuario)
}

export async function actualizarDescartableAction(
  id: number,
  data: ActualizarDescartableInput
): Promise<DescartableItem> {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR')) {
    throw new Error('Sin permisos para modificar descartables')
  }
  const validado = ActualizarDescartableSchema.parse(data)
  return service.actualizarDescartable(id, validado, usuario.codigoUsuario)
}

// ============================================
// TRANSFERENCIA DE CAMA
// ============================================

export async function transferirCamaAction(data: TransferirCamaInput): Promise<TransferenciaItem> {
  const usuario = await getUsuarioSesion()
  const puedeCambiarCama =
    tienePermiso(usuario.rol, 'INTERNACION', 'CREAR') ||
    tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR')
  if (!puedeCambiarCama) {
    throw new Error('Sin permisos para transferir camas')
  }
  const validado = TransferirCamaSchema.parse(data)
  return service.transferirCama(validado, usuario.codigoUsuario)
}

export async function actualizarDiagnosticoInternacionAction(
  data: import('../schemas').ActualizarDiagnosticoInternacionInput
) {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR')) {
    throw new Error('Sin permisos para modificar diagnósticos')
  }
  const validado = ActualizarDiagnosticoInternacionSchema.parse(data)
  return service.actualizarDiagnosticoInternacion(validado, usuario.codigoUsuario)
}

export async function registrarAltaInternacionAction(
  data: import('../schemas').RegistrarAltaInternacionInput
) {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR')) {
    throw new Error('Sin permisos para registrar altas')
  }
  const validado = RegistrarAltaInternacionSchema.parse(data)
  return service.registrarAltaInternacion(validado, usuario.codigoUsuario)
}

