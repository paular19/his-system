import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import * as service from '@/modules/internacion/service'
import { manejarErrorApi } from '@/lib/utils/response'

interface RouteParams {
  params: Promise<{ id: string; cirugiaId: string }>
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const usuario = await getUsuarioSesion()
    const puedeModificar =
      tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR') ||
      tienePermiso(usuario.rol, 'INTERNACION', 'CREAR')

    if (!puedeModificar) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const { id, cirugiaId } = await params
    const ingresoId = Number.parseInt(id, 10)
    const cirugiaProgramadaId = Number.parseInt(cirugiaId, 10)

    if (Number.isNaN(ingresoId) || Number.isNaN(cirugiaProgramadaId)) {
      return NextResponse.json({ error: 'IDs inválidos' }, { status: 400 })
    }

    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined
    const resultado = await service.anularCirugiaInternacionNoAutorizada(
      ingresoId,
      cirugiaProgramadaId,
      usuario.codigoUsuario,
      ip ?? undefined
    )

    revalidatePath(`/dashboard/internacion/${ingresoId}`)
    revalidatePath(`/dashboard/internacion/${ingresoId}/informe`)
    revalidatePath(`/dashboard/internacion/${ingresoId}/ficha-quirurgica`)

    return NextResponse.json({ data: resultado })
  } catch (err) {
    return manejarErrorApi(err)
  }
}
