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
  ActualizarPracticaInput,
  RegistrarAltaInternacionInput,
  ActualizarDiagnosticoInternacionInput,
  CrearCirugiaUrgenciaInput,
  CrearCirugiaSimpleInput,
  GuardarCondicionalCirugiaMultipleInput,
} from './schemas'
import type { ResultadoPaginado } from '@/types'

// ============================================
// REPOSITORIO INTERNACIÓN
// ============================================

const ARG_TIME_ZONE = 'America/Argentina/Buenos_Aires'

function esFechaSoloEnUtc(fecha: Date): boolean {
  return (
    fecha.getUTCHours() === 0 &&
    fecha.getUTCMinutes() === 0 &&
    fecha.getUTCSeconds() === 0 &&
    fecha.getUTCMilliseconds() === 0
  )
}

function claveDiaArgentina(fecha: Date): string {
  // Evita corrimientos de día cuando el valor fue guardado como YYYY-MM-DD (00:00:00.000Z).
  if (esFechaSoloEnUtc(fecha)) {
    return fecha.toISOString().slice(0, 10)
  }

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

function normalizarNumeroAutorizacion(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? ''
  return normalized.length > 0 ? normalized : null
}

function normalizarTextoOpcional(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? ''
  return normalized.length > 0 ? normalized : null
}

type ComponentesPractica = {
  valorEspecialista: number | null
  valorAyudante: number | null
  valorAnestesista: number | null
  valorGastos: number | null
}

function resolverDetalleSubitemPractica(params: {
  matriculaEspecialista: number | null | undefined
  matriculaAnestesista: number | null | undefined
  importeTotal: number | null | undefined
  cantidad: number
  componentes?: ComponentesPractica | null
}): string | null {
  const {
    matriculaEspecialista,
    matriculaAnestesista,
    importeTotal,
    cantidad,
    componentes,
  } = params

  const tieneMatriculaEspecialista =
    matriculaEspecialista != null && Number(matriculaEspecialista) > 0
  const tieneMatriculaAnestesista =
    matriculaAnestesista != null && Number(matriculaAnestesista) > 0

  if (tieneMatriculaEspecialista && !tieneMatriculaAnestesista) {
    return 'Honorario Especialista (HE)'
  }

  if (tieneMatriculaAnestesista && !tieneMatriculaEspecialista) {
    return 'Honorario Anestesista (HA)'
  }

  if (
    !tieneMatriculaEspecialista &&
    !tieneMatriculaAnestesista &&
    importeTotal != null &&
    componentes
  ) {
    const approx = (a: number, b: number) => Math.abs(a - b) < 0.01
    const totalGastos =
      componentes.valorGastos != null ? Number(componentes.valorGastos) * cantidad : null
    const totalAyudante =
      componentes.valorAyudante != null ? Number(componentes.valorAyudante) * cantidad : null

    if (totalGastos != null && approx(importeTotal, totalGastos)) {
      return 'Derechos/Gastos (GA)'
    }

    if (totalAyudante != null && approx(importeTotal, totalAyudante)) {
      return 'Honorarios Ayudante'
    }
  }

  return null
}

function construirDescripcionPractica(params: {
  descripcionBase: string
  matriculaEspecialista: number | null | undefined
  matriculaAnestesista: number | null | undefined
  importeTotal: number | null | undefined
  cantidad: number
  componentes?: ComponentesPractica | null
}): string {
  const detalleSubitem = resolverDetalleSubitemPractica(params)
  return detalleSubitem ? `${params.descripcionBase} · ${detalleSubitem}` : params.descripcionBase
}

async function asegurarNomencladorPedidoLaboratorio(params: {
  convenioId: number
  codigoPractica: string
  descripcion?: string | null
}) {
  const codigoNormalizado = params.codigoPractica.trim().padEnd(8).slice(0, 8)
  if (codigoNormalizado.trim() !== '66') return

  const descripcion = normalizarTextoOpcional(params.descripcion) ?? 'PROTOCOLO BIOQUIMICO'

  await prisma.nomencladorPractica.upsert({
    where: {
      convenioId_codigo: {
        convenioId: params.convenioId,
        codigo: codigoNormalizado,
      },
    },
    update: {},
    create: {
      convenioId: params.convenioId,
      codigo: codigoNormalizado,
      descripcion,
    },
  })
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
  const ingresoBase = await prisma.ingreso.findUnique({
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
      observaciones: true,
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
    },
  })

  if (!ingresoBase) return null

  const [
    ingresoPatologias,
    evoluciones,
    medicaciones,
    descartables,
    transferencias,
    practicasBase,
    cirugiasProgramadas,
    ordenes,
    historialTratantes,
  ] = await Promise.all([
    prisma.ingresoPatologia.findMany({
      where: { ingresoId: id },
      select: { id: true, patologiaId: true, descripcion: true, estado: true, fecha: true, observaciones: true, fechaEstado: true, usuario: true },
      orderBy: { fecha: 'desc' },
    }),
    prisma.evolucionIngreso.findMany({
      where: { ingresoId: id },
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
    }),
    prisma.medicacionIngreso.findMany({
      where: { ingresoId: id },
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
    }),
    prisma.descartableIngreso.findMany({
      where: { ingresoId: id },
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
    }),
    prisma.transferenciaIngreso.findMany({
      where: { ingresoId: id },
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
    }),
    prisma.practica.findMany({
      where: {
        ingresoId: id,
        OR: [{ estado: 'A' }, { estado: null }],
      },
      select: {
        id: true,
        ingresoId: true,
        convenioId: true,
        codigoPractica: true,
        fecha: true,
        cantidad: true,
        importeTotal: true,
        numeroAutorizacion: true,
        numeroProtocoloLab: true,
        diagnosticoLab: true,
        matriculaEspecialista: true,
        matriculaAnestesista: true,
        puestoNumero: true,
        ordenNumero: true,
        ordenItem: true,
        facturable: true,
        estado: true,
        usuarioRegistro: true,
      },
    }),
    prisma.cirugiaProgramada.findMany({
      where: { internacionId: id },
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
            dobleCirugia: true,
          },
        },
      },
    }),
    prisma.orden.findMany({
      where: {
        ingresoId: id,
        NOT: { estado: 'X' },
      },
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
    }),
    prisma.auditLog.findMany({
      where: {
        entidad: 'Ingreso',
        registroId: String(id),
        detalle: { startsWith: 'Médico tratante actualizado:' },
      },
      orderBy: { fecha: 'desc' },
    }),
  ])

  const practicaIds = practicasBase.map((p) => p.id)
  const practicasOrdenadas = [...practicasBase].sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
  const conveniosPractica = Array.from(new Set(practicasOrdenadas.map((p) => p.convenioId)))
  const nomencladorRows = conveniosPractica.length
    ? await prisma.nomencladorPractica.findMany({
      where: {
        convenioId: { in: conveniosPractica },
      },
      select: {
        convenioId: true,
        codigo: true,
        descripcion: true,
        valorEspecialista: true,
        valorAyudante: true,
        valorAnestesista: true,
        valorGastos: true,
      },
    })
    : []

  const descripcionPorClave = new Map<string, string>()
  const componentesPorClave = new Map<
    string,
    {
      valorEspecialista: number | null
      valorAyudante: number | null
      valorAnestesista: number | null
      valorGastos: number | null
    }
  >()
  for (const row of nomencladorRows) {
    const key = `${row.convenioId}:${row.codigo.trim()}`
    descripcionPorClave.set(key, row.descripcion)
    componentesPorClave.set(key, {
      valorEspecialista: row.valorEspecialista != null ? Number(row.valorEspecialista) : null,
      valorAyudante: row.valorAyudante != null ? Number(row.valorAyudante) : null,
      valorAnestesista: row.valorAnestesista != null ? Number(row.valorAnestesista) : null,
      valorGastos: row.valorGastos != null ? Number(row.valorGastos) : null,
    })
  }

  const ordenesPracticaRows = practicaIds.length
    ? await prisma.ordenPractica.findMany({
      where: {
        practicaId: { in: practicaIds },
        orden: { estado: { not: 'X' } },
      },
      select: {
        practicaId: true,
        puestoNumero: true,
        ordenNumero: true,
        item: true,
        numeroAutorizacion: true,
      },
      orderBy: [{ practicaId: 'asc' }, { item: 'asc' }],
    })
    : []

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

  const ordenesActivasSet = new Set(
    ordenes.map((orden) => `${orden.puestoNumero}:${orden.numero}`)
  )

  const ordenPorClave = new Map(
    ordenes.flatMap((o) =>
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

  const ordenesPracticaPorId = new Map<
    number,
    Array<{ puestoNumero: number; ordenNumero: number; item: number; numeroAutorizacion: string | null }>
  >()

  for (const row of ordenesPracticaRows) {
    if (row.practicaId == null) continue
    const prev = ordenesPracticaPorId.get(row.practicaId) ?? []
    prev.push({
      puestoNumero: row.puestoNumero,
      ordenNumero: row.ordenNumero,
      item: row.item,
      numeroAutorizacion: row.numeroAutorizacion,
    })
    ordenesPracticaPorId.set(row.practicaId, prev)
  }

  return {
    ...ingresoBase,
    ingresoPatologias,
    historialTratantes: mapHistorial,
    evoluciones: evoluciones.map((e) => ({
      ...e,
      temperatura: e.temperatura ? Number(e.temperatura) : null,
    })) as EvolucionItem[],
    medicaciones: medicaciones as MedicacionItem[],
    descartables: descartables.map((d) => ({
      ...d,
      cantidad: Number(d.cantidad),
    })) as DescartableItem[],
    transferencias: transferencias as TransferenciaItem[],
    cirugiasUrgencia: cirugiasProgramadas.map((c) => ({
      ...c,
      practicas: c.practicas.map((p) => ({
        ...p,
        cantidad: Number(p.cantidad),
      })),
    })) as CirugiaUrgenciaItem[],
    practicas: practicasOrdenadas.map((p) => ({
      ...p,
      usuario: p.usuarioRegistro,
      facturada:
        p.puestoNumero != null &&
        p.ordenNumero != null &&
        Number(p.puestoNumero) > 0 &&
        ordenesActivasSet.has(`${Number(p.puestoNumero)}:${Number(p.ordenNumero)}`),
      descripcionPractica: (() => {
        const key = `${p.convenioId}:${p.codigoPractica.trim()}`
        const descripcionBase = descripcionPorClave.get(key) ?? p.codigoPractica.trim()
        const componentes = componentesPorClave.get(key) ?? null
        const cantidad = Number.isFinite(Number(p.cantidad)) && Number(p.cantidad) > 0
          ? Math.floor(Number(p.cantidad))
          : 1
        const importeTotal = p.importeTotal != null ? Number(p.importeTotal) : null

        return construirDescripcionPractica({
          descripcionBase,
          matriculaEspecialista: p.matriculaEspecialista,
          matriculaAnestesista: p.matriculaAnestesista,
          importeTotal,
          cantidad,
          componentes,
        })
      })(),
      numeroProtocoloLaboratorio: p.numeroProtocoloLab,
      diagnosticoLaboratorio: p.diagnosticoLab,
      cantidad: Number(p.cantidad),
      importeTotal: p.importeTotal != null ? Number(p.importeTotal) : null,
      ordenPractica:
        ((ordenesPracticaPorId.get(p.id) ?? []).length > 0
          ? (ordenesPracticaPorId.get(p.id) ?? [])
          : null) ??
        (p.puestoNumero != null &&
        p.ordenNumero != null &&
        Number(p.puestoNumero) > 0 &&
        ordenesActivasSet.has(`${Number(p.puestoNumero)}:${Number(p.ordenNumero)}`)
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
    ordenes: ordenes.map((o) => ({
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
  const cantidad = Number.isFinite(Number(data.cantidad)) && Number(data.cantidad) > 0
    ? Math.floor(Number(data.cantidad))
    : 1

  // Preserve the exact component/subitem value chosen in UI when available.
  const importeBaseUnitario =
    data.importeBaseUnitario != null && Number.isFinite(Number(data.importeBaseUnitario))
      ? Number(data.importeBaseUnitario)
      : null

  // Look up price from nomenclador
  const ingreso = await prisma.ingreso.findUnique({
    where: { id: data.ingresoId },
    select: {
      obraSocialId: true,
      obraSocialCoseguroId: true,
      obraSocial: { select: { nombre: true } },
    },
  })

  const convenioSolicitado =
    Number.isFinite(Number(data.convenioId)) && Number(data.convenioId) > 0
      ? Math.floor(Number(data.convenioId))
      : null
  const convenioIngreso =
    ingreso?.obraSocialId != null && Number(ingreso.obraSocialId) > 0
      ? Number(ingreso.obraSocialId)
      : null

  let convenioResuelto = convenioSolicitado ?? convenioIngreso
  if (convenioResuelto == null) {
    const ultimaPractica = await prisma.practica.findFirst({
      where: {
        ingresoId: data.ingresoId,
        estado: { not: 'X' },
      },
      select: { convenioId: true },
      orderBy: { id: 'desc' },
    })
    convenioResuelto = ultimaPractica?.convenioId ?? null
  }

  if (convenioResuelto == null || convenioResuelto <= 0) {
    throw new Error('Convenio no encontrado para la internación')
  }

  await asegurarNomencladorPedidoLaboratorio({
    convenioId: convenioResuelto,
    codigoPractica: codigo,
    descripcion: data.descripcionPractica,
  })

  let importeTotal: number | null = null
  if (importeBaseUnitario != null && importeBaseUnitario > 0) {
    importeTotal = importeBaseUnitario * cantidad
  } else if (ingreso) {
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
      convenioId: convenioResuelto,
      codigoPractica: codigo,
      convenioValorId: 0,
      fecha: data.fecha,
      cantidad,
      numeroAutorizacion: data.numeroAutorizacion ?? null,
      numeroProtocoloLab: normalizarTextoOpcional(data.numeroProtocoloLaboratorio),
      diagnosticoLab: normalizarTextoOpcional(data.diagnosticoLaboratorio),
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
      numeroProtocoloLab: true,
      diagnosticoLab: true,
      matriculaEspecialista: true,
      matriculaAnestesista: true,
      facturable: true,
      importeTotal: true,
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
    numeroProtocoloLaboratorio: practica.numeroProtocoloLab,
    diagnosticoLaboratorio: practica.diagnosticoLab,
    cantidad: Number(practica.cantidad),
    importeTotal: practica.importeTotal != null ? Number(practica.importeTotal) : null,
    matriculaEspecialista: practica.matriculaEspecialista,
    matriculaAnestesista: practica.matriculaAnestesista,
    puestoNumero: null,
    ordenNumero: null,
    ordenItem: null,
    facturada: false,
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

export async function actualizarPractica(
  ingresoId: number,
  practicaId: number,
  data: ActualizarPracticaInput,
  usuario: string
): Promise<PracticaItem> {
  const cantidad = Number.isFinite(Number(data.cantidad)) && Number(data.cantidad) > 0
    ? Math.floor(Number(data.cantidad))
    : 1
  const codigoPractica = data.codigoPractica.padEnd(8).slice(0, 8)
  const numeroAutorizacion = normalizarNumeroAutorizacion(data.numeroAutorizacion)
  const numeroAutorizacionPractica = numeroAutorizacion != null ? numeroAutorizacion.slice(0, 15) : null
  const numeroAutorizacionOrden = numeroAutorizacion != null ? numeroAutorizacion.slice(0, 15) : null
  const numeroProtocoloLaboratorio = normalizarTextoOpcional(data.numeroProtocoloLaboratorio)
  const diagnosticoLaboratorio = normalizarTextoOpcional(data.diagnosticoLaboratorio)
  const convenioSolicitado =
    data.convenioId != null && Number.isFinite(Number(data.convenioId)) && Number(data.convenioId) > 0
      ? Math.floor(Number(data.convenioId))
      : null
  const importeBaseUnitario =
    data.importeBaseUnitario != null && Number.isFinite(Number(data.importeBaseUnitario))
      ? Number(data.importeBaseUnitario)
      : null

  return prisma.$transaction(async (tx) => {
    const practicaActual = await tx.practica.findFirst({
      where: {
        id: practicaId,
        ingresoId,
      },
      select: {
        id: true,
        ingresoId: true,
        convenioId: true,
        codigoPractica: true,
        fecha: true,
        cantidad: true,
        numeroAutorizacion: true,
        numeroProtocoloLab: true,
        diagnosticoLab: true,
        matriculaEspecialista: true,
        matriculaAnestesista: true,
        facturable: true,
        importeTotal: true,
        estado: true,
        usuarioRegistro: true,
        puestoNumero: true,
        ordenNumero: true,
        ordenItem: true,
        ordenPractica: {
          where: {
            orden: {
              NOT: { estado: 'X' },
            },
          },
          select: {
            puestoNumero: true,
            ordenNumero: true,
            item: true,
            numeroAutorizacion: true,
          },
        },
      },
    })

    if (!practicaActual) {
      throw new Error('Práctica no encontrada')
    }

    const estadoActual = (practicaActual.estado ?? '').trim().toUpperCase()
    if (estadoActual === 'X') {
      throw new Error('No se puede editar una práctica anulada')
    }

    if (
      practicaActual.puestoNumero != null &&
      practicaActual.ordenNumero != null &&
      Number(practicaActual.puestoNumero) > 0
    ) {
      const ordenFacturada = await tx.orden.findFirst({
        where: {
          ingresoId,
          puestoNumero: Number(practicaActual.puestoNumero),
          numero: Number(practicaActual.ordenNumero),
          NOT: { estado: 'X' },
        },
        select: { puestoNumero: true },
      })

      if (ordenFacturada) {
        throw new Error(
          'No se puede editar una práctica ya facturada. Anule la orden en Facturación para habilitar la edición.'
        )
      }
    }

    const ingreso = await tx.ingreso.findUnique({
      where: { id: ingresoId },
      select: {
        obraSocialId: true,
        obraSocialCoseguroId: true,
        obraSocial: { select: { nombre: true } },
      },
    })

    const convenioIngreso =
      ingreso?.obraSocialId != null && Number(ingreso.obraSocialId) > 0
        ? Number(ingreso.obraSocialId)
        : null

    let convenioResuelto = convenioSolicitado ?? practicaActual.convenioId ?? convenioIngreso
    if (convenioResuelto == null || convenioResuelto <= 0) {
      throw new Error('Convenio no encontrado para la internación')
    }

    const codigoTrim = codigoPractica.trim()
    if (codigoTrim === '66') {
      const descripcion = normalizarTextoOpcional(data.descripcionPractica) ?? 'PROTOCOLO BIOQUIMICO'
      await tx.nomencladorPractica.upsert({
        where: {
          convenioId_codigo: {
            convenioId: convenioResuelto,
            codigo: codigoPractica,
          },
        },
        update: {},
        create: {
          convenioId: convenioResuelto,
          codigo: codigoPractica,
          descripcion,
        },
      })
    }

    let importeTotal: number | null = null
    if (importeBaseUnitario != null && importeBaseUnitario > 0) {
      importeTotal = Number((importeBaseUnitario * cantidad).toFixed(2))
    } else {
      const cantidadActual = Number(practicaActual.cantidad)
      if (practicaActual.importeTotal != null && Number.isFinite(cantidadActual) && cantidadActual > 0) {
        const importeUnitarioPrevio = Number(practicaActual.importeTotal) / cantidadActual
        if (Number.isFinite(importeUnitarioPrevio) && importeUnitarioPrevio > 0) {
          importeTotal = Number((importeUnitarioPrevio * cantidad).toFixed(2))
        }
      }

      if (importeTotal == null && ingreso) {
        const regla = resolverReglaFacturacion(
          ingreso.obraSocial?.nombre,
          Boolean(ingreso.obraSocialCoseguroId)
        )
        const valorPractica = await obtenerValorPractica(codigoTrim)
        if (valorPractica > 0) {
          const cobertura = calcularImporteFacturable(valorPractica, cantidad, regla)
          importeTotal = cobertura.importeTotalFacturable > 0 ? cobertura.importeTotalFacturable : null
        }
      }
    }

    const actualizada = await tx.practica.update({
      where: { id: practicaActual.id },
      data: {
        convenioId: convenioResuelto,
        codigoPractica,
        fecha: data.fecha,
        cantidad,
        numeroAutorizacion: numeroAutorizacionPractica,
        numeroProtocoloLab: numeroProtocoloLaboratorio,
        diagnosticoLab: diagnosticoLaboratorio,
        matriculaEspecialista: data.matriculaEspecialista ?? null,
        matriculaAnestesista: data.matriculaAnestesista ?? null,
        facturable: data.facturable,
        importeTotal,
        usuarioRegistro: usuario.slice(0, 10),
        fechaUsuario: new Date(),
      },
      select: {
        id: true,
        ingresoId: true,
        convenioId: true,
        codigoPractica: true,
        fecha: true,
        cantidad: true,
        numeroAutorizacion: true,
        numeroProtocoloLab: true,
        diagnosticoLab: true,
        matriculaEspecialista: true,
        matriculaAnestesista: true,
        facturable: true,
        importeTotal: true,
        estado: true,
        usuarioRegistro: true,
        puestoNumero: true,
        ordenNumero: true,
        ordenItem: true,
      },
    })

    const ordenesVinculadas = practicaActual.ordenPractica ?? []
    if (ordenesVinculadas.length > 0) {
      for (const item of ordenesVinculadas) {
        await tx.ordenPractica.update({
          where: {
            puestoNumero_ordenNumero_item: {
              puestoNumero: item.puestoNumero,
              ordenNumero: item.ordenNumero,
              item: item.item,
            },
          },
          data: {
            convenioId: convenioResuelto,
            codigoPractica: codigoTrim,
            fecha: data.fecha,
            cantidad,
            numeroAutorizacion: numeroAutorizacionOrden,
            importeTotal,
          },
        })
      }

      const ordenesRecalcular = Array.from(
        new Set(ordenesVinculadas.map((item) => `${item.puestoNumero}:${item.ordenNumero}`))
      )

      for (const clave of ordenesRecalcular) {
        const [puestoRaw, numeroRaw] = clave.split(':')
        const puestoNumero = Number.parseInt(puestoRaw ?? '0', 10)
        const ordenNumero = Number.parseInt(numeroRaw ?? '0', 10)
        if (!Number.isFinite(puestoNumero) || !Number.isFinite(ordenNumero)) continue

        const itemsOrden = await tx.ordenPractica.findMany({
          where: {
            puestoNumero,
            ordenNumero,
          },
          select: { importeTotal: true },
        })

        const total = itemsOrden.reduce((sum, row) => sum + Number(row.importeTotal ?? 0), 0)

        await tx.orden.update({
          where: {
            puestoNumero_numero: {
              puestoNumero,
              numero: ordenNumero,
            },
          },
          data: {
            importeTotal: total,
          },
        })
      }
    }

    const ordenesPracticaActualizada = await tx.ordenPractica.findMany({
      where: {
        practicaId: actualizada.id,
        orden: {
          NOT: { estado: 'X' },
        },
      },
      select: {
        puestoNumero: true,
        ordenNumero: true,
        item: true,
        numeroAutorizacion: true,
      },
      orderBy: [{ item: 'asc' }],
    })

    const nomenclador = await tx.nomencladorPractica.findFirst({
      where: {
        convenioId: actualizada.convenioId,
        codigo: actualizada.codigoPractica.trim(),
      },
      select: {
        descripcion: true,
        valorEspecialista: true,
        valorAyudante: true,
        valorAnestesista: true,
        valorGastos: true,
      },
    })

    const descripcionBase = nomenclador?.descripcion ?? actualizada.codigoPractica.trim()
    const componentes: ComponentesPractica | null = nomenclador
      ? {
        valorEspecialista: nomenclador.valorEspecialista != null ? Number(nomenclador.valorEspecialista) : null,
        valorAyudante: nomenclador.valorAyudante != null ? Number(nomenclador.valorAyudante) : null,
        valorAnestesista: nomenclador.valorAnestesista != null ? Number(nomenclador.valorAnestesista) : null,
        valorGastos: nomenclador.valorGastos != null ? Number(nomenclador.valorGastos) : null,
      }
      : null

    return {
      ...actualizada,
      usuario: actualizada.usuarioRegistro,
      descripcionPractica: construirDescripcionPractica({
        descripcionBase,
        matriculaEspecialista: actualizada.matriculaEspecialista,
        matriculaAnestesista: actualizada.matriculaAnestesista,
        importeTotal: actualizada.importeTotal != null ? Number(actualizada.importeTotal) : null,
        cantidad: Number(actualizada.cantidad),
        componentes,
      }),
      numeroProtocoloLaboratorio: actualizada.numeroProtocoloLab,
      diagnosticoLaboratorio: actualizada.diagnosticoLab,
      cantidad: Number(actualizada.cantidad),
      importeTotal: actualizada.importeTotal != null ? Number(actualizada.importeTotal) : null,
      matriculaEspecialista: actualizada.matriculaEspecialista,
      matriculaAnestesista: actualizada.matriculaAnestesista,
      puestoNumero: actualizada.puestoNumero,
      ordenNumero: actualizada.ordenNumero,
      ordenItem: actualizada.ordenItem,
      facturada: false,
      ordenPractica: ordenesPracticaActualizada.map((op) => ({
        puestoNumero: op.puestoNumero,
        ordenNumero: op.ordenNumero,
        item: op.item,
        numeroAutorizacion: op.numeroAutorizacion,
      })),
    } as PracticaItem
  })
}

export async function desagruparPracticaNoAutorizada(
  ingresoId: number,
  practicaId: number,
  usuario: string
): Promise<PracticaItem[]> {
  return prisma.$transaction(async (tx) => {
    const practica = await tx.practica.findFirst({
      where: {
        id: practicaId,
        ingresoId,
      },
      select: {
        id: true,
        ingresoId: true,
        convenioId: true,
        codigoPractica: true,
        convenioValorId: true,
        fecha: true,
        cantidad: true,
        numeroAutorizacion: true,
        numeroProtocoloLab: true,
        diagnosticoLab: true,
        matriculaEspecialista: true,
        matriculaAnestesista: true,
        obraSocialId: true,
        planId: true,
        facturable: true,
        motivoNoFactura: true,
        importeTotal: true,
        puestoNumero: true,
        ordenNumero: true,
        ordenItem: true,
        estado: true,
        usuarioRegistro: true,
        fechaUsuario: true,
        ordenPractica: {
          where: {
            orden: {
              NOT: { estado: 'X' },
            },
          },
          select: {
            puestoNumero: true,
            ordenNumero: true,
            item: true,
          },
        },
      },
    })

    if (!practica) {
      throw new Error('Práctica no encontrada')
    }

    const estadoActual = (practica.estado ?? '').trim().toUpperCase()
    if (estadoActual === 'X') {
      throw new Error('No se puede desagrupar una práctica anulada')
    }

    if ((practica.ordenPractica?.length ?? 0) > 0) {
      throw new Error('No se puede desagrupar una práctica que ya tiene una orden/autorización asociada')
    }

    if (normalizarNumeroAutorizacion(practica.numeroAutorizacion) != null) {
      throw new Error('No se puede desagrupar una práctica que ya tiene número de autorización')
    }

    const cantidadActual = Number.isFinite(Number(practica.cantidad)) && Number(practica.cantidad) > 0
      ? Math.floor(Number(practica.cantidad))
      : 1

    if (cantidadActual <= 1) {
      throw new Error('La práctica ya está desagrupada')
    }

    const codigoPracticaTrim = practica.codigoPractica.trim()
    const nomenclador = await tx.nomencladorPractica.findFirst({
      where: {
        convenioId: practica.convenioId,
        codigo: codigoPracticaTrim,
      },
      select: {
        descripcion: true,
        valorEspecialista: true,
        valorAyudante: true,
        valorAnestesista: true,
        valorGastos: true,
      },
    })

    const descripcionBase = nomenclador?.descripcion ?? codigoPracticaTrim
    const componentes: ComponentesPractica | null = nomenclador
      ? {
        valorEspecialista:
            nomenclador.valorEspecialista != null ? Number(nomenclador.valorEspecialista) : null,
        valorAyudante:
            nomenclador.valorAyudante != null ? Number(nomenclador.valorAyudante) : null,
        valorAnestesista:
            nomenclador.valorAnestesista != null ? Number(nomenclador.valorAnestesista) : null,
        valorGastos:
            nomenclador.valorGastos != null ? Number(nomenclador.valorGastos) : null,
      }
      : null

    const importeUnitario =
      practica.importeTotal != null
        ? Number((Number(practica.importeTotal) / cantidadActual).toFixed(2))
        : null

    const actualizado = await tx.practica.update({
      where: { id: practica.id },
      data: {
        cantidad: 1,
        importeTotal: importeUnitario,
        usuarioRegistro: usuario.slice(0, 10),
        fechaUsuario: new Date(),
      },
      select: {
        id: true,
        ingresoId: true,
        convenioId: true,
        codigoPractica: true,
        fecha: true,
        cantidad: true,
        numeroAutorizacion: true,
        numeroProtocoloLab: true,
        diagnosticoLab: true,
        matriculaEspecialista: true,
        matriculaAnestesista: true,
        facturable: true,
        importeTotal: true,
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

    const creadas: Array<typeof actualizado> = []
    for (let i = 1; i < cantidadActual; i += 1) {
      const creada = await tx.practica.create({
        data: {
          ingresoId: practica.ingresoId,
          convenioId: practica.convenioId,
          codigoPractica: practica.codigoPractica,
          convenioValorId: practica.convenioValorId,
          fecha: practica.fecha,
          cantidad: 1,
          numeroAutorizacion: null,
          numeroProtocoloLab: practica.numeroProtocoloLab,
          diagnosticoLab: practica.diagnosticoLab,
          matriculaEspecialista: practica.matriculaEspecialista,
          matriculaAnestesista: practica.matriculaAnestesista,
          obraSocialId: practica.obraSocialId,
          planId: practica.planId,
          facturable: practica.facturable,
          motivoNoFactura: practica.motivoNoFactura,
          importeTotal: importeUnitario,
          estado: practica.estado,
          usuarioRegistro: usuario.slice(0, 10),
          fechaUsuario: new Date(),
        },
        select: {
          id: true,
          ingresoId: true,
          convenioId: true,
          codigoPractica: true,
          fecha: true,
          cantidad: true,
          numeroAutorizacion: true,
          numeroProtocoloLab: true,
          diagnosticoLab: true,
          matriculaEspecialista: true,
          matriculaAnestesista: true,
          facturable: true,
          importeTotal: true,
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
      creadas.push(creada)
    }

    return [actualizado, ...creadas].map((row) => ({
      ...row,
      usuario: row.usuarioRegistro,
      descripcionPractica: construirDescripcionPractica({
        descripcionBase,
        matriculaEspecialista: row.matriculaEspecialista,
        matriculaAnestesista: row.matriculaAnestesista,
        importeTotal: row.importeTotal != null ? Number(row.importeTotal) : null,
        cantidad: Number(row.cantidad),
        componentes,
      }),
      numeroProtocoloLaboratorio: row.numeroProtocoloLab,
      diagnosticoLaboratorio: row.diagnosticoLab,
      cantidad: Number(row.cantidad),
      importeTotal: row.importeTotal != null ? Number(row.importeTotal) : null,
      matriculaEspecialista: row.matriculaEspecialista,
      matriculaAnestesista: row.matriculaAnestesista,
      ordenPractica: Array.isArray(row.ordenPractica)
        ? row.ordenPractica.map((op) => ({
          puestoNumero: op.puestoNumero,
          ordenNumero: op.ordenNumero,
          item: op.item,
          numeroAutorizacion: op.numeroAutorizacion,
        }))
        : [],
    })) as PracticaItem[]
  })
}

export async function eliminarPracticaNoAutorizada(
  ingresoId: number,
  practicaId: number,
  usuario: string
): Promise<{ id: number; ingresoId: number; codigoPractica: string }> {
  return prisma.$transaction(async (tx) => {
    const practica = await tx.practica.findFirst({
      where: {
        id: practicaId,
        ingresoId,
      },
      select: {
        id: true,
        ingresoId: true,
        estado: true,
        codigoPractica: true,
        numeroAutorizacion: true,
        puestoNumero: true,
        ordenNumero: true,
        ordenPractica: {
          where: {
            orden: {
              NOT: { estado: 'X' },
            },
          },
          select: {
            puestoNumero: true,
            ordenNumero: true,
            item: true,
          },
        },
      },
    })

    if (!practica) {
      throw new Error('Práctica no encontrada')
    }

    const estadoActual = (practica.estado ?? '').trim().toUpperCase()
    const codigoPracticaTrim = practica.codigoPractica.trim()

    // Idempotencia: si ya fue anulada anteriormente, devolver OK para que la UI se sincronice.
    if (estadoActual === 'X') {
      return {
        id: practica.id,
        ingresoId: practica.ingresoId,
        codigoPractica: codigoPracticaTrim,
      }
    }

    if ((practica.ordenPractica?.length ?? 0) > 0) {
      throw new Error('No se puede eliminar una práctica que ya tiene una orden/autorización asociada')
    }

    // Fallback legacy: práctica con punteros a orden activa aunque no tenga vínculo explícito.
    if (
      practica.puestoNumero != null &&
      practica.ordenNumero != null &&
      Number(practica.puestoNumero) > 0
    ) {
      const ordenActiva = await tx.orden.findFirst({
        where: {
          ingresoId,
          puestoNumero: Number(practica.puestoNumero),
          numero: Number(practica.ordenNumero),
          NOT: { estado: 'X' },
        },
        select: { puestoNumero: true },
      })

      if (ordenActiva) {
        throw new Error('No se puede eliminar una práctica que ya tiene una orden/autorización asociada')
      }
    }

    const usuarioRegistro = usuario.trim().slice(0, 10) || 'SISTEMA'
    await tx.practica.update({
      where: { id: practica.id },
      data: {
        estado: 'X',
        numeroAutorizacion: null,
        fechaUsuario: new Date(),
        usuarioRegistro,
      },
    })

    // Si la práctica pertenece a una cirugía programada vinculada, eliminar también una práctica espejo pendiente.
    if (codigoPracticaTrim.length > 0) {
      const cirugia = await tx.cirugiaProgramada.findFirst({
        where: {
          internacionId: ingresoId,
          practicas: {
            some: {
              codigo: { startsWith: codigoPracticaTrim },
              numeroAutorizacion: null,
            },
          },
        },
        orderBy: { id: 'desc' },
        select: {
          id: true,
          practicas: {
            where: {
              codigo: { startsWith: codigoPracticaTrim },
              numeroAutorizacion: null,
            },
            orderBy: { id: 'desc' },
            take: 1,
            select: { id: true },
          },
        },
      })

      const practicaCirugiaId = cirugia?.practicas?.[0]?.id
      if (practicaCirugiaId) {
        await tx.cirugiaPractica.delete({ where: { id: practicaCirugiaId } })
      }
    }

    return {
      id: practica.id,
      ingresoId: practica.ingresoId,
      codigoPractica: codigoPracticaTrim,
    }
  }, { timeout: 30000, maxWait: 10000 })
}

export async function crearCirugiaUrgencia(
  data: CrearCirugiaUrgenciaInput,
  usuario: string
): Promise<CirugiaUrgenciaItem> {
  const observacionesStructured = [
    'Tipo: CIRUGIA',
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
              descripcion: 'Diferenciales de cirugía',
              esFeriado: data.diferenciales.esFeriado,
              esNocturna: data.diferenciales.esNocturna,
              mismaViaPatologia: data.diferenciales.mismaViaPatologia,
              diferentesViasPatologia: data.diferenciales.diferentesViasPatologia,
              diferentesViasDiferentesPatologia: data.diferenciales.diferentesViasDiferentesPatologia,
              dobleCirugia:
                data.diferenciales.mismaViaPatologia ||
                data.diferenciales.diferentesViasPatologia ||
                data.diferenciales.diferentesViasDiferentesPatologia,
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
            dobleCirugia: true,
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

export async function crearCirugiaSimpleConDescripcion(
  data: CrearCirugiaSimpleInput,
  usuario: string
): Promise<CirugiaUrgenciaItem> {
  const observacionesStructured = [
    'Tipo: FICHA_QUIRURGICA',
    `Observaciones: ${data.descripcion.trim()}`,
    `Usuario: ${usuario}`,
  ]
    .filter(Boolean)
    .join(' | ')
    .slice(0, 500)

  const cirugia = await prisma.cirugiaProgramada.create({
    data: {
      pacienteId: data.pacienteId,
      internacionId: data.ingresoId,
      fechaCirugia: new Date(data.fechaCirugia),
      horaCirugia: data.horaCirugia ?? null,
      observaciones: observacionesStructured,
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
          dobleCirugia: true,
        },
      },
    },
  })

  return {
    ...cirugia,
    practicas: cirugia.practicas.map((p) => ({
      ...p,
      cantidad: Number(p.cantidad),
    })),
  } as CirugiaUrgenciaItem
}

export async function guardarCondicionalCirugiaMultiple(
  data: GuardarCondicionalCirugiaMultipleInput
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const cirugia = await tx.cirugiaProgramada.findFirst({
      where: {
        id: data.cirugiaId,
        internacionId: data.ingresoId,
      },
      select: { id: true },
    })

    if (!cirugia) {
      throw new Error('Cirugia no encontrada para el ingreso indicado')
    }

    const mismaViaPatologia =
      data.cirugiasMultiples && data.tipoCirugiaMultiple === 'MISMA_VIA_DISTINTA_PATOLOGIA'
    const diferentesViasDiferentesPatologia =
      data.cirugiasMultiples && data.tipoCirugiaMultiple === 'DISTINTA_VIA_DISTINTA_PATOLOGIA'

    const payload = {
      esFeriado: false,
      esNocturna: false,
      mismaViaPatologia,
      diferentesViasPatologia: false,
      diferentesViasDiferentesPatologia,
      dobleCirugia: data.cirugiasMultiples,
      practicaBaseId: null,
    }

    const existentes = await tx.cirugiaDiferencial.count({ where: { cirugiaId: cirugia.id } })

    if (existentes === 0) {
      await tx.cirugiaDiferencial.create({
        data: {
          cirugiaId: cirugia.id,
          tipo: 'QUIRURGICA',
          descripcion: 'Diferenciales de cirugia multiples configurados en internacion',
          ...payload,
        },
      })
      return
    }

    await tx.cirugiaDiferencial.updateMany({
      where: { cirugiaId: cirugia.id },
      data: payload,
    })
  })
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
        fecha: data.fecha ?? new Date(),
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

export async function actualizarObservacionesInternacion(
  ingresoId: number,
  observaciones: string | null | undefined,
  usuario: string
): Promise<{ ingresoId: number; observaciones: string | null }> {
  const ingreso = await prisma.ingreso.findUnique({
    where: { id: ingresoId },
    select: { id: true, tipoIngresoCodigo: true },
  })

  if (!ingreso || ingreso.tipoIngresoCodigo !== 'INT') {
    throw new Error('Internacion no encontrada')
  }

  const actualizado = await prisma.ingreso.update({
    where: { id: ingresoId },
    data: {
      observaciones: observaciones ?? null,
      fechaEstado: new Date(),
      usuario: usuario.slice(0, 10),
    },
    select: {
      id: true,
      observaciones: true,
    },
  })

  return {
    ingresoId: actualizado.id,
    observaciones: actualizado.observaciones ?? null,
  }
}

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
