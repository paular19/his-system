type FechaValor = Date | string | null | undefined

export const ARG_TIME_ZONE = 'America/Argentina/Buenos_Aires'

function toDate(value: FechaValor): Date | null {
  if (!value) return null
  const date = typeof value === 'string' ? new Date(value) : value
  return Number.isNaN(date.getTime()) ? null : date
}

function esFechaSoloEnUtc(fecha: Date): boolean {
  return (
    fecha.getUTCHours() === 0 &&
    fecha.getUTCMinutes() === 0 &&
    fecha.getUTCSeconds() === 0 &&
    fecha.getUTCMilliseconds() === 0
  )
}

function partesClaveArgentina(fecha: Date): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ARG_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(fecha)

  return {
    year: parts.find((p) => p.type === 'year')?.value ?? '0000',
    month: parts.find((p) => p.type === 'month')?.value ?? '01',
    day: parts.find((p) => p.type === 'day')?.value ?? '01',
  }
}

function normalizarParaVisualizacionArgentina(fecha: Date): Date {
  if (esFechaSoloEnUtc(fecha)) {
    return new Date(`${fecha.toISOString().slice(0, 10)}T12:00:00-03:00`)
  }

  return fecha
}

export function claveDiaArgentina(value: FechaValor): string | null {
  const fecha = toDate(value)
  if (!fecha) return null

  if (esFechaSoloEnUtc(fecha)) {
    return fecha.toISOString().slice(0, 10)
  }

  const { year, month, day } = partesClaveArgentina(fecha)
  return `${year}-${month}-${day}`
}

export function fechaDesdeClaveArgentina(clave: string): Date {
  return new Date(`${clave}T12:00:00-03:00`)
}

export function formatearFechaArgentina(
  value: FechaValor,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }
): string {
  const fecha = toDate(value)
  if (!fecha) return '—'

  const normalizada = normalizarParaVisualizacionArgentina(fecha)
  return normalizada.toLocaleDateString('es-AR', {
    ...options,
    timeZone: ARG_TIME_ZONE,
  })
}

export function formatearFechaHoraArgentina(
  value: FechaValor,
  options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }
): string {
  const fecha = toDate(value)
  if (!fecha) return '—'

  const normalizada = normalizarParaVisualizacionArgentina(fecha)
  return normalizada.toLocaleString('es-AR', {
    ...options,
    hour12: false,
    timeZone: ARG_TIME_ZONE,
  })
}

export function diferenciaDiasCalendarioArgentina(
  desde: FechaValor,
  hasta: FechaValor = new Date()
): number | null {
  const inicioKey = claveDiaArgentina(desde)
  const finKey = claveDiaArgentina(hasta)
  if (!inicioKey || !finKey) return null

  const inicio = fechaDesdeClaveArgentina(inicioKey)
  const fin = fechaDesdeClaveArgentina(finKey)
  return Math.floor((fin.getTime() - inicio.getTime()) / 86_400_000)
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function partesFechaHoraArgentina(fecha: Date): {
  year: string
  month: string
  day: string
  hour: string
  minute: string
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ARG_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(fecha)

  return {
    year: parts.find((p) => p.type === 'year')?.value ?? '0000',
    month: parts.find((p) => p.type === 'month')?.value ?? '01',
    day: parts.find((p) => p.type === 'day')?.value ?? '01',
    hour: parts.find((p) => p.type === 'hour')?.value ?? '00',
    minute: parts.find((p) => p.type === 'minute')?.value ?? '00',
  }
}

export function fechaAInputLocal(value: FechaValor = new Date()): string {
  const fecha = toDate(value)
  if (!fecha) return ''

  const clave = claveDiaArgentina(fecha)
  if (clave) return clave

  const y = fecha.getFullYear()
  const m = pad2(fecha.getMonth() + 1)
  const d = pad2(fecha.getDate())
  return `${y}-${m}-${d}`
}

export function fechaHoraAInputLocal(value: FechaValor = new Date()): string {
  const fecha = toDate(value)
  if (!fecha) return ''

  const normalizada = normalizarParaVisualizacionArgentina(fecha)
  const { year, month, day, hour, minute } = partesFechaHoraArgentina(normalizada)
  return `${year}-${month}-${day}T${hour}:${minute}`
}

export function periodoAInputLocal(value: FechaValor = new Date()): string {
  const fecha = toDate(value)
  if (!fecha) return ''
  const y = fecha.getFullYear()
  const m = pad2(fecha.getMonth() + 1)
  return `${y}-${m}`
}