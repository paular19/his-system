/**
 * Medicacion que factura anestesia, con precio por ampolla.
 *
 * Es una lista aparte del catalogo de insumos de UTI
 * (`@/lib/catalogos/insumos-uti`): ese sale de los Excel de existencias, tiene
 * miles de renglones y no trae precio. Este listado es corto, cerrado y con
 * precio unitario, y es el que usa el alta de medicacion en facturacion.
 *
 * El precio es por unidad (ampolla): el importe de la prestacion es
 * precio x cantidad de ampollas.
 */
export interface MedicamentoFacturacion {
    id: number
    nombre: string
    /** Precio de una ampolla, en pesos. */
    precio: number
}

export const MEDICAMENTOS_FACTURACION: MedicamentoFacturacion[] = [
    { id: 1, nombre: 'Midazolan 15mg (ampollas)', precio: 425.88 },
    { id: 2, nombre: 'Remifentanilo 5mg. (ampollas)', precio: 803.96 },
    { id: 3, nombre: 'Porpofol 200mg. (ampollas)', precio: 710.0 },
    { id: 4, nombre: 'Fentanilo 0,25 mg. (ampollas)', precio: 320.0 },
    { id: 5, nombre: 'Noradrenalina 4mg. (ampollas)', precio: 777.84 },
    { id: 6, nombre: 'Atracuronio 50mg. (ampollas)', precio: 592.0 },
    { id: 7, nombre: 'Pancuronio 4mg. (ampollas)', precio: 110.0 },
]

export function buscarMedicamentoFacturacion(
    nombre: string
): MedicamentoFacturacion | undefined {
    const clave = nombre.trim().toLowerCase()
    return MEDICAMENTOS_FACTURACION.find((m) => m.nombre.toLowerCase() === clave)
}
