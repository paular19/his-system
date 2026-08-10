INSERT INTO "SubtipoAdmision" (
  "SAdCodig",
  "SAdDescrip",
  "SAdEstado",
  "UsuCodig",
  "SAdFchEstado"
)
VALUES (
  'QAM',
  'Práctica ambulatoria en quirófano',
  'A',
  'SYSTEM',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("SAdCodig") DO UPDATE
SET
  "SAdDescrip" = EXCLUDED."SAdDescrip",
  "SAdEstado" = 'A',
  "UsuCodig" = EXCLUDED."UsuCodig",
  "SAdFchEstado" = CURRENT_TIMESTAMP;
