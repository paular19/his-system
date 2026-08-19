import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
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
import {
  calcularUmbralRank,
  evaluarCoincidenciaOrden,
  parsearBusquedaOrden,
  type BusquedaOrdenParseada,
  type CoincidenciaOrden,
  type TipoCoincidenciaOrden,
} from './busqueda'
import { obtenerTokensBusquedaFlexible } from '@/lib/utils/busqueda-flexible'
import { claveDiaArgentina, fechaDesdeClaveArgentina } from '@/lib/utils/argentina-date'

const PUESTO_NUMERO = 1 // Número de puesto fijo (configurable a futuro)
const MAX_REINTENTOS_NUMERO_ORDEN = 5
const MATRICULA_PATOLOGIA_DEFAULT = 2675
const EFECTOR_FALLBACK_POR_MATRICULA: Record<number, string> = {
  6: 'ASOSIACION ANESTESISTA',
  [MATRICULA_PATOLOGIA_DEFAULT]: 'ANA MARIA VEGA',
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

function normalizarTextoNoVacio(value: string | null | undefined): string | null {
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
  estado: string | null
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

function esObraSocialParticular(nombreObraSocial: string | null | undefined): boolean {
  const normalized = (nombreObraSocial ?? '').trim().toUpperCase()
  return normalized.includes('PARTICULAR')
}

function normalizarEstadoOrden(value: string | null | undefined): string {
  const normalized = (value ?? '').trim().toUpperCase()
  return normalized.length > 0 ? normalized : 'A'
}

function esEstadoOrdenAnulada(value: string | null | undefined): boolean {
  return normalizarEstadoOrden(value).startsWith('X')
}

function esColisionNumeroOrden(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false
  if (error.code !== 'P2002') return false

  const targetRaw = error.meta?.target
  const target =
    Array.isArray(targetRaw) ? targetRaw.join(',') : String(targetRaw ?? '')

  return /puenum|ordnum|puestonumero|numero/i.test(target)
}

// ============================================
// CREAR ORDEN
// ============================================

export async function crearOrden(data: CrearOrdenInput, usuario: string) {
  return crearOrdenInterna(data, usuario)
}

export async function crearOrdenInterna(
  data: CrearOrdenInput,
  usuario: string,
  options?: {
    modoLigero?: boolean
  }
) {
  for (let intento = 1; intento <= MAX_REINTENTOS_NUMERO_ORDEN; intento += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const usuarioRegistro = usuario.trim().slice(0, 10) || 'SISTEMA'
        const tipoOrdenCodigo = await resolverTipoOrdenCodigo(tx, data.tipoOrdenCodigo)
        const planId = await resolverPlanOrden(tx, data.obraSocialId, usuarioRegistro)

        // Obtener próximo número de orden (puede colisionar en concurrencia; se reintenta arriba)
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

        const claveFechaSeleccionada = fechasItems.reduce<string | null>((max, fecha) => {
          const clave = claveDiaArgentina(fecha)
          if (!clave) return max
          if (!max) return clave
          return clave > max ? clave : max
        }, null)

        const claveHoyArgentina = claveDiaArgentina(new Date())
        const fechaEmisionOrden = claveFechaSeleccionada
          ? fechaDesdeClaveArgentina(claveFechaSeleccionada)
          : claveHoyArgentina
          ? fechaDesdeClaveArgentina(claveHoyArgentina)
          : new Date()
        const fechaBaseItem = fechaEmisionOrden

        const ordenData = {
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
          fechaEmision: fechaEmisionOrden,
          fechaPedido: fechaEmisionOrden,
          importeTotal: totalOrden,
          estado: 'A' as const,
          fechaEstado: new Date(),
          usuarioRegistro,
          items: {
            create: data.items.map((item, idx) => {
              const fechaItem = item.fecha instanceof Date ? item.fecha : fechaBaseItem
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
                numeroAutorizacion: normalizarNumeroAutorizacion(item.numeroAutorizacion)?.slice(0, 15) ?? null,
              }
            }),
          },
        }

        const orden = options?.modoLigero
          ? await tx.orden.create({
            data: ordenData,
            select: {
              puestoNumero: true,
              numero: true,
              nombrePaciente: true,
            },
          })
          : await tx.orden.create({
            data: ordenData,
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
    } catch (error) {
      if (esColisionNumeroOrden(error) && intento < MAX_REINTENTOS_NUMERO_ORDEN) {
        continue
      }
      throw error
    }
  }

  throw new Error('No se pudo generar un numero de orden unico')
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
      ingreso: {
        select: {
          numeroIngreso: true,
          tipoIngresoCodigo: true,
          descripcionPatologia: true,
          ingresoSubtipo: { select: { subtipoAdmisionCodigo: true } },
          ingresoPatologias: {
            select: { descripcion: true },
            orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
            take: 1,
          },
        },
      },
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
        select: {
          numeroIngreso: true,
          tipoIngresoCodigo: true,
          descripcionPatologia: true,
          ingresoSubtipo: { select: { subtipoAdmisionCodigo: true } },
          ingresoPatologias: {
            select: { descripcion: true },
            orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
            take: 1,
          },
        },
      })
      : null)

  const diagnosticoOrden =
    normalizarTextoNoVacio(orden.descripcionPatologia) ??
    normalizarTextoNoVacio(ingresoRelacionado?.descripcionPatologia) ??
    normalizarTextoNoVacio(ingresoRelacionado?.ingresoPatologias?.[0]?.descripcion) ??
    null

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
    ingresoSubtipoCodigo: ingresoRelacionado?.ingresoSubtipo?.subtipoAdmisionCodigo ?? null,
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
    descripcionPatologia: diagnosticoOrden,
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
    items: orden.items.map((it) => {
      const esPatologiaCodigo = it.codigoPractica.trim().startsWith('15')
      const efectorMatriculaFinal = esPatologiaCodigo
        ? MATRICULA_PATOLOGIA_DEFAULT
        : it.efectorMatricula

      return {
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
        efectorMatricula: efectorMatriculaFinal,
        efectorProfesional:
          efectorMatriculaFinal && profesionalPorMatricula.has(efectorMatriculaFinal)
            ? {
              nombre: profesionalPorMatricula.get(efectorMatriculaFinal)!.nombre,
              matricula: efectorMatriculaFinal,
            }
            : null,
        numeroAutorizacion: it.numeroAutorizacion,
        importeTotal: it.importeTotal ? Number(it.importeTotal) : null,
        porcentajeCargoPac: it.porcentajeCargoPac ? Number(it.porcentajeCargoPac) : null,
        fecha: it.fecha,
      }
    }),
  }
}

