'use server'

import { revalidatePath } from 'next/cache'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso, type RolHIS } from '@/lib/auth/rbac'
import { prisma } from '@/lib/db'
import { registrarAudit } from '@/lib/security/audit'
import {
  BuscarOrdenesElectrocardiogramaSchema,
  CrearElectrocardiogramaSchema,
} from '../schemas'

function puedeLeerFicha(rol: RolHIS): boolean {
  return tienePermiso(rol, 'INTERNACION', 'LEER') || tienePermiso(rol, 'ADMISION', 'LEER')
}

function puedeModificarFicha(rol: RolHIS): boolean {
  return tienePermiso(rol, 'INTERNACION', 'MODIFICAR') ||
    tienePermiso(rol, 'INTERNACION', 'CREAR') ||
    tienePermiso(rol, 'ADMISION', 'MODIFICAR') ||
    tienePermiso(rol, 'ADMISION', 'CREAR')
}

const registroSelect = {
  id: true,
  ingresoId: true,
  fecha: true,
  hora: true,
  puestoNumero: true,
  ordenNumero: true,
  ordenItem: true,
  ordenItemRelacion: {
    select: {
      codigoPractica: true,
      nomencladorPractica: { select: { descripcion: true } },
    },
  },
} as const

type RegistroSeleccionado = {
  id: number
  ingresoId: number
  fecha: Date
  hora: string | null
  puestoNumero: number | null
  ordenNumero: number | null
  ordenItem: number | null
  ordenItemRelacion: {
    codigoPractica: string
    nomencladorPractica: { descripcion: string } | null
  } | null
}

function serializarRegistro(registro: RegistroSeleccionado) {
  return {
    id: registro.id,
    ingresoId: registro.ingresoId,
    fecha: registro.fecha.toISOString().slice(0, 10),
    hora: registro.hora,
    puestoNumero: registro.puestoNumero,
    ordenNumero: registro.ordenNumero,
    ordenItem: registro.ordenItem,
    codigoPractica: registro.ordenItemRelacion?.codigoPractica.trim() ?? null,
    descripcionPractica: registro.ordenItemRelacion?.nomencladorPractica?.descripcion.trim() ?? null,
  }
}

export async function listarElectrocardiogramasAction(ingresoId: number) {
  const usuario = await getUsuarioSesion()
  if (!puedeLeerFicha(usuario.rol)) throw new Error('Sin permisos para consultar electrocardiogramas')

  const registros = await prisma.electrocardiogramaIngreso.findMany({
    where: { ingresoId },
    select: registroSelect,
    orderBy: [{ fecha: 'desc' }, { hora: 'desc' }, { id: 'desc' }],
  })
  return registros.map(serializarRegistro)
}

export async function buscarOrdenesParaElectrocardiogramaAction(input: { ingresoId: number; q: string }) {
  const usuario = await getUsuarioSesion()
  if (!puedeLeerFicha(usuario.rol)) throw new Error('Sin permisos para consultar órdenes')
  const validado = BuscarOrdenesElectrocardiogramaSchema.parse(input)
  const ingreso = await prisma.ingreso.findUnique({
    where: { id: validado.ingresoId },
    select: { pacienteId: true },
  })
  if (!ingreso) throw new Error('Internación no encontrada')
  if (!ingreso.pacienteId) return []

  const numeroBuscado = /^\d+$/.test(validado.q) ? Number(validado.q) : null
  const items = await prisma.ordenPractica.findMany({
    where: {
      orden: {
        estado: { not: 'X' },
        OR: [
          { pacienteId: ingreso.pacienteId },
          { ingreso: { pacienteId: ingreso.pacienteId } },
        ],
      },
      ...(validado.q ? {
        OR: [
          { codigoPractica: { contains: validado.q, mode: 'insensitive' as const } },
          { nomencladorPractica: { descripcion: { contains: validado.q, mode: 'insensitive' as const } } },
          { orden: { descripcion: { contains: validado.q, mode: 'insensitive' as const } } },
          ...(numeroBuscado == null ? [] : [{ ordenNumero: numeroBuscado }]),
        ],
      } : {}),
    },
    select: {
      puestoNumero: true,
      ordenNumero: true,
      item: true,
      codigoPractica: true,
      nomencladorPractica: { select: { descripcion: true } },
      orden: { select: { fechaEmision: true } },
    },
    orderBy: [{ orden: { fechaEmision: 'desc' } }, { item: 'asc' }],
    take: 30,
  })

  return items.map((item) => ({
    puestoNumero: item.puestoNumero,
    ordenNumero: item.ordenNumero,
    item: item.item,
    fechaEmision: item.orden.fechaEmision.toISOString(),
    codigoPractica: item.codigoPractica.trim(),
    descripcionPractica: item.nomencladorPractica?.descripcion.trim() ?? null,
  }))
}

