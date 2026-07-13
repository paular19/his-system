const CLASIFICACION_REGEX = /^(GA|HE|HA|HP|A[1-3])(\+(GA|HE|HA|HP|A[1-3]))*$/

const ORDEN_CODIGOS: Record<string, number> = {
  HE: 1,
  HA: 2,
  GA: 3,
  HP: 4,
  A1: 5,
  A2: 6,
  A3: 7,
}

const TITULO_POR_CODIGO: Record<string, string> = {
  HE: 'HONORARIO ESPECIALISTA',
  HA: 'HONORARIO ANESTESISTA',
  GA: 'DERECHOS',
  HP: 'HONORARIO PATOLOGO',
  A1: 'AYUDANTE 1',
  A2: 'AYUDANTE 2',
  A3: 'AYUDANTE 3',
}

export function normalizarClasificacionAgrupacion(
  value: string | null | undefined
): string | null {
  if (!value) return null
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
  if (!normalized) return null
  if (!CLASIFICACION_REGEX.test(normalized)) return null

  const tokens = Array.from(new Set(normalized.split('+')))
  tokens.sort((a, b) => (ORDEN_CODIGOS[a] ?? 99) - (ORDEN_CODIGOS[b] ?? 99))
  return tokens.join('+')
}

export function contieneClasificacion(
  clasificacion: string | null | undefined,
  codigo: 'GA' | 'HE' | 'HA' | 'HP' | 'A1' | 'A2' | 'A3'
): boolean {
  const normalized = normalizarClasificacionAgrupacion(clasificacion)
  if (!normalized) return false
  return normalized.split('+').includes(codigo)
}

export function tituloDesdeClasificacion(
  clasificacion: string | null | undefined
): string {
  const normalized = normalizarClasificacionAgrupacion(clasificacion)
  if (!normalized) return 'HONORARIOS'

  return normalized
    .split('+')
    .map((token) => TITULO_POR_CODIGO[token] ?? token)
    .join(' + ')
}

export function clasificacionDesdeIncluyeCodigo(
  incluyeCodigo: string | null | undefined
): string | null {
  if (!incluyeCodigo) return null
  const normalized = incluyeCodigo
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
  if (!normalized) return null

  const permitidosIncluye = /^(GA|HE|HA|HP|A[1-3])(\+(GA|HE|HA|HP|A[1-3]))*$/
  if (!permitidosIncluye.test(normalized)) return null

  return normalizarClasificacionAgrupacion(normalized)
}
