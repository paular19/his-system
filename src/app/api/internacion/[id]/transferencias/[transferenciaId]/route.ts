import { NextRequest, NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import * as service from '@/modules/internacion/service'
import { EditarTransferenciaCamaSchema } from '@/modules/internacion/schemas'
import { manejarErrorApi } from '@/lib/utils/response'

interface RouteParams {
  params: Promise<{ id: string; transferenciaId: string }>
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const usuario = await getUsuarioSesion()
    const puedeCambiarCama =
      tienePermiso(usuario.rol, 'INTERNACION', 'CREAR') ||
      tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR') ||
      tienePermiso(usuario.rol, 'ADMISION', 'MODIFICAR') ||
      tienePermiso(usuario.rol, 'ADMISION', 'CREAR')

    if (!puedeCambiarCama) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const { id, transferenciaId } = await params
    const ingresoId = Number.parseInt(id, 10)
    const transferenciaIdNum = Number.parseInt(transferenciaId, 10)

    if (Number.isNaN(ingresoId) || Number.isNaN(transferenciaIdNum)) {
      return NextResponse.json({ error: 'ID invalido' }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    const validado = EditarTransferenciaCamaSchema.parse({
      ...(body as Record<string, unknown>),
      ingresoId,
      transferenciaId: transferenciaIdNum,
    })

    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined
    const transferencia = await service.editarTransferenciaCama(validado, usuario.codigoUsuario, ip ?? undefined)

    return NextResponse.json({ data: transferencia })
  } catch (err) {
    return manejarErrorApi(err)
  }
}
