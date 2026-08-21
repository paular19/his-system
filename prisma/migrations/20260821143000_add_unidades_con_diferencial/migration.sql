-- Cirugia multiple cargada como cantidad de una sola practica.
--
-- Dos resecciones del mismo codigo se cargan como UNA practica con cantidad 2,
-- no como dos practicas. Con ese formato "doble cirugia" no sirve: no hay una
-- practica secundaria que elegir en el panel de facturacion, asi que el
-- diferencial se aplicaba a las dos unidades o a ninguna.
--
-- Esta columna guarda cuantas unidades llevan diferencial; el resto se factura
-- al 100%. Null o 0 mantiene el comportamiento previo (el diferencial va a
-- todas las unidades), asi que no hace falta migrar los registros existentes.
ALTER TABLE "CirugiaDiferencial"
  ADD COLUMN "unidadesConDiferencial" INTEGER;
