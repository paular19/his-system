import { z } from 'zod'
import { CATEGORIAS_PRACTICA_IDS } from '@/modules/facturacion/categorias-practica'

const fechaISO = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD')

export const BusquedaLiquidacionSchema = z
    .object({
        desde: fechaISO,
        // Inclusivo: el repositorio lo convierte a limite exclusivo del dia siguiente.
        hasta: fechaISO,
        obraSocialId: z.coerce.number().int().positive().optional(),
        categorias: z.array(z.enum(CATEGORIAS_PRACTICA_IDS)).optional(),
        matricula: z.coerce.number().int().positive().optional(),
        estadosLote: z.array(z.enum(['PEN', 'CON'])).min(1).default(['PEN', 'CON']),
    })
    .refine((v) => v.desde <= v.hasta, {
        message: 'La fecha desde no puede ser posterior a la fecha hasta',
        path: ['desde'],
    })

export type BusquedaLiquidacionInput = z.infer<typeof BusquedaLiquidacionSchema>

/**
 * Parseo desde query string. Las listas viajan separadas por coma porque el resumen
 * se comparte por URL y asi queda legible.
 */
export function parsearBusquedaLiquidacion(searchParams: URLSearchParams) {
    const lista = (clave: string): string[] | undefined => {
        const raw = searchParams.get(clave)
        if (raw === null) return undefined
        const partes = raw
            .split(',')
            .map((p) => p.trim())
            .filter((p) => p.length > 0)
        return partes.length > 0 ? partes : undefined
    }

    return BusquedaLiquidacionSchema.safeParse({
        desde: searchParams.get('desde') ?? undefined,
        hasta: searchParams.get('hasta') ?? undefined,
        obraSocialId: searchParams.get('obraSocialId') || undefined,
        categorias: lista('categorias'),
        matricula: searchParams.get('matricula') || undefined,
        estadosLote: lista('estadosLote') ?? ['PEN', 'CON'],
    })
}
