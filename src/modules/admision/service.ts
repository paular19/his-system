import { prisma } from '@/lib/db'
import { registrarAudit } from '@/lib/security/audit'
import { calcularImporteFacturable, resolverReglaFacturacion } from '@/modules/facturacion/cobertura'
import * as repo from './repository'
import type {
  CrearIngresoInput,
  ActualizarIngresoInput,
  AgregarPracticasIngresoInput,
  BusquedaIngresoInput,
  DiagnosticoIngresoInput,
  MovimientoIngresoInput,
} from './schemas'
import type { IngresoConRelaciones, IngresoDetalle, IngresoListItem } from './types'
import { Prisma } from '@prisma/client'
import type { IngresoPatologia, MovimientoIngreso } from '@prisma/client'
import type { ResultadoPaginado } from '@/types'

export interface VerificacionEliminacionIngreso {
  existe: boolean
  puedeEliminar: boolean
  motivos: string[]
}

async function consultarVinculosParaEliminar(
  cliente: Prisma.TransactionClient,
  id: number
): Promise<VerificacionEliminacionIngreso> {
  const [ingreso, comprobante] = await Promise.all([
    cliente.ingreso.findUnique({
      where: { id },
      select: {
        tipoIngresoCodigo: true,
        tipoInternacionCodigo: true,
        camaId: true,
        turnos: { select: { profesionalId: true }, take: 1 },
        ingresoPatologias: { select: { id: true }, take: 1 },
        movimientosIngreso: { select: { id: true }, take: 1 },
        ordenes: { select: { puestoNumero: true }, take: 1 },
        practicas: { select: { id: true }, take: 1 },
        informes: { select: { id: true }, take: 1 },
        cirugiasProgramadas: { select: { id: true }, take: 1 },
        informeAmbulatorio: { select: { id: true } },
        evoluciones: { select: { id: true }, take: 1 },
        transferencias: { select: { id: true }, take: 1 },
        medicaciones: { select: { id: true }, take: 1 },
        descartables: { select: { id: true }, take: 1 },
        electrocardiogramas: { select: { id: true }, take: 1 },
        lotesItems: { select: { id: true }, take: 1 },
      },
    }),
    cliente.comprobante.findFirst({
      where: { ingresoId: id },
      select: { id: true },
    }),
  ])

  if (!ingreso) {
    return { existe: false, puedeEliminar: false, motivos: [] }
  }

  const motivos: string[] = []
  if (ingreso.tipoIngresoCodigo.trim() === 'INT' || ingreso.tipoInternacionCodigo || ingreso.camaId) {
    motivos.push('una internación')
  }
  if (ingreso.ordenes.length > 0) motivos.push('una orden')
  if (ingreso.practicas.length > 0) motivos.push('prácticas')
  if (ingreso.ingresoPatologias.length > 0) motivos.push('diagnósticos')
  if (ingreso.movimientosIngreso.length > 0) motivos.push('movimientos')
  if (ingreso.turnos.length > 0) motivos.push('turnos')
  if (ingreso.informes.length > 0 || ingreso.informeAmbulatorio) motivos.push('informes')
  if (ingreso.cirugiasProgramadas.length > 0) motivos.push('cirugías programadas')
  if (ingreso.evoluciones.length > 0) motivos.push('evoluciones')
  if (ingreso.transferencias.length > 0) motivos.push('transferencias')
  if (ingreso.medicaciones.length > 0) motivos.push('medicación')
  if (ingreso.descartables.length > 0) motivos.push('descartables')
  if (ingreso.electrocardiogramas.length > 0) motivos.push('electrocardiogramas')
  if (ingreso.lotesItems.length > 0) motivos.push('lotes de facturación')
  if (comprobante) motivos.push('comprobantes')

  return {
    existe: true,
    puedeEliminar: motivos.length === 0,
    motivos,
  }
}

export async function verificarEliminacionIngreso(id: number): Promise<VerificacionEliminacionIngreso> {
  return consultarVinculosParaEliminar(prisma, id)
}

export async function eliminarIngreso(
  id: number,
  usuario: string,
  ip?: string
): Promise<VerificacionEliminacionIngreso> {
  let resultado: VerificacionEliminacionIngreso
  try {
    resultado = await prisma.$transaction(async (tx) => {
      const verificacion = await consultarVinculosParaEliminar(tx, id)
      if (!verificacion.existe || !verificacion.puedeEliminar) return verificacion

      await tx.ingresoHistorial.deleteMany({ where: { ingresoId: id } })
      await tx.ingreso.delete({ where: { id } })
      return verificacion
    })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2003', 'P2014', 'P2025'].includes(error.code)
    ) {
      return verificarEliminacionIngreso(id)
    }
    throw error
  }

  if (resultado.existe && resultado.puedeEliminar) {
    await registrarAudit({
      usuario,
      accion: 'ELIMINAR',
      entidad: 'Ingreso',
      registroId: id,
      detalle: `Ingreso ${id} eliminado de forma irreversible`,
      direccionIp: ip,
    })
  }

  return resultado
}

