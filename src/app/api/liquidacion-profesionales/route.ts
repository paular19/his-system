import { type NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermisoUsuario } from '@/lib/auth/role-registry'
import { apiForbidden, apiOk, apiValidationError, manejarErrorApi } from '@/lib/utils/response'
import { parsearBusquedaLiquidacion } from '@/modules/liquidacion-profesionales/schemas'
import { consultarLiquidacionProfesionales } from '@/modules/liquidacion-profesionales/service'

export async function GET(request: NextRequest) {
    try {
        const usuario = await getUsuarioSesion()
        if (!tienePermisoUsuario(usuario, 'LIQUIDACION_PROFESIONALES', 'LEER')) return apiForbidden()

        const parsed = parsearBusquedaLiquidacion(request.nextUrl.searchParams)
        if (!parsed.success) return apiValidationError(parsed.error)

        const resumen = await consultarLiquidacionProfesionales(parsed.data, usuario.email)
        return apiOk(resumen)
    } catch (error) {
        return manejarErrorApi(error)
    }
}