// ============================================
// LISTAR ÓRDENES
// ============================================

export type TabOrden = 'pendientes' | 'confirmadas' | 'anuladas'

export type ResultadoSolapaOrdenes = { ordenes: OrdenListItem[]; total: number }

export type ResumenBusquedaOrdenes = {
  termino: string
  /** Por que campo matchearon los resultados. Null si no hubo ninguno. */
  tipoCoincidencia: TipoCoincidenciaOrden | null
  etiqueta: string | null
  /** True si el termino se pudo leer como numero de orden. */
  interpretadaComoNumeroOrden: boolean
}

export type ListadoOrdenesPorSolapa = {
  pendientes: ResultadoSolapaOrdenes
  confirmadas: ResultadoSolapaOrdenes
  anuladas: ResultadoSolapaOrdenes
  busqueda: ResumenBusquedaOrdenes | null
}

const SELECT_ORDEN_LISTA = {
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
} satisfies Prisma.OrdenSelect

type FilaOrdenClasificada = {
  puestoNumero: number
  numero: number
  ingresoId: number | null
  nombrePaciente: string
  numeroAfiliado: string
  obraSocialCoseguroId: number | null
  fechaEmision: Date
  estado: string | null
  obraSocialNombre: string
  cantidadItems: number
  practicas: Array<{ item: number; codigoPractica: string; descripcionPractica: string }>
  numeroAutorizacionReal: string | null
  tab: TabOrden
  coincidencia: CoincidenciaOrden | null
}

function clasificarSolapaOrden(
  estado: string | null,
  numeroAutorizacionReal: string | null,
  obraSocialNombre: string | null | undefined
): TabOrden {
  if (esEstadoOrdenAnulada(estado)) return 'anuladas'
  const esPendiente = numeroAutorizacionReal == null && !esObraSocialParticular(obraSocialNombre)
  return esPendiente ? 'pendientes' : 'confirmadas'
}

/**
 * Carga todas las ordenes una sola vez y las deja clasificadas por solapa, con
 * la autorizacion real ya resuelta y las practicas normalizadas.
 *
 * La pagina de autorizaciones necesita el total de las tres solapas en cada
 * request; antes eso eran tres consultas completas a `Orden` (dos de ellas sin
 * `where`). Con una sola pasada alcanza.
 */
