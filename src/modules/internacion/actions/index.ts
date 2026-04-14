'use server'

import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import * as service from '../service'
import { ActualizarCamaSchema, BusquedaInternacionSchema } from '../schemas'
import type { ActualizarCamaInput, BusquedaInternacionInput } from '../schemas'
import type { CamaConOcupante, MapaCamas, InternacionListItem } from '../types'
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
