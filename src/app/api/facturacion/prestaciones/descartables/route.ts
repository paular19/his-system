import { NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiCreado, apiForbidden, manejarErrorApi } from '@/lib/utils/response'
import { CrearDescartableFacturacionSchema } from '@/modules/facturacion/schemas'
import { crearDescartableFacturacion } from '@/modules/facturacion/service'

export async function POST(request: NextRequest) {
    try {
        const usuario = await getUsuarioSesion()
        const puede =
            tienePermiso(usuario.rol, 'FACTURACION', 'CREAR') ||
            tienePermiso(usuario.rol, 'FACTURACION', 'MODIFICAR')
        if (!puede) return apiForbidden()

        const body = await request.json()
        const data = CrearDescartableFacturacionSchema.parse(body)

        const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? undefined
        const creada = await crearDescartableFacturacion(data, usuario.codigoUsuario, ip ?? undefined)
        return apiCreado(creada)
    } catch (error) {
        return manejarErrorApi(error)
    }
}
