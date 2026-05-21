-- AlterTable
ALTER TABLE "LoteFacturacion" ADD COLUMN     "LotOrigen" VARCHAR(20);

-- AlterTable
ALTER TABLE "NPractica" ADD COLUMN     "NPrValAne" DECIMAL(18,2),
ADD COLUMN     "NPrValAyu" DECIMAL(18,2),
ADD COLUMN     "NPrValEsp" DECIMAL(18,2),
ADD COLUMN     "NPrValGto" DECIMAL(18,2);

-- CreateTable
CREATE TABLE "LoteIPSTxtItem" (
    "LipID" SERIAL NOT NULL,
    "LotID" INTEGER NOT NULL,
    "LipAfilDoc" VARCHAR(20) NOT NULL,
    "LipAfilNom" VARCHAR(200) NOT NULL,
    "LipNroOrden" VARCHAR(20) NOT NULL,
    "LipFchRealiz" TIMESTAMP(6),
    "LipServCod" VARCHAR(20) NOT NULL,
    "LipServNom" VARCHAR(500) NOT NULL,
    "LipCantidad" INTEGER NOT NULL,
    "LipImpEsp" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "LipImpAyu" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "LipImpAne" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "LipImpGto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "LipImpTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "LipImpPromedi" DECIMAL(18,2),

    CONSTRAINT "LoteIPSTxtItem_pkey" PRIMARY KEY ("LipID")
);

-- CreateIndex
CREATE INDEX "LoteIPSTxtItem_LotID_idx" ON "LoteIPSTxtItem"("LotID");

-- AddForeignKey
ALTER TABLE "LoteIPSTxtItem" ADD CONSTRAINT "LoteIPSTxtItem_LotID_fkey" FOREIGN KEY ("LotID") REFERENCES "LoteFacturacion"("LotID") ON DELETE CASCADE ON UPDATE CASCADE;
