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
            OR: [{ estado: null }, { estado: { not: 'X' } }],
            usuarioRegistro: 'CIRUGIA',
          },
          select: {
            id: true,
            convenioId: true,
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
                clasificacionAgrupacion: true,
                efectorMatricula: true,
                convenioId: true,
                codigoPractica: true,
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

    // El codigo de practica se guarda con padding inconsistente (VarChar en Practica,
    // Char en el nomenclador), asi que la descripcion se resuelve con una consulta
    // aparte normalizando el codigo en vez de usar la relacion de Prisma.
    const clavesNomenclador = new Map<string, { convenioId: number; codigo: string }>()
    for (const practica of practicasCirugiaEspejoRaw) {
      const codigo = practica.codigoPractica.trim()
      if (codigo) clavesNomenclador.set(`${practica.convenioId}:${codigo}`, { convenioId: practica.convenioId, codigo })
      for (const orden of practica.ordenPractica) {
        const codigoOrden = orden.codigoPractica.trim()
        if (codigoOrden) clavesNomenclador.set(`${orden.convenioId}:${codigoOrden}`, { convenioId: orden.convenioId, codigo: codigoOrden })
      }
    }

    const descripcionNomencladorPorClave = new Map<string, string>()
    if (clavesNomenclador.size > 0) {
      const claves = Array.from(clavesNomenclador.values())
      const nomencladores = await prisma.nomencladorPractica.findMany({
        where: {
          convenioId: { in: Array.from(new Set(claves.map((clave) => clave.convenioId))) },
          codigo: { in: Array.from(new Set(claves.map((clave) => clave.codigo))) },
        },
        select: { convenioId: true, codigo: true, descripcion: true },
      })
      for (const nomenclador of nomencladores) {
        const descripcion = nomenclador.descripcion.trim()
        if (!descripcion) continue
        descripcionNomencladorPorClave.set(`${nomenclador.convenioId}:${nomenclador.codigo.trim()}`, descripcion)
      }
    }

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
        clasificacionAgrupacion: orden.clasificacionAgrupacion,
        efectorMatricula: orden.efectorMatricula,
        descripcionPractica:
          descripcionNomencladorPorClave.get(`${orden.convenioId}:${orden.codigoPractica.trim()}`) ?? null,
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
          clasificacionAgrupacion: null,
          efectorMatricula: practica.matriculaEspecialista ?? practica.matriculaAnestesista ?? null,
          descripcionPractica: null,
          fechaEmision:
            fechaEmisionOrdenLegacyPorClave.get(
              `${Number(practica.puestoNumero)}:${Number(practica.ordenNumero)}`
            ) ?? practica.fecha,
        })
      }

      return {
        ...practica,
        descripcionPractica:
          descripcionNomencladorPorClave.get(`${practica.convenioId}:${practica.codigoPractica.trim()}`) ?? null,
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