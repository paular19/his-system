'use server'

import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import * as service from '../service'
import {
  CrearIngresoSchema,
  ActualizarIngresoSchema,
  BusquedaIngresoSchema,
  DiagnosticoIngresoSchema,
  MovimientoIngresoSchema,
} from '../schemas'
import type {
  CrearIngresoInput,
  ActualizarIngresoInput,
  BusquedaIngresoInput,
  DiagnosticoIngresoInput,
  MovimientoIngresoInput,
} from '../schemas'
import type { IngresoConRelaciones, IngresoDetalle, IngresoListItem } from '../types'
import type { IngresoPatologia, MovimientoIngreso } from '@prisma/client'
import type { ResultadoPaginado } from '@/types'

// ============================================
// SERVER ACTIONS — MÓDULO ADMISIÓN
// ============================================

export async function createIngresoAction(
  data: CrearIngresoInput
): Promise<IngresoConRelaciones> {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'ADMISION', 'CREAR')) {
    throw new Error('Sin permisos para crear ingresos')
  }
  const validado = CrearIngresoSchema.parse(data)
  return service.crearIngreso(validado, usuario.codigoUsuario)
}

export async function updateIngresoAction(
  id: number,
  data: ActualizarIngresoInput
): Promise<IngresoConRelaciones> {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'ADMISION', 'MODIFICAR')) {
    throw new Error('Sin permisos para modificar ingresos')
  }
  const validado = ActualizarIngresoSchema.parse(data)
  return service.actualizarIngreso(id, validado, usuario.codigoUsuario)
}

export async function getIngresoByIdAction(id: number): Promise<IngresoDetalle> {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'ADMISION', 'LEER')) {
    throw new Error('Sin permisos para consultar ingresos')
  }
  return service.obtenerIngreso(id, usuario.clerkId)
}

export async function searchIngresosAction(
  params: BusquedaIngresoInput
): Promise<ResultadoPaginado<IngresoListItem>> {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'ADMISION', 'LEER')) {
    throw new Error('Sin permisos para buscar ingresos')
  }
  const validado = BusquedaIngresoSchema.parse(params)
  return service.buscarIngresos(validado)
}

export async function registrarDiagnosticoAction(
  data: DiagnosticoIngresoInput
): Promise<IngresoPatologia> {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'ADMISION', 'CREAR')) {
    throw new Error('Sin permisos para registrar diagnósticos')
  }
  const validado = DiagnosticoIngresoSchema.parse(data)
  return service.registrarDiagnostico(validado, usuario.codigoUsuario)
}

export async function registrarMovimientoAction(
  data: MovimientoIngresoInput
): Promise<MovimientoIngreso> {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'ADMISION', 'CREAR')) {
    throw new Error('Sin permisos para registrar movimientos')
  }
  const validado = MovimientoIngresoSchema.parse(data)
  return service.registrarMovimiento(validado, usuario.codigoUsuario)
}

export async function getProfesionalesAction(): Promise<{ id: number; nombre: string }[]> {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'ADMISION', 'LEER')) {
    throw new Error('Sin permisos para consultar profesionales')
  }
  const { prisma } = await import('@/lib/db')
  return prisma.profesional.findMany({
    where: { estado: 'A' },
    select: { id: true, nombre: true },
    orderBy: { nombre: 'asc' },
  })
}

export async function getMotivosEgresoAction(): Promise<{ codigo: string; descripcion: string }[]> {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'ADMISION', 'LEER')) {
    throw new Error('Sin permisos para consultar motivos de egreso')
  }
  const { prisma } = await import('@/lib/db')
  return prisma.motivoEgreso.findMany({
    select: { codigo: true, descripcion: true },
    orderBy: { descripcion: 'asc' },
  })
}

export async function getObrasSocialesAction(): Promise<{ id: number; nombre: string }[]> {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'ADMISION', 'LEER')) {
    throw new Error('Sin permisos para consultar obras sociales')
  }
  const { prisma } = await import('@/lib/db')
  return prisma.obraSocial.findMany({
    where: { estado: 'A' },
    select: { id: true, nombre: true },
    orderBy: { nombre: 'asc' },
  })
}

export async function getPlanesAction(): Promise<{ id: number; nombre: string; obraSocialId: number | null }[]> {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'ADMISION', 'LEER')) {
    throw new Error('Sin permisos para consultar planes')
  }
  const { prisma } = await import('@/lib/db')
  const planes = await prisma.planObraSocial.findMany({
    select: { id: true, descripcion: true, obraSocialId: true },
    orderBy: { descripcion: 'asc' },
  })
  return planes.map(p => ({ id: p.id, nombre: p.descripcion, obraSocialId: p.obraSocialId }))
}
