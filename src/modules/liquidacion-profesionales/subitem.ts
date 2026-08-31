import {
    resolverSubitemPromedi,
    type LineaSubitemPromedi,
    type SubitemPromedi,
} from '@/modules/facturacion/promedi-rules'

// La asociacion de anestesistas cobra con una matricula colectiva propia, igual que la
// clinica con la 9995/9110. Es MATRICULA_ANESTESISTA_INT_DEFAULT en facturacion.
export const MATRICULA_ANESTESISTA_POOL = 6

// HP no existe en SubitemPromedi (el promedi no lo necesita) pero si hay que
// distinguirlo aca: el honorario del patologo se liquida por otro circuito.
export type SubitemLiquidacion = SubitemPromedi | 'HP'

export type LineaSubitemLiquidacion = LineaSubitemPromedi & {
    titularModular?: string | null
    clasificacionAgrupacion?: string | null
    // Solo la usa el reparto de lineas combinadas: el importe viene multiplicado por
    // la cantidad y el desglose del nomenclador es unitario.
    cantidad?: number | null
}

function normalizar(value: string | null | undefined): string {
    return (value ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase()
}

/**
 * Subitem para la liquidacion al efector.
 *
 * `resolverSubitemPromedi` alcanza para el promedi, pero aca se queda corto en dos
 * casos medidos contra la base:
 *
 * - Las filas de la asociacion de anestesistas (matricula 6) traen `modulo = 'HE'` con
 *   `titularModular = 'HONORARIO ANESTESISTA'`. El modulo miente; el titular no. Sin
 *   esta correccion 170 filas de anestesia se liquidan como honorario especialista.
 * - `modulo = 'HP'` no esta contemplado en el resolver del promedi, asi que las filas
 *   del patologo caen al default 'HE'.
 *
 * Por eso el titular y la clasificacion se miran antes de delegar.
 */
export function resolverSubitemLiquidacion(linea: LineaSubitemLiquidacion): SubitemLiquidacion {
    const modulo = normalizar(linea.modulo)
    const clasificacion = normalizar(linea.clasificacionAgrupacion)
    const titular = normalizar(linea.titularModular)

    if (modulo.includes('HP') || clasificacion.includes('HP') || titular.includes('PATOLOG')) {
        return 'HP'
    }

    if (titular.includes('ANESTESISTA') || linea.efectorMatricula === MATRICULA_ANESTESISTA_POOL) {
        return 'HA'
    }

    return resolverSubitemPromedi(linea)
}

// ============================================
// LINEAS COMBINADAS (honorario + gastos en la misma fila)
// ============================================

/**
 * Una linea que cobra varios componentes a la vez.
 *
 * `resolverSubitemLiquidacion` devuelve UN subitem por linea, y la liquidacion
 * asumia que el importe entero pertenecia a ese subitem. Eso vale cuando cada
 * componente de la practica es una fila propia, que es como carga la app cuando se
 * tildan los componentes por separado.
 *
 * Pero hay filas que cobran la practica completa: 202 con etiqueta explicita
 * ('HE+GA', 'HE+HA+GA+A1', ...) y 37 sin etiqueta cuyo importe es exactamente la
 * suma del desglose (medido 2026-08-31). En esas, el resolver no encuentra el
 * componente por modulo ni por importe y cae al default por matricula: si el
 * efector es un medico devuelve 'HE' y los gastos de la clinica terminan dentro
 * del honorario. Son 136 lineas y 3.304.596,74 de mas en honorarios.
 *
 * Aca se separa la parte de gastos para que cada mitad caiga donde corresponde.
 */

const TOLERANCIA_IMPORTE_COMBINADA = 0.05

type ValorPorToken = { token: string; valor: number | null | undefined }

function redondear2(valor: number): number {
    return Math.round(valor * 100) / 100
}

function valorDeToken(
    token: string,
    valores: NonNullable<LineaSubitemLiquidacion['valoresNomenclador']>
): number | null | undefined {
    if (token === 'GA') return valores.valorGastos
    if (token === 'HE') return valores.valorEspecialista
    if (token === 'HA') return valores.valorAnestesista
    if (token === 'A1' || token === 'A2' || token === 'A3') return valores.valorAyudante
    return null
}

/** Tokens de la etiqueta ('HE+GA' -> ['HE','GA']). Vacio si no hay etiqueta. */
function tokensEtiqueta(linea: LineaSubitemLiquidacion): string[] {
    const etiqueta = normalizar(linea.clasificacionAgrupacion) || normalizar(linea.modulo)
    if (!etiqueta.includes('+')) return []
    return etiqueta
        .split('+')
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
}

/**
 * Componentes que cobra la linea, o null si no es combinada.
 *
 * Dos senales, en este orden:
 * 1. La etiqueta (`clasificacionAgrupacion` o `modulo`) trae varios tokens.
 * 2. Sin etiqueta: el importe unitario coincide con la suma de TODO el desglose.
 *    Es el caso de las filas que la app dejo sin marcar (orden 1376, por ej).
 */
function componentesDeLinea(linea: LineaSubitemLiquidacion): ValorPorToken[] | null {
    const valores = linea.valoresNomenclador
    if (!valores) return null

    const tokens = tokensEtiqueta(linea)
    if (tokens.length > 1) {
        return tokens.map((token) => ({ token, valor: valorDeToken(token, valores) }))
    }

    // Solo se infiere cuando la linea no declara nada: si trae etiqueta de un
    // componente, esa manda aunque el importe diga otra cosa.
    if (tokens.length > 0) return null
    if (normalizar(linea.clasificacionAgrupacion) || normalizar(linea.modulo)) return null

    const importe = linea.importeTotal
    if (importe == null || !Number.isFinite(importe)) return null

    const todos: ValorPorToken[] = [
        { token: 'GA', valor: valores.valorGastos },
        { token: 'HE', valor: valores.valorEspecialista },
        { token: 'HA', valor: valores.valorAnestesista },
        { token: 'A1', valor: valores.valorAyudante },
    ].filter((c) => c.valor != null && Number.isFinite(c.valor) && c.valor !== 0)

    if (todos.length < 2) return null

    const cantidad = Number(linea.cantidad ?? 1) || 1
    const suma = todos.reduce((acc, c) => acc + Number(c.valor), 0)
    if (Math.abs(importe / cantidad - suma) >= TOLERANCIA_IMPORTE_COMBINADA) return null

    return todos
}

/**
 * Porcion del importe que corresponde a gastos, o null si la linea no es combinada.
 *
 * El reparto va por proporcion del desglose y no por el valor absoluto del
 * nomenclador: asi honorarios + gastos da exactamente el importe de la linea aunque
 * la hayan editado a mano en facturacion.
 */
export function porcionGastosDeLineaCombinada(linea: LineaSubitemLiquidacion): number | null {
    const componentes = componentesDeLinea(linea)
    if (!componentes) return null

    const gastos = componentes.filter((c) => c.token === 'GA')
    const honorarios = componentes.filter((c) => c.token !== 'GA')
    if (gastos.length === 0 || honorarios.length === 0) return null

    const valorGastos = gastos.reduce((acc, c) => acc + Number(c.valor ?? 0), 0)
    const valorHonorarios = honorarios.reduce((acc, c) => acc + Number(c.valor ?? 0), 0)
    // Si el desglose no tiene con que repartir, mejor no inventar: queda como estaba.
    if (valorGastos <= 0 || valorHonorarios <= 0) return null

    const importe = linea.importeTotal
    if (importe == null || !Number.isFinite(importe) || importe <= 0) return null

    return redondear2(importe * (valorGastos / (valorGastos + valorHonorarios)))
}

export type ImportesLiquidacion = {
    subitem: SubitemLiquidacion
    importeHonorarios: number
    importeGastos: number
}

/**
 * Subitem de la linea y reparto del importe entre honorarios y gastos.
 *
 * Reemplaza al `esGasto ? importe : 0` que tenia la liquidacion: una linea normal
 * sigue yendo entera a un lado, y una combinada se parte.
 */
export function resolverImportesLiquidacion(linea: LineaSubitemLiquidacion): ImportesLiquidacion {
    const subitem = resolverSubitemLiquidacion(linea)
    const importe = Number(linea.importeTotal ?? 0)

    const gastosCombinada = porcionGastosDeLineaCombinada(linea)
    if (gastosCombinada != null) {
        return {
            subitem,
            importeHonorarios: redondear2(importe - gastosCombinada),
            importeGastos: gastosCombinada,
        }
    }

    const esGasto = subitem === 'GA'
    return {
        subitem,
        importeHonorarios: esGasto ? 0 : importe,
        importeGastos: esGasto ? importe : 0,
    }
}
