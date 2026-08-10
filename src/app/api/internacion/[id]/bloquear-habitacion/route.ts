import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import * as service from '@/modules/internacion/service'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const usuario = await getUsuarioSesion()
  const puedeModificar =
    tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR') ||
    tienePermiso(usuario.rol, 'INTERNACION', 'CREAR') ||
    tienePermiso(usuario.rol, 'ADMISION', 'MODIFICAR') ||
    tienePermiso(usuario.rol, 'ADMISION', 'CREAR')

  if (!puedeModificar) {
    return NextResponse.json(
      { ok: false, error: 'Sin permisos para bloquear habitaciones' },
      { status: 403 }
    )
  }

  const { id } = await params
  const ingresoId = Number.parseInt(id, 10)
  if (!Number.isFinite(ingresoId) || ingresoId <= 0) {
    return NextResponse.json({ ok: false, error: 'ID invalido' }, { status: 400 })
  }

  try {
    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined
    const data = await service.bloquearHabitacionDeIngreso(
      ingresoId,
      usuario.codigoUsuario,
      ip ?? undefined
    )

    revalidatePath('/dashboard/internacion')
    revalidatePath(`/dashboard/internacion/${ingresoId}`)

    return NextResponse.json({ ok: true, data })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Error al bloquear la habitacion' },
      { status: 400 }
    )
  }
}