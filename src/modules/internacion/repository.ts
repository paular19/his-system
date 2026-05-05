import { prisma } from '@/lib/db'
import type { Cama, Prisma } from '@prisma/client'
import { calcularImporteFacturable, resolverReglaFacturacion } from '@/modules/facturacion/cobertura'
import { obtenerValorPractica } from '@/modules/facturacion/repository'
import type {
  CamaConOcupante,
  MapaCamas,
  DisponibilidadSector,
  InternacionListItem,
  InternacionDetalle,
  EvolucionItem,
  MedicacionItem,
  TransferenciaItem,
  PracticaItem,
} from './types'
import { SECTOR_CAMA, SECTOR_LABEL } from './types'
import type {
  ActualizarCamaInput,
  BusquedaInternacionInput,
  CrearEvolucionInput,
  CrearMedicacionInput,
  ActualizarMedicacionInput,
  TransferirCamaInput,
  CrearPracticaInput,
} from './schemas'
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

  const where: Prisma.IngresoWhereInput = {
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

// ============================================
// DETALLE DE INTERNACIÓN
// ============================================

export async function obtenerInternacionDetalle(id: number): Promise<InternacionDetalle | null> {
  const ingreso = await prisma.ingreso.findUnique({
    where: { id },
    select: {
      id: true,
      numeroIngreso: true,
      tipoIngresoCodigo: true,
      nombre: true,
      fechaIngreso: true,
      fechaEgresoPrevista: true,
      fechaEgreso: true,
      estado: true,
      descripcionPatologia: true,
      numeroAfiliado: true,
      paciente: {
        select: {
          id: true,
          nombreCompleto: true,
          numeroDocumento: true,
          tipoDocumento: true,
          fechaNacimiento: true,
          celular1: true,
          obraSocialId: true,
        },
      },
      cama: {
        select: { id: true, identificador: true, sector: true, habitacion: true },
      },
      profesionalGuardia: { select: { id: true, nombre: true } },
      profesionalTratante: { select: { id: true, nombre: true } },
      obraSocial: { select: { id: true, nombre: true } },
      plan: { select: { id: true, descripcion: true } },
      ingresoPatologias: {
        select: { id: true, patologiaId: true, descripcion: true, estado: true, fecha: true },
        orderBy: { fecha: 'desc' },
      },
      evoluciones: {
        select: {
          id: true,
          ingresoId: true,
          fecha: true,
          tipo: true,
          descripcion: true,
          tensionArterial: true,
          frecuenciaCardiaca: true,
          frecuenciaRespiratoria: true,
          temperatura: true,
          saturacionO2: true,
          usuario: true,
          profesional: { select: { id: true, nombre: true } },
        },
        orderBy: { fecha: 'desc' },
      },
      medicaciones: {
        select: {
          id: true,
          ingresoId: true,
          nombre: true,
          dosis: true,
          viaAdministracion: true,
          frecuencia: true,
          fechaInicio: true,
          fechaFin: true,
          observaciones: true,
          estado: true,
          usuario: true,
          profesional: { select: { id: true, nombre: true } },
        },
        orderBy: { fechaInicio: 'desc' },
      },
      transferencias: {
        select: {
          id: true,
          ingresoId: true,
          fecha: true,
          motivo: true,
          usuario: true,
          camaOrigen: { select: { id: true, identificador: true, sector: true } },
          camaDestino: { select: { id: true, identificador: true, sector: true } },
          profesional: { select: { id: true, nombre: true } },
        },
        orderBy: { fecha: 'desc' },
      },
      practicas: {
        select: {
          id: true,
          ingresoId: true,
          convenioId: true,
          codigoPractica: true,
          fecha: true,
          cantidad: true,
          numeroAutorizacion: true,
          facturable: true,
          estado: true,
          usuarioRegistro: true,
        },
        orderBy: { fecha: 'desc' },
      },
      ordenes: {
        select: {
          puestoNumero: true,
          numero: true,
          fechaEmision: true,
          estado: true,
          items: {
            select: {
              item: true,
              codigoPractica: true,
              cantidad: true,
              numeroAutorizacion: true,
            },
          },
        },
        orderBy: { fechaEmision: 'desc' },
      },
    },
  })

  if (!ingreso) return null

  return {
    ...ingreso,
    evoluciones: ingreso.evoluciones.map((e) => ({
      ...e,
      temperatura: e.temperatura ? Number(e.temperatura) : null,
    })) as EvolucionItem[],
    medicaciones: ingreso.medicaciones as MedicacionItem[],
    transferencias: ingreso.transferencias as TransferenciaItem[],
    practicas: ingreso.practicas.map((p) => ({
      ...p,
      usuario: p.usuarioRegistro,
      descripcionPractica: null,
      cantidad: Number(p.cantidad),
    })) as PracticaItem[],
    ordenes: ingreso.ordenes.map((o) => ({
      ...o,
      items: o.items.map((i) => ({
        ...i,
        cantidad: Number(i.cantidad),
      })),
    })),
  } as InternacionDetalle
}

// ============================================
// PRÁCTICAS
// ============================================

export async function crearPractica(
  data: CrearPracticaInput,
  usuario: string
): Promise<PracticaItem> {
  const codigo = data.codigoPractica.padEnd(8).slice(0, 8)
  const cantidad = Number(data.cantidad)

  // Look up price from nomenclador
  const ingreso = await prisma.ingreso.findUnique({
    where: { id: data.ingresoId },
    select: {
      obraSocialId: true,
      obraSocialCoseguroId: true,
      obraSocial: { select: { nombre: true } },
    },
  })

  let importeTotal: number | null = null
  if (ingreso) {
    const regla = resolverReglaFacturacion(
      ingreso.obraSocial?.nombre,
      Boolean(ingreso.obraSocialCoseguroId)
    )
    const valorPractica = await obtenerValorPractica(codigo.trim())
    if (valorPractica > 0) {
      const cobertura = calcularImporteFacturable(valorPractica, cantidad, regla)
      importeTotal = cobertura.importeTotalFacturable > 0 ? cobertura.importeTotalFacturable : null
    }
  }

  const practica = await prisma.practica.create({
    data: {
      ingresoId: data.ingresoId,
      convenioId: data.convenioId,
      codigoPractica: codigo,
      convenioValorId: 0,
      fecha: data.fecha,
      cantidad,
      numeroAutorizacion: data.numeroAutorizacion ?? null,
      facturable: data.facturable,
      importeTotal,
      usuarioRegistro: usuario.slice(0, 10),
    },
    select: {
      id: true,
      ingresoId: true,
      convenioId: true,
      codigoPractica: true,
      fecha: true,
      cantidad: true,
      numeroAutorizacion: true,
      facturable: true,
      estado: true,
      usuarioRegistro: true,
    },
  })
  return {
    ...practica,
    usuario: practica.usuarioRegistro,
    descripcionPractica: data.descripcionPractica ?? null,
    cantidad: Number(practica.cantidad),
  } as PracticaItem
}

// ============================================
// EVOLUCIÓN CLÍNICA
// ============================================

export async function crearEvolucion(
  data: CrearEvolucionInput,
  usuario: string
): Promise<EvolucionItem> {
  const ev = await prisma.evolucionIngreso.create({
    data: {
      ingresoId: data.ingresoId,
      fecha: new Date(),
      tipo: data.tipo,
      descripcion: data.descripcion,
      tensionArterial: data.tensionArterial ?? null,
      frecuenciaCardiaca: data.frecuenciaCardiaca ?? null,
      frecuenciaRespiratoria: data.frecuenciaRespiratoria ?? null,
      temperatura: data.temperatura ?? null,
      saturacionO2: data.saturacionO2 ?? null,
      profesionalId: data.profesionalId ?? null,
      usuario: usuario.slice(0, 10),
      fechaEstado: new Date(),
    },
    select: {
      id: true,
      ingresoId: true,
      fecha: true,
      tipo: true,
      descripcion: true,
      tensionArterial: true,
      frecuenciaCardiaca: true,
      frecuenciaRespiratoria: true,
      temperatura: true,
      saturacionO2: true,
      usuario: true,
      profesional: { select: { id: true, nombre: true } },
    },
  })
  return {
    ...ev,
    temperatura: ev.temperatura ? Number(ev.temperatura) : null,
  } as EvolucionItem
}

// ============================================
// MEDICACIÓN
// ============================================

export async function crearMedicacion(
  data: CrearMedicacionInput,
  usuario: string
): Promise<MedicacionItem> {
  return prisma.medicacionIngreso.create({
    data: {
      ingresoId: data.ingresoId,
      nombre: data.nombre,
      dosis: data.dosis ?? null,
      viaAdministracion: data.viaAdministracion ?? null,
      frecuencia: data.frecuencia ?? null,
      fechaInicio: data.fechaInicio,
      fechaFin: data.fechaFin ?? null,
      observaciones: data.observaciones ?? null,
      profesionalId: data.profesionalId ?? null,
      estado: 'A',
      usuario: usuario.slice(0, 10),
      fechaEstado: new Date(),
    },
    select: {
      id: true,
      ingresoId: true,
      nombre: true,
      dosis: true,
      viaAdministracion: true,
      frecuencia: true,
      fechaInicio: true,
      fechaFin: true,
      observaciones: true,
      estado: true,
      usuario: true,
      profesional: { select: { id: true, nombre: true } },
    },
  }) as Promise<MedicacionItem>
}

export async function actualizarMedicacion(
  id: number,
  data: ActualizarMedicacionInput,
  usuario: string
): Promise<MedicacionItem> {
  return prisma.medicacionIngreso.update({
    where: { id },
    data: {
      estado: data.estado,
      fechaFin: data.fechaFin ?? null,
      observaciones: data.observaciones ?? null,
      usuario: usuario.slice(0, 10),
      fechaEstado: new Date(),
    },
    select: {
      id: true,
      ingresoId: true,
      nombre: true,
      dosis: true,
      viaAdministracion: true,
      frecuencia: true,
      fechaInicio: true,
      fechaFin: true,
      observaciones: true,
      estado: true,
      usuario: true,
      profesional: { select: { id: true, nombre: true } },
    },
  }) as Promise<MedicacionItem>
}

// ============================================
// TRANSFERENCIA DE CAMA
// ============================================

export async function transferirCama(
  data: TransferirCamaInput,
  usuario: string
): Promise<TransferenciaItem> {
  const ingreso = await prisma.ingreso.findUnique({
    where: { id: data.ingresoId },
    select: { id: true, camaId: true },
  })
  if (!ingreso) throw new Error('Internación no encontrada')

  const camaDestino = await prisma.cama.findUnique({ where: { id: data.camaDestinoId } })
  if (!camaDestino) throw new Error('Cama destino no encontrada')
  if (camaDestino.estado !== 'DISPONIBLE') throw new Error('La cama destino no está disponible')

  const transferencia = await prisma.$transaction(async (tx) => {
    // Liberar cama origen
    if (ingreso.camaId) {
      await tx.cama.update({
        where: { id: ingreso.camaId },
        data: { estado: 'DISPONIBLE', usuario: usuario.slice(0, 10), fechaEstado: new Date() },
      })
    }

    // Ocupar cama destino
    await tx.cama.update({
      where: { id: data.camaDestinoId },
      data: { estado: 'OCUPADA', usuario: usuario.slice(0, 10), fechaEstado: new Date() },
    })

    // Actualizar ingreso
    await tx.ingreso.update({
      where: { id: data.ingresoId },
      data: { camaId: data.camaDestinoId },
    })

    // Registrar transferencia
    return tx.transferenciaIngreso.create({
      data: {
        ingresoId: data.ingresoId,
        camaOrigenId: ingreso.camaId ?? null,
        camaDestinoId: data.camaDestinoId,
        fecha: new Date(),
        motivo: data.motivo ?? null,
        profesionalId: data.profesionalId ?? null,
        usuario: usuario.slice(0, 10),
        fechaEstado: new Date(),
      },
      select: {
        id: true,
        ingresoId: true,
        fecha: true,
        motivo: true,
        usuario: true,
        camaOrigen: { select: { id: true, identificador: true, sector: true } },
        camaDestino: { select: { id: true, identificador: true, sector: true } },
        profesional: { select: { id: true, nombre: true } },
      },
    })
  })

  return transferencia as TransferenciaItem
}
