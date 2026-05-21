import { NextRequest, NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import * as service from '@/modules/internacion/service'
import { ActualizarDescartableSchema } from '@/modules/internacion/schemas'
import { manejarErrorApi } from '@/lib/utils/response'

interface RouteParams {
    params: Promise<{ id: string; desId: string }>
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
    try {
        const usuario = await getUsuarioSesion()
        if (!tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR')) {
            return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
        }

        const { desId } = await params
        const id = parseInt(desId, 10)
        if (isNaN(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

        const body = await req.json()
        const validado = ActualizarDescartableSchema.parse(body)

        const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined
        const descartable = await service.actualizarDescartable(id, validado, usuario.codigoUsuario, ip ?? undefined)

        return NextResponse.json({ data: descartable })
    } catch (err) {
        return manejarErrorApi(err)
    }
}
