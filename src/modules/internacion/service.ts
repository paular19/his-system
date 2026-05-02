import { registrarAudit } from '@/lib/security/audit'
import * as repo from './repository'
import type {
  ActualizarCamaInput,
  BusquedaInternacionInput,
  CrearEvolucionInput,
  CrearMedicacionInput,
  ActualizarMedicacionInput,
  TransferirCamaInput,
  CrearPracticaInput,
} from './schemas'
import type {
  CamaConOcupante,
  MapaCamas,
  InternacionListItem,
  InternacionDetalle,
  EvolucionItem,
  MedicacionItem,
  TransferenciaItem,
  PracticaItem,
} from './types'
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

export async function obtenerInternacionDetalle(
  id: number,
  usuario: string,
  ip?: string
): Promise<InternacionDetalle> {
  const detalle = await repo.obtenerInternacionDetalle(id)
  if (!detalle) throw new Error(`Internación con ID ${id} no encontrada`)

  await registrarAudit({
    usuario,
    accion: 'CONSULTAR',
    entidad: 'Internacion',
    registroId: id,
    detalle: `Consulta detalle internación INT-${detalle.numeroIngreso}`,
    direccionIp: ip,
  })

  return detalle
}

// ============================================
// EVOLUCIÓN CLÍNICA
// ============================================

export async function crearEvolucion(
  data: CrearEvolucionInput,
  usuario: string,
  ip?: string
): Promise<EvolucionItem> {
  const ev = await repo.crearEvolucion(data, usuario)

  await registrarAudit({
    usuario,
    accion: 'CREAR',
    entidad: 'EvolucionIngreso',
    registroId: ev.id,
    detalle: `Evolución [${data.tipo}] registrada en internación ${data.ingresoId}`,
    direccionIp: ip,
  })

  return ev
}

// ============================================
// MEDICACIÓN
// ============================================

export async function crearMedicacion(
  data: CrearMedicacionInput,
  usuario: string,
  ip?: string
): Promise<MedicacionItem> {
  const med = await repo.crearMedicacion(data, usuario)

  await registrarAudit({
    usuario,
    accion: 'CREAR',
    entidad: 'MedicacionIngreso',
    registroId: med.id,
    detalle: `Medicación "${data.nombre}" registrada en internación ${data.ingresoId}`,
    direccionIp: ip,
  })

  return med
}

export async function actualizarMedicacion(
  id: number,
  data: ActualizarMedicacionInput,
  usuario: string,
  ip?: string
): Promise<MedicacionItem> {
  const med = await repo.actualizarMedicacion(id, data, usuario)

  await registrarAudit({
    usuario,
    accion: 'MODIFICAR',
    entidad: 'MedicacionIngreso',
    registroId: id,
    detalle: `Medicación ${id} → estado ${data.estado}`,
    direccionIp: ip,
  })

  return med
}

// ============================================
// TRANSFERENCIA DE CAMA
// ============================================

export async function transferirCama(
  data: TransferirCamaInput,
  usuario: string,
  ip?: string
): Promise<TransferenciaItem> {
  const transferencia = await repo.transferirCama(data, usuario)

  await registrarAudit({
    usuario,
    accion: 'MODIFICAR',
    entidad: 'TransferenciaIngreso',
    registroId: transferencia.id,
    detalle: `Transferencia: cama ${transferencia.camaOrigen?.identificador ?? 'N/A'} → ${transferencia.camaDestino.identificador}`,
    direccionIp: ip,
  })

  return transferencia
}

// ============================================
// PRÁCTICAS
// ============================================

export async function crearPractica(
  data: CrearPracticaInput,
  usuario: string,
  ip?: string
): Promise<PracticaItem> {
  const practica = await repo.crearPractica(data, usuario)

  await registrarAudit({
    usuario,
    accion: 'CREAR',
    entidad: 'Practica',
    registroId: practica.id,
    detalle: `Práctica "${data.codigoPractica}" registrada en internación ${data.ingresoId}`,
    direccionIp: ip,
  })

  return practica
}

