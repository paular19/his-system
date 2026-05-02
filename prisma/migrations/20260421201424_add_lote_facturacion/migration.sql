-- CreateTable
CREATE TABLE "LoteFacturacion" (
    "LotID" SERIAL NOT NULL,
    "LotNro" INTEGER NOT NULL,
    "LotFecha" TIMESTAMP(6) NOT NULL,
    "LotPeriodo" VARCHAR(7) NOT NULL,
    "OSID" INTEGER,
    "PosID" INTEGER,
    "TigCodig" CHAR(3),
    "LotTipo" VARCHAR(20) NOT NULL,
    "LotRangoDesde" INTEGER,
    "LotRangoHasta" INTEGER,
    "SedID" INTEGER,
    "LotDescrip" VARCHAR(500),
    "LotConcepto" VARCHAR(200),
    "LotImpTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "LotEstado" CHAR(3) NOT NULL,
    "LotFchEstado" TIMESTAMP(6) NOT NULL,
    "UsuCodig" CHAR(10) NOT NULL,

    CONSTRAINT "LoteFacturacion_pkey" PRIMARY KEY ("LotID")
);

-- CreateTable
CREATE TABLE "LoteFacturacionItem" (
    "LItID" SERIAL NOT NULL,
    "LotID" INTEGER NOT NULL,
    "IngID" INTEGER NOT NULL,
    "LItIncluido" BOOLEAN NOT NULL DEFAULT true,
    "LItImpTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "LoteFacturacionItem_pkey" PRIMARY KEY ("LItID")
);

-- CreateIndex
CREATE INDEX "LoteFacturacion_LotEstado_idx" ON "LoteFacturacion"("LotEstado");

-- CreateIndex
CREATE INDEX "LoteFacturacion_LotPeriodo_idx" ON "LoteFacturacion"("LotPeriodo");

-- CreateIndex
CREATE INDEX "LoteFacturacion_OSID_idx" ON "LoteFacturacion"("OSID");

-- CreateIndex
CREATE INDEX "LoteFacturacionItem_LotID_idx" ON "LoteFacturacionItem"("LotID");

-- CreateIndex
CREATE UNIQUE INDEX "LoteFacturacionItem_LotID_IngID_key" ON "LoteFacturacionItem"("LotID", "IngID");

-- AddForeignKey
ALTER TABLE "LoteFacturacion" ADD CONSTRAINT "LoteFacturacion_OSID_fkey" FOREIGN KEY ("OSID") REFERENCES "ObraSocial"("OSID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoteFacturacion" ADD CONSTRAINT "LoteFacturacion_OSID_PosID_fkey" FOREIGN KEY ("OSID", "PosID") REFERENCES "PlanOSoc"("OSID", "PosID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoteFacturacionItem" ADD CONSTRAINT "LoteFacturacionItem_LotID_fkey" FOREIGN KEY ("LotID") REFERENCES "LoteFacturacion"("LotID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoteFacturacionItem" ADD CONSTRAINT "LoteFacturacionItem_IngID_fkey" FOREIGN KEY ("IngID") REFERENCES "Ingreso"("IngID") ON DELETE RESTRICT ON UPDATE CASCADE;
