import { z } from 'zod'

export const ActualizarCamaSchema = z.object({
  estado: z.enum(['DISPONIBLE', 'OCUPADA', 'RESERVADA', 'MANTENIMIENTO']),
  observaciones: z.string().max(500).trim().optional().nullable(),
})

export type ActualizarCamaInput = z.infer<typeof ActualizarCamaSchema>

export const FiltroDisponibilidadSchema = z.object({
  sector: z.enum(['TERAPIA_INTENSIVA', 'PISO_2', 'PISO_3']).optional(),
})

export type FiltroDisponibilidadInput = z.infer<typeof FiltroDisponibilidadSchema>

export const BusquedaInternacionSchema = z.object({
  pagina: z.coerce.number().int().positive().default(1),
  porPagina: z.coerce.number().int().positive().max(100).default(20),
  q: z.string().trim().optional(),
  sector: z.enum(['TERAPIA_INTENSIVA', 'PISO_2', 'PISO_3']).optional(),
})

export type BusquedaInternacionInput = z.infer<typeof BusquedaInternacionSchema>
