'use server'

import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { CrearOrdenSchema, type CrearOrdenInput } from '../schemas'
import { crearOrdenAmbulatorio, crearOrdenesAmbulatoriasPorPractica } from '../service'
import { prisma } from '@/lib/db'
import {
  claveNomenclador,
  obtenerDescripcionesNomenclador,
  obtenerValoresNomenclador,
  type ValoresNomenclador,
} from '@/lib/nomenclador'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { crearPractica as crearPracticaInternacion } from '@/modules/internacion/service'
import { claveDiaArgentina, fechaDesdeClaveArgentina } from '@/lib/utils/argentina-date'
import { resolverObraSocialParticularId } from '@/lib/obra-social-particular'
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

function valorComponenteNomenclador(
  componente: ClasificacionComponente,
  valores: ValoresNomenclador | undefined
): number | null {
  if (!valores) return null
  if (componente === 'HE' || componente === 'HP') return valores.valorEspecialista
  if (componente === 'HA') return valores.valorAnestesista
  if (componente === 'GA') return valores.valorGastos
  return valores.valorAyudante
}

/**
 * Reparte el importe total de una practica entre los subitems en los que se separa.
 *
 * Sin prorrateo cada subitem se llevaba el importe completo, asi que una practica
 * partida en GA+HE+A1 terminaba facturando tres veces su valor. El reparto usa el
 * desglose del nomenclador y, si no hay valores cargados, divide en partes iguales.
 * El ultimo subitem absorbe el redondeo para que la suma cierre exacta.
 */
