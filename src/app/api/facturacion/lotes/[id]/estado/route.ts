import { type NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiForbidden, apiOk, manejarErrorApi } from '@/lib/utils/response'
import { z } from 'zod'
import { confirmarLote, anularLote } from '@/modules/facturacion/service'

const EstadoSchema = z.object({ estado: z.enum(['CON', 'ANU']) })

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
    try {
        const usuario = await getUsuarioSesion()
        if (!tienePermiso(usuario.rol, 'FACTURACION', 'MODIFICAR')) return apiForbidden()

        const { id } = await params
        const body = await request.json()
        const { estado } = EstadoSchema.parse(body)
        const ip = request.headers.get('x-forwarded-for') ?? undefined

        if (estado === 'CON') {
            await confirmarLote(Number(id), usuario.codigoUsuario, ip)
        } else {
            await anularLote(Number(id), usuario.codigoUsuario, ip)
        }

        return apiOk({ ok: true })
    } catch (error) {
        return manejarErrorApi(error)
    }
}
