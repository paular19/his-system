import { NextRequest } from 'next/server'
import { anularOrdenFacturacion } from '@/modules/facturacion/service'
import { apiOk, apiError, apiValidationError } from '@/lib/utils/response'
import { currentUser } from '@clerk/nextjs/server'
import { z } from 'zod'

const AnularOrdenSchema = z.object({
    puestoNumero: z.number().int().positive(),
    numero: z.number().int().positive(),
})

export async function POST(req: NextRequest) {
    try {
        const user = await currentUser()
        const usuario = user?.username ?? user?.id ?? 'ANONIMO'

        const body = await req.json() as unknown
        const parsed = AnularOrdenSchema.safeParse(body)
        if (!parsed.success) {
            return apiValidationError(parsed.error)
        }

        const ip = req.headers.get('x-forwarded-for') ?? undefined

        await anularOrdenFacturacion(parsed.data.puestoNumero, parsed.data.numero, usuario, ip)

        return apiOk({ ok: true })
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Error al anular orden'
        return apiError(message, 500)
    }
}
