import { prisma } from '@/lib/db'
import { calcularEdad } from '@/lib/utils'
import type {
  CrearIngresoInput,
  ActualizarIngresoInput,
  BusquedaIngresoInput,
  DiagnosticoIngresoInput,
  MovimientoIngresoInput,
} from './schemas'
import type { IngresoConRelaciones, IngresoDetalle, IngresoListItem } from './types'
import type { Paciente, IngresoPatologia, MovimientoIngreso, Prisma } from '@prisma/client'
import type { ResultadoPaginado } from '@/types'

// ============================================
// REPOSITORIO ADMISIÓN
// Única capa de acceso a datos. Sin SQL directo.
// ============================================

const MAX_IDS_BUSQUEDA_INGRESO = 250

type ComponentesPractica = {
  valorEspecialista: number | null
  valorAyudante: number | null
  valorAnestesista: number | null
  valorGastos: number | null
}

function resolverDetalleSubitemPractica(params: {
  matriculaEspecialista: number | null | undefined
  matriculaAnestesista: number | null | undefined
  importeTotal: number | null | undefined
  cantidad: number
  componentes?: ComponentesPractica | null
}): string | null {
  const {
    matriculaEspecialista,
    matriculaAnestesista,
    importeTotal,
    cantidad,
    componentes,
  } = params

  const tieneMatriculaEspecialista =
    matriculaEspecialista != null && Number(matriculaEspecialista) > 0
  const tieneMatriculaAnestesista =
    matriculaAnestesista != null && Number(matriculaAnestesista) > 0

  if (tieneMatriculaEspecialista && !tieneMatriculaAnestesista) {
    return 'Honorario Especialista (HE)'
  }

  if (tieneMatriculaAnestesista && !tieneMatriculaEspecialista) {
    return 'Honorario Anestesista (HA)'
  }

  if (
    !tieneMatriculaEspecialista &&
    !tieneMatriculaAnestesista &&
    importeTotal != null &&
    componentes
  ) {
    const approx = (a: number, b: number) => Math.abs(a - b) < 0.01
    const totalGastos =
      componentes.valorGastos != null ? Number(componentes.valorGastos) * cantidad : null
    const totalAyudante =
      componentes.valorAyudante != null ? Number(componentes.valorAyudante) * cantidad : null

    if (totalGastos != null && approx(importeTotal, totalGastos)) {
      return 'Derechos/Gastos (GA)'
    }

    if (totalAyudante != null && approx(importeTotal, totalAyudante)) {
      return 'Honorarios Ayudante'
    }
  }

  return null
}

function construirDescripcionPractica(params: {
  descripcionBase: string
  matriculaEspecialista: number | null | undefined
  matriculaAnestesista: number | null | undefined
  importeTotal: number | null | undefined
  cantidad: number
  componentes?: ComponentesPractica | null
}): string {
  const detalleSubitem = resolverDetalleSubitemPractica(params)
  return detalleSubitem ? `${params.descripcionBase} · ${detalleSubitem}` : params.descripcionBase
}

const incluirRelacionesBase = {
  paciente: true,
  tipoIngreso: true,
  profesionalGuardia: true,
  profesionalTratante: true,
  ingresoSubtipo: {
    include: { subtipoAdmision: { select: { codigo: true, descripcion: true } } },
  },
} as const

const incluirRelacionesDetalle = {
  paciente: true,
  tipoIngreso: true,
  profesionalGuardia: true,
  profesionalTratante: true,
  ingresoSubtipo: {
    include: { subtipoAdmision: { select: { codigo: true, descripcion: true } } },
  },
  obraSocial: { select: { id: true, nombre: true } },
  plan: { select: { obraSocialId: true, id: true, descripcion: true } },
  cama: {
    select: { id: true, identificador: true, sector: true, habitacion: true },
  },
  ingresoPatologias: {
    orderBy: { fecha: 'desc' as const },
  },
  movimientosIngreso: {
    include: { tipoMovimiento: true },
    orderBy: { fecha: 'desc' as const },
  },
  evoluciones: {
    orderBy: { fecha: 'desc' as const },
    take: 1,
    select: {
      fecha: true,
      profesional: { select: { nombre: true, matricula: true } },
    },
  },
  practicas: {
    where: { OR: [{ estado: 'A' }, { estado: null }] },
    orderBy: [{ fecha: 'desc' as const }, { id: 'desc' as const }],
    select: {
      id: true,
      convenioId: true,
      codigoPractica: true,
      cantidad: true,
      fecha: true,
      numeroAutorizacion: true,
      matriculaEspecialista: true,
      matriculaAnestesista: true,
      puestoNumero: true,
      ordenNumero: true,
      ordenItem: true,
      ordenPractica: {
        select: {
          puestoNumero: true,
          ordenNumero: true,
          item: true,
          numeroAutorizacion: true,
        },
      },
      nomencladorPractica: { select: { descripcion: true } },
    },
  },
} as const

