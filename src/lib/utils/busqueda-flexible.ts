export function normalizarTextoBusquedaFlexible(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function obtenerTokensBusquedaFlexible(value: string | null | undefined): string[] {
  const normalizado = normalizarTextoBusquedaFlexible(value)
  if (!normalizado) return []
  return normalizado.split(' ').filter(Boolean)
}

export function coincideTextoConBusquedaFlexible(
  texto: string | null | undefined,
  busqueda: string | null | undefined
): boolean {
  const tokens = obtenerTokensBusquedaFlexible(busqueda)
  if (tokens.length === 0) return false

  const textoNormalizado = normalizarTextoBusquedaFlexible(texto)
  return tokens.every((token) => textoNormalizado.includes(token))
}
