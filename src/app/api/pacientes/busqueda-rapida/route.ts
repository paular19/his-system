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

    const where: Prisma.PacienteWhereInput = {}
    const esNumerico = /^\d+$/.test(parsed.q)

    if (esNumerico) {
      const numero = Number.parseInt(parsed.q, 10)
      where.OR = [
        { numeroDocumento: numero },
        { historiaClinica: numero },
      ]
    } else {
      where.OR = [
        { apellido: { contains: parsed.q, mode: 'insensitive' } },
        { nombre: { contains: parsed.q, mode: 'insensitive' } },
      ]
    }

    const items = await prisma.paciente.findMany({
      where,
      take: parsed.limit,
      select: {
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
      },
      orderBy: esNumerico
        ? [{ numeroDocumento: 'asc' }, { apellido: 'asc' }, { nombre: 'asc' }]
        : [{ apellido: 'asc' }, { nombre: 'asc' }],
    })

    return apiOk(items)
  } catch (error) {
    if (error instanceof ZodError) {
      return apiValidationError(error)
    }
    return manejarErrorApi(error)
  }
}
