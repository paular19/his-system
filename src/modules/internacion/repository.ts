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
  DescartableItem,
  TransferenciaItem,
  PracticaItem,
  CirugiaUrgenciaItem,
} from './types'
import { SECTOR_CAMA, SECTOR_LABEL } from './types'
import type {
  ActualizarCamaInput,
  BusquedaInternacionInput,
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
import type { ResultadoPaginado } from '@/types'

// ============================================
// REPOSITORIO INTERNACIÓN
// ============================================

const ARG_TIME_ZONE = 'America/Argentina/Buenos_Aires'

function claveDiaArgentina(fecha: Date): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ARG_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(fecha)

  const year = partes.find((p) => p.type === 'year')?.value ?? '0000'
  const month = partes.find((p) => p.type === 'month')?.value ?? '01'
  const day = partes.find((p) => p.type === 'day')?.value ?? '01'
  return `${year}-${month}-${day}`
}

function resolverFechaReferencia(fechaReferencia?: Date): Date {
  return fechaReferencia ?? new Date()
}

function ingresoActivoParaMapa(fechaIngreso: Date | null | undefined, fechaReferencia: Date): boolean {
  if (!fechaIngreso) return false
  return claveDiaArgentina(fechaIngreso) <= claveDiaArgentina(fechaReferencia)
}

function ingresoDelDiaParaMapa(fechaIngreso: Date | null | undefined, fechaReferencia: Date): boolean {
  if (!fechaIngreso) return false
  return claveDiaArgentina(fechaIngreso) === claveDiaArgentina(fechaReferencia)
}

async function mapearCamaConOcupante(
  cama: Cama & {
    ingresos: Array<{
      id: number
      numeroIngreso: number
      nombre: string | null
      fechaIngreso: Date | null
    }>
  },
  fechaReferencia: Date
): Promise<CamaConOcupante> {
  const ingresosActivos = cama.ingresos
    .filter((ing) => ingresoActivoParaMapa(ing.fechaIngreso, fechaReferencia))
    .sort((a, b) => {
      const af = a.fechaIngreso?.getTime() ?? 0
      const bf = b.fechaIngreso?.getTime() ?? 0
      return bf - af
    })

  const ingresoActivo = ingresosActivos[0] ?? null
  const hayIngresoDelDia = cama.ingresos.some((ing) => ingresoDelDiaParaMapa(ing.fechaIngreso, fechaReferencia))
  const hayIngresoFuturo = cama.ingresos.some(
    (ing) => !!ing.fechaIngreso && claveDiaArgentina(ing.fechaIngreso) > claveDiaArgentina(fechaReferencia)
  )

  let estadoVisual = cama.estado
  if (cama.estado !== 'MANTENIMIENTO') {
    if (cama.estado === 'OCUPADA') {
      estadoVisual = 'OCUPADA'
    } else if (hayIngresoDelDia) {
      estadoVisual = 'RESERVADA'
    } else if (cama.estado === 'RESERVADA' && hayIngresoFuturo) {
      // No mostrar reservas antes de su día efectivo.
      estadoVisual = 'DISPONIBLE'
    }
  }

  return {
    ...cama,
    estado: estadoVisual,
    ocupante: ingresoActivo
      ? {
        ingresoId: ingresoActivo.id,
        numeroIngreso: ingresoActivo.numeroIngreso,
        nombre: ingresoActivo.nombre ?? 'Sin nombre',
        fechaIngreso: ingresoActivo.fechaIngreso,
      }
      : null,
  }
}

export async function obtenerTodasLasCamas(fechaReferencia?: Date): Promise<CamaConOcupante[]> {
  const fecha = resolverFechaReferencia(fechaReferencia)
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
        orderBy: [{ fechaIngreso: 'asc' }, { id: 'asc' }],
      },
    },
    orderBy: [{ sector: 'asc' }, { identificador: 'asc' }],
  })

  return Promise.all(camas.map((c) => mapearCamaConOcupante(c, fecha)))
}

