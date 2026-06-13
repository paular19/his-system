import { NextRequest, NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { revalidatePath } from 'next/cache'
import * as service from '@/modules/cirugia/service'
import { manejarErrorApi } from '@/lib/utils/response'

interface RouteParams {
  params: Promise<{ id: string; practicaId: string }>
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const usuario = await getUsuarioSesion()
    const puedeEliminar =
      tienePermiso(usuario.rol, 'ADMISION', 'MODIFICAR') ||
      tienePermiso(usuario.rol, 'ADMISION', 'CREAR') ||
      tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR')

    if (!puedeEliminar) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const { id, practicaId } = await params
    const cirugiaId = parseInt(id, 10)
    const idPractica = parseInt(practicaId, 10)

    if (isNaN(cirugiaId) || isNaN(idPractica) || cirugiaId <= 0 || idPractica <= 0) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const resultado = await service.eliminarPracticaCirugiaNoAutorizada(cirugiaId, idPractica)

    revalidatePath('/dashboard/cirugia')
    revalidatePath(`/dashboard/cirugia/${cirugiaId}`)

    return NextResponse.json({ ok: true, data: resultado })
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes('No se puede eliminar')) {
        return NextResponse.json({ error: err.message }, { status: 409 })
      }
      if (err.message.includes('no encontrada') || err.message.includes('no encontrado')) {
        return NextResponse.json({ error: err.message }, { status: 404 })
      }
    }
    return manejarErrorApi(err)
  }
}
