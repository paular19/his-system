import { z } from 'zod'

// ============================================
// SCHEMAS ZOD - MÓDULO PACIENTES
// ============================================

const campoTextoOpcional = (maxLen: number) =>
  z.string().max(maxLen).trim().optional().nullable()

const campoTelefono = campoTextoOpcional(50)
const tiposDocumento = ['DNI', 'LC ', 'LE ', 'PAS', 'CUI'] as const

const numeroDocumentoSchema = z.preprocess(
  (value) => {
    if (value === '' || value === null || value === undefined) return undefined
    if (typeof value === 'number' && Number.isNaN(value)) return undefined
    return value
  },
  z
    .number()
    .int()
    .positive('El numero de documento debe ser positivo')
    .max(99_999_999, 'El numero de documento no puede superar 8 digitos')
    .optional()
    .nullable()
)

const cuilSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined) return value
    if (typeof value !== 'string') return value
    const normalizado = value.replace(/\D/g, '')
    return normalizado.length === 0 ? undefined : normalizado
  },
  z
    .string()
    .regex(/^\d{10,11}$/, 'El CUIL debe tener 10 u 11 digitos sin guiones')
    .optional()
    .nullable()
)

const fechaNacimientoOpcionalSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.coerce.date().optional().nullable()
)

const BasePacienteSchema = z.object({
  // Identificación
  apellido: z
    .string()
    .min(1, 'El apellido es requerido')
    .max(100)
    .trim()
    .optional(),
  nombre: z
    .string()
    .min(1, 'El nombre es requerido')
    .max(100)
    .trim()
    .optional(),
  tipoDocumento: z.enum(tiposDocumento).optional().nullable(),
  numeroDocumento: numeroDocumentoSchema,
  cuil: cuilSchema,
  fechaNacimiento: fechaNacimientoOpcionalSchema,

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
  email: z.string().email('Email invalido').max(100).trim().optional().nullable(),

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

export const CrearPacienteSchema = BasePacienteSchema.extend({
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
  tipoDocumento: z.enum(tiposDocumento, {
    required_error: 'El tipo de documento es requerido',
    invalid_type_error: 'El tipo de documento es requerido',
  }),
  fechaNacimiento: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.date({
      required_error: 'La fecha de nacimiento es requerida',
      invalid_type_error: 'La fecha de nacimiento es invalida',
    })
  ),
  sexo: z.enum(['M', 'F', 'I'], {
    required_error: 'El sexo es requerido',
    invalid_type_error: 'El sexo es requerido',
  }),
}).superRefine((data, ctx) => {
  if (!data.numeroDocumento && !data.cuil) {
    const mensaje = 'Debe informar DNI o CUIL para identificar al paciente'
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['numeroDocumento'],
      message: mensaje,
    })
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cuil'],
      message: mensaje,
    })
  }
})

export type CrearPacienteInput = z.infer<typeof CrearPacienteSchema>

// Para actualizar, todos los campos son opcionales
export const ActualizarPacienteSchema = BasePacienteSchema

export type ActualizarPacienteInput = z.infer<typeof ActualizarPacienteSchema>

// Parámetros de búsqueda y listado
export const BusquedaPacienteSchema = z.object({
  q: z.string().max(200).trim().optional(),
  numeroDocumento: z.coerce.number().int().positive().max(99_999_999).optional(),
  apellido: z.string().max(100).trim().optional(),
  nombre: z.string().max(100).trim().optional(),
  historiaClinica: z.coerce.number().int().positive().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
})

export type BusquedaPacienteInput = z.infer<typeof BusquedaPacienteSchema>
