/**
 * Matcheo entre las practicas de una cirugia (CirugiaPractica) y las practicas
 * de la internacion (Practica).
 *
 * Es 1:1 y por codigo: cada fila de CirugiaPractica se queda con una practica
 * distinta. Por eso una cirugia tiene que tener una fila por practica, no una
 * por par (codigo, cantidad) -si sobran practicas del mismo codigo, quedan sin
 * enganchar y no aparecen en la seccion de cirugia.
 *
 * Prioriza las practicas cargadas desde la pantalla de cirugia (usuario
 * 'CIRUGIA'); si no hay, toma la primera libre del mismo codigo.
 *
 * Vive aca y no dentro de un componente porque lo usan dos lugares que tienen
 * que coincidir: la seccion de cirugia -que las muestra- y el panel clinico
 * -que las saca del listado de practicas para que no se vean dos veces-.
 */

export type PracticaCirugiaLite = {
    id: number
    codigo: string
}

export type PracticaInternacionLite = {
    id: number
    codigoPractica: string
    estado: string | null
    usuario?: string | null
}

export type CirugiaConPracticasLite = {
    id: number
    practicas: PracticaCirugiaLite[]
}

/**
 * Devuelve, por cada fila de CirugiaPractica, el id de la practica de
 * internacion que le corresponde.
 */
export function resolverPracticaInternacionPorPracticaCirugia(
    cirugias: CirugiaConPracticasLite[],
    practicasInternacion: PracticaInternacionLite[]
): Map<number, number> {
    const practicasPorCodigo = new Map<string, PracticaInternacionLite[]>()

    for (const practica of practicasInternacion) {
        const estado = (practica.estado ?? 'A').trim().toUpperCase()
        if (estado === 'X') continue

        const codigo = practica.codigoPractica.trim().toUpperCase()
        if (!codigo) continue

        const bucket = practicasPorCodigo.get(codigo) ?? []
        bucket.push(practica)
        practicasPorCodigo.set(codigo, bucket)
    }

    for (const bucket of practicasPorCodigo.values()) {
        bucket.sort((a, b) => a.id - b.id)
    }

    const resultado = new Map<number, number>()

    for (const cirugia of cirugias) {
        const usadosPorCodigo = new Set<number>()

        for (const practicaCirugia of cirugia.practicas) {
            const codigoCirugia = practicaCirugia.codigo.trim().toUpperCase()
            const candidatas = practicasPorCodigo.get(codigoCirugia) ?? []

            const candidataPrioritaria = candidatas.find((item) => {
                if (usadosPorCodigo.has(item.id)) return false
                const usuario = (item.usuario ?? '').trim().toUpperCase()
                return usuario === 'CIRUGIA'
            })
            const candidataFallback = candidatas.find((item) => !usadosPorCodigo.has(item.id))
            const candidata = candidataPrioritaria ?? candidataFallback

            if (!candidata) continue

            usadosPorCodigo.add(candidata.id)
            resultado.set(practicaCirugia.id, candidata.id)
        }
    }

    return resultado
}

/**
 * Ids de practicas de internacion que ya se muestran dentro de una cirugia.
 */
export function resolverPracticaIdsDeCirugia(
    cirugias: CirugiaConPracticasLite[],
    practicasInternacion: PracticaInternacionLite[]
): Set<number> {
    return new Set(
        resolverPracticaInternacionPorPracticaCirugia(cirugias, practicasInternacion).values()
    )
}
