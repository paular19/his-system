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
import { normalizarClasificacionAgrupacion } from './clasificacion'

const PUESTO_NUMERO = 1 // Número de puesto fijo (configurable a futuro)
const EFECTOR_FALLBACK_POR_MATRICULA: Record<number, string> = {
  6: 'ASOSIACION ANESTESISTA',
  2675: 'ANA MARIA VEGA',
  9110: 'CLINICA SAN RAFAEL',
  9995: 'GASTOS INTERNACION',
}

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
  usuarioRegistro: string
): Promise<number> {
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

function normalizarIncluyeCodigo(codigo: string | null | undefined): string | null {
  if (!codigo) return null
  const normalized = codigo.trim().toUpperCase()

  // Validar formato: GA, HE, HA, HP, A1-A3, o combinaciones con +
  const codigosValidos = /^(GA|HE|HA|HP|A[1-3])(\+(GA|HE|HA|HP|A[1-3]))*$/
  if (!codigosValidos.test(normalized)) {
    return null
  }

  return normalized
}

function normalizarClasificacion(codigo: string | null | undefined): string | null {
  return normalizarClasificacionAgrupacion(codigo)
}

function normalizarNumeroAutorizacion(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? ''
  return normalized.length > 0 ? normalized : null
}

type OrdenListaRowConItems = {
  puestoNumero: number
  numero: number
  ingresoId: number | null
  nombrePaciente: string
  obraSocialCoseguroId: number | null
  numeroAutorizacion: string | null
  fechaEmision: Date
  estado: string
  obraSocial: { nombre: string } | null
  _count: { items: number }
  items: Array<{
    item: number
    numeroAutorizacion: string | null
    codigoPractica: string
    nomencladorPractica: { descripcion: string } | null
  }>
}

function resolverNumeroAutorizacionOrdenLista(row: OrdenListaRowConItems): string | null {
  for (const it of row.items) {
    const numeroItem = normalizarNumeroAutorizacion(it.numeroAutorizacion)
    if (!numeroItem) continue

    const generado = generarCodigoBarras(row.puestoNumero, row.numero, it.item)
    if (numeroItem === generado) continue

    return numeroItem
  }

  const numeroOrden = normalizarNumeroAutorizacion(row.numeroAutorizacion)
  if (!numeroOrden) return null

  for (const it of row.items) {
    const generado = generarCodigoBarras(row.puestoNumero, row.numero, it.item)
    if (numeroOrden === generado) return null
  }

  return numeroOrden
}

// ============================================
// CREAR ORDEN
// ============================================

export async function crearOrden(data: CrearOrdenInput, usuario: string) {
  return crearOrdenInterna(data, usuario)
}

export async function crearOrdenInterna(
  data: CrearOrdenInput,
  usuario: string
) {
  return prisma.$transaction(async (tx) => {
    const usuarioRegistro = usuario.trim().slice(0, 10) || 'SISTEMA'
    const tipoOrdenCodigo = await resolverTipoOrdenCodigo(tx, data.tipoOrdenCodigo)
    const planId = await resolverPlanOrden(tx, data.obraSocialId, usuarioRegistro)

    // Obtener próximo número de orden
    const ultimo = await tx.orden.findFirst({
      where: { puestoNumero: PUESTO_NUMERO },
      orderBy: { numero: 'desc' },
      select: { numero: true },
    })
    const numero = (ultimo?.numero ?? 0) + 1
    const totalOrden = data.items.reduce((sum, item) => sum + Number(item.importeTotal ?? 0), 0)
    const fechasItems = data.items
      .map((item) => item.fecha)
      .filter((fecha): fecha is Date => fecha instanceof Date)
    const fechaOrden = fechasItems.length > 0
      ? new Date(Math.min(...fechasItems.map((fecha) => fecha.getTime())))
      : new Date()

    const orden = await tx.orden.create({
      data: {
        puestoNumero: PUESTO_NUMERO,
        numero,
        ingresoId: data.ingresoId ?? null,
        pacienteId: data.pacienteId ?? null,
        descripcion: data.descripcion ?? null,
        nombrePaciente: data.nombrePaciente,
        numeroAfiliado: data.numeroAfiliado,
        obraSocialId: data.obraSocialId,
        planId,
        obraSocialCoseguroId: data.obraSocialCoseguroId ?? null,
        planCoseguroId: data.planCoseguroId ?? null,
        profesionalId: data.profesionalId,
        tipoOrdenCodigo,
        descripcionPatologia: data.descripcionPatologia ?? null,
        titularModular: data.titularModular ?? null,
        imprimirPorDuplicado: data.imprimirPorDuplicado ?? false,
        fechaEmision: fechaOrden,
        fechaPedido: fechaOrden,
        importeTotal: totalOrden,
        estado: 'A',
        fechaEstado: new Date(),
        usuarioRegistro,
        items: {
          create: data.items.map((item, idx) => {
            const fechaItem = item.fecha instanceof Date ? item.fecha : fechaOrden
            return {
              item: idx + 1,
              practicaId: item.practicaId ?? null,
              convenioId: item.convenioId,
              codigoPractica: item.codigoPractica.trim().slice(0, 8),
              cantidad: item.cantidad,
              tipoFacturacion: item.tipoFacturacion ?? 'H',
              clasificacionAgrupacion: normalizarClasificacion(item.clasificacionAgrupacion),
              modulo: normalizarIncluyeCodigo(item.incluyeCodigo),
              titularModular: item.titularModular ?? null,
              imprimirPorDuplicado: item.imprimirPorDuplicado ?? false,
              efectorMatricula: item.efectorMatricula ?? null,
              importeTotal: item.importeTotal ?? null,
              porcentajeCargoPac: item.porcentajeCargoPac ?? null,
              fecha: fechaItem,
              numeroAutorizacion:
                item.numeroAutorizacion?.trim() || generarCodigoBarras(PUESTO_NUMERO, numero, idx + 1),
            }
          }),
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

  // Resolver coseguro si existe
  let obraSocialCoseguro: { id: number; nombre: string } | null = null
  if (orden.obraSocialCoseguroId) {
    const coseguro = await prisma.obraSocial.findUnique({
      where: { id: orden.obraSocialCoseguroId },
      select: { id: true, nombre: true },
    })
    obraSocialCoseguro = coseguro
  }

  const ingresoRelacionado =
    orden.ingreso ??
    (orden.pacienteId
      ? await prisma.ingreso.findFirst({
        where: { pacienteId: orden.pacienteId },
        orderBy: [{ fechaIngreso: 'desc' }, { id: 'desc' }],
        select: { numeroIngreso: true, tipoIngresoCodigo: true },
      })
      : null)

  const matriculasEfectores = Array.from(
    new Set(
      orden.items
        .map((it) => it.efectorMatricula)
        .filter((m): m is number => typeof m === 'number' && m > 0)
    )
  )
  const profesionalesEfectores = matriculasEfectores.length > 0
    ? await prisma.profesional.findMany({
      where: { matricula: { in: matriculasEfectores } },
      select: { nombre: true, matricula: true },
    })
    : []
  const profesionalPorMatricula = new Map(
    profesionalesEfectores
      .filter((p): p is { nombre: string; matricula: number } => typeof p.matricula === 'number')
      .map((p) => [p.matricula, p])
  )

  for (const matricula of matriculasEfectores) {
    if (profesionalPorMatricula.has(matricula)) continue
    const nombreFallback = EFECTOR_FALLBACK_POR_MATRICULA[matricula]
    if (!nombreFallback) continue
    profesionalPorMatricula.set(matricula, { nombre: nombreFallback, matricula })
  }

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
    titularModular: orden.titularModular,
    imprimirPorDuplicado: orden.imprimirPorDuplicado,
    fechaEmision: orden.fechaEmision,
    fechaPedido: orden.fechaPedido,
    importeTotal: orden.importeTotal ? Number(orden.importeTotal) : null,
    estado: orden.estado,
    usuarioRegistro: orden.usuarioRegistro,
    obraSocial: orden.obraSocial,
    plan: orden.plan,
    obraSocialCoseguro,
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
      clasificacionAgrupacion: normalizarClasificacion(it.clasificacionAgrupacion),
      incluyeCodigo: normalizarIncluyeCodigo(it.modulo),
      titularModular: it.titularModular,
      imprimirPorDuplicado: it.imprimirPorDuplicado,
      efectorMatricula: it.efectorMatricula,
      efectorProfesional:
        it.efectorMatricula && profesionalPorMatricula.has(it.efectorMatricula)
          ? {
            nombre: profesionalPorMatricula.get(it.efectorMatricula)!.nombre,
            matricula: it.efectorMatricula,
          }
          : null,
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
  estadoTab?: 'pendientes' | 'confirmadas' | 'anuladas'
  q?: string
}): Promise<{ ordenes: OrdenListItem[]; total: number }> {
  const q = params.q?.trim()
  const qLower = q?.toLowerCase()
  const numeroBuscado = q && /^\d+$/.test(q) ? parseInt(q, 10) : null
  const skip = params.skip ?? 0
  const take = params.take ?? 20
  const estadoTab =
    params.estadoTab ??
    (params.pendiente === true
      ? 'pendientes'
      : params.pendiente === false
        ? 'confirmadas'
        : undefined)

  const mapearResultado = async (rows: Array<OrdenListaRowConItems>, total: number) => {
    const idsCoseguro = Array.from(
      new Set(rows.map((o) => o.obraSocialCoseguroId).filter((id): id is number => id != null))
    )

    const coseguros =
      idsCoseguro.length > 0
        ? await prisma.obraSocial.findMany({
          where: { id: { in: idsCoseguro } },
          select: { id: true, nombre: true },
        })
        : []

    const coseguroPorId = new Map(coseguros.map((c) => [c.id, c.nombre]))

    return {
      total,
      ordenes: rows.map((o) => ({
        puestoNumero: o.puestoNumero,
        numero: o.numero,
        ingresoId: o.ingresoId,
        nombrePaciente: o.nombrePaciente,
        obraSocialNombre: o.obraSocial?.nombre ?? '',
        coseguroNombre: o.obraSocialCoseguroId ? (coseguroPorId.get(o.obraSocialCoseguroId) ?? '-') : '-',
        fechaEmision: o.fechaEmision,
        estado: o.estado,
        cantidadItems: o._count.items,
        practicas: [...o.items]
          .sort((a, b) => a.item - b.item)
          .map((it) => {
            const codigoPractica = it.codigoPractica.trim()
            return {
              item: it.item,
              codigoPractica,
              descripcionPractica: it.nomencladorPractica?.descripcion ?? codigoPractica,
            }
          }),
        numeroAutorizacion: o.numeroAutorizacion,
      })),
    }
  }

  if (estadoTab === 'pendientes' || estadoTab === 'confirmadas') {
    const rows = await prisma.orden.findMany({
      where: { estado: { not: 'X' } },
      orderBy: [{ puestoNumero: 'desc' }, { numero: 'desc' }],
      select: {
        puestoNumero: true,
        numero: true,
        ingresoId: true,
        nombrePaciente: true,
        numeroAfiliado: true,
        obraSocialCoseguroId: true,
        numeroAutorizacion: true,
        fechaEmision: true,
        estado: true,
        obraSocial: { select: { nombre: true } },
        _count: { select: { items: true } },
        items: {
          select: {
            item: true,
            numeroAutorizacion: true,
            codigoPractica: true,
            nomencladorPractica: { select: { descripcion: true } },
          },
        },
      },
    })

    const filtradas = rows
      .map((row) => {
        const numeroAutorizacionReal = resolverNumeroAutorizacionOrdenLista(row)
        return {
          ...row,
          numeroAutorizacionReal,
        }
      })
      .filter((row) => {
        const esPendiente = row.numeroAutorizacionReal == null

        if (estadoTab === 'pendientes' && !esPendiente) return false
        if (estadoTab === 'confirmadas' && esPendiente) return false

        if (!q || !qLower) return true

        const nombrePaciente = row.nombrePaciente.toLowerCase()
        const numeroAfiliado = row.numeroAfiliado.toLowerCase()
        const numeroAutorizacion = row.numeroAutorizacionReal?.toLowerCase() ?? ''
        const practicas = row.items
          .map((it) => `${it.codigoPractica.trim()} ${it.nomencladorPractica?.descripcion ?? ''}`)
          .join(' ')
          .toLowerCase()

        return (
          nombrePaciente.includes(qLower) ||
          numeroAfiliado.includes(qLower) ||
          numeroAutorizacion.includes(qLower) ||
          practicas.includes(qLower) ||
          (numeroBuscado != null && row.numero === numeroBuscado)
        )
      })

    const total = filtradas.length
    const pageRows = filtradas.slice(skip, skip + take).map((row) => ({
      puestoNumero: row.puestoNumero,
      numero: row.numero,
      ingresoId: row.ingresoId,
      nombrePaciente: row.nombrePaciente,
      obraSocialCoseguroId: row.obraSocialCoseguroId,
      numeroAutorizacion: row.numeroAutorizacionReal,
      fechaEmision: row.fechaEmision,
      estado: row.estado,
      obraSocial: row.obraSocial,
      _count: row._count,
      items: row.items,
    }))

    return mapearResultado(pageRows, total)
  }

  const filtroBusqueda = q
    ? {
      OR: [
        { nombrePaciente: { contains: q, mode: 'insensitive' as const } },
        { numeroAfiliado: { contains: q, mode: 'insensitive' as const } },
        { numeroAutorizacion: { contains: q, mode: 'insensitive' as const } },
        ...(numeroBuscado != null ? [{ numero: numeroBuscado }] : []),
      ],
    }
    : {}

  const where: Prisma.OrdenWhereInput =
    estadoTab === 'anuladas'
      ? {
        estado: 'X',
        ...filtroBusqueda,
      }
      : filtroBusqueda

  const [rows, total] = await Promise.all([
    prisma.orden.findMany({
      where,
      skip,
      take,
      orderBy: [{ puestoNumero: 'desc' }, { numero: 'desc' }],
      select: {
        puestoNumero: true,
        numero: true,
        ingresoId: true,
        nombrePaciente: true,
        obraSocialCoseguroId: true,
        numeroAutorizacion: true,
        fechaEmision: true,
        estado: true,
        obraSocial: { select: { nombre: true } },
        _count: { select: { items: true } },
        items: {
          select: {
            item: true,
            numeroAutorizacion: true,
            codigoPractica: true,
            nomencladorPractica: { select: { descripcion: true } },
          },
        },
      },
    }),
    prisma.orden.count({ where }),
  ])

  return mapearResultado(rows, total)
}

// ============================================
// ADMISIÓN ACTIVA PARA FLUJO DE AUTORIZACIÓN
// ============================================

export async function buscarAdmisionesActivasPorPaciente(query: string): Promise<AdmisionActivaItem[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const esNumerico = /^\d+$/.test(q)
  const where: Prisma.IngresoWhereInput = {
    estado: { in: ['A', 'P', 'E'] },
    OR: esNumerico
      ? [
        { numeroIngreso: parseInt(q, 10) },
        { paciente: { numeroDocumento: parseInt(q, 10) } },
        { nombre: { contains: q, mode: 'insensitive' } },
        { obraSocial: { nombre: { contains: q, mode: 'insensitive' } } },
      ]
      : [
        { nombre: { contains: q, mode: 'insensitive' } },
        { obraSocial: { nombre: { contains: q, mode: 'insensitive' } } },
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
  try {
    const ingreso = await prisma.ingreso.findFirst({
      where: {
        id: ingresoId,
        OR: [{ estado: { not: 'X' } }, { estado: null }],
      },
      select: {
        id: true,
        tipoIngresoCodigo: true,
        numeroIngreso: true,
        fechaIngreso: true,
        descripcionPatologia: true,
        profesionalTratante: {
          select: { id: true, nombre: true, matricula: true },
        },
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
      },
    })

    if (!ingreso) return null

    const [ordenesRows, ordenItemsRows, practicasRows, ordenPracticaRows, medicacionesRows] = await Promise.all([
      prisma.orden.findMany({
        where: { ingresoId, NOT: { estado: 'X' } },
        select: {
          puestoNumero: true,
          numero: true,
        },
      }),
      prisma.ordenPractica.findMany({
        where: {
          orden: {
            ingresoId,
            NOT: { estado: 'X' },
          },
        },
        select: {
          puestoNumero: true,
          ordenNumero: true,
          item: true,
          convenioId: true,
          codigoPractica: true,
          numeroAutorizacion: true,
          practicaId: true,
        },
        orderBy: [{ puestoNumero: 'asc' }, { ordenNumero: 'asc' }, { item: 'asc' }],
      }),
      prisma.practica.findMany({
        where: {
          ingresoId,
          OR: [{ estado: 'A' }, { estado: null }],
          facturable: true,
        },
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          convenioId: true,
          codigoPractica: true,
          cantidad: true,
          fecha: true,
          numeroAutorizacion: true,
          numeroProtocoloLab: true,
          diagnosticoLab: true,
          facturable: true,
          estado: true,
          puestoNumero: true,
          ordenNumero: true,
          ordenItem: true,
          importeTotal: true,
          matriculaEspecialista: true,
          matriculaAnestesista: true,
        },
      }),
      prisma.ordenPractica.findMany({
        where: {
          practicaId: { not: null },
          orden: {
            ingresoId,
            estado: { not: 'X' },
          },
        },
        select: {
          practicaId: true,
          puestoNumero: true,
          ordenNumero: true,
          item: true,
          numeroAutorizacion: true,
        },
        orderBy: [{ puestoNumero: 'asc' }, { ordenNumero: 'asc' }, { item: 'asc' }],
      }),
      prisma.medicacionIngreso.findMany({
        where: {
          ingresoId,
          estado: { in: ['A', 'S'] },
        },
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
      }),
    ])

    const itemsPorOrden = new Map<
      string,
      Array<{
        item: number
        convenioId: number
        codigoPractica: string
        numeroAutorizacion: string | null
        practicaId: number | null
      }>
    >()
    for (const item of ordenItemsRows) {
      const key = `${item.puestoNumero}:${item.ordenNumero}`
      const actuales = itemsPorOrden.get(key) ?? []
      actuales.push({
        item: item.item,
        convenioId: item.convenioId,
        codigoPractica: item.codigoPractica,
        numeroAutorizacion: item.numeroAutorizacion,
        practicaId: item.practicaId,
      })
      itemsPorOrden.set(key, actuales)
    }

    const ordenes = ordenesRows.map((orden) => ({
      puestoNumero: orden.puestoNumero,
      numero: orden.numero,
      items: itemsPorOrden.get(`${orden.puestoNumero}:${orden.numero}`) ?? [],
    }))

    const codigosEnOrdenActiva = new Set(
      ordenes.flatMap((orden) =>
        orden.items.map((item) => `${item.convenioId}:${item.codigoPractica.trim()}`)
      )
    )

    const ordenPracticaPorPracticaId = new Map<
      number,
      Array<{
        puestoNumero: number
        ordenNumero: number
        item: number
        numeroAutorizacion: string | null
      }>
    >()
    for (const op of ordenPracticaRows) {
      if (op.practicaId == null) continue
      const actuales = ordenPracticaPorPracticaId.get(op.practicaId) ?? []
      actuales.push({
        puestoNumero: op.puestoNumero,
        ordenNumero: op.ordenNumero,
        item: op.item,
        numeroAutorizacion: op.numeroAutorizacion,
      })
      ordenPracticaPorPracticaId.set(op.practicaId, actuales)
    }

    const practicas = practicasRows.map((p) => ({
      ...p,
      ordenPractica: ordenPracticaPorPracticaId.get(p.id) ?? [],
    }))

    const ordenesActivasSet = new Set(
      ordenes.map((orden) => `${orden.puestoNumero}:${orden.numero}`)
    )

    const ordenesPendientesPorClave = new Map<
      string,
      Array<{
        puestoNumero: number
        ordenNumero: number
        item: number
        numeroAutorizacion: string | null
      }>
    >()

    for (const o of ordenes) {
      for (const i of o.items) {
        // Evita reasignar a nuevas prácticas órdenes que ya están vinculadas por practicaId.
        if (i.practicaId != null) continue
        const key = `${i.convenioId}:${i.codigoPractica.trim()}`
        const cola = ordenesPendientesPorClave.get(key) ?? []
        cola.push({
          puestoNumero: o.puestoNumero,
          ordenNumero: o.numero,
          item: i.item,
          numeroAutorizacion: i.numeroAutorizacion,
        })
        ordenesPendientesPorClave.set(key, cola)
      }
    }

    const ordenAsignadaPorPracticaId = new Map<
      number,
      {
        puestoNumero: number
        ordenNumero: number
        item: number
        numeroAutorizacion: string | null
      }
    >()

    const practicasSinVinculoOrdenadas = [...practicas]
      .filter(
        (p) =>
          (p.ordenPractica?.length ?? 0) === 0 &&
          !(
            p.puestoNumero != null &&
            p.ordenNumero != null &&
            Number(p.puestoNumero) > 0 &&
            ordenesActivasSet.has(`${Number(p.puestoNumero)}:${Number(p.ordenNumero)}`)
          )
      )
      .sort((a, b) => a.id - b.id)

    for (const p of practicasSinVinculoOrdenadas) {
      const key = `${p.convenioId}:${p.codigoPractica.trim()}`
      const cola = ordenesPendientesPorClave.get(key)
      if (!cola || cola.length === 0) continue
      const asignada = cola.shift()
      if (!asignada) continue
      ordenAsignadaPorPracticaId.set(p.id, asignada)
    }

    const clavesNomenclador = Array.from(
      new Map(
        practicasRows.map((p) => [
          `${p.convenioId}:${p.codigoPractica.trim()}`,
          {
            convenioId: p.convenioId,
            codigo: p.codigoPractica.trim(),
          },
        ])
      ).values()
    )

    const nomencladorRows =
      clavesNomenclador.length > 0
        ? await prisma.nomencladorPractica.findMany({
          where: {
            OR: clavesNomenclador.map((k) => ({ convenioId: k.convenioId, codigo: k.codigo })),
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

    const nomencladorPorClave = new Map(
      nomencladorRows.map((n) => [`${n.convenioId}:${n.codigo.trim()}`, n])
    )

    return {
      ...ingreso,
      profesionalTratante: ingreso.profesionalTratante
        ? {
          id: ingreso.profesionalTratante.id,
          nombre: ingreso.profesionalTratante.nombre,
          matricula: ingreso.profesionalTratante.matricula,
        }
        : null,
      practicas: practicas.map((p) => {
        const nomenclador = nomencladorPorClave.get(`${p.convenioId}:${p.codigoPractica.trim()}`)
        return {
          id: p.id,
          convenioId: p.convenioId,
          codigoPractica: p.codigoPractica.trim(),
          descripcionPractica:
            p.codigoPractica.trim() === '66'
              ? nomenclador?.descripcion ?? 'PROTOCOLO BIOQUIMICO'
              : nomenclador?.descripcion ?? p.codigoPractica.trim(),
          numeroProtocoloLaboratorio: p.numeroProtocoloLab,
          diagnosticoLaboratorio: p.diagnosticoLab,
          facturable: p.facturable,
          estado: p.estado,
          tieneOrdenActivaPorCodigo: codigosEnOrdenActiva.has(
            `${p.convenioId}:${p.codigoPractica.trim()}`
          ),
          grupoOrden: p.ordenItem != null && Number(p.ordenItem) > 0 ? Number(p.ordenItem) : 1,
          cantidad: Number(p.cantidad),
          fecha: p.fecha,
          numeroAutorizacion: p.numeroAutorizacion,
          importeTotal: p.importeTotal != null ? Number(p.importeTotal) : null,
          valorEspecialista: nomenclador?.valorEspecialista != null ? Number(nomenclador.valorEspecialista) : null,
          valorAyudante: nomenclador?.valorAyudante != null ? Number(nomenclador.valorAyudante) : null,
          valorAnestesista: nomenclador?.valorAnestesista != null ? Number(nomenclador.valorAnestesista) : null,
          valorGastos: nomenclador?.valorGastos != null ? Number(nomenclador.valorGastos) : null,
          matriculaEspecialista: p.matriculaEspecialista,
          matriculaAnestesista: p.matriculaAnestesista,
          ordenPractica:
            Array.isArray(p.ordenPractica) && p.ordenPractica.length > 0
              ? p.ordenPractica.map((op) => ({
                puestoNumero: op.puestoNumero,
                ordenNumero: op.ordenNumero,
                item: op.item,
                numeroAutorizacion: op.numeroAutorizacion,
              }))
              : p.puestoNumero != null &&
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
                : (() => {
                  const fallback = ordenAsignadaPorPracticaId.get(p.id)
                  return fallback ? [fallback] : []
                })(),
        }
      }),
      medicaciones: medicacionesRows,
    } as AdmisionOrdenContexto
  } catch (error) {
    console.error('[ORDEN] Error al obtener contexto de admisión para orden', {
      ingresoId,
      error,
    })
    return null
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

  if (!convenioId || porConvenio.length > 0) return enriquecerPracticasConValor(porConvenio)

  // Si el convenio elegido no tiene esa práctica, hacemos fallback global.
  const fallback = await prisma.nomencladorPractica.findMany({
    where: whereBase,
    take: 20,
    orderBy: { descripcion: 'asc' },
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

  return enriquecerPracticasConValor(fallback)
}

async function enriquecerPracticasConValor(
  practicas: Array<{
    convenioId: number
    codigo: string
    descripcion: string
    valorEspecialista: import('@prisma/client').Prisma.Decimal | null
    valorAyudante: import('@prisma/client').Prisma.Decimal | null
    valorAnestesista: import('@prisma/client').Prisma.Decimal | null
    valorGastos: import('@prisma/client').Prisma.Decimal | null
  }>
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

  const codigosSinDesglose = Array.from(
    new Set(
      practicas
        .filter(
          (p) =>
            p.valorEspecialista == null &&
            p.valorAyudante == null &&
            p.valorAnestesista == null &&
            p.valorGastos == null
        )
        .map((p) => p.codigo.trim())
        .filter(Boolean)
    )
  )

  const fallbackDesgloseRaw = codigosSinDesglose.length
    ? await prisma.nomencladorPractica.findMany({
      where: {
        AND: [
          {
            OR: codigosSinDesglose.map((codigo) => ({ codigo: { startsWith: codigo } })),
          },
          {
            OR: [
              { valorEspecialista: { not: null } },
              { valorAyudante: { not: null } },
              { valorAnestesista: { not: null } },
              { valorGastos: { not: null } },
            ],
          },
        ],
      },
      select: {
        codigo: true,
        valorEspecialista: true,
        valorAyudante: true,
        valorAnestesista: true,
        valorGastos: true,
      },
      orderBy: [{ codigo: 'asc' }, { convenioId: 'asc' }],
    })
    : []

  const fallbackDesglosePorCodigo = new Map<
    string,
    {
      valorEspecialista: number | null
      valorAyudante: number | null
      valorAnestesista: number | null
      valorGastos: number | null
    }
  >()

  for (const row of fallbackDesgloseRaw) {
    const codigo = row.codigo.trim()
    if (fallbackDesglosePorCodigo.has(codigo)) continue
    fallbackDesglosePorCodigo.set(codigo, {
      valorEspecialista: row.valorEspecialista != null ? Number(row.valorEspecialista) : null,
      valorAyudante: row.valorAyudante != null ? Number(row.valorAyudante) : null,
      valorAnestesista: row.valorAnestesista != null ? Number(row.valorAnestesista) : null,
      valorGastos: row.valorGastos != null ? Number(row.valorGastos) : null,
    })
  }

  return practicas.map((practica) => ({
    ...(fallbackDesglosePorCodigo.get(practica.codigo.trim()) ?? {}),
    ...practica,
    valor: valorPorCodigo.get(practica.codigo.trim()) ?? null,
    valorEspecialista:
      practica.valorEspecialista != null
        ? Number(practica.valorEspecialista)
        : (fallbackDesglosePorCodigo.get(practica.codigo.trim())?.valorEspecialista ?? null),
    valorAyudante:
      practica.valorAyudante != null
        ? Number(practica.valorAyudante)
        : (fallbackDesglosePorCodigo.get(practica.codigo.trim())?.valorAyudante ?? null),
    valorAnestesista:
      practica.valorAnestesista != null
        ? Number(practica.valorAnestesista)
        : (fallbackDesglosePorCodigo.get(practica.codigo.trim())?.valorAnestesista ?? null),
    valorGastos:
      practica.valorGastos != null
        ? Number(practica.valorGastos)
        : (fallbackDesglosePorCodigo.get(practica.codigo.trim())?.valorGastos ?? null),
  }))
}
