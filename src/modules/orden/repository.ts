import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import type { CrearOrdenInput } from './schemas'
import type {
  AdmisionActivaItem,
  AdmisionOrdenContexto,
  OrdenConItems,
  OrdenListItem,
  NomencladorPracticaItem,
} from './types'
import { generarCodigoBarras } from './types'

const PUESTO_NUMERO = 1 // Número de puesto fijo (configurable a futuro)

async function resolverTipoOrdenCodigo(
  tx: Prisma.TransactionClient,
  tipoOrdenCodigoInput: string
): Promise<string> {
  const normalized = tipoOrdenCodigoInput.trim().toUpperCase().slice(0, 3)
  const candidate = normalized === 'AMB' || normalized.length === 0 ? 'PRA' : normalized

  const exact = await tx.tipoOrden.findUnique({
    where: { codigo: candidate },
    select: { codigo: true },
  })
  if (exact) return exact.codigo

  const pra =
    candidate === 'PRA'
      ? null
      : await tx.tipoOrden.findUnique({
        where: { codigo: 'PRA' },
        select: { codigo: true },
      })
  if (pra) return pra.codigo

  const fallback = await tx.tipoOrden.findFirst({
    orderBy: { codigo: 'asc' },
    select: { codigo: true },
  })
  if (fallback) return fallback.codigo

  throw new Error('No hay tipos de orden cargados en TipoOrden.')
}

/**
 * Resuelve un par convenioId+codigoPractica válido para la FK de NPractica.
 * Si el código no existe en el nomenclador, busca el código en cualquier convenio,
 * o como último recurso usa el primer registro disponible del convenio.
 */
async function resolverNomenclador(
  tx: Prisma.TransactionClient,
  convenioId: number,
  codigoPractica: string
): Promise<{ convenioId: number; codigoPractica: string }> {
  const codigo = codigoPractica.trim().slice(0, 8).padEnd(8, ' ')

  // 1. Exacto: convenio + código pedidos
  const exacto = await tx.nomencladorPractica.findUnique({
    where: { convenioId_codigo: { convenioId, codigo } },
    select: { convenioId: true, codigo: true },
  })
  if (exacto) return { convenioId: exacto.convenioId, codigoPractica: exacto.codigo }

  // 2. Sin padding: trim del código en cualquier variante
  const codigoTrim = codigoPractica.trim().slice(0, 8)
  const porCodigo = await tx.nomencladorPractica.findFirst({
    where: { convenioId, codigo: { startsWith: codigoTrim } },
    select: { convenioId: true, codigo: true },
  })
  if (porCodigo) return { convenioId: porCodigo.convenioId, codigoPractica: porCodigo.codigo }

  // 3. El código en cualquier convenio
  const globalCodigo = await tx.nomencladorPractica.findFirst({
    where: { codigo: { startsWith: codigoTrim } },
    select: { convenioId: true, codigo: true },
  })
  if (globalCodigo) return { convenioId: globalCodigo.convenioId, codigoPractica: globalCodigo.codigo }

  // 4. Fallback: cualquier práctica del convenio
  const fallbackConvenio = await tx.nomencladorPractica.findFirst({
    where: { convenioId },
    select: { convenioId: true, codigo: true },
    orderBy: { codigo: 'asc' },
  })
  if (fallbackConvenio) return { convenioId: fallbackConvenio.convenioId, codigoPractica: fallbackConvenio.codigo }

  // 5. Fallback global: cualquier entrada del nomenclador
  const fallbackGlobal = await tx.nomencladorPractica.findFirst({
    select: { convenioId: true, codigo: true },
    orderBy: [{ convenioId: 'asc' }, { codigo: 'asc' }],
  })
  if (fallbackGlobal) return { convenioId: fallbackGlobal.convenioId, codigoPractica: fallbackGlobal.codigo }

  throw new Error('No hay prácticas en el nomenclador. Cargá el nomenclador antes de crear órdenes.')
}

async function resolverPlanOrden(
  tx: Prisma.TransactionClient,
  obraSocialId: number,
  planId: number | null | undefined,
  usuarioRegistro: string
): Promise<number> {
  if (planId) {
    const planExistente = await tx.planObraSocial.findUnique({
      where: {
        obraSocialId_id: {
          obraSocialId,
          id: planId,
        },
      },
      select: { id: true },
    })

    if (planExistente) return planExistente.id
  }

  const primerPlan = await tx.planObraSocial.findFirst({
    where: { obraSocialId, estado: 'A' },
    orderBy: { id: 'asc' },
    select: { id: true },
  })
  if (primerPlan) return primerPlan.id

  const ultimoPlan = await tx.planObraSocial.findFirst({
    where: { obraSocialId },
    orderBy: { id: 'desc' },
    select: { id: true },
  })
  const nuevoPlanId = (ultimoPlan?.id ?? 0) + 1

  const planCreado = await tx.planObraSocial.create({
    data: {
      obraSocialId,
      id: nuevoPlanId,
      descripcion: 'SIN PLAN',
      norma: null,
      exportarIOSE: null,
      codigoAnterior: null,
      estado: 'A',
      fechaEstado: new Date(),
      usuarioRegistro,
    },
    select: { id: true },
  })

  return planCreado.id
}

