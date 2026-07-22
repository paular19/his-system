export type TipoVia = 'SIMPLE' | 'DOBLE_LUMEN' | 'CATETER_HEMODIALISIS'

export type ViaRegistro = {
  id: number
  tipo: TipoVia
  fechaHora: string
  profesionalId: number
  profesionalNombre: string
  creadoEn: string
}

export type ViaFichaNotas = {
  item1: string
  item2: string
  item3: string
  item4: string
}

function keyVias(ingresoId: number): string {
  return `internacion:vias:${ingresoId}`
}

function keyFichaVia(ingresoId: number, viaId: number): string {
  return `internacion:vias:ficha:${ingresoId}:${viaId}`
}

function parseLista(raw: string | null): ViaRegistro[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((item): item is ViaRegistro => {
        if (!item || typeof item !== 'object') return false
        const candidate = item as Partial<ViaRegistro>
        return (
          typeof candidate.id === 'number' &&
          typeof candidate.tipo === 'string' &&
          typeof candidate.fechaHora === 'string' &&
          typeof candidate.profesionalId === 'number' &&
          typeof candidate.profesionalNombre === 'string'
        )
      })
      .sort((a, b) => new Date(b.fechaHora).getTime() - new Date(a.fechaHora).getTime())
  } catch {
    return []
  }
}

export function leerVias(ingresoId: number): ViaRegistro[] {
  if (typeof window === 'undefined') return []
  return parseLista(window.localStorage.getItem(keyVias(ingresoId)))
}

export function guardarVias(ingresoId: number, vias: ViaRegistro[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(keyVias(ingresoId), JSON.stringify(vias))
}

export function crearVia(params: {
  ingresoId: number
  tipo: TipoVia
  fechaHora: string
  profesionalId: number
  profesionalNombre: string
}): ViaRegistro {
  const via: ViaRegistro = {
    id: Date.now(),
    tipo: params.tipo,
    fechaHora: params.fechaHora,
    profesionalId: params.profesionalId,
    profesionalNombre: params.profesionalNombre,
    creadoEn: new Date().toISOString(),
  }

  const actuales = leerVias(params.ingresoId)
  guardarVias(params.ingresoId, [via, ...actuales])
  return via
}

export function eliminarVia(ingresoId: number, viaId: number): ViaRegistro[] {
  const siguientes = leerVias(ingresoId).filter((via) => via.id !== viaId)
  guardarVias(ingresoId, siguientes)
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(keyFichaVia(ingresoId, viaId))
  }
  return siguientes
}

export function leerFichaVia(ingresoId: number, viaId: number): ViaFichaNotas {
  if (typeof window === 'undefined') {
    return { item1: '', item2: '', item3: '', item4: '' }
  }

  try {
    const raw = window.localStorage.getItem(keyFichaVia(ingresoId, viaId))
    if (!raw) return { item1: '', item2: '', item3: '', item4: '' }

    const parsed = JSON.parse(raw) as Partial<ViaFichaNotas>
    return {
      item1: typeof parsed.item1 === 'string' ? parsed.item1 : '',
      item2: typeof parsed.item2 === 'string' ? parsed.item2 : '',
      item3: typeof parsed.item3 === 'string' ? parsed.item3 : '',
      item4: typeof parsed.item4 === 'string' ? parsed.item4 : '',
    }
  } catch {
    return { item1: '', item2: '', item3: '', item4: '' }
  }
}

export function guardarFichaVia(ingresoId: number, viaId: number, notas: ViaFichaNotas): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(keyFichaVia(ingresoId, viaId), JSON.stringify(notas))
}

export function etiquetaTipoVia(tipo: TipoVia): string {
  if (tipo === 'SIMPLE') return 'Simple'
  if (tipo === 'DOBLE_LUMEN') return 'Doble lumen'
  return 'Cateter de hemodialisis'
}
