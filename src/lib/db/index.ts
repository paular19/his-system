import { PrismaClient } from '@prisma/client'

// Singleton de Prisma para evitar conexiones múltiples en desarrollo (hot reload)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function buildPrismaUrlForDev(): string | undefined {
  const rawUrl = process.env.DATABASE_URL
  if (!rawUrl) return undefined

  try {
    const url = new URL(rawUrl)

    // Limita conexiones por proceso de Next en desarrollo para no agotar la DB.
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', '4')
    }

    // Da mas margen para esperar una conexion libre bajo carga.
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', '30')
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
