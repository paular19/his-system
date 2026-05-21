import { NextRequest, NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import * as service from '@/modules/internacion/service'
import { RegistrarAltaInternacionSchema } from '@/modules/internacion/schemas'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR')) {
        return NextResponse.json({ ok: false, error: 'Sin permisos para registrar altas' }, { status: 403 })
    }

    const { id } = await params
    const ingresoId = parseInt(id, 10)
    if (Number.isNaN(ingresoId)) {
        return NextResponse.json({ ok: false, error: 'ID inválido' }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    const parsed = RegistrarAltaInternacionSchema.safeParse({ ...(body as Record<string, unknown>), ingresoId })
    if (!parsed.success) {
        const detalle = parsed.error.issues.map((issue) => issue.message).join(', ')
        return NextResponse.json({ ok: false, error: `Datos inválidos: ${detalle}` }, { status: 400 })
    }

    try {
        const data = await service.registrarAltaInternacion(parsed.data, usuario.codigoUsuario)
        return NextResponse.json({ ok: true, data })
    } catch (err) {
        return NextResponse.json(
            { ok: false, error: err instanceof Error ? err.message : 'Error al registrar el alta' },
            { status: 400 }
        )
    }
}