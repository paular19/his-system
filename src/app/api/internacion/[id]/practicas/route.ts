import { NextRequest, NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { revalidatePath } from 'next/cache'
import * as service from '@/modules/internacion/service'
import { CrearPracticaSchema } from '@/modules/internacion/schemas'
import { manejarErrorApi } from '@/lib/utils/response'

interface RouteParams {
    params: Promise<{ id: string }>
}

export async function POST(req: NextRequest, { params }: RouteParams) {
    try {
        const usuario = await getUsuarioSesion()
        const puedeCrear =
            tienePermiso(usuario.rol, 'INTERNACION', 'CREAR') ||
            tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR')
        if (!puedeCrear) {
            return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
        }

        const { id } = await params
        const ingresoId = parseInt(id, 10)
        if (isNaN(ingresoId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

        const body = await req.json()
        const validado = CrearPracticaSchema.parse({ ...body, ingresoId })

        const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined
        const practica = await service.crearPractica(validado, usuario.codigoUsuario, ip ?? undefined)

        revalidatePath(`/dashboard/admision/${ingresoId}`)
        revalidatePath(`/dashboard/internacion/${ingresoId}`)

        return NextResponse.json({ data: practica }, { status: 201 })
    } catch (err) {
        return manejarErrorApi(err)
    }
}
