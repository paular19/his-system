/**
 * Normalizador unico del archivo historico.
 *
 * Lo usan el import (para llenar la columna `busqueda`) y el buscador (para
 * normalizar lo que tipea el usuario). Tienen que ser exactamente el mismo
 * codigo: si divergen, hay terminos que dejan de matchear en silencio.
 */
export function normalizarBusqueda(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