async function cargarOrdenesClasificadas(): Promise<FilaOrdenClasificada[]> {
  const rows = await prisma.orden.findMany({
    orderBy: [{ fechaEmision: 'desc' }, { puestoNumero: 'desc' }, { numero: 'desc' }],
    select: SELECT_ORDEN_LISTA,
  })

  return rows.map((row) => {
    const numeroAutorizacionReal = resolverNumeroAutorizacionOrdenLista(row)
    const obraSocialNombre = row.obraSocial?.nombre ?? ''

    return {
      puestoNumero: row.puestoNumero,
      numero: row.numero,
      ingresoId: row.ingresoId,
      nombrePaciente: row.nombrePaciente,
      numeroAfiliado: row.numeroAfiliado,
      obraSocialCoseguroId: row.obraSocialCoseguroId,
      fechaEmision: row.fechaEmision,
      estado: row.estado,
      obraSocialNombre,
      cantidadItems: row._count.items,
      practicas: [...row.items]
        .sort((a, b) => a.item - b.item)
        .map((it) => {
          // Los codigos vienen con padding inconsistente desde el sistema viejo.
          const codigoPractica = it.codigoPractica.trim()
          return {
            item: it.item,
            codigoPractica,
            descripcionPractica: it.nomencladorPractica?.descripcion ?? codigoPractica,
          }
        }),
      numeroAutorizacionReal,
      tab: clasificarSolapaOrden(row.estado, numeroAutorizacionReal, obraSocialNombre),
      coincidencia: null,
    }
  })
}

/**
 * Aplica la busqueda sobre las filas ya cargadas. Devuelve las filas que
 * sobreviven al umbral de precision (ver `calcularUmbralRank`) y el resumen de
 * como se interpreto el termino.
 */
function aplicarBusquedaOrdenes(
  filas: FilaOrdenClasificada[],
  busqueda: BusquedaOrdenParseada
): { filas: FilaOrdenClasificada[]; resumen: ResumenBusquedaOrdenes } {
  const candidatas: FilaOrdenClasificada[] = []
  let mejorRank: number | null = null

  for (const fila of filas) {
    const coincidencia = evaluarCoincidenciaOrden(
      {
        puestoNumero: fila.puestoNumero,
        numero: fila.numero,
        nombrePaciente: fila.nombrePaciente,
        numeroAfiliado: fila.numeroAfiliado,
        numeroAutorizacion: fila.numeroAutorizacionReal,
        practicas: fila.practicas,
      },
      busqueda
    )
    if (!coincidencia) continue

    candidatas.push({ ...fila, coincidencia })
    if (mejorRank === null || coincidencia.rank < mejorRank) mejorRank = coincidencia.rank
  }

  const umbral = calcularUmbralRank(mejorRank)
  const filtradas = candidatas.filter((f) => (f.coincidencia?.rank ?? Number.MAX_SAFE_INTEGER) <= umbral)

  // Las coincidencias mas precisas primero; dentro del mismo rank, las mas nuevas.
  filtradas.sort((a, b) => {
    const rankA = a.coincidencia?.rank ?? Number.MAX_SAFE_INTEGER
    const rankB = b.coincidencia?.rank ?? Number.MAX_SAFE_INTEGER
    if (rankA !== rankB) return rankA - rankB
    const fechaDiff = b.fechaEmision.getTime() - a.fechaEmision.getTime()
    if (fechaDiff !== 0) return fechaDiff
    return b.numero - a.numero
  })

  const mejor = filtradas[0]?.coincidencia ?? null

  return {
    filas: filtradas,
    resumen: {
      termino: busqueda.original,
      tipoCoincidencia: mejor?.tipo ?? null,
      etiqueta: mejor?.etiqueta ?? null,
      interpretadaComoNumeroOrden: busqueda.numeroOrden !== null,
    },
  }
}

async function mapearFilasAListItems(filas: FilaOrdenClasificada[]): Promise<OrdenListItem[]> {
  const idsCoseguro = Array.from(
    new Set(filas.map((f) => f.obraSocialCoseguroId).filter((id): id is number => id != null))
  )

  const coseguros =
    idsCoseguro.length > 0
      ? await prisma.obraSocial.findMany({
        where: { id: { in: idsCoseguro } },
        select: { id: true, nombre: true },
      })
      : []

  const coseguroPorId = new Map(coseguros.map((c) => [c.id, c.nombre]))

  return filas.map((f) => ({
    puestoNumero: f.puestoNumero,
    numero: f.numero,
    ingresoId: f.ingresoId,
    nombrePaciente: f.nombrePaciente,
    obraSocialNombre: f.obraSocialNombre,
    coseguroNombre: f.obraSocialCoseguroId ? (coseguroPorId.get(f.obraSocialCoseguroId) ?? '-') : '-',
    fechaEmision: f.fechaEmision,
    estado: normalizarEstadoOrden(f.estado),
    cantidadItems: f.cantidadItems,
    practicas: f.practicas,
    numeroAutorizacion: f.numeroAutorizacionReal,
  }))
}

/**
 * Devuelve las tres solapas de la pagina de autorizaciones en una sola pasada.
 * Solo se materializan las filas de la solapa activa; de las otras dos alcanza
 * con el total para poder avisar que el resultado esta en otra solapa.
 */
export async function listarOrdenesPorSolapa(params: {
  q?: string
  tabActual: TabOrden
  skip?: number
  take?: number
}): Promise<ListadoOrdenesPorSolapa> {
  const skip = params.skip ?? 0
  const take = params.take ?? 20
  const busqueda = parsearBusquedaOrden(params.q)

  const todas = await cargarOrdenesClasificadas()
  const { filas, resumen } = busqueda
    ? aplicarBusquedaOrdenes(todas, busqueda)
    : { filas: todas, resumen: null }

  const porTab: Record<TabOrden, FilaOrdenClasificada[]> = {
    pendientes: [],
    confirmadas: [],
    anuladas: [],
  }
  for (const fila of filas) porTab[fila.tab].push(fila)

  const ordenesActivas = await mapearFilasAListItems(
    porTab[params.tabActual].slice(skip, skip + take)
  )

  const construir = (tab: TabOrden): ResultadoSolapaOrdenes => ({
    ordenes: tab === params.tabActual ? ordenesActivas : [],
    total: porTab[tab].length,
  })

  return {
    pendientes: construir('pendientes'),
    confirmadas: construir('confirmadas'),
    anuladas: construir('anuladas'),
    busqueda: resumen,
  }
}

/**
 * Listado de una sola solapa. Sin `estadoTab` ni `pendiente` devuelve todas las
 * ordenes (incluidas las anuladas), que es lo que espera `/api/ordenes`.
 */
export async function listarOrdenes(params: {
  skip?: number
  take?: number
  pendiente?: boolean
  estadoTab?: TabOrden
  q?: string
}): Promise<ResultadoSolapaOrdenes> {
  const estadoTab: TabOrden | null =
    params.estadoTab ??
    (params.pendiente === true ? 'pendientes' : params.pendiente === false ? 'confirmadas' : null)

  const skip = params.skip ?? 0
  const take = params.take ?? 20
  const busqueda = parsearBusquedaOrden(params.q)

  const todas = await cargarOrdenesClasificadas()
  const filas = busqueda ? aplicarBusquedaOrdenes(todas, busqueda).filas : todas
  const filtradas = estadoTab ? filas.filter((f) => f.tab === estadoTab) : filas

  return {
    ordenes: await mapearFilasAListItems(filtradas.slice(skip, skip + take)),
    total: filtradas.length,
  }
}

// ============================================
// ADMISIÓN ACTIVA PARA FLUJO DE AUTORIZACIÓN
// ============================================

export async function buscarAdmisionesActivasPorPaciente(query: string): Promise<AdmisionActivaItem[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const esNumerico = /^\d+$/.test(q)
  const tokens = obtenerTokensBusquedaFlexible(q)
  const tokensBusqueda = tokens.length > 0 ? tokens : [q]
  const filtroNombreIngreso: Prisma.IngresoWhereInput = {
    AND: tokensBusqueda.map((token) => ({
      nombre: { contains: token, mode: 'insensitive' },
    })),
  }
  const filtroObraSocial: Prisma.IngresoWhereInput = {
    AND: tokensBusqueda.map((token) => ({
      obraSocial: { nombre: { contains: token, mode: 'insensitive' } },
    })),
  }
  const filtroNombrePaciente: Prisma.IngresoWhereInput = {
    AND: tokensBusqueda.map((token) => ({
      paciente: { nombreCompleto: { contains: token, mode: 'insensitive' } },
    })),
  }

  const where: Prisma.IngresoWhereInput = {
    estado: { in: ['A', 'P', 'E'] },
    OR: esNumerico
      ? [
        { numeroIngreso: parseInt(q, 10) },
        { paciente: { numeroDocumento: parseInt(q, 10) } },
        filtroNombreIngreso,
        filtroObraSocial,
      ]
      : [
        filtroNombreIngreso,
        filtroObraSocial,
        filtroNombrePaciente,
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
  convenioId?: number,
  options?: {
    sinEnriquecer?: boolean
    exactoCodigo?: boolean
    limite?: number
    fallbackGlobal?: boolean
  }
): Promise<NomencladorPracticaItem[]> {
  type NomencladorPracticaRow = {
    convenioId: number
    codigo: string
    descripcion: string
    valorEspecialista: import('@prisma/client').Prisma.Decimal | null
    valorAyudante: import('@prisma/client').Prisma.Decimal | null
    valorAnestesista: import('@prisma/client').Prisma.Decimal | null
    valorGastos: import('@prisma/client').Prisma.Decimal | null
  }

  const queryNormalizada = query.trim().toUpperCase()
  const exactoCodigo = options?.exactoCodigo === true
  const permitirFallbackGlobal = options?.fallbackGlobal ?? true
  const limite = Math.max(1, Math.min(options?.limite ?? 20, 50))
  const limiteExactas = Math.min(limite, 10)

  const baseSelect = {
    convenioId: true,
    codigo: true,
    descripcion: true,
    valorEspecialista: true,
    valorAyudante: true,
    valorAnestesista: true,
    valorGastos: true,
  } as const

  const serializarSinEnriquecer = (practicas: NomencladorPracticaRow[]): NomencladorPracticaItem[] => {
    return practicas.map((practica) => ({
      convenioId: practica.convenioId,
      codigo: practica.codigo,
      descripcion: practica.descripcion,
      valor: null,
      valorEspecialista:
        practica.valorEspecialista != null ? Number(practica.valorEspecialista) : null,
      valorAyudante: practica.valorAyudante != null ? Number(practica.valorAyudante) : null,
      valorAnestesista:
        practica.valorAnestesista != null ? Number(practica.valorAnestesista) : null,
      valorGastos: practica.valorGastos != null ? Number(practica.valorGastos) : null,
    }))
  }

  const serializarResultados = async (practicas: NomencladorPracticaRow[]): Promise<NomencladorPracticaItem[]> => {
    if (options?.sinEnriquecer) {
      return serializarSinEnriquecer(practicas)
    }
    return enriquecerPracticasConValor(practicas)
  }

  if (exactoCodigo) {
    const exactas = await prisma.nomencladorPractica.findMany({
      where: {
        ...(convenioId ? { convenioId } : {}),
        codigo: queryNormalizada,
      },
      take: limiteExactas,
      orderBy: [{ convenioId: 'asc' }],
      select: baseSelect,
    })

    if (exactas.length > 0) {
      return serializarResultados(exactas)
    }

    if (convenioId && permitirFallbackGlobal) {
      const exactasGlobales = await prisma.nomencladorPractica.findMany({
        where: { codigo: queryNormalizada },
        take: limiteExactas,
        orderBy: [{ convenioId: 'asc' }],
        select: baseSelect,
      })

      return serializarResultados(exactasGlobales)
    }

    return []
  }

  const pareceCodigo = /^[A-Z0-9]{1,8}$/.test(queryNormalizada)

  const whereBase: Prisma.NomencladorPracticaWhereInput = {
    OR: [
      { descripcion: { contains: queryNormalizada, mode: 'insensitive' as const } },
      pareceCodigo
        ? { codigo: { startsWith: queryNormalizada, mode: 'insensitive' as const } }
        : { codigo: { contains: queryNormalizada, mode: 'insensitive' as const } },
    ],
  }

  const porConvenio = await prisma.nomencladorPractica.findMany({
    where: {
      ...(convenioId ? { convenioId } : {}),
      ...whereBase,
    },
    take: limite,
    orderBy: { descripcion: 'asc' },
    select: baseSelect,
  })

  if (!convenioId || porConvenio.length > 0 || !permitirFallbackGlobal) {
    return serializarResultados(porConvenio)
  }

  // Si el convenio elegido no tiene esa práctica, hacemos fallback global.
  const fallback = await prisma.nomencladorPractica.findMany({
    where: whereBase,
    take: limite,
    orderBy: { descripcion: 'asc' },
    select: baseSelect,
  })
  return serializarResultados(fallback)
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
