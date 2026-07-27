import { generarOrdenesDesdeInternacionAction } from '@/modules/orden/actions'

async function obtenerIdsPendientesIngreso(ingresoId: number): Promise<number[]> {
  const res = await fetch(`/api/admision/${ingresoId}/practicas?soloPendientesIds=1`, { cache: 'no-store' })
  const json = await res.json().catch(() => null)
  const ids = Array.isArray(json?.data)
    ? (json.data as unknown[])
      .filter((id): id is number => Number.isFinite(Number(id)))
      .map((id) => Number(id))
    : []
  return ids
}

export async function generarOrdenesPendientesAdmision(
  ingresoId: number,
  opciones?: {
    soloIds?: Set<number>
    idsPendientesConfirmados?: number[]
    separarPorPractica?: boolean
  }
): Promise<{ ok: true; cantidad: number; ordenes: Array<{ puestoNumero: number; numero: number }> } | { ok: false; error: string }> {
  try {
    let idsPendientesResueltos: number[]

    if (Array.isArray(opciones?.idsPendientesConfirmados)) {
      idsPendientesResueltos = Array.from(new Set(opciones.idsPendientesConfirmados))
    } else {
      const idsPendientes = await obtenerIdsPendientesIngreso(ingresoId)
      idsPendientesResueltos = opciones?.soloIds
        ? idsPendientes.filter((id) => opciones.soloIds?.has(id))
        : idsPendientes
    }

    if (idsPendientesResueltos.length === 0) {
      return { ok: true, cantidad: 0, ordenes: [] }
    }

    const result = await generarOrdenesDesdeInternacionAction({
      ingresoId,
      practicaIds: idsPendientesResueltos,
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
