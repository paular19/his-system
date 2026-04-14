/**
 * SEED — CAMAS
 * Crea las 39 camas de la clínica si no existen.
 *
 * Ejecución:
 *   npx tsx prisma/seed-camas.ts
 *
 * Requiere: tsx  →  npm i -D tsx
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const USUARIO_SISTEMA = 'SISTEMA'

const camas = [
  // ── UTI — Terapia Intensiva (10 camas) ──────────────────
  ...Array.from({ length: 10 }, (_, i) => ({
    identificador: `CU-${String(i + 1).padStart(2, '0')}`,
    habitacion: null,
    sector: 'TERAPIA_INTENSIVA',
    estado: 'DISPONIBLE',
  })),

  // ── Internación Piso 2 (16 camas) ───────────────────────
  ...Array.from({ length: 16 }, (_, i) => ({
    identificador: `P2-${String(i + 1).padStart(2, '0')}`,
    habitacion: `2${String(Math.floor(i / 2) + 1).padStart(2, '0')}`,
    sector: 'PISO_2',
    estado: 'DISPONIBLE',
  })),

  // ── Internación Piso 3 (13 camas) ───────────────────────
  ...Array.from({ length: 13 }, (_, i) => ({
    identificador: `P3-${String(i + 1).padStart(2, '0')}`,
    habitacion: `3${String(Math.floor(i / 2) + 1).padStart(2, '0')}`,
    sector: 'PISO_3',
    estado: 'DISPONIBLE',
  })),
]

async function main() {
  console.log(`Seeding ${camas.length} camas...`)

  let creadas = 0
  let omitidas = 0

  for (const cama of camas) {
    const existe = await prisma.cama.findFirst({
      where: { identificador: cama.identificador },
    })

    if (existe) {
      omitidas++
      continue
    }

    await prisma.cama.create({
      data: {
        identificador: cama.identificador,
        habitacion: cama.habitacion,
        sector: cama.sector,
        estado: cama.estado,
        usuario: USUARIO_SISTEMA,
        fechaEstado: new Date(),
      },
    })
    creadas++
    console.log(`  ✓ ${cama.identificador} [${cama.sector}]`)
  }

  console.log(`\nListo: ${creadas} creadas, ${omitidas} ya existían.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
