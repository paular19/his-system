-- ============================================
-- MIGRATION: Limpiar códigos de práctica
-- ============================================
-- Problema: Los códigos se guardaban con padding (Char 8), 
-- lo que rompe la relación con NomencladorPractica.
-- Esta migration trim() todos los códigos existentes.

-- Actualizar tabla Practica: trim códigos existentes
UPDATE "Practica" 
SET "NPrCodig" = TRIM("NPrCodig");

-- Actualizar tabla OrdenPractica: trim códigos existentes
UPDATE "OrdenPrac"
SET "NPrCodig" = TRIM("NPrCodig");

-- Crear índice para mejora de performance en búsquedas
CREATE INDEX IF NOT EXISTS idx_practica_codigo_trim 
ON "Practica"("NConCodig", "NPrCodig");

CREATE INDEX IF NOT EXISTS idx_orden_practica_codigo_trim 
ON "OrdenPrac"("NConCodig", "NPrCodig");
