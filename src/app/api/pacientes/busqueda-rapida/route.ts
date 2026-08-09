import { type NextRequest } from 'next/server'
import { ZodError, z } from 'zod'
import type { Prisma } from '@prisma/client'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { prisma } from '@/lib/db'
import {
  apiForbidden,
  apiOk,
  apiValidationError,
  manejarErrorApi,
} from '@/lib/utils/response'
import NodeCache from 'node-cache'
import { obtenerTokensBusquedaFlexible } from '@/lib/utils/busqueda-flexible'

const cache = new NodeCache({ stdTTL: 45 })
const INSENSITIVE = 'insensitive' as const

function buildCacheKey(q: string, limit: number): string {
  return `pacientes-busqueda-rapida:${q.toLowerCase()}:${limit}`
}

const BusquedaRapidaSchema = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(20).default(10),
})

export async function GET(request: NextRequest) {
  try {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'PACIENTES', 'LEER')) {
      return apiForbidden()
    }

    const parsed = BusquedaRapidaSchema.parse({
      q: request.nextUrl.searchParams.get('q') ?? '',
      limit: request.nextUrl.searchParams.get('limit') ?? 10,
    })

    const termino = parsed.q.trim()
    const tokens = obtenerTokensBusquedaFlexible(termino)
    const tokensBusqueda = tokens.length > 0 ? tokens : [termino]
    const tokenPrincipal = tokensBusqueda[0] ?? termino
    const tokensSecundarios = tokensBusqueda.slice(1)
    const cacheKey = buildCacheKey(termino, parsed.limit)
    const cacheado = cache.get<unknown[]>(cacheKey)
    if (cacheado) {
      return apiOk(cacheado)
    }

    const where: Prisma.PacienteWhereInput = {}
    const esNumerico = /^\d+$/.test(termino)

    const selectPaciente = {
      id: true,
      historiaClinica: true,
      apellido: true,
      nombre: true,
      nombreCompleto: true,
      tipoDocumento: true,
      numeroDocumento: true,
      sexo: true,
      fechaNacimiento: true,
      domicilio: true,
      telefonoFijo: true,
      celular1: true,
      email: true,
      obraSocialId: true,
      planId: true,
      obraSocialCoseguroId: true,
      numeroAfiliado: true,
      nombreTutor: true,
      telefonoTutor: true,
      obraSocial: {
        select: { nombre: true },
      },
      plan: {
        select: { descripcion: true },
      },
    } as const

    const serializarPacientes = async (
      rows: Array<{
        id: number
        historiaClinica: number | null
        apellido: string | null
        nombre: string | null
        nombreCompleto: string
        tipoDocumento: string | null
        numeroDocumento: number | null
        sexo: string | null
        fechaNacimiento: Date | null
        domicilio: string | null
        telefonoFijo: string | null
        celular1: string | null
        email: string | null
        obraSocialId: number | null
        planId: number | null
        obraSocialCoseguroId: number | null
        numeroAfiliado: string | null
        nombreTutor: string | null
        telefonoTutor: string | null
        obraSocial: { nombre: string } | null
        plan: { descripcion: string } | null
      }>
    ) => {
      const idsCoseguro = Array.from(
        new Set(rows.map((paciente) => paciente.obraSocialCoseguroId).filter((id): id is number => id != null))
      )

      const coseguros = idsCoseguro.length > 0
        ? await prisma.obraSocial.findMany({
          where: { id: { in: idsCoseguro } },
          select: { id: true, nombre: true },
        })
        : []

      const coseguroPorId = new Map(coseguros.map((item) => [item.id, item.nombre]))

      return rows.map((paciente) => {
        const obraSocialNombre = paciente.obraSocial?.nombre ?? null
        return {
          id: paciente.id,
          historiaClinica: paciente.historiaClinica,
          apellido: paciente.apellido,
          nombre: paciente.nombre,
          nombreCompleto: paciente.nombreCompleto,
          tipoDocumento: paciente.tipoDocumento,
          numeroDocumento: paciente.numeroDocumento,
          sexo: paciente.sexo,
          fechaNacimiento: paciente.fechaNacimiento,
          domicilio: paciente.domicilio,
          telefonoFijo: paciente.telefonoFijo,
          celular1: paciente.celular1,
          email: paciente.email,
          obraSocialId: paciente.obraSocialId,
          planId: paciente.planId,
          obraSocialCoseguroId: paciente.obraSocialCoseguroId,
          numeroAfiliado: paciente.numeroAfiliado,
          nombreTutor: paciente.nombreTutor,
          telefonoTutor: paciente.telefonoTutor,
          obraSocialNombre,
          planDescripcion: paciente.plan?.descripcion ?? null,
          obraSocialCoseguroNombre:
            paciente.obraSocialCoseguroId
              ? (coseguroPorId.get(paciente.obraSocialCoseguroId) ?? null)
              : null,
        }
      })
    }

    if (esNumerico) {
      const numero = Number.parseInt(termino, 10)
      where.OR = [
        { numeroDocumento: numero },
        { historiaClinica: numero },
      ]

      const itemsNumericos = await prisma.paciente.findMany({
        where,
        take: parsed.limit,
        select: selectPaciente,
        orderBy: [{ numeroDocumento: 'asc' }, { apellido: 'asc' }, { nombre: 'asc' }],
      })

      const payload = await serializarPacientes(itemsNumericos)
      cache.set(cacheKey, payload)
      return apiOk(payload)
    }

    const prefijo = await prisma.paciente.findMany({
      where: {
        AND: [
          {
            OR: [
              { apellido: { startsWith: tokenPrincipal, mode: INSENSITIVE } },
              { nombre: { startsWith: tokenPrincipal, mode: INSENSITIVE } },
              { nombreCompleto: { startsWith: tokenPrincipal, mode: INSENSITIVE } },
            ],
          },
          ...tokensSecundarios.map((token) => ({
            OR: [
              { apellido: { contains: token, mode: INSENSITIVE } },
              { nombre: { contains: token, mode: INSENSITIVE } },
              { nombreCompleto: { contains: token, mode: INSENSITIVE } },
            ],
          })),
        ],
      },
      take: parsed.limit,
      select: selectPaciente,
      orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
    })

    if (prefijo.length >= parsed.limit) {
      const payload = await serializarPacientes(prefijo)
      cache.set(cacheKey, payload)
      return apiOk(payload)
    }

    const idsPrefijo = prefijo.map((p) => p.id)
    const restantes = await prisma.paciente.findMany({
      where: {
        AND: tokensBusqueda.map((token) => ({
          OR: [
            { apellido: { contains: token, mode: INSENSITIVE } },
            { nombre: { contains: token, mode: INSENSITIVE } },
            { nombreCompleto: { contains: token, mode: INSENSITIVE } },
          ],
        })),
        ...(idsPrefijo.length > 0 ? { id: { notIn: idsPrefijo } } : {}),
      },
      take: parsed.limit - prefijo.length,
      select: selectPaciente,
      orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
    })

    const items = [...prefijo, ...restantes]
    const payload = await serializarPacientes(items)
    cache.set(cacheKey, payload)
    return apiOk(payload)
  } catch (error) {
    if (error instanceof ZodError) {
      return apiValidationError(error)
    }
    return manejarErrorApi(error)
  }
}
