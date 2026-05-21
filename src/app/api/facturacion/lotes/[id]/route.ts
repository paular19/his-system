import { type NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiForbidden, apiOk, apiError, manejarErrorApi } from '@/lib/utils/response'
import { ActualizarLoteFacturacionSchema } from '@/modules/facturacion/schemas'
import { obtenerLote, actualizarLote } from '@/modules/facturacion/service'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
    try {
        const usuario = await getUsuarioSesion()
        if (!tienePermiso(usuario.rol, 'FACTURACION', 'LEER')) return apiForbidden()

        const { id } = await params
        const searchParams = _req.nextUrl.searchParams
        const medico = searchParams.get('medico')?.trim() || undefined
        const matriculaParam = searchParams.get('matricula')
        const matricula = matriculaParam ? Number(matriculaParam) : undefined
        const lote = await obtenerLote(Number(id), {
            medico,
            matricula: matricula && Number.isFinite(matricula) && matricula > 0 ? matricula : undefined,
        })
        if (!lote) return apiError('Lote no encontrado', 404)

        return apiOk(lote)
    } catch (error) {
        return manejarErrorApi(error)
    }
}

export async function PUT(request: NextRequest, { params }: Params) {
    try {
        const usuario = await getUsuarioSesion()
        if (!tienePermiso(usuario.rol, 'FACTURACION', 'MODIFICAR')) return apiForbidden()

        const { id } = await params
        const body = await request.json()
        const data = ActualizarLoteFacturacionSchema.parse(body)
        await actualizarLote(
            Number(id),
            data,
            usuario.codigoUsuario,
            request.headers.get('x-forwarded-for') ?? undefined
        )

        return apiOk({ ok: true })
    } catch (error) {
        return manejarErrorApi(error)
    }
}
