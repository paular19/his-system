import { prisma } from '@/lib/db'
import { registrarAudit } from '@/lib/security/audit'
import * as repo from './repository'
import type {
  CrearIngresoInput,
  ActualizarIngresoInput,
  BusquedaIngresoInput,
  DiagnosticoIngresoInput,
  MovimientoIngresoInput,
} from './schemas'
import type { IngresoConRelaciones, IngresoDetalle, IngresoListItem } from './types'
import type { IngresoPatologia, MovimientoIngreso } from '@prisma/client'
import type { ResultadoPaginado } from '@/types'

// ============================================
// SERVICIO ADMISIÓN
// Lógica de negocio + auditoría
// ============================================

export async function crearIngreso(
  data: CrearIngresoInput,
  usuario: string,
  ip?: string
): Promise<IngresoConRelaciones> {
  // Verificar que el paciente existe
  const paciente = await prisma.paciente.findUnique({
    where: { id: data.pacienteId },
  })
  if (!paciente) {
    throw new Error(`Paciente con ID ${data.pacienteId} no encontrado`)
  }

  // Verificar que el tipo de ingreso existe
  const tipoIngreso = await prisma.tipoIngreso.findUnique({
    where: { codigo: data.tipoIngresoCodigo },
  })
  if (!tipoIngreso) {
    throw new Error(`Tipo de ingreso "${data.tipoIngresoCodigo}" no válido`)
  }

  // Verificar que el subtipo de admisión existe (solo si se envió)
  if (data.subtipoAdmisionCodigo && data.subtipoAdmisionCodigo.trim() !== '') {
    const subtipoAdmision = await prisma.subtipoAdmision.findUnique({
      where: { codigo: data.subtipoAdmisionCodigo },
    })
    if (!subtipoAdmision) {
      throw new Error(`Subtipo de admisión "${data.subtipoAdmisionCodigo}" no válido`)
    }
  }

  const ingreso = await repo.crearIngreso(data, paciente, usuario)

  // Auto-generar informe de hospitalización para internaciones
  if (data.tipoIngresoCodigo === 'INT') {
    await prisma.informeHospitalizacion.create({
      data: {
        ingresoId: ingreso.id,
        fecha: new Date(),
        estado: 'A',
        usuario: usuario.slice(0, 10),
        fechaEstado: new Date(),
      },
    })
  }
  // Auto-generar informe ambulatorio para admisiones ambulatorias, derivaciones e indicaciones médicas
  const subtiposInformeAmbulatorio = new Set([
    'RAY',
    'GUA',
    'CUR',
    'SUT',
    'ECG',
    'ECO',
    'DER',
    'TUR',
    // Compatibilidad con códigos anteriores
    'AMB',
    'IND',
    'PAM',
  ])

  if (
    data.tipoIngresoCodigo === 'AMB' &&
    !!data.subtipoAdmisionCodigo &&
    subtiposInformeAmbulatorio.has(data.subtipoAdmisionCodigo)
  ) {
    await prisma.informeAmbulatorio.create({
      data: {
        ingresoId: ingreso.id,
        fecha: new Date(),
        estado: 'A',
        profesionalId: data.profesionalGuardiaId ?? null,
        usuario: usuario.slice(0, 10),
        fechaEstado: new Date(),
      },
    })
  }

  await registrarAudit({
    usuario,
    accion: 'CREAR',
    entidad: 'Ingreso',
    registroId: ingreso.id,
    detalle: `Ingreso ${ingreso.tipoIngresoCodigo}-${ingreso.numeroIngreso} creado para ${paciente.nombreCompleto}`,
    direccionIp: ip,
  })

  // Registrar prácticas al ingreso como entidades reales (no en observaciones)
  if (data.practicas && data.practicas.length > 0) {
    const practicasSinConvenio = data.practicas.filter(
      (p) => !(p.convenioId ?? data.obraSocialId)
    )

    if (practicasSinConvenio.length > 0) {
      throw new Error(
        'No se pudo determinar el convenio de una o más prácticas. Seleccioná una obra social y volvés a intentarlo.'
      )
    }

    await prisma.practica.createMany({
      data: data.practicas.map((p) => ({
        ingresoId: ingreso.id,
        convenioId: (p.convenioId ?? data.obraSocialId) as number,
        codigoPractica: p.codigo.trim().slice(0, 8).padEnd(8, ' '),
        convenioValorId: 0,
        fecha: new Date(),
        cantidad: p.cantidad,
        numeroAutorizacion: null,
        obraSocialId: data.obraSocialId ?? null,
        planId: data.planId ?? null,
        facturable: true,
        estado: 'A',
        usuarioRegistro: usuario.slice(0, 10),
        fechaUsuario: new Date(),
      })),
    })
  }

  // Registrar medicamentos al ingreso si se enviaron
  if (data.medicaciones && data.medicaciones.length > 0) {
    await prisma.medicacionIngreso.createMany({
      data: data.medicaciones.map((m) => ({
        ingresoId: ingreso.id,
        nombre: m.nombre,
        dosis: m.dosis ?? null,
        viaAdministracion: m.viaAdministracion ?? null,
        frecuencia: m.frecuencia ?? null,
        observaciones: m.observaciones ?? null,
        fechaInicio: new Date(),
        estado: 'A',
        usuario: usuario.slice(0, 10),
        fechaEstado: new Date(),
      })),
    })
  }

  return ingreso
}

