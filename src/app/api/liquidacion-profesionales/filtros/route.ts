import { getUsuarioSesion } from '@/lib/auth'
import { tienePermisoUsuario } from '@/lib/auth/role-registry'
import { apiForbidden, apiOk, manejarErrorApi } from '@/lib/utils/response'
import {
    consultarObrasSocialesLiquidacion,
    consultarProfesionalesEfectores,
} from '@/modules/liquidacion-profesionales/service'

/** Opciones de los selectores del panel. Endpoint propio para que el rol acotado no dependa de FACTURACION. */
export async function GET() {
    try {
        const usuario = await getUsuarioSesion()
        if (!tienePermisoUsuario(usuario, 'LIQUIDACION_PROFESIONALES', 'LEER')) return apiForbidden()

        const [obrasSociales, profesionales] = await Promise.all([
            consultarObrasSocialesLiquidacion(),
            consultarProfesionalesEfectores(),
        ])

        return apiOk({ obrasSociales, profesionales })
    } catch (error) {
        return manejarErrorApi(error)
    }
}
