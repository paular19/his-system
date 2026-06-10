export interface ProfesionalBasico {
  id: number
  nombre: string
  matricula?: number | null
}

function normalizarTextoBusqueda(value: string): string {
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

  return limpio || nombre.trim()
}

export function coincideBusquedaProfesional(profesional: ProfesionalBasico, termino: string): boolean {
  const q = normalizarTextoBusqueda(termino)
  if (!q) return true

  const nombreLimpio = normalizarTextoBusqueda(nombreProfesionalParaMostrar(profesional.nombre))
  const nombreOriginal = normalizarTextoBusqueda(profesional.nombre)
  const matricula = typeof profesional.matricula === 'number' ? String(profesional.matricula) : ''

  return nombreLimpio.includes(q) || nombreOriginal.includes(q) || matricula.includes(q)
}
