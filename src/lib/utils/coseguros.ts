export const COSEGUROS_IPSS = [
    'EMPRENDER',
    'TOTAL A',
    'TOTAL B',
    'UTM',
    'UPCN',
    'INTEGRAL',
    'ATE',
    'ATSA',
    'ADP',
    'PREVISER',
    'SOEM',
    'SOEME',
    'NOVAMED',
]

export function normalizarNombreObraSocial(nombre: string): string {
    return nombre
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

const COSEGUROS_IPSS_NORMALIZADOS = new Set(
    COSEGUROS_IPSS.map((nombre) => normalizarNombreObraSocial(nombre))
)

export function esCoseguroIPSS(nombre: string): boolean {
    return COSEGUROS_IPSS_NORMALIZADOS.has(normalizarNombreObraSocial(nombre))
}

export function requiereCoseguroParaObraSocial(
    obraSocial?: { requiereCoseguro?: string | boolean | null } | null
): boolean {
    if (!obraSocial) return false
    if (typeof obraSocial.requiereCoseguro === 'boolean') {
        return obraSocial.requiereCoseguro
    }

    const valor = String(obraSocial.requiereCoseguro ?? '').trim().toUpperCase()
    return ['S', 'SI', '1', 'TRUE', 'T'].includes(valor)
}

export function limpiarCoseguroNoRequerido<T extends number | string | null | undefined>(
    obraSocial?: { requiereCoseguro?: string | boolean | null } | null,
    coseguroId?: T
): T | null {
    return requiereCoseguroParaObraSocial(obraSocial) ? (coseguroId ?? null) : null
}

export function filtrarObrasSocialesPrincipales<T extends { nombre: string }>(
    obrasSociales: T[]
): T[] {
    return obrasSociales.filter((os) => !esCoseguroIPSS(os.nombre))
}
