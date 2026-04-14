import { prisma } from '@/lib/db'
import type { Cama } from '@prisma/client'
import type {
  CamaConOcupante,
  MapaCamas,
  DisponibilidadSector,
  InternacionListItem,
} from './types'
import { SECTOR_CAMA, SECTOR_LABEL } from './types'
import type { ActualizarCamaInput, BusquedaInternacionInput } from './schemas'
import type { ResultadoPaginado } from '@/types'

// ============================================
// REPOSITORIO INTERNACIÓN
// ============================================

async function mapearCamaConOcupante(
  cama: Cama & {
    ingresos: Array<{
      id: number
      numeroIngreso: number
      nombre: string | null
      fechaIngreso: Date | null
    }>
  }
): Promise<CamaConOcupante> {
  const ingreso = cama.ingresos[0]
  return {
    ...cama,
    ocupante: ingreso
      ? {
          ingresoId: ingreso.id,
          numeroIngreso: ingreso.numeroIngreso,
          nombre: ingreso.nombre ?? 'Sin nombre',
          fechaIngreso: ingreso.fechaIngreso,
        }
      : null,
  }
}

export async function obtenerTodasLasCamas(): Promise<CamaConOcupante[]> {
  const camas = await prisma.cama.findMany({
    include: {
      ingresos: {
        where: { estado: 'A', tipoIngresoCodigo: 'INT' },
        select: {
          id: true,
          numeroIngreso: true,
          nombre: true,
          fechaIngreso: true,
        },
        take: 1,
        orderBy: { fechaIngreso: 'desc' },
      },
    },
    orderBy: [{ sector: 'asc' }, { identificador: 'asc' }],
  })

  return Promise.all(camas.map(mapearCamaConOcupante))
}

export async function obtenerMapaCamas(): Promise<MapaCamas> {
  const todasLasCamas = await obtenerTodasLasCamas()

  const sectores: DisponibilidadSector[] = Object.values(SECTOR_CAMA).map((sectorValue) => {
    const camasDelSector = todasLasCamas.filter((c) => c.sector === sectorValue)
    return {
      sector: sectorValue,
      label: SECTOR_LABEL[sectorValue] ?? sectorValue,
      total: camasDelSector.length,
      disponibles: camasDelSector.filter((c) => c.estado === 'DISPONIBLE').length,
      ocupadas: camasDelSector.filter((c) => c.estado === 'OCUPADA').length,
      reservadas: camasDelSector.filter((c) => c.estado === 'RESERVADA').length,
      mantenimiento: camasDelSector.filter((c) => c.estado === 'MANTENIMIENTO').length,
      camas: camasDelSector,
    }
  })

  const totales = {
    total: todasLasCamas.length,
    disponibles: todasLasCamas.filter((c) => c.estado === 'DISPONIBLE').length,
    ocupadas: todasLasCamas.filter((c) => c.estado === 'OCUPADA').length,
    reservadas: todasLasCamas.filter((c) => c.estado === 'RESERVADA').length,
    mantenimiento: todasLasCamas.filter((c) => c.estado === 'MANTENIMIENTO').length,
  }

  return { sectores, totales }
}

export async function obtenerCamaPorId(id: number): Promise<CamaConOcupante | null> {
  const cama = await prisma.cama.findUnique({
    where: { id },
    include: {
      ingresos: {
        where: { estado: 'A', tipoIngresoCodigo: 'INT' },
        select: {
          id: true,
          numeroIngreso: true,
          nombre: true,
          fechaIngreso: true,
        },
        take: 1,
        orderBy: { fechaIngreso: 'desc' },
      },
    },
  })

  if (!cama) return null
  return mapearCamaConOcupante(cama)
}

export async function obtenerCamasDisponibles(sector?: string): Promise<CamaConOcupante[]> {
  const todas = await obtenerTodasLasCamas()
  return todas.filter((c) => c.estado === 'DISPONIBLE' && (!sector || c.sector === sector))
}

export async function actualizarEstadoCama(
  id: number,
  data: ActualizarCamaInput,
  usuario: string
): Promise<Cama> {
  return prisma.cama.update({
    where: { id },
    data: {
      estado: data.estado,
      observaciones: data.observaciones ?? null,
      usuario,
      fechaEstado: new Date(),
    },
  })
}

export async function obtenerInternacionesActivas(
  params: BusquedaInternacionInput
): Promise<ResultadoPaginado<InternacionListItem>> {
  const { pagina, porPagina, q, sector } = params
  const skip = (pagina - 1) * porPagina

  type WhereClause = Parameters<typeof prisma.ingreso.findMany>[0] extends { where?: infer W }
    ? W
    : never

  const where: WhereClause = {
    tipoIngresoCodigo: 'INT',
    estado: 'A',
  }

  if (sector) {
    where.cama = { sector }
  }

  if (q) {
    const esNumerico = /^\d+$/.test(q)
    if (esNumerico) {
      const num = parseInt(q, 10)
      where.OR = [
        { numeroIngreso: num },
        { nombre: { contains: q, mode: 'insensitive' } },
        { paciente: { numeroDocumento: num } },
      ]
    } else {
      where.OR = [
        { nombre: { contains: q, mode: 'insensitive' } },
        { paciente: { nombreCompleto: { contains: q, mode: 'insensitive' } } },
      ]
    }
  }

  const [total, items] = await prisma.$transaction([
    prisma.ingreso.count({ where }),
    prisma.ingreso.findMany({
      where,
      select: {
        id: true,
        numeroIngreso: true,
        nombre: true,
        fechaIngreso: true,
        fechaEgresoPrevista: true,
        estado: true,
        cama: {
          select: { id: true, identificador: true, sector: true, habitacion: true },
        },
        paciente: {
          select: { id: true, nombreCompleto: true, numeroDocumento: true },
        },
        profesionalTratante: {
          select: { id: true, nombre: true },
        },
      },
      orderBy: { fechaIngreso: 'desc' },
      skip,
      take: porPagina,
    }),
  ])

  return {
    items: items as InternacionListItem[],
    paginacion: {
      pagina,
      porPagina,
      total,
      totalPaginas: Math.ceil(total / porPagina),
    },
  }
}
