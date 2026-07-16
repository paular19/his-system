import { generarOrdenesDesdeInternacionAction } from '@/modules/orden/actions'

type PracticaAdmisionApi = {
  id: number
  estado?: string | null
  numeroAutorizacion?: string | null
  ordenPractica?: Array<unknown>
}

function estaPendienteDeOrden(practica: PracticaAdmisionApi): boolean {
  const estado = (practica.estado ?? 'A').trim().toUpperCase()
  if (estado === 'X') return false
  if ((practica.numeroAutorizacion?.trim().length ?? 0) > 0) return false
  return (practica.ordenPractica?.length ?? 0) === 0
}

async function obtenerPracticasIngreso(ingresoId: number): Promise<PracticaAdmisionApi[]> {
  const res = await fetch(`/api/admision/${ingresoId}`, { cache: 'no-store' })
  const json = await res.json().catch(() => null)
  const practicas = Array.isArray(json?.data?.practicas) ? json.data.practicas : []
  return practicas as PracticaAdmisionApi[]
}

export async function generarOrdenesPendientesAdmision(
  ingresoId: number,
  opciones?: { soloIds?: Set<number> }
): Promise<{ ok: true; cantidad: number } | { ok: false; error: string }> {
  try {
    const practicas = await obtenerPracticasIngreso(ingresoId)

    const idsPendientes = practicas
      .filter((p) => {
        if (!estaPendienteDeOrden(p)) return false
        if (!opciones?.soloIds) return true
        return opciones.soloIds.has(p.id)
      })
      .map((p) => p.id)

    if (idsPendientes.length === 0) {
      return { ok: true, cantidad: 0 }
    }

    const result = await generarOrdenesDesdeInternacionAction({
      ingresoId,
      practicaIds: idsPendientes,
    })

    if ('error' in result && result.error) {
      return { ok: false, error: result.error }
    }

    return {
      ok: true,
      cantidad: 'ordenesPorGrupo' in result && Array.isArray(result.ordenesPorGrupo)
        ? result.ordenesPorGrupo.length
        : 0,
    }
  } catch {
    return { ok: false, error: 'No se pudieron generar las órdenes automáticamente' }
  }
}
