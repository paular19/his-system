import { NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiForbidden, apiOk, manejarErrorApi } from '@/lib/utils/response'
import { EliminarPrestacionFacturacionSchema } from '@/modules/facturacion/schemas'
import { eliminarPrestacionFacturacion } from '@/modules/facturacion/service'

export async function POST(request: NextRequest) {
    try {
        const usuario = await getUsuarioSesion()
        // Es baja logica (estado 'S'), no un DELETE: alcanza con MODIFICAR, que es
        // lo que tiene el rol FACTURACION sobre su propio modulo.
        const puede =
            tienePermiso(usuario.rol, 'FACTURACION', 'ELIMINAR') ||
            tienePermiso(usuario.rol, 'FACTURACION', 'MODIFICAR')
        if (!puede) return apiForbidden()

        const body = await request.json()
        const data = EliminarPrestacionFacturacionSchema.parse(body)

        const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? undefined
        await eliminarPrestacionFacturacion(data, usuario.codigoUsuario, ip ?? undefined)

        return apiOk({ ok: true })
    } catch (error) {
        return manejarErrorApi(error)
    }
}
