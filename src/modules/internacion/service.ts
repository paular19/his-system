import { registrarAudit } from '@/lib/security/audit'
import * as repo from './repository'
import type { ActualizarCamaInput, BusquedaInternacionInput } from './schemas'
import type { CamaConOcupante, MapaCamas, InternacionListItem } from './types'
import type { Cama } from '@prisma/client'
import type { ResultadoPaginado } from '@/types'

// ============================================
// SERVICIO INTERNACIÓN
// Lógica de negocio + auditoría
// ============================================

export async function obtenerMapaCamas(): Promise<MapaCamas> {
  return repo.obtenerMapaCamas()
}

export async function obtenerCamasDisponibles(sector?: string): Promise<CamaConOcupante[]> {
  return repo.obtenerCamasDisponibles(sector)
}

export async function obtenerCama(id: number): Promise<CamaConOcupante> {
  const cama = await repo.obtenerCamaPorId(id)
  if (!cama) throw new Error(`Cama con ID ${id} no encontrada`)
  return cama
}

export async function actualizarEstadoCama(
  id: number,
  data: ActualizarCamaInput,
  usuario: string,
  ip?: string
): Promise<Cama> {
  const cama = await repo.obtenerCamaPorId(id)
  if (!cama) throw new Error(`Cama con ID ${id} no encontrada`)

  // Regla: no se puede poner en DISPONIBLE directamente si tiene paciente activo
  if (data.estado === 'DISPONIBLE' && cama.ocupante) {
    throw new Error(
      'No se puede liberar una cama con paciente activo. Primero registre el egreso del ingreso.'
    )
  }

  const actualizada = await repo.actualizarEstadoCama(id, data, usuario)

  await registrarAudit({
    usuario,
    accion: 'MODIFICAR',
    entidad: 'Cama',
    registroId: id,
    detalle: `Cama ${cama.identificador} → ${data.estado}`,
    direccionIp: ip,
  })

  return actualizada
}

export async function obtenerInternacionesActivas(
  params: BusquedaInternacionInput,
  usuario: string,
  ip?: string
): Promise<ResultadoPaginado<InternacionListItem>> {
  await registrarAudit({
    usuario,
    accion: 'CONSULTAR',
    entidad: 'Internacion',
    detalle: 'Consulta internaciones activas',
    direccionIp: ip,
  })

  return repo.obtenerInternacionesActivas(params)
}
