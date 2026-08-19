import {
    coincideTextoConBusquedaFlexible,
    normalizarTextoBusquedaFlexible,
    obtenerTokensBusquedaFlexible,
} from '@/lib/utils/busqueda-flexible'

// ============================================
// PARSEO DE LA BUSQUEDA DE ORDENES
// ============================================
//
// El buscador de autorizaciones recibe un unico campo de texto donde el usuario
// puede pegar cosas muy distintas: el nombre del paciente, el numero de orden
// (suelto o en el formato impreso 0001-00000701-01), el numero de autorizacion
// de la obra social, un codigo de practica o el numero de afiliado.
//
// Antes se resolvia con `includes()` sobre todos esos campos a la vez, asi que
// buscar "701" devolvia 240 ordenes: 230 por la practica 430701 (oxigeno) y 9
// por afiliados como 20701167. La orden 701 real quedaba enterrada.
//
// La estrategia ahora es rankear cada coincidencia por precision y quedarse solo
// con el mejor nivel encontrado.

export const RANK_NUMERO_ORDEN = 0
export const RANK_AUTORIZACION_EXACTA = 1
export const RANK_CODIGO_EXACTO = 2
export const RANK_NOMBRE_PACIENTE = 3
export const RANK_PARCIAL = 4

/** Hasta este rank se considera que la coincidencia es precisa. */
const RANK_PRECISO_MAXIMO = RANK_CODIGO_EXACTO

export type TipoCoincidenciaOrden =
    | 'NUMERO_ORDEN'
    | 'AUTORIZACION'
    | 'CODIGO_PRACTICA'
    | 'AFILIADO'
    | 'PACIENTE'
    | 'PARCIAL'

export type BusquedaOrdenParseada = {
    /** Texto original, ya trimmeado. */
    original: string
    /** Version normalizada (sin acentos, minusculas) para comparar texto. */
    normalizada: string
    tokens: string[]
    /** Numero de orden pedido, si la busqueda puede leerse como tal. */
    numeroOrden: number | null
    /** Puesto pedido, solo cuando vino en formato completo. */
    puestoNumero: number | null
    /** True cuando el usuario pego el formato impreso o el codigo de barras. */
    formatoCompleto: boolean
    /** Solo digitos, sin separadores. Vacio si la busqueda tiene letras. */
    digitos: string
}

const SOLO_DIGITOS = /^\d+$/
const FORMATO_IMPRESO = /^(\d{1,4})[-\s/](\d{1,8})(?:[-\s/](\d{1,3}))?$/
const CODIGO_BARRAS = /^(\d{4})(\d{8})(\d{3})$/

/**
 * Interpreta el texto del buscador. Acepta el numero de orden suelto (701), el
 * formato impreso (0001-00000701 / 0001-00000701-01) y el codigo de barras de
 * 15 digitos (000100000701001).
 */
export function parsearBusquedaOrden(value: string | null | undefined): BusquedaOrdenParseada | null {
    const original = (value ?? '').trim()
    if (!original) return null

    const normalizada = normalizarTextoBusquedaFlexible(original)
    const tokens = obtenerTokensBusquedaFlexible(original)

    let numeroOrden: number | null = null
    let puestoNumero: number | null = null
    let formatoCompleto = false

    const codigoBarras = CODIGO_BARRAS.exec(original)
    const formatoImpreso = FORMATO_IMPRESO.exec(original)

    if (codigoBarras) {
        puestoNumero = parseInt(codigoBarras[1] ?? '', 10)
        numeroOrden = parseInt(codigoBarras[2] ?? '', 10)
        formatoCompleto = true
    } else if (formatoImpreso) {
        puestoNumero = parseInt(formatoImpreso[1] ?? '', 10)
        numeroOrden = parseInt(formatoImpreso[2] ?? '', 10)
        formatoCompleto = true
    } else if (SOLO_DIGITOS.test(original) && original.length <= 8) {
        numeroOrden = parseInt(original, 10)
    }

    if (numeroOrden !== null && (!Number.isFinite(numeroOrden) || numeroOrden <= 0)) {
        numeroOrden = null
        puestoNumero = null
        formatoCompleto = false
    }

    const digitos = SOLO_DIGITOS.test(original) ? original : ''

    return { original, normalizada, tokens, numeroOrden, puestoNumero, formatoCompleto, digitos }
}

