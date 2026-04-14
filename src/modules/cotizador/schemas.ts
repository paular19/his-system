import { z } from 'zod'

export const ItemPresupuestoSchema = z.object({
  prestacionId: z.number().int().positive('Prestación requerida'),
  cantidad: z.number().positive().multipleOf(0.01).default(1),
})

export const CrearPresupuestoSchema = z.object({
  pacienteId: z.number().int().positive().optional().nullable(),
  profesionalId: z.number().int().positive().optional().nullable(),
  items: z.array(ItemPresupuestoSchema).min(1, 'Debe incluir al menos una prestación'),
  observaciones: z.string().max(1000).trim().optional().nullable(),
})

export type CrearPresupuestoInput = z.infer<typeof CrearPresupuestoSchema>

export const BusquedaNomencladorSchema = z.object({
  q: z.string().max(200).trim().optional(),
  categoria: z
    .enum(['HONORARIOS', 'QUIROFANO', 'ANESTESIA', 'MATERIAL_DESCARTABLE'])
    .optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
})

export type BusquedaNomencladorInput = z.infer<typeof BusquedaNomencladorSchema>
