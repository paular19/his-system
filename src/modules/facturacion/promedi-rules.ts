export const CODIGOS_PROMEDI_BASE = [430101, 431001, 400101, 431002, 431103, 430130] as const
export const CODIGOS_PROMEDI_BASE_SET = new Set<number>(CODIGOS_PROMEDI_BASE)

export const CODIGOS_PROMEDI_RANGOS = [
    { desde: 10101, hasta: 130304 },
    { desde: 720201, hasta: 722238 },
] as const

export const CODIGOS_EXCLUIDOS_PROMEDI_OSECAC = [70116, 70607] as const
const CODIGOS_EXCLUIDOS_PROMEDI_OSECAC_SET = new Set<number>(CODIGOS_EXCLUIDOS_PROMEDI_OSECAC)

export type ObraSocialPromedi = 'IPS' | 'OSECAC'

function redondear2(valor: number): number {
    return Math.round((valor + Number.EPSILON) * 100) / 100
}

export function parseCodigoPromedi(codigo: string | null | undefined): number | null {
    const soloDigitos = (codigo ?? '').replace(/[^0-9]/g, '')
    if (!soloDigitos) return null
    const parsed = Number.parseInt(soloDigitos, 10)
    return Number.isNaN(parsed) ? null : parsed
}

export function codigoEnRangoPromedi(codigo: number): boolean {
    return CODIGOS_PROMEDI_RANGOS.some(({ desde, hasta }) => codigo >= desde && codigo <= hasta)
}

export function aplicaPromediIPS(codigoPractica: string | null | undefined): boolean {
    const codigo = parseCodigoPromedi(codigoPractica)
    if (codigo === null) return false
    return CODIGOS_PROMEDI_BASE_SET.has(codigo) || codigoEnRangoPromedi(codigo)
}

export function aplicaPromediOsecac(codigoPractica: string | null | undefined): boolean {
    const codigo = parseCodigoPromedi(codigoPractica)
    if (codigo === null) return false
    if (CODIGOS_EXCLUIDOS_PROMEDI_OSECAC_SET.has(codigo)) return false
    return CODIGOS_PROMEDI_BASE_SET.has(codigo) || codigoEnRangoPromedi(codigo)
}

export function aplicaPromediPorObra(
    codigoPractica: string | null | undefined,
    obraSocial: ObraSocialPromedi
): boolean {
    return obraSocial === 'IPS' ? aplicaPromediIPS(codigoPractica) : aplicaPromediOsecac(codigoPractica)
}

export function calcularImportePromediPorCodigo(
    codigoPractica: string | null | undefined,
    importeTotal: number,
    porcentajePromedi: number,
    obraSocial: ObraSocialPromedi
): number {
    const importeBase = Number.isFinite(importeTotal) ? redondear2(importeTotal) : 0
    if (!aplicaPromediPorObra(codigoPractica, obraSocial)) {
        return importeBase
    }
    return redondear2(importeBase * porcentajePromedi)
}