/**
 * Seed: obras sociales requeridas por el motor de reglas de facturación.
 * Usa upsert por ID para ser idempotente (seguro de re-ejecutar).
 *
 * Ejecutar con:
 *   npx tsx prisma/seed-obras-sociales-reglas.ts
 */

import { PrismaClient } from '@prisma/client'

const RETRYABLE_ERROR_CODES = new Set(['P1001', 'P1002', 'P2024'])

function construirDatasourceUrlSeed(): string | undefined {
    const raw = process.env.DATABASE_URL
    if (!raw) return undefined

    try {
        const url = new URL(raw)
        url.searchParams.set('connection_limit', process.env.PRISMA_SEED_CONNECTION_LIMIT ?? '1')
        url.searchParams.set('pool_timeout', process.env.PRISMA_SEED_POOL_TIMEOUT ?? '120')
        return url.toString()
    } catch {
        return raw
    }
}

const datasourceUrlSeed = construirDatasourceUrlSeed()
const prisma = datasourceUrlSeed
    ? new PrismaClient({ datasourceUrl: datasourceUrlSeed })
    : new PrismaClient()

const OBRAS_SOCIALES = [
    // ── Obras sociales principales con reglas especiales ──────────────────────
    // IPSS ya existe con ID 1; se incluye para confirmar estado activo
    { id: 1, nombre: 'IPSS - Cod.1', requiereCoseguro: 'S' },
    { id: 41, nombre: 'OSPSA - SALTA - Cod.41', requiereCoseguro: 'N' },
    { id: 190, nombre: 'AMSTERDAM SALUD SA - Cod.190', requiereCoseguro: 'N' },
    { id: 202, nombre: 'OSPERHYRA - Cod.202', requiereCoseguro: 'N' },
    { id: 213, nombre: 'RED ARGENTINA SALUD - Cod.213', requiereCoseguro: 'N' },
    { id: 235, nombre: 'MEDIFE', requiereCoseguro: 'N' },
    { id: 346, nombre: 'ACIDSAL - Cod.346', requiereCoseguro: 'N' },
    { id: 352, nombre: 'NOBIS SA - COD.352', requiereCoseguro: 'N' },
    { id: 358, nombre: 'PREVENCION SALUD', requiereCoseguro: 'N' },
    { id: 511, nombre: 'OSECAC CONV DIRECT - Cod.511', requiereCoseguro: 'N' },
    { id: 1520, nombre: 'OSUTHGRA - Cod.1520', requiereCoseguro: 'N' },
    // OSUNSA — no existía en la base, se asigna ID 1526
    { id: 1526, nombre: 'OSUNSA - Cod.1526', requiereCoseguro: 'N' },

    // ── Coseguros IPSS ─────────────────────────────────────────────────────────
    { id: 1501, nombre: 'INTEGRAL', requiereCoseguro: 'N' },
    { id: 1502, nombre: 'TOTAL A', requiereCoseguro: 'N' },
    { id: 1504, nombre: 'TOTAL B', requiereCoseguro: 'N' },
    { id: 1505, nombre: 'UTM', requiereCoseguro: 'N' },
    { id: 1506, nombre: 'UPCN', requiereCoseguro: 'N' },
    { id: 1507, nombre: 'ATSA', requiereCoseguro: 'N' },
    { id: 1508, nombre: 'ADP', requiereCoseguro: 'N' },
    { id: 1510, nombre: 'NOVAMED', requiereCoseguro: 'N' },
    // SOEM (plain) — 1511 estaba libre en el seed original
    { id: 1511, nombre: 'SOEM', requiereCoseguro: 'N' },
    { id: 1512, nombre: 'PREVISER', requiereCoseguro: 'N' },
    { id: 1513, nombre: 'SOEME', requiereCoseguro: 'N' },
    { id: 1514, nombre: 'EMPRENDER', requiereCoseguro: 'N' },
] as const

function esErrorPrismaReintentable(error: unknown): boolean {
    if (!(error instanceof Error)) return false

    const code = (error as { code?: string }).code
    if (typeof code === 'string' && RETRYABLE_ERROR_CODES.has(code)) return true

    const msg = error.message ?? ''
    return /Timed out fetching a new connection from the connection pool|Can't reach database server/i.test(msg)
}

async function ejecutarConReintento<T>(
    descripcion: string,
    fn: () => Promise<T>,
    maxIntentos = 6
): Promise<T> {
    let intento = 1

    while (true) {
        try {
            return await fn()
        } catch (error) {
            const ultimoIntento = intento >= maxIntentos
            if (ultimoIntento || !esErrorPrismaReintentable(error)) throw error

            const esperaMs = Math.min(6000, intento * 1200)
            console.warn(
                `  Reintentando ${descripcion} (${intento}/${maxIntentos - 1}) en ${esperaMs}ms...`
            )
            await new Promise((resolve) => setTimeout(resolve, esperaMs))
            intento += 1
        }
    }
}

async function main() {
    console.log('Iniciando seed de obras sociales para reglas de facturación...\n')

    for (const os of OBRAS_SOCIALES) {
        const result = await ejecutarConReintento(`OS ${os.id}`, () =>
            prisma.obraSocial.upsert({
                where: { id: os.id },
                update: {
                    nombre: os.nombre,
                    estado: 'A',
                    requiereCoseguro: os.requiereCoseguro,
                },
                create: {
                    id: os.id,
                    nombre: os.nombre,
                    requiereCoseguro: os.requiereCoseguro,
                    estado: 'A',
                    fechaEstado: new Date(),
                },
            })
        )

        console.log(`  [${result.id.toString().padStart(4, ' ')}] ${result.nombre}`)
    }

    console.log(`\nSeed completado. ${OBRAS_SOCIALES.length} registros procesados.`)
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
