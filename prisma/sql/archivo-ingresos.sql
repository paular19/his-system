-- DDL del archivo historico: maestros de obra social/plan e ingresos del sistema anterior.
--
-- Se aplica A MANO, nunca con `prisma db push`. La base tiene objetos que no
-- estan declarados en schema.prisma (la secuencia Paciente_HC_seq y 11 indices
-- creados a mano), y un push los interpreta como drift y los borra: el diff
-- medido al crear estas tablas traia 12 DROP. Ver CLAUDE.md, trampa 5.
--
-- Correr con: npx tsx prisma/aplicar-ddl-archivo.ts

CREATE TABLE IF NOT EXISTS "ArchivoObraSocial" (
    "obraSocialIdViejo" INTEGER NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "sigla" VARCHAR(50),
    "estado" CHAR(1),
    "importadoAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArchivoObraSocial_pkey" PRIMARY KEY ("obraSocialIdViejo")
);

CREATE TABLE IF NOT EXISTS "ArchivoPlanObraSocial" (
    "obraSocialIdViejo" INTEGER NOT NULL,
    "planIdViejo" INTEGER NOT NULL,
    "descripcion" VARCHAR(200),
    "estado" CHAR(1),
    "importadoAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArchivoPlanObraSocial_pkey" PRIMARY KEY ("obraSocialIdViejo","planIdViejo")
);

CREATE TABLE IF NOT EXISTS "ArchivoIngreso" (
    "ingresoIdViejo" INTEGER NOT NULL,
    "pacienteIdViejo" INTEGER NOT NULL,
    "numeroIngreso" INTEGER,
    "tipoIngresoCodigo" VARCHAR(3),
    "tipoIngresoDescripcion" VARCHAR(100),
    "esInternacion" BOOLEAN NOT NULL DEFAULT false,
    "fechaIngreso" TIMESTAMP(6),
    "fechaEgreso" TIMESTAMP(6),
    "fechaEgresoPrevista" TIMESTAMP(6),
    "fechaObito" TIMESTAMP(6),
    "tipoInternacionCodigo" VARCHAR(3),
    "tipoInternacionDescripcion" VARCHAR(100),
    "motivoEgresoCodigo" VARCHAR(3),
    "motivoEgresoDescripcion" VARCHAR(100),
    "obraSocialIdViejo" INTEGER,
    "obraSocialNombre" VARCHAR(200),
    "planIdViejo" INTEGER,
    "planDescripcion" VARCHAR(200),
    "numeroAfiliado" VARCHAR(50),
    "patologiaId" INTEGER,
    "patologiaDescripcion" VARCHAR(500),
    "descripcionPatologia" VARCHAR(500),
    "descripcionPatologiaDefinitiva" VARCHAR(500),
    "profesionalTratanteId" INTEGER,
    "profesionalTratanteNombre" VARCHAR(200),
    "profesionalGuardiaId" INTEGER,
    "profesionalGuardiaNombre" VARCHAR(200),
    "edad" INTEGER,
    "estado" CHAR(1),
    "observaciones" TEXT,
    "usuario" VARCHAR(10),
    "importadoAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArchivoIngreso_pkey" PRIMARY KEY ("ingresoIdViejo")
);

CREATE INDEX IF NOT EXISTS "ArchivoObraSocial_nombre_idx" ON "ArchivoObraSocial"("nombre");
CREATE INDEX IF NOT EXISTS "ArchivoIngreso_pacienteIdViejo_idx" ON "ArchivoIngreso"("pacienteIdViejo");
CREATE INDEX IF NOT EXISTS "ArchivoIngreso_pacienteIdViejo_esInternacion_idx" ON "ArchivoIngreso"("pacienteIdViejo", "esInternacion");
CREATE INDEX IF NOT EXISTS "ArchivoIngreso_fechaIngreso_idx" ON "ArchivoIngreso"("fechaIngreso");
