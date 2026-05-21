import { type NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiOk, apiForbidden, apiError, manejarErrorApi } from '@/lib/utils/response'
import { aplicarPromediLote } from '@/modules/facturacion/service'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const usuario = await getUsuarioSesion()
        if (!tienePermiso(usuario.rol, 'FACTURACION', 'MODIFICAR')) return apiForbidden()

        const { id: idParam } = await params
        const id = parseInt(idParam, 10)
        if (isNaN(id) || id <= 0) return apiError('ID inválido', 400)

        const ip = req.headers.get('x-forwarded-for') ?? undefined
        const resultado = await aplicarPromediLote(id, usuario.codigoUsuario, ip)

        return apiOk(resultado)
    } catch (err) {
        return manejarErrorApi(err)
    }
}
