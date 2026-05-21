-- Catalogo de medicamentos UTI
CREATE TABLE "CatalogoMedicamentoUti" (
    "CMUId" SERIAL NOT NULL,
    "CMUNombre" VARCHAR(200) NOT NULL,
    "CMUEstado" CHAR(1) NOT NULL DEFAULT 'A',
    "CMUFchEstado" TIMESTAMP(6) NOT NULL,
    "UsuCodig" CHAR(10) NOT NULL,

    CONSTRAINT "CatalogoMedicamentoUti_pkey" PRIMARY KEY ("CMUId")
);

CREATE UNIQUE INDEX "CatalogoMedicamentoUti_CMUNombre_key" ON "CatalogoMedicamentoUti"("CMUNombre");
CREATE INDEX "CatalogoMedicamentoUti_CMUEstado_idx" ON "CatalogoMedicamentoUti"("CMUEstado");

-- Catalogo de descartables UTI
CREATE TABLE "CatalogoDescartableUti" (
    "CDUId" SERIAL NOT NULL,
    "CDUNombre" VARCHAR(200) NOT NULL,
    "CDUEstado" CHAR(1) NOT NULL DEFAULT 'A',
    "CDUFchEstado" TIMESTAMP(6) NOT NULL,
    "UsuCodig" CHAR(10) NOT NULL,

    CONSTRAINT "CatalogoDescartableUti_pkey" PRIMARY KEY ("CDUId")
);

CREATE UNIQUE INDEX "CatalogoDescartableUti_CDUNombre_key" ON "CatalogoDescartableUti"("CDUNombre");
CREATE INDEX "CatalogoDescartableUti_CDUEstado_idx" ON "CatalogoDescartableUti"("CDUEstado");

-- Descartables por ingreso
CREATE TABLE "DescartableIngreso" (
    "DesID" SERIAL NOT NULL,
    "IngID" INTEGER NOT NULL,
    "DesNombre" VARCHAR(200) NOT NULL,
    "DesCantidad" INTEGER NOT NULL DEFAULT 1,
    "DesObs" VARCHAR(500),
    "DesFchIni" TIMESTAMP(6) NOT NULL,
    "DesFchFin" TIMESTAMP(6),
    "PrfID" INTEGER,
    "DesEstado" CHAR(1) NOT NULL,
    "UsuCodig" CHAR(10) NOT NULL,
    "DesFchEstado" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "DescartableIngreso_pkey" PRIMARY KEY ("DesID")
);

CREATE INDEX "DescartableIngreso_IngID_idx" ON "DescartableIngreso"("IngID");

ALTER TABLE "DescartableIngreso"
ADD CONSTRAINT "DescartableIngreso_IngID_fkey"
FOREIGN KEY ("IngID") REFERENCES "Ingreso"("IngID")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DescartableIngreso"
ADD CONSTRAINT "DescartableIngreso_PrfID_fkey"
FOREIGN KEY ("PrfID") REFERENCES "Profesional"("PrfID")
ON DELETE SET NULL ON UPDATE CASCADE;
