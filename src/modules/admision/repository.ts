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
import type { Paciente, IngresoPatologia, MovimientoIngreso } from '@prisma/client'
import type { ResultadoPaginado } from '@/types'

// ============================================
// REPOSITORIO ADMISIÓN
// Única capa de acceso a datos. Sin SQL directo.
// ============================================

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

  return prisma.$transaction(async (tx) => {
    // Incrementar el contador atómicamente; el valor devuelto es el NUEVO valor
    const tipoIngreso = await tx.tipoIngreso.update({
      where: { codigo: data.tipoIngresoCodigo },
      data: { proximoNumero: { increment: 1 } },
    })
    // El número a usar es el valor ANTES del incremento
    const numeroIngreso = tipoIngreso.proximoNumero - 1

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
        // Asegurar que ambos obraSocialId y planId estén presentes o ambos null
        obraSocialId: data.obraSocialId ?? null,
        planId: (data.obraSocialId && data.planId) ? data.planId : null,
        numeroAfiliado: data.numeroAfiliado ?? null,
        obraSocialCoseguroId: data.obraSocialCoseguroId ?? null,
        planCoseguroId: data.planCoseguroId ?? null,
        numeroAfiliadoCoseguro: data.numeroAfiliadoCoseguro ?? null,
        observaciones: data.observaciones ?? null,
        estado: 'A',
        fechaEstado: ahora,
        usuario: usuarioAlta,
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
          usuario: usuarioAlta,
          fechaEstado: ahora,
        },
      })
    }

    return ingreso
  })
}

export async function obtenerIngresoPorId(id: number): Promise<IngresoDetalle | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (prisma.ingreso.findUnique as any)({
    where: { id },
    include: incluirRelacionesDetalle,
  })
  return result as IngresoDetalle | null
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

  const where: any = {}

  if (tipoIngresoCodigo) where.tipoIngresoCodigo = tipoIngresoCodigo
  if (estado) where.estado = estado
  if (fechaDesde || fechaHasta) {
    where.fechaIngreso = {}
    if (fechaDesde) where.fechaIngreso.gte = fechaDesde
    if (fechaHasta) where.fechaIngreso.lte = fechaHasta
  }

  if (q) {
    const esNumerico = /^\d+$/.test(q)
    if (esNumerico) {
      const num = parseInt(q, 10)
      where.OR = [
        { numeroIngreso: num },
        { nombre: { contains: q, mode: 'insensitive' } },
        { paciente: { numeroDocumento: num } },
        { paciente: { historiaClinica: num } },
      ]
    } else {
      where.OR = [
        { nombre: { contains: q, mode: 'insensitive' } },
        { paciente: { nombreCompleto: { contains: q, mode: 'insensitive' } } },
        { paciente: { apellido: { contains: q, mode: 'insensitive' } } },
      ]
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
