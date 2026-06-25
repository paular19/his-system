export type SubitemCodigo = 'GA' | 'HE' | 'HA' | 'A1' | 'A2' | 'A3'

export type ComponenteValoresSubitem = {
  valorEspecialista: number | null
  valorAyudante: number | null
  valorAnestesista: number | null
  valorGastos: number | null
}

export type ComponenteSeleccionSubitem = {
  especialista: number
  ayudante: number
  anestesista: number
  gastos: number
}

export function obtenerSubitemsSeleccionados(
  valores: ComponenteValoresSubitem,
  seleccion: ComponenteSeleccionSubitem
): SubitemCodigo[] {
  const subitems: SubitemCodigo[] = []

  if (seleccion.gastos > 0 && valores.valorGastos != null) subitems.push('GA')
  if (seleccion.especialista > 0 && valores.valorEspecialista != null) subitems.push('HE')
  if (seleccion.anestesista > 0 && valores.valorAnestesista != null) subitems.push('HA')

  if (seleccion.ayudante > 0 && valores.valorAyudante != null) {
    const cantidadAyudantes = Math.min(seleccion.ayudante, 3)
    for (let i = 1; i <= cantidadAyudantes; i += 1) {
      subitems.push((`A${i}`) as SubitemCodigo)
    }
  }

  return subitems
}

export function valorUnitarioPorSubitem(
  subitem: SubitemCodigo,
  valores: ComponenteValoresSubitem
): number | null {
  if (subitem === 'HE') return valores.valorEspecialista
  if (subitem === 'HA') return valores.valorAnestesista
  if (subitem === 'GA') return valores.valorGastos
  return valores.valorAyudante
}

export function esSubitemEspecialista(subitem: SubitemCodigo): boolean {
  return subitem === 'HE'
}

export function esSubitemAnestesista(subitem: SubitemCodigo): boolean {
  return subitem === 'HA'
}
