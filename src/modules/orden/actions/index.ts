'use server'

import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { CrearOrdenSchema, type CrearOrdenInput } from '../schemas'
import { crearOrdenAmbulatorio, crearOrdenesAmbulatoriasPorPractica } from '../service'
import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { crearPractica as crearPracticaInternacion } from '@/modules/internacion/service'
import { claveDiaArgentina, fechaDesdeClaveArgentina } from '@/lib/utils/argentina-date'
import {
  clasificacionDesdeIncluyeCodigo,
  contieneClasificacion,
  normalizarClasificacionAgrupacion,
  tituloDesdeClasificacion,
} from '../clasificacion'

type ModoGeneracion = 'MASIVA' | 'INDIVIDUAL' | 'AGRUPADA'
const MATRICULA_GASTOS_INTERNACION_DEFAULT = 9995
const MATRICULA_AYUDANTE_INTERNACION_DEFAULT = 995
const MATRICULA_ANESTESISTA_INTERNACION_DEFAULT = 6
const MATRICULA_PATOLOGIA_DEFAULT = 2675
const MATRICULA_AMBULATORIO_DEFAULT = 9110
const ORDEN_CLASIFICACION_COMPONENTES = ['HE', 'HA', 'GA', 'HP', 'A1', 'A2', 'A3'] as const
type ClasificacionComponente = (typeof ORDEN_CLASIFICACION_COMPONENTES)[number]

