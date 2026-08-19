import { prisma } from '@/lib/db'
import { calcularEdad } from '@/lib/utils'
import { construirObservacionBloqueoHabitacion } from '@/lib/internacion/bloqueo-habitacion'
import { fusionarObservacionesConMeta } from '@/modules/internacion/observaciones-meta'
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
import { obtenerTokensBusquedaFlexible } from '@/lib/utils/busqueda-flexible'
import { claveDiaArgentina } from '@/lib/utils/argentina-date'

// ============================================
// REPOSITORIO ADMISIÓN
// Única capa de acceso a datos. Sin SQL directo.
// ============================================

const MAX_IDS_BUSQUEDA_INGRESO = 250

function construirRangoFechaIngreso(params: {
  fechaDesde?: Date
  fechaHasta?: Date
}): Prisma.DateTimeFilter | null {
  const claveDesde = params.fechaDesde ? claveDiaArgentina(params.fechaDesde) : null
  const claveHasta = params.fechaHasta ? claveDiaArgentina(params.fechaHasta) : null

  if (!claveDesde && !claveHasta) return null

  const inicioClave = claveDesde ?? claveHasta
  const finClave = claveHasta ?? claveDesde
  if (!inicioClave || !finClave) return null

  const [desdeClave, hastaClave] = inicioClave <= finClave
    ? [inicioClave, finClave]
    : [finClave, inicioClave]

  return {
    gte: new Date(`${desdeClave}T00:00:00-03:00`),
    lte: new Date(`${hastaClave}T23:59:59.999-03:00`),
  }
}

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
          orden: {
            select: {
              fechaEmision: true,
            },
          },
        },
      },
      nomencladorPractica: { select: { descripcion: true } },
    },
  },
} as const

export interface IngresoCreadoMinimo {
  id: number
  tipoIngresoCodigo: string
  numeroIngreso: number
}

/**
 * Crea un ingreso generando el numeroIngreso atómicamente desde TipoIngreso.proximoNumero.
 */
