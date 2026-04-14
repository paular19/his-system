import { z } from 'zod'

export const ComprobanteSchema = z.object({
  tipoComprobante: z.enum(['RECIBO_COMUN', 'TICKET_CAJA', 'RECIBO_PROVISORIO']),
  pacienteId: z.number().int().positive().optional().nullable(),
  ingresoId: z.number().int().positive().optional().nullable(),
  monto: z
    .number()
    .positive('El monto debe ser mayor a cero')
    .multipleOf(0.01, 'Máximo 2 decimales'),
  concepto: z.string().min(3, 'El concepto es requerido').max(500).trim(),
  formaPago: z.enum([
    'EFECTIVO',
    'TARJETA_DEBITO',
    'TARJETA_CREDITO',
    'TRANSFERENCIA',
    'CHEQUE',
  ]),
  observaciones: z.string().max(500).trim().optional().nullable(),
})

export type ComprobanteInput = z.infer<typeof ComprobanteSchema>

export const FiltroCajaSchema = z.object({
  fecha: z.coerce.date().optional(),
  tipoComprobante: z
    .enum(['RECIBO_COMUN', 'TICKET_CAJA', 'RECIBO_PROVISORIO'])
    .optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
})

export type FiltroCajaInput = z.infer<typeof FiltroCajaSchema>
