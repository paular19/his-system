export const REQUISITOS_DOCUMENTALES = [
  { key: 'DOCUMENTO', label: 'Documento' },
  { key: 'CARNET', label: 'Carnet' },
  { key: 'RECIBO_DE_SUELDO', label: 'Recibo de sueldo' },
  { key: 'ORDEN_DE_CONSULTA', label: 'Orden de consulta' },
  { key: 'KIT_DE_CIRUGIA', label: 'Kit de cirugia' },
  { key: 'CONSENTIMIENTO_QUIRURGICO', label: 'Consentimiento quirurgico' },
  { key: 'OBSERVACIONES', label: 'Observaciones' },
  { key: 'DEPOSITO_DE_INGRESO', label: 'Deposito de ingreso' },
  { key: 'AVISO_DE_INTERNACION', label: 'Aviso de internacion' },
] as const

export type RequisitoDocumentalKey = (typeof REQUISITOS_DOCUMENTALES)[number]['key']

export type ChecklistDocumental = Record<RequisitoDocumentalKey, boolean>

export interface ArmRegistroMeta {
  id: string
  fechaIngreso: string
  fechaEgreso: string | null
  profesionalId: number | null
}

export interface OxigenoterapiaRegistroMeta {
  id: string
  fechaIngreso: string
  fechaEgreso: string | null
  litros: number | null
  profesionalId: number | null
}

export interface DepositoRegistroMeta {
  id: string
  fecha: string
  importe: number
  observaciones: string | null
}

export interface ObservacionesInternacionMeta {
  checklistDocumental: ChecklistDocumental
  armRegistros: ArmRegistroMeta[]
  oxigenoterapiaRegistros: OxigenoterapiaRegistroMeta[]
  depositosRegistros: DepositoRegistroMeta[]
}

export interface ObservacionesInternacionParseResult extends ObservacionesInternacionMeta {
  observaciones: string | null
}

const META_MARKER = '[HIS_META_INTERNACION_V1]'

function crearChecklistVacio(): ChecklistDocumental {
  return {
    DOCUMENTO: false,
    CARNET: false,
    RECIBO_DE_SUELDO: false,
    ORDEN_DE_CONSULTA: false,
    KIT_DE_CIRUGIA: false,
    CONSENTIMIENTO_QUIRURGICO: false,
    OBSERVACIONES: false,
    DEPOSITO_DE_INGRESO: false,
    AVISO_DE_INTERNACION: false,
  }
}

function normalizarFechaIso(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw) return null

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null

  return parsed.toISOString()
}

function normalizarRegistroArm(value: unknown, index: number): ArmRegistroMeta | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const fechaIngreso = normalizarFechaIso(row.fechaIngreso)
  if (!fechaIngreso) return null

  const fechaEgreso = normalizarFechaIso(row.fechaEgreso)
  const profesionalId =
    typeof row.profesionalId === 'number' && Number.isFinite(row.profesionalId)
      ? Math.floor(row.profesionalId)
      : null

  return {
    id:
      typeof row.id === 'string' && row.id.trim().length > 0
        ? row.id.trim()
        : `arm-${index + 1}`,
    fechaIngreso,
    fechaEgreso,
    profesionalId: profesionalId != null && profesionalId > 0 ? profesionalId : null,
  }
}

function normalizarRegistroOxigenoterapia(
  value: unknown,
  index: number
): OxigenoterapiaRegistroMeta | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const fechaIngreso = normalizarFechaIso(row.fechaIngreso)
  if (!fechaIngreso) return null

  const fechaEgreso = normalizarFechaIso(row.fechaEgreso)
  const profesionalId =
    typeof row.profesionalId === 'number' && Number.isFinite(row.profesionalId)
      ? Math.floor(row.profesionalId)
      : null
  const litros =
    typeof row.litros === 'number' && Number.isFinite(row.litros)
      ? Number(row.litros)
      : null

  return {
    id:
      typeof row.id === 'string' && row.id.trim().length > 0
        ? row.id.trim()
        : `oxi-${index + 1}`,
    fechaIngreso,
    fechaEgreso,
    litros,
    profesionalId: profesionalId != null && profesionalId > 0 ? profesionalId : null,
  }
}

function normalizarRegistroDeposito(
  value: unknown,
  index: number
): DepositoRegistroMeta | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const fecha = normalizarFechaIso(row.fecha)
  if (!fecha) return null

  const importeRaw =
    typeof row.importe === 'number'
      ? row.importe
      : typeof row.importe === 'string'
        ? Number(row.importe)
        : NaN

  if (!Number.isFinite(importeRaw) || importeRaw < 0) return null

  const observaciones =
    typeof row.observaciones === 'string' && row.observaciones.trim().length > 0
      ? row.observaciones.trim()
      : null

  return {
    id:
      typeof row.id === 'string' && row.id.trim().length > 0
        ? row.id.trim()
        : `dep-${index + 1}`,
    fecha,
    importe: Number(importeRaw),
    observaciones,
  }
}

function normalizarChecklist(value: unknown): ChecklistDocumental {
  const base = crearChecklistVacio()
  if (!value || typeof value !== 'object') return base

  const data = value as Record<string, unknown>
  for (const item of REQUISITOS_DOCUMENTALES) {
    base[item.key] = data[item.key] === true
  }

  return base
}

