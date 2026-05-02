import { type NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiForbidden, apiOk, manejarErrorApi } from '@/lib/utils/response'
import { z } from 'zod'
import { toggleItemLote } from '@/modules/facturacion/service'

const ToggleSchema = z.object({ incluido: z.boolean() })

type Params = { params: Promise<{ id: string; itemId: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
    try {
        const usuario = await getUsuarioSesion()
        if (!tienePermiso(usuario.rol, 'FACTURACION', 'MODIFICAR')) return apiForbidden()

        const { id, itemId } = await params
        const body = await request.json()
        const { incluido } = ToggleSchema.parse(body)

        await toggleItemLote(Number(id), Number(itemId), incluido)
        return apiOk({ ok: true })
    } catch (error) {
        return manejarErrorApi(error)
    }
}
