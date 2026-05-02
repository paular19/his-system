'use server'

import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { CrearOrdenSchema, type CrearOrdenInput } from '../schemas'
import { crearOrdenAmbulatorio, crearOrdenesAmbulatoriasPorPractica } from '../service'
import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

type ModoGeneracion = 'MASIVA' | 'INDIVIDUAL'

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

export async function crearOrdenesDesdeAdmisionAction(
  input: CrearOrdenInput & { modoGeneracion?: ModoGeneracion }
) {
  const usuario = await getUsuarioSesion()

  if (!tienePermiso(usuario.rol, 'AMBULATORIO', 'CREAR')) {
    return { error: 'Sin permiso para crear órdenes' }
  }

  const parsed = CrearOrdenSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Datos inválidos' }
  }

  const modo = input.modoGeneracion === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'MASIVA'

  try {
    if (modo === 'INDIVIDUAL') {
      const ordenes = await crearOrdenesAmbulatoriasPorPractica(parsed.data, usuario.codigoUsuario)
      return { ok: true, modo, ordenes }
    }

    const orden = await crearOrdenAmbulatorio(parsed.data, usuario.codigoUsuario)
    return {
      ok: true,
      modo,
      ordenes: [{ puestoNumero: orden.puestoNumero, numero: orden.numero }],
    }
  } catch (err) {
    console.error('[ORDEN] Error al crear desde admisión:', err)
    return { error: 'Error al generar la autorización' }
  }
}

export async function actualizarNumeroAutorizacionAction(
  puestoNumero: number,
  numero: number,
  numeroAutorizacion: string
) {
  const usuario = await getUsuarioSesion()

  const puedeModificar = tienePermiso(usuario.rol, 'AMBULATORIO', 'MODIFICAR')
  const puedeCrear = tienePermiso(usuario.rol, 'AMBULATORIO', 'CREAR')
  if (!puedeModificar && !puedeCrear) {
    return { error: 'Sin permiso para modificar órdenes' }
  }

  const nro = numeroAutorizacion.trim()
  if (!nro) return { error: 'El número de autorización no puede estar vacío' }

  try {
    await prisma.orden.update({
      where: { puestoNumero_numero: { puestoNumero, numero } },
      data: { numeroAutorizacion: nro.slice(0, 15) },
    })
    revalidatePath('/dashboard/ambulatorio')
    return { ok: true }
  } catch (err) {
    console.error('[ORDEN] Error al actualizar autorización:', err)
    return { error: 'Error al guardar el número de autorización' }
  }
}
