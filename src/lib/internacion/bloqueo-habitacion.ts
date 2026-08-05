const BLOQUEO_HABITACION_PREFIX = '[HIS_BLOQUEO_HABITACION]'

export function construirObservacionBloqueoHabitacion(ingresoId: number, habitacion: string): string {
  const habitacionNormalizada = habitacion.trim()
  return `${BLOQUEO_HABITACION_PREFIX} ingreso=${ingresoId};habitacion=${habitacionNormalizada}`
}

export function prefijoBloqueoHabitacionPorIngreso(ingresoId: number): string {
  return `${BLOQUEO_HABITACION_PREFIX} ingreso=${ingresoId};`
}

export function parseObservacionBloqueoHabitacion(observaciones: string | null | undefined): {
  ingresoId: number
  habitacion: string | null
} | null {
  const raw = observaciones?.trim() ?? ''
  if (!raw.startsWith(BLOQUEO_HABITACION_PREFIX)) return null

  const payload = raw.slice(BLOQUEO_HABITACION_PREFIX.length).trim()
  if (!payload) return null

  const partes = payload.split(';').map((item) => item.trim()).filter(Boolean)
  const kv = new Map<string, string>()

  for (const parte of partes) {
    const [k, ...resto] = parte.split('=')
    if (!k) continue
    kv.set(k.trim().toLowerCase(), resto.join('=').trim())
  }

  const ingresoIdRaw = kv.get('ingreso')
  const ingresoId = ingresoIdRaw ? Number.parseInt(ingresoIdRaw, 10) : NaN
  if (!Number.isFinite(ingresoId) || ingresoId <= 0) return null

  const habitacion = kv.get('habitacion')?.trim() ?? null

  return {
    ingresoId,
    habitacion: habitacion && habitacion.length > 0 ? habitacion : null,
  }
}

export function esObservacionBloqueoHabitacion(observaciones: string | null | undefined): boolean {
  return parseObservacionBloqueoHabitacion(observaciones) !== null
}
