import { z } from 'zod'

export const BusquedaFacturacionSchema = z.object({
    q: z.string().trim().max(200).optional(),
    tipoIngresoCodigo: z.string().trim().max(3).optional(),
    codigoPractica: z.string().trim().max(20).optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(100).default(20),
})

export type BusquedaFacturacionInput = z.infer<typeof BusquedaFacturacionSchema>

export const CrearPracticaFacturacionSchema = z.object({
    ingresoId: z.number().int().positive(),
    convenioId: z.number().int().min(0),
    codigoPractica: z.string().trim().min(1).max(8),
    descripcionPractica: z.string().trim().max(200).optional().nullable(),
    cantidad: z.coerce.number().positive().default(1),
    fecha: z.string().datetime().or(z.date()).transform((v) => new Date(v)),
    numeroAutorizacion: z.string().trim().max(50).optional().nullable(),
    importeBaseUnitario: z.coerce.number().positive().optional().nullable(),
})

export type CrearPracticaFacturacionInput = z.infer<typeof CrearPracticaFacturacionSchema>

export const CrearMedicacionFacturacionSchema = z.object({
    ingresoId: z.number().int().positive(),
    nombre: z.string().trim().min(1).max(200),
    dosis: z.string().trim().max(100).optional().nullable(),
    viaAdministracion: z.string().trim().max(50).optional().nullable(),
    frecuencia: z.string().trim().max(100).optional().nullable(),
    fechaInicio: z.string().datetime().or(z.date()).transform((v) => new Date(v)),
    fechaFin: z.string().datetime().or(z.date()).transform((v) => new Date(v)).optional().nullable(),
    observaciones: z.string().trim().max(500).optional().nullable(),
    profesionalId: z.number().int().positive().optional().nullable(),
})

export type CrearMedicacionFacturacionInput = z.infer<typeof CrearMedicacionFacturacionSchema>

export const CrearDescartableFacturacionSchema = z.object({
    ingresoId: z.number().int().positive(),
    nombre: z.string().trim().min(1).max(200),
    cantidad: z.coerce.number().int().min(1).default(1),
    observaciones: z.string().trim().max(500).optional().nullable(),
    profesionalId: z.number().int().positive().optional().nullable(),
})

export type CrearDescartableFacturacionInput = z.infer<typeof CrearDescartableFacturacionSchema>

export const ActualizarContextoFacturacionSchema = z.object({
    ingreso: z
        .object({
            nombre: z.string().trim().max(200).optional().nullable(),
            descripcionPatologia: z.string().trim().max(500).optional().nullable(),
            numeroAfiliado: z.string().trim().max(50).optional().nullable(),
            observaciones: z.string().trim().max(2000).optional().nullable(),
            obraSocialId: z.number().int().positive().optional().nullable(),
            planId: z.number().int().positive().optional().nullable(),
        })
        .optional(),
    paciente: z
        .object({
            apellido: z.string().trim().max(100).optional(),
            nombre: z.string().trim().max(100).optional(),
            nombreCompleto: z.string().trim().max(200).optional(),
            numeroDocumento: z.number().int().positive().optional().nullable(),
            celular1: z.string().trim().max(50).optional().nullable(),
            email: z.string().trim().max(100).optional().nullable(),
            domicilio: z.string().trim().max(200).optional().nullable(),
        })
        .optional(),
})

export type ActualizarContextoFacturacionInput = z.infer<typeof ActualizarContextoFacturacionSchema>

export const PrestacionOrdenInputSchema = z.object({
    practicaId: z.number().int().positive().optional().nullable(),
    convenioId: z.number().int().min(0),
    codigoPractica: z.string().trim().min(1).max(8),
    descripcionPractica: z.string().trim().min(1).max(500),
    cantidad: z.coerce.number().positive(),
    incluyeCodigo: z
        .string()
        .trim()
        .regex(/^(GA|HE|HA|A[1-3])(\+(GA|HE|HA|A[1-3]))*$/)
        .optional()
        .nullable(),
    numeroAutorizacion: z.string().trim().max(50).optional().nullable(),
    importeTotal: z.coerce.number().min(0).optional().nullable(),
    matriculaEspecialista: z.number().int().positive().optional().nullable(),
    matriculaAnestesista: z.number().int().positive().optional().nullable(),
    grupoOrden: z.number().int().min(1).optional().nullable(),
})

export const CargarOrdenesFacturacionSchema = z.object({
    ingresoId: z.number().int().positive(),
    profesionalId: z.number().int().positive().optional().nullable(),
    modo: z.enum(['MASIVA', 'INDIVIDUAL', 'AGRUPADA']).default('MASIVA'),
    titularModular: z.string().trim().max(100).optional().nullable(),
    facturarTodo: z.boolean().default(true),
    prestaciones: z.array(PrestacionOrdenInputSchema).default([]),
})

export type CargarOrdenesFacturacionInput = z.infer<typeof CargarOrdenesFacturacionSchema>

export const ActualizarAutorizacionSchema = z.discriminatedUnion('tipo', [
    z.object({
        tipo: z.literal('PRACTICA'),
        practicaId: z.number().int().positive(),
        numeroAutorizacion: z.string().trim().max(50).optional().nullable(),
    }),
    z.object({
        tipo: z.literal('ORDEN_ITEM'),
        puestoNumero: z.number().int().positive(),
        ordenNumero: z.number().int().positive(),
        item: z.number().int().positive(),
        numeroAutorizacion: z.string().trim().max(15).optional().nullable(),
    }),
])

export type ActualizarAutorizacionInput = z.infer<typeof ActualizarAutorizacionSchema>

export const ActualizarPrestacionFacturacionSchema = z.discriminatedUnion('tipo', [
    z.object({
        tipo: z.literal('PRACTICA'),
        practicaId: z.number().int().positive(),
        fecha: z.string().datetime().or(z.date()).transform((v) => new Date(v)),
        codigoPractica: z.string().trim().min(1).max(8),
        descripcionPractica: z.string().trim().max(500).optional().nullable(),
        cantidad: z.coerce.number().positive(),
        numeroAutorizacion: z.string().trim().max(50).optional().nullable(),
        importeTotal: z.coerce.number().min(0),
        matriculaProfesional: z.number().int().positive().optional().nullable(),
        matriculaEspecialista: z.number().int().positive().optional().nullable(),
        matriculaAnestesista: z.number().int().positive().optional().nullable(),
    }),
    z.object({
        tipo: z.literal('ORDEN_ITEM'),
        puestoNumero: z.number().int().positive(),
        ordenNumero: z.number().int().positive(),
        item: z.number().int().positive(),
        fecha: z.string().datetime().or(z.date()).transform((v) => new Date(v)),
        codigoPractica: z.string().trim().min(1).max(8),
        descripcionPractica: z.string().trim().max(500).optional().nullable(),
        cantidad: z.coerce.number().positive(),
        numeroAutorizacion: z.string().trim().max(15).optional().nullable(),
        importeTotal: z.coerce.number().min(0),
        matriculaProfesional: z.number().int().positive().optional().nullable(),
        matriculaEspecialista: z.number().int().positive().optional().nullable(),
        matriculaAnestesista: z.number().int().positive().optional().nullable(),
    }),
])

export type ActualizarPrestacionFacturacionInput = z.infer<typeof ActualizarPrestacionFacturacionSchema>

export const ActualizarDiferencialesCirugiaFacturacionSchema = z.object({
    ingresoId: z.number().int().positive(),
    cirugiaProgramadaId: z.number().int().positive(),
    practicaBaseId: z.number().int().positive().optional().nullable(),
    esFeriado: z.boolean().default(false),
    esNocturna: z.boolean().default(false),
    mismaViaPatologia: z.boolean().default(false),
    diferentesViasPatologia: z.boolean().default(false),
    diferentesViasDiferentesPatologia: z.boolean().default(false),
    dobleCirugia: z.boolean().default(false),
})

