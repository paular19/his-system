-- Add double-surgery differential controls
ALTER TABLE "CirugiaDiferencial"
ADD COLUMN "dobleCirugia" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "practicaBaseId" INTEGER;

CREATE INDEX "CirugiaDiferencial_practicaBaseId_idx" ON "CirugiaDiferencial"("practicaBaseId");
