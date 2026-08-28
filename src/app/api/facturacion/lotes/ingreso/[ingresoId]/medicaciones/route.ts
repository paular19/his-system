import { type NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiForbidden, apiOk, manejarErrorApi } from '@/lib/utils/response'
import { obtenerMedicacionesLoteIngreso } from '@/modules/facturacion/service'

type Params = { params: Promise<{ ingresoId: string }> }

// GET /api/facturacion/lotes/ingreso/123/medicaciones?periodo=2026-08
// Renglones de un lote de medicamentos: no pasan por orden.
export async function GET(req: NextRequest, { params }: Params) {
    try {
        const usuario = await getUsuarioSesion()
        if (!tienePermiso(usuario.rol, 'FACTURACION', 'LEER')) return apiForbidden()

        const { ingresoId } = await params
        const periodo = req.nextUrl.searchParams.get('periodo')?.trim() || undefined

        const medicaciones = await obtenerMedicacionesLoteIngreso(Number(ingresoId), periodo)
        return apiOk(medicaciones)
    } catch (error) {
        return manejarErrorApi(error)
    }
}
