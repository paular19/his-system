-- Search-performance indexes for ILIKE/contains lookups used by autocompletes.
-- Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Obra social search (facturacion)
CREATE INDEX IF NOT EXISTS "idx_obrasocial_nombre_trgm"
  ON "ObraSocial" USING GIN ("OSNom" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_obrasocial_estado_nombre"
  ON "ObraSocial" ("OSEstad", "OSNom");

-- Catalogos UTI search
CREATE INDEX IF NOT EXISTS "idx_catalogo_medicamento_nombre_trgm"
  ON "CatalogoMedicamentoUti" USING GIN ("CMUNombre" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_catalogo_medicamento_estado_nombre"
  ON "CatalogoMedicamentoUti" ("CMUEstado", "CMUNombre");

CREATE INDEX IF NOT EXISTS "idx_catalogo_descartable_nombre_trgm"
  ON "CatalogoDescartableUti" USING GIN ("CDUNombre" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_catalogo_descartable_estado_nombre"
  ON "CatalogoDescartableUti" ("CDUEstado", "CDUNombre");

-- Fallback usage tables used in catalog suggestions
CREATE INDEX IF NOT EXISTS "idx_medicacion_nombre_trgm"
  ON "MedicacionIngreso" USING GIN ("MedNombre" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_descartable_nombre_trgm"
  ON "DescartableIngreso" USING GIN ("DesNombre" gin_trgm_ops);

-- Nomenclador search
CREATE INDEX IF NOT EXISTS "idx_npractica_codigo_trgm"
  ON "NPractica" USING GIN (("NPrCodig"::text) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_npractica_descripcion_trgm"
  ON "NPractica" USING GIN ("NPrDescrip" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_nomprestacion_codigo_trgm"
  ON "NomPrestacion" USING GIN ("NprCodig" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_nomprestacion_descripcion_trgm"
  ON "NomPrestacion" USING GIN ("NprDescrip" gin_trgm_ops);
