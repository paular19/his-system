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
