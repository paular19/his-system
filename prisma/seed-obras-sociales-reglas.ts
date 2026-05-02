/**
 * Seed: obras sociales requeridas por el motor de reglas de facturación.
 * Usa upsert por ID para ser idempotente (seguro de re-ejecutar).
 *
 * Ejecutar con:
 *   npx tsx prisma/seed-obras-sociales-reglas.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const OBRAS_SOCIALES = [
    // ── Obras sociales principales con reglas especiales ──────────────────────
    // IPSS ya existe con ID 1; se incluye para confirmar estado activo
    { id: 1, nombre: 'IPSS - Cod.1', requiereCoseguro: 'S' },
    { id: 41, nombre: 'OSPSA - SALTA - Cod.41', requiereCoseguro: 'N' },
    { id: 202, nombre: 'OSPERHYRA - Cod.202', requiereCoseguro: 'N' },
    { id: 213, nombre: 'RED ARGENTINA SALUD - Cod.213', requiereCoseguro: 'N' },
    { id: 346, nombre: 'ACIDSAL - Cod.346', requiereCoseguro: 'N' },
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

async function main() {
    console.log('Iniciando seed de obras sociales para reglas de facturación...\n')

    for (const os of OBRAS_SOCIALES) {
        const result = await prisma.obraSocial.upsert({
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
