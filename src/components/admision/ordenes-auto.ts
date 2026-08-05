import { generarOrdenesDesdeInternacionAction } from '@/modules/orden/actions'

export async function generarOrdenesPendientesAdmision(
  ingresoId: number,
  opciones?: {
    soloIds?: Set<number>
    idsPendientesConfirmados?: number[]
    separarPorPractica?: boolean
  }
): Promise<{ ok: true; cantidad: number; ordenes: Array<{ puestoNumero: number; numero: number }> } | { ok: false; error: string }> {
  try {
    let idsPendientesResueltos: number[] | undefined

    if (Array.isArray(opciones?.idsPendientesConfirmados)) {
      idsPendientesResueltos = Array.from(new Set(opciones.idsPendientesConfirmados))
    } else if (opciones?.soloIds && opciones.soloIds.size > 0) {
      idsPendientesResueltos = Array.from(opciones.soloIds)
    }

    if (Array.isArray(idsPendientesResueltos) && idsPendientesResueltos.length === 0) {
      return { ok: true, cantidad: 0, ordenes: [] }
    }

    const result = await generarOrdenesDesdeInternacionAction({
      ingresoId,
      ...(idsPendientesResueltos ? { practicaIds: idsPendientesResueltos } : {}),
      separarPorPractica: Boolean(opciones?.separarPorPractica),
    })

    if ('error' in result && result.error) {
      return { ok: false, error: result.error }
    }

    const ordenesPorGrupo =
      'ordenesPorGrupo' in result && Array.isArray(result.ordenesPorGrupo)
        ? result.ordenesPorGrupo
        : []

    const ordenes = ordenesPorGrupo
      .map((orden) => ({
        puestoNumero: typeof orden?.puestoNumero === 'number' ? orden.puestoNumero : 0,
        numero: typeof orden?.numero === 'number' ? orden.numero : 0,
      }))
      .filter((orden) => orden.puestoNumero > 0 && orden.numero > 0)

    return {
      ok: true,
      cantidad: ordenes.length,
      ordenes,
    }
  } catch {
    return { ok: false, error: 'No se pudieron generar las órdenes automáticamente' }
  }
}
