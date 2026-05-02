import { type NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiForbidden, apiOk, manejarErrorApi } from '@/lib/utils/response'
import { obtenerOrdenesAutorizadasIngreso } from '@/modules/facturacion/service'

type Params = { params: Promise<{ ingresoId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
    try {
        const usuario = await getUsuarioSesion()
        if (!tienePermiso(usuario.rol, 'FACTURACION', 'LEER')) return apiForbidden()

        const { ingresoId } = await params
        const ordenes = await obtenerOrdenesAutorizadasIngreso(Number(ingresoId))
        return apiOk(ordenes)
    } catch (error) {
        return manejarErrorApi(error)
    }
}
