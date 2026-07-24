import { limpiarBloqueMetaInternacion } from '@/modules/internacion/observaciones-meta'

export function limpiarObservacionesAdmision(
    observaciones: string | null | undefined
): string | null {
    const observacionesSinMeta = limpiarBloqueMetaInternacion(observaciones)
    if (!observacionesSinMeta) return null

    const sinPracticasLegacy = observacionesSinMeta.replace(
        /\n?\[(?:Prácticas|Practicas) registradas al ingreso\]\n(?:- .*(?:\n|$))*/g,
        ''
    )

    const limpio = sinPracticasLegacy.trim()
    return limpio.length > 0 ? limpio : null
}