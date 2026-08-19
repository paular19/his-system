import { parseCodigoPromedi } from './promedi-rules'

export type CategoriaPractica = 'OXIGENO' | 'RADIOGRAFIA' | 'ECOGRAFIA' | 'GUARDIA'

type DefinicionCategoria = {
    id: CategoriaPractica
    label: string
    codigos?: number[]
    rangos?: { desde: number; hasta: number }[]
}

// Rangos verificados contra los codigos que aparecen en los lotes de IPS y OSECAC.
// Radiografia cubre 3401xx-3409xx (radiografias y radioscopia); la T.A.C. (3410xx)
// queda deliberadamente afuera. Ecografia cubre 1801xx (ecografias y ecodoppler).
export const CATEGORIAS_PRACTICA: DefinicionCategoria[] = [
    { id: 'OXIGENO', label: 'Oxigeno', codigos: [430701] },
    { id: 'RADIOGRAFIA', label: 'Radiografias', rangos: [{ desde: 340100, hasta: 340999 }] },
    { id: 'ECOGRAFIA', label: 'Ecografias', rangos: [{ desde: 180100, hasta: 180199 }] },
    { id: 'GUARDIA', label: 'Guardia', codigos: [420101] },
]

export const CATEGORIA_PRACTICA_LABEL: Record<CategoriaPractica, string> = {
    OXIGENO: 'Oxígeno',
    RADIOGRAFIA: 'Radiografías',
    ECOGRAFIA: 'Ecografías',
    GUARDIA: 'Guardia',
}

export function categoriaPractica(codigoPractica: string | null | undefined): CategoriaPractica | null {
    const codigo = parseCodigoPromedi(codigoPractica)
    if (codigo === null) return null

    for (const def of CATEGORIAS_PRACTICA) {
        if (def.codigos?.includes(codigo)) return def.id
        if (def.rangos?.some(({ desde, hasta }) => codigo >= desde && codigo <= hasta)) return def.id
    }

    return null
}
