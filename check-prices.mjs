import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Practices with space-padded codes (created via admision form)
const withSpaces = await prisma.practica.findMany({ where: { codigoPractica: { contains: ' ' } }, take: 5, orderBy: { id: 'desc' }, select: { id: true, codigoPractica: true, importeTotal: true, cantidad: true } });
console.log('Practicas with spaces in code:', JSON.stringify(withSpaces));
const totalSpaces = await prisma.practica.count({ where: { codigoPractica: { contains: ' ' } } });
console.log('Total with spaces:', totalSpaces);

// Most recent practices regardless
const recent = await prisma.practica.findMany({ take: 3, orderBy: { id: 'desc' }, select: { id: true, codigoPractica: true, importeTotal: true, cantidad: true, ingresoId: true } });
console.log('Most recent practices:', JSON.stringify(recent));

await prisma.$disconnect();

// Check NomencladorPractica (used for search)
const nomsPractica = await prisma.nomencladorPractica.findMany({ take: 5, select: { convenioId: true, codigo: true, descripcion: true } });
console.log('NomencladorPractica sample:', JSON.stringify(nomsPractica));
const totalNomPractica = await prisma.nomencladorPractica.count();
console.log('Total NomencladorPractica:', totalNomPractica);

// Check sample nomenclador entries
const noms = await prisma.nomencladorPrestacion.findMany({ take: 5, select: { codigo: true, descripcion: true, valor: true } });
console.log('NomencladorPrestacion sample:', JSON.stringify(noms));

// Check cross-match between the two tables
const nomPracCodes = nomsPractica.map(p => p.codigo.trim());
const crossMatch = await prisma.nomencladorPrestacion.findMany({ where: { codigo: { in: nomPracCodes } }, select: { codigo: true, valor: true } });
console.log('Cross-match NomPractica→NomPrestacion:', JSON.stringify(crossMatch));

// Practices without importeTotal (the problem cases)
const sinPrecio = await prisma.practica.findMany({ where: { importeTotal: null }, take: 5, orderBy: { id: 'desc' }, select: { id: true, codigoPractica: true, cantidad: true } });
console.log('Practicas sin precio:', JSON.stringify(sinPrecio));

// Check latest practicas
const pracs = await prisma.practica.findMany({ take: 5, orderBy: { id: 'desc' }, select: { id: true, codigoPractica: true, importeTotal: true, cantidad: true } });
console.log('Practicas sample:', JSON.stringify(pracs));

// Try to match: normalize codigo like the repository does
const codigosPractica = pracs.map(p => p.codigoPractica.trim().slice(0, 8).toUpperCase());
console.log('Normalized practice codes:', codigosPractica);

const matched = await prisma.nomencladorPrestacion.findMany({
    where: { codigo: { in: codigosPractica } },
    select: { codigo: true, valor: true }
});
console.log('Matched nomenclador entries:', JSON.stringify(matched));

// Check total rows with valor > 0
const conValor = await prisma.nomencladorPrestacion.count({ where: { valor: { gt: 0 } } });
const total = await prisma.nomencladorPrestacion.count();
console.log(`Nomenclador: ${total} total, ${conValor} with valor > 0`);

await prisma.$disconnect();
