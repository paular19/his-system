import { NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiForbidden, apiOk, manejarErrorApi } from '@/lib/utils/response'
import { ActualizarImporteItemOrdenSchema } from '@/modules/facturacion/schemas'
import { actualizarImporteItemOrden } from '@/modules/facturacion/service'

export async function PATCH(request: NextRequest) {
    try {
        const usuario = await getUsuarioSesion()
        const puede =
            tienePermiso(usuario.rol, 'FACTURACION', 'MODIFICAR') ||
            tienePermiso(usuario.rol, 'FACTURACION', 'CREAR')
        if (!puede) return apiForbidden()

        const body = await request.json()
        const data = ActualizarImporteItemOrdenSchema.parse(body)

        const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? undefined
        await actualizarImporteItemOrden(data, usuario.codigoUsuario, ip ?? undefined)

        return apiOk({ ok: true })
    } catch (error) {
        return manejarErrorApi(error)
    }
}
