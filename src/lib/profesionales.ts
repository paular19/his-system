export interface ProfesionalBasico {
  id: number
  nombre: string
  matricula?: number | null
}

export function normalizarTextoBusqueda(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function nombreProfesionalParaMostrar(nombre: string): string {
  if (!nombre) return ''

  const sinPrefijo = nombre.trim().replace(/^(dr|dra|doctor|doctora)\.?\s+/i, '')
  const sinEspecialidad = sinPrefijo.replace(/\s*\([^)]*\)\s*/g, ' ')
  const limpio = sinEspecialidad.replace(/\s+/g, ' ').trim()

  // Correccion puntual solicitada por negocio.
  const corregido = limpio.replace(/\bTOMAS\s+ENGEL\s+OSCAR\b/i, 'TOMA ENGEL OSCAR')

  return corregido || nombre.trim()
}

export function coincideBusquedaProfesional(profesional: ProfesionalBasico, termino: string): boolean {
  const q = normalizarTextoBusqueda(termino)
  if (!q) return true

  const nombreLimpio = normalizarTextoBusqueda(nombreProfesionalParaMostrar(profesional.nombre))
  const nombreOriginal = normalizarTextoBusqueda(profesional.nombre)
  const matricula = typeof profesional.matricula === 'number' ? String(profesional.matricula) : ''

  const tokens = q.split(' ').filter(Boolean)
  if (tokens.length === 0) return true

  return tokens.every(
    (token) =>
      nombreLimpio.includes(token) ||
      nombreOriginal.includes(token) ||
      matricula.includes(token)
  )
}
