CREATE TABLE "IngresoElectrocardiograma" (
    "EcgID" SERIAL NOT NULL,
    "IngID" INTEGER NOT NULL,
    "EcgFecha" DATE NOT NULL,
    "EcgHora" VARCHAR(5),
    "PueNum" INTEGER,
    "OrdNum" INTEGER,
    "OprItem" INTEGER,
    "EcgFchRegistro" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UsuCodig" VARCHAR(10) NOT NULL,

    CONSTRAINT "IngresoElectrocardiograma_pkey" PRIMARY KEY ("EcgID")
);

CREATE INDEX "IngresoElectrocardiograma_IngID_EcgFecha_idx"
ON "IngresoElectrocardiograma"("IngID", "EcgFecha");

CREATE INDEX "IngresoElectrocardiograma_PueNum_OrdNum_OprItem_idx"
ON "IngresoElectrocardiograma"("PueNum", "OrdNum", "OprItem");

ALTER TABLE "IngresoElectrocardiograma"
ADD CONSTRAINT "IngresoElectrocardiograma_IngID_fkey"
FOREIGN KEY ("IngID") REFERENCES "Ingreso"("IngID") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IngresoElectrocardiograma"
ADD CONSTRAINT "IngresoElectrocardiograma_PueNum_OrdNum_OprItem_fkey"
FOREIGN KEY ("PueNum", "OrdNum", "OprItem") REFERENCES "OrdenPrac"("PueNum", "OrdNum", "OprItem")
ON DELETE SET NULL ON UPDATE CASCADE;
