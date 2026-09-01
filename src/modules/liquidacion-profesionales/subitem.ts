import {
    repartirLineaCombinada,
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
 * Porcion del importe que corresponde a gastos, o null si la fila cobra un solo
 * componente y no hay nada que repartir.
 *
 * El reparto vive en `promedi-rules` porque lo comparten dos consumidores que no
 * pueden divergir: esta liquidacion y las columnas por componente del resumen de
 * lote. Aca solo interesa la division honorario / gastos.
 */
export function porcionGastosDeLineaCombinada(linea: LineaSubitemLiquidacion): number | null {
    return repartirLineaCombinada(linea)?.gastos ?? null
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
            importeHonorarios: Math.round((importe - gastosCombinada) * 100) / 100,
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
