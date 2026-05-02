-- CreateTable
CREATE TABLE "EvolucionIngreso" (
    "EvoID" SERIAL NOT NULL,
    "IngID" INTEGER NOT NULL,
    "EvoFecha" TIMESTAMP(6) NOT NULL,
    "EvoTipo" VARCHAR(30) NOT NULL,
    "EvoDescrip" TEXT NOT NULL,
    "EvoTA" VARCHAR(20),
    "EvoFC" SMALLINT,
    "EvoFR" SMALLINT,
    "EvoTemp" DECIMAL(4,1),
    "EvoSpO2" SMALLINT,
    "PrfID" INTEGER,
    "UsuCodig" CHAR(10) NOT NULL,
    "EvoFchEstado" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "EvolucionIngreso_pkey" PRIMARY KEY ("EvoID")
);

-- CreateTable
CREATE TABLE "TransferenciaIngreso" (
    "TraID" SERIAL NOT NULL,
    "IngID" INTEGER NOT NULL,
    "CamIDOrigen" INTEGER,
    "CamIDDestino" INTEGER NOT NULL,
    "TraFecha" TIMESTAMP(6) NOT NULL,
    "TraMotivo" VARCHAR(500),
    "PrfID" INTEGER,
    "UsuCodig" CHAR(10) NOT NULL,
    "TraFchEstado" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "TransferenciaIngreso_pkey" PRIMARY KEY ("TraID")
);

-- CreateTable
CREATE TABLE "MedicacionIngreso" (
    "MedID" SERIAL NOT NULL,
    "IngID" INTEGER NOT NULL,
    "MedNombre" VARCHAR(200) NOT NULL,
    "MedDosis" VARCHAR(100),
    "MedVia" VARCHAR(50),
    "MedFrecuencia" VARCHAR(100),
    "MedFchIni" TIMESTAMP(6) NOT NULL,
    "MedFchFin" TIMESTAMP(6),
    "MedObs" VARCHAR(500),
    "MedOrdPue" INTEGER,
    "MedOrdNum" INTEGER,
    "PrfID" INTEGER,
    "MedEstado" CHAR(1) NOT NULL,
    "UsuCodig" CHAR(10) NOT NULL,
    "MedFchEstado" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "MedicacionIngreso_pkey" PRIMARY KEY ("MedID")
);

-- CreateIndex
CREATE INDEX "EvolucionIngreso_IngID_idx" ON "EvolucionIngreso"("IngID");

-- CreateIndex
CREATE INDEX "EvolucionIngreso_EvoFecha_idx" ON "EvolucionIngreso"("EvoFecha");

-- CreateIndex
CREATE INDEX "TransferenciaIngreso_IngID_idx" ON "TransferenciaIngreso"("IngID");

-- CreateIndex
CREATE INDEX "MedicacionIngreso_IngID_idx" ON "MedicacionIngreso"("IngID");

-- AddForeignKey
ALTER TABLE "EvolucionIngreso" ADD CONSTRAINT "EvolucionIngreso_IngID_fkey" FOREIGN KEY ("IngID") REFERENCES "Ingreso"("IngID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvolucionIngreso" ADD CONSTRAINT "EvolucionIngreso_PrfID_fkey" FOREIGN KEY ("PrfID") REFERENCES "Profesional"("PrfID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaIngreso" ADD CONSTRAINT "TransferenciaIngreso_IngID_fkey" FOREIGN KEY ("IngID") REFERENCES "Ingreso"("IngID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaIngreso" ADD CONSTRAINT "TransferenciaIngreso_CamIDOrigen_fkey" FOREIGN KEY ("CamIDOrigen") REFERENCES "Cama"("CamID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaIngreso" ADD CONSTRAINT "TransferenciaIngreso_CamIDDestino_fkey" FOREIGN KEY ("CamIDDestino") REFERENCES "Cama"("CamID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaIngreso" ADD CONSTRAINT "TransferenciaIngreso_PrfID_fkey" FOREIGN KEY ("PrfID") REFERENCES "Profesional"("PrfID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicacionIngreso" ADD CONSTRAINT "MedicacionIngreso_IngID_fkey" FOREIGN KEY ("IngID") REFERENCES "Ingreso"("IngID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicacionIngreso" ADD CONSTRAINT "MedicacionIngreso_PrfID_fkey" FOREIGN KEY ("PrfID") REFERENCES "Profesional"("PrfID") ON DELETE SET NULL ON UPDATE CASCADE;
