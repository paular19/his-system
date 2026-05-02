import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const cols = await prisma.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_name = 'Paciente' ORDER BY ordinal_position`);
console.log('Columns:', JSON.stringify(cols));
const sample = await prisma.paciente.findFirst({ select: { id: true, obraSocialId: true, planId: true, numeroAfiliado: true } });
console.log('Sample patient:', JSON.stringify(sample));
await prisma.$disconnect();