function normalizarFechaOrdenArgentina(value: Date | string | null | undefined): Date {
  const clave = claveDiaArgentina(value)
  if (clave) return fechaDesdeClaveArgentina(clave)

  const parsed = value ? new Date(value) : new Date()
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

async function resolverObraSocialParticularId(): Promise<number> {
  const particularPorIdEstandar = await prisma.obraSocial.findFirst({
    where: {
      id: 500,
    },
    select: { id: true },
  })
  if (particularPorIdEstandar) {
    const particular500Activa = await prisma.obraSocial.findFirst({
      where: { id: 500, estado: 'A' },
      select: { id: true },
    })
    if (!particular500Activa) {
      console.warn('[ORDEN] Usando OS id 500 para PARTICULAR aunque no esté activa')
    }
    return particularPorIdEstandar.id
  }

  const particularPorNombre = await prisma.obraSocial.findFirst({
    where: {
      estado: 'A',
      OR: [
        { nombre: { contains: 'PARTICULAR', mode: 'insensitive' } },
        { nombre: { contains: 'SIN COBERTURA', mode: 'insensitive' } },
        { nombre: { contains: 'PRIVADO', mode: 'insensitive' } },
      ],
    },
    orderBy: { id: 'asc' },
    select: { id: true },
  })

  if (particularPorNombre) {
    console.warn('[ORDEN] OS PARTICULAR resuelta por nombre (fallback)')
    return particularPorNombre.id
  }

  const particularPorNombreSinEstado = await prisma.obraSocial.findFirst({
    where: {
      OR: [
        { nombre: { contains: 'PARTICULAR', mode: 'insensitive' } },
        { nombre: { contains: 'SIN COBERTURA', mode: 'insensitive' } },
        { nombre: { contains: 'PRIVADO', mode: 'insensitive' } },
      ],
    },
    orderBy: { id: 'asc' },
    select: { id: true },
  })
  if (particularPorNombreSinEstado) {
    console.warn('[ORDEN] OS PARTICULAR resuelta por nombre sin filtro de estado (fallback)')
    return particularPorNombreSinEstado.id
  }

  const obraSocialActivaFallback = await prisma.obraSocial.findFirst({
    where: { estado: 'A' },
    orderBy: { id: 'asc' },
    select: { id: true, nombre: true },
  })
  if (obraSocialActivaFallback) {
    console.warn(
      `[ORDEN] No se encontró OS PARTICULAR. Se usa OS activa ${obraSocialActivaFallback.id} - ${obraSocialActivaFallback.nombre}`
    )
    return obraSocialActivaFallback.id
  }

  const obraSocialFallback = await prisma.obraSocial.findFirst({
    orderBy: { id: 'asc' },
    select: { id: true, nombre: true },
  })
  if (obraSocialFallback) {
    console.warn(
      `[ORDEN] No hay OS activas. Se usa OS ${obraSocialFallback.id} - ${obraSocialFallback.nombre}`
    )
    return obraSocialFallback.id
  }

  throw new Error('No se encontró ninguna obra social para emitir la orden')
}

const CrearOrdenDesdeAdmisionSchema = CrearOrdenSchema.extend({
  obraSocialId: z.preprocess(
    (value) => (
      value == null || value === '' || (typeof value === 'number' && Number.isNaN(value))
        ? undefined
        : value
    ),
    z.number().int().positive().optional()
  ),
  obraSocialCoseguroId: z.preprocess(
    (value) => (
      value == null || value === '' || (typeof value === 'number' && Number.isNaN(value))
        ? undefined
        : value
    ),
    z.number().int().positive().optional()
  ),
  planCoseguroId: z.preprocess(
    (value) => (
      value == null || value === '' || (typeof value === 'number' && Number.isNaN(value))
        ? undefined
        : value
    ),
    z.number().int().positive().optional()
  ),
  modoGeneracion: z.enum(['MASIVA', 'INDIVIDUAL', 'AGRUPADA']).optional().default('MASIVA'),
})

const CrearPedidoLaboratorioSchema = z.object({
  ingresoId: z.number().int().positive(),
  fecha: z.string().datetime().optional(),
  numeroProtocolo: z.string().trim().min(1, 'Ingresá el número de protocolo').max(50),
  diagnostico: z.string().trim().max(300).optional().default(''),
})

const GenerarOrdenesInternacionSchema = z.object({
  ingresoId: z.number().int().positive(),
  practicaIds: z.array(z.number().int().positive()).optional().default([]),
  clasificacionPorPracticaId: z.record(z.string()).optional().default({}),
  agruparEnUnaOrden: z.boolean().optional().default(false),
  separarPorPractica: z.boolean().optional().default(false),
  separarPorSubitem: z.boolean().optional().default(false),
  titularOrdenAgrupada: z.string().trim().max(120).optional().nullable(),
  cirujanoFirmanteMatricula: z.number().int().positive().optional().nullable(),
  origenGeneracion: z.enum(['PRACTICAS', 'CIRUGIA', 'AUTO']).optional().default('PRACTICAS'),
})

function componentesClasificacion(
  clasificacion: string | null | undefined
): ClasificacionComponente[] {
  const normalizada = normalizarClasificacionAgrupacion(clasificacion)
  if (!normalizada) return []

  return normalizada
    .split('+')
    .filter((token): token is ClasificacionComponente =>
      ORDEN_CLASIFICACION_COMPONENTES.includes(token as ClasificacionComponente)
    )
}

function titularSugeridoParaOrdenAgrupada(items: CrearOrdenInput['items']): string {
  const presentes = new Set<ClasificacionComponente>()
  for (const item of items) {
    const componentes = componentesClasificacion(item.clasificacionAgrupacion)
    for (const componente of componentes) presentes.add(componente)
  }

  const clasificacionCombinada = ORDEN_CLASIFICACION_COMPONENTES
    .filter((componente) => presentes.has(componente))
    .join('+')

  if (!clasificacionCombinada) return 'HONORARIOS'
  return tituloDesdeClasificacion(clasificacionCombinada)
}

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
  input: Omit<CrearOrdenInput, 'obraSocialId' | 'obraSocialCoseguroId' | 'planCoseguroId'> & {
    obraSocialId?: number
    obraSocialCoseguroId?: number
    planCoseguroId?: number
    modoGeneracion?: ModoGeneracion
  }
) {
  const usuario = await getUsuarioSesion()

  if (!tienePermiso(usuario.rol, 'AMBULATORIO', 'CREAR')) {
    return { error: 'Sin permiso para crear órdenes' }
  }

  const parsed = CrearOrdenDesdeAdmisionSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Datos inválidos' }
  }

  const { modoGeneracion, ...ordenDataBase } = parsed.data
  const modo = modoGeneracion

  try {
    const ingresoContexto = ordenDataBase.ingresoId
      ? await prisma.ingreso.findUnique({
          where: { id: ordenDataBase.ingresoId },
          select: {
            tipoIngresoCodigo: true,
            obraSocialId: true,
            obraSocialCoseguroId: true,
            planCoseguroId: true,
            ingresoSubtipo: {
              select: { subtipoAdmisionCodigo: true },
            },
          },
        })
      : null

    const obraSocialOrdenId =
      ordenDataBase.obraSocialId ??
      ingresoContexto?.obraSocialId ??
      await resolverObraSocialParticularId()

    const tieneObraSocialEnIngreso =
      (ingresoContexto?.obraSocialId ?? ordenDataBase.obraSocialId ?? null) != null

    const esGuardiaAmbulatoria =
      (ingresoContexto?.tipoIngresoCodigo ?? '').trim().toUpperCase() === 'AMB' &&
      (ingresoContexto?.ingresoSubtipo?.subtipoAdmisionCodigo ?? '').trim().toUpperCase() === 'GUA'

    const profesionalGuardia9110 = esGuardiaAmbulatoria
      ? await prisma.profesional.findFirst({
          where: {
            matricula: MATRICULA_AMBULATORIO_DEFAULT,
            estado: 'A',
          },
          select: { id: true },
          orderBy: { id: 'asc' },
        })
      : null

    const ordenData = {
      ...ordenDataBase,
      obraSocialId: obraSocialOrdenId,
      obraSocialCoseguroId: tieneObraSocialEnIngreso
        ? (ordenDataBase.obraSocialCoseguroId ?? ingresoContexto?.obraSocialCoseguroId ?? undefined)
        : undefined,
      planCoseguroId: tieneObraSocialEnIngreso
        ? (ordenDataBase.planCoseguroId ?? ingresoContexto?.planCoseguroId ?? undefined)
        : undefined,
      profesionalId: esGuardiaAmbulatoria
        ? (profesionalGuardia9110?.id ?? ordenDataBase.profesionalId)
        : ordenDataBase.profesionalId,
      items: ordenDataBase.items.map((item) => ({
        ...item,
        fecha: item.fecha ? normalizarFechaOrdenArgentina(item.fecha) : item.fecha,
        efectorMatricula: esGuardiaAmbulatoria
          ? MATRICULA_AMBULATORIO_DEFAULT
          : item.efectorMatricula,
      })),
    }

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
  practicaIds?: number[]
  clasificacionPorPracticaId?: Record<string, string>
  agruparEnUnaOrden?: boolean
  separarPorPractica?: boolean
  separarPorSubitem?: boolean
  titularOrdenAgrupada?: string | null
  cirujanoFirmanteMatricula?: number | null
  origenGeneracion?: 'PRACTICAS' | 'CIRUGIA' | 'AUTO'
}) {
  const usuario = await getUsuarioSesion()

  const puedeCrearOrden =
    tienePermiso(usuario.rol, 'AMBULATORIO', 'CREAR') ||
    tienePermiso(usuario.rol, 'INTERNACION', 'CREAR')
  if (!puedeCrearOrden) {
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
        tipoIngresoCodigo: true,
        ingresoSubtipo: {
          select: {
            subtipoAdmisionCodigo: true,
          },
        },
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

    const tipoIngresoCodigoNormalizado = (ingreso.tipoIngresoCodigo ?? '').trim().toUpperCase()
    const esIngresoInternacion = tipoIngresoCodigoNormalizado === 'INT'
    const origenGeneracion = parsed.data.origenGeneracion
    const esFlujoCirugiaInternacion = esIngresoInternacion && origenGeneracion === 'CIRUGIA'

    const esGuardiaAmbulatoria =
      tipoIngresoCodigoNormalizado === 'AMB' &&
      (ingreso.ingresoSubtipo?.subtipoAdmisionCodigo ?? '').trim().toUpperCase() === 'GUA'

    const profesionalGuardia9110 = esGuardiaAmbulatoria
      ? await prisma.profesional.findFirst({
          where: {
            matricula: MATRICULA_AMBULATORIO_DEFAULT,
            estado: 'A',
          },
          select: { id: true },
          orderBy: { id: 'asc' },
        })
      : null

    const obraSocialOrdenId = ingreso.obraSocialId ?? await resolverObraSocialParticularId()

    const idsSolicitados = parsed.data.practicaIds
    const practicas = await prisma.practica.findMany({
      where: {
        ingresoId: parsed.data.ingresoId,
        ...(idsSolicitados.length > 0 ? { id: { in: idsSolicitados } } : {}),
        OR: [{ estado: null }, { estado: { not: 'X' } }],
        ordenPractica: {
          none: {
            orden: {
              estado: { not: 'X' },
            },
          },
        },
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
        nomencladorPractica: {
          select: { descripcion: true },
        },
      },
    })

    const practicasPendientes = practicas

    if (practicasPendientes.length === 0) {
      return { error: 'No hay prácticas pendientes para generar órdenes' }
    }

    const profesionalTratante = ingreso.profesionalTratanteId
      ? await prisma.profesional.findUnique({
          where: { id: ingreso.profesionalTratanteId },
          select: { id: true, matricula: true },
        })
      : null
    const matriculaTratante =
      profesionalTratante?.matricula != null && profesionalTratante.matricula > 0
        ? profesionalTratante.matricula
        : null

    const practicasPendientesPorId = new Map(practicasPendientes.map((practica) => [practica.id, practica] as const))
    const matriculaFirmanteManualBase =
      parsed.data.cirujanoFirmanteMatricula != null && parsed.data.cirujanoFirmanteMatricula > 0
        ? parsed.data.cirujanoFirmanteMatricula
        : null
    const matriculaFirmanteManual =
      esGuardiaAmbulatoria
        ? MATRICULA_AMBULATORIO_DEFAULT
        : esFlujoCirugiaInternacion
        ? matriculaFirmanteManualBase
        : esIngresoInternacion
        ? null
        : matriculaFirmanteManualBase

    const esMatriculaEspecialistaFirmanteValida = (practica: (typeof practicasPendientes)[number]): boolean => {
      const matricula = practica.matriculaEspecialista
      if (matricula == null || matricula <= 0) return false
      if (matricula === MATRICULA_PATOLOGIA_DEFAULT) return false
      return !practica.codigoPractica.trim().startsWith('15')
    }

    const matriculaFirmanteDesdePractica =
      practicasPendientes
        .map((p) => (esMatriculaEspecialistaFirmanteValida(p) ? p.matriculaEspecialista : null))
        .find((m): m is number => m != null) ?? null
    const matriculaFirmanteEfectiva =
      matriculaFirmanteManual ??
      (esFlujoCirugiaInternacion
        ? (matriculaTratante ?? matriculaFirmanteDesdePractica)
        : matriculaFirmanteDesdePractica)

    const matriculasFirmantesBuscadas = new Set<number>()
    if (matriculaFirmanteManual) matriculasFirmantesBuscadas.add(matriculaFirmanteManual)
    if (matriculaFirmanteDesdePractica) matriculasFirmantesBuscadas.add(matriculaFirmanteDesdePractica)
    if (matriculaTratante) matriculasFirmantesBuscadas.add(matriculaTratante)
    if (!esGuardiaAmbulatoria) {
      matriculasFirmantesBuscadas.add(MATRICULA_ANESTESISTA_INTERNACION_DEFAULT)
      matriculasFirmantesBuscadas.add(MATRICULA_AYUDANTE_INTERNACION_DEFAULT)
      matriculasFirmantesBuscadas.add(MATRICULA_GASTOS_INTERNACION_DEFAULT)
    }
    for (const practica of practicasPendientes) {
      if (practica.matriculaEspecialista != null && practica.matriculaEspecialista > 0) {
        matriculasFirmantesBuscadas.add(practica.matriculaEspecialista)
      }
      if (!esMatriculaEspecialistaFirmanteValida(practica)) continue
      matriculasFirmantesBuscadas.add(practica.matriculaEspecialista!)
    }

    const profesionalesFirmantes = matriculasFirmantesBuscadas.size > 0
      ? await prisma.profesional.findMany({
          where: {
            matricula: { in: Array.from(matriculasFirmantesBuscadas) },
            estado: 'A',
          },
          select: { id: true, matricula: true },
        })
      : []

    const profesionalIdPorMatricula = new Map<number, number>()
    for (const profesional of profesionalesFirmantes) {
      if (profesional.matricula == null) continue
      profesionalIdPorMatricula.set(profesional.matricula, profesional.id)
    }

    const profesionalIdCirujanoFirmante =
      esFlujoCirugiaInternacion
        ? (
            (matriculaFirmanteManual != null
              ? (profesionalIdPorMatricula.get(matriculaFirmanteManual) ?? null)
              : null) ??
            ingreso.profesionalTratanteId ??
            (matriculaFirmanteEfectiva != null
              ? (profesionalIdPorMatricula.get(matriculaFirmanteEfectiva) ?? null)
              : null)
          )
        : (matriculaFirmanteEfectiva != null
          ? (profesionalIdPorMatricula.get(matriculaFirmanteEfectiva) ?? null)
          : null)

    if (esFlujoCirugiaInternacion && !profesionalIdCirujanoFirmante) {
      return { error: 'No se encontró el cirujano firmante para emitir las órdenes de cirugía' }
    }

    const profesionalIdManual = esGuardiaAmbulatoria
      ? (profesionalGuardia9110?.id ?? null)
      : matriculaFirmanteManual != null
        ? (profesionalIdPorMatricula.get(matriculaFirmanteManual) ?? null)
        : null

    const profesionalIdPorPractica =
      matriculaFirmanteDesdePractica != null
        ? (profesionalIdPorMatricula.get(matriculaFirmanteDesdePractica) ?? null)
        : null

    let profesionalIdFallback =
      profesionalIdPorPractica ??
      ingreso.profesionalTratanteId ??
      ingreso.profesionalGuardiaId ??
      null
    if (!profesionalIdFallback) {
      const profesionalFallback = await prisma.profesional.findFirst({
        where: { estado: 'A' },
        select: { id: true },
        orderBy: { id: 'asc' },
      })
      profesionalIdFallback = profesionalFallback?.id ?? null
    }
    if (!profesionalIdFallback) return { error: 'No hay profesional disponible para emitir la orden' }

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
      const clasificacionBase = clasificacionDesdeInput ?? clasificacionInferida
      const esProtocoloBioquimico = practica.codigoPractica.trim() === '66'
      const componentesSubitem =
        !parsed.data.agruparEnUnaOrden && parsed.data.separarPorSubitem
          ? componentesClasificacion(clasificacionBase)
          : []
      const clasificacionesObjetivo = componentesSubitem.length > 0
        ? componentesSubitem
        : [clasificacionBase]

      for (const [idxClasificacion, clasificacion] of clasificacionesObjetivo.entries()) {
        const codigoPracticaNormalizado = practica.codigoPractica.trim().slice(0, 8)
        const key = parsed.data.agruparEnUnaOrden
          ? '__AGRUPAR_EN_UNA_ORDEN__'
          : parsed.data.separarPorPractica
          ? (clasificacionesObjetivo.length > 1
              ? `__PRACTICA_${practica.id}_${idxClasificacion}__`
              : `__PRACTICA_${practica.id}__`)
          : (esProtocoloBioquimico ? '__PROTOCOLO_BIOQUIMICO__' : clasificacion)
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
        const esClasificacionSoloAnestesista =
          contieneClasificacion(clasificacion, 'HA') &&
          !contieneClasificacion(clasificacion, 'HE') &&
          !contieneClasificacion(clasificacion, 'GA') &&
          !contieneClasificacion(clasificacion, 'HP') &&
          !contieneClasificacion(clasificacion, 'A1') &&
          !contieneClasificacion(clasificacion, 'A2') &&
          !contieneClasificacion(clasificacion, 'A3')
        const esClasificacionConEspecialista =
          contieneClasificacion(clasificacion, 'HE') || contieneClasificacion(clasificacion, 'HP')
        const matriculaEspecialistaPractica =
          practica.matriculaEspecialista != null && practica.matriculaEspecialista > 0
            ? practica.matriculaEspecialista
            : null
        const matriculaAnestesistaPractica =
          practica.matriculaAnestesista != null && practica.matriculaAnestesista > 0
            ? practica.matriculaAnestesista
            : null
        const matriculaAyudanteAsignada =
          matriculaEspecialistaPractica ?? MATRICULA_AYUDANTE_INTERNACION_DEFAULT

        const efectorMatriculaItem =
          esGuardiaAmbulatoria
            ? MATRICULA_AMBULATORIO_DEFAULT
            : esFlujoCirugiaInternacion
            ? esClasificacionSoloGastos
              ? MATRICULA_GASTOS_INTERNACION_DEFAULT
              : esClasificacionSoloAnestesista
              ? MATRICULA_ANESTESISTA_INTERNACION_DEFAULT
              : esClasificacionConEspecialista
              ? (matriculaFirmanteEfectiva ?? matriculaEspecialistaPractica ?? matriculaTratante ?? null)
              : esClasificacionSoloAyudante
              ? matriculaAyudanteAsignada
              : (matriculaFirmanteEfectiva ?? matriculaEspecialistaPractica ?? matriculaAnestesistaPractica ?? matriculaTratante ?? null)
            : esIngresoInternacion
            ? esClasificacionSoloGastos
              ? MATRICULA_GASTOS_INTERNACION_DEFAULT
              : esClasificacionSoloAnestesista
              ? MATRICULA_ANESTESISTA_INTERNACION_DEFAULT
              : esClasificacionConEspecialista
              ? (matriculaTratante ?? matriculaEspecialistaPractica ?? matriculaAnestesistaPractica ?? null)
              : esClasificacionSoloAyudante
              ? matriculaAyudanteAsignada
              : (matriculaEspecialistaPractica ?? matriculaAnestesistaPractica ?? matriculaTratante ?? null)
            : matriculaFirmanteEfectiva != null
            ? matriculaFirmanteEfectiva
            : esClasificacionSoloGastos
            ? MATRICULA_GASTOS_INTERNACION_DEFAULT
            : esClasificacionSoloAyudante
            ? MATRICULA_AYUDANTE_INTERNACION_DEFAULT
            : clasificacion === 'HA'
            ? MATRICULA_ANESTESISTA_INTERNACION_DEFAULT
            : (practica.matriculaEspecialista ?? practica.matriculaAnestesista ?? null)

        const item: CrearOrdenInput['items'][number] = {
          practicaId: practica.id,
          convenioId: practica.convenioId,
          codigoPractica: codigoPracticaNormalizado,
          descripcionPractica,
          cantidad: Number(practica.cantidad ?? 1),
          fecha: normalizarFechaOrdenArgentina(practica.fecha),
          tipoFacturacion: 'H',
          clasificacionAgrupacion: esProtocoloBioquimico ? 'HE' : clasificacion,
          efectorMatricula: efectorMatriculaItem,
          numeroAutorizacion: practica.numeroAutorizacion,
          importeTotal: practica.importeTotal != null ? Number(practica.importeTotal) : undefined,
        }

        const arr = grupos.get(key) ?? []
        arr.push({ item, practicaId: practica.id })
        grupos.set(key, arr)
      }
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

    const gruposOrdenados = parsed.data.agruparEnUnaOrden || parsed.data.separarPorPractica
      ? Array.from(grupos.entries())
      : Array.from(grupos.entries()).sort((a, b) => {
          if (a[0] === '__PROTOCOLO_BIOQUIMICO__') return -1
          if (b[0] === '__PROTOCOLO_BIOQUIMICO__') return 1

          const clasificacionA =
            normalizarClasificacionAgrupacion(a[1][0]?.item?.clasificacionAgrupacion) ?? 'HE'
          const clasificacionB =
            normalizarClasificacionAgrupacion(b[1][0]?.item?.clasificacionAgrupacion) ?? 'HE'
          const porClasificacion = ordenarClaveClasificacion(clasificacionA, clasificacionB)
          if (porClasificacion !== 0) return porClasificacion

          const codigoA = a[1][0]?.item?.codigoPractica?.trim() ?? ''
          const codigoB = b[1][0]?.item?.codigoPractica?.trim() ?? ''
          return codigoA.localeCompare(codigoB)
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
      const esGrupoPorPractica = key.startsWith('__PRACTICA_')
      const clasificacionItemBase =
        normalizarClasificacionAgrupacion(itemsGrupo[0]?.item?.clasificacionAgrupacion) ?? 'HE'
      const clasificacion = esGrupoAgrupado
        ? 'AGRUPADA'
        : esGrupoPorPractica
        ? clasificacionItemBase
        : (key === '__PROTOCOLO_BIOQUIMICO__' ? 'HE' : key)
      const esGrupoConDerechos = esGrupoAgrupado
        ? itemsGrupo.some(({ item }) => contieneClasificacion(item.clasificacionAgrupacion, 'GA'))
        : ((key !== '__PROTOCOLO_BIOQUIMICO__' || esGrupoPorPractica) && contieneClasificacion(clasificacion, 'GA'))
      const titularElegidoAgrupado = parsed.data.titularOrdenAgrupada?.trim() || null
      const titularModular = esGrupoAgrupado
        ? (titularElegidoAgrupado ?? titularSugeridoParaOrdenAgrupada(itemsGrupo.map(({ item }) => item)))
        : (key === '__PROTOCOLO_BIOQUIMICO__' || (esGrupoPorPractica && itemsGrupo[0]?.item?.codigoPractica?.trim() === '66'))
        ? 'PROTOCOLO BIOQUIMICO'
        : tituloDesdeClasificacion(clasificacion)

      const esGrupoSoloGastos =
        contieneClasificacion(clasificacion, 'GA') &&
        !contieneClasificacion(clasificacion, 'HE') &&
        !contieneClasificacion(clasificacion, 'HA') &&
        !contieneClasificacion(clasificacion, 'HP') &&
        !contieneClasificacion(clasificacion, 'A1') &&
        !contieneClasificacion(clasificacion, 'A2') &&
        !contieneClasificacion(clasificacion, 'A3')
      const esGrupoSoloAyudante =
        (contieneClasificacion(clasificacion, 'A1') ||
          contieneClasificacion(clasificacion, 'A2') ||
          contieneClasificacion(clasificacion, 'A3')) &&
        !contieneClasificacion(clasificacion, 'HE') &&
        !contieneClasificacion(clasificacion, 'HA') &&
        !contieneClasificacion(clasificacion, 'GA') &&
        !contieneClasificacion(clasificacion, 'HP')
      const esGrupoSoloAnestesista =
        contieneClasificacion(clasificacion, 'HA') &&
        !contieneClasificacion(clasificacion, 'HE') &&
        !contieneClasificacion(clasificacion, 'GA') &&
        !contieneClasificacion(clasificacion, 'HP') &&
        !contieneClasificacion(clasificacion, 'A1') &&
        !contieneClasificacion(clasificacion, 'A2') &&
        !contieneClasificacion(clasificacion, 'A3')
      const esGrupoConEspecialista =
        contieneClasificacion(clasificacion, 'HE') || contieneClasificacion(clasificacion, 'HP')

      const matriculaFirmanteGrupo = esGuardiaAmbulatoria
        ? MATRICULA_AMBULATORIO_DEFAULT
        : parsed.data.agruparEnUnaOrden
        ? null
        : (
            itemsGrupo
              .map(({ practicaId }) => practicasPendientesPorId.get(practicaId))
              .find((practica): practica is (typeof practicasPendientes)[number] =>
                practica != null && esMatriculaEspecialistaFirmanteValida(practica)
              )
              ?.matriculaEspecialista ??
            null
          )

      const matriculaAyudanteSeleccionadaGrupo =
        itemsGrupo
          .map(({ practicaId }) => practicasPendientesPorId.get(practicaId)?.matriculaEspecialista ?? null)
          .find((matricula): matricula is number => typeof matricula === 'number' && matricula > 0) ?? null

      const matriculaProfesionalGrupo = esGuardiaAmbulatoria
        ? MATRICULA_AMBULATORIO_DEFAULT
        : esFlujoCirugiaInternacion
        ? (matriculaFirmanteEfectiva ?? null)
        : esIngresoInternacion
        ? esGrupoSoloGastos
          ? MATRICULA_GASTOS_INTERNACION_DEFAULT
          : esGrupoSoloAnestesista
          ? MATRICULA_ANESTESISTA_INTERNACION_DEFAULT
          : esGrupoConEspecialista
          ? (matriculaTratante ?? matriculaFirmanteGrupo)
          : esGrupoSoloAyudante
          ? (matriculaAyudanteSeleccionadaGrupo ?? MATRICULA_AYUDANTE_INTERNACION_DEFAULT)
          : (matriculaFirmanteGrupo ?? matriculaTratante)
        : esGrupoAgrupado && matriculaFirmanteManual != null
        ? matriculaFirmanteManual
        : esGrupoConEspecialista
        ? (matriculaFirmanteManual ?? matriculaFirmanteGrupo)
        : esGrupoSoloAnestesista
        ? MATRICULA_ANESTESISTA_INTERNACION_DEFAULT
        : esGrupoSoloAyudante
        ? (matriculaAyudanteSeleccionadaGrupo ?? MATRICULA_AYUDANTE_INTERNACION_DEFAULT)
        : esGrupoSoloGastos
        ? MATRICULA_GASTOS_INTERNACION_DEFAULT
        : matriculaFirmanteGrupo

      const profesionalIdGrupo = esGuardiaAmbulatoria
        ? (profesionalIdManual ?? profesionalIdFallback)
        : esFlujoCirugiaInternacion
        ? (profesionalIdCirujanoFirmante ?? profesionalIdFallback)
        : esIngresoInternacion && (esGrupoConEspecialista || esGrupoSoloGastos)
        ? (
            ingreso.profesionalTratanteId ??
            (matriculaProfesionalGrupo != null
              ? (profesionalIdPorMatricula.get(matriculaProfesionalGrupo) ?? null)
              : null) ??
            profesionalIdFallback
          )
        : (matriculaProfesionalGrupo != null
          ? (profesionalIdPorMatricula.get(matriculaProfesionalGrupo) ?? null)
          : null) ?? profesionalIdFallback

      if (!profesionalIdGrupo) {
        return { error: 'No hay profesional disponible para emitir la orden' }
      }

      const orden = await crearOrdenAmbulatorio(
        {
          ingresoId: ingreso.id,
          pacienteId: ingreso.pacienteId ?? ingreso.paciente?.id ?? undefined,
          nombrePaciente: nombrePaciente.slice(0, 50),
          numeroAfiliado,
          obraSocialId: obraSocialOrdenId,
          obraSocialCoseguroId: ingreso.obraSocialId ? (ingreso.obraSocialCoseguroId ?? undefined) : undefined,
          planCoseguroId: ingreso.obraSocialId ? (ingreso.planCoseguroId ?? undefined) : undefined,
          profesionalId: profesionalIdGrupo,
          tipoOrdenCodigo: 'PRA',
          titularModular,
          imprimirPorDuplicado: esGrupoConDerechos,
          items: itemsGrupo.map(({ item }) => ({
            ...item,
            clasificacionAgrupacion:
              key === '__PROTOCOLO_BIOQUIMICO__' || (esGrupoPorPractica && item.codigoPractica.trim() === '66')
                ? null
                : normalizarClasificacionAgrupacion(item.clasificacionAgrupacion) ?? (esGrupoAgrupado ? 'HE' : clasificacion),
            titularModular,
            imprimirPorDuplicado: Boolean(item.imprimirPorDuplicado) || esGrupoConDerechos,
          })),
        },
        usuario.codigoUsuario,
        { modoLigero: true }
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

    const tipoIngreso = (ingreso.tipoIngresoCodigo ?? '').trim().toUpperCase()
    revalidatePath('/dashboard/ambulatorio')

    if (tipoIngreso === 'INT') {
      revalidatePath('/dashboard/internacion')
      revalidatePath(`/dashboard/internacion/${ingreso.id}`)
      revalidatePath(`/dashboard/internacion/${ingreso.id}/practicas`)
    } else {
      revalidatePath('/dashboard/admision')
      revalidatePath(`/dashboard/admision/${ingreso.id}`)
    }

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
  fecha?: string
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

    const obraSocialOrdenId = ingreso.obraSocialId ?? await resolverObraSocialParticularId()

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
    const fechaPedido = parsed.data.fecha ? new Date(parsed.data.fecha) : new Date()

    const practicaLaboratorio = await crearPracticaInternacion(
      {
        ingresoId: ingreso.id,
        convenioId: ingreso.obraSocialId ?? obraSocialOrdenId,
        codigoPractica: '66',
        descripcionPractica: 'PROTOCOLO BIOQUIMICO',
        numeroProtocoloLaboratorio: numeroProtocolo,
        diagnosticoLaboratorio: diagnostico || null,
        fecha: fechaPedido,
        cantidad: 1,
        numeroAutorizacion: null,
        matriculaEspecialista: null,
        matriculaAnestesista: null,
        facturable: true,
        importeBaseUnitario: null,
      },
      usuario.codigoUsuario
    )

    const orden = await crearOrdenAmbulatorio(
      {
        ingresoId: ingreso.id,
        pacienteId: ingreso.pacienteId ?? ingreso.paciente?.id ?? undefined,
        nombrePaciente: nombrePaciente.slice(0, 50),
        numeroAfiliado,
        obraSocialId: obraSocialOrdenId,
        obraSocialCoseguroId: ingreso.obraSocialId ? (ingreso.obraSocialCoseguroId ?? undefined) : undefined,
        planCoseguroId: ingreso.obraSocialId ? (ingreso.planCoseguroId ?? undefined) : undefined,
        profesionalId,
        tipoOrdenCodigo: 'PRA',
        descripcionPatologia: diagnostico || undefined,
        descripcion: `PROTOCOLO N°${numeroProtocolo}`,
        items: [
          {
            practicaId: practicaLaboratorio.id,
            convenioId: ingreso.obraSocialId ?? obraSocialOrdenId,
            codigoPractica: '66',
            descripcionPractica: 'PROTOCOLO BIOQUIMICO',
            cantidad: 1,
            fecha: fechaPedido,
            tipoFacturacion: 'H',
            clasificacionAgrupacion: 'HE',
            titularModular: 'PROTOCOLO BIOQUIMICO',
          },
        ],
      },
      usuario.codigoUsuario,
      { modoLigero: true }
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

  const puedeAmbulatorio =
    tienePermiso(usuario.rol, 'AMBULATORIO', 'MODIFICAR') ||
    tienePermiso(usuario.rol, 'AMBULATORIO', 'CREAR')
  const puedeInternacion =
    tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR') ||
    tienePermiso(usuario.rol, 'INTERNACION', 'CREAR')
  const puedeAdmision =
    tienePermiso(usuario.rol, 'ADMISION', 'MODIFICAR') ||
    tienePermiso(usuario.rol, 'ADMISION', 'CREAR')

  if (!puedeAmbulatorio && !puedeInternacion && !puedeAdmision) {
    return { error: 'Sin permiso para modificar órdenes' }
  }

  const nro = numeroAutorizacion.trim()
  if (!nro) return { error: 'El número de autorización no puede estar vacío' }
  const numeroNormalizado = nro.slice(0, 15)

  try {
    let ingresoIdOrden: number | null = null

    await prisma.$transaction(async (tx) => {
      const ordenActualizada = await tx.orden.update({
        where: { puestoNumero_numero: { puestoNumero, numero } },
        data: { numeroAutorizacion: numeroNormalizado },
        select: { ingresoId: true },
      })
      ingresoIdOrden = ordenActualizada.ingresoId ?? null

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

      // Fallback legacy: prácticas con punteros a orden activa sin vínculo explícito PraID.
      await tx.practica.updateMany({
        where: {
          puestoNumero,
          ordenNumero: numero,
          OR: [{ estado: null }, { estado: { not: 'X' } }],
        },
        data: { numeroAutorizacion: numeroNormalizado },
      })
    })

    revalidatePath('/dashboard/ambulatorio')
    revalidatePath('/dashboard/cirugia')
    revalidatePath('/dashboard/internacion')
    if (ingresoIdOrden != null) {
      revalidatePath(`/dashboard/internacion/${ingresoIdOrden}`)
      revalidatePath(`/dashboard/internacion/${ingresoIdOrden}/practicas`)
    }
    return { ok: true }
  } catch (err) {
    console.error('[ORDEN] Error al actualizar autorización:', err)
    return { error: 'Error al guardar el número de autorización' }
  }
}

export async function anularOrdenAction(puestoNumero: number, numero: number) {
  const usuario = await getUsuarioSesion()

  const puedeAmbulatorio =
    tienePermiso(usuario.rol, 'AMBULATORIO', 'MODIFICAR') ||
    tienePermiso(usuario.rol, 'AMBULATORIO', 'CREAR')
  const puedeInternacion =
    tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR') ||
    tienePermiso(usuario.rol, 'INTERNACION', 'CREAR')
  const puedeAdmision =
    tienePermiso(usuario.rol, 'ADMISION', 'MODIFICAR') ||
    tienePermiso(usuario.rol, 'ADMISION', 'CREAR')

  if (!puedeAmbulatorio && !puedeInternacion && !puedeAdmision) {
    return { error: 'Sin permiso para anular órdenes' }
  }

  try {
    const orden = await prisma.orden.findUnique({
      where: { puestoNumero_numero: { puestoNumero, numero } },
      select: { estado: true, ingresoId: true },
    })

    if (!orden) {
      return { error: 'Orden no encontrada' }
    }

    const estado = (orden.estado ?? '').trim().toUpperCase()
    if (estado === 'X') {
      return { error: 'La orden ya está anulada' }
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
      revalidatePath(`/dashboard/internacion/${orden.ingresoId}/practicas`)
      revalidatePath(`/dashboard/admision/${orden.ingresoId}`)
    }
    return { ok: true }
  } catch (err) {
    console.error('[ORDEN] Error al anular orden:', err)
    return { error: 'Error al anular la orden' }
  }
}
