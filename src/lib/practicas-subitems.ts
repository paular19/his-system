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

function normalizarCantidadSeleccion(cantidad: number, maximo?: number): number {
  if (!Number.isFinite(cantidad) || cantidad <= 0) return 0
  const normalizada = Math.floor(cantidad)
  return typeof maximo === 'number' ? Math.min(normalizada, maximo) : normalizada
}

export function obtenerSubitemsSeleccionados(
  valores: ComponenteValoresSubitem,
  seleccion: ComponenteSeleccionSubitem
): SubitemCodigo[] {
  const subitems: SubitemCodigo[] = []

  if (valores.valorGastos != null) {
    const cantidadGastos = normalizarCantidadSeleccion(seleccion.gastos)
    for (let i = 0; i < cantidadGastos; i += 1) subitems.push('GA')
  }

  if (valores.valorEspecialista != null) {
    const cantidadEspecialista = normalizarCantidadSeleccion(seleccion.especialista)
    for (let i = 0; i < cantidadEspecialista; i += 1) subitems.push('HE')
  }

  if (valores.valorAnestesista != null) {
    const cantidadAnestesista = normalizarCantidadSeleccion(seleccion.anestesista)
    for (let i = 0; i < cantidadAnestesista; i += 1) subitems.push('HA')
  }

  if (seleccion.ayudante > 0 && valores.valorAyudante != null) {
    const cantidadAyudantes = normalizarCantidadSeleccion(seleccion.ayudante, 3)
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