function normalizarMeta(value: unknown): ObservacionesInternacionMeta {
  if (!value || typeof value !== 'object') {
    return {
      checklistDocumental: crearChecklistVacio(),
      armRegistros: [],
      oxigenoterapiaRegistros: [],
      depositosRegistros: [],
    }
  }

  const row = value as Record<string, unknown>
  const armRegistrosRaw = Array.isArray(row.armRegistros) ? row.armRegistros : []
  const oxigenoterapiaRegistrosRaw = Array.isArray(row.oxigenoterapiaRegistros)
    ? row.oxigenoterapiaRegistros
    : []
  const depositosRegistrosRaw = Array.isArray(row.depositosRegistros)
    ? row.depositosRegistros
    : []

  return {
    checklistDocumental: normalizarChecklist(row.checklistDocumental),
    armRegistros: armRegistrosRaw
      .map((item, index) => normalizarRegistroArm(item, index))
      .filter((item): item is ArmRegistroMeta => item !== null),
    oxigenoterapiaRegistros: oxigenoterapiaRegistrosRaw
      .map((item, index) => normalizarRegistroOxigenoterapia(item, index))
      .filter((item): item is OxigenoterapiaRegistroMeta => item !== null),
    depositosRegistros: depositosRegistrosRaw
      .map((item, index) => normalizarRegistroDeposito(item, index))
      .filter((item): item is DepositoRegistroMeta => item !== null),
  }
}

function recortarTexto(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? ''
  return normalized.length > 0 ? normalized : null
}

export function parseObservacionesInternacion(
  rawValue: string | null | undefined
): ObservacionesInternacionParseResult {
  const raw = rawValue ?? ''
  if (!raw.trim()) {
    return {
      observaciones: null,
      checklistDocumental: crearChecklistVacio(),
      armRegistros: [],
      oxigenoterapiaRegistros: [],
      depositosRegistros: [],
    }
  }

  const markerIndex = raw.indexOf(META_MARKER)
  if (markerIndex === -1) {
    return {
      observaciones: recortarTexto(raw),
      checklistDocumental: crearChecklistVacio(),
      armRegistros: [],
      oxigenoterapiaRegistros: [],
      depositosRegistros: [],
    }
  }

  const textoLibre = recortarTexto(raw.slice(0, markerIndex))
  const bloqueMeta = raw.slice(markerIndex + META_MARKER.length).trim()

  try {
    const metaRaw = JSON.parse(bloqueMeta)
    const meta = normalizarMeta(metaRaw)

    return {
      observaciones: textoLibre,
      ...meta,
    }
  } catch {
    return {
      observaciones: recortarTexto(raw),
      checklistDocumental: crearChecklistVacio(),
      armRegistros: [],
      oxigenoterapiaRegistros: [],
      depositosRegistros: [],
    }
  }
}

export function tieneChecklistCompleto(checklist: ChecklistDocumental): boolean {
  return REQUISITOS_DOCUMENTALES.every((item) => checklist[item.key])
}

function tieneMetaNoVacia(meta: ObservacionesInternacionMeta): boolean {
  const checklistTieneAlgo = REQUISITOS_DOCUMENTALES.some((item) => meta.checklistDocumental[item.key])
  return (
    checklistTieneAlgo ||
    meta.armRegistros.length > 0 ||
    meta.oxigenoterapiaRegistros.length > 0 ||
    meta.depositosRegistros.length > 0
  )
}

export function serializarObservacionesInternacion(data: {
  observaciones: string | null | undefined
  checklistDocumental?: Partial<ChecklistDocumental> | null
  armRegistros?: Array<{
    id?: string | null
    fechaIngreso: Date | string
    fechaEgreso?: Date | string | null
    profesionalId?: number | null
  }> | null
  oxigenoterapiaRegistros?: Array<{
    id?: string | null
    fechaIngreso: Date | string
    fechaEgreso?: Date | string | null
    litros?: number | null
    profesionalId?: number | null
  }> | null
  depositosRegistros?: Array<{
    id?: string | null
    fecha: Date | string
    importe: number
    observaciones?: string | null
  }> | null
}): string | null {
  const observaciones = recortarTexto(data.observaciones)

  const checklistNormalizado = {
    ...crearChecklistVacio(),
    ...(data.checklistDocumental ?? {}),
  }

  const armRegistros = (data.armRegistros ?? [])
    .map((item, index) =>
      normalizarRegistroArm(
        {
          id: item.id,
          fechaIngreso: item.fechaIngreso,
          fechaEgreso: item.fechaEgreso,
          profesionalId: item.profesionalId,
        },
        index
      )
    )
    .filter((item): item is ArmRegistroMeta => item !== null)

  const oxigenoterapiaRegistros = (data.oxigenoterapiaRegistros ?? [])
    .map((item, index) =>
      normalizarRegistroOxigenoterapia(
        {
          id: item.id,
          fechaIngreso: item.fechaIngreso,
          fechaEgreso: item.fechaEgreso,
          litros: item.litros,
          profesionalId: item.profesionalId,
        },
        index
      )
    )
    .filter((item): item is OxigenoterapiaRegistroMeta => item !== null)

  const depositosRegistros = (data.depositosRegistros ?? [])
    .map((item, index) =>
      normalizarRegistroDeposito(
        {
          id: item.id,
          fecha: item.fecha,
          importe: item.importe,
          observaciones: item.observaciones,
        },
        index
      )
    )
    .filter((item): item is DepositoRegistroMeta => item !== null)

  const meta: ObservacionesInternacionMeta = {
    checklistDocumental: checklistNormalizado,
    armRegistros,
    oxigenoterapiaRegistros,
    depositosRegistros,
  }

  if (!tieneMetaNoVacia(meta)) {
    return observaciones
  }

  const metaJson = JSON.stringify(meta)
  if (!observaciones) {
    return `${META_MARKER}\n${metaJson}`
  }

  return `${observaciones}\n\n${META_MARKER}\n${metaJson}`
}

export function limpiarBloqueMetaInternacion(rawValue: string | null | undefined): string | null {
  return parseObservacionesInternacion(rawValue).observaciones
}