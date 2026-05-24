import { z } from 'zod'

export const PracticaCirugiaSchema = z.object({
    convenioId: z.number().int().positive().optional().nullable(),
    codigo: z.string().min(1).max(50),
    descripcion: z.string().min(1).max(500),
    cantidad: z.number().int().min(1),
    grupoOrden: z.number().int().min(1).optional().nullable(),
    importeTotal: z.number().min(0).optional().nullable(),
    matriculaEspecialista: z.number().int().positive().optional().nullable(),
    matriculaAnestesista: z.number().int().positive().optional().nullable(),
})

export const DiferencialesSchema = z.object({
    esFeriado: z.boolean().default(false),
    esNocturna: z.boolean().default(false),
    mismaViaPatologia: z.boolean().default(false),
    diferentesViasPatologia: z.boolean().default(false),
    diferentesViasDiferentesPatologia: z.boolean().default(false),
    dobleCirugia: z.boolean().default(false),
}).optional()

export const CrearCirugiaProgramadaSchema = z.object({
    pacienteId: z.number().int().positive(),
    fechaCirugia: z.string().min(1),
    horaCirugia: z.string().regex(/^\d{2}:\d{2}$/, 'Formato de hora inválido').optional().nullable(),
    obraSocialId: z.number().int().positive().optional().nullable(),
    planId: z.number().int().positive().optional().nullable(),
    obraSocialCoseguroId: z.number().int().positive().optional().nullable(),
    numeroAfiliado: z.string().max(50).trim().optional().nullable(),
    diagnostico: z.string().max(500).trim().optional().nullable(),
    observaciones: z.string().max(2000).trim().optional().nullable(),
    camaId: z.number().int().positive().optional().nullable(),
    practicas: z.array(PracticaCirugiaSchema).min(1),
    medicaciones: z
        .array(
            z.object({
                nombre: z.string().min(1).max(200),
                dosis: z.string().max(100).optional().nullable(),
                viaAdministracion: z.string().max(100).optional().nullable(),
                frecuencia: z.string().max(100).optional().nullable(),
                observaciones: z.string().max(500).optional().nullable(),
            })
        )
        .optional(),
    descartables: z
        .array(
            z.object({
                nombre: z.string().min(1).max(200),
                cantidad: z.number().int().min(1).default(1),
                observaciones: z.string().max(500).optional().nullable(),
            })
        )
        .optional(),
    diferenciales: DiferencialesSchema,
}).superRefine((data, ctx) => {
    if (data.diferenciales?.dobleCirugia && data.practicas.length < 2) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['diferenciales', 'dobleCirugia'],
            message: 'Doble cirugía requiere al menos dos prácticas',
        })
    }
})

export type CrearCirugiaProgramadaInputSchema = z.infer<typeof CrearCirugiaProgramadaSchema>