// ============================================
// CREAR ORDEN
// ============================================

export async function crearOrden(data: CrearOrdenInput, usuario: string) {
  return prisma.$transaction(async (tx) => {
    const usuarioRegistro = usuario.trim().slice(0, 10) || 'SISTEMA'
    const tipoOrdenCodigo = await resolverTipoOrdenCodigo(tx, data.tipoOrdenCodigo)
    const planId = await resolverPlanOrden(tx, data.obraSocialId, data.planId, usuarioRegistro)

    // Obtener próximo número de orden
    const ultimo = await tx.orden.findFirst({
      where: { puestoNumero: PUESTO_NUMERO },
      orderBy: { numero: 'desc' },
      select: { numero: true },
    })
    const numero = (ultimo?.numero ?? 0) + 1
    const totalOrden = data.items.reduce((sum, item) => sum + Number(item.importeTotal ?? 0), 0)

    const orden = await tx.orden.create({
      data: {
        puestoNumero: PUESTO_NUMERO,
        numero,
        ingresoId: data.ingresoId ?? null,
        pacienteId: data.pacienteId ?? null,
        nombrePaciente: data.nombrePaciente,
        numeroAfiliado: data.numeroAfiliado,
        obraSocialId: data.obraSocialId,
        planId,
        obraSocialCoseguroId: data.obraSocialCoseguroId ?? null,
        planCoseguroId: data.planCoseguroId ?? null,
        profesionalId: data.profesionalId,
        tipoOrdenCodigo,
        descripcionPatologia: data.descripcionPatologia ?? null,
        fechaEmision: new Date(),
        fechaPedido: new Date(),
        importeTotal: totalOrden,
        estado: 'A',
        fechaEstado: new Date(),
        usuarioRegistro,
        items: {
          create: data.items.map((item, idx) => ({
            item: idx + 1,
            convenioId: item.convenioId,
            codigoPractica: item.codigoPractica.trim().slice(0, 8),
            cantidad: item.cantidad,
            tipoFacturacion: item.tipoFacturacion ?? 'H',
            importeTotal: item.importeTotal ?? null,
            porcentajeCargoPac: item.porcentajeCargoPac ?? null,
            fecha: new Date(),
            numeroAutorizacion:
              item.numeroAutorizacion?.trim() || generarCodigoBarras(PUESTO_NUMERO, numero, idx + 1),
          })),
        },
      },
      include: {
        items: true,
        obraSocial: { select: { id: true, nombre: true } },
        plan: { select: { id: true, descripcion: true } },
        profesional: { select: { id: true, nombre: true, matricula: true } },
        tipoOrden: { select: { codigo: true, descripcion: true } },
      },
    })

    return orden
  })
}

// ============================================
// OBTENER ORDEN
// ============================================

