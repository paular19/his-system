import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import type { CrearOrdenInput } from './schemas'
import type { OrdenConItems, OrdenListItem, NomencladorPracticaItem } from './types'
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

// ============================================
// CREAR ORDEN
// ============================================

export async function crearOrden(data: CrearOrdenInput, usuario: string) {
  return prisma.$transaction(async (tx) => {
    const usuarioRegistro = usuario.trim().slice(0, 10) || 'SISTEMA'
    const tipoOrdenCodigo = await resolverTipoOrdenCodigo(tx, data.tipoOrdenCodigo)

    // Obtener próximo número de orden
    const ultimo = await tx.orden.findFirst({
      where: { puestoNumero: PUESTO_NUMERO },
      orderBy: { numero: 'desc' },
      select: { numero: true },
    })
    const numero = (ultimo?.numero ?? 0) + 1

    const orden = await tx.orden.create({
      data: {
        puestoNumero: PUESTO_NUMERO,
        numero,
        ingresoId: data.ingresoId ?? null,
        pacienteId: data.pacienteId ?? null,
        nombrePaciente: data.nombrePaciente,
        numeroAfiliado: data.numeroAfiliado,
        obraSocialId: data.obraSocialId,
        planId: data.planId,
        obraSocialCoseguroId: data.obraSocialCoseguroId ?? null,
        planCoseguroId: data.planCoseguroId ?? null,
        profesionalId: data.profesionalId,
        tipoOrdenCodigo,
        descripcionPatologia: data.descripcionPatologia ?? null,
        fechaEmision: new Date(),
        fechaPedido: new Date(),
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
            numeroAutorizacion: generarCodigoBarras(PUESTO_NUMERO, numero, idx + 1),
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
  solo?: 'ambulatorio' | 'internacion'
}): Promise<{ ordenes: OrdenListItem[]; total: number }> {
  const where =
    params.solo === 'ambulatorio'
      ? { ingresoId: null }
      : params.solo === 'internacion'
        ? { ingresoId: { not: null } }
        : undefined

  const [rows, total] = await Promise.all([
    prisma.orden.findMany({
      where,
      skip: params.skip ?? 0,
      take: params.take ?? 20,
      orderBy: [{ puestoNumero: 'desc' }, { numero: 'desc' }],
      include: {
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
      nombrePaciente: o.nombrePaciente,
      obraSocialNombre: o.obraSocial?.nombre ?? '',
      planDescripcion: o.plan?.descripcion ?? '',
      fechaEmision: o.fechaEmision,
      estado: o.estado,
      cantidadItems: o._count.items,
    })),
  }
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

  if (!convenioId || porConvenio.length > 0) return porConvenio

  // Si el convenio elegido no tiene esa práctica, hacemos fallback global.
  return prisma.nomencladorPractica.findMany({
    where: whereBase,
    take: 20,
    orderBy: { descripcion: 'asc' },
    select: { convenioId: true, codigo: true, descripcion: true },
  })
}
