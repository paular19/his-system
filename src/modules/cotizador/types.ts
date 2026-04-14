// Módulo Cotizador de Prestaciones

export const CATEGORIA_PRESTACION = {
  HONORARIOS: 'HONORARIOS',
  QUIROFANO: 'QUIROFANO',
  ANESTESIA: 'ANESTESIA',
  MATERIAL_DESCARTABLE: 'MATERIAL_DESCARTABLE',
} as const

export type CategoriaPrestacion =
  (typeof CATEGORIA_PRESTACION)[keyof typeof CATEGORIA_PRESTACION]

export interface ItemPresupuesto {
  prestacionId: number
  codigo: string
  descripcion: string
  categoria: CategoriaPrestacion
  cantidad: number
  valorUnitario: number
  subtotal: number
}

export interface Presupuesto {
  pacienteId?: number
  profesionalId?: number
  fecha: Date
  items: ItemPresupuesto[]
  total: number
  observaciones?: string
}
