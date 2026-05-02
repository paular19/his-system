import { type NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiForbidden, apiNotFound, apiOk, manejarErrorApi } from '@/lib/utils/response'
import { obtenerContextoFacturacion } from '@/modules/facturacion/service'

export async function GET(request: NextRequest) {
    try {
        const usuario = await getUsuarioSesion()
        if (!tienePermiso(usuario.rol, 'FACTURACION', 'LEER')) return apiForbidden()

        const ingresoId = Number(request.nextUrl.searchParams.get('ingresoId'))
        if (!Number.isFinite(ingresoId) || ingresoId <= 0) return apiNotFound('Ingreso')

        const data = await obtenerContextoFacturacion(ingresoId)
        if (!data) return apiNotFound('Ingreso')

        return apiOk(data)
    } catch (error) {
        return manejarErrorApi(error)
    }
}
