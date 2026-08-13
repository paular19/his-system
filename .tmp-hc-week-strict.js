const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const resumen = await prisma.$queryRawUnsafe(`
    SELECT DATE("PacFchIni") AS fecha,
           COUNT(*)::int AS cantidad,
           MIN("PacHC")::int AS hc_min,
           MAX("PacHC")::int AS hc_max
    FROM "Paciente"
    WHERE "PacFchIni" >= (NOW() - INTERVAL '7 days')
      AND "PacFchIni" <= NOW()
    GROUP BY DATE("PacFchIni")
    ORDER BY DATE("PacFchIni") ASC
  `);

  const lista = await prisma.$queryRawUnsafe(`
    SELECT "PacHC"::int AS hc,
           "PacNomCom" AS nombre,
           "PacFchIni" AS fecha_alta
    FROM "Paciente"
    WHERE "PacFchIni" >= (NOW() - INTERVAL '7 days')
      AND "PacFchIni" <= NOW()
    ORDER BY "PacFchIni" ASC, "PacHC" ASC
  `);

  const seq = await prisma.$queryRawUnsafe(`
    SELECT last_value::text AS last_value, is_called
    FROM "Paciente_HC_seq"
  `);

  console.log(JSON.stringify({ total: lista.length, resumen, secuenciaActual: seq?.[0] ?? null, lista }, null, 2));
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  try { await prisma.$disconnect(); } catch {}
  process.exit(1);
});