export async function obtenerMapaCamas(fechaReferencia?: Date): Promise<MapaCamas> {
  const todasLasCamas = await obtenerTodasLasCamas(fechaReferencia)

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
  const fecha = resolverFechaReferencia()
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
        orderBy: [{ fechaIngreso: 'asc' }, { id: 'asc' }],
      },
    },
  })

  if (!cama) return null
  return mapearCamaConOcupante(cama, fecha)
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
  const { pagina, porPagina, q, obraSocialId, sector, fechaReferencia } = params
  const skip = (pagina - 1) * porPagina
  const fecha = resolverFechaReferencia(fechaReferencia)

  const where: Prisma.IngresoWhereInput = {
    tipoIngresoCodigo: 'INT',
    estado: 'A',
    camaId: { not: null },
  }

  if (sector) {
    where.cama = { sector }
  }

  if (obraSocialId) {
    where.obraSocialId = obraSocialId
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

  const itemsBase = await prisma.ingreso.findMany({
    where,
    select: {
      id: true,
      numeroIngreso: true,
      nombre: true,
      fechaIngreso: true,
      fechaEgresoPrevista: true,
      estado: true,
      cama: {
        select: { id: true, identificador: true, sector: true, habitacion: true, estado: true },
      },
      paciente: {
        select: { id: true, nombreCompleto: true, numeroDocumento: true },
      },
      profesionalTratante: {
        select: { id: true, nombre: true },
      },
      obraSocial: {
        select: { id: true, nombre: true },
      },
    },
    orderBy: { fechaIngreso: 'desc' },
  })

  const itemsFiltrados = itemsBase.filter((item) => ingresoActivoParaMapa(item.fechaIngreso, fecha))
  const total = itemsFiltrados.length
  const items = itemsFiltrados.slice(skip, skip + porPagina)

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
      profesionalTratante: { select: { id: true, nombre: true, matricula: true } },
      obraSocial: { select: { id: true, nombre: true } },
      plan: { select: { id: true, descripcion: true } },
      obraSocialCoseguroId: true,
      ingresoPatologias: {
        select: { id: true, patologiaId: true, descripcion: true, estado: true, fecha: true, observaciones: true, fechaEstado: true, usuario: true },
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
      descartables: {
        select: {
          id: true,
          ingresoId: true,
          nombre: true,
          cantidad: true,
          observaciones: true,
          fechaInicio: true,
          fechaFin: true,
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
          nomencladorPractica: { select: { descripcion: true } },
          fecha: true,
          cantidad: true,
          numeroAutorizacion: true,
          matriculaEspecialista: true,
          matriculaAnestesista: true,
          puestoNumero: true,
          ordenNumero: true,
          ordenItem: true,
          ordenPractica: {
            select: {
              puestoNumero: true,
              ordenNumero: true,
              item: true,
              numeroAutorizacion: true,
            },
          },
          facturable: true,
          estado: true,
          usuarioRegistro: true,
        },
        orderBy: { fecha: 'desc' },
      },
      cirugiasProgramadas: {
        orderBy: [{ fechaCirugia: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          fechaCirugia: true,
          horaCirugia: true,
          numeroAutorizacion: true,
          observaciones: true,
          cama: {
            select: {
              id: true,
              identificador: true,
              sector: true,
              habitacion: true,
            },
          },
          practicas: {
            select: {
              id: true,
              codigo: true,
              descripcion: true,
              cantidad: true,
              numeroAutorizacion: true,
            },
            orderBy: { id: 'asc' },
          },
          diferenciales: {
            select: {
              esFeriado: true,
              esNocturna: true,
              mismaViaPatologia: true,
              diferentesViasPatologia: true,
              diferentesViasDiferentesPatologia: true,
            },
          },
        },
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
              convenioId: true,
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

  const historialTratantes = await prisma.auditLog.findMany({
    where: {
      entidad: 'Ingreso',
      registroId: String(id),
      detalle: { startsWith: 'Médico tratante actualizado:' },
    },
    orderBy: { fecha: 'desc' },
  })

  const mapHistorial = historialTratantes
    .map((h) => {
      const matchId = h.detalle?.match(/ID\s+(\d+)/)
      const matchNombre = h.detalle?.match(/→\s+(.+)\s+\(ID\s+\d+\)$/)
      if (!matchId || !matchNombre) return null
      return {
        id: h.id,
        profesionalId: Number.parseInt(matchId[1] ?? "", 10),
        profesionalNombre: matchNombre[1]?.trim() ?? "",
        usuario: h.usuario,
        fecha: h.fecha,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)

  const ordenPorClave = new Map(
    ingreso.ordenes.flatMap((o) =>
      o.items.map((i) => [
        `${i.convenioId}:${i.codigoPractica.trim()}`,
        {
          puestoNumero: o.puestoNumero,
          ordenNumero: o.numero,
          item: i.item,
          numeroAutorizacion: i.numeroAutorizacion,
        },
      ])
    )
  )

  return {
    ...ingreso,
    historialTratantes: mapHistorial,
    evoluciones: ingreso.evoluciones.map((e) => ({
      ...e,
      temperatura: e.temperatura ? Number(e.temperatura) : null,
    })) as EvolucionItem[],
    medicaciones: ingreso.medicaciones as MedicacionItem[],
    descartables: ingreso.descartables.map((d) => ({
      ...d,
      cantidad: Number(d.cantidad),
    })) as DescartableItem[],
    transferencias: ingreso.transferencias as TransferenciaItem[],
    cirugiasUrgencia: ingreso.cirugiasProgramadas.map((c) => ({
      ...c,
      practicas: c.practicas.map((p) => ({
        ...p,
        cantidad: Number(p.cantidad),
      })),
    })) as CirugiaUrgenciaItem[],
    practicas: ingreso.practicas.map((p) => ({
      ...p,
      usuario: p.usuarioRegistro,
      descripcionPractica: p.nomencladorPractica?.descripcion ?? p.codigoPractica.trim(),
      cantidad: Number(p.cantidad),
      ordenPractica:
        (Array.isArray(p.ordenPractica) && p.ordenPractica.length > 0
          ? p.ordenPractica.map((op) => ({
            puestoNumero: op.puestoNumero,
            ordenNumero: op.ordenNumero,
            item: op.item,
            numeroAutorizacion: op.numeroAutorizacion,
          }))
          : null) ??
        (p.puestoNumero != null && p.ordenNumero != null && Number(p.puestoNumero) > 0
          ? [
            {
              puestoNumero: Number(p.puestoNumero),
              ordenNumero: Number(p.ordenNumero),
              item: p.ordenItem != null ? Number(p.ordenItem) : 1,
              numeroAutorizacion: p.numeroAutorizacion ?? null,
            },
          ]
          : ordenPorClave.get(`${p.convenioId}:${p.codigoPractica.trim()}`)
            ? [ordenPorClave.get(`${p.convenioId}:${p.codigoPractica.trim()}`)!]
            : []),
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

export async function actualizarProfesionalTratanteInternacion(
  ingresoId: number,
  profesionalTratanteId: number,
  usuario: string
) {
  const ahora = new Date()

  const ingresoActual = await prisma.ingreso.findUnique({
    where: { id: ingresoId },
    select: {
      id: true,
      tipoIngresoCodigo: true,
      profesionalTratanteId: true,
      profesionalTratante: { select: { id: true, nombre: true } },
    },
  })

  if (!ingresoActual) throw new Error('Internación no encontrada')
  if (ingresoActual.tipoIngresoCodigo !== 'INT') {
    throw new Error('El ingreso indicado no corresponde a internación')
  }

  const profesionalNuevo = await prisma.profesional.findUnique({
    where: { id: profesionalTratanteId },
    select: { id: true, nombre: true, estado: true },
  })

  if (!profesionalNuevo || profesionalNuevo.estado !== 'A') {
    throw new Error('Profesional tratante inválido o inactivo')
  }

  if (ingresoActual.profesionalTratanteId === profesionalTratanteId) {
    return {
      ingresoId,
      anterior: ingresoActual.profesionalTratante,
      nuevo: { id: profesionalNuevo.id, nombre: profesionalNuevo.nombre },
      actualizado: false,
    }
  }

  await prisma.$transaction([
    prisma.ingresoHistorial.create({
      data: {
        ingresoId,
        tipoCambio: 'M',
        usuarioCambio: usuario.slice(0, 10),
        fechaCambio: ahora,
      },
    }),
    prisma.ingreso.update({
      where: { id: ingresoId },
      data: {
        profesionalTratanteId,
        usuario: usuario.slice(0, 10),
        fechaEstado: ahora,
      },
    }),
  ])

  return {
    ingresoId,
    anterior: ingresoActual.profesionalTratante,
    nuevo: { id: profesionalNuevo.id, nombre: profesionalNuevo.nombre },
    actualizado: true,
  }
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
      matriculaEspecialista: data.matriculaEspecialista ?? null,
      matriculaAnestesista: data.matriculaAnestesista ?? null,
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
      matriculaEspecialista: true,
      matriculaAnestesista: true,
      facturable: true,
      estado: true,
      usuarioRegistro: true,
      ordenPractica: {
        select: {
          puestoNumero: true,
          ordenNumero: true,
          item: true,
          numeroAutorizacion: true,
        },
      },
    },
  })
  return {
    ...practica,
    usuario: practica.usuarioRegistro,
    descripcionPractica: data.descripcionPractica ?? null,
    cantidad: Number(practica.cantidad),
    matriculaEspecialista: practica.matriculaEspecialista,
    matriculaAnestesista: practica.matriculaAnestesista,
    ordenPractica: Array.isArray(practica.ordenPractica)
      ? practica.ordenPractica.map((op) => ({
        puestoNumero: op.puestoNumero,
        ordenNumero: op.ordenNumero,
        item: op.item,
        numeroAutorizacion: op.numeroAutorizacion,
      }))
      : [],
  } as PracticaItem
}

export async function crearCirugiaUrgencia(
  data: CrearCirugiaUrgenciaInput,
  usuario: string
): Promise<CirugiaUrgenciaItem> {
  const observacionesStructured = [
    'Tipo: URGENCIA',
    data.diagnostico?.trim() ? `Diagnostico: ${data.diagnostico.trim()}` : null,
    data.observaciones?.trim() ? `Observaciones: ${data.observaciones.trim()}` : null,
    data.obraSocialId ? `ObraSocialID: ${data.obraSocialId}` : null,
    data.planId ? `PlanID: ${data.planId}` : null,
    data.obraSocialCoseguroId ? `CoseguroID: ${data.obraSocialCoseguroId}` : null,
    data.numeroAfiliado?.trim() ? `Afiliado: ${data.numeroAfiliado.trim()}` : null,
  ]
    .filter(Boolean)
    .join(' | ')
    .slice(0, 500)

  const cirugia = await prisma.$transaction(async (tx) => {
    const creada = await tx.cirugiaProgramada.create({
      data: {
        pacienteId: data.pacienteId,
        internacionId: data.ingresoId,
        fechaCirugia: new Date(data.fechaCirugia),
        horaCirugia: data.horaCirugia ?? null,
        camaId: data.camaId ?? null,
        observaciones: observacionesStructured || null,
        practicas: {
          create: data.practicas.map((p) => ({
            codigo: p.codigo.trim().slice(0, 20),
            descripcion: p.descripcion.trim().slice(0, 500),
            cantidad: p.cantidad,
            numeroAutorizacion: null,
          })),
        },
        diferenciales: data.diferenciales
          ? {
            create: {
              tipo: 'QUIRURGICA',
              descripcion: 'Diferenciales de cirugía de urgencia',
              esFeriado: data.diferenciales.esFeriado,
              esNocturna: data.diferenciales.esNocturna,
              mismaViaPatologia: data.diferenciales.mismaViaPatologia,
              diferentesViasPatologia: data.diferenciales.diferentesViasPatologia,
              diferentesViasDiferentesPatologia: data.diferenciales.diferentesViasDiferentesPatologia,
            },
          }
          : undefined,
      },
      select: {
        id: true,
        fechaCirugia: true,
        horaCirugia: true,
        numeroAutorizacion: true,
        observaciones: true,
        cama: {
          select: {
            id: true,
            identificador: true,
            sector: true,
            habitacion: true,
          },
        },
        practicas: {
          select: {
            id: true,
            codigo: true,
            descripcion: true,
            cantidad: true,
            numeroAutorizacion: true,
          },
          orderBy: { id: 'asc' },
        },
        diferenciales: {
          select: {
            esFeriado: true,
            esNocturna: true,
            mismaViaPatologia: true,
            diferentesViasPatologia: true,
            diferentesViasDiferentesPatologia: true,
          },
        },
      },
    })

    await Promise.all(
      data.practicas.map((p) =>
        tx.practica.create({
          data: {
            ingresoId: data.ingresoId,
            convenioId: p.convenioId ?? data.obraSocialId ?? 0,
            codigoPractica: p.codigo.padEnd(8).slice(0, 8),
            convenioValorId: 0,
            fecha: new Date(data.fechaCirugia),
            cantidad: p.cantidad,
            numeroAutorizacion: null,
            matriculaEspecialista: p.matriculaEspecialista ?? null,
            matriculaAnestesista: p.matriculaAnestesista ?? null,
            facturable: true,
            importeTotal: p.importeTotal ?? null,
            usuarioRegistro: usuario.slice(0, 10),
          },
        })
      )
    )

    return creada
  })

  return {
    ...cirugia,
    practicas: cirugia.practicas.map((p) => ({
      ...p,
      cantidad: Number(p.cantidad),
    })),
  } as CirugiaUrgenciaItem
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

export async function crearDescartable(
  data: CrearDescartableInput,
  usuario: string
): Promise<DescartableItem> {
  return prisma.descartableIngreso.create({
    data: {
      ingresoId: data.ingresoId,
      nombre: data.nombre,
      cantidad: data.cantidad,
      observaciones: data.observaciones ?? null,
      fechaInicio: new Date(),
      profesionalId: data.profesionalId ?? null,
      estado: 'A',
      usuario: usuario.slice(0, 10),
      fechaEstado: new Date(),
    },
    select: {
      id: true,
      ingresoId: true,
      nombre: true,
      cantidad: true,
      observaciones: true,
      fechaInicio: true,
      fechaFin: true,
      estado: true,
      usuario: true,
      profesional: { select: { id: true, nombre: true } },
    },
  }) as Promise<DescartableItem>
}

export async function actualizarDescartable(
  id: number,
  data: ActualizarDescartableInput,
  usuario: string
): Promise<DescartableItem> {
  return prisma.descartableIngreso.update({
    where: { id },
    data: {
      estado: data.estado,
      fechaFin: data.fechaFin ?? null,
      cantidad: data.cantidad,
      observaciones: data.observaciones ?? null,
      usuario: usuario.slice(0, 10),
      fechaEstado: new Date(),
    },
    select: {
      id: true,
      ingresoId: true,
      nombre: true,
      cantidad: true,
      observaciones: true,
      fechaInicio: true,
      fechaFin: true,
      estado: true,
      usuario: true,
      profesional: { select: { id: true, nombre: true } },
    },
  }) as Promise<DescartableItem>
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
    select: { id: true, camaId: true, fechaIngreso: true },
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

    const hoy = new Date()
    const ingresoEnFuturo =
      !!ingreso.fechaIngreso && claveDiaArgentina(ingreso.fechaIngreso) > claveDiaArgentina(hoy)
    const ingresoEsHoy = ingresoDelDiaParaMapa(ingreso.fechaIngreso, hoy)

    // Preingreso futuro: no bloquear la cama antes del día; hoy se reserva y pasado queda ocupada.
    const estadoDestino = ingresoEnFuturo ? 'DISPONIBLE' : ingresoEsHoy ? 'RESERVADA' : 'OCUPADA'
    await tx.cama.update({
      where: { id: data.camaDestinoId },
      data: { estado: estadoDestino, usuario: usuario.slice(0, 10), fechaEstado: new Date() },
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
        camaDestino: { select: { id: true, identificador: true, sector: true, estado: true } },
        profesional: { select: { id: true, nombre: true } },
      },
    })
  })

  return transferencia as TransferenciaItem
}

// ============================================
// DIAGNOSTICOS / ALTA
// ============================================

export async function actualizarDiagnosticoInternacion(
  data: ActualizarDiagnosticoInternacionInput,
  usuario: string
) {
  const existente = await prisma.ingresoPatologia.findUnique({
    where: { id: data.id },
    select: { id: true, ingresoId: true },
  })

  if (!existente || existente.ingresoId !== data.ingresoId) {
    throw new Error('Diagnostico no encontrado para la internacion indicada')
  }

  return prisma.ingresoPatologia.update({
    where: { id: data.id },
    data: {
      patologiaId: data.patologiaId ?? null,
      descripcion: data.descripcion,
      observaciones: data.observaciones ?? null,
      fecha: data.fecha ?? new Date(),
      estado: data.estado,
      fechaEstado: new Date(),
      usuario: usuario.slice(0, 10),
    },
    select: {
      id: true,
      patologiaId: true,
      descripcion: true,
      observaciones: true,
      estado: true,
      fecha: true,
      fechaEstado: true,
      usuario: true,
    },
  })
}

export async function registrarAltaInternacion(
  data: RegistrarAltaInternacionInput,
  usuario: string
) {
  const ingreso = await prisma.ingreso.findUnique({
    where: { id: data.ingresoId },
    select: {
      id: true,
      tipoIngresoCodigo: true,
      estado: true,
      camaId: true,
      numeroIngreso: true,
    },
  })

  if (!ingreso || ingreso.tipoIngresoCodigo !== 'INT') {
    throw new Error('Internacion no encontrada')
  }

  if (ingreso.estado !== 'A') {
    throw new Error(`La internacion INT-${ingreso.numeroIngreso} no se encuentra activa`)
  }

  const fechaEgreso = data.fechaEgreso ?? new Date()

  return prisma.$transaction(async (tx) => {
    const alta = await tx.ingreso.update({
      where: { id: data.ingresoId },
      data: {
        fechaEgreso,
        motivoEgresoCodigo: data.motivoEgresoCodigo ?? null,
        descripcionPatologiaDefinitiva: data.descripcionPatologiaDefinitiva ?? null,
        estado: 'E',
        fechaEstado: new Date(),
        usuario: usuario.slice(0, 10),
      },
      select: {
        id: true,
        numeroIngreso: true,
        fechaEgreso: true,
        motivoEgresoCodigo: true,
        descripcionPatologiaDefinitiva: true,
        estado: true,
      },
    })

    if (ingreso.camaId) {
      await tx.cama.update({
        where: { id: ingreso.camaId },
        data: {
          estado: 'DISPONIBLE',
          usuario: usuario.slice(0, 10),
          fechaEstado: new Date(),
        },
      })
    }

    return alta
  })
}
