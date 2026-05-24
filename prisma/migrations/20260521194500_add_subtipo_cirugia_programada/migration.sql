-- Add/activate dedicated subtype for scheduled surgery
INSERT INTO "SubtipoAdmision" ("SAdCodig", "SAdDescrip", "SAdEstado", "UsuCodig", "SAdFchEstado")
VALUES ('PRG', 'Cirugia Programada', 'A', 'SYSTEM', NOW())
ON CONFLICT ("SAdCodig") DO UPDATE
SET
  "SAdDescrip" = EXCLUDED."SAdDescrip",
  "SAdEstado" = 'A',
  "UsuCodig" = 'SYSTEM',
  "SAdFchEstado" = NOW();

-- Backfill old scheduled surgery ingresos that were incorrectly tagged as SUT
UPDATE "IngresoSubtipo" AS "is"
SET
  "SAdCodig" = 'PRG',
  "InSuFchEstado" = NOW()
WHERE "is"."SAdCodig" = 'SUT'
  AND EXISTS (
    SELECT 1
    FROM "CirugiaProgramada" AS cp
    WHERE cp."internacionId" = "is"."IngID"
  );
