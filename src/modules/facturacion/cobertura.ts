export type ReglaFacturacionCodigo =
    | 'DEFAULT_100'
    | 'IPSS_SIN_COSEGURO_80'
    | 'IPSS_CON_COSEGURO_80'
    | 'OS_100'
    | 'OS_120'

export interface ReglaFacturacion {
    codigo: ReglaFacturacionCodigo
    descripcion: string
    porcentajeFacturacion: number
    porcentajeCargoPaciente: number
    porcentajeCargoCoseguro: number
}

function normalizarNombre(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function tieneAlgunToken(nombreNormalizado: string, tokens: string[]): boolean {
    return tokens.some((token) => nombreNormalizado.includes(token))
}

function esIPSSoIPS(nombreNormalizado: string): boolean {
    const tokens = nombreNormalizado.split(' ')
    return tokens.includes('IPSS') || tokens.includes('IPS')
}

function redondear2(valor: number): number {
    return Math.round((valor + Number.EPSILON) * 100) / 100
}

export function resolverReglaFacturacion(
    obraSocialNombre: string | null | undefined,
    tieneCoseguro: boolean
): ReglaFacturacion {
    const nombre = normalizarNombre(obraSocialNombre ?? '')

    if (esIPSSoIPS(nombre)) {
        if (tieneCoseguro) {
            return {
                codigo: 'IPSS_CON_COSEGURO_80',
                descripcion: 'IPSS con coseguro: 80% del nomenclador a cargo de la OS, 20% a cargo del coseguro.',
                porcentajeFacturacion: 80,
                porcentajeCargoPaciente: 0,
                porcentajeCargoCoseguro: 20,
            }
        }

        return {
            codigo: 'IPSS_SIN_COSEGURO_80',
            descripcion: 'IPSS sin coseguro: 80% del nomenclador (20% a cargo del paciente).',
            porcentajeFacturacion: 80,
            porcentajeCargoPaciente: 20,
            porcentajeCargoCoseguro: 0,
        }
    }

    if (
        tieneAlgunToken(nombre, ['OSPSA', 'RED ARGENTINA SALUD', 'OSPERHYRA'])
    ) {
        return {
            codigo: 'OS_120',
            descripcion: 'Facturación del 120% del nomenclador.',
            porcentajeFacturacion: 120,
            porcentajeCargoPaciente: 0,
            porcentajeCargoCoseguro: 0,
        }
    }

    if (
        tieneAlgunToken(nombre, ['ACIDSAL', 'OSECAC', 'OSUTHGRA', 'OSUNSA'])
    ) {
        return {
            codigo: 'OS_100',
            descripcion: 'Facturación del 100% del nomenclador.',
            porcentajeFacturacion: 100,
            porcentajeCargoPaciente: 0,
            porcentajeCargoCoseguro: 0,
        }
    }

    return {
        codigo: 'DEFAULT_100',
        descripcion: 'Facturación estándar: 100% del nomenclador.',
        porcentajeFacturacion: 100,
        porcentajeCargoPaciente: 0,
        porcentajeCargoCoseguro: 0,
    }
}

export function calcularImporteFacturable(
    valorNomencladorUnitario: number,
    cantidad: number,
    regla: ReglaFacturacion
): {
    precioUnitarioFacturable: number
    importeTotalFacturable: number
    porcentajeCargoPaciente: number
    importeCargoPaciente: number
    porcentajeCargoCoseguro: number
    importeCargoCoseguro: number
} {
    const unitario = Number(valorNomencladorUnitario || 0)
    const cant = Number(cantidad || 0)

    const precioUnitarioFacturable = redondear2(unitario * (regla.porcentajeFacturacion / 100))
    const importeTotalFacturable = redondear2(precioUnitarioFacturable * cant)

    const importeBase = redondear2(unitario * cant)
    const diferencia = redondear2(Math.max(0, importeBase - importeTotalFacturable))

    const importeCargoCoseguro = regla.porcentajeCargoCoseguro > 0
        ? redondear2(importeBase * (regla.porcentajeCargoCoseguro / 100))
        : 0
    const importeCargoPaciente = regla.porcentajeCargoPaciente > 0
        ? redondear2(diferencia - importeCargoCoseguro)
        : 0

    return {
        precioUnitarioFacturable,
        importeTotalFacturable,
        porcentajeCargoPaciente: regla.porcentajeCargoPaciente,
        importeCargoPaciente,
        porcentajeCargoCoseguro: regla.porcentajeCargoCoseguro,
        importeCargoCoseguro,
    }
}
