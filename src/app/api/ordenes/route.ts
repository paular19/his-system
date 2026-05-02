import { type NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiOk, apiCreado, apiForbidden, manejarErrorApi } from '@/lib/utils/response'
import { CrearOrdenSchema } from '@/modules/orden/schemas'
import { crearOrdenAmbulatorio } from '@/modules/orden/service'
import { listarOrdenes } from '@/modules/orden/repository'

// GET /api/ordenes — Listar órdenes
export async function GET(request: NextRequest) {
  try {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'AMBULATORIO', 'LEER')) {
      return apiForbidden()
    }

    const { searchParams } = request.nextUrl
    const skip = parseInt(searchParams.get('skip') ?? '0', 10)
    const take = parseInt(searchParams.get('take') ?? '20', 10)
    const pendienteParam = searchParams.get('pendiente')
    const pendiente = pendienteParam === 'true' ? true : pendienteParam === 'false' ? false : undefined

    const resultado = await listarOrdenes({ skip, take, pendiente })
    return apiOk(resultado)
  } catch (err) {
    return manejarErrorApi(err)
  }
}

// POST /api/ordenes — Crear nueva orden
export async function POST(request: NextRequest) {
  try {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'AMBULATORIO', 'CREAR')) {
      return apiForbidden()
    }

    const body = await request.json()
    const parsed = CrearOrdenSchema.safeParse(body)
    if (!parsed.success) {
      return apiOk({ error: parsed.error.errors[0]?.message }, 400)
    }

    const orden = await crearOrdenAmbulatorio(parsed.data, usuario.codigoUsuario)
    return apiCreado({
      puestoNumero: orden.puestoNumero,
      numero: orden.numero,
    })
  } catch (err) {
    return manejarErrorApi(err)
  }
}
