import { registrarAudit } from '@/lib/security/audit'
import * as repo from './repository'
import type {
  ActualizarCamaInput,
  BusquedaInternacionInput,
  ActualizarTratanteInternacionInput,
  CrearEvolucionInput,
  CrearMedicacionInput,
  ActualizarMedicacionInput,
  CrearDescartableInput,
  ActualizarDescartableInput,
  TransferirCamaInput,
  CrearPracticaInput,
  RegistrarAltaInternacionInput,
  ActualizarDiagnosticoInternacionInput,
  CrearCirugiaUrgenciaInput,
} from './schemas'
import type {
  CamaConOcupante,
  MapaCamas,
  InternacionListItem,
  InternacionDetalle,
  EvolucionItem,
  MedicacionItem,
  DescartableItem,
  TransferenciaItem,
  PracticaItem,
  CirugiaUrgenciaItem,
} from './types'
import type { Cama } from '@prisma/client'
import type { ResultadoPaginado } from '@/types'

// ============================================
// SERVICIO INTERNACIÓN
// Lógica de negocio + auditoría
// ============================================

export async function obtenerMapaCamas(fechaReferencia?: Date): Promise<MapaCamas> {
  return repo.obtenerMapaCamas(fechaReferencia)
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

export async function actualizarTratanteInternacion(
  data: ActualizarTratanteInternacionInput,
  usuario: string,
  ip?: string
) {
  const resultado = await repo.actualizarProfesionalTratanteInternacion(
    data.ingresoId,
    data.profesionalTratanteId,
    usuario
  )

  if (resultado.actualizado) {
    await registrarAudit({
      usuario,
      accion: 'MODIFICAR',
      entidad: 'Ingreso',
      registroId: data.ingresoId,
      detalle: `Médico tratante actualizado: ${resultado.anterior?.nombre ?? 'Sin tratante'} (${resultado.anterior?.id ?? 'N/A'}) → ${resultado.nuevo.nombre} (ID ${resultado.nuevo.id})`,
      direccionIp: ip,
    })
  }

  return resultado
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

export async function crearDescartable(
  data: CrearDescartableInput,
  usuario: string,
  ip?: string
): Promise<DescartableItem> {
  const descartable = await repo.crearDescartable(data, usuario)

  await registrarAudit({
    usuario,
    accion: 'CREAR',
    entidad: 'DescartableIngreso',
    registroId: descartable.id,
    detalle: `Descartable "${data.nombre}" registrado en internación ${data.ingresoId}`,
    direccionIp: ip,
  })

  return descartable
}

export async function actualizarDescartable(
  id: number,
  data: ActualizarDescartableInput,
  usuario: string,
  ip?: string
): Promise<DescartableItem> {
  const descartable = await repo.actualizarDescartable(id, data, usuario)

  await registrarAudit({
    usuario,
    accion: 'MODIFICAR',
    entidad: 'DescartableIngreso',
    registroId: id,
    detalle: `Descartable ${id} → estado ${data.estado}`,
    direccionIp: ip,
  })

  return descartable
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

export async function crearCirugiaUrgencia(
  data: CrearCirugiaUrgenciaInput,
  usuario: string,
  ip?: string
): Promise<CirugiaUrgenciaItem> {
  const cirugia = await repo.crearCirugiaUrgencia(data, usuario)

  await registrarAudit({
    usuario,
    accion: 'CREAR',
    entidad: 'CirugiaProgramada',
    registroId: cirugia.id,
    detalle: `Cirugía de urgencia registrada en internación ${data.ingresoId}`,
    direccionIp: ip,
  })

  return cirugia
}

// ============================================
// DIAGNÓSTICOS
// ============================================

export async function actualizarDiagnosticoInternacion(
  data: ActualizarDiagnosticoInternacionInput,
  usuario: string,
  ip?: string
) {
  const diagnostico = await repo.actualizarDiagnosticoInternacion(data, usuario)

  await registrarAudit({
    usuario,
    accion: 'MODIFICAR',
    entidad: 'IngresoPatologia',
    registroId: diagnostico.id,
    detalle: `Diagnóstico ${diagnostico.id} actualizado en internación ${data.ingresoId}`,
    direccionIp: ip,
  })

  return diagnostico
}

// ============================================
// ALTA DE INTERNACIÓN
// ============================================

export async function registrarAltaInternacion(
  data: RegistrarAltaInternacionInput,
  usuario: string,
  ip?: string
) {
  const alta = await repo.registrarAltaInternacion(data, usuario)

  await registrarAudit({
    usuario,
    accion: 'MODIFICAR',
    entidad: 'Ingreso',
    registroId: data.ingresoId,
    detalle: `Alta registrada para internación ${data.ingresoId}`,
    direccionIp: ip,
  })

  return alta
}

