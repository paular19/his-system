import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiForbidden, apiOk, manejarErrorApi } from '@/lib/utils/response'
import { toggleOrdenLote } from '@/modules/facturacion/service'

const ToggleSchema = z.object({ incluida: z.boolean() })

type Params = {
    params: Promise<{ id: string; puestoNumero: string; ordenNumero: string }>
}

export async function PATCH(request: NextRequest, { params }: Params) {
    try {
        const usuario = await getUsuarioSesion()
        if (!tienePermiso(usuario.rol, 'FACTURACION', 'MODIFICAR')) return apiForbidden()

        const { id, puestoNumero, ordenNumero } = await params
        const { incluida } = ToggleSchema.parse(await request.json())

        await toggleOrdenLote(Number(id), Number(puestoNumero), Number(ordenNumero), incluida)
        return apiOk({ ok: true })
    } catch (error) {
        return manejarErrorApi(error)
    }
}
