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

    const practicasCirugiaEspejo =
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
              },
            },
          },
          orderBy: { id: 'asc' },
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