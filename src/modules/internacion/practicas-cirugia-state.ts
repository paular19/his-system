export function esEstadoPracticaCirugiaVisible(estado?: string | null): boolean {
  if (estado == null) return true
  return estado.trim().toUpperCase() !== 'X'
}
