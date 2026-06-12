-- AlterTable
ALTER TABLE "GuiaFeedback"
ADD COLUMN "respuesta" TEXT,
ADD COLUMN "respuestaAt" TIMESTAMP(6),
ADD COLUMN "respuestaUsuarioCodigo" CHAR(10),
ADD COLUMN "respuestaUsuarioNombre" VARCHAR(120),
ADD COLUMN "respuestaUsuarioEmail" VARCHAR(120);