export async function obtenerOrden(
  puestoNumero: number,
  numero: number
): Promise<OrdenConItems | null> {
  const orden = await prisma.orden.findUnique({
    where: { puestoNumero_numero: { puestoNumero, numero } },
    include: {
      items: {
        orderBy: { item: 'asc' },
        include: {
          nomencladorPractica: { select: { descripcion: true } },
        },
      },
      obraSocial: { select: { id: true, nombre: true } },
      plan: { select: { id: true, descripcion: true } },
      profesional: { select: { id: true, nombre: true, matricula: true } },
      ingreso: { select: { numeroIngreso: true, tipoIngresoCodigo: true } },
      tipoOrden: { select: { codigo: true, descripcion: true } },
    },
  })

  if (!orden) return null

  const ingresoRelacionado =
    orden.ingreso ??
    (orden.pacienteId
      ? await prisma.ingreso.findFirst({
        where: { pacienteId: orden.pacienteId },
        orderBy: [{ fechaIngreso: 'desc' }, { id: 'desc' }],
        select: { numeroIngreso: true, tipoIngresoCodigo: true },
      })
      : null)

  return {
    puestoNumero: orden.puestoNumero,
    numero: orden.numero,
    ingresoId: orden.ingresoId,
    ingresoNumero: ingresoRelacionado?.numeroIngreso ?? null,
    ingresoTipoCodigo: ingresoRelacionado?.tipoIngresoCodigo ?? null,
    pacienteId: orden.pacienteId,
    nombrePaciente: orden.nombrePaciente,
    numeroAfiliado: orden.numeroAfiliado,
    obraSocialId: orden.obraSocialId,
    planId: orden.planId,
    obraSocialCoseguroId: orden.obraSocialCoseguroId,
    planCoseguroId: orden.planCoseguroId,
    profesionalId: orden.profesionalId,
    tipoOrdenCodigo: orden.tipoOrdenCodigo,
    descripcion: orden.descripcion,
    descripcionPatologia: orden.descripcionPatologia,
    fechaEmision: orden.fechaEmision,
    fechaPedido: orden.fechaPedido,
    importeTotal: orden.importeTotal ? Number(orden.importeTotal) : null,
    estado: orden.estado,
    usuarioRegistro: orden.usuarioRegistro,
    obraSocial: orden.obraSocial,
    plan: orden.plan,
    profesional: orden.profesional
      ? {
        id: orden.profesional.id,
        nombre: orden.profesional.nombre,
        matricula: orden.profesional.matricula,
      }
      : null,
    tipoOrden: orden.tipoOrden,
    items: orden.items.map((it) => ({
      puestoNumero: it.puestoNumero,
      ordenNumero: it.ordenNumero,
      item: it.item,
      convenioId: it.convenioId,
      codigoPractica: it.codigoPractica.trim(),
      descripcionPractica: it.nomencladorPractica?.descripcion ?? it.codigoPractica.trim(),
      cantidad: Number(it.cantidad),
      tipoFacturacion: it.tipoFacturacion,
      numeroAutorizacion: it.numeroAutorizacion,
      importeTotal: it.importeTotal ? Number(it.importeTotal) : null,
      porcentajeCargoPac: it.porcentajeCargoPac ? Number(it.porcentajeCargoPac) : null,
      fecha: it.fecha,
    })),
  }
}

// ============================================
// LISTAR ÓRDENES
// ============================================

