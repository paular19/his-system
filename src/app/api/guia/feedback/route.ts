import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getUsuarioSesion } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  apiCreado,
  apiOk,
  apiValidationError,
  manejarErrorApi,
} from '@/lib/utils/response'
import {
  GUIA_MODULOS_IDS,
  GUIA_PRIORIDADES,
  GUIA_TIPOS_FEEDBACK,
} from '@/modules/guia/constants'

const CrearFeedbackSchema = z.object({
  modulo: z.enum(GUIA_MODULOS_IDS),
  tipo: z.enum(GUIA_TIPOS_FEEDBACK),
  prioridad: z.enum(GUIA_PRIORIDADES),
  titulo: z.string().trim().min(6).max(140),
  comentario: z.string().trim().min(20).max(2000),
  pantalla: z.string().trim().max(120).optional().nullable(),
  pasos: z.string().trim().max(1500).optional().nullable(),
  resultadoEsperado: z.string().trim().max(1500).optional().nullable(),
})

function limpiarOpcional(value: string | null | undefined): string | null {
  const limpio = value?.trim()
  return limpio ? limpio : null
}

export async function GET(request: NextRequest) {
  try {
    await getUsuarioSesion()

    const moduloParam = request.nextUrl.searchParams.get('modulo')
    const moduloValido = GUIA_MODULOS_IDS.find((modulo) => modulo === moduloParam)

    const feedbacks = await prisma.guiaFeedback.findMany({
      where: moduloValido ? { modulo: moduloValido } : undefined,
      orderBy: {
        createdAt: 'desc',
      },
      take: 300,
    })

    return apiOk(feedbacks)
  } catch (error) {
    return manejarErrorApi(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const usuario = await getUsuarioSesion()

    const body: unknown = await request.json()
    const data = CrearFeedbackSchema.parse(body)

    const creado = await prisma.guiaFeedback.create({
      data: {
        modulo: data.modulo,
        tipo: data.tipo,
        prioridad: data.prioridad,
        titulo: data.titulo,
        comentario: data.comentario,
        pantalla: limpiarOpcional(data.pantalla),
        pasos: limpiarOpcional(data.pasos),
        resultadoEsperado: limpiarOpcional(data.resultadoEsperado),
        usuarioClerkId: usuario.clerkId.slice(0, 50),
        usuarioCodigo: usuario.codigoUsuario.slice(0, 10),
        usuarioNombre: (usuario.nombre || usuario.codigoUsuario).slice(0, 120),
        usuarioEmail: (usuario.email || 'sin-email@local').slice(0, 120),
      },
    })

    return apiCreado(creado)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiValidationError(error)
    }

    return manejarErrorApi(error)
  }
}
