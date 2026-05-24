-- CreateTable
CREATE TABLE "GuiaFeedback" (
    "id" SERIAL NOT NULL,
    "modulo" VARCHAR(30) NOT NULL,
    "tipo" VARCHAR(20) NOT NULL,
    "prioridad" VARCHAR(10) NOT NULL,
    "titulo" VARCHAR(140) NOT NULL,
    "comentario" TEXT NOT NULL,
    "pantalla" VARCHAR(120),
    "pasos" TEXT,
    "resultadoEsperado" TEXT,
    "usuarioClerkId" VARCHAR(50) NOT NULL,
    "usuarioCodigo" CHAR(10) NOT NULL,
    "usuarioNombre" VARCHAR(120) NOT NULL,
    "usuarioEmail" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "GuiaFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuiaFeedback_modulo_idx" ON "GuiaFeedback"("modulo");

-- CreateIndex
CREATE INDEX "GuiaFeedback_createdAt_idx" ON "GuiaFeedback"("createdAt");
