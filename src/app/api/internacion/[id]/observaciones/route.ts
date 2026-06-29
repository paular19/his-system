import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import * as service from '@/modules/internacion/service'
import { ActualizarObservacionesInternacionSchema } from '@/modules/internacion/schemas'
import { manejarErrorApi } from '@/lib/utils/response'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const usuario = await getUsuarioSesion()
    const puedeModificar =
      tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR') ||
      tienePermiso(usuario.rol, 'INTERNACION', 'CREAR')

    if (!puedeModificar) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const { id } = await params
    const ingresoId = parseInt(id, 10)
    if (Number.isNaN(ingresoId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    const validado = ActualizarObservacionesInternacionSchema.parse({
      ...(body as Record<string, unknown>),
      ingresoId,
    })

    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined
    const data = await service.actualizarObservacionesInternacion(validado, usuario.codigoUsuario, ip ?? undefined)

    revalidatePath(`/dashboard/internacion/${ingresoId}`)
    revalidatePath(`/dashboard/internacion/${ingresoId}/informe`)

    return NextResponse.json({ data })
  } catch (err) {
    return manejarErrorApi(err)
  }
}
