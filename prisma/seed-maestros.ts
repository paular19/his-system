/**
 * SEED — TABLAS MAESTRAS
 * Crea los registros base necesarios para que el sistema funcione.
 *
 * Ejecución:
 *   npx tsx prisma/seed-maestros.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding tablas maestras...\n')

  // ── TipoIngreso ──────────────────────────────────────────
  const tiposIngreso = [
    { codigo: 'A',   descripcion: 'Ambulatorio',          proximoNumero: 1 },
    { codigo: 'G',   descripcion: 'Guardia / Turno',      proximoNumero: 1 },
    { codigo: 'I',   descripcion: 'Internado',             proximoNumero: 1 },
    { codigo: 'M',   descripcion: 'Mantenimiento',         proximoNumero: 1 },
    { codigo: 'R',   descripcion: 'Reserva',               proximoNumero: 1 },
    { codigo: 'T',   descripcion: 'ART',                   proximoNumero: 1 },
  ]

  for (const tipo of tiposIngreso) {
    await prisma.tipoIngreso.upsert({
      where:  { codigo: tipo.codigo },
      update: { descripcion: tipo.descripcion },
      create: tipo,
    })
    console.log(`  ✓ TipoIngreso: ${tipo.codigo} — ${tipo.descripcion}`)
  }

  // ── TipoInternacion ──────────────────────────────────────
  const tiposInternacion = [
    { codigo: 'GEN', descripcion: 'General',              esAmbulatorio: false },
    { codigo: 'UTI', descripcion: 'Terapia Intensiva',    esAmbulatorio: false },
    { codigo: 'CIR', descripcion: 'Cirugía Programada',   esAmbulatorio: false },
    { codigo: 'OBS', descripcion: 'Observación',          esAmbulatorio: true  },
    { codigo: 'CON', descripcion: 'Consulta / Indicación',esAmbulatorio: true  },
  ]

  for (const tipo of tiposInternacion) {
    await prisma.tipoInternacion.upsert({
      where:  { codigo: tipo.codigo },
      update: { descripcion: tipo.descripcion, esAmbulatorio: tipo.esAmbulatorio },
      create: tipo,
    })
    console.log(`  ✓ TipoInternacion: ${tipo.codigo} — ${tipo.descripcion}`)
  }

  // ── MotivoEgreso ─────────────────────────────────────────
  const motivosEgreso = [
    { codigo: 'AL', descripcion: 'Alta médica' },
    { codigo: 'TR', descripcion: 'Traslado' },
    { codigo: 'FA', descripcion: 'Fallecimiento' },
    { codigo: 'AV', descripcion: 'Alta voluntaria' },
    { codigo: 'FU', descripcion: 'Fuga' },
  ]

  for (const motivo of motivosEgreso) {
    await prisma.motivoEgreso.upsert({
      where:  { codigo: motivo.codigo },
      update: { descripcion: motivo.descripcion },
      create: motivo,
    })
    console.log(`  ✓ MotivoEgreso: ${motivo.codigo} — ${motivo.descripcion}`)
  }

  // ── TipoMovimientoIngreso ─────────────────────────────────
  const tiposMovimiento = [
    { codigo: 'ING', descripcion: 'Ingreso',   signo:  1 },
    { codigo: 'EGR', descripcion: 'Egreso',    signo: -1 },
    { codigo: 'PAG', descripcion: 'Pago',      signo: -1 },
    { codigo: 'CAR', descripcion: 'Cargo',     signo:  1 },
    { codigo: 'AJU', descripcion: 'Ajuste',    signo:  1 },
  ]

  for (const tipo of tiposMovimiento) {
    await prisma.tipoMovimientoIngreso.upsert({
      where:  { codigo: tipo.codigo },
      update: { descripcion: tipo.descripcion, signo: tipo.signo },
      create: tipo,
    })
    console.log(`  ✓ TipoMovimientoIngreso: ${tipo.codigo} — ${tipo.descripcion}`)
  }

  // ── TipoOrden ─────────────────────────────────────────────
  const tiposOrden = [
    { codigo: 'MED', descripcion: 'Medicación' },
    { codigo: 'PRC', descripcion: 'Prácticas / Estudios' },
    { codigo: 'CAM', descripcion: 'Autorización de Cama' },
    { codigo: 'QUI', descripcion: 'Quirófano' },
  ]

  for (const tipo of tiposOrden) {
    await prisma.tipoOrden.upsert({
      where:  { codigo: tipo.codigo },
      update: { descripcion: tipo.descripcion },
      create: tipo,
    })
    console.log(`  ✓ TipoOrden: ${tipo.codigo} — ${tipo.descripcion}`)
  }

  console.log('\nListo.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
