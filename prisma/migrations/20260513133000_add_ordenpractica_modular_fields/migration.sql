-- Add per-item modular configuration fields
ALTER TABLE "OrdenPrac" ADD COLUMN "OprTitularModular" VARCHAR(100);
ALTER TABLE "OrdenPrac" ADD COLUMN "OprImprimirDuplicado" BOOLEAN NOT NULL DEFAULT false;
