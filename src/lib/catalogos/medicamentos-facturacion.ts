/**
 * SEMILLA del catalogo de medicacion que factura anestesia.
 *
 * Ya NO es la lista que ve el usuario: el combo de facturacion lee la tabla
 * `CatalogoMedicamentoFacturacion` via `/api/catalogos/medicamentos-facturacion`,
 * y desde el panel se dan de alta medicamentos nuevos sin tocar el codigo.
 * Este archivo quedo solo como la carga inicial de esa tabla
 * (`npm run db:seed-medicamentos-facturacion`); editarlo no cambia nada en
 * produccion salvo que se vuelva a correr el seed, que no pisa lo existente.
 *
 * Es una lista aparte del catalogo de insumos de UTI
 * (`@/lib/catalogos/insumos-uti`): ese sale de los Excel de existencias, tiene
 * miles de renglones y no trae precio.
 *
 * El precio es por unidad (ampolla): el importe de la prestacion es
 * precio x cantidad de ampollas.
 */
export interface MedicamentoFacturacion {
    id: number
    nombre: string
    /**
     * Precio de una ampolla, en pesos. `null` = todavia no se confirmo con la
     * clinica: el medicamento aparece en la lista pero el importe se carga a
     * mano y el formulario no lo autocompleta.
     */
    precio: number | null
}

// Los nombres van tal como los usa la clinica y estan confirmados: "Porpofol" y
// "Atracuronio" no son typos, no "corregirlos".
export const MEDICAMENTOS_FACTURACION: MedicamentoFacturacion[] = [
    { id: 1, nombre: 'Midazolan 15mg (ampollas)', precio: 425.88 },
    { id: 2, nombre: 'Remifentanilo 5mg. (ampollas)', precio: 803.96 },
    { id: 3, nombre: 'Porpofol 200mg. (ampollas)', precio: 710.0 },
    { id: 4, nombre: 'Fentanilo 0,25 mg. (ampollas)', precio: 320.0 },
    { id: 5, nombre: 'Noradrenalina 4mg. (ampollas)', precio: 777.84 },
    { id: 6, nombre: 'Atracuronio 50mg. (ampollas)', precio: 592.0 },
    { id: 7, nombre: 'Pancuronio 4mg. (ampollas)', precio: 110.0 },
    // Pedidos el 2026-09-02, sin precio de lista confirmado todavia.
    { id: 8, nombre: 'Dexametasona 8 MG ampolla', precio: null },
    { id: 9, nombre: 'Dipirona 1 g ampolla', precio: null },
    { id: 10, nombre: 'Diclofenac ampolla', precio: null },
    { id: 11, nombre: 'Diclofenac 75mg', precio: null },
]
