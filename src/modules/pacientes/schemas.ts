import { z } from 'zod'

// ============================================
// SCHEMAS ZOD - MÓDULO PACIENTES
// ============================================

const campoTextoOpcional = (maxLen: number) =>
  z.string().max(maxLen).trim().optional().nullable()

const campoTelefono = campoTextoOpcional(50)

export const CrearPacienteSchema = z.object({
  // Identificación
  apellido: z
    .string()
    .min(1, 'El apellido es requerido')
    .max(100)
    .trim(),
  nombre: z
    .string()
    .min(1, 'El nombre es requerido')
    .max(100)
    .trim(),
  tipoDocumento: z
    .enum(['DNI', 'LC ', 'LE ', 'PAS', 'CUI'])
    .optional()
    .nullable(),
  numeroDocumento: z
    .number()
    .int()
    .positive('El número de documento debe ser positivo')
    .optional()
    .nullable(),
  cuil: z
    .string()
    .trim()
    .regex(/^\d{11}$/, 'El CUIL debe tener 11 dígitos sin guiones')
    .optional()
    .nullable(),
  fechaNacimiento: z.coerce.date().optional().nullable(),

  // Demografía
  sexo: z.enum(['M', 'F', 'I']).optional().nullable(),
  estadoCivil: z.enum(['S', 'C', 'D', 'V', 'U']).optional().nullable(),
  paisId: z.number().int().positive().optional().nullable(),
  profesionId: z.number().int().positive().optional().nullable(),

  // Ubicación
  domicilio: campoTextoOpcional(200),
  provinciaId: z.number().int().positive().optional().nullable(),
  localidadId: z.number().int().positive().optional().nullable(),
  barrioId: z.number().int().positive().optional().nullable(),

  // Contacto
  telefonoFijo: campoTelefono,
  telefonoLaboral: campoTelefono,
  celular1: campoTelefono,
  celular2: campoTelefono,
  email: z.string().email('Email inválido').max(100).trim().optional().nullable(),

  // Obra Social
  obraSocialId: z.number().int().positive().optional().nullable(),
  planId: z.number().int().positive().optional().nullable(),
  numeroAfiliado: campoTextoOpcional(50),
  obraSocialCoseguroId: z.number().int().positive().optional().nullable(),

  // Tutor
  nombreTutor: campoTextoOpcional(100),
  telefonoTutor: campoTelefono,
  empleoTutor: campoTextoOpcional(100),

  // Administrativo
  observaciones: z.string().max(5000).trim().optional().nullable(),
})

export type CrearPacienteInput = z.infer<typeof CrearPacienteSchema>

// Para actualizar, todos los campos son opcionales
export const ActualizarPacienteSchema = CrearPacienteSchema.partial()

export type ActualizarPacienteInput = z.infer<typeof ActualizarPacienteSchema>

// Parámetros de búsqueda y listado
export const BusquedaPacienteSchema = z.object({
  q: z.string().max(200).trim().optional(),
  numeroDocumento: z.coerce.number().int().positive().optional(),
  apellido: z.string().max(100).trim().optional(),
  nombre: z.string().max(100).trim().optional(),
  historiaClinica: z.coerce.number().int().positive().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
})

export type BusquedaPacienteInput = z.infer<typeof BusquedaPacienteSchema>
