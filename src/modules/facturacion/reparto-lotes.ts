import type { CategoriaPractica } from './categorias-practica'

/**
 * Reparto de ordenes entre lotes.
 *
 * Un mismo paciente puede estar en varios lotes a la vez porque cada lote factura
 * categorias distintas. La unidad atomica del reparto es la **orden**: nunca se parte
 * por practica, va entera a un solo lote.
 */

export type OrdenParaReparto = {
    puestoNumero: number
    ordenNumero: number
    /** Categorias de las practicas facturadas de la orden. Vacio = ninguna categoria conocida. */
    categorias: CategoriaPractica[]
    /** Suma de los importes de sus practicas facturadas. */
    importe: number
}

export type ClaveOrden = { puestoNumero: number; ordenNumero: number }

export type RepartoDeIngreso = {
    /** El ingreso entra al lote solo si le quedo al menos una orden propia. */
    entra: boolean
    importe: number
    /** Ordenes que hay que excluir del lote: de otra categoria o ya tomadas. */
    ordenesExcluidas: ClaveOrden[]
}

export function claveOrdenLote(puestoNumero: number, ordenNumero: number): string {
    return `${puestoNumero}:${ordenNumero}`
}

/**
 * Decide que ordenes de un ingreso factura el lote que se esta creando.
 *
 * @param categoriasSeleccionadas vacio = todas las categorias
 * @param ordenesTomadas claves de claveOrdenLote() que ya factura otro lote PEN/CON
 */
export function repartirOrdenesDeIngreso(
    ordenes: OrdenParaReparto[],
    categoriasSeleccionadas: Set<CategoriaPractica>,
    ordenesTomadas: Set<string>
): RepartoDeIngreso {
    const ordenesExcluidas: ClaveOrden[] = []
    let importe = 0
    let entra = false

    for (const orden of ordenes) {
        const entraPorCategoria =
            categoriasSeleccionadas.size === 0 ||
            orden.categorias.some((c) => categoriasSeleccionadas.has(c))
        const libre = !ordenesTomadas.has(claveOrdenLote(orden.puestoNumero, orden.ordenNumero))

        if (entraPorCategoria && libre) {
            entra = true
            importe += orden.importe
        } else {
            ordenesExcluidas.push({
                puestoNumero: orden.puestoNumero,
                ordenNumero: orden.ordenNumero,
            })
        }
    }

    // Si no le quedo ninguna orden, el ingreso no entra y sus exclusiones no valen nada.
    if (!entra) return { entra: false, importe: 0, ordenesExcluidas: [] }

    return { entra, importe, ordenesExcluidas }
}
