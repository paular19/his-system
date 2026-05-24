import { PrismaClient } from '@prisma/client'
import dns from 'node:dns'

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

export const prisma =
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
  globalForPrisma.prisma = prisma
}