/**
 * Crea un ingreso generando el numeroIngreso atómicamente desde TipoIngreso.proximoNumero.
 */
export async function crearIngreso(
  data: CrearIngresoInput,
  paciente: Paciente,
  usuarioAlta: string
): Promise<IngresoConRelaciones> {
  const ahora = new Date()
  const edad = paciente.fechaNacimiento ? calcularEdad(paciente.fechaNacimiento) : null
  const usuarioNormalizado = usuarioAlta.slice(0, 10)

  return prisma.$transaction(async (tx) => {
    // Serializa por paciente para evitar dobles altas concurrentes
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${paciente.id})`

    const internacionActivaExistente = await tx.ingreso.findFirst({
      where: {
        pacienteId: paciente.id,
        estado: 'A',
        tipoIngresoCodigo: 'INT',
      },
      select: {
        id: true,
        tipoIngresoCodigo: true,
        numeroIngreso: true,
      },
    })

    if (internacionActivaExistente) {
      throw new Error(
        `Ya existe una internacion activa para este paciente (ID ${internacionActivaExistente.id}, ${internacionActivaExistente.tipoIngresoCodigo}-${internacionActivaExistente.numeroIngreso}).`
      )
    }

    // Incrementar el contador atómicamente; el valor devuelto es el NUEVO valor
    const tipoIngreso = await tx.tipoIngreso.update({
      where: { codigo: data.tipoIngresoCodigo },
      data: { proximoNumero: { increment: 1 } },
    })
    // El número a usar es el valor ANTES del incremento
    const numeroIngreso = tipoIngreso.proximoNumero - 1

    if (data.tipoIngresoCodigo === 'INT' && data.camaId) {
      const cama = await tx.cama.findUnique({
        where: { id: data.camaId },
        select: { id: true, estado: true },
      })

      if (!cama) {
        throw new Error('La cama seleccionada no existe')
      }

      if (cama.estado === 'OCUPADA') {
        throw new Error('La cama seleccionada ya está ocupada')
      }

      if (cama.estado === 'MANTENIMIENTO') {
        throw new Error('La cama seleccionada está en mantenimiento')
      }

      const estadoDestino = data.subtipoAdmisionCodigo === 'PRG' ? 'RESERVADA' : 'OCUPADA'

      await tx.cama.update({
        where: { id: data.camaId },
        data: {
          estado: estadoDestino,
          usuario: usuarioNormalizado,
          fechaEstado: ahora,
        },
      })
    }

    const obraSocialId = data.obraSocialId ?? null
    const planId = data.obraSocialId && data.planId ? data.planId : null

    if (obraSocialId && planId) {
      const planValido = await tx.planObraSocial.findUnique({
        where: {
          obraSocialId_id: {
            obraSocialId,
            id: planId,
          },
        },
        select: { id: true },
      })

      if (!planValido) {
        throw new Error('El plan seleccionado no pertenece a la obra social seleccionada')
      }
    }

    const ingreso = await tx.ingreso.create({
      data: {
        tipoIngresoCodigo: data.tipoIngresoCodigo,
        numeroIngreso,
        pacienteId: paciente.id,
        nombre: paciente.nombreCompleto,
        fechaNacimiento: paciente.fechaNacimiento,
        edad: edad,
        fechaIngreso: data.fechaIngreso ?? ahora,
        fechaEgresoPrevista: data.fechaEgresoPrevista ?? null,
        tipoInternacionCodigo: data.tipoInternacionCodigo ?? null,
        descripcionPatologia: data.descripcionPatologia ?? null,
        profesionalGuardiaId: data.profesionalGuardiaId ?? null,
        profesionalTratanteId: data.profesionalTratanteId ?? null,
        camaId: data.camaId ?? null,
        sedeId: data.sedeId ?? null,
        // Asegurar plan consistente con la obra social seleccionada
        obraSocialId,
        planId,
        numeroAfiliado: data.numeroAfiliado ?? null,
        obraSocialCoseguroId: data.obraSocialCoseguroId ?? null,
        planCoseguroId: data.planCoseguroId ?? null,
        numeroAfiliadoCoseguro: data.numeroAfiliadoCoseguro ?? null,
        observaciones: data.observaciones ?? null,
        estado: 'A',
        fechaEstado: ahora,
        usuario: usuarioNormalizado,
      },
      include: incluirRelacionesBase,
    })

    // Crear información del subtipo de admisión
    if (data.subtipoAdmisionCodigo) {
      await tx.ingresoSubtipo.create({
        data: {
          ingresoId: ingreso.id,
          subtipoAdmisionCodigo: data.subtipoAdmisionCodigo,
          profesionalId: data.profesionalGuardiaId ?? null,
          profesionalIdTurno: data.profesionalIdTurno ?? null,
          fechaTurno: data.fechaTurno ?? null,
          practicaCodigo: data.practicaCodigo ?? null,
          centroDerivante: data.centroDerivante ?? null,
          profesionalDerivanteNombre: data.profesionalDerivanteNombre ?? null,
          motivoDerivacion: data.motivoDerivacion ?? null,
          diagnosticoDerivacion: data.diagnosticoDerivacion ?? null,
          profesionalIndicadorNombre: data.profesionalIndicadorNombre ?? null,
          tipoIndicacion: data.tipoIndicacion ?? null,
          descripcionIndicacion: data.descripcionIndicacion ?? null,
          usuario: usuarioNormalizado,
          fechaEstado: ahora,
        },
      })
    }

    return ingreso
  })
}

export async function obtenerIngresoPorId(id: number): Promise<IngresoDetalle | null> {
  const ingresoBase = await prisma.ingreso.findUnique({
    where: { id },
    include: {
      paciente: true,
      tipoIngreso: true,
      profesionalGuardia: true,
      profesionalTratante: true,
      ingresoSubtipo: {
        include: { subtipoAdmision: { select: { codigo: true, descripcion: true } } },
      },
      obraSocial: { select: { id: true, nombre: true } },
      plan: { select: { obraSocialId: true, id: true, descripcion: true } },
      cama: {
        select: { id: true, identificador: true, sector: true, habitacion: true },
      },
    },
  })

  if (!ingresoBase) return null

  const [ingresoPatologias, movimientosIngreso, evoluciones, practicasBase, ordenesActivas] = await Promise.all([
    prisma.ingresoPatologia.findMany({
      where: { ingresoId: id },
      orderBy: { fecha: 'desc' },
    }),
    prisma.movimientoIngreso.findMany({
      where: { ingresoId: id },
      include: { tipoMovimiento: true },
      orderBy: { fecha: 'desc' },
    }),
    prisma.evolucionIngreso.findMany({
      where: { ingresoId: id },
      orderBy: { fecha: 'desc' },
      take: 1,
      select: {
        fecha: true,
        profesional: { select: { nombre: true, matricula: true } },
      },
    }),
    prisma.practica.findMany({
      where: {
        ingresoId: id,
        OR: [{ estado: 'A' }, { estado: null }],
      },
      select: {
        id: true,
        ingresoId: true,
        convenioId: true,
        codigoPractica: true,
        cantidad: true,
        fecha: true,
        importeTotal: true,
        numeroAutorizacion: true,
        matriculaEspecialista: true,
        matriculaAnestesista: true,
        puestoNumero: true,
        ordenNumero: true,
        ordenItem: true,
        facturable: true,
        estado: true,
        usuarioRegistro: true,
      },
    }),
    prisma.orden.findMany({
      where: {
        ingresoId: id,
        NOT: { estado: 'X' },
      },
      select: {
        puestoNumero: true,
        numero: true,
      },
    }),
  ])

  const ordenesActivasSet = new Set(
    ordenesActivas.map((orden) => `${orden.puestoNumero}:${orden.numero}`)
  )

  const practicasOrdenadas = [...practicasBase].sort((a, b) => {
    const diffFecha = b.fecha.getTime() - a.fecha.getTime()
    if (diffFecha !== 0) return diffFecha
    return b.id - a.id
  })

  const practicaIds = practicasOrdenadas.map((p) => p.id)
  const ordenesPracticaRows = practicaIds.length
    ? await prisma.ordenPractica.findMany({
      where: {
        practicaId: { in: practicaIds },
        orden: { estado: { not: 'X' } },
      },
      select: {
        practicaId: true,
        puestoNumero: true,
        ordenNumero: true,
        item: true,
        numeroAutorizacion: true,
      },
      orderBy: [{ practicaId: 'asc' }, { item: 'asc' }],
    })
    : []

  const convenioIds = Array.from(new Set(practicasOrdenadas.map((p) => p.convenioId)))
  const nomencladorRows = convenioIds.length
    ? await prisma.nomencladorPractica.findMany({
      where: { convenioId: { in: convenioIds } },
      select: {
        convenioId: true,
        codigo: true,
        descripcion: true,
        valorEspecialista: true,
        valorAyudante: true,
        valorAnestesista: true,
        valorGastos: true,
      },
    })
    : []

  const descripcionPorClave = new Map<string, string>()
  const componentesPorClave = new Map<string, ComponentesPractica>()
  for (const row of nomencladorRows) {
    const key = `${row.convenioId}:${row.codigo.trim()}`
    descripcionPorClave.set(key, row.descripcion)
    componentesPorClave.set(key, {
      valorEspecialista: row.valorEspecialista != null ? Number(row.valorEspecialista) : null,
      valorAyudante: row.valorAyudante != null ? Number(row.valorAyudante) : null,
      valorAnestesista: row.valorAnestesista != null ? Number(row.valorAnestesista) : null,
      valorGastos: row.valorGastos != null ? Number(row.valorGastos) : null,
    })
  }

  const ordenesPracticaPorId = new Map<
    number,
    Array<{ puestoNumero: number; ordenNumero: number; item: number; numeroAutorizacion: string | null }>
  >()

  for (const row of ordenesPracticaRows) {
    if (row.practicaId == null) continue
    const prev = ordenesPracticaPorId.get(row.practicaId) ?? []
    prev.push({
      puestoNumero: row.puestoNumero,
      ordenNumero: row.ordenNumero,
      item: row.item,
      numeroAutorizacion: row.numeroAutorizacion,
    })
    ordenesPracticaPorId.set(row.practicaId, prev)
  }

  const practicas = practicasOrdenadas.map((p) => ({
    ...p,
    cantidad: Number(p.cantidad),
    importeTotal: p.importeTotal != null ? Number(p.importeTotal) : null,
    facturada:
      p.puestoNumero != null &&
      p.ordenNumero != null &&
      Number(p.puestoNumero) > 0 &&
      ordenesActivasSet.has(`${Number(p.puestoNumero)}:${Number(p.ordenNumero)}`),
    usuario: p.usuarioRegistro,
    descripcionPractica: (() => {
      const key = `${p.convenioId}:${p.codigoPractica.trim()}`
      const descripcionBase = descripcionPorClave.get(key) ?? p.codigoPractica.trim()
      const componentes = componentesPorClave.get(key) ?? null
      const cantidad = Number.isFinite(Number(p.cantidad)) && Number(p.cantidad) > 0
        ? Math.floor(Number(p.cantidad))
        : 1
      const importeTotal = p.importeTotal != null ? Number(p.importeTotal) : null

      return construirDescripcionPractica({
        descripcionBase,
        matriculaEspecialista: p.matriculaEspecialista,
        matriculaAnestesista: p.matriculaAnestesista,
        importeTotal,
        cantidad,
        componentes,
      })
    })(),
    ordenPractica: ordenesPracticaPorId.get(p.id) ?? [],
    nomencladorPractica:
      descripcionPorClave.get(`${p.convenioId}:${p.codigoPractica.trim()}`)
        ? { descripcion: descripcionPorClave.get(`${p.convenioId}:${p.codigoPractica.trim()}`)! }
        : null,
  }))

  return {
    ...ingresoBase,
    ingresoPatologias,
    movimientosIngreso,
    evoluciones,
    practicas,
  } as IngresoDetalle
}

export async function obtenerPracticasIngresoPorId(
  id: number
): Promise<IngresoDetalle['practicas'] | null> {
  const ingresoExiste = await prisma.ingreso.findUnique({
    where: { id },
    select: { id: true },
  })

  if (!ingresoExiste) return null

  const [practicasBase, ordenesActivas] = await Promise.all([
    prisma.practica.findMany({
      where: {
        ingresoId: id,
        OR: [{ estado: 'A' }, { estado: null }],
      },
      select: {
        id: true,
        ingresoId: true,
        convenioId: true,
        codigoPractica: true,
        cantidad: true,
        fecha: true,
        importeTotal: true,
        numeroAutorizacion: true,
        matriculaEspecialista: true,
        matriculaAnestesista: true,
        puestoNumero: true,
        ordenNumero: true,
        ordenItem: true,
        facturable: true,
        estado: true,
        usuarioRegistro: true,
      },
    }),
    prisma.orden.findMany({
      where: {
        ingresoId: id,
        NOT: { estado: 'X' },
      },
      select: {
        puestoNumero: true,
        numero: true,
      },
    }),
  ])

  const ordenesActivasSet = new Set(
    ordenesActivas.map((orden) => `${orden.puestoNumero}:${orden.numero}`)
  )

  const practicasOrdenadas = [...practicasBase].sort((a, b) => {
    const diffFecha = b.fecha.getTime() - a.fecha.getTime()
    if (diffFecha !== 0) return diffFecha
    return b.id - a.id
  })

  const practicaIds = practicasOrdenadas.map((p) => p.id)
  const ordenesPracticaRows = practicaIds.length
    ? await prisma.ordenPractica.findMany({
      where: {
        practicaId: { in: practicaIds },
        orden: { estado: { not: 'X' } },
      },
      select: {
        practicaId: true,
        puestoNumero: true,
        ordenNumero: true,
        item: true,
        numeroAutorizacion: true,
      },
      orderBy: [{ practicaId: 'asc' }, { item: 'asc' }],
    })
    : []

  const convenioIds = Array.from(new Set(practicasOrdenadas.map((p) => p.convenioId)))
  const nomencladorRows = convenioIds.length
    ? await prisma.nomencladorPractica.findMany({
      where: { convenioId: { in: convenioIds } },
      select: {
        convenioId: true,
        codigo: true,
        descripcion: true,
        valorEspecialista: true,
        valorAyudante: true,
        valorAnestesista: true,
        valorGastos: true,
      },
    })
    : []

  const descripcionPorClave = new Map<string, string>()
  const componentesPorClave = new Map<string, ComponentesPractica>()
  for (const row of nomencladorRows) {
    const key = `${row.convenioId}:${row.codigo.trim()}`
    descripcionPorClave.set(key, row.descripcion)
    componentesPorClave.set(key, {
      valorEspecialista: row.valorEspecialista != null ? Number(row.valorEspecialista) : null,
      valorAyudante: row.valorAyudante != null ? Number(row.valorAyudante) : null,
      valorAnestesista: row.valorAnestesista != null ? Number(row.valorAnestesista) : null,
      valorGastos: row.valorGastos != null ? Number(row.valorGastos) : null,
    })
  }

  const ordenesPracticaPorId = new Map<
    number,
    Array<{ puestoNumero: number; ordenNumero: number; item: number; numeroAutorizacion: string | null }>
  >()

  for (const row of ordenesPracticaRows) {
    if (row.practicaId == null) continue
    const prev = ordenesPracticaPorId.get(row.practicaId) ?? []
    prev.push({
      puestoNumero: row.puestoNumero,
      ordenNumero: row.ordenNumero,
      item: row.item,
      numeroAutorizacion: row.numeroAutorizacion,
    })
    ordenesPracticaPorId.set(row.practicaId, prev)
  }

  return practicasOrdenadas.map((p) => ({
    ...p,
    cantidad: Number(p.cantidad),
    importeTotal: p.importeTotal != null ? Number(p.importeTotal) : null,
    facturada:
      p.puestoNumero != null &&
      p.ordenNumero != null &&
      Number(p.puestoNumero) > 0 &&
      ordenesActivasSet.has(`${Number(p.puestoNumero)}:${Number(p.ordenNumero)}`),
    usuario: p.usuarioRegistro,
    descripcionPractica: (() => {
      const key = `${p.convenioId}:${p.codigoPractica.trim()}`
      const descripcionBase = descripcionPorClave.get(key) ?? p.codigoPractica.trim()
      const componentes = componentesPorClave.get(key) ?? null
      const cantidad = Number.isFinite(Number(p.cantidad)) && Number(p.cantidad) > 0
        ? Math.floor(Number(p.cantidad))
        : 1
      const importeTotal = p.importeTotal != null ? Number(p.importeTotal) : null

      return construirDescripcionPractica({
        descripcionBase,
        matriculaEspecialista: p.matriculaEspecialista,
        matriculaAnestesista: p.matriculaAnestesista,
        importeTotal,
        cantidad,
        componentes,
      })
    })(),
    ordenPractica: ordenesPracticaPorId.get(p.id) ?? [],
    nomencladorPractica:
      descripcionPorClave.get(`${p.convenioId}:${p.codigoPractica.trim()}`)
        ? { descripcion: descripcionPorClave.get(`${p.convenioId}:${p.codigoPractica.trim()}`)! }
        : null,
  }))
}

export async function actualizarIngreso(
  id: number,
  data: ActualizarIngresoInput,
  usuarioModificacion: string
): Promise<IngresoConRelaciones> {
  const ahora = new Date()
  const usuarioNormalizado = usuarioModificacion.slice(0, 10)

  // Registrar en historial antes de actualizar
  await prisma.ingresoHistorial.create({
    data: {
      ingresoId: id,
      tipoCambio: 'M',
      usuarioCambio: usuarioNormalizado,
      fechaCambio: ahora,
    },
  })

  const updateData: Record<string, unknown> = { fechaEstado: ahora }

  const camposDirectos = [
    'fechaIngreso', 'fechaEgresoPrevista', 'fechaEgreso',
    'tipoInternacionCodigo', 'descripcionPatologia', 'descripcionPatologiaDefinitiva',
    'profesionalGuardiaId', 'profesionalTratanteId', 'camaId', 'sedeId',
    'obraSocialId', 'planId', 'numeroAfiliado',
    'obraSocialCoseguroId', 'planCoseguroId', 'numeroAfiliadoCoseguro',
    'motivoEgresoCodigo', 'observaciones', 'estado',
  ] as const

  for (const campo of camposDirectos) {
    if (data[campo] !== undefined) {
      updateData[campo] = data[campo]
    }
  }

  return prisma.ingreso.update({
    where: { id },
    data: updateData,
    include: incluirRelacionesBase,
  })
}

export async function buscarIngresos(
  params: BusquedaIngresoInput
): Promise<ResultadoPaginado<IngresoListItem>> {
  const { pagina, porPagina, q, tipoIngresoCodigo, estado, fechaDesde, fechaHasta } = params
  const skip = (pagina - 1) * porPagina

  const where: Prisma.IngresoWhereInput = {}

  if (tipoIngresoCodigo) where.tipoIngresoCodigo = tipoIngresoCodigo
  if (estado) where.estado = estado
  if (fechaDesde || fechaHasta) {
    where.fechaIngreso = {}
    if (fechaDesde) where.fechaIngreso.gte = fechaDesde
    if (fechaHasta) where.fechaIngreso.lte = fechaHasta
  }

  if (q) {
    const termino = q.trim()
    const esNumerico = /^\d+$/.test(termino)

    if (esNumerico) {
      const num = parseInt(termino, 10)
      const pacientesPorDocumento = await prisma.paciente.findMany({
        where: {
          OR: [
            { numeroDocumento: num },
            { historiaClinica: num },
          ],
        },
        select: { id: true },
        take: 25,
      })

      const orFilters: Prisma.IngresoWhereInput[] = [
        { numeroIngreso: num },
      ]

      if (pacientesPorDocumento.length > 0) {
        orFilters.push({
          pacienteId: {
            in: pacientesPorDocumento.map((p) => p.id),
          },
        })
      }

      where.OR = orFilters
    } else {
      const [pacientesPorTexto, obrasSocialesPorTexto] = await Promise.all([
        prisma.paciente.findMany({
          where: {
            OR: [
              { nombreCompleto: { contains: termino, mode: 'insensitive' } },
              { apellido: { contains: termino, mode: 'insensitive' } },
            ],
          },
          select: { id: true },
          take: MAX_IDS_BUSQUEDA_INGRESO,
        }),
        prisma.obraSocial.findMany({
          where: {
            nombre: { contains: termino, mode: 'insensitive' },
          },
          select: { id: true },
          take: MAX_IDS_BUSQUEDA_INGRESO,
        }),
      ])

      const orFilters: Prisma.IngresoWhereInput[] = [
        { nombre: { contains: termino, mode: 'insensitive' } },
      ]

      if (pacientesPorTexto.length > 0) {
        orFilters.push({
          pacienteId: {
            in: pacientesPorTexto.map((p) => p.id),
          },
        })
      }

      if (obrasSocialesPorTexto.length > 0) {
        orFilters.push({
          obraSocialId: {
            in: obrasSocialesPorTexto.map((o) => o.id),
          },
        })
      }

      where.OR = orFilters
    }
  }

  const [total, items] = await Promise.all([
    prisma.ingreso.count({ where }),
    prisma.ingreso.findMany({
      where,
      select: {
        id: true,
        tipoIngresoCodigo: true,
        numeroIngreso: true,
        nombre: true,
        pacienteId: true,
        fechaIngreso: true,
        estado: true,
        obraSocialId: true,
        tipoIngreso: { select: { codigo: true, descripcion: true } },
        ingresoSubtipo: {
          select: {
            subtipoAdmision: {
              select: { codigo: true, descripcion: true },
            },
          },
        },
        paciente: {
          select: { id: true, nombreCompleto: true, numeroDocumento: true },
        },
      },
      orderBy: { fechaIngreso: 'desc' },
      skip,
      take: porPagina,
    }),
  ])

  return {
    items: items as IngresoListItem[],
    paginacion: {
      pagina,
      porPagina,
      total,
      totalPaginas: Math.ceil(total / porPagina),
    },
  }
}

export async function registrarDiagnosticoIngreso(
  data: DiagnosticoIngresoInput,
  usuario: string
): Promise<IngresoPatologia> {
  const ahora = new Date()
  return prisma.ingresoPatologia.create({
    data: {
      ingresoId: data.ingresoId,
      patologiaId: data.patologiaId ?? null,
      fecha: data.fecha ?? ahora,
      descripcion: data.descripcion,
      observaciones: data.observaciones ?? null,
      estado: data.estado,
      fechaEstado: ahora,
      usuario,
    },
  })
}

export async function registrarMovimientoIngreso(
  data: MovimientoIngresoInput,
  usuario: string
): Promise<MovimientoIngreso> {
  const ahora = new Date()
  return prisma.movimientoIngreso.create({
    data: {
      ingresoId: data.ingresoId,
      pacienteId: data.pacienteId ?? null,
      tipoMovimientoCodigo: data.tipoMovimientoCodigo,
      fecha: data.fecha ?? ahora,
      fechaVencimiento: data.fechaVencimiento ?? null,
      concepto: data.concepto ?? null,
      signo: data.signo,
      importe: data.importe,
      saldo: data.saldo,
      estado: data.estado,
      fechaEstado: ahora,
      usuario,
    },
  })
}