export type FilaBuscableOrden = {
    puestoNumero: number
    numero: number
    nombrePaciente: string
    numeroAfiliado: string
    /** Autorizacion ya resuelta (la real, no el codigo de barras autogenerado). */
    numeroAutorizacion: string | null
    practicas: Array<{ codigoPractica: string; descripcionPractica: string }>
}

export type CoincidenciaOrden = {
    rank: number
    tipo: TipoCoincidenciaOrden
    etiqueta: string
}

function normalizarCodigo(value: string | null | undefined): string {
    return (value ?? '').trim().toUpperCase()
}

/**
 * Devuelve la mejor coincidencia de la fila contra la busqueda, o null si no
 * coincide con nada.
 */
export function evaluarCoincidenciaOrden(
    fila: FilaBuscableOrden,
    busqueda: BusquedaOrdenParseada
): CoincidenciaOrden | null {
    const { numeroOrden, puestoNumero, digitos, normalizada } = busqueda

    if (numeroOrden !== null && fila.numero === numeroOrden) {
        if (puestoNumero === null || fila.puestoNumero === puestoNumero) {
            return { rank: RANK_NUMERO_ORDEN, tipo: 'NUMERO_ORDEN', etiqueta: 'N° de orden' }
        }
    }

    const autorizacion = normalizarCodigo(fila.numeroAutorizacion)
    const busquedaCodigo = normalizarCodigo(busqueda.original)

    if (autorizacion && autorizacion === busquedaCodigo) {
        return { rank: RANK_AUTORIZACION_EXACTA, tipo: 'AUTORIZACION', etiqueta: 'N° de autorización' }
    }

    if (busquedaCodigo && fila.practicas.some((p) => normalizarCodigo(p.codigoPractica) === busquedaCodigo)) {
        return { rank: RANK_CODIGO_EXACTO, tipo: 'CODIGO_PRACTICA', etiqueta: 'Código de práctica' }
    }

    const afiliado = normalizarCodigo(fila.numeroAfiliado)
    if (afiliado && afiliado === busquedaCodigo) {
        return { rank: RANK_CODIGO_EXACTO, tipo: 'AFILIADO', etiqueta: 'N° de afiliado' }
    }

    if (coincideTextoConBusquedaFlexible(fila.nombrePaciente, busqueda.original)) {
        return { rank: RANK_NOMBRE_PACIENTE, tipo: 'PACIENTE', etiqueta: 'Paciente' }
    }

    // Coincidencias parciales: solo se muestran si no hubo ninguna precisa.
    // Los numeros cortos generan demasiado ruido como substring, asi que el
    // parcial sobre campos numericos exige al menos 4 caracteres.
    const permiteParcialNumerico = busquedaCodigo.length >= 4

    if (permiteParcialNumerico && autorizacion.includes(busquedaCodigo)) {
        return { rank: RANK_PARCIAL, tipo: 'AUTORIZACION', etiqueta: 'N° de autorización (parcial)' }
    }

    if (permiteParcialNumerico && afiliado.includes(busquedaCodigo)) {
        return { rank: RANK_PARCIAL, tipo: 'AFILIADO', etiqueta: 'N° de afiliado (parcial)' }
    }

    if (permiteParcialNumerico && fila.practicas.some((p) => normalizarCodigo(p.codigoPractica).includes(busquedaCodigo))) {
        return { rank: RANK_PARCIAL, tipo: 'CODIGO_PRACTICA', etiqueta: 'Código de práctica (parcial)' }
    }

    if (!digitos && normalizada) {
        const descripciones = normalizarTextoBusquedaFlexible(
            fila.practicas.map((p) => p.descripcionPractica).join(' ')
        )
        if (descripciones.includes(normalizada)) {
            return { rank: RANK_PARCIAL, tipo: 'CODIGO_PRACTICA', etiqueta: 'Práctica' }
        }
    }

    return null
}

/**
 * Umbral de rank a mostrar: si hubo alguna coincidencia precisa (numero de
 * orden, autorizacion o codigo exacto) se descartan las parciales, que es lo
 * que evita que buscar "701" devuelva las 230 ordenes con la practica 430701.
 */
export function calcularUmbralRank(mejorRank: number | null): number {
    if (mejorRank === null) return RANK_PARCIAL
    return mejorRank <= RANK_PRECISO_MAXIMO ? RANK_PRECISO_MAXIMO : RANK_PARCIAL
}