export async function listarOrdenes(params: {
  skip?: number
  take?: number
  pendiente?: boolean
}): Promise<{ ordenes: OrdenListItem[]; total: number }> {
  const where: Prisma.OrdenWhereInput =
    params.pendiente === true
      ? { numeroAutorizacion: null }
      : params.pendiente === false
        ? { numeroAutorizacion: { not: null } }
        : {}

  const [rows, total] = await Promise.all([
    prisma.orden.findMany({
      where,
      skip: params.skip ?? 0,
      take: params.take ?? 20,
      orderBy: [{ puestoNumero: 'desc' }, { numero: 'desc' }],
      select: {
        puestoNumero: true,
        numero: true,
        ingresoId: true,
        nombrePaciente: true,
        numeroAutorizacion: true,
        fechaEmision: true,
        estado: true,
        obraSocial: { select: { nombre: true } },
        plan: { select: { descripcion: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.orden.count({ where }),
  ])

  return {
    total,
    ordenes: rows.map((o) => ({
      puestoNumero: o.puestoNumero,
      numero: o.numero,
      ingresoId: o.ingresoId,
      nombrePaciente: o.nombrePaciente,
      obraSocialNombre: o.obraSocial?.nombre ?? '',
      planDescripcion: o.plan?.descripcion ?? '',
      fechaEmision: o.fechaEmision,
      estado: o.estado,
      cantidadItems: o._count.items,
      numeroAutorizacion: o.numeroAutorizacion,
    })),
  }
}

// ============================================
// ADMISIÓN ACTIVA PARA FLUJO DE AUTORIZACIÓN
// ============================================

export async function buscarAdmisionesActivasPorPaciente(query: string): Promise<AdmisionActivaItem[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const esNumerico = /^\d+$/.test(q)
  const where: Prisma.IngresoWhereInput = {
    estado: 'A',
    OR: esNumerico
      ? [
        { numeroIngreso: parseInt(q, 10) },
        { paciente: { numeroDocumento: parseInt(q, 10) } },
        { nombre: { contains: q, mode: 'insensitive' } },
      ]
      : [
        { nombre: { contains: q, mode: 'insensitive' } },
        { paciente: { nombreCompleto: { contains: q, mode: 'insensitive' } } },
      ],
  }

  const rows = await prisma.ingreso.findMany({
    where,
    orderBy: [{ fechaIngreso: 'desc' }, { id: 'desc' }],
    take: 30,
    select: {
      id: true,
      tipoIngresoCodigo: true,
      numeroIngreso: true,
      fechaIngreso: true,
      estado: true,
      nombre: true,
      paciente: {
        select: {
          id: true,
          nombreCompleto: true,
          numeroDocumento: true,
          obraSocialId: true,
          numeroAfiliado: true,
        },
      },
      obraSocial: { select: { id: true, nombre: true } },
      plan: { select: { id: true, descripcion: true } },
    },
  })

  return rows as AdmisionActivaItem[]
}

export async function obtenerContextoAdmisionParaOrden(
  ingresoId: number
): Promise<AdmisionOrdenContexto | null> {
  const ingreso = await prisma.ingreso.findFirst({
    where: { id: ingresoId, estado: 'A' },
    select: {
      id: true,
      tipoIngresoCodigo: true,
      numeroIngreso: true,
      fechaIngreso: true,
      descripcionPatologia: true,
      obraSocialId: true,
      planId: true,
      numeroAfiliado: true,
      paciente: {
        select: {
          id: true,
          apellido: true,
          nombre: true,
          nombreCompleto: true,
          tipoDocumento: true,
          numeroDocumento: true,
          fechaNacimiento: true,
          sexo: true,
          domicilio: true,
          telefonoFijo: true,
          celular1: true,
          email: true,
          obraSocialId: true,
          planId: true,
          numeroAfiliado: true,
        },
      },
      obraSocial: { select: { id: true, nombre: true } },
      plan: { select: { id: true, descripcion: true } },
      practicas: {
        where: { OR: [{ estado: 'A' }, { estado: null }] },
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          convenioId: true,
          codigoPractica: true,
          cantidad: true,
          fecha: true,
          numeroAutorizacion: true,
          importeTotal: true,
          nomencladorPractica: { select: { descripcion: true } },
        },
      },
      medicaciones: {
        where: { estado: { in: ['A', 'S'] } },
        orderBy: [{ fechaInicio: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          nombre: true,
          dosis: true,
          viaAdministracion: true,
          frecuencia: true,
          fechaInicio: true,
          estado: true,
        },
      },
    },
  })

  if (!ingreso) return null

  return {
    ...ingreso,
    practicas: ingreso.practicas.map((p) => ({
      id: p.id,
      convenioId: p.convenioId,
      codigoPractica: p.codigoPractica.trim(),
      descripcionPractica: p.nomencladorPractica?.descripcion ?? p.codigoPractica.trim(),
      cantidad: Number(p.cantidad),
      fecha: p.fecha,
      numeroAutorizacion: p.numeroAutorizacion,
      importeTotal: p.importeTotal != null ? Number(p.importeTotal) : null,
    })),
  } as AdmisionOrdenContexto
}

// ============================================
// BUSCAR PRÁCTICAS EN NOMENCLADOR
// ============================================

export async function buscarPracticas(
  query: string,
  convenioId?: number
): Promise<NomencladorPracticaItem[]> {
  const whereBase = {
    OR: [
      { descripcion: { contains: query, mode: 'insensitive' as const } },
      { codigo: { contains: query, mode: 'insensitive' as const } },
    ],
  }

  const porConvenio = await prisma.nomencladorPractica.findMany({
    where: {
      ...(convenioId ? { convenioId } : {}),
      ...whereBase,
    },
    take: 20,
    orderBy: { descripcion: 'asc' },
    select: { convenioId: true, codigo: true, descripcion: true },
  })

  if (!convenioId || porConvenio.length > 0) return enriquecerPracticasConValor(porConvenio)

  // Si el convenio elegido no tiene esa práctica, hacemos fallback global.
  const fallback = await prisma.nomencladorPractica.findMany({
    where: whereBase,
    take: 20,
    orderBy: { descripcion: 'asc' },
    select: { convenioId: true, codigo: true, descripcion: true },
  })

  return enriquecerPracticasConValor(fallback)
}

async function enriquecerPracticasConValor(
  practicas: Array<{ convenioId: number; codigo: string; descripcion: string }>
): Promise<NomencladorPracticaItem[]> {
  const codigos = Array.from(new Set(practicas.map((p) => p.codigo.trim()).filter(Boolean)))
  const prestaciones = codigos.length
    ? await prisma.nomencladorPrestacion.findMany({
      where: { codigo: { in: codigos } },
      select: { codigo: true, valor: true },
    })
    : []

  const valorPorCodigo = new Map(
    prestaciones.map((prestacion) => [prestacion.codigo.trim(), Number(prestacion.valor ?? 0)])
  )

  return practicas.map((practica) => ({
    ...practica,
    valor: valorPorCodigo.get(practica.codigo.trim()) ?? null,
  }))
}
