import { type NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiCreado, apiForbidden, apiError, manejarErrorApi } from '@/lib/utils/response'
import { CrearLoteIPSTxtSchema } from '@/modules/facturacion/schemas'
import { crearLoteIPSTxt } from '@/modules/facturacion/service'

export async function POST(req: NextRequest) {
    try {
        const usuario = await getUsuarioSesion()
        if (!tienePermiso(usuario.rol, 'FACTURACION', 'CREAR')) return apiForbidden()

        const body = await req.json()
        const parsed = CrearLoteIPSTxtSchema.safeParse(body)
        if (!parsed.success) {
            return apiError('Datos inválidos: ' + parsed.error.errors.map((e) => e.message).join(', '), 400)
        }

        const ip = req.headers.get('x-forwarded-for') ?? undefined
        const lote = await crearLoteIPSTxt(parsed.data, usuario.codigoUsuario, ip)

        return apiCreado(lote)
    } catch (err) {
        return manejarErrorApi(err)
    }
}
