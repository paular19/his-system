ALTER TABLE "LoteFacturacion"
ADD COLUMN IF NOT EXISTS "LotAjuste" VARCHAR(20);

-- Los lotes que ya tenian importes ajustados fueron todos por PROMEDI: el descuento
-- del -20% no existia todavia.
UPDATE "LoteFacturacion" l
SET "LotAjuste" = 'PROMEDI'
WHERE l."LotAjuste" IS NULL
  AND (
    EXISTS (SELECT 1 FROM "LoteFacturacionItem" i WHERE i."LotID" = l."LotID" AND i."LItImpPromedi" IS NOT NULL)
    OR EXISTS (SELECT 1 FROM "LoteIPSTxtItem" p WHERE p."LotID" = l."LotID" AND p."LipImpPromedi" IS NOT NULL)
  );
