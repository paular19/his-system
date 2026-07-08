'use server'

import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { CrearOrdenSchema, type CrearOrdenInput } from '../schemas'
import { crearOrdenAmbulatorio, crearOrdenesAmbulatoriasPorPractica } from '../service'
import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  clasificacionDesdeIncluyeCodigo,
  contieneClasificacion,
  normalizarClasificacionAgrupacion,
  tituloDesdeClasificacion,
} from '../clasificacion'

type ModoGeneracion = 'MASIVA' | 'INDIVIDUAL' | 'AGRUPADA'
const MATRICULA_GASTOS_INTERNACION_DEFAULT = 995

const CrearOrdenDesdeAdmisionSchema = CrearOrdenSchema.extend({
  modoGeneracion: z.enum(['MASIVA', 'INDIVIDUAL', 'AGRUPADA']).optional().default('MASIVA'),
})

const CrearPedidoLaboratorioSchema = z.object({
  ingresoId: z.number().int().positive(),
  numeroProtocolo: z.string().trim().min(1, 'Ingresá el número de protocolo').max(50),
  diagnostico: z.string().trim().max(300).optional().default(''),
})

const GenerarOrdenesInternacionSchema = z.object({
  ingresoId: z.number().int().positive(),
  practicaIds: z.array(z.number().int().positive()).min(1, 'Seleccioná al menos una práctica'),
  clasificacionPorPracticaId: z.record(z.string()).optional().default({}),
  agruparEnUnaOrden: z.boolean().optional().default(false),
})

function inferirClasificacionPracticaDb(practica: {
  codigoPractica: string
  descripcionPractica: string
  matriculaEspecialista: number | null
  matriculaAnestesista: number | null
}): string {
  if (practica.codigoPractica.trim() === '66') return 'HE'

  const descripcion = (practica.descripcionPractica ?? '').toUpperCase()
  const match = descripcion.match(/\((HE|HA|GA|HP|A1|A2|A3)\)/)
  if (match?.[1]) return match[1]

  if (practica.matriculaAnestesista && !practica.matriculaEspecialista) return 'HA'
  if (practica.matriculaEspecialista && !practica.matriculaAnestesista) return 'HE'
  return 'HE'
}

function ordenarClaveClasificacion(a: string, b: string): number {
  const orden: Record<string, number> = {
    HE: 1,
    HA: 2,
    GA: 3,
    HP: 4,
    A1: 5,
    A2: 6,
    A3: 7,
  }
  const codeA = a.split('+')[0] ?? a
  const codeB = b.split('+')[0] ?? b
  const numA = orden[codeA] ?? 99
  const numB = orden[codeB] ?? 99
  if (numA !== numB) return numA - numB
  return a.localeCompare(b)
}

function claveClasificacionItem(item: CrearOrdenInput['items'][number]): string {
  if (item.codigoPractica.trim() === '66') return '__PROTOCOLO_BIOQUIMICO__'

  const clasificacion =
    normalizarClasificacionAgrupacion(item.clasificacionAgrupacion) ??
    clasificacionDesdeIncluyeCodigo(item.incluyeCodigo) ??
    'HE'

  return clasificacion
}

function tituloClasificacionGrupo(
  key: string,
  itemsGrupo: CrearOrdenInput['items']
): string {
  if (key === '__PROTOCOLO_BIOQUIMICO__') return 'PROTOCOLO BIOQUIMICO'

  const tituloPorClasificacion = tituloDesdeClasificacion(key)
  if (tituloPorClasificacion !== 'HONORARIOS') return tituloPorClasificacion

  const tituloItem = itemsGrupo.find((item) => Boolean(item.titularModular?.trim()))?.titularModular?.trim()
  if (tituloItem) return tituloItem

  return 'HONORARIO ESPECIALISTA'
}

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
      const grupos = new Map<string, typeof ordenData.items>()

      for (const item of ordenData.items) {
        const key = claveClasificacionItem(item)
        const arr = grupos.get(key) ?? []
        arr.push(item)
        grupos.set(key, arr)
      }

      const ordenes: Array<{ puestoNumero: number; numero: number }> = []
      const gruposOrdenados = Array.from(grupos.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      for (const [key, itemsGrupo] of gruposOrdenados) {
        const titularModular = tituloClasificacionGrupo(key, itemsGrupo)
        const esGrupoConDerechos = key === '__PROTOCOLO_BIOQUIMICO__'
          ? false
          : contieneClasificacion(key, 'GA')
        const esGrupoPatologia = key === '__PROTOCOLO_BIOQUIMICO__'
          ? false
          : contieneClasificacion(key, 'HP')

        const nombrePatologia = esGrupoPatologia
          ? itemsGrupo.find((item) => Boolean(item.nombrePatologia?.trim()))?.nombrePatologia?.trim() ?? undefined
          : undefined

        const itemsConClasificacion = itemsGrupo.map((item) => ({
          ...item,
          clasificacionAgrupacion:
            key === '__PROTOCOLO_BIOQUIMICO__'
              ? null
              : normalizarClasificacionAgrupacion(item.clasificacionAgrupacion) ?? key,
          titularModular,
          imprimirPorDuplicado: Boolean(item.imprimirPorDuplicado) || esGrupoConDerechos,
        }))

        const orden = await crearOrdenAmbulatorio(
          {
            ...ordenData,
            items: itemsConClasificacion,
            titularModular,
            imprimirPorDuplicado: esGrupoConDerechos,
            descripcionPatologia: esGrupoPatologia
              ? (nombrePatologia ?? ordenData.descripcionPatologia)
              : ordenData.descripcionPatologia,
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

export async function generarOrdenesDesdeInternacionAction(input: {
  ingresoId: number
  practicaIds: number[]
  clasificacionPorPracticaId?: Record<string, string>
  agruparEnUnaOrden?: boolean
}) {
  const usuario = await getUsuarioSesion()

  if (!tienePermiso(usuario.rol, 'AMBULATORIO', 'CREAR')) {
    return { error: 'Sin permiso para crear órdenes' }
  }

  const parsed = GenerarOrdenesInternacionSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Datos inválidos' }
  }

  try {
    const ingreso = await prisma.ingreso.findUnique({
      where: { id: parsed.data.ingresoId },
      select: {
        id: true,
        pacienteId: true,
        nombre: true,
        numeroAfiliado: true,
        obraSocialId: true,
        obraSocialCoseguroId: true,
        planCoseguroId: true,
        profesionalGuardiaId: true,
        profesionalTratanteId: true,
        paciente: {
          select: {
            id: true,
            nombreCompleto: true,
            numeroAfiliado: true,
          },
        },
      },
    })

    if (!ingreso) return { error: 'Internación no encontrada' }
    if (!ingreso.obraSocialId) return { error: 'La internación no tiene obra social asignada' }

    const practicas = await prisma.practica.findMany({
      where: {
        ingresoId: parsed.data.ingresoId,
        id: { in: parsed.data.practicaIds },
      },
      select: {
        id: true,
        convenioId: true,
        codigoPractica: true,
        fecha: true,
        cantidad: true,
        numeroAutorizacion: true,
        matriculaEspecialista: true,
        matriculaAnestesista: true,
        importeTotal: true,
        numeroProtocoloLab: true,
        diagnosticoLab: true,
        estado: true,
        ordenPractica: {
          where: {
            orden: {
              estado: { not: 'X' },
            },
          },
          select: { puestoNumero: true, ordenNumero: true },
        },
        nomencladorPractica: {
          select: { descripcion: true },
        },
      },
    })

    const practicasPendientes = practicas.filter((p) => {
      const estado = (p.estado ?? 'A').trim().toUpperCase()
      if (estado === 'X') return false
      if ((p.numeroAutorizacion?.trim().length ?? 0) > 0) return false
      return (p.ordenPractica?.length ?? 0) === 0
    })

    if (practicasPendientes.length === 0) {
      return { error: 'No hay prácticas pendientes para generar órdenes' }
    }

    const matriculaFirmanteDesdePractica =
      practicasPendientes
        .map((p) => (p.matriculaEspecialista != null && p.matriculaEspecialista > 0 ? p.matriculaEspecialista : null))
        .find((m): m is number => m != null) ?? null

    const profesionalPorPractica = matriculaFirmanteDesdePractica
      ? await prisma.profesional.findFirst({
          where: {
            matricula: matriculaFirmanteDesdePractica,
            estado: 'A',
          },
          select: { id: true },
        })
      : null

    let profesionalId =
      profesionalPorPractica?.id ??
      ingreso.profesionalTratanteId ??
      ingreso.profesionalGuardiaId ??
      null
    if (!profesionalId) {
      const profesionalFallback = await prisma.profesional.findFirst({
        where: { estado: 'A' },
        select: { id: true },
        orderBy: { id: 'asc' },
      })
      profesionalId = profesionalFallback?.id ?? null
    }
    if (!profesionalId) return { error: 'No hay profesional disponible para emitir la orden' }

    const grupos = new Map<string, Array<{
      item: CrearOrdenInput['items'][number]
      practicaId: number
    }>>()

    for (const practica of practicasPendientes) {
      const descripcionPractica = practica.codigoPractica.trim() === '66'
        ? 'PROTOCOLO BIOQUIMICO'
        : (practica.nomencladorPractica?.descripcion?.trim() || practica.codigoPractica.trim())

      const clasificacionDesdeInput = normalizarClasificacionAgrupacion(
        parsed.data.clasificacionPorPracticaId[String(practica.id)]
      )
      const clasificacionInferida = inferirClasificacionPracticaDb({
        codigoPractica: practica.codigoPractica,
        descripcionPractica,
        matriculaEspecialista: practica.matriculaEspecialista,
        matriculaAnestesista: practica.matriculaAnestesista,
      })
      const clasificacion = clasificacionDesdeInput ?? clasificacionInferida
      const key = parsed.data.agruparEnUnaOrden
        ? '__AGRUPAR_EN_UNA_ORDEN__'
        : (practica.codigoPractica.trim() === '66' ? '__PROTOCOLO_BIOQUIMICO__' : clasificacion)
      const esClasificacionSoloGastos =
        contieneClasificacion(clasificacion, 'GA') &&
        !contieneClasificacion(clasificacion, 'HE') &&
        !contieneClasificacion(clasificacion, 'HA') &&
        !contieneClasificacion(clasificacion, 'HP') &&
        !contieneClasificacion(clasificacion, 'A1') &&
        !contieneClasificacion(clasificacion, 'A2') &&
        !contieneClasificacion(clasificacion, 'A3')
      const esClasificacionSoloAyudante =
        (contieneClasificacion(clasificacion, 'A1') ||
          contieneClasificacion(clasificacion, 'A2') ||
          contieneClasificacion(clasificacion, 'A3')) &&
        !contieneClasificacion(clasificacion, 'HE') &&
        !contieneClasificacion(clasificacion, 'HA') &&
        !contieneClasificacion(clasificacion, 'GA') &&
        !contieneClasificacion(clasificacion, 'HP')

      const item: CrearOrdenInput['items'][number] = {
        practicaId: practica.id,
        convenioId: practica.convenioId,
        codigoPractica: practica.codigoPractica.trim().slice(0, 8),
        descripcionPractica,
        cantidad: Number(practica.cantidad ?? 1),
        fecha: practica.fecha,
        tipoFacturacion: 'H',
        clasificacionAgrupacion: key === '__PROTOCOLO_BIOQUIMICO__' ? 'HE' : clasificacion,
        efectorMatricula:
          esClasificacionSoloGastos || esClasificacionSoloAyudante
            ? MATRICULA_GASTOS_INTERNACION_DEFAULT
            : clasificacion === 'HA'
            ? (practica.matriculaAnestesista ?? null)
            : (practica.matriculaEspecialista ?? practica.matriculaAnestesista ?? null),
        numeroAutorizacion: practica.numeroAutorizacion,
        importeTotal: practica.importeTotal != null ? Number(practica.importeTotal) : undefined,
      }

      const arr = grupos.get(key) ?? []
      arr.push({ item, practicaId: practica.id })
      grupos.set(key, arr)
    }

    const nombrePaciente = (
      ingreso.paciente?.nombreCompleto?.trim() ||
      ingreso.nombre?.trim() ||
      ''
    )
    if (!nombrePaciente) return { error: 'No se pudo resolver el nombre del paciente' }

    const numeroAfiliado = (
      ingreso.numeroAfiliado?.trim() ||
      ingreso.paciente?.numeroAfiliado?.trim() ||
      ''
    ).slice(0, 30)

    const gruposOrdenados = parsed.data.agruparEnUnaOrden
      ? Array.from(grupos.entries())
      : Array.from(grupos.entries()).sort((a, b) => {
          if (a[0] === '__PROTOCOLO_BIOQUIMICO__') return -1
          if (b[0] === '__PROTOCOLO_BIOQUIMICO__') return 1
          return ordenarClaveClasificacion(a[0], b[0])
        })

    const ordenesPorGrupo: Array<{
      clasificacion: string
      puestoNumero: number
      numero: number
      practicaIds: number[]
    }> = []
    const asignaciones: Array<{
      practicaId: number
      puestoNumero: number
      numero: number
      item: number
    }> = []

    for (const [key, itemsGrupo] of gruposOrdenados) {
      const esGrupoAgrupado = key === '__AGRUPAR_EN_UNA_ORDEN__'
      const clasificacion = esGrupoAgrupado ? 'AGRUPADA' : (key === '__PROTOCOLO_BIOQUIMICO__' ? 'HE' : key)
      const esGrupoConDerechos = esGrupoAgrupado
        ? itemsGrupo.some(({ item }) => contieneClasificacion(item.clasificacionAgrupacion, 'GA'))
        : (key !== '__PROTOCOLO_BIOQUIMICO__' && contieneClasificacion(clasificacion, 'GA'))
      const titularModular = esGrupoAgrupado
        ? 'HONORARIOS'
        : key === '__PROTOCOLO_BIOQUIMICO__'
        ? 'PROTOCOLO BIOQUIMICO'
        : tituloDesdeClasificacion(clasificacion)

      const orden = await crearOrdenAmbulatorio(
        {
          ingresoId: ingreso.id,
          pacienteId: ingreso.pacienteId ?? ingreso.paciente?.id ?? undefined,
          nombrePaciente: nombrePaciente.slice(0, 50),
          numeroAfiliado,
          obraSocialId: ingreso.obraSocialId,
          obraSocialCoseguroId: ingreso.obraSocialCoseguroId ?? undefined,
          planCoseguroId: ingreso.planCoseguroId ?? undefined,
          profesionalId,
          tipoOrdenCodigo: 'PRA',
          titularModular,
          imprimirPorDuplicado: esGrupoConDerechos,
          items: itemsGrupo.map(({ item }) => ({
            ...item,
            clasificacionAgrupacion:
              key === '__PROTOCOLO_BIOQUIMICO__'
                ? null
                : normalizarClasificacionAgrupacion(item.clasificacionAgrupacion) ?? (esGrupoAgrupado ? 'HE' : clasificacion),
            titularModular,
            imprimirPorDuplicado: Boolean(item.imprimirPorDuplicado) || esGrupoConDerechos,
          })),
        },
        usuario.codigoUsuario
      )

      const practicaIdsGrupo = itemsGrupo.map((x) => x.practicaId)
      ordenesPorGrupo.push({
        clasificacion,
        puestoNumero: orden.puestoNumero,
        numero: orden.numero,
        practicaIds: practicaIdsGrupo,
      })

      itemsGrupo.forEach((x, idx) => {
        asignaciones.push({
          practicaId: x.practicaId,
          puestoNumero: orden.puestoNumero,
          numero: orden.numero,
          item: idx + 1,
        })
      })
    }

    revalidatePath('/dashboard/ambulatorio')
    revalidatePath('/dashboard/internacion')
    revalidatePath('/dashboard/admision')
    revalidatePath(`/dashboard/internacion/${ingreso.id}`)
    revalidatePath(`/dashboard/admision/${ingreso.id}`)

    return {
      ok: true,
      ordenesPorGrupo,
      asignaciones,
    }
  } catch (err) {
    console.error('[ORDEN] Error al generar desde internación:', err)
    return { error: err instanceof Error ? err.message : 'Error al generar órdenes desde internación' }
  }
}

export async function crearPedidoLaboratorioAction(input: {
  ingresoId: number
  numeroProtocolo: string
  diagnostico: string
}) {
  const usuario = await getUsuarioSesion()

  if (!tienePermiso(usuario.rol, 'AMBULATORIO', 'CREAR')) {
    return { error: 'Sin permiso para crear órdenes' }
  }

  const parsed = CrearPedidoLaboratorioSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Datos inválidos' }
  }

  try {
    const ingreso = await prisma.ingreso.findUnique({
      where: { id: parsed.data.ingresoId },
      select: {
        id: true,
        pacienteId: true,
        nombre: true,
        numeroAfiliado: true,
        obraSocialId: true,
        obraSocialCoseguroId: true,
        planCoseguroId: true,
        profesionalGuardiaId: true,
        profesionalTratanteId: true,
        paciente: {
          select: {
            id: true,
            nombreCompleto: true,
            numeroAfiliado: true,
          },
        },
      },
    })

    if (!ingreso) {
      return { error: 'Admisión no encontrada' }
    }

    if (!ingreso.obraSocialId) {
      return { error: 'La admisión no tiene obra social asignada' }
    }

    let profesionalId = ingreso.profesionalTratanteId ?? ingreso.profesionalGuardiaId ?? null
    if (!profesionalId) {
      const profesionalFallback = await prisma.profesional.findFirst({
        select: { id: true },
        orderBy: { id: 'asc' },
      })
      profesionalId = profesionalFallback?.id ?? null
    }

    if (!profesionalId) {
      return { error: 'No hay profesional disponible para emitir la orden' }
    }

    const nombrePaciente = (
      ingreso.paciente?.nombreCompleto?.trim() ||
      ingreso.nombre?.trim() ||
      ''
    )

    if (!nombrePaciente) {
      return { error: 'No se pudo resolver el nombre del paciente' }
    }

    const numeroAfiliado = (
      ingreso.numeroAfiliado?.trim() ||
      ingreso.paciente?.numeroAfiliado?.trim() ||
      ''
    ).slice(0, 30)

    const numeroProtocolo = parsed.data.numeroProtocolo.trim()
    const diagnostico = parsed.data.diagnostico.trim()

    const orden = await crearOrdenAmbulatorio(
      {
        ingresoId: ingreso.id,
        pacienteId: ingreso.pacienteId ?? ingreso.paciente?.id ?? undefined,
        nombrePaciente: nombrePaciente.slice(0, 50),
        numeroAfiliado,
        obraSocialId: ingreso.obraSocialId,
        obraSocialCoseguroId: ingreso.obraSocialCoseguroId ?? undefined,
        planCoseguroId: ingreso.planCoseguroId ?? undefined,
        profesionalId,
        tipoOrdenCodigo: 'PRA',
        descripcionPatologia: diagnostico || undefined,
        descripcion: `PROTOCOLO N°${numeroProtocolo}`,
        items: [
          {
            convenioId: ingreso.obraSocialId,
            codigoPractica: '66',
            descripcionPractica: 'PROTOCOLO BIOQUIMICO',
            cantidad: 1,
            fecha: new Date(),
            tipoFacturacion: 'H',
            clasificacionAgrupacion: 'HE',
            titularModular: 'PROTOCOLO BIOQUIMICO',
          },
        ],
      },
      usuario.codigoUsuario
    )

    revalidatePath('/dashboard/ambulatorio')
    revalidatePath(`/dashboard/ambulatorio/${orden.puestoNumero}/${orden.numero}`)
    revalidatePath('/dashboard/facturacion')
    revalidatePath('/dashboard/internacion')
    revalidatePath('/dashboard/admision')
    revalidatePath(`/dashboard/internacion/${ingreso.id}`)
    revalidatePath(`/dashboard/admision/${ingreso.id}`)

    return {
      ok: true,
      puestoNumero: orden.puestoNumero,
      numero: orden.numero,
    }
  } catch (err) {
    console.error('[ORDEN] Error al crear pedido de laboratorio:', err)
    return { error: err instanceof Error ? err.message : 'Error al generar el pedido de laboratorio' }
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
      select: { estado: true, numeroAutorizacion: true, ingresoId: true },
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
    if (orden.ingresoId != null) {
      revalidatePath('/dashboard/internacion')
      revalidatePath('/dashboard/admision')
      revalidatePath(`/dashboard/internacion/${orden.ingresoId}`)
      revalidatePath(`/dashboard/admision/${orden.ingresoId}`)
    }
    return { ok: true }
  } catch (err) {
    console.error('[ORDEN] Error al anular orden:', err)
    return { error: 'Error al anular la orden' }
  }
}
