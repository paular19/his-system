const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT "PacID" AS id,
           "PacHC" AS hc,
           "PacNomCom" AS nombre,
           "PacFchIni" AS fecha_alta
    FROM "Paciente"
    WHERE "PacFchIni" >= (NOW() - INTERVAL '7 days')
    ORDER BY "PacFchIni" ASC, "PacHC" ASC
  `);

  const seq = await prisma.$queryRawUnsafe(`
    SELECT last_value AS last_value,
           is_called AS is_called
    FROM "Paciente_HC_seq"
  `);

  console.log(JSON.stringify({
    total: rows.length,
    secuenciaActual: seq?.[0] ?? null,
    rows,
  }, null, 2));

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  try { await prisma.$disconnect(); } catch {}
  process.exit(1);
});
