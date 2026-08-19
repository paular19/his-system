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

// Identificador explicito: la 203 tiene una sola cama, asi que P2-06 no existe
// y la numeracion queda con un hueco (no se renumera para no perder historial).
const piso2Camas: Array<[string, string]> = [
  ['P2-01', '201'],
  ['P2-02', '201'],
  ['P2-03', '202'],
  ['P2-04', '202'],
  ['P2-05', '203'],
  ['P2-07', '204'],
  ['P2-08', '204'],
  ['P2-09', '205'],
  ['P2-10', '205'],
  ['P2-11', '206'],
  ['P2-12', '206'],
  ['P2-13', '208'],
  ['P2-14', '208'],
  ['P2-15', '209'],
  ['P2-16', '209'],
  ['P2-17', '210'],
  ['P2-18', '210'],
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

// UTI: 10 camas, numeradas 1..8 con dos bis (7B y 8B) que van al lado de 7 y 8.
// El orden del mapa sale del identificador asc, por eso el sufijo B.
const utiIdentificadores = [
  'CU-01',
  'CU-02',
  'CU-03',
  'CU-04',
  'CU-05',
  'CU-06',
  'CU-07',
  'CU-07B',
  'CU-08',
  'CU-08B',
]

const camas = [
  // ── UTI — Terapia Intensiva (10 camas) ──────────────────
  ...utiIdentificadores.map((identificador) => ({
    identificador,
    habitacion: null,
    sector: 'TERAPIA_INTENSIVA',
    estado: 'DISPONIBLE',
  })),

  // ── Internación Piso 2 (17 camas) ───────────────────────
  ...piso2Camas.map(([identificador, habitacion]) => ({
    identificador,
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
