import { NextRequest, NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { revalidatePath } from 'next/cache'
import * as service from '@/modules/internacion/service'
import { ActualizarDiagnosticoInternacionSchema } from '@/modules/internacion/schemas'

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; diagnosticoId: string }> }
) {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR')) {
        return NextResponse.json({ ok: false, error: 'Sin permisos para modificar diagnósticos' }, { status: 403 })
    }

    const { id, diagnosticoId } = await params
    const ingresoId = parseInt(id, 10)
    const diagnosticoPk = parseInt(diagnosticoId, 10)
    if (Number.isNaN(ingresoId) || Number.isNaN(diagnosticoPk)) {
        return NextResponse.json({ ok: false, error: 'ID inválido' }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    const validado = ActualizarDiagnosticoInternacionSchema.parse({
        ...(body as Record<string, unknown>),
        ingresoId,
        id: diagnosticoPk,
    })

    try {
        const data = await service.actualizarDiagnosticoInternacion(validado, usuario.codigoUsuario)
        revalidatePath(`/dashboard/admision/${ingresoId}`)
        revalidatePath(`/dashboard/internacion/${ingresoId}`)
        return NextResponse.json({ ok: true, data })
    } catch (err) {
        return NextResponse.json(
            { ok: false, error: err instanceof Error ? err.message : 'Error al actualizar el diagnóstico' },
            { status: 400 }
        )
    }
}