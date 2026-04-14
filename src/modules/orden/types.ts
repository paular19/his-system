// ============================================
// TIPOS — MÓDULO ORDEN / AUTORIZACIÓN
// ============================================

export type OrdenPracticaItem = {
  puestoNumero: number
  ordenNumero: number
  item: number
  convenioId: number
  codigoPractica: string
  descripcionPractica: string
  cantidad: number
  tipoFacturacion: string
  numeroAutorizacion: string | null
  importeTotal: number | null
  porcentajeCargoPac: number | null
  fecha: Date
}

export type OrdenConItems = {
  puestoNumero: number
  numero: number
  ingresoId: number | null
  ingresoNumero: number | null
  ingresoTipoCodigo: string | null
  pacienteId: number | null
  nombrePaciente: string
  numeroAfiliado: string
  obraSocialId: number
  planId: number
  obraSocialCoseguroId: number | null
  planCoseguroId: number | null
  profesionalId: number
  tipoOrdenCodigo: string
  descripcion: string | null
  descripcionPatologia: string | null
  fechaEmision: Date
  fechaPedido: Date
  importeTotal: number | null
  estado: string
  usuarioRegistro: string
  items: OrdenPracticaItem[]
  obraSocial: { id: number; nombre: string } | null
  plan: { id: number; descripcion: string } | null
  profesional: { id: number; nombre: string; matricula: number | null } | null
  tipoOrden: { codigo: string; descripcion: string } | null
}

export type OrdenListItem = {
  puestoNumero: number
  numero: number
  nombrePaciente: string
  obraSocialNombre: string
  planDescripcion: string
  fechaEmision: Date
  estado: string
  cantidadItems: number
}

export type NomencladorPracticaItem = {
  convenioId: number
  codigo: string
  descripcion: string
}

// Formato de número de orden para mostrar en pantalla
export function formatearNumeroOrden(puestoNumero: number, numero: number, item?: number): string {
  const base = `${puestoNumero.toString().padStart(4, '0')}-${numero.toString().padStart(8, '0')}`
  if (item !== undefined) return `${base}-${item.toString().padStart(2, '0')}`
  return base
}

// Número de autorización (15 dígitos): puesto(4) + numero(8) + item(3)
export function generarCodigoBarras(puestoNumero: number, numero: number, item: number): string {
  return (
    puestoNumero.toString().padStart(4, '0') +
    numero.toString().padStart(8, '0') +
    item.toString().padStart(3, '0')
  )
}
