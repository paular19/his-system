/**
 * Armado del resumen impreso de un lote: un bloque por paciente, no por ingreso.
 *
 * El lote guarda un item por ingreso (`LoteFacturacionItem` es unico por
 * `[loteId, ingresoId]`), asi que quien tuvo dos ingresos en el mes — dos guardias, una
 * guardia y una ambulatoria — salia partido en dos bloques del resumen, cada uno con su
 * propio total, como si fueran dos personas distintas.
 *
 * El tildado, los importes y las cards de pantalla siguen siendo por ingreso: aca solo se
 * juntan los bloques para imprimir y exportar.
 */

import type { SubitemPromedi } from './promedi-rules'

export interface LineaResumenLote {
    subitem: SubitemPromedi
    ordenNumero: number
    fecha: Date | string
    numeroAutorizacion: string | null
    profesional: string | null
    codigoPractica: string
    // Los lotes de medicamentos no tienen codigo de nomenclador: la linea se identifica
    // por el nombre del medicamento.
    descripcion?: string | null
    cantidad: number
    importeEspecialista: number | null
    importeAyudante: number | null
    importeAnestesista: number | null
    importeGastos: number | null
    importeTotal: number
}

/** Lo que aporta cada ingreso del lote antes de agrupar. */
export interface DetalleIngresoResumen {
    ingresoId: number
    pacienteId: number | null
    numeroIngreso: number
    paciente: string
    numeroAfiliado: string | null
    total: number
    lineas: LineaResumenLote[]
}

/** Un bloque del resumen: la persona, con las practicas de todos sus ingresos. */
export interface BloqueResumenPaciente {
    clave: string
    ingresoIds: number[]
    numerosIngreso: number[]
    paciente: string
    numeroAfiliado: string | null
    total: number
    lineas: LineaResumenLote[]
}

function fechaAOrden(value: Date | string): number {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? Number.POSITIVE_INFINITY : date.getTime()
}

/**
 * El resumen sale por fecha de realizacion: las ordenes de un mismo paciente pueden
 * intercalarse (una emitida antes puede tener practicas posteriores), y ahora ademas se
 * mezclan las de sus distintos ingresos.
 */
export function compararLineasResumen(a: LineaResumenLote, b: LineaResumenLote): number {
    const porFecha = fechaAOrden(a.fecha) - fechaAOrden(b.fecha)
    if (porFecha !== 0) return porFecha
    const porOrden = a.ordenNumero - b.ordenNumero
    if (porOrden !== 0) return porOrden
    return a.codigoPractica.localeCompare(b.codigoPractica)
}

/**
 * Junta en un solo bloque los ingresos de un mismo paciente, respetando el orden de
 * entrada (la pantalla los manda alfabeticos).
 *
 * Sin `pacienteId` no hay con que agrupar — ingresos cargados sin paciente —, asi que
 * cada uno de esos va solo, como antes.
 */
export function agruparResumenPorPaciente(
    items: DetalleIngresoResumen[]
): BloqueResumenPaciente[] {
    const grupos = new Map<string, BloqueResumenPaciente>()

    for (const item of items) {
        const clave = item.pacienteId !== null ? `pac:${item.pacienteId}` : `ing:${item.ingresoId}`
        const existente = grupos.get(clave)

        if (!existente) {
            grupos.set(clave, {
                clave,
                ingresoIds: [item.ingresoId],
                numerosIngreso: [item.numeroIngreso],
                paciente: item.paciente,
                numeroAfiliado: item.numeroAfiliado,
                total: item.total,
                lineas: [...item.lineas],
            })
            continue
        }

        existente.ingresoIds.push(item.ingresoId)
        existente.numerosIngreso.push(item.numeroIngreso)
        // El afiliado es de la persona, pero puede faltar en uno de los ingresos.
        existente.numeroAfiliado = existente.numeroAfiliado ?? item.numeroAfiliado
        existente.total += item.total
        existente.lineas.push(...item.lineas)
    }

    for (const grupo of grupos.values()) {
        grupo.numerosIngreso.sort((a, b) => a - b)
        grupo.lineas.sort(compararLineasResumen)
    }

    return Array.from(grupos.values())
}
