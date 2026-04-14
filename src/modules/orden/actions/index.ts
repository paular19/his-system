'use server'

import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { CrearOrdenSchema, type CrearOrdenInput } from '../schemas'
import { crearOrdenAmbulatorio } from '../service'

export async function crearOrdenAction(input: CrearOrdenInput) {
  const usuario = await getUsuarioSesion()

  if (!tienePermiso(usuario.rol, 'AMBULATORIO', 'CREAR')) {
    return { error: 'Sin permiso para crear órdenes' }
  }

  const parsed = CrearOrdenSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Datos inválidos' }
  }

  try {
    const orden = await crearOrdenAmbulatorio(parsed.data, usuario.codigoUsuario)
    return {
      ok: true,
      puestoNumero: orden.puestoNumero,
      numero: orden.numero,
    }
  } catch (err) {
    console.error('[ORDEN] Error al crear:', err)
    return { error: 'Error al generar la autorización' }
  }
}
