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
import type { IngresoDetalle, IngresoListItem } from '../types'
import type { IngresoPatologia, MovimientoIngreso } from '@prisma/client'
import type { ResultadoPaginado } from '@/types'
import { filtrarObrasSocialesPrincipales } from '@/lib/utils/coseguros'
import { prisma } from '@/lib/db'
import { generarOrdenesDesdeInternacionAction } from '@/modules/orden/actions'

// ============================================
// SERVER ACTIONS — MÓDULO ADMISIÓN
// ============================================

export async function createIngresoAction(
  data: CrearIngresoInput
): Promise<
  | { id: number; ordenesGeneradas?: Array<{ puestoNumero: number; numero: number }> }
  | { error: string }
> {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'ADMISION', 'CREAR')) {
    return { error: 'Sin permisos para crear ingresos' }
  }

  const validado = CrearIngresoSchema.safeParse(data)
  if (!validado.success) {
    return {
      error: validado.error.errors[0]?.message ?? 'Datos invalidos para crear el ingreso',
    }
  }

  try {
    const ingreso = await service.crearIngreso(validado.data, usuario.codigoUsuario)

    const respuesta: { id: number; ordenesGeneradas?: Array<{ puestoNumero: number; numero: number }> } = {
      id: ingreso.id,
    }

    const tienePracticas = Array.isArray(validado.data.practicas) && validado.data.practicas.length > 0
    const puedeGenerarOrdenes = tienePermiso(usuario.rol, 'AMBULATORIO', 'CREAR')

    if (validado.data.tipoIngresoCodigo === 'AMB' && tienePracticas && puedeGenerarOrdenes) {
      const practicasPendientes = await prisma.practica.findMany({
        where: {
          ingresoId: ingreso.id,
          NOT: { estado: 'X' },
          ordenPractica: {
            none: {
              orden: {
                estado: { not: 'X' },
              },
            },
          },
        },
        select: { id: true },
        orderBy: { id: 'asc' },
      })

      const practicaIds = practicasPendientes.map((p) => p.id)
      if (practicaIds.length > 0) {
        const ordenesResult = await generarOrdenesDesdeInternacionAction({
          ingresoId: ingreso.id,
          practicaIds,
          separarPorPractica: Boolean(validado.data.generarOrdenesSeparadasPorPractica),
        })

        if ('ok' in ordenesResult && ordenesResult.ok) {
          respuesta.ordenesGeneradas = (ordenesResult.ordenesPorGrupo ?? [])
            .map((orden) => ({
              puestoNumero: Number(orden.puestoNumero),
              numero: Number(orden.numero),
            }))
            .filter((orden) => orden.puestoNumero > 0 && orden.numero > 0)
        } else if ('error' in ordenesResult && ordenesResult.error) {
          console.error('[ADMISION] No se pudieron generar ordenes automáticas en createIngresoAction:', ordenesResult.error)
        }
      }
    }

    return respuesta
  } catch (error) {
    console.error('[ADMISION] Error creando ingreso desde server action', error)
    return {
      error:
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'No se pudo crear el ingreso',
    }
  }
}

export async function updateIngresoAction(
  id: number,
  data: ActualizarIngresoInput
): Promise<void> {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'ADMISION', 'MODIFICAR')) {
    throw new Error('Sin permisos para modificar ingresos')
  }
  const validado = ActualizarIngresoSchema.parse(data)
  await service.actualizarIngreso(id, validado, usuario.codigoUsuario)
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

export async function getProfesionalesAction(): Promise<{ id: number; nombre: string; matricula: number | null }[]> {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'ADMISION', 'LEER')) {
    throw new Error('Sin permisos para consultar profesionales')
  }
  const { prisma } = await import('@/lib/db')
  return prisma.profesional.findMany({
    where: { estado: 'A' },
    select: { id: true, nombre: true, matricula: true },
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
  const rows = await prisma.obraSocial.findMany({
    where: { estado: 'A' },
    select: { id: true, nombre: true },
    orderBy: { nombre: 'asc' },
  })
  return filtrarObrasSocialesPrincipales(rows)
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
