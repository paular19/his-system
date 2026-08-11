export function recalcularImportePorCambioCantidad(
    cantidadAnterior: number,
    importeAnterior: number,
    cantidadNueva: number
): number {
    if (
        !Number.isFinite(cantidadAnterior) || cantidadAnterior <= 0 ||
        !Number.isFinite(importeAnterior) || importeAnterior < 0 ||
        !Number.isFinite(cantidadNueva) || cantidadNueva <= 0
    ) {
        return importeAnterior
    }

    return Math.round((importeAnterior / cantidadAnterior) * cantidadNueva * 100) / 100
}