import { prisma } from '@/lib/db'
import { registrarAudit } from '@/lib/security/audit'
import { calcularImporteFacturable, resolverReglaFacturacion } from '@/modules/facturacion/cobertura'
import * as repo from './repository'
import type {
  CrearIngresoInput,
  ActualizarIngresoInput,
  BusquedaIngresoInput,
  DiagnosticoIngresoInput,
  MovimientoIngresoInput,
} from './schemas'
import type { IngresoConRelaciones, IngresoDetalle, IngresoListItem } from './types'
import type { IngresoPatologia, MovimientoIngreso } from '@prisma/client'
import type { ResultadoPaginado } from '@/types'

function normalizarNombreObraSocial(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function esNombreIPSS(nombre: string | null | undefined): boolean {
  const tokens = normalizarNombreObraSocial(nombre ?? '').split(' ')
  return tokens.includes('IPSS') || tokens.includes('IPS')
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
    obraSocialCoseguroId?: number | null
    planCoseguroId?: number | null
    numeroAfiliadoCoseguro?: string | null
  },
>(data: T, obraSocialNombre: string | null): T {
  if (esNombreIPSS(obraSocialNombre)) return data

  return {
    ...data,
    obraSocialCoseguroId: null,
    planCoseguroId: null,
    numeroAfiliadoCoseguro: null,
  }
}

const SUBTIPOS_PRACTICA_AMBULATORIA = new Set(['TUR', 'RAY', 'CUR', 'SUT', 'ECG', 'ECO', 'PAM'])
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
): Promise<IngresoConRelaciones> {
  // Verificar que el paciente existe
  const paciente = await prisma.paciente.findUnique({
    where: { id: data.pacienteId },
  })
  if (!paciente) {
    throw new Error(`Paciente con ID ${data.pacienteId} no encontrado`)
  }

  // Verificar que el tipo de ingreso existe
  const tipoIngreso = await prisma.tipoIngreso.findUnique({
    where: { codigo: data.tipoIngresoCodigo },
  })
  if (!tipoIngreso) {
    throw new Error(`Tipo de ingreso "${data.tipoIngresoCodigo}" no válido`)
  }

  // Verificar que el subtipo de admisión existe (solo si se envió)
  if (data.subtipoAdmisionCodigo && data.subtipoAdmisionCodigo.trim() !== '') {
    const subtipoAdmision = await prisma.subtipoAdmision.findUnique({
      where: { codigo: data.subtipoAdmisionCodigo },
    })
    if (!subtipoAdmision) {
      throw new Error(`Subtipo de admisión "${data.subtipoAdmisionCodigo}" no válido`)
    }
  }

  const obraSocialNombre = await obtenerNombreObraSocial(data.obraSocialId)
  const dataNormalizada = normalizarCoseguroPorObraSocial(data, obraSocialNombre)
  const dataParaCrear =
    dataNormalizada.tipoIngresoCodigo === 'AMB' &&
      omitirFechaEgresoPrevistaAmbulatorio(dataNormalizada.subtipoAdmisionCodigo)
      ? { ...dataNormalizada, fechaEgresoPrevista: null }
      : dataNormalizada

  const ingreso = await repo.crearIngreso(dataParaCrear, paciente, usuario)

  // Auto-generar informe de hospitalización para internaciones
  if (dataNormalizada.tipoIngresoCodigo === 'INT') {
    await prisma.informeHospitalizacion.create({
      data: {
        ingresoId: ingreso.id,
        fecha: new Date(),
        estado: 'A',
        usuario: usuario.slice(0, 10),
        fechaEstado: new Date(),
      },
    })
  }
  // Auto-generar informe ambulatorio para admisiones ambulatorias, derivaciones e indicaciones médicas
  const subtiposInformeAmbulatorio = new Set([
    'RAY',
    'GUA',
    'CUR',
    'SUT',
    'ECG',
    'ECO',
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
    await prisma.informeAmbulatorio.create({
      data: {
        ingresoId: ingreso.id,
        fecha: new Date(),
        estado: 'A',
        profesionalId: dataParaCrear.profesionalGuardiaId ?? null,
        usuario: usuario.slice(0, 10),
        fechaEstado: new Date(),
      },
    })
  }

  await registrarAudit({
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

    // Calcular importeTotal para cada práctica
    const regla = resolverReglaFacturacion(
      obraSocialNombre,
      Boolean(dataParaCrear.obraSocialCoseguroId)
    )

    const codigos = Array.from(
      new Set(dataParaCrear.practicas.map((p) => p.codigo.trim().toUpperCase()))
    )
    const prestaciones = codigos.length
      ? await prisma.nomencladorPrestacion.findMany({
        where: { codigo: { in: codigos } },
        select: { codigo: true, valor: true },
      })
      : []
    const valorNomenclador = new Map(
      prestaciones.map((pre) => [pre.codigo.trim().toUpperCase(), Number(pre.valor ?? 0)])
    )

    // Fallback histórico para códigos sin precio en el nomenclador
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
    await prisma.practica.createMany({
      data: dataParaCrear.practicas.map((p) => {
        const clave = p.codigo.trim().toUpperCase()
        const precio = valorNomenclador.get(clave) ?? 0
        const cobertura = calcularImporteFacturable(precio, p.cantidad, regla)
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
          importeTotal: p.importeTotal != null && p.importeTotal > 0
            ? p.importeTotal
            : (cobertura.importeTotalFacturable > 0 ? cobertura.importeTotalFacturable : null),
          usuarioRegistro: usuario.slice(0, 10),
          fechaUsuario: ahora,
        }
      }),
    })
  }

  // Registrar medicamentos al ingreso si se enviaron
  if (data.medicaciones && data.medicaciones.length > 0) {
    await prisma.medicacionIngreso.createMany({
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
  }

  if (data.descartables && data.descartables.length > 0) {
    await prisma.descartableIngreso.createMany({
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

    // Calcular importeTotal para cada práctica
    const obraSocialCoseguroId = dataParaActualizar.obraSocialCoseguroId ?? null
    const reglaEdit = resolverReglaFacturacion(obraSocialNombreFinal, Boolean(obraSocialCoseguroId))

    const codigosEdit = Array.from(
      new Set(dataParaActualizar.practicasAgregar.map((p) => p.codigo.trim().toUpperCase()))
    )
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
        const clave = p.codigo.trim().toUpperCase()
        const precio = valorNomencladorEdit.get(clave) ?? 0
        const cobertura = calcularImporteFacturable(precio, p.cantidad, reglaEdit)
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
          importeTotal: p.importeTotal != null && p.importeTotal > 0
            ? p.importeTotal
            : (cobertura.importeTotalFacturable > 0 ? cobertura.importeTotalFacturable : null),
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
