import { type NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiForbidden, apiOk, manejarErrorApi } from '@/lib/utils/response'
import { obtenerOrdenesAutorizadasIngreso } from '@/modules/facturacion/service'

type Params = { params: Promise<{ ingresoId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
    try {
        const usuario = await getUsuarioSesion()
        if (!tienePermiso(usuario.rol, 'FACTURACION', 'LEER')) return apiForbidden()

        const { ingresoId } = await params
        const searchParams = req.nextUrl.searchParams
        const medico = searchParams.get('medico')?.trim() || undefined
        const matriculaParam = searchParams.get('matricula')
        const matricula = matriculaParam ? Number(matriculaParam) : undefined
        const periodo = searchParams.get('periodo')?.trim() || undefined

        const ordenes = await obtenerOrdenesAutorizadasIngreso(Number(ingresoId), {
            medico,
            matricula: matricula && Number.isFinite(matricula) && matricula > 0 ? matricula : undefined,
            periodo,
        })
        return apiOk(ordenes)
    } catch (error) {
        return manejarErrorApi(error)
    }
}