export async function crearIngreso(
  data: CrearIngresoInput,
  paciente: Paciente,
  usuarioAlta: string
): Promise<IngresoCreadoMinimo> {
  const ahora = new Date()
  const edad = paciente.fechaNacimiento ? calcularEdad(paciente.fechaNacimiento) : null
  const usuarioNormalizado = usuarioAlta.slice(0, 10)

  return prisma.$transaction(async (tx) => {
    // Serializa por paciente para evitar dobles altas concurrentes
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${paciente.id})`

    if (data.tipoIngresoCodigo === 'INT') {
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
    }

    // Incrementar el contador atómicamente; el valor devuelto es el NUEVO valor
    const tipoIngreso = await tx.tipoIngreso.update({
      where: { codigo: data.tipoIngresoCodigo },
      data: { proximoNumero: { increment: 1 } },
    })
    // El número a usar es el valor ANTES del incremento
    const numeroIngreso = tipoIngreso.proximoNumero - 1

    let habitacionParaBloqueo: string | null = null

    if (data.tipoIngresoCodigo === 'INT' && data.camaId) {
      const cama = await tx.cama.findUnique({
        where: { id: data.camaId },
        select: { id: true, estado: true, habitacion: true },
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

      const internacionActivaEnCama = await tx.ingreso.findFirst({
        where: {
          camaId: data.camaId,
          estado: 'A',
          tipoIngresoCodigo: 'INT',
        },
        select: { id: true, numeroIngreso: true },
      })

      if (internacionActivaEnCama) {
        throw new Error(
          `La cama seleccionada ya está asignada a una internación activa (INT-${internacionActivaEnCama.numeroIngreso}).`
        )
      }

      const estadoDestino = data.subtipoAdmisionCodigo === 'PRG' ? 'RESERVADA' : 'OCUPADA'

      if (data.bloquearHabitacionCompleta) {
        const habitacion = cama.habitacion?.trim() ?? ''
        if (!habitacion) {
          throw new Error('No se puede bloquear la habitacion porque la cama seleccionada no tiene habitacion asociada')
        }
        habitacionParaBloqueo = habitacion
      }

      await tx.cama.update({
        where: { id: data.camaId },
        data: {
          estado: estadoDestino,
          observaciones: null,
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
        profesionalDerivanteId: data.profesionalDerivanteId ?? null,
        profesionalTratanteId: data.profesionalTratanteId ?? null,
        camaId: data.camaId ?? null,
        sedeId: data.sedeId ?? null,
        // Asegurar plan consistente con la obra social seleccionada
        obraSocialId,
        planId,
        numeroAfiliado: data.numeroAfiliado ?? null,
        nombreTutor: data.nombreTutor ?? null,
        telefonoTutor: data.telefonoTutor ?? null,
        obraSocialCoseguroId: data.obraSocialCoseguroId ?? null,
        planCoseguroId: data.planCoseguroId ?? null,
        numeroAfiliadoCoseguro: data.numeroAfiliadoCoseguro ?? null,
        observaciones: data.observaciones ?? null,
        estado: 'A',
        fechaEstado: ahora,
        usuario: usuarioNormalizado,
      },
      select: {
        id: true,
        tipoIngresoCodigo: true,
        numeroIngreso: true,
      },
    })

    if (
      data.tipoIngresoCodigo === 'INT' &&
      data.camaId &&
      data.bloquearHabitacionCompleta &&
      habitacionParaBloqueo
    ) {
      const camasHabitacion = await tx.cama.findMany({
        where: { habitacion: habitacionParaBloqueo },
        select: { id: true, identificador: true, estado: true },
      })

      const camasABloquear = camasHabitacion.filter((item) => item.id !== data.camaId)
      const camasNoDisponibles = camasABloquear.filter((item) => item.estado !== 'DISPONIBLE')

      if (camasNoDisponibles.length > 0) {
        const camasTexto = camasNoDisponibles.map((item) => item.identificador).join(', ')
        throw new Error(`No se puede bloquear la habitacion completa porque hay camas no disponibles: ${camasTexto}`)
      }

      const camasABloquearIds = camasABloquear.map((item) => item.id)

      if (camasABloquearIds.length > 0) {
        const internacionesActivas = await tx.ingreso.findMany({
          where: {
            camaId: { in: camasABloquearIds },
            estado: 'A',
            tipoIngresoCodigo: 'INT',
          },
          select: { numeroIngreso: true },
        })

        if (internacionesActivas.length > 0) {
          const numeros = internacionesActivas.map((item) => `INT-${item.numeroIngreso}`).join(', ')
          throw new Error(`No se puede bloquear la habitacion completa porque ya hay internaciones activas en esas camas (${numeros})`)
        }

        const observacionBloqueo = construirObservacionBloqueoHabitacion(
          ingreso.id,
          habitacionParaBloqueo
        )

        const resultadoBloqueo = await tx.cama.updateMany({
          where: {
            id: { in: camasABloquearIds },
            estado: 'DISPONIBLE',
          },
          data: {
            estado: 'OCUPADA',
            observaciones: observacionBloqueo,
            usuario: usuarioNormalizado,
            fechaEstado: ahora,
          },
        })

        if (resultadoBloqueo.count !== camasABloquearIds.length) {
          throw new Error('No se pudo bloquear la habitacion completa por un cambio concurrente de camas')
        }
      }
    }

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
      motivoEgreso: { select: { codigo: true, descripcion: true } },
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
        orden: {
          select: {
            fechaEmision: true,
          },
        },
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
    Array<{
      puestoNumero: number
      ordenNumero: number
      item: number
      numeroAutorizacion: string | null
      fechaEmision: Date | null
    }>
  >()

  for (const row of ordenesPracticaRows) {
    if (row.practicaId == null) continue
    const prev = ordenesPracticaPorId.get(row.practicaId) ?? []
    prev.push({
      puestoNumero: row.puestoNumero,
      ordenNumero: row.ordenNumero,
      item: row.item,
      numeroAutorizacion: row.numeroAutorizacion,
      fechaEmision: row.orden?.fechaEmision ?? null,
    })
    ordenesPracticaPorId.set(row.practicaId, prev)
  }

  const practicas = practicasOrdenadas.map((p) => ({
    ...p,
    cantidad: Number(p.cantidad),
    importeTotal: p.importeTotal != null ? Number(p.importeTotal) : null,
    facturada: (p.estado ?? '').trim().toUpperCase() === 'F',
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
        orden: {
          select: {
            fechaEmision: true,
          },
        },
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
    Array<{
      puestoNumero: number
      ordenNumero: number
      item: number
      numeroAutorizacion: string | null
      fechaEmision: Date | null
    }>
  >()

  for (const row of ordenesPracticaRows) {
    if (row.practicaId == null) continue
    const prev = ordenesPracticaPorId.get(row.practicaId) ?? []
    prev.push({
      puestoNumero: row.puestoNumero,
      ordenNumero: row.ordenNumero,
      item: row.item,
      numeroAutorizacion: row.numeroAutorizacion,
      fechaEmision: row.orden?.fechaEmision ?? null,
    })
    ordenesPracticaPorId.set(row.practicaId, prev)
  }

  return practicasOrdenadas.map((p) => ({
    ...p,
    cantidad: Number(p.cantidad),
    importeTotal: p.importeTotal != null ? Number(p.importeTotal) : null,
    facturada: (p.estado ?? '').trim().toUpperCase() === 'F',
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
    'profesionalGuardiaId', 'profesionalDerivanteId', 'profesionalTratanteId', 'camaId', 'sedeId',
    'obraSocialId', 'planId', 'numeroAfiliado', 'nombreTutor', 'telefonoTutor',
    'obraSocialCoseguroId', 'planCoseguroId', 'numeroAfiliadoCoseguro',
    'motivoEgresoCodigo', 'observaciones', 'estado',
  ] as const

  for (const campo of camposDirectos) {
    if (data[campo] !== undefined) {
      updateData[campo] = data[campo]
    }
  }

  // Los formularios editan solo el texto libre: hay que reponer el bloque meta
  // (checklist documental, ARM/O2, depositos) para no borrarlo al guardar.
  if (data.observaciones !== undefined) {
    const ingresoActual = await prisma.ingreso.findUnique({
      where: { id },
      select: { observaciones: true },
    })
    updateData.observaciones = fusionarObservacionesConMeta(
      ingresoActual?.observaciones,
      data.observaciones
    )
  }

  // Campos que viven en IngresoSubtipo (derivacion, turno/practica, indicacion medica).
  const camposSubtipo = [
    'profesionalIdTurno', 'fechaTurno', 'practicaCodigo',
    'centroDerivante', 'profesionalDerivanteNombre', 'motivoDerivacion', 'diagnosticoDerivacion',
    'profesionalIndicadorId', 'profesionalIndicadorNombre', 'tipoIndicacion', 'descripcionIndicacion',
  ] as const

  const updateSubtipo: Record<string, unknown> = {}
  for (const campo of camposSubtipo) {
    if (data[campo] !== undefined) {
      updateSubtipo[campo] = data[campo]
    }
  }

  return prisma.$transaction(async (tx) => {
    if (Object.keys(updateSubtipo).length > 0) {
      const subtipoExistente = await tx.ingresoSubtipo.findUnique({
        where: { ingresoId: id },
        select: { id: true },
      })

      if (subtipoExistente) {
        await tx.ingresoSubtipo.update({
          where: { id: subtipoExistente.id },
          data: { ...updateSubtipo, usuario: usuarioNormalizado, fechaEstado: ahora },
        })
      }
    }

    return tx.ingreso.update({
      where: { id },
      data: updateData,
      include: incluirRelacionesBase,
    })
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
  const rangoFechaIngreso = construirRangoFechaIngreso({ fechaDesde, fechaHasta })
  if (rangoFechaIngreso) where.fechaIngreso = rangoFechaIngreso

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
      const tokens = obtenerTokensBusquedaFlexible(termino)
      const tokensBusqueda = tokens.length > 0 ? tokens : [termino]

      const [pacientesPorTexto, obrasSocialesPorTexto] = await Promise.all([
        prisma.paciente.findMany({
          where: {
            AND: tokensBusqueda.map((token) => ({
              OR: [
                { nombreCompleto: { contains: token, mode: 'insensitive' } },
                { apellido: { contains: token, mode: 'insensitive' } },
                { nombre: { contains: token, mode: 'insensitive' } },
              ],
            })),
          },
          select: { id: true },
          take: MAX_IDS_BUSQUEDA_INGRESO,
        }),
        prisma.obraSocial.findMany({
          where: {
            AND: tokensBusqueda.map((token) => ({
              nombre: { contains: token, mode: 'insensitive' },
            })),
          },
          select: { id: true },
          take: MAX_IDS_BUSQUEDA_INGRESO,
        }),
      ])

      const orFilters: Prisma.IngresoWhereInput[] = [
        {
          AND: tokensBusqueda.map((token) => ({
            nombre: { contains: token, mode: 'insensitive' },
          })),
        },
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
  return prisma.$transaction(async (tx) => {
    const diagnostico = await tx.ingresoPatologia.create({
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

    const diagnosticoActivo = await tx.ingresoPatologia.findFirst({
      where: { ingresoId: data.ingresoId, estado: 'A' },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      select: { descripcion: true },
    })

    await tx.ingreso.update({
      where: { id: data.ingresoId },
      data: { descripcionPatologia: diagnosticoActivo?.descripcion ?? null },
    })

    return diagnostico
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
