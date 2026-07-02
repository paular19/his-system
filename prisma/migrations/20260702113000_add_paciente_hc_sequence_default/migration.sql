-- Genera numero de historia clinica automatico para nuevos pacientes
-- y completa los pacientes ya existentes sin HC.

CREATE SEQUENCE IF NOT EXISTS "Paciente_HC_seq";

WITH max_hc AS (
  SELECT MAX("PacHC") AS value FROM "Paciente"
)
SELECT setval(
  '"Paciente_HC_seq"',
  GREATEST(COALESCE((SELECT value FROM max_hc), 1), 1),
  (SELECT value IS NOT NULL FROM max_hc)
);

ALTER TABLE "Paciente"
  ALTER COLUMN "PacHC" SET DEFAULT nextval('"Paciente_HC_seq"'::regclass);

UPDATE "Paciente"
SET "PacHC" = nextval('"Paciente_HC_seq"'::regclass)
WHERE "PacHC" IS NULL;
