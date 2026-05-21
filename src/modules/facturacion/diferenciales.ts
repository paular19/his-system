export interface DiferencialesFacturacion {
    esFeriado: boolean
    esNocturna: boolean
    mismaViaPatologia: boolean
    diferentesViasPatologia: boolean
    diferentesViasDiferentesPatologia: boolean
}

export interface ValoresNomencladorFacturacion {
    valorEspecialista: number | null
    valorAyudante: number | null
    valorAnestesista: number | null
    valorGastos: number | null
}

export interface ValoresConDiferencial extends ValoresNomencladorFacturacion {
    recargoEspecialista: number
    recargoGastos: number
}

function redondear2(valor: number): number {
    return Math.round((valor + Number.EPSILON) * 100) / 100
}

export function tieneDiferencialesActivos(diferenciales?: DiferencialesFacturacion | null): boolean {
    if (!diferenciales) return false
    return Boolean(
        diferenciales.esFeriado ||
        diferenciales.esNocturna ||
        diferenciales.mismaViaPatologia ||
        diferenciales.diferentesViasPatologia ||
        diferenciales.diferentesViasDiferentesPatologia
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
            recargoEspecialista: 0,
            recargoGastos: 0,
        }
    }

    const recargoEspecialista =
        (diferenciales.diferentesViasPatologia || diferenciales.diferentesViasDiferentesPatologia ? 75 : 0) +
        (diferenciales.esFeriado ? 20 : 0) +
        (diferenciales.esNocturna ? 20 : 0)

    const recargoGastos =
        (diferenciales.mismaViaPatologia ? 30 : 0) +
        (diferenciales.diferentesViasPatologia || diferenciales.diferentesViasDiferentesPatologia ? 50 : 0) +
        (diferenciales.esFeriado ? 20 : 0) +
        (diferenciales.esNocturna ? 20 : 0)

    return {
        valorEspecialista: baseEspecialista !== null ? redondear2(baseEspecialista * (1 + recargoEspecialista / 100)) : null,
        valorAyudante: baseAyudante,
        valorAnestesista: baseAnestesista,
        valorGastos: baseGastos !== null ? redondear2(baseGastos * (1 + recargoGastos / 100)) : null,
        recargoEspecialista,
        recargoGastos,
    }
}

export function resumenDiferenciales(diferenciales?: DiferencialesFacturacion | null): string[] {
    if (!diferenciales) return []

    const etiquetas: string[] = []
    if (diferenciales.esFeriado) etiquetas.push('Feriado')
    if (diferenciales.esNocturna) etiquetas.push('Nocturna')
    if (diferenciales.mismaViaPatologia) etiquetas.push('Misma vía / distinta patología')
    if (diferenciales.diferentesViasPatologia) etiquetas.push('Distintas vías / misma patología')
    if (diferenciales.diferentesViasDiferentesPatologia) etiquetas.push('Distintas vías / distinta patología')
    return etiquetas
}