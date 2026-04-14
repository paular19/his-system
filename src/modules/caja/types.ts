// Módulo Caja - Tipos base

export const TIPO_COMPROBANTE = {
  RECIBO_COMUN: 'RECIBO_COMUN',
  TICKET_CAJA: 'TICKET_CAJA',
  RECIBO_PROVISORIO: 'RECIBO_PROVISORIO',
} as const

export const FORMA_PAGO = {
  EFECTIVO: 'EFECTIVO',
  TARJETA_DEBITO: 'TARJETA_DEBITO',
  TARJETA_CREDITO: 'TARJETA_CREDITO',
  TRANSFERENCIA: 'TRANSFERENCIA',
  CHEQUE: 'CHEQUE',
} as const

export type TipoComprobante = (typeof TIPO_COMPROBANTE)[keyof typeof TIPO_COMPROBANTE]
export type FormaPago = (typeof FORMA_PAGO)[keyof typeof FORMA_PAGO]

export interface ComprobanteInput {
  tipoComprobante: TipoComprobante
  pacienteId?: number
  ingresoId?: number
  monto: number
  concepto: string
  formaPago: FormaPago
  observaciones?: string
}

export interface ResumenCajaDiaria {
  fecha: Date
  totalEfectivo: number
  totalTarjeta: number
  totalTransferencia: number
  totalGeneral: number
  cantidadComprobantes: number
}
