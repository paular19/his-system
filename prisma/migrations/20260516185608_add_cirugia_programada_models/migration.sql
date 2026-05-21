

-- CreateTable
CREATE TABLE "CirugiaProgramada" (
    "id" SERIAL NOT NULL,
    "pacienteId" INTEGER NOT NULL,
    "numeroAutorizacion" VARCHAR(50),
    "fechaCirugia" TIMESTAMP(3) NOT NULL,
    "camaId" INTEGER,
    "observaciones" VARCHAR(500),
    "internacionId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CirugiaProgramada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CirugiaPractica" (
    "id" SERIAL NOT NULL,
    "cirugiaId" INTEGER NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "descripcion" VARCHAR(500) NOT NULL,
    "cantidad" INTEGER NOT NULL,

    CONSTRAINT "CirugiaPractica_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CirugiaProgramada_pacienteId_idx" ON "CirugiaProgramada"("pacienteId");

-- CreateIndex
CREATE INDEX "CirugiaProgramada_camaId_idx" ON "CirugiaProgramada"("camaId");

-- CreateIndex
CREATE INDEX "CirugiaProgramada_internacionId_idx" ON "CirugiaProgramada"("internacionId");

-- CreateIndex
CREATE INDEX "CirugiaPractica_cirugiaId_idx" ON "CirugiaPractica"("cirugiaId");

-- AddForeignKey
ALTER TABLE "CirugiaProgramada" ADD CONSTRAINT "CirugiaProgramada_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Paciente"("PacID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CirugiaProgramada" ADD CONSTRAINT "CirugiaProgramada_camaId_fkey" FOREIGN KEY ("camaId") REFERENCES "Cama"("CamID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CirugiaProgramada" ADD CONSTRAINT "CirugiaProgramada_internacionId_fkey" FOREIGN KEY ("internacionId") REFERENCES "Ingreso"("IngID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CirugiaPractica" ADD CONSTRAINT "CirugiaPractica_cirugiaId_fkey" FOREIGN KEY ("cirugiaId") REFERENCES "CirugiaProgramada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey

