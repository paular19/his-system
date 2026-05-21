'use server'

import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { CrearOrdenSchema, type CrearOrdenInput } from '../schemas'
import { crearOrdenAmbulatorio, crearOrdenesAmbulatoriasPorPractica } from '../service'
import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

type ModoGeneracion = 'MASIVA' | 'INDIVIDUAL' | 'AGRUPADA'

const CrearOrdenDesdeAdmisionSchema = CrearOrdenSchema.extend({
  modoGeneracion: z.enum(['MASIVA', 'INDIVIDUAL', 'AGRUPADA']).optional().default('MASIVA'),
})

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
    return { error: err instanceof Error ? err.message : 'Error al generar la autorización' }
  }
}

export async function crearOrdenesDesdeAdmisionAction(
  input: CrearOrdenInput & { modoGeneracion?: ModoGeneracion }
) {
  const usuario = await getUsuarioSesion()

  if (!tienePermiso(usuario.rol, 'AMBULATORIO', 'CREAR')) {
    return { error: 'Sin permiso para crear órdenes' }
  }

  const parsed = CrearOrdenDesdeAdmisionSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Datos inválidos' }
  }

  const { modoGeneracion, ...ordenData } = parsed.data
  const modo = modoGeneracion

  try {
    if (modo === 'INDIVIDUAL') {
      const ordenes = await crearOrdenesAmbulatoriasPorPractica(ordenData, usuario.codigoUsuario)
      return { ok: true, modo, ordenes }
    }

    if (modo === 'AGRUPADA') {
      // Agrupar por grupoOrden y aplicar título/profesional por grupo
      const grupos = new Map<number, typeof ordenData.items>()
      const titularPorGrupo = new Map<number, string>()
      const matriculaPatologiaPorGrupo = new Map<number, number>()
      const nombrePatologiaPorGrupo = new Map<number, string>()

      for (const item of ordenData.items) {
        const grupo = Number.isFinite(Number(item.grupoOrden)) && Number(item.grupoOrden) > 0
          ? Math.floor(Number(item.grupoOrden))
          : 1
        const arr = grupos.get(grupo) ?? []
        arr.push(item)
        grupos.set(grupo, arr)
        // Guardar título/modular por grupo si está presente
        if (item.titularModular) titularPorGrupo.set(grupo, item.titularModular)
        // Patología: guardar nombre/matricula si están presentes
        if (item.titularModular && item.titularModular.toUpperCase().includes('PATOLOG')) {
          if (item.matriculaPatologia) {
            matriculaPatologiaPorGrupo.set(grupo, item.matriculaPatologia)
          }
          if (item.nombrePatologia) {
            nombrePatologiaPorGrupo.set(grupo, item.nombrePatologia)
          }
        }
      }

      const ordenes: Array<{ puestoNumero: number; numero: number }> = []
      const gruposOrdenados = Array.from(grupos.entries()).sort((a, b) => a[0] - b[0])
      for (const [grupo, itemsGrupo] of gruposOrdenados) {
        // Detectar título y profesional/matricula para este grupo
        const titularModular = titularPorGrupo.get(grupo) ?? undefined
        // Patología: nombre y matricula
        const matriculaPatologia = matriculaPatologiaPorGrupo.has(grupo) ? matriculaPatologiaPorGrupo.get(grupo) : undefined
        const nombrePatologia = nombrePatologiaPorGrupo.has(grupo) ? nombrePatologiaPorGrupo.get(grupo) : undefined

        // Si el título es PATOLOGÍA, setear profesionalId/matricula/nombre si corresponde
        let profesionalId = ordenData.profesionalId
        let descripcionPatologia = ordenData.descripcionPatologia
        if (titularModular && titularModular.toUpperCase().includes('PATOLOG')) {
          if (matriculaPatologia) {
            // Si hay una matrícula de patología, buscar el profesionalId correspondiente
            // (esto requiere que el frontend envíe el id o que se resuelva aquí, si no, dejar el global)
            // Si no se puede resolver, dejar el profesionalId global
          }
          if (nombrePatologia) {
            descripcionPatologia = nombrePatologia
          }
        }

        const orden = await crearOrdenAmbulatorio(
          {
            ...ordenData,
            items: itemsGrupo,
            titularModular,
            profesionalId,
            descripcionPatologia,
          },
          usuario.codigoUsuario
        )
        ordenes.push({ puestoNumero: orden.puestoNumero, numero: orden.numero })
      }

      return { ok: true, modo, ordenes }
    }

    const orden = await crearOrdenAmbulatorio(ordenData, usuario.codigoUsuario)
    return {
      ok: true,
      modo,
      ordenes: [{ puestoNumero: orden.puestoNumero, numero: orden.numero }],
    }
  } catch (err) {
    console.error('[ORDEN] Error al crear desde admisión:', err)
    return { error: err instanceof Error ? err.message : 'Error al generar la autorización' }
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
  const numeroNormalizado = nro.slice(0, 15)

  try {
    await prisma.$transaction(async (tx) => {
      await tx.orden.update({
        where: { puestoNumero_numero: { puestoNumero, numero } },
        data: { numeroAutorizacion: numeroNormalizado },
      })

      await tx.ordenPractica.updateMany({
        where: { puestoNumero, ordenNumero: numero },
        data: { numeroAutorizacion: numeroNormalizado },
      })

      const vinculadas = await tx.ordenPractica.findMany({
        where: { puestoNumero, ordenNumero: numero, practicaId: { not: null } },
        select: { practicaId: true },
      })

      const practicaIds = Array.from(
        new Set(
          vinculadas
            .map((v) => v.practicaId)
            .filter((id): id is number => typeof id === 'number' && id > 0)
        )
      )

      if (practicaIds.length > 0) {
        await tx.practica.updateMany({
          where: { id: { in: practicaIds } },
          data: { numeroAutorizacion: numeroNormalizado },
        })
      }
    })

    revalidatePath('/dashboard/ambulatorio')
    revalidatePath('/dashboard/cirugia')
    return { ok: true }
  } catch (err) {
    console.error('[ORDEN] Error al actualizar autorización:', err)
    return { error: 'Error al guardar el número de autorización' }
  }
}

export async function anularOrdenAction(puestoNumero: number, numero: number) {
  const usuario = await getUsuarioSesion()

  const puedeModificar = tienePermiso(usuario.rol, 'AMBULATORIO', 'MODIFICAR')
  const puedeCrear = tienePermiso(usuario.rol, 'AMBULATORIO', 'CREAR')
  if (!puedeModificar && !puedeCrear) {
    return { error: 'Sin permiso para anular órdenes' }
  }

  try {
    const orden = await prisma.orden.findUnique({
      where: { puestoNumero_numero: { puestoNumero, numero } },
      select: { estado: true, numeroAutorizacion: true },
    })

    if (!orden) {
      return { error: 'Orden no encontrada' }
    }

    const estado = (orden.estado ?? '').trim().toUpperCase()
    if (estado === 'X') {
      return { error: 'La orden ya está anulada' }
    }

    if ((orden.numeroAutorizacion ?? '').trim().length > 0) {
      return { error: 'Solo se pueden anular órdenes pendientes' }
    }

    await prisma.orden.update({
      where: { puestoNumero_numero: { puestoNumero, numero } },
      data: {
        estado: 'X',
        fechaEstado: new Date(),
      },
    })

    revalidatePath('/dashboard/ambulatorio')
    revalidatePath(`/dashboard/ambulatorio/${puestoNumero}/${numero}`)
    return { ok: true }
  } catch (err) {
    console.error('[ORDEN] Error al anular orden:', err)
    return { error: 'Error al anular la orden' }
  }
}