export type ActualizarDiferencialesCirugiaFacturacionInput = z.infer<typeof ActualizarDiferencialesCirugiaFacturacionSchema>

// ============================================
// LOTES DE FACTURACIÓN
// ============================================

export const CrearLoteFacturacionSchema = z.object({
    fecha: z.string().datetime().or(z.date()).transform((v) => new Date(v)),
    periodo: z
        .string()
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Formato: YYYY-MM')
        .describe('Ej: 2026-04'),
    tipo: z.enum(['PRACTICAS', 'MEDICAMENTOS']),
    clienteTipo: z.enum(['OBRA_SOCIAL', 'PARTICULAR']).default('OBRA_SOCIAL'),
    obraSocialId: z.number().int().positive().optional().nullable(),
    planId: z.number().int().positive().optional().nullable(),
    tipoIngresoCodigo: z.string().trim().max(3).optional().nullable(),
    rangoDesde: z.number().int().positive().optional().nullable(),
    rangoHasta: z.number().int().positive().optional().nullable(),
    sedeId: z.number().int().positive().optional().nullable(),
    descripcion: z.string().trim().max(500).optional().nullable(),
    concepto: z.string().trim().max(200).optional().nullable(),
})

export type CrearLoteFacturacionInput = z.infer<typeof CrearLoteFacturacionSchema>

export const ActualizarLoteFacturacionSchema = z.object({
    fecha: z.string().datetime().or(z.date()).transform((v) => new Date(v)).optional(),
    periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
    descripcion: z.string().trim().max(500).optional().nullable(),
    concepto: z.string().trim().max(200).optional().nullable(),
    sedeId: z.number().int().positive().optional().nullable(),
    tipoIngresoCodigo: z.string().trim().max(3).optional().nullable(),
    rangoDesde: z.number().int().positive().optional().nullable(),
    rangoHasta: z.number().int().positive().optional().nullable(),
})

export type ActualizarLoteFacturacionInput = z.infer<typeof ActualizarLoteFacturacionSchema>

export const BusquedaLotesSchema = z.object({
    periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
    estado: z.enum(['PEN', 'CON', 'ANU']).optional(),
    obraSocialId: z.coerce.number().int().positive().optional(),
    tipo: z.enum(['PRACTICAS', 'MEDICAMENTOS']).optional(),
    medico: z.string().trim().min(2).max(200).optional(),
    matricula: z.coerce.number().int().positive().optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(100).default(20),
})

export type BusquedaLotesInput = z.infer<typeof BusquedaLotesSchema>

// ============================================
// IPS TXT — PLANILLA DE PRESTACIONES
// ============================================

const IPSTxtItemSchema = z.object({
    afiliadoDoc: z.string().trim().max(20),
    afiliadoNom: z.string().trim().max(200),
    nroOrden: z.string().trim().max(20),
    fechaRealiz: z.string().nullable().optional(),
    servicioCodigo: z.string().trim().max(20),
    servicioNombre: z.string().trim().max(500),
    cantidad: z.number().int().min(1),
    impEsp: z.number().min(0),
    impAyu: z.number().min(0),
    impAne: z.number().min(0),
    impGto: z.number().min(0),
    impTotal: z.number().min(0),
})

export const CrearLoteIPSTxtSchema = z.object({
    fecha: z.string().datetime().or(z.date()).transform((v) => new Date(v)),
    periodo: z
        .string()
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Formato: YYYY-MM'),
    obraSocialId: z.number().int().positive().optional().nullable(),
    planId: z.number().int().positive().optional().nullable(),
    descripcion: z.string().trim().max(500).optional().nullable(),
    items: z.array(IPSTxtItemSchema).min(1),
})

export type CrearLoteIPSTxtInput = z.infer<typeof CrearLoteIPSTxtSchema>