function normalizarNombreObraSocial(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function obtenerNombreObraSocial(obraSocialId: number | null | undefined): Promise<string | null> {
  if (!obraSocialId) return null
  const obraSocial = await prisma.obraSocial.findUnique({
    where: { id: obraSocialId },
    select: { nombre: true },
  })
  return obraSocial?.nombre ?? null
}

function normalizarCoseguroPorObraSocial<
  T extends {
    planId?: number | null
    obraSocialCoseguroId?: number | null
    planCoseguroId?: number | null
    numeroAfiliadoCoseguro?: string | null
  },
>(data: T, _obraSocialNombre: string | null): T {
  return {
    ...data,
    planId: null,
  }
}

const SUBTIPOS_PRACTICA_AMBULATORIA = new Set(['TUR', 'RAY', 'CUR', 'SUT', 'ECG', 'ECO', 'QAM', 'PAM'])
const SUBTIPOS_SIN_EGRESO_PREVISTO = new Set(['GUA', 'DER', 'IND'])

function esSubtipoPracticaAmbulatoria(subtipo: string | null | undefined): boolean {
  if (!subtipo) return false
  return SUBTIPOS_PRACTICA_AMBULATORIA.has(subtipo.trim().toUpperCase())
}

function omitirFechaEgresoPrevistaAmbulatorio(subtipo: string | null | undefined): boolean {
  if (!subtipo) return false
  const codigo = subtipo.trim().toUpperCase()
  return esSubtipoPracticaAmbulatoria(codigo) || SUBTIPOS_SIN_EGRESO_PREVISTO.has(codigo)
}

function normalizarNumeroAutorizacion(value: string | null | undefined): string | null {
  const numero = value?.trim() ?? ''
  if (!numero) return null
  return numero.slice(0, 50)
}

// ============================================
// SERVICIO ADMISIÓN
// Lógica de negocio + auditoría
// ============================================

export async function crearIngreso(
  data: CrearIngresoInput,
  usuario: string,
  ip?: string
): Promise<repo.IngresoCreadoMinimo> {
  const subtipoAdmisionCodigo = data.subtipoAdmisionCodigo?.trim() || null

  const requiereNombreObraSocial =
    Boolean(data.obraSocialCoseguroId) ||
    Boolean(data.planCoseguroId) ||
    Boolean(data.numeroAfiliadoCoseguro?.trim()) ||
    Boolean(data.practicas?.some((p) => !(p.importeTotal != null && p.importeTotal > 0)))

  const [paciente, obraSocialNombre] = await Promise.all([
    prisma.paciente.findUnique({ where: { id: data.pacienteId } }),
    requiereNombreObraSocial
      ? obtenerNombreObraSocial(data.obraSocialId)
      : Promise.resolve(null),
  ])

  if (!paciente) {
    throw new Error(`Paciente con ID ${data.pacienteId} no encontrado`)
  }

  const dataConSubtipoNormalizado = subtipoAdmisionCodigo
    ? { ...data, subtipoAdmisionCodigo }
    : data

  const dataNormalizada = normalizarCoseguroPorObraSocial(dataConSubtipoNormalizado, obraSocialNombre)
  const dataParaCrear =
    dataNormalizada.tipoIngresoCodigo === 'AMB' &&
      omitirFechaEgresoPrevistaAmbulatorio(dataNormalizada.subtipoAdmisionCodigo)
      ? { ...dataNormalizada, fechaEgresoPrevista: null }
      : dataNormalizada

  if (dataParaCrear.tipoIngresoCodigo === 'INT' && !dataParaCrear.profesionalTratanteId) {
    throw new Error('Para internacion debe indicar un medico tratante')
  }

  const ingreso = await repo.crearIngreso(dataParaCrear, paciente, usuario)

  const tareasPostAlta: Array<Promise<unknown>> = []

  // Auto-generar informe de hospitalización para internaciones
  if (dataNormalizada.tipoIngresoCodigo === 'INT') {
    tareasPostAlta.push(
      prisma.informeHospitalizacion.create({
        data: {
          ingresoId: ingreso.id,
          fecha: new Date(),
          estado: 'A',
          usuario: usuario.slice(0, 10),
          fechaEstado: new Date(),
        },
      })
    )
  }
  // Auto-generar informe ambulatorio para admisiones ambulatorias, derivaciones e indicaciones médicas
  const subtiposInformeAmbulatorio = new Set([
    'RAY',
    'GUA',
    'CUR',
    'SUT',
    'ECG',
    'ECO',
    'QAM',
    'DER',
    'TUR',
    // Compatibilidad con códigos anteriores
    'AMB',
    'IND',
    'PAM',
  ])

  if (
    dataParaCrear.tipoIngresoCodigo === 'AMB' &&
    !!dataParaCrear.subtipoAdmisionCodigo &&
    subtiposInformeAmbulatorio.has(dataParaCrear.subtipoAdmisionCodigo)
  ) {
    tareasPostAlta.push(
      prisma.informeAmbulatorio.create({
        data: {
          ingresoId: ingreso.id,
          fecha: new Date(),
          estado: 'A',
          profesionalId: dataParaCrear.profesionalGuardiaId ?? null,
          usuario: usuario.slice(0, 10),
          fechaEstado: new Date(),
        },
      })
    )
  }

  void registrarAudit({
    usuario,
    accion: 'CREAR',
    entidad: 'Ingreso',
    registroId: ingreso.id,
    detalle: `Ingreso ${ingreso.tipoIngresoCodigo}-${ingreso.numeroIngreso} creado para ${paciente.nombreCompleto}`,
    direccionIp: ip,
  })

  // Registrar prácticas al ingreso como entidades reales (no en observaciones)
  if (dataParaCrear.practicas && dataParaCrear.practicas.length > 0) {
    const practicasSinConvenio = dataParaCrear.practicas.filter(
      (p) => !(p.convenioId ?? dataParaCrear.obraSocialId)
    )

    if (practicasSinConvenio.length > 0) {
      throw new Error(
        'No se pudo determinar el convenio de una o más prácticas. Seleccioná una obra social y volvés a intentarlo.'
      )
    }

    const requiereCalculoImporte = dataParaCrear.practicas.some(
      (p) => !(p.importeTotal != null && p.importeTotal > 0)
    )

    const regla = requiereCalculoImporte
      ? resolverReglaFacturacion(
        obraSocialNombre,
        Boolean(dataParaCrear.obraSocialCoseguroId)
      )
      : null

    const codigos = requiereCalculoImporte
      ? Array.from(new Set(dataParaCrear.practicas.map((p) => p.codigo.trim().toUpperCase())))
      : []

    const prestaciones = codigos.length
      ? await prisma.nomencladorPrestacion.findMany({
        where: { codigo: { in: codigos } },
        select: { codigo: true, valor: true },
      })
      : []

    const valorNomenclador = new Map(
      prestaciones.map((pre) => [pre.codigo.trim().toUpperCase(), Number(pre.valor ?? 0)])
    )

    // Fallback histórico solo si hay prácticas sin importe calculado.
    const sinPrecio = codigos.filter((c) => !valorNomenclador.has(c) || valorNomenclador.get(c) === 0)
    if (sinPrecio.length > 0) {
      const codigosConEspacio = sinPrecio.map((c) => c.padEnd(8, ' '))
      const historicos = await prisma.practica.findMany({
        where: {
          codigoPractica: { in: codigosConEspacio },
          importeTotal: { not: null, gt: 0 },
          cantidad: { gt: 0 },
        },
        orderBy: { id: 'desc' },
        select: { codigoPractica: true, importeTotal: true, cantidad: true },
        take: sinPrecio.length * 10,
      })
      for (const h of historicos) {
        const clave = h.codigoPractica.trim().toUpperCase()
        if (!valorNomenclador.has(clave) || valorNomenclador.get(clave) === 0) {
          const precioUnitario = Number(h.importeTotal) / Number(h.cantidad)
          if (precioUnitario > 0) valorNomenclador.set(clave, precioUnitario)
        }
      }
    }

    const ahora = new Date()
    tareasPostAlta.push(
      prisma.practica.createMany({
        data: dataParaCrear.practicas.map((p) => {
          let importeTotal = p.importeTotal != null && p.importeTotal > 0 ? p.importeTotal : null

          if (importeTotal == null && regla) {
            const clave = p.codigo.trim().toUpperCase()
            const precio = valorNomenclador.get(clave) ?? 0
            const cobertura = calcularImporteFacturable(precio, p.cantidad, regla)
            importeTotal = cobertura.importeTotalFacturable > 0 ? cobertura.importeTotalFacturable : null
          }

          return {
            ingresoId: ingreso.id,
            convenioId: (p.convenioId ?? dataParaCrear.obraSocialId) as number,
            codigoPractica: p.codigo.trim().slice(0, 8).padEnd(8, ' '),
            convenioValorId: 0,
            fecha: ahora,
            cantidad: p.cantidad,
            numeroAutorizacion: normalizarNumeroAutorizacion(p.numeroAutorizacion),
            matriculaEspecialista: p.matriculaEspecialista ?? null,
            matriculaAnestesista: p.matriculaAnestesista ?? null,
            obraSocialId: dataParaCrear.obraSocialId ?? null,
            planId: dataParaCrear.planId ?? null,
            facturable: true,
            estado: 'A',
            ordenItem: p.grupoOrden ?? null,
            importeTotal,
            usuarioRegistro: usuario.slice(0, 10),
            fechaUsuario: ahora,
          }
        }),
      })
    )
  }

  // Registrar medicamentos al ingreso si se enviaron
  if (data.medicaciones && data.medicaciones.length > 0) {
    tareasPostAlta.push(
      prisma.medicacionIngreso.createMany({
        data: data.medicaciones.map((m) => ({
          ingresoId: ingreso.id,
          nombre: m.nombre,
          dosis: m.dosis ?? null,
          viaAdministracion: m.viaAdministracion ?? null,
          frecuencia: m.frecuencia ?? null,
          observaciones: m.observaciones ?? null,
          fechaInicio: new Date(),
          estado: 'A',
          usuario: usuario.slice(0, 10),
          fechaEstado: new Date(),
        })),
      })
    )
  }

  if (data.descartables && data.descartables.length > 0) {
    tareasPostAlta.push(
      prisma.descartableIngreso.createMany({
        data: data.descartables.map((d) => ({
          ingresoId: ingreso.id,
          nombre: d.nombre,
          cantidad: d.cantidad,
          observaciones: d.observaciones ?? null,
          fechaInicio: new Date(),
          estado: 'A',
          usuario: usuario.slice(0, 10),
          fechaEstado: new Date(),
        })),
      })
    )
  }

  if (tareasPostAlta.length > 0) {
    await Promise.all(tareasPostAlta)
  }

  return ingreso
}

export async function obtenerIngreso(
  id: number,
  usuario: string,
  ip?: string
): Promise<IngresoDetalle> {
  const ingreso = await repo.obtenerIngresoPorId(id)

  if (!ingreso) {
    throw new Error(`Ingreso con ID ${id} no encontrado`)
  }

  const obraSocialCoseguroNombre = ingreso.obraSocialCoseguroId
    ? (await prisma.obraSocial.findUnique({
      where: { id: ingreso.obraSocialCoseguroId },
      select: { nombre: true },
    }))?.nombre ?? null
    : null

  void registrarAudit({
    usuario,
    accion: 'CONSULTAR',
    entidad: 'Ingreso',
    registroId: id,
    direccionIp: ip,
  })

  let profesionalTratanteFallback: { nombre: string; matricula: number | null } | null = null
  if (!ingreso.profesionalTratante && !(ingreso.evoluciones?.[0]?.profesional)) {
    const ultimoTratanteAudit = await prisma.auditLog.findFirst({
      where: {
        entidad: 'Ingreso',
        registroId: String(id),
        detalle: { startsWith: 'Médico tratante actualizado:' },
      },
      orderBy: { fecha: 'desc' },
      select: { detalle: true },
    })

    const matchId = ultimoTratanteAudit?.detalle ? ultimoTratanteAudit.detalle.match(/\(ID\s+(\d+)\)/) : null
    const tratanteId = matchId ? Number.parseInt(matchId[1] ?? "", 10) : NaN

    if (Number.isFinite(tratanteId)) {
      const profesional = await prisma.profesional.findUnique({
        where: { id: tratanteId },
        select: { nombre: true, matricula: true },
      })
      if (profesional) {
        profesionalTratanteFallback = {
          nombre: profesional.nombre,
          matricula: profesional.matricula ?? null,
        }
      }
    }
  }

  let profesionalInterviniente: { nombre: string; matricula: number | null } | null = null
  const subtipo = ingreso.ingresoSubtipo
  if (subtipo) {
    const codigo = subtipo.subtipoAdmisionCodigo
    const intervinienteId =
      codigo === 'IND'
        ? subtipo.profesionalIndicadorId
        : (codigo === 'TUR' || codigo === 'RAY' || codigo === 'PAM')
          ? (subtipo.profesionalIdTurno ?? subtipo.profesionalId)
          : subtipo.profesionalId

    if (codigo === 'IND' && subtipo.profesionalIndicadorNombre?.trim()) {
      profesionalInterviniente = {
        nombre: subtipo.profesionalIndicadorNombre,
        matricula: null,
      }
    } else if (intervinienteId) {
      const profesional = await prisma.profesional.findUnique({
        where: { id: intervinienteId },
        select: { nombre: true, matricula: true },
      })

      if (profesional) {
        profesionalInterviniente = {
          nombre: profesional.nombre,
          matricula: profesional.matricula ?? null,
        }
      }
    }
  }

  const practicasSinVinculo = ingreso.practicas.filter(
    (p) =>
      (p.ordenPractica?.length ?? 0) === 0 &&
      !(p.puestoNumero != null && p.ordenNumero != null && Number(p.puestoNumero) > 0)
  )

  const clavesPracticaSinVinculo = Array.from(
    new Set(practicasSinVinculo.map((p) => `${p.convenioId}:${p.codigoPractica.trim()}`))
  ).map((key) => {
    const [convenioIdRaw, ...codigoParts] = key.split(':')
    return {
      convenioId: Number.parseInt(convenioIdRaw ?? '0', 10),
      codigoPractica: codigoParts.join(':'),
    }
  })

  let ordenesPorPractica: Array<{
    convenioId: number
    codigoPractica: string
    puestoNumero: number
    ordenNumero: number
    item: number
    numeroAutorizacion: string | null
  }> = []

  const ordenesActivas = await prisma.orden.findMany({
    where: {
      ingresoId: id,
      NOT: { estado: 'X' },
    },
    select: {
      puestoNumero: true,
      numero: true,
    },
  })

  const ordenesActivasSet = new Set(
    ordenesActivas.map((orden) => `${orden.puestoNumero}:${orden.numero}`)
  )

  if (clavesPracticaSinVinculo.length > 0) {
    try {
      ordenesPorPractica = await prisma.ordenPractica.findMany({
        where: {
          orden: {
            ingresoId: id,
            estado: { not: 'X' },
          },
          practicaId: null,
          OR: clavesPracticaSinVinculo,
        },
        select: {
          convenioId: true,
          codigoPractica: true,
          puestoNumero: true,
          ordenNumero: true,
          item: true,
          numeroAutorizacion: true,
        },
      })
    } catch (error) {
      console.error(
        `[admision] Error recuperando ordenes pendientes para ingreso ${id}. Continuando sin vinculos automáticos.`,
        error
      )
      ordenesPorPractica = []
    }
  }

  const ordenesPendientesPorClave = new Map<
    string,
    Array<{
      puestoNumero: number
      ordenNumero: number
      item: number
      numeroAutorizacion: string | null
    }>
  >()

  for (const op of ordenesPorPractica) {
    const key = `${op.convenioId}:${op.codigoPractica.trim()}`
    const cola = ordenesPendientesPorClave.get(key) ?? []
    cola.push({
      puestoNumero: op.puestoNumero,
      ordenNumero: op.ordenNumero,
      item: op.item,
      numeroAutorizacion: op.numeroAutorizacion,
    })
    ordenesPendientesPorClave.set(key, cola)
  }

  const ordenAsignadaPorPracticaId = new Map<
    number,
    {
      puestoNumero: number
      ordenNumero: number
      item: number
      numeroAutorizacion: string | null
    }
  >()

  const practicasSinVinculoOrdenadas = [...practicasSinVinculo].sort((a, b) => a.id - b.id)
  for (const p of practicasSinVinculoOrdenadas) {
    const key = `${p.convenioId}:${p.codigoPractica.trim()}`
    const cola = ordenesPendientesPorClave.get(key)
    if (!cola || cola.length === 0) continue
    const asignada = cola.shift()
    if (!asignada) continue
    ordenAsignadaPorPracticaId.set(p.id, asignada)
  }

  return {
    ...ingreso,
    obraSocialCoseguroNombre,
    profesionalTratanteFallback,
    profesionalInterviniente,
    practicas: ingreso.practicas.map((p) => {
      const tieneOrdenRelacion = (p.ordenPractica?.length ?? 0) > 0
      if (tieneOrdenRelacion) return p

      const ordenPorIngreso = ordenAsignadaPorPracticaId.get(p.id)
      if (ordenPorIngreso) {
        return {
          ...p,
          ordenPractica: [ordenPorIngreso],
        }
      }

      const tieneOrdenDirecta =
        p.puestoNumero != null && p.ordenNumero != null && Number(p.puestoNumero) > 0

      if (!tieneOrdenDirecta) return p

      const claveOrdenDirecta = `${Number(p.puestoNumero)}:${Number(p.ordenNumero)}`
      if (!ordenesActivasSet.has(claveOrdenDirecta)) return p

      return {
        ...p,
        ordenPractica: [
          {
            puestoNumero: Number(p.puestoNumero),
            ordenNumero: Number(p.ordenNumero),
            item: p.ordenItem != null ? Number(p.ordenItem) : 1,
            numeroAutorizacion: p.numeroAutorizacion ?? null,
          },
        ],
      }
    }),
  }
}

export async function obtenerPracticasIngreso(id: number): Promise<IngresoDetalle['practicas']> {
  const practicas = await repo.obtenerPracticasIngresoPorId(id)
  if (!practicas) {
    throw new Error(`Ingreso con ID ${id} no encontrado`)
  }
  return practicas
}

export async function actualizarIngreso(
  id: number,
  data: ActualizarIngresoInput,
  usuario: string,
  ip?: string
): Promise<IngresoConRelaciones> {
  const existe = await repo.obtenerIngresoPorId(id)
  if (!existe) {
    throw new Error(`Ingreso con ID ${id} no encontrado`)
  }

  const obraSocialIdFinal = data.obraSocialId ?? existe.obraSocialId ?? null
  const obraSocialCoseguroIdFinal = data.obraSocialCoseguroId ?? existe.obraSocialCoseguroId ?? null
  const planCoseguroIdFinal = data.planCoseguroId ?? existe.planCoseguroId ?? null
  const numeroAfiliadoCoseguroFinal = data.numeroAfiliadoCoseguro ?? existe.numeroAfiliadoCoseguro ?? null

  const obraSocialNombreFinal = await obtenerNombreObraSocial(obraSocialIdFinal)

  const dataNormalizada: ActualizarIngresoInput = normalizarCoseguroPorObraSocial(
    {
      ...data,
      obraSocialId: obraSocialIdFinal,
      obraSocialCoseguroId: obraSocialCoseguroIdFinal,
      planCoseguroId: planCoseguroIdFinal,
      numeroAfiliadoCoseguro: numeroAfiliadoCoseguroFinal,
    },
    obraSocialNombreFinal
  )

  const subtipoAdmisionFinal = dataNormalizada.subtipoAdmisionCodigo
    ?? existe.ingresoSubtipo?.subtipoAdmisionCodigo
    ?? null
  const dataParaActualizar: ActualizarIngresoInput =
    existe.tipoIngresoCodigo === 'AMB' && omitirFechaEgresoPrevistaAmbulatorio(subtipoAdmisionFinal)
      ? { ...dataNormalizada, fechaEgresoPrevista: null }
      : dataNormalizada

  const actualizado = await repo.actualizarIngreso(id, dataParaActualizar, usuario)

  if (dataParaActualizar.practicasAgregar && dataParaActualizar.practicasAgregar.length > 0) {
    const obraSocialId = dataParaActualizar.obraSocialId ?? null
    const planId = dataParaActualizar.planId ?? existe.planId ?? null

    const practicasSinConvenio = dataParaActualizar.practicasAgregar.filter(
      (p) => !(p.convenioId ?? obraSocialId)
    )

    if (practicasSinConvenio.length > 0) {
      throw new Error(
        'No se pudo determinar el convenio de una o más prácticas. Seleccioná una obra social y volvés a intentarlo.'
      )
    }

    const obraSocialCoseguroId = dataParaActualizar.obraSocialCoseguroId ?? null
    const requiereCalculoImporteEdit = dataParaActualizar.practicasAgregar.some(
      (p) => !(p.importeTotal != null && p.importeTotal > 0)
    )

    const reglaEdit = requiereCalculoImporteEdit
      ? resolverReglaFacturacion(obraSocialNombreFinal, Boolean(obraSocialCoseguroId))
      : null

    const codigosEdit = requiereCalculoImporteEdit
      ? Array.from(new Set(dataParaActualizar.practicasAgregar.map((p) => p.codigo.trim().toUpperCase())))
      : []

    const prestacionesEdit = codigosEdit.length
      ? await prisma.nomencladorPrestacion.findMany({
        where: { codigo: { in: codigosEdit } },
        select: { codigo: true, valor: true },
      })
      : []

    const valorNomencladorEdit = new Map(
      prestacionesEdit.map((pre) => [pre.codigo.trim().toUpperCase(), Number(pre.valor ?? 0)])
    )

    const sinPrecioEdit = codigosEdit.filter((c) => !valorNomencladorEdit.has(c) || valorNomencladorEdit.get(c) === 0)
    if (sinPrecioEdit.length > 0) {
      const codigosConEspacioEdit = sinPrecioEdit.map((c) => c.padEnd(8, ' '))
      const historicosEdit = await prisma.practica.findMany({
        where: {
          codigoPractica: { in: codigosConEspacioEdit },
          importeTotal: { not: null, gt: 0 },
          cantidad: { gt: 0 },
        },
        orderBy: { id: 'desc' },
        select: { codigoPractica: true, importeTotal: true, cantidad: true },
        take: sinPrecioEdit.length * 10,
      })
      for (const h of historicosEdit) {
        const clave = h.codigoPractica.trim().toUpperCase()
        if (!valorNomencladorEdit.has(clave) || valorNomencladorEdit.get(clave) === 0) {
          const precioUnitario = Number(h.importeTotal) / Number(h.cantidad)
          if (precioUnitario > 0) valorNomencladorEdit.set(clave, precioUnitario)
        }
      }
    }

    const ahoraEdit = new Date()
    await prisma.practica.createMany({
      data: dataParaActualizar.practicasAgregar.map((p) => {
        let importeTotal = p.importeTotal != null && p.importeTotal > 0 ? p.importeTotal : null

        if (importeTotal == null && reglaEdit) {
          const clave = p.codigo.trim().toUpperCase()
          const precio = valorNomencladorEdit.get(clave) ?? 0
          const cobertura = calcularImporteFacturable(precio, p.cantidad, reglaEdit)
          importeTotal = cobertura.importeTotalFacturable > 0 ? cobertura.importeTotalFacturable : null
        }

        return {
          ingresoId: id,
          convenioId: (p.convenioId ?? obraSocialId) as number,
          codigoPractica: p.codigo.trim().slice(0, 8).padEnd(8, ' '),
          convenioValorId: 0,
          fecha: ahoraEdit,
          cantidad: p.cantidad,
          numeroAutorizacion: normalizarNumeroAutorizacion(p.numeroAutorizacion),
          matriculaEspecialista: p.matriculaEspecialista ?? null,
          matriculaAnestesista: p.matriculaAnestesista ?? null,
          obraSocialId,
          planId,
          facturable: true,
          estado: 'A',
          ordenItem: p.grupoOrden ?? null,
          importeTotal,
          usuarioRegistro: usuario.slice(0, 10),
          fechaUsuario: ahoraEdit,
        }
      }),
    })
  }

  await registrarAudit({
    usuario,
    accion: 'MODIFICAR',
    entidad: 'Ingreso',
    registroId: id,
    detalle: `Ingreso ${id} modificado`,
    direccionIp: ip,
  })

  return actualizado
}

export async function agregarPracticasIngresoRapido(
  id: number,
  data: AgregarPracticasIngresoInput,
  usuario: string,
  ip?: string
): Promise<number[]> {
  const ingreso = await prisma.ingreso.findUnique({
    where: { id },
    select: {
      id: true,
      obraSocialId: true,
      planId: true,
      obraSocialCoseguroId: true,
    },
  })

  if (!ingreso) {
    throw new Error(`Ingreso con ID ${id} no encontrado`)
  }

  const practicasAgregar = data.practicasAgregar
  if (practicasAgregar.length === 0) {
    return []
  }

  const obraSocialId = ingreso.obraSocialId ?? null
  const planId = ingreso.planId ?? null

  const practicasSinConvenio = practicasAgregar.filter(
    (p) => !(p.convenioId ?? obraSocialId)
  )

  if (practicasSinConvenio.length > 0) {
    throw new Error(
      'No se pudo determinar el convenio de una o más prácticas. Seleccioná una obra social y volvés a intentarlo.'
    )
  }

  const requiereCalculoImporte = practicasAgregar.some(
    (p) => !(p.importeTotal != null && p.importeTotal > 0)
  )

  const obraSocialNombre = requiereCalculoImporte
    ? await obtenerNombreObraSocial(obraSocialId)
    : null

  const regla = requiereCalculoImporte
    ? resolverReglaFacturacion(obraSocialNombre, Boolean(ingreso.obraSocialCoseguroId))
    : null

  const codigos = requiereCalculoImporte
    ? Array.from(new Set(practicasAgregar.map((p) => p.codigo.trim().toUpperCase())))
    : []

  const prestaciones = codigos.length
    ? await prisma.nomencladorPrestacion.findMany({
      where: { codigo: { in: codigos } },
      select: { codigo: true, valor: true },
    })
    : []

  const valorNomenclador = new Map(
    prestaciones.map((pre) => [pre.codigo.trim().toUpperCase(), Number(pre.valor ?? 0)])
  )

  const sinPrecio = codigos.filter((c) => !valorNomenclador.has(c) || valorNomenclador.get(c) === 0)
  if (sinPrecio.length > 0) {
    const codigosConEspacio = sinPrecio.map((c) => c.padEnd(8, ' '))
    const historicos = await prisma.practica.findMany({
      where: {
        codigoPractica: { in: codigosConEspacio },
        importeTotal: { not: null, gt: 0 },
        cantidad: { gt: 0 },
      },
      orderBy: { id: 'desc' },
      select: { codigoPractica: true, importeTotal: true, cantidad: true },
      take: sinPrecio.length * 10,
    })

    for (const h of historicos) {
      const clave = h.codigoPractica.trim().toUpperCase()
      if (!valorNomenclador.has(clave) || valorNomenclador.get(clave) === 0) {
        const precioUnitario = Number(h.importeTotal) / Number(h.cantidad)
        if (precioUnitario > 0) valorNomenclador.set(clave, precioUnitario)
      }
    }
  }

  const ahora = new Date()
  const usuarioNormalizado = usuario.slice(0, 10)

  const practicasParaPersistir: Prisma.PracticaCreateManyInput[] = practicasAgregar.map((p) => {
    let importeTotal = p.importeTotal != null && p.importeTotal > 0 ? p.importeTotal : null

    if (importeTotal == null && regla) {
      const clave = p.codigo.trim().toUpperCase()
      const precio = valorNomenclador.get(clave) ?? 0
      const cobertura = calcularImporteFacturable(precio, p.cantidad, regla)
      importeTotal = cobertura.importeTotalFacturable > 0 ? cobertura.importeTotalFacturable : null
    }

    return {
      ingresoId: id,
      convenioId: (p.convenioId ?? obraSocialId) as number,
      codigoPractica: p.codigo.trim().slice(0, 8).padEnd(8, ' '),
      convenioValorId: 0,
      fecha: ahora,
      cantidad: p.cantidad,
      numeroAutorizacion: normalizarNumeroAutorizacion(p.numeroAutorizacion),
      matriculaEspecialista: p.matriculaEspecialista ?? null,
      matriculaAnestesista: p.matriculaAnestesista ?? null,
      obraSocialId,
      planId,
      facturable: true,
      estado: 'A',
      ordenItem: p.grupoOrden ?? null,
      importeTotal,
      usuarioRegistro: usuarioNormalizado,
      fechaUsuario: ahora,
    }
  })

  const practicaIdsCreadas = await prisma.$transaction(async (tx) => {
    await tx.ingresoHistorial.create({
      data: {
        ingresoId: id,
        tipoCambio: 'M',
        usuarioCambio: usuarioNormalizado,
        fechaCambio: ahora,
      },
    })

    await tx.ingreso.update({
      where: { id },
      data: { fechaEstado: ahora },
      select: { id: true },
    })

    type CreateManyAndReturnFn = (args: {
      data: Prisma.PracticaCreateManyInput[]
      select: { id: true }
    }) => Promise<Array<{ id: number }>>

    const practicaDelegate = tx.practica as typeof tx.practica & {
      createManyAndReturn?: CreateManyAndReturnFn
    }

    if (typeof practicaDelegate.createManyAndReturn === 'function') {
      const creadas = await practicaDelegate.createManyAndReturn({
        data: practicasParaPersistir,
        select: { id: true },
      })

      return creadas.map((p) => p.id)
    }

    const creadas = await Promise.all(
      practicasParaPersistir.map((practica) =>
        tx.practica.create({
          data: practica,
          select: { id: true },
        })
      )
    )

    return creadas.map((p) => p.id)
  })

  await registrarAudit({
    usuario,
    accion: 'MODIFICAR',
    entidad: 'Ingreso',
    registroId: id,
    detalle: `Prácticas agregadas al ingreso ${id}: ${practicaIdsCreadas.length}`,
    direccionIp: ip,
  })

  return practicaIdsCreadas
}

export async function buscarIngresos(
  params: BusquedaIngresoInput
): Promise<ResultadoPaginado<IngresoListItem>> {
  return repo.buscarIngresos(params)
}

export async function registrarDiagnostico(
  data: DiagnosticoIngresoInput,
  usuario: string,
  ip?: string
): Promise<IngresoPatologia> {
  const ingreso = await repo.obtenerIngresoPorId(data.ingresoId)
  if (!ingreso) {
    throw new Error(`Ingreso con ID ${data.ingresoId} no encontrado`)
  }
  if (ingreso.estado === 'X' || ingreso.estado === 'E') {
    throw new Error('No se puede registrar diagnóstico en un ingreso finalizado o anulado')
  }

  const diagnostico = await repo.registrarDiagnosticoIngreso(data, usuario)

  await registrarAudit({
    usuario,
    accion: 'CREAR',
    entidad: 'IngresoPatologia',
    registroId: diagnostico.id,
    detalle: `Diagnóstico registrado para ingreso ${data.ingresoId}: ${data.descripcion}`,
    direccionIp: ip,
  })

  return diagnostico
}

export async function registrarMovimiento(
  data: MovimientoIngresoInput,
  usuario: string,
  ip?: string
): Promise<MovimientoIngreso> {
  const ingreso = await repo.obtenerIngresoPorId(data.ingresoId)
  if (!ingreso) {
    throw new Error(`Ingreso con ID ${data.ingresoId} no encontrado`)
  }
  if (ingreso.estado === 'X') {
    throw new Error('No se puede registrar movimiento en un ingreso anulado')
  }

  const movimiento = await repo.registrarMovimientoIngreso(data, usuario)

  await registrarAudit({
    usuario,
    accion: 'CREAR',
    entidad: 'MovimientoIngreso',
    registroId: movimiento.id,
    detalle: `Movimiento ${data.tipoMovimientoCodigo} registrado para ingreso ${data.ingresoId}`,
    direccionIp: ip,
  })

  return movimiento
}
