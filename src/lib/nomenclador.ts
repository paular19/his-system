import { prisma } from '@/lib/db'

/**
 * Origen de una descripcion de nomenclador: cualquier fila que tenga convenio y
 * codigo de practica (Practica, OrdenPractica, etc.).
 */
export interface OrigenNomenclador {
    convenioId: number
    codigoPractica: string
}

/**
 * Clave normalizada para buscar en el mapa que devuelve
 * `obtenerDescripcionesNomenclador`.
 */
export function claveNomenclador(convenioId: number, codigoPractica: string): string {
    return `${convenioId}:${codigoPractica.trim()}`
}

/**
 * Resuelve las descripciones del nomenclador para un conjunto de practicas.
 *
 * No se usa la relacion `Practica.nomencladorPractica` de Prisma por dos motivos:
 *
 * 1. Es una FK compuesta (convenioId, codigoPractica) y el query engine entra en
 *    panic ("Expected parent IDs to be set when ordering by parent ID") cuando
 *    muchas filas de Practica comparten el mismo codigo.
 * 2. `Practica.codigoPractica` es VarChar(8) y `NomencladorPractica.codigo` es
 *    Char(8). Prisma matchea la relacion en memoria comparando strings, asi que
 *    los codigos guardados sin padding nunca encontraban su descripcion.
 *
 * Consultando aparte y normalizando con trim() se evitan ambos problemas.
 */
export async function obtenerDescripcionesNomenclador(
    origenes: readonly OrigenNomenclador[]
): Promise<Map<string, string>> {
    const claves = new Map<string, OrigenNomenclador>()
    for (const origen of origenes) {
        const codigoPractica = origen.codigoPractica.trim()
        if (!codigoPractica) continue
        claves.set(claveNomenclador(origen.convenioId, codigoPractica), {
            convenioId: origen.convenioId,
            codigoPractica,
        })
    }

    const descripciones = new Map<string, string>()
    if (claves.size === 0) return descripciones

    const valores = Array.from(claves.values())
    const nomencladores = await prisma.nomencladorPractica.findMany({
        where: {
            convenioId: { in: Array.from(new Set(valores.map((valor) => valor.convenioId))) },
            codigo: { in: Array.from(new Set(valores.map((valor) => valor.codigoPractica))) },
        },
        select: { convenioId: true, codigo: true, descripcion: true },
    })

    for (const nomenclador of nomencladores) {
        const descripcion = nomenclador.descripcion.trim()
        if (!descripcion) continue
        descripciones.set(claveNomenclador(nomenclador.convenioId, nomenclador.codigo), descripcion)
    }

    return descripciones
}

/**
 * Desglose de valores por componente de una practica del nomenclador.
 */
export interface ValoresNomenclador {
    valorEspecialista: number | null
    valorAyudante: number | null
    valorAnestesista: number | null
    valorGastos: number | null
}

/**
 * Resuelve el desglose de valores del nomenclador para un conjunto de practicas.
 *
 * Mismas precauciones que `obtenerDescripcionesNomenclador`: se consulta
 * `NomencladorPractica` aparte en vez de usar la relacion de Prisma, y las claves
 * del mapa se normalizan con trim().
 */
export async function obtenerValoresNomenclador(
    origenes: readonly OrigenNomenclador[]
): Promise<Map<string, ValoresNomenclador>> {
    const claves = new Map<string, OrigenNomenclador>()
    for (const origen of origenes) {
        const codigoPractica = origen.codigoPractica.trim()
        if (!codigoPractica) continue
        claves.set(claveNomenclador(origen.convenioId, codigoPractica), {
            convenioId: origen.convenioId,
            codigoPractica,
        })
    }

    const valoresPorClave = new Map<string, ValoresNomenclador>()
    if (claves.size === 0) return valoresPorClave

    const valores = Array.from(claves.values())
    const nomencladores = await prisma.nomencladorPractica.findMany({
        where: {
            convenioId: { in: Array.from(new Set(valores.map((valor) => valor.convenioId))) },
            codigo: { in: Array.from(new Set(valores.map((valor) => valor.codigoPractica))) },
        },
        select: {
            convenioId: true,
            codigo: true,
            valorEspecialista: true,
            valorAyudante: true,
            valorAnestesista: true,
            valorGastos: true,
        },
    })

    const aNumero = (valor: unknown): number | null =>
        valor == null ? null : Number(valor)

    for (const nomenclador of nomencladores) {
        valoresPorClave.set(claveNomenclador(nomenclador.convenioId, nomenclador.codigo), {
            valorEspecialista: aNumero(nomenclador.valorEspecialista),
            valorAyudante: aNumero(nomenclador.valorAyudante),
            valorAnestesista: aNumero(nomenclador.valorAnestesista),
            valorGastos: aNumero(nomenclador.valorGastos),
        })
    }

    return valoresPorClave
}
