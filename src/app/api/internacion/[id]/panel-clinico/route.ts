import { NextRequest, NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { ROLES, tienePermiso } from '@/lib/auth/rbac'
import { manejarErrorApi } from '@/lib/utils/response'
import { prisma } from '@/lib/db'
import * as service from '@/modules/internacion/service'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'INTERNACION', 'LEER')) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const { id } = await params
    const ingresoId = Number.parseInt(id, 10)
    if (Number.isNaN(ingresoId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined
    const detalle = await service.obtenerInternacionDetalle(
      ingresoId,
      usuario.codigoUsuario,
      ip ?? undefined,
      { incluirPanelClinico: true }
    )

    if (detalle.tipoIngresoCodigo !== 'INT') {
      return NextResponse.json({ error: 'Ingreso no corresponde a internación' }, { status: 400 })
    }

    const practicasCirugiaEspejoRaw =
      usuario.rol === ROLES.ADMISION
        ? []
        : await prisma.practica.findMany({
          where: {
            ingresoId,
            OR: [{ estado: 'A' }, { estado: null }],
            usuarioRegistro: 'CIRUGIA',
          },
          select: {
            id: true,
            codigoPractica: true,
            fecha: true,
            cantidad: true,
            numeroAutorizacion: true,
            facturable: true,
            puestoNumero: true,
            ordenNumero: true,
            ordenItem: true,
            estado: true,
            usuarioRegistro: true,
            matriculaEspecialista: true,
            matriculaAnestesista: true,
            ordenPractica: {
              where: {
                orden: {
                  estado: { not: 'X' },
                },
              },
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
            _count: {
              select: {
                ordenPractica: true,
              },
            },
          },
          orderBy: { id: 'asc' },
        })

    const clavesOrdenLegacy = Array.from(new Set(
      practicasCirugiaEspejoRaw
        .map((practica) => {
          if (
            practica.puestoNumero == null ||
            practica.ordenNumero == null ||
            Number(practica.puestoNumero) <= 0 ||
            Number(practica.ordenNumero) <= 0
          ) {
            return null
          }
          return `${Number(practica.puestoNumero)}:${Number(practica.ordenNumero)}`
        })
        .filter((key): key is string => key != null)
    ))

    const ordenesLegacyActivas = clavesOrdenLegacy.length === 0
      ? []
      : await prisma.orden.findMany({
        where: {
          estado: { not: 'X' },
          OR: clavesOrdenLegacy.map((key) => {
            const [puestoNumeroRaw, ordenNumeroRaw] = key.split(':')
            return {
              puestoNumero: Number.parseInt(puestoNumeroRaw ?? '', 10),
              numero: Number.parseInt(ordenNumeroRaw ?? '', 10),
            }
          }),
        },
        select: {
          puestoNumero: true,
          numero: true,
          fechaEmision: true,
        },
      })

    const ordenesLegacyActivasSet = new Set(
      ordenesLegacyActivas.map((orden) => `${orden.puestoNumero}:${orden.numero}`)
    )

    const fechaEmisionOrdenLegacyPorClave = new Map(
      ordenesLegacyActivas.map((orden) => [`${orden.puestoNumero}:${orden.numero}`, orden.fechaEmision] as const)
    )

    const practicasCirugiaEspejo = practicasCirugiaEspejoRaw.map((practica) => {
      const ordenPracticaActivas = practica.ordenPractica.map((orden) => ({
        puestoNumero: orden.puestoNumero,
        ordenNumero: orden.ordenNumero,
        item: orden.item,
        numeroAutorizacion: orden.numeroAutorizacion,
        fechaEmision: orden.orden?.fechaEmision ?? null,
      }))

      if (
        ordenPracticaActivas.length === 0 &&
        practica.puestoNumero != null &&
        practica.ordenNumero != null &&
        Number(practica.puestoNumero) > 0 &&
        Number(practica.ordenNumero) > 0 &&
        ordenesLegacyActivasSet.has(`${Number(practica.puestoNumero)}:${Number(practica.ordenNumero)}`)
      ) {
        ordenPracticaActivas.push({
          puestoNumero: Number(practica.puestoNumero),
          ordenNumero: Number(practica.ordenNumero),
          item: practica.ordenItem != null ? Number(practica.ordenItem) : 1,
          numeroAutorizacion: practica.numeroAutorizacion,
          fechaEmision:
            fechaEmisionOrdenLegacyPorClave.get(
              `${Number(practica.puestoNumero)}:${Number(practica.ordenNumero)}`
            ) ?? practica.fecha,
        })
      }

      return {
        ...practica,
        ordenPractica: ordenPracticaActivas,
        tuvoOrdenGenerada:
          (practica._count?.ordenPractica ?? 0) > 0 ||
          (
            practica.puestoNumero != null &&
            practica.ordenNumero != null &&
            Number(practica.puestoNumero) > 0 &&
            Number(practica.ordenNumero) > 0
          ),
      }
    })

    return NextResponse.json({
      data: {
        practicas: detalle.practicas,
        cirugiasUrgencia: detalle.cirugiasUrgencia,
        practicasCirugiaEspejo,
      },
    })
  } catch (err) {
    return manejarErrorApi(err)
  }
}