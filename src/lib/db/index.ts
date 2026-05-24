import { PrismaClient } from '@prisma/client'
import dns from 'node:dns'
import { getAuditContext } from '@/lib/security/audit-context'

type AccionCrudAudit = 'CREAR' | 'MODIFICAR' | 'ELIMINAR' | 'CONSULTAR'

const OPERACION_A_ACCION_AUDIT: Record<string, AccionCrudAudit> = {
  create: 'CREAR',
  createMany: 'CREAR',
  createManyAndReturn: 'CREAR',
  update: 'MODIFICAR',
  updateMany: 'MODIFICAR',
  updateManyAndReturn: 'MODIFICAR',
  upsert: 'MODIFICAR',
  delete: 'ELIMINAR',
  deleteMany: 'ELIMINAR',
  findUnique: 'CONSULTAR',
  findUniqueOrThrow: 'CONSULTAR',
  findFirst: 'CONSULTAR',
  findFirstOrThrow: 'CONSULTAR',
  findMany: 'CONSULTAR',
  count: 'CONSULTAR',
  aggregate: 'CONSULTAR',
  groupBy: 'CONSULTAR',
  $queryRaw: 'CONSULTAR',
  $queryRawUnsafe: 'CONSULTAR',
  $executeRaw: 'MODIFICAR',
  $executeRawUnsafe: 'MODIFICAR',
}

const OPERACIONES_AUDITABLES = new Set(Object.keys(OPERACION_A_ACCION_AUDIT))

const MAX_DETALLE_AUDIT = 2000

function esScalar(value: unknown): value is string | number | boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
}

function sanitizeAuditValue(value: unknown, depth = 0): unknown {
  if (depth > 3) return '[recortado]'
  if (value === null || value === undefined) return value
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'bigint') return value.toString()
  if (esScalar(value)) return value

  if (Array.isArray(value)) {
    return value.slice(0, 15).map((item) => sanitizeAuditValue(item, depth + 1))
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, raw] of Object.entries(value)) {
      const lowerKey = key.toLowerCase()
      if (
        lowerKey.includes('password') ||
        lowerKey.includes('clave') ||
        lowerKey.includes('token') ||
        lowerKey.includes('secret')
      ) {
        out[key] = '***'
        continue
      }
      out[key] = sanitizeAuditValue(raw, depth + 1)
    }
    return out
  }

  return String(value)
}

function resumenResultado(result: unknown): unknown {
  if (result === null || result === undefined) return null

  if (Array.isArray(result)) {
    return { total: result.length }
  }

  if (typeof result === 'object') {
    const asRecord = result as Record<string, unknown>

    if (typeof asRecord.count === 'number') {
      return { count: asRecord.count }
    }

    if (esScalar(asRecord.id)) {
      return { id: asRecord.id }
    }

    return 'objeto'
  }

  return result
}

function extractRegistroId(args: unknown, result: unknown): string | undefined {
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const id = (result as Record<string, unknown>).id
    if (esScalar(id)) {
      return String(id)
    }
  }

  if (args && typeof args === 'object') {
    const where = (args as Record<string, unknown>).where
    if (where && typeof where === 'object' && !Array.isArray(where)) {
      const entries = Object.entries(where)
      if (entries.length === 1 && esScalar(entries[0]?.[1])) {
        return String(entries[0][1])
      }

      const serialized = JSON.stringify(sanitizeAuditValue(where))
      return serialized.length > 120 ? `${serialized.slice(0, 120)}...` : serialized
    }
  }

  return undefined
}

function buildDetalleAudit(operation: string, args: unknown, result: unknown): string {
  const argObj = (args && typeof args === 'object')
    ? (args as Record<string, unknown>)
    : null

  const payload: Record<string, unknown> = {
    operacion: operation,
    where: sanitizeAuditValue(argObj?.where),
    data: sanitizeAuditValue(argObj?.data),
    resultado: resumenResultado(result),
  }

  const serialized = JSON.stringify(payload)
  if (serialized.length <= MAX_DETALLE_AUDIT) {
    return serialized
  }

  return `${serialized.slice(0, MAX_DETALLE_AUDIT)}...(truncado)`
}

async function registrarCrudAutomatico(params: {
  prismaBase: PrismaClient
  model?: string
  operation: string
  args: unknown
  result: unknown
}): Promise<void> {
  const accion = OPERACION_A_ACCION_AUDIT[params.operation]
  if (!accion) return

  const contexto = getAuditContext()

  try {
    await params.prismaBase.auditLog.create({
      data: {
        usuario: contexto.usuario ?? 'SISTEMA',
        accion,
        entidad: params.model ?? 'RAW_SQL',
        registroId: extractRegistroId(params.args, params.result),
        detalle: buildDetalleAudit(params.operation, params.args, params.result),
        direccionIp: contexto.direccionIp,
        userAgent: contexto.userAgent,
      },
    })
  } catch (error) {
    // La auditoría automática nunca debe romper el flujo principal.
    console.error('[AUDIT AUTO ERROR]', error)
  }
}

if (process.env.NODE_ENV === 'development') {
  // In some Windows/ISP setups, IPv6 resolution can fail while IPv4 works.
  dns.setDefaultResultOrder('ipv4first')
}

// Singleton de Prisma para evitar conexiones múltiples en desarrollo (hot reload)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function buildPrismaUrlForDev(): string | undefined {
  const rawUrl = process.env.DATABASE_URL
  if (!rawUrl) return undefined

  const requestedConnectionLimit = Number.parseInt(process.env.PRISMA_DEV_CONNECTION_LIMIT ?? '5', 10)
  const devConnectionLimit = Number.isFinite(requestedConnectionLimit)
    ? Math.max(2, requestedConnectionLimit)
    : 5
  const devPoolTimeout = process.env.PRISMA_DEV_POOL_TIMEOUT ?? '60'

  try {
    const url = new URL(rawUrl)

    // Limita conexiones por proceso de Next en desarrollo para no agotar la DB.
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', String(devConnectionLimit))
    }

    // Da mas margen para esperar una conexion libre bajo carga.
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', devPoolTimeout)
    }

    return url.toString()
  } catch {
    return rawUrl
  }
}

const datasourceUrl =
  process.env.NODE_ENV === 'development'
    ? buildPrismaUrlForDev()
    : process.env.DATABASE_URL

const prismaBase =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: datasourceUrl, // Configuración de conexión en la URL
      },
    },
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prismaBase
}

const prismaConAudit = prismaBase.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const result = await query(args)

        if (model === 'AuditLog') {
          return result
        }

        if (!OPERACIONES_AUDITABLES.has(operation)) {
          return result
        }

        void registrarCrudAutomatico({
          prismaBase,
          model,
          operation,
          args,
          result,
        })

        return result
      },
    },
  },
})

export const prisma: PrismaClient = prismaConAudit as unknown as PrismaClient
