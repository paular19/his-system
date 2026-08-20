-- Campo propio para "misma via / misma patologia".
--
-- Antes esa combinacion se guardaba en "diferentesViasPatologia" (distinta via),
-- que aplica 50% de gastos + 75% de especialista. Le corresponde 30% de gastos y
-- 0% de especialista, igual que a "misma via / distinta patologia".
ALTER TABLE "CirugiaDiferencial"
  ADD COLUMN "mismaViaMismaPatologia" BOOLEAN NOT NULL DEFAULT false;

-- Correccion de los registros ya cargados. Al momento de escribir esta migracion
-- las 3 filas con "diferentesViasPatologia" en true fueron cargadas con el
-- sentido "misma via / misma patologia": dos desde la ficha quirurgica (que
-- mapeaba MISMA_VIA_MISMA_PATOLOGIA a este campo) y una desde el panel de
-- facturacion (donde la casilla estaba etiquetada "Misma via / misma patologia").
-- Ninguna significa "distinta via".
UPDATE "CirugiaDiferencial"
  SET "mismaViaMismaPatologia" = true,
      "diferentesViasPatologia" = false
  WHERE "diferentesViasPatologia" = true;
