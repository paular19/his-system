-- DropForeignKey
ALTER TABLE "Practica" DROP CONSTRAINT "Practica_NConCodig_NPrCodig_fkey";

-- DropIndex
DROP INDEX "idx_orden_practica_codigo_trim";

-- DropIndex
DROP INDEX "idx_practica_codigo_trim";

-- AlterTable
ALTER TABLE "CirugiaPractica" ADD COLUMN     "numeroAutorizacion" VARCHAR(50);

-- AlterTable
ALTER TABLE "CirugiaProgramada" ADD COLUMN     "horaCirugia" VARCHAR(5);

-- AlterTable
ALTER TABLE "Practica" ALTER COLUMN "NPrCodig" SET DATA TYPE VARCHAR(8);

-- CreateTable
CREATE TABLE "CirugiaDiferencial" (
    "id" SERIAL NOT NULL,
    "cirugiaId" INTEGER NOT NULL,
    "tipo" VARCHAR(50) NOT NULL,
    "descripcion" VARCHAR(500) NOT NULL,
    "esFeriado" BOOLEAN NOT NULL DEFAULT false,
    "esNocturna" BOOLEAN NOT NULL DEFAULT false,
    "mismaViaPatologia" BOOLEAN NOT NULL DEFAULT false,
    "diferentesViasPatologia" BOOLEAN NOT NULL DEFAULT false,
    "diferentesViasDiferentesPatologia" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CirugiaDiferencial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CirugiaDiferencial_cirugiaId_idx" ON "CirugiaDiferencial"("cirugiaId");

-- AddForeignKey
ALTER TABLE "CirugiaDiferencial" ADD CONSTRAINT "CirugiaDiferencial_cirugiaId_fkey" FOREIGN KEY ("cirugiaId") REFERENCES "CirugiaProgramada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Practica" ADD CONSTRAINT "Practica_NConCodig_NPrCodig_fkey" FOREIGN KEY ("NConCodig", "NPrCodig") REFERENCES "NPractica"("NConCodig", "NPrCodig") ON DELETE RESTRICT ON UPDATE CASCADE;
