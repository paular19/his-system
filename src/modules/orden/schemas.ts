import { z } from 'zod'

export const OrdenPracticaItemSchema = z.object({
  convenioId: z.number().int().positive(),
  codigoPractica: z.string().min(1).max(8),
  descripcionPractica: z.string().min(1),
  cantidad: z.number().min(0.01),
  tipoFacturacion: z.string().length(1).default('H'),
  importeTotal: z.number().optional(),
  porcentajeCargoPac: z.number().min(0).max(100).optional(),
})

export const CrearOrdenSchema = z.object({
  // Vínculo — al menos uno requerido
  ingresoId: z.number().int().positive().optional(),
  pacienteId: z.number().int().positive().optional(),

  // Datos del paciente en la orden
  nombrePaciente: z.string().min(1).max(50),
  numeroAfiliado: z.string().max(30).default(''),

  // Obra social
  obraSocialId: z.number().int().positive(),
  planId: z.number().int().positive(),
  obraSocialCoseguroId: z.number().int().positive().optional(),
  planCoseguroId: z.number().int().positive().optional(),

  // Profesional prescriptor
  profesionalId: z.number().int().positive(),

  // Tipo de orden
  tipoOrdenCodigo: z.string().min(1).max(3).default('PRA'),

  // Diagnóstico
  descripcionPatologia: z.string().max(300).optional(),

  // Prácticas (mínimo 1)
  items: z.array(OrdenPracticaItemSchema).min(1, 'Debe agregar al menos una práctica'),
})

export type CrearOrdenInput = z.infer<typeof CrearOrdenSchema>
export type OrdenPracticaItemInput = z.infer<typeof OrdenPracticaItemSchema>
