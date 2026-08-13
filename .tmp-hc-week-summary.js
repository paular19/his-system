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
    GROUP BY DATE("PacFchIni")
    ORDER BY DATE("PacFchIni") ASC
  `);

  const primeros = await prisma.$queryRawUnsafe(`
    SELECT "PacHC"::int AS hc,
           "PacNomCom" AS nombre,
           "PacFchIni" AS fecha_alta
    FROM "Paciente"
    WHERE "PacFchIni" >= (NOW() - INTERVAL '7 days')
    ORDER BY "PacFchIni" ASC, "PacHC" ASC
    LIMIT 20
  `);

  const ultimos = await prisma.$queryRawUnsafe(`
    SELECT "PacHC"::int AS hc,
           "PacNomCom" AS nombre,
           "PacFchIni" AS fecha_alta
    FROM "Paciente"
    WHERE "PacFchIni" >= (NOW() - INTERVAL '7 days')
    ORDER BY "PacFchIni" DESC, "PacHC" DESC
    LIMIT 20
  `);

  const seq = await prisma.$queryRawUnsafe(`
    SELECT last_value::text AS last_value, is_called
    FROM "Paciente_HC_seq"
  `);

  const payload = { resumen, primeros, ultimos, secuenciaActual: seq?.[0] ?? null };
  const json = JSON.stringify(payload, null, 2);
  require('fs').writeFileSync('.tmp-hc-week-summary-output.json', json, 'utf8');
  console.log('OK_WRITTEN');

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  try { await prisma.$disconnect(); } catch {}
  process.exit(1);
});
