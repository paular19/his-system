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

// ============================================
// EVOLUCIÓN CLÍNICA
// ============================================

export const CrearEvolucionSchema = z.object({
  ingresoId: z.number().int().positive(),
  tipo: z.enum(['MEDICA', 'ENFERMERIA', 'KINESIO', 'NUTRICION', 'SERVICIO_SOCIAL', 'PSICOLOGIA', 'OTRO']),
  descripcion: z.string().min(1, 'La descripción es requerida').max(10000).trim(),
  tensionArterial: z.string().max(20).trim().optional().nullable(),
  frecuenciaCardiaca: z.coerce.number().int().min(0).max(300).optional().nullable(),
  frecuenciaRespiratoria: z.coerce.number().int().min(0).max(100).optional().nullable(),
  temperatura: z.coerce.number().min(30).max(45).optional().nullable(),
  saturacionO2: z.coerce.number().int().min(0).max(100).optional().nullable(),
  profesionalId: z.number().int().positive().optional().nullable(),
})

export type CrearEvolucionInput = z.infer<typeof CrearEvolucionSchema>

// ============================================
// MEDICACIÓN
// ============================================

export const CrearMedicacionSchema = z.object({
  ingresoId: z.number().int().positive(),
  nombre: z.string().min(1, 'El nombre es requerido').max(200).trim(),
  dosis: z.string().max(100).trim().optional().nullable(),
  viaAdministracion: z.string().max(50).trim().optional().nullable(),
  frecuencia: z.string().max(100).trim().optional().nullable(),
  fechaInicio: z.string().datetime().or(z.date()).transform((v) => new Date(v)),
  fechaFin: z.string().datetime().or(z.date()).transform((v) => new Date(v)).optional().nullable(),
  observaciones: z.string().max(500).trim().optional().nullable(),
  profesionalId: z.number().int().positive().optional().nullable(),
})

export type CrearMedicacionInput = z.infer<typeof CrearMedicacionSchema>

export const ActualizarMedicacionSchema = z.object({
  estado: z.enum(['A', 'S', 'F']),
  fechaFin: z.string().datetime().or(z.date()).transform((v) => new Date(v)).optional().nullable(),
  observaciones: z.string().max(500).trim().optional().nullable(),
})

export type ActualizarMedicacionInput = z.infer<typeof ActualizarMedicacionSchema>

// ============================================
// TRANSFERENCIA DE CAMA
// ============================================

export const TransferirCamaSchema = z.object({
  ingresoId: z.number().int().positive(),
  camaDestinoId: z.number().int().positive(),
  motivo: z.string().max(500).trim().optional().nullable(),
  profesionalId: z.number().int().positive().optional().nullable(),
})

export type TransferirCamaInput = z.infer<typeof TransferirCamaSchema>

// ============================================
// PRÁCTICAS
// ============================================

export const CrearPracticaSchema = z.object({
  ingresoId: z.number().int().positive(),
  convenioId: z.number().int().min(0),
  codigoPractica: z.string().min(1).max(8).trim().toUpperCase(),
  descripcionPractica: z.string().max(200).trim().optional().nullable(),
  fecha: z.string().datetime().or(z.date()).transform((v) => new Date(v)),
  cantidad: z.coerce.number().positive().default(1),
  numeroAutorizacion: z.string().max(50).trim().optional().nullable(),
  facturable: z.boolean().default(true),
})

export type CrearPracticaInput = z.infer<typeof CrearPracticaSchema>
