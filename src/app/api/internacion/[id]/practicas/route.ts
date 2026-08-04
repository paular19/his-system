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
            tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR') ||
            tienePermiso(usuario.rol, 'ADMISION', 'CREAR') ||
            tienePermiso(usuario.rol, 'ADMISION', 'MODIFICAR')
        if (!puedeCrear) {
            return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
        }

        const { id } = await params
        const ingresoId = parseInt(id, 10)
        if (isNaN(ingresoId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

        const body = await req.json()
        const validado = CrearPracticaSchema.parse({ ...body, ingresoId })
        const omitirRevalidacion = req.nextUrl.searchParams.get('skipRevalidate') === '1'

        const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined
        const practica = await service.crearPractica(validado, usuario.codigoUsuario, ip ?? undefined)

        if (!omitirRevalidacion) {
            revalidatePath(`/dashboard/admision/${ingresoId}`)
            revalidatePath(`/dashboard/internacion/${ingresoId}`)
            revalidatePath(`/dashboard/internacion/${ingresoId}/practicas`)
        }

        return NextResponse.json({ data: practica }, { status: 201 })
    } catch (err) {
        if (err instanceof Error && err.message.includes('no está disponible para el convenio de la internación')) {
            return NextResponse.json({ error: err.message }, { status: 422 })
        }

        if (
            typeof err === 'object' &&
            err !== null &&
            'code' in err &&
            (err as { code?: string }).code === 'P2003'
        ) {
            return NextResponse.json(
                {
                    error:
                        'El código de práctica no está disponible para el convenio de la internación. Verificá obra social y nomenclador.',
                },
                { status: 422 }
            )
        }

        return manejarErrorApi(err)
    }
}
