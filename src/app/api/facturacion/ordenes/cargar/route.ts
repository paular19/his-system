import { NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiCreado, apiForbidden, manejarErrorApi } from '@/lib/utils/response'
import { CargarOrdenesFacturacionSchema } from '@/modules/facturacion/schemas'
import { cargarOrdenesDesdePrestaciones } from '@/modules/facturacion/service'

export async function POST(request: NextRequest) {
    try {
        const usuario = await getUsuarioSesion()
        const puede =
            tienePermiso(usuario.rol, 'FACTURACION', 'CREAR') ||
            tienePermiso(usuario.rol, 'FACTURACION', 'MODIFICAR')
        if (!puede) return apiForbidden()

        const body = await request.json()
        const data = CargarOrdenesFacturacionSchema.parse(body)

        const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? undefined
        const resultado = await cargarOrdenesDesdePrestaciones(data, usuario.codigoUsuario, ip ?? undefined)

        return apiCreado(resultado)
    } catch (error) {
        return manejarErrorApi(error)
    }
}
