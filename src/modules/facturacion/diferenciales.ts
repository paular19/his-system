export interface DiferencialesFacturacion {
    esFeriado: boolean
    esNocturna: boolean
    mismaViaPatologia: boolean
    mismaViaMismaPatologia?: boolean
    diferentesViasPatologia: boolean
    diferentesViasDiferentesPatologia: boolean
    dobleCirugia?: boolean
}

/**
 * El recargo depende SOLO de la via, no de la patologia:
 *   misma via    -> 30% gastos, 0% especialista
 *   distinta via -> 50% gastos, 75% especialista
 */
export function esMismaVia(diferenciales?: DiferencialesFacturacion | null): boolean {
    if (!diferenciales) return false
    return Boolean(diferenciales.mismaViaPatologia || diferenciales.mismaViaMismaPatologia)
}

export function esDistintaVia(diferenciales?: DiferencialesFacturacion | null): boolean {
    if (!diferenciales) return false
    return Boolean(
        diferenciales.diferentesViasPatologia || diferenciales.diferentesViasDiferentesPatologia
    )
}

export interface ValoresNomencladorFacturacion {
    valorEspecialista: number | null
    valorAyudante: number | null
    valorAnestesista: number | null
    valorGastos: number | null
}

/**
 * porcentajeEspecialista / porcentajeGastos son el porcentaje FINAL que se paga
 * sobre el valor de nomenclador, no un recargo que se suma. 100 = sin cambios,
 * 30 = se paga el 30%, 120 = se paga un 20% de mas.
 */
export interface ValoresConDiferencial extends ValoresNomencladorFacturacion {
    porcentajeEspecialista: number
    porcentajeGastos: number
}

function redondear2(valor: number): number {
    return Math.round((valor + Number.EPSILON) * 100) / 100
}

export function tieneDiferencialesActivos(diferenciales?: DiferencialesFacturacion | null): boolean {
    if (!diferenciales) return false
    return Boolean(
        diferenciales.esFeriado ||
        diferenciales.esNocturna ||
        esMismaVia(diferenciales) ||
        esDistintaVia(diferenciales) ||
        diferenciales.dobleCirugia
    )
}

export function aplicarDiferencialesAValores(
    valores: ValoresNomencladorFacturacion,
    diferenciales?: DiferencialesFacturacion | null
): ValoresConDiferencial {
    const baseEspecialista = valores.valorEspecialista ?? null
    const baseAyudante = valores.valorAyudante ?? null
    const baseAnestesista = valores.valorAnestesista ?? null
    const baseGastos = valores.valorGastos ?? null

    if (!diferenciales) {
        return {
            valorEspecialista: baseEspecialista,
            valorAyudante: baseAyudante,
            valorAnestesista: baseAnestesista,
            valorGastos: baseGastos,
            porcentajeEspecialista: 100,
            porcentajeGastos: 100,
        }
    }

    // Dos efectos que van en direcciones opuestas y NO se pueden sumar:
    //
    // 1) Cirugia multiple: reduce lo que se paga de la practica secundaria.
    //      misma via    -> 30% de gastos,  0% de especialista
    //      distinta via -> 50% de gastos, 75% de especialista
    //
    // 2) Feriado / nocturna: recargo sobre el total, 20% cada uno.
    //
    // Antes se sumaban en un solo porcentaje y despues se multiplicaba, asi que
    // un feriado sin cirugia multiple pagaba el 20% en vez del 120%.
    const factorMultipleGastos = esMismaVia(diferenciales)
        ? 0.3
        : esDistintaVia(diferenciales)
            ? 0.5
            : 1
    const factorMultipleEspecialista = esMismaVia(diferenciales)
        ? 0
        : esDistintaVia(diferenciales)
            ? 0.75
            : 1

    const factorHorario =
        1 +
        (diferenciales.esFeriado ? 0.2 : 0) +
        (diferenciales.esNocturna ? 0.2 : 0)

    const hayReduccionPorMultiple = esMismaVia(diferenciales) || esDistintaVia(diferenciales)

    const porcentajeGastos = redondear2(factorMultipleGastos * factorHorario * 100)
    const porcentajeEspecialista = redondear2(factorMultipleEspecialista * factorHorario * 100)

    const aplicar = (base: number | null, factor: number): number | null => {
        if (base === null) return null
        if (factor <= 0) return null
        return redondear2(base * factor)
    }

    return {
        valorEspecialista: aplicar(baseEspecialista, factorMultipleEspecialista * factorHorario),
        // La reduccion por cirugia multiple solo alcanza a gastos y especialista.
        // Si no hay cirugia multiple, ayudante y anestesista igual arrastran el
        // recargo horario; antes se anulaban y la practica los perdia.
        valorAyudante: hayReduccionPorMultiple ? null : aplicar(baseAyudante, factorHorario),
        valorAnestesista: hayReduccionPorMultiple ? null : aplicar(baseAnestesista, factorHorario),
        valorGastos: aplicar(baseGastos, factorMultipleGastos * factorHorario),
        porcentajeEspecialista,
        porcentajeGastos,
    }
}

export function resumenDiferenciales(diferenciales?: DiferencialesFacturacion | null): string[] {
    if (!diferenciales) return []

    const etiquetas: string[] = []
    if (diferenciales.esFeriado) etiquetas.push('Feriado')
    if (diferenciales.esNocturna) etiquetas.push('Nocturna')
    if (diferenciales.mismaViaPatologia) etiquetas.push('Misma vía / distinta patología')
    if (diferenciales.mismaViaMismaPatologia) etiquetas.push('Misma vía / misma patología')
    if (diferenciales.diferentesViasPatologia) etiquetas.push('Distinta vía / misma patología')
    if (diferenciales.diferentesViasDiferentesPatologia) etiquetas.push('Distinta vía / distinta patología')
    if (diferenciales.dobleCirugia) etiquetas.push('Doble cirugía')
    return etiquetas
}