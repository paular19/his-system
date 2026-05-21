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
  obraSocialId: z.coerce.number().int().positive().optional(),
  sector: z.enum(['TERAPIA_INTENSIVA', 'PISO_2', 'PISO_3']).optional(),
  fechaReferencia: z.coerce.date().optional(),
})

export type BusquedaInternacionInput = z.infer<typeof BusquedaInternacionSchema>

export const ActualizarTratanteInternacionSchema = z.object({
  ingresoId: z.number().int().positive(),
  profesionalTratanteId: z.number().int().positive(),
})

export type ActualizarTratanteInternacionInput = z.infer<typeof ActualizarTratanteInternacionSchema>

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

export const CrearDescartableSchema = z.object({
  ingresoId: z.number().int().positive(),
  nombre: z.string().min(1, 'El nombre es requerido').max(200).trim(),
  cantidad: z.coerce.number().int().min(1).default(1),
  observaciones: z.string().max(500).trim().optional().nullable(),
  profesionalId: z.number().int().positive().optional().nullable(),
})

export type CrearDescartableInput = z.infer<typeof CrearDescartableSchema>

export const ActualizarDescartableSchema = z.object({
  estado: z.enum(['A', 'S', 'F']),
  fechaFin: z.string().datetime().or(z.date()).transform((v) => new Date(v)).optional().nullable(),
  cantidad: z.coerce.number().int().min(1).optional(),
  observaciones: z.string().max(500).trim().optional().nullable(),
})

export type ActualizarDescartableInput = z.infer<typeof ActualizarDescartableSchema>

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
  importeBaseUnitario: z.coerce.number().positive().optional().nullable(),
  matriculaEspecialista: z.number().int().positive().optional().nullable(),
  matriculaAnestesista: z.number().int().positive().optional().nullable(),
})

export type CrearPracticaInput = z.infer<typeof CrearPracticaSchema>

export const CrearCirugiaUrgenciaSchema = z.object({
  ingresoId: z.number().int().positive(),
  pacienteId: z.number().int().positive(),
  fechaCirugia: z.string().min(1),
  horaCirugia: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  obraSocialId: z.number().int().positive().optional().nullable(),
  planId: z.number().int().positive().optional().nullable(),
  obraSocialCoseguroId: z.number().int().positive().optional().nullable(),
  numeroAfiliado: z.string().max(50).trim().optional().nullable(),
  diagnostico: z.string().max(500).trim().optional().nullable(),
  observaciones: z.string().max(2000).trim().optional().nullable(),
  camaId: z.number().int().positive().optional().nullable(),
  practicas: z.array(z.object({
    convenioId: z.number().int().positive().optional().nullable(),
    codigo: z.string().min(1).max(50),
    descripcion: z.string().min(1).max(500),
    cantidad: z.number().int().min(1),
    importeTotal: z.number().min(0).optional().nullable(),
    matriculaEspecialista: z.number().int().positive().optional().nullable(),
    matriculaAnestesista: z.number().int().positive().optional().nullable(),
  })).min(1),
  diferenciales: z.object({
    esFeriado: z.boolean().default(false),
    esNocturna: z.boolean().default(false),
    mismaViaPatologia: z.boolean().default(false),
    diferentesViasPatologia: z.boolean().default(false),
    diferentesViasDiferentesPatologia: z.boolean().default(false),
  }).optional(),
})

export type CrearCirugiaUrgenciaInput = z.infer<typeof CrearCirugiaUrgenciaSchema>

// ============================================
// ALTA / DIAGNÓSTICOS
// ============================================

export const RegistrarAltaInternacionSchema = z.object({
  ingresoId: z.number().int().positive(),
  fechaEgreso: z.coerce.date().optional().nullable(),
  motivoEgresoCodigo: z.string().max(2).trim().optional().nullable(),
  descripcionPatologiaDefinitiva: z.string().max(500).trim().optional().nullable(),
})

export type RegistrarAltaInternacionInput = z.infer<typeof RegistrarAltaInternacionSchema>

export const ActualizarDiagnosticoInternacionSchema = z.object({
  id: z.number().int().positive(),
  ingresoId: z.number().int().positive(),
  patologiaId: z.number().int().positive().optional().nullable(),
  descripcion: z.string().min(1, 'La descripción es requerida').max(500).trim(),
  observaciones: z.string().max(500).trim().optional().nullable(),
  fecha: z.coerce.date().optional().nullable(),
  estado: z.enum(['A', 'I']),
})

export type ActualizarDiagnosticoInternacionInput = z.infer<typeof ActualizarDiagnosticoInternacionSchema>
