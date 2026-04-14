import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import * as service from '@/modules/internacion/service'
import { FiltroDisponibilidadSchema } from '@/modules/internacion/schemas'
import { apiForbidden, apiError } from '@/lib/utils/response'

export async function GET(request: Request) {
  try {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'INTERNACION', 'LEER')) {
      return apiForbidden()
    }

    const { searchParams } = new URL(request.url)
    const filtro = FiltroDisponibilidadSchema.parse({
      sector: searchParams.get('sector') ?? undefined,
    })

    if (filtro.sector) {
      const camas = await service.obtenerCamasDisponibles(filtro.sector)
      return NextResponse.json({ camas })
    }

    const mapa = await service.obtenerMapaCamas()
    return NextResponse.json(mapa)
  } catch (error) {
    console.error('[GET /api/internacion/camas]', error)
    return apiError('Error al obtener camas')
  }
}
