import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import * as service from '@/modules/internacion/service'
import { ActualizarTratanteInternacionSchema } from '@/modules/internacion/schemas'

interface RouteParams {
    params: Promise<{ id: string }>
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR')) {
        return NextResponse.json({ ok: false, error: 'Sin permisos para modificar médico tratante' }, { status: 403 })
    }

    const { id } = await params
    const ingresoId = parseInt(id, 10)
    if (Number.isNaN(ingresoId)) {
        return NextResponse.json({ ok: false, error: 'ID inválido' }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    const parsed = ActualizarTratanteInternacionSchema.safeParse({
        ...(body as Record<string, unknown>),
        ingresoId,
    })

    if (!parsed.success) {
        const detalle = parsed.error.issues.map((issue) => issue.message).join(', ')
        return NextResponse.json({ ok: false, error: `Datos inválidos: ${detalle}` }, { status: 400 })
    }

    try {
        const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined
        const data = await service.actualizarTratanteInternacion(parsed.data, usuario.codigoUsuario, ip ?? undefined)

        revalidatePath(`/dashboard/internacion/${ingresoId}`)
        revalidatePath(`/dashboard/internacion/${ingresoId}/informe`)
        revalidatePath('/dashboard/internacion')

        return NextResponse.json({ ok: true, data })
    } catch (err) {
        return NextResponse.json(
            { ok: false, error: err instanceof Error ? err.message : 'Error al actualizar médico tratante' },
            { status: 400 }
        )
    }
}