function prorratearImportePorSubitem(
  importeTotal: number | null,
  componentes: readonly ClasificacionComponente[],
  valores: ValoresNomenclador | undefined
): Array<number | null> {
  if (componentes.length <= 1) return componentes.map(() => importeTotal)
  if (importeTotal == null || !Number.isFinite(importeTotal)) {
    return componentes.map(() => importeTotal)
  }

  const pesos = componentes.map((componente) => {
    const valor = valorComponenteNomenclador(componente, valores)
    return valor != null && Number.isFinite(valor) && valor > 0 ? valor : 0
  })
  const sumaPesos = pesos.reduce((suma, peso) => suma + peso, 0)
  const pesosEfectivos = sumaPesos > 0 ? pesos : componentes.map(() => 1)
  const sumaEfectiva = pesosEfectivos.reduce((suma, peso) => suma + peso, 0)

  const redondear2 = (value: number) => Number(value.toFixed(2))
  const importes: number[] = []
  let acumulado = 0
  for (let i = 0; i < componentes.length; i += 1) {
    const esUltimo = i === componentes.length - 1
    const importe = esUltimo
      ? redondear2(importeTotal - acumulado)
      : redondear2((pesosEfectivos[i]! / sumaEfectiva) * importeTotal)
    acumulado += importe
    importes.push(importe)
  }

  return importes
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
        convenioValorId: true,
        fecha: true,
        cantidad: true,
        numeroAutorizacion: true,
        matriculaEspecialista: true,
        matriculaAnestesista: true,
        obraSocialId: true,
        planId: true,
        facturable: true,
        motivoNoFactura: true,
        estado: true,
        importeTotal: true,
        numeroProtocoloLab: true,
        diagnosticoLab: true,
      },
    })

    const descripcionesNomenclador = await obtenerDescripcionesNomenclador(practicas)
    const valoresNomenclador = await obtenerValoresNomenclador(practicas)

    const practicasPendientes = practicas

    if (practicasPendientes.length === 0) {
      return { error: 'No hay prácticas pendientes para generar órdenes' }
    }

    const tieneProtocoloBioquimico = practicasPendientes.some(
      (practica) => practica.codigoPractica.trim() === '66'
    )

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

    const profesionalIdFirmantePrioritarioInternacion =
      profesionalIdManual ??
      ingreso.profesionalTratanteId ??
      profesionalIdPorPractica ??
      null

    let profesionalIdFallback =
      profesionalIdFirmantePrioritarioInternacion ??
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
        : (descripcionesNomenclador.get(claveNomenclador(practica.convenioId, practica.codigoPractica))
          || practica.codigoPractica.trim())

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
      const importePracticaTotal =
        practica.importeTotal != null ? Number(practica.importeTotal) : null
      const importesPorSubitem = prorratearImportePorSubitem(
        importePracticaTotal,
        componentesSubitem,
        valoresNomenclador.get(claveNomenclador(practica.convenioId, practica.codigoPractica))
      )

      // Una practica partida en varios componentes necesita una fila de Practica por
      // componente. Practica guarda un unico (PueNum, OrdNum, OprItem) y facturacion
      // vincula una practica a un solo item de orden, asi que con una sola fila para
      // N ordenes solo se podia facturar una y las demas quedaban muertas: ninguna
      // practica partida por subitem llego nunca a facturarse. El primer componente
      // se queda con la practica original y el resto se clona con su parte del importe.
      const practicaIdPorComponente = new Map<number, number>()
      if (componentesSubitem.length > 1) {
        for (let idx = 1; idx < clasificacionesObjetivo.length; idx += 1) {
          const clon = await prisma.practica.create({
            data: {
              ingresoId: parsed.data.ingresoId,
              convenioId: practica.convenioId,
              codigoPractica: practica.codigoPractica,
              convenioValorId: practica.convenioValorId,
              fecha: practica.fecha,
              cantidad: practica.cantidad,
              numeroAutorizacion: practica.numeroAutorizacion,
              numeroProtocoloLab: practica.numeroProtocoloLab,
              diagnosticoLab: practica.diagnosticoLab,
              matriculaEspecialista: practica.matriculaEspecialista,
              matriculaAnestesista: practica.matriculaAnestesista,
              obraSocialId: practica.obraSocialId,
              planId: practica.planId,
              facturable: practica.facturable,
              motivoNoFactura: practica.motivoNoFactura,
              importeTotal: importesPorSubitem[idx] ?? importePracticaTotal,
              estado: practica.estado,
              usuarioRegistro: usuario.codigoUsuario,
            },
            select: { id: true },
          })
          practicaIdPorComponente.set(idx, clon.id)
          practicasPendientesPorId.set(clon.id, { ...practica, id: clon.id })
        }

        // El importe de la practica original tambien es el del componente, no el total:
        // si queda el total, facturacion cobra la practica entera en la primera orden.
        const importePrimerComponente = importesPorSubitem[0] ?? importePracticaTotal
        if (importePrimerComponente != null && importePrimerComponente !== importePracticaTotal) {
          await prisma.practica.update({
            where: { id: practica.id },
            data: { importeTotal: importePrimerComponente },
          })
        }
      }

      for (const [idxClasificacion, clasificacion] of clasificacionesObjetivo.entries()) {
        const practicaIdComponente = practicaIdPorComponente.get(idxClasificacion) ?? practica.id
        const importeItem = componentesSubitem.length > 0
          ? importesPorSubitem[idxClasificacion] ?? importePracticaTotal
          : importePracticaTotal
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
              // El efector cargado en la practica manda: el firmante global de la pantalla
              // (o el tratante) solo se usa cuando la practica no tiene matricula propia.
              : esClasificacionConEspecialista
              ? (matriculaEspecialistaPractica ?? matriculaFirmanteManual ?? matriculaTratante ?? matriculaAnestesistaPractica ?? null)
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
          practicaId: practicaIdComponente,
          convenioId: practica.convenioId,
          codigoPractica: codigoPracticaNormalizado,
          descripcionPractica,
          cantidad: Number(practica.cantidad ?? 1),
          fecha: normalizarFechaOrdenArgentina(practica.fecha),
          tipoFacturacion: 'H',
          clasificacionAgrupacion: esProtocoloBioquimico ? 'HE' : clasificacion,
          // El componente va tambien en incluyeCodigo (OprModulo): es de donde
          // facturacion saca que cobra el item. Sin esto la linea salia sin componente
          // y el importe se recalculaba sobre la practica entera.
          incluyeCodigo: componentesSubitem.length > 1 && !esProtocoloBioquimico
            ? clasificacion
            : undefined,
          efectorMatricula: efectorMatriculaItem,
          numeroAutorizacion: practica.numeroAutorizacion,
          importeTotal: importeItem ?? undefined,
        }

        const arr = grupos.get(key) ?? []
        arr.push({ item, practicaId: practicaIdComponente })
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
          ? (matriculaFirmanteManual ?? matriculaTratante ?? matriculaFirmanteGrupo)
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

      const profesionalIdDesdeMatriculaGrupo =
        matriculaProfesionalGrupo != null
          ? (profesionalIdPorMatricula.get(matriculaProfesionalGrupo) ?? null)
          : null

      const profesionalIdGrupo = esGuardiaAmbulatoria
        ? (profesionalIdManual ?? profesionalIdFallback)
        : esFlujoCirugiaInternacion
        ? (profesionalIdCirujanoFirmante ?? profesionalIdFallback)
        : esIngresoInternacion && tieneProtocoloBioquimico
        ? (profesionalIdFirmantePrioritarioInternacion ?? profesionalIdFallback)
        : esIngresoInternacion && (esGrupoConEspecialista || esGrupoSoloGastos)
        ? (
            profesionalIdManual ??
            (esGrupoConEspecialista ? profesionalIdDesdeMatriculaGrupo : null) ??
            ingreso.profesionalTratanteId ??
            profesionalIdDesdeMatriculaGrupo ??
            profesionalIdFallback
          )
        : profesionalIdDesdeMatriculaGrupo ?? profesionalIdFallback

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

/**
 * Deshace una anulacion: la orden vuelve a estado activo y sale de la solapa
 * Anuladas. La solapa a la que cae despues (pendientes o confirmadas) la decide
 * `clasificarSolapaOrden` segun el numero de autorizacion y la obra social.
 */
export async function restaurarOrdenAction(puestoNumero: number, numero: number) {
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
    return { error: 'Sin permiso para restaurar órdenes' }
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
    if (!estado.startsWith('X')) {
      return { error: 'La orden no está anulada' }
    }

    await prisma.orden.update({
      where: { puestoNumero_numero: { puestoNumero, numero } },
      data: {
        estado: 'A',
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
    console.error('[ORDEN] Error al restaurar orden:', err)
    return { error: 'Error al restaurar la orden' }
  }
}
