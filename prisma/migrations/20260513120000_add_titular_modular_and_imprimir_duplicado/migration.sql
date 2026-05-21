-- AddColumn OrdTitularModular
ALTER TABLE "Orden" ADD COLUMN "OrdTitularModular" VARCHAR(100);

-- AddColumn OrdImprimirDuplicado
ALTER TABLE "Orden" ADD COLUMN "OrdImprimirDuplicado" BOOLEAN NOT NULL DEFAULT false;
