-- Genera numero de historia clinica automatico para nuevos pacientes
-- y completa los pacientes ya existentes sin HC.

CREATE SEQUENCE IF NOT EXISTS "Paciente_HC_seq";

SELECT setval(
  '"Paciente_HC_seq"',
  COALESCE((SELECT MAX("PacHC") FROM "Paciente"), 0),
  true
);

ALTER TABLE "Paciente"
  ALTER COLUMN "PacHC" SET DEFAULT nextval('"Paciente_HC_seq"'::regclass);

UPDATE "Paciente"
SET "PacHC" = nextval('"Paciente_HC_seq"'::regclass)
WHERE "PacHC" IS NULL;
