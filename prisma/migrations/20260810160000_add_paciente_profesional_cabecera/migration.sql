ALTER TABLE "Paciente"
ADD COLUMN "PrfIDCabecera" INTEGER;

CREATE INDEX "Paciente_PrfIDCabecera_idx"
ON "Paciente"("PrfIDCabecera");

ALTER TABLE "Paciente"
ADD CONSTRAINT "Paciente_PrfIDCabecera_fkey"
FOREIGN KEY ("PrfIDCabecera") REFERENCES "Profesional"("PrfID")
ON DELETE SET NULL ON UPDATE CASCADE;
