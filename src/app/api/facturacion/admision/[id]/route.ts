import { NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiForbidden, apiNotFound, apiOk, manejarErrorApi } from '@/lib/utils/response'
import { ActualizarContextoFacturacionSchema } from '@/modules/facturacion/schemas'
import { actualizarContextoFacturacion } from '@/modules/facturacion/service'

interface RouteParams {
    params: Promise<{ id: string }>
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
    try {
        const usuario = await getUsuarioSesion()
        const puede =
            tienePermiso(usuario.rol, 'FACTURACION', 'MODIFICAR') ||
            tienePermiso(usuario.rol, 'FACTURACION', 'CREAR')
        if (!puede) return apiForbidden()

        const { id } = await params
        const ingresoId = Number(id)
        if (!Number.isFinite(ingresoId) || ingresoId <= 0) return apiNotFound('Ingreso')

        const body = await request.json()
        const data = ActualizarContextoFacturacionSchema.parse(body)

        const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? undefined
        await actualizarContextoFacturacion(ingresoId, data, usuario.codigoUsuario, ip ?? undefined)

        return apiOk({ ingresoId })
    } catch (error) {
        return manejarErrorApi(error)
    }
}
