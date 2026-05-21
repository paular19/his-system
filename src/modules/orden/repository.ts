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
const EFECTOR_FALLBACK_POR_MATRICULA: Record<number, string> = {
  6: 'ASOSIACION ANESTESISTA',
  9110: 'CLINICA SAN RAFAEL',
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

  // Validar formato: GA, HE, HA, A1-A3, o combinaciones con +
  const codigosValidos = /^(GA|HE|HA|A[1-3])(\+(GA|HE|HA|A[1-3]))*$/
  if (!codigosValidos.test(normalized)) {
    return null
  }

  return normalized
}

// ============================================
// CREAR ORDEN
// ============================================

export async function crearOrden(data: CrearOrdenInput, usuario: string) {
  return prisma.$transaction(async (tx) => {
    const usuarioRegistro = usuario.trim().slice(0, 10) || 'SISTEMA'
    const tipoOrdenCodigo = await resolverTipoOrdenCodigo(tx, data.tipoOrdenCodigo)
    const planId = await resolverPlanOrden(tx, data.obraSocialId, usuarioRegistro)

    const itemsNormalizados = data.items.map((item) => ({
      convenioId: item.convenioId,
      codigoPractica: item.codigoPractica.trim().slice(0, 8),
      incluyeCodigo: normalizarIncluyeCodigo(item.incluyeCodigo),
    }))

    // Evitar duplicados dentro del mismo envío
    const claves = new Set<string>()
    const duplicadosInput: string[] = []
    for (const item of itemsNormalizados) {
      const clave = `${item.convenioId}:${item.codigoPractica}:${item.incluyeCodigo ?? 'BASE'}`
      if (claves.has(clave)) duplicadosInput.push(item.codigoPractica)
      claves.add(clave)
    }
    if (duplicadosInput.length > 0) {
      const codigos = Array.from(new Set(duplicadosInput)).join(', ')
      throw new Error(`Se enviaron prácticas repetidas en la misma autorización: ${codigos}.`)
    }

    // Validar que la práctica no tenga ya orden en el mismo ingreso/paciente
    const whereOrden: Prisma.OrdenWhereInput = data.ingresoId
      ? { ingresoId: data.ingresoId }
      : data.pacienteId
        ? { pacienteId: data.pacienteId }
        : {}

    const practicasConOrden = await tx.ordenPractica.findMany({
      where: {
        orden: whereOrden,
        OR: itemsNormalizados.map((item) => ({
          convenioId: item.convenioId,
          codigoPractica: item.codigoPractica,
          modulo: item.incluyeCodigo,
        })),
      },
      select: {
        codigoPractica: true,
        convenioId: true,
        modulo: true,
        ordenNumero: true,
        puestoNumero: true,
      },
    })

    if (practicasConOrden.length > 0) {
      const practicas = practicasConOrden
        .map((p) => {
          const modulo = p.modulo?.trim()
          const moduloLabel = modulo ? ` [${modulo}]` : ''
          return `${p.codigoPractica.trim()}${moduloLabel} (Orden ${p.puestoNumero}-${p.ordenNumero})`
        })
        .join(', ')
      throw new Error(
        `Las prácticas/subitems ya están autorizados: ${practicas}. No se pueden generar nuevas órdenes para la misma combinación.`
      )
    }

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
        titularModular: data.titularModular ?? null,
        imprimirPorDuplicado: data.imprimirPorDuplicado ?? false,
        fechaEmision: new Date(),
        fechaPedido: new Date(),
        importeTotal: totalOrden,
        estado: 'A',
        fechaEstado: new Date(),
        usuarioRegistro,
        items: {
          create: data.items.map((item, idx) => ({
            item: idx + 1,
            practicaId: item.practicaId ?? null,
            convenioId: item.convenioId,
            codigoPractica: item.codigoPractica.trim().slice(0, 8),
            cantidad: item.cantidad,
            tipoFacturacion: item.tipoFacturacion ?? 'H',
            modulo: normalizarIncluyeCodigo(item.incluyeCodigo),
            titularModular: item.titularModular ?? null,
            imprimirPorDuplicado: item.imprimirPorDuplicado ?? false,
            efectorMatricula: item.efectorMatricula ?? null,
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
  const numeroBuscado = q && /^\d+$/.test(q) ? parseInt(q, 10) : null
  const estadoTab =
    params.estadoTab ??
    (params.pendiente === true
      ? 'pendientes'
      : params.pendiente === false
        ? 'confirmadas'
        : undefined)

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
    estadoTab === 'pendientes'
      ? {
        estado: { not: 'X' },
        numeroAutorizacion: null,
        ...filtroBusqueda,
      }
      : estadoTab === 'confirmadas'
        ? {
          estado: { not: 'X' },
          numeroAutorizacion: { not: null },
          ...filtroBusqueda,
        }
        : estadoTab === 'anuladas'
          ? {
            estado: 'X',
            ...filtroBusqueda,
          }
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
        obraSocialCoseguroId: true,
        numeroAutorizacion: true,
        fechaEmision: true,
        estado: true,
        obraSocial: { select: { nombre: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.orden.count({ where }),
  ])

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
    estado: { in: ['A', 'E'] },
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
    where: { id: ingresoId, estado: { in: ['A', 'E'] } },
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
      ordenes: {
        select: {
          puestoNumero: true,
          numero: true,
          items: {
            select: {
              item: true,
              convenioId: true,
              codigoPractica: true,
              numeroAutorizacion: true,
              practicaId: true,
            },
          },
        },
      },
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
          puestoNumero: true,
          ordenNumero: true,
          ordenItem: true,
          importeTotal: true,
          matriculaEspecialista: true,
          matriculaAnestesista: true,
          ordenPractica: {
            select: {
              puestoNumero: true,
              ordenNumero: true,
              item: true,
              numeroAutorizacion: true,
            },
          },
          nomencladorPractica: {
            select: {
              descripcion: true,
              valorEspecialista: true,
              valorAyudante: true,
              valorAnestesista: true,
              valorGastos: true,
            },
          },
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

  const ordenesPendientesPorClave = new Map<
    string,
    Array<{
      puestoNumero: number
      ordenNumero: number
      item: number
      numeroAutorizacion: string | null
    }>
  >()

  for (const o of ingreso.ordenes) {
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

  const practicasSinVinculoOrdenadas = [...ingreso.practicas]
    .filter(
      (p) =>
        (p.ordenPractica?.length ?? 0) === 0 &&
        !(p.puestoNumero != null && p.ordenNumero != null && Number(p.puestoNumero) > 0)
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

  return {
    ...ingreso,
    profesionalTratante: ingreso.profesionalTratante
      ? {
        id: ingreso.profesionalTratante.id,
        nombre: ingreso.profesionalTratante.nombre,
        matricula: ingreso.profesionalTratante.matricula,
      }
      : null,
    practicas: ingreso.practicas.map((p) => ({
      id: p.id,
      convenioId: p.convenioId,
      codigoPractica: p.codigoPractica.trim(),
      descripcionPractica: p.nomencladorPractica?.descripcion ?? p.codigoPractica.trim(),
      grupoOrden: p.ordenItem != null && Number(p.ordenItem) > 0 ? Number(p.ordenItem) : 1,
      cantidad: Number(p.cantidad),
      fecha: p.fecha,
      numeroAutorizacion: p.numeroAutorizacion,
      importeTotal: p.importeTotal != null ? Number(p.importeTotal) : null,
      valorEspecialista: p.nomencladorPractica?.valorEspecialista != null ? Number(p.nomencladorPractica.valorEspecialista) : null,
      valorAyudante: p.nomencladorPractica?.valorAyudante != null ? Number(p.nomencladorPractica.valorAyudante) : null,
      valorAnestesista: p.nomencladorPractica?.valorAnestesista != null ? Number(p.nomencladorPractica.valorAnestesista) : null,
      valorGastos: p.nomencladorPractica?.valorGastos != null ? Number(p.nomencladorPractica.valorGastos) : null,
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
          : p.puestoNumero != null && p.ordenNumero != null && Number(p.puestoNumero) > 0
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

  return practicas.map((practica) => ({
    ...practica,
    valor: valorPorCodigo.get(practica.codigo.trim()) ?? null,
    valorEspecialista: practica.valorEspecialista != null ? Number(practica.valorEspecialista) : null,
    valorAyudante: practica.valorAyudante != null ? Number(practica.valorAyudante) : null,
    valorAnestesista: practica.valorAnestesista != null ? Number(practica.valorAnestesista) : null,
    valorGastos: practica.valorGastos != null ? Number(practica.valorGastos) : null,
  }))
}
