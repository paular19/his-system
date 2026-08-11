CREATE TABLE "LoteFacturacionOrdenExcluida" (
    "LOeID" SERIAL NOT NULL,
    "LotID" INTEGER NOT NULL,
    "PueNum" INTEGER NOT NULL,
    "OrdNum" INTEGER NOT NULL,

    CONSTRAINT "LoteFacturacionOrdenExcluida_pkey" PRIMARY KEY ("LOeID")
);

CREATE UNIQUE INDEX "LoteFacturacionOrdenExcluida_LotID_PueNum_OrdNum_key"
ON "LoteFacturacionOrdenExcluida"("LotID", "PueNum", "OrdNum");

CREATE INDEX "LoteFacturacionOrdenExcluida_LotID_idx"
ON "LoteFacturacionOrdenExcluida"("LotID");

ALTER TABLE "LoteFacturacionOrdenExcluida"
ADD CONSTRAINT "LoteFacturacionOrdenExcluida_LotID_fkey"
FOREIGN KEY ("LotID") REFERENCES "LoteFacturacion"("LotID")
ON DELETE CASCADE ON UPDATE CASCADE;
