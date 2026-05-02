import { NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiForbidden, apiOk, manejarErrorApi } from '@/lib/utils/response'
import { ActualizarAutorizacionSchema } from '@/modules/facturacion/schemas'
import { actualizarNumeroAutorizacion } from '@/modules/facturacion/service'

export async function PATCH(request: NextRequest) {
    try {
        const usuario = await getUsuarioSesion()
        const puede =
            tienePermiso(usuario.rol, 'FACTURACION', 'MODIFICAR') ||
            tienePermiso(usuario.rol, 'FACTURACION', 'CREAR')
        if (!puede) return apiForbidden()

        const body = await request.json()
        const data = ActualizarAutorizacionSchema.parse(body)

        const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? undefined
        await actualizarNumeroAutorizacion(data, usuario.codigoUsuario, ip ?? undefined)

        return apiOk({ ok: true })
    } catch (error) {
        return manejarErrorApi(error)
    }
}
