import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import * as service from '@/modules/internacion/service'
import { ActualizarCamaSchema } from '@/modules/internacion/schemas'
import { apiForbidden, apiError, apiNotFound } from '@/lib/utils/response'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'INTERNACION', 'LEER')) {
      return apiForbidden()
    }

    const { id } = await params
    const camaId = parseInt(id, 10)
    if (isNaN(camaId)) return apiError('ID inválido', 400)

    const cama = await service.obtenerCama(camaId)
    return NextResponse.json(cama)
  } catch (error) {
    if (error instanceof Error && error.message.includes('no encontrada')) {
      return apiNotFound('Cama')
    }
    console.error('[GET /api/internacion/camas/:id]', error)
    return apiError('Error al obtener cama')
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR')) {
      return apiForbidden()
    }

    const { id } = await params
    const camaId = parseInt(id, 10)
    if (isNaN(camaId)) return apiError('ID inválido', 400)

    const body = await request.json()
    const data = ActualizarCamaSchema.parse(body)

    const cama = await service.actualizarEstadoCama(camaId, data, usuario.codigoUsuario)
    return NextResponse.json(cama)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('no encontrada') || error.message.includes('no se puede')) {
        return apiError(error.message, 400)
      }
    }
    console.error('[PUT /api/internacion/camas/:id]', error)
    return apiError('Error al actualizar cama')
  }
}
