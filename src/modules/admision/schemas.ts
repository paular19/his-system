import { z } from 'zod'

// ============================================
// SCHEMAS NUEVOS — módulo completo de admisión
// ============================================

// Base schema sin refinement - se usa para omit/extend
const CrearIngresoBaseSchema = z.object({
  pacienteId: z.number().int().positive('Paciente requerido'),
  tipoIngresoCodigo: z.string().min(1).max(3, 'Tipo de ingreso requerido'),
  subtipoAdmisionCodigo: z.string().min(1).max(3, 'Tipo de admisión requerido'),
  fechaIngreso: z.coerce.date().optional(),
  fechaEgresoPrevista: z.coerce.date().optional().nullable(),
  tipoInternacionCodigo: z.string().max(3).optional().nullable(),
  profesionalGuardiaId: z.number().int().positive().optional().nullable(),
  profesionalTratanteId: z.number().int().positive().optional().nullable(),
  camaId: z.number().int().positive().optional().nullable(),
  sedeId: z.number().int().positive().optional().nullable(),
  obraSocialId: z.number().int().positive().optional().nullable(),
  planId: z.number().int().positive().optional().nullable(),
  numeroAfiliado: z.string().max(50).trim().optional().nullable(),
  descripcionPatologia: z.string().max(500).trim().optional().nullable(),
  observaciones: z.string().max(2000).trim().optional().nullable(),
  // Campos específicos para turnos/práctica
  profesionalIdTurno: z.number().int().positive().optional().nullable(),
  fechaTurno: z.coerce.date().optional().nullable(),
  practicaCodigo: z.string().max(50).trim().optional().nullable(),
  // Campos específicos para derivación
  centroDerivante: z.string().max(200).trim().optional().nullable(),
  profesionalDerivanteNombre: z.string().max(200).trim().optional().nullable(),
  motivoDerivacion: z.string().max(500).trim().optional().nullable(),
  diagnosticoDerivacion: z.string().max(500).trim().optional().nullable(),
  // Campos específicos para indicación médica
  profesionalIndicadorId: z.number().int().positive().optional().nullable(),
  tipoIndicacion: z.string().max(100).trim().optional().nullable(),
  descripcionIndicacion: z.string().max(500).trim().optional().nullable(),
})

export const CrearIngresoSchema = CrearIngresoBaseSchema.refine(
  (data) => {
    // Si hay planId, debe haber obraSocialId
    if (data.planId && !data.obraSocialId) {
      return false
    }
    // Si hay obraSocialId, planId es opcional
    return true
  },
  {
    message: 'Si selecciona un plan, debe seleccionar una obra social',
    path: ['planId'],
  }
)

export type CrearIngresoInput = z.infer<typeof CrearIngresoSchema>

export const ActualizarIngresoSchema = CrearIngresoBaseSchema.omit({
  pacienteId: true,
  tipoIngresoCodigo: true,
}).extend({
  estado: z.enum(['A', 'E', 'P', 'X']).optional(),
  motivoEgresoCodigo: z.string().max(2).optional().nullable(),
  fechaEgreso: z.coerce.date().optional().nullable(),
  descripcionPatologiaDefinitiva: z.string().max(500).trim().optional().nullable(),
}).refine(
  (data) => {
    // Si hay planId, debe haber obraSocialId
    if (data.planId && !data.obraSocialId) {
      return false
    }
    return true
  },
  {
    message: 'Si selecciona un plan, debe seleccionar una obra social',
    path: ['planId'],
  }
)

export type ActualizarIngresoInput = z.infer<typeof ActualizarIngresoSchema>

export const BusquedaIngresoSchema = z.object({
  q: z.string().max(200).trim().optional(),
  tipoIngresoCodigo: z.string().max(3).optional(),
  estado: z.string().max(1).optional(),
  fechaDesde: z.coerce.date().optional(),
  fechaHasta: z.coerce.date().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
})

export type BusquedaIngresoInput = z.infer<typeof BusquedaIngresoSchema>

export const DiagnosticoIngresoSchema = z.object({
  ingresoId: z.number().int().positive(),
  patologiaId: z.number().int().positive().optional().nullable(),
  descripcion: z
    .string()
    .min(1, 'La descripción del diagnóstico es requerida')
    .max(500)
    .trim(),
  observaciones: z.string().max(500).trim().optional().nullable(),
  fecha: z.coerce.date().optional(),
  estado: z.enum(['A', 'I']).default('A'),
})

export type DiagnosticoIngresoInput = z.infer<typeof DiagnosticoIngresoSchema>

export const MovimientoIngresoSchema = z.object({
  ingresoId: z.number().int().positive(),
  pacienteId: z.number().int().positive().optional().nullable(),
  tipoMovimientoCodigo: z.string().min(1).max(3),
  fecha: z.coerce.date().optional(),
  fechaVencimiento: z.coerce.date().optional().nullable(),
  concepto: z.string().max(200).trim().optional().nullable(),
  signo: z.number().int().min(-1).max(1).default(1),
  importe: z.number().min(0).default(0),
  saldo: z.number().default(0),
  estado: z.string().max(1).default('A'),
})

export type MovimientoIngresoInput = z.infer<typeof MovimientoIngresoSchema>

// ============================================
// SCHEMAS LEGADOS — se mantienen para compatibilidad
// ============================================

export const AdmisionGuardiaSchema = z.object({
  pacienteId: z.number().int().positive('Paciente requerido'),
  motivoConsulta: z
    .string()
    .min(3, 'El motivo de consulta es requerido')
    .max(500)
    .trim(),
  prioridad: z.enum(['NORMAL', 'URGENTE', 'EMERGENCIA']).default('NORMAL'),
  profesionalGuardiaId: z.number().int().positive().optional().nullable(),
  obraSocialId: z.number().int().positive().optional().nullable(),
  planId: z.number().int().positive().optional().nullable(),
  numeroAfiliado: z.string().max(50).trim().optional().nullable(),
  observaciones: z.string().max(2000).trim().optional().nullable(),
})

export type AdmisionGuardiaInput = z.infer<typeof AdmisionGuardiaSchema>

export const AdmisionInternacionSchema = z.object({
  pacienteId: z.number().int().positive('Paciente requerido'),
  diagnosticoIngreso: z
    .string()
    .min(3, 'El diagnóstico de ingreso es requerido')
    .max(500)
    .trim(),
  profesionalTratanteId: z.number().int().positive('Profesional tratante requerido'),
  camaId: z.number().int().positive().optional().nullable(),
  obraSocialId: z.number().int().positive().optional().nullable(),
  planId: z.number().int().positive().optional().nullable(),
  numeroAfiliado: z.string().max(50).trim().optional().nullable(),
  fechaEgresoPrevista: z.coerce.date().optional().nullable(),
  observaciones: z.string().max(2000).trim().optional().nullable(),
})

export type AdmisionInternacionInput = z.infer<typeof AdmisionInternacionSchema>
