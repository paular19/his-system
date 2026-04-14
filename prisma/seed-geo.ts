/**
 * SEED — PAIS Y PROVINCIA
 * Carga los países y provincias desde los archivos CSV.
 *
 * Ejecución:
 *   npx tsx prisma/seed-geo.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const paises = [
  { id: 1, descripcion: 'Argentina',  codigoTelefonico: '54' },
  { id: 2, descripcion: 'España',     codigoTelefonico: '34' },
]

const provincias = [
  { id: 2,   nombre: 'CIUDAD AUTÓNOMA DE BUENOS AIRES',              paisId: 1 },
  { id: 6,   nombre: 'BUENOS AIRES',                                  paisId: 1 },
  { id: 10,  nombre: 'CATAMARCA',                                     paisId: 1 },
  { id: 14,  nombre: 'CÓRDOBA',                                       paisId: 1 },
  { id: 18,  nombre: 'CORRIENTES',                                    paisId: 1 },
  { id: 22,  nombre: 'CHACO',                                         paisId: 1 },
  { id: 26,  nombre: 'CHUBUT',                                        paisId: 1 },
  { id: 30,  nombre: 'ENTRE RÍOS',                                    paisId: 1 },
  { id: 34,  nombre: 'FORMOSA',                                       paisId: 1 },
  { id: 38,  nombre: 'JUJUY',                                         paisId: 1 },
  { id: 42,  nombre: 'LA PAMPA',                                      paisId: 1 },
  { id: 46,  nombre: 'LA RIOJA',                                      paisId: 1 },
  { id: 50,  nombre: 'MENDOZA',                                       paisId: 1 },
  { id: 54,  nombre: 'MISIONES',                                      paisId: 1 },
  { id: 58,  nombre: 'NEUQUÉN',                                       paisId: 1 },
  { id: 62,  nombre: 'RÍO NEGRO',                                     paisId: 1 },
  { id: 66,  nombre: 'SALTA',                                         paisId: 1 },
  { id: 70,  nombre: 'SAN JUAN',                                      paisId: 1 },
  { id: 74,  nombre: 'SAN LUIS',                                      paisId: 1 },
  { id: 78,  nombre: 'SANTA CRUZ',                                    paisId: 1 },
  { id: 82,  nombre: 'SANTA FE',                                      paisId: 1 },
  { id: 86,  nombre: 'SANTIAGO DEL ESTERO',                           paisId: 1 },
  { id: 90,  nombre: 'TUCUMÁN',                                       paisId: 1 },
  { id: 94,  nombre: 'TIERRA DEL FUEGO, ANTÁRTIDA E ISLAS DEL',      paisId: 1 },
  { id: 738, nombre: 'GRAL JOSE SAN MARTIN',   paisId: null },
  { id: 739, nombre: 'URUGUAY',                paisId: null },
  { id: 740, nombre: 'GUACHIPAS',              paisId: null },
  { id: 741, nombre: '1118',                   paisId: null },
  { id: 744, nombre: 'SAN PABLO',              paisId: null },
  { id: 745, nombre: 'CERRILLOS',              paisId: null },
  { id: 746, nombre: 'CORDOBA',                paisId: null },
  { id: 747, nombre: 'SALA',                   paisId: null },
  { id: 748, nombre: 'PARQUE 14 DE MAYO',      paisId: null },
  { id: 751, nombre: 'VILLA BELGRANO',         paisId: null },
  { id: 752, nombre: '9 DE JULIO',             paisId: null },
  { id: 753, nombre: 'COLOMBIA',               paisId: null },
  { id: 756, nombre: 'ROSARIO',                paisId: null },
  { id: 757, nombre: 'ALVEAR 1426',            paisId: null },
  { id: 758, nombre: 'BOLIVIA',                paisId: null },
  { id: 759, nombre: 'TIERRA DEL FUEGO',       paisId: null },
  { id: 760, nombre: 'ALTO LA VIÑA',           paisId: null },
  { id: 764, nombre: 'VILLA MITRE',            paisId: null },
  { id: 765, nombre: 'EL CIRCULO 1',           paisId: null },
  { id: 766, nombre: 'EMBARCACION',            paisId: null },
  { id: 767, nombre: 'ENTRE RIOS',             paisId: null },
  { id: 768, nombre: 'salta capital',          paisId: null },
  { id: 769, nombre: 'MANANTIAL SUR',          paisId: null },
  { id: 770, nombre: 'LIMACHE',                paisId: null },
  { id: 771, nombre: 'BRASIL',                 paisId: null },
  { id: 773, nombre: 'VILLA MONICA',           paisId: null },
]

async function main() {
  console.log('Seeding Pais y Provincia...\n')

  // ── Pais ─────────────────────────────────────────────────────
  for (const p of paises) {
    await prisma.pais.upsert({
      where: { id: p.id },
      update: { descripcion: p.descripcion, codigoTelefonico: p.codigoTelefonico },
      create: p,
    })
  }
  console.log(`✓ ${paises.length} países insertados/actualizados`)

  // ── Provincia ─────────────────────────────────────────────────
  for (const prov of provincias) {
    await prisma.provincia.upsert({
      where: { id: prov.id },
      update: { nombre: prov.nombre, paisId: prov.paisId },
      create: prov,
    })
  }
  console.log(`✓ ${provincias.length} provincias insertadas/actualizadas`)

  console.log('\n¡Listo!')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
