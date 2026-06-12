/**
 * SEED — CAMAS
 * Sincroniza el catálogo de camas de la clínica.
 *
 * Ejecución:
 *   npx tsx prisma/seed-camas.ts
 *
 * Requiere: tsx  →  npm i -D tsx
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const USUARIO_SISTEMA = 'SISTEMA'

const piso2Habitaciones = [
  '201',
  '201',
  '202',
  '202',
  '203',
  '203',
  '204',
  '204',
  '205',
  '205',
  '206',
  '206',
  '208',
  '208',
  '209',
  '209',
  '210',
  '210',
]

const piso3Habitaciones = [
  '301',
  '301',
  '301',
  '302',
  '302',
  '302',
  '303',
  '304',
  '304',
  '305',
  '306',
  '306',
  '307',
]

const camas = [
  // ── UTI — Terapia Intensiva (10 camas) ──────────────────
  ...Array.from({ length: 10 }, (_, i) => ({
    identificador: `CU-${String(i + 1).padStart(2, '0')}`,
    habitacion: null,
    sector: 'TERAPIA_INTENSIVA',
    estado: 'DISPONIBLE',
  })),

  // ── Internación Piso 2 (18 camas) ───────────────────────
  ...piso2Habitaciones.map((habitacion, i) => ({
    identificador: `P2-${String(i + 1).padStart(2, '0')}`,
    habitacion,
    sector: 'PISO_2',
    estado: 'DISPONIBLE',
  })),

  // ── Internación Piso 3 (13 camas) ───────────────────────
  ...piso3Habitaciones.map((habitacion, i) => ({
    identificador: `P3-${String(i + 1).padStart(2, '0')}`,
    habitacion,
    sector: 'PISO_3',
    estado: 'DISPONIBLE',
  })),
]

async function main() {
  console.log(`Seeding ${camas.length} camas...`)

  let creadas = 0
  let actualizadas = 0
  let omitidas = 0

  for (const cama of camas) {
    const existe = await prisma.cama.findFirst({
      where: { identificador: cama.identificador },
    })

    if (existe) {
      const requiereActualizacion =
        existe.habitacion !== cama.habitacion ||
        existe.sector !== cama.sector ||
        existe.estado !== cama.estado

      if (requiereActualizacion) {
        await prisma.cama.update({
          where: { id: existe.id },
          data: {
            habitacion: cama.habitacion,
            sector: cama.sector,
            estado: cama.estado,
            usuario: USUARIO_SISTEMA,
            fechaEstado: new Date(),
          },
        })
        actualizadas++
        console.log(`  ~ ${cama.identificador} actualizado [${cama.sector}]`)
      } else {
        omitidas++
      }
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

  console.log(
    `\nListo: ${creadas} creadas, ${actualizadas} actualizadas, ${omitidas} sin cambios.`
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