export async function crearElectrocardiogramaAction(input: unknown) {
  const usuario = await getUsuarioSesion()
  if (!puedeModificarFicha(usuario.rol)) throw new Error('Sin permisos para registrar electrocardiogramas')
  const validado = CrearElectrocardiogramaSchema.parse(input)
  const ingreso = await prisma.ingreso.findUnique({
    where: { id: validado.ingresoId },
    select: { id: true, pacienteId: true, tipoIngresoCodigo: true },
  })
  if (!ingreso || ingreso.tipoIngresoCodigo.trim() !== 'INT') throw new Error('Internación no encontrada')

  if (validado.orden) {
    const item = await prisma.ordenPractica.findUnique({
      where: {
        puestoNumero_ordenNumero_item: {
          puestoNumero: validado.orden.puestoNumero,
          ordenNumero: validado.orden.ordenNumero,
          item: validado.orden.item,
        },
      },
      select: {
        orden: {
          select: { estado: true, pacienteId: true, ingreso: { select: { pacienteId: true } } },
        },
      },
    })
    const perteneceAlPaciente = ingreso.pacienteId != null &&
      (item?.orden.pacienteId === ingreso.pacienteId || item?.orden.ingreso?.pacienteId === ingreso.pacienteId)
    if (!item || item.orden.estado === 'X' || !perteneceAlPaciente) {
      throw new Error('La orden seleccionada no pertenece al paciente de esta internación')
    }
  }

  const registro = await prisma.electrocardiogramaIngreso.create({
    data: {
      ingresoId: ingreso.id,
      fecha: validado.fecha,
      hora: validado.hora || null,
      puestoNumero: validado.orden?.puestoNumero ?? null,
      ordenNumero: validado.orden?.ordenNumero ?? null,
      ordenItem: validado.orden?.item ?? null,
      usuario: usuario.codigoUsuario.slice(0, 10),
    },
    select: registroSelect,
  })
  await registrarAudit({
    usuario: usuario.codigoUsuario,
    accion: 'CREAR',
    entidad: 'ElectrocardiogramaIngreso',
    registroId: registro.id,
    detalle: `Electrocardiograma registrado en internación ${ingreso.id}`,
  })
  revalidatePath(`/dashboard/internacion/${ingreso.id}`)
  return serializarRegistro(registro)
}

export async function eliminarElectrocardiogramaAction(id: number, ingresoId: number) {
  const usuario = await getUsuarioSesion()
  if (!puedeModificarFicha(usuario.rol)) throw new Error('Sin permisos para eliminar electrocardiogramas')
  const eliminado = await prisma.electrocardiogramaIngreso.deleteMany({ where: { id, ingresoId } })
  if (eliminado.count === 0) throw new Error('Electrocardiograma no encontrado')
  await registrarAudit({
    usuario: usuario.codigoUsuario,
    accion: 'ELIMINAR',
    entidad: 'ElectrocardiogramaIngreso',
    registroId: id,
    detalle: `Electrocardiograma eliminado de internación ${ingresoId}`,
  })
  revalidatePath(`/dashboard/internacion/${ingresoId}`)
  return { ok: true }
}