export async function obtenerIngreso(
  id: number,
  usuario: string,
  ip?: string
): Promise<IngresoDetalle> {
  const ingreso = await repo.obtenerIngresoPorId(id)

  if (!ingreso) {
    throw new Error(`Ingreso con ID ${id} no encontrado`)
  }

  await registrarAudit({
    usuario,
    accion: 'CONSULTAR',
    entidad: 'Ingreso',
    registroId: id,
    direccionIp: ip,
  })

  return ingreso
}

export async function actualizarIngreso(
  id: number,
  data: ActualizarIngresoInput,
  usuario: string,
  ip?: string
): Promise<IngresoConRelaciones> {
  const existe = await repo.obtenerIngresoPorId(id)
  if (!existe) {
    throw new Error(`Ingreso con ID ${id} no encontrado`)
  }

  const actualizado = await repo.actualizarIngreso(id, data, usuario)

  if (data.practicasAgregar && data.practicasAgregar.length > 0) {
    const obraSocialId = data.obraSocialId ?? existe.obraSocialId ?? null
    const planId = data.planId ?? existe.planId ?? null

    const practicasSinConvenio = data.practicasAgregar.filter(
      (p) => !(p.convenioId ?? obraSocialId)
    )

    if (practicasSinConvenio.length > 0) {
      throw new Error(
        'No se pudo determinar el convenio de una o más prácticas. Seleccioná una obra social y volvés a intentarlo.'
      )
    }

    await prisma.practica.createMany({
      data: data.practicasAgregar.map((p) => ({
        ingresoId: id,
        convenioId: (p.convenioId ?? obraSocialId) as number,
        codigoPractica: p.codigo.trim().slice(0, 8).padEnd(8, ' '),
        convenioValorId: 0,
        fecha: new Date(),
        cantidad: p.cantidad,
        numeroAutorizacion: null,
        obraSocialId,
        planId,
        facturable: true,
        estado: 'A',
        usuarioRegistro: usuario.slice(0, 10),
        fechaUsuario: new Date(),
      })),
    })
  }

  await registrarAudit({
    usuario,
    accion: 'MODIFICAR',
    entidad: 'Ingreso',
    registroId: id,
    detalle: `Ingreso ${id} modificado`,
    direccionIp: ip,
  })

  return actualizado
}

export async function buscarIngresos(
  params: BusquedaIngresoInput
): Promise<ResultadoPaginado<IngresoListItem>> {
  return repo.buscarIngresos(params)
}

export async function registrarDiagnostico(
  data: DiagnosticoIngresoInput,
  usuario: string,
  ip?: string
): Promise<IngresoPatologia> {
  const ingreso = await repo.obtenerIngresoPorId(data.ingresoId)
  if (!ingreso) {
    throw new Error(`Ingreso con ID ${data.ingresoId} no encontrado`)
  }
  if (ingreso.estado === 'X' || ingreso.estado === 'E') {
    throw new Error('No se puede registrar diagnóstico en un ingreso finalizado o anulado')
  }

  const diagnostico = await repo.registrarDiagnosticoIngreso(data, usuario)

  await registrarAudit({
    usuario,
    accion: 'CREAR',
    entidad: 'IngresoPatologia',
    registroId: diagnostico.id,
    detalle: `Diagnóstico registrado para ingreso ${data.ingresoId}: ${data.descripcion}`,
    direccionIp: ip,
  })

  return diagnostico
}

export async function registrarMovimiento(
  data: MovimientoIngresoInput,
  usuario: string,
  ip?: string
): Promise<MovimientoIngreso> {
  const ingreso = await repo.obtenerIngresoPorId(data.ingresoId)
  if (!ingreso) {
    throw new Error(`Ingreso con ID ${data.ingresoId} no encontrado`)
  }
  if (ingreso.estado === 'X') {
    throw new Error('No se puede registrar movimiento en un ingreso anulado')
  }

  const movimiento = await repo.registrarMovimientoIngreso(data, usuario)

  await registrarAudit({
    usuario,
    accion: 'CREAR',
    entidad: 'MovimientoIngreso',
    registroId: movimiento.id,
    detalle: `Movimiento ${data.tipoMovimientoCodigo} registrado para ingreso ${data.ingresoId}`,
    direccionIp: ip,
  })

  return movimiento
}
