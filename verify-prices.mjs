import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Check current state of ingreso 16 practices
const pracs16 = await prisma.practica.findMany({
  where: { ingresoId: 16 },
  select: { id: true, codigoPractica: true, importeTotal: true, cantidad: true, facturable: true }
});
console.log('Ingreso 16 practices:', JSON.stringify(pracs16));

// Check all practices with importeTotal set
const withValue = await prisma.practica.count({ where: { importeTotal: { not: null, gt: 0 } } });
const withNull = await prisma.practica.count({ where: { importeTotal: null } });
console.log(`Practices with value: ${withValue}, with null: ${withNull}`);

await prisma.$disconnect();
