export function limpiarObservacionesAdmision(
    observaciones: string | null | undefined
): string | null {
    if (!observaciones) return null

    const sinPracticasLegacy = observaciones.replace(
        /\n?\[(?:Prácticas|Practicas) registradas al ingreso\]\n(?:- .*(?:\n|$))*/g,
        ''
    )

    const limpio = sinPracticasLegacy.trim()
    return limpio.length > 0 ? limpio : null
}