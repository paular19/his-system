import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Find all practices with null importeTotal
const nullPracticas = await prisma.practica.findMany({
	where: { importeTotal: null, facturable: true },
	select: { id: true, codigoPractica: true, cantidad: true,
		ingreso: { select: { obraSocialId: true, obraSocialCoseguroId: true, obraSocial: { select: { nombre: true } } } }
	}
});
console.log(`Found ${nullPracticas.length} practices with null importeTotal`);

// Get all unique codes
function normalizarCodigo(c) { return c.trim().slice(0,8).toUpperCase(); }
const codigos = [...new Set(nullPracticas.map(p => normalizarCodigo(p.codigoPractica)).filter(Boolean))];

// Look them up in NomencladorPrestacion
const prestaciones = await prisma.nomencladorPrestacion.findMany({
	where: { codigo: { in: codigos } },
	select: { codigo: true, valor: true }
});
const valorMap = new Map(prestaciones.map(p => [normalizarCodigo(p.codigo), Number(p.valor ?? 0)]));

// Also build fallback from historical practices with importeTotal set
const historicos = await prisma.practica.findMany({
	where: { codigoPractica: { in: codigos.map(c => c.padEnd(8,' ')) }, importeTotal: { not: null, gt: 0 }, cantidad: { gt: 0 } },
	orderBy: { id: 'desc' },
	select: { codigoPractica: true, importeTotal: true, cantidad: true },
	take: codigos.length * 10
});
for (const h of historicos) {
	const k = normalizarCodigo(h.codigoPractica);
	if (!valorMap.has(k) || valorMap.get(k) === 0) {
		const unit = Number(h.importeTotal) / Number(h.cantidad);
		if (unit > 0) valorMap.set(k, unit);
	}
}

// Update each practice
let updated = 0;
for (const p of nullPracticas) {
	const key = normalizarCodigo(p.codigoPractica);
	const precio = valorMap.get(key) ?? 0;
	if (precio <= 0) { console.log(`No price for code ${key}, skipping practice ${p.id}`); continue; }
	// Apply IPSS 80% if obraSocial contains IPSS, else 100%
	const nombre = (p.ingreso?.obraSocial?.nombre ?? '').toUpperCase().replace(/[^A-Z0-9 ]/g,' ').trim();
	const tokens = nombre.split(' ');
	const esIPSS = tokens.includes('IPSS') || tokens.includes('IPS');
	const pct = esIPSS ? 0.80 : 1.00;
	const importeTotal = Math.round(precio * Number(p.cantidad) * pct * 100) / 100;
	await prisma.practica.update({ where: { id: p.id }, data: { importeTotal } });
	console.log(`Updated practice ${p.id} code=${key} precio=${precio} pct=${pct} importeTotal=${importeTotal}`);
	updated++;
}
console.log(`Updated ${updated} practices`);
await prisma.$disconnect();
