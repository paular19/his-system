import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { prisma } from '@/lib/db'
import { apiForbidden, apiOk, manejarErrorApi } from '@/lib/utils/response'
import { z } from 'zod'
import { revalidateTag } from 'next/cache'

const CrearProfesionalManualSchema = z.object({
    nombre: z.string().trim().min(3, 'Ingresá un nombre válido').max(200, 'El nombre es demasiado largo'),
    matricula: z.number().int().positive('La matrícula debe ser mayor a 0').max(99999999),
})

export async function GET() {
    try {
        const usuario = await getUsuarioSesion()
        const puedeLeer =
            tienePermiso(usuario.rol, 'AMBULATORIO', 'LEER') ||
            tienePermiso(usuario.rol, 'ADMISION', 'LEER') ||
            tienePermiso(usuario.rol, 'FACTURACION', 'LEER')

        if (!puedeLeer) return apiForbidden()

        const profesionalesBase = await prisma.profesional.findMany({
            where: { estado: 'A' },
            select: { id: true, nombre: true, matricula: true },
            orderBy: { nombre: 'asc' },
        })

        const profesionales = [...profesionalesBase]
        const matriculasActuales = new Set(
            profesionales
                .map((profesional) => profesional.matricula)
                .filter((matricula): matricula is number => typeof matricula === 'number' && matricula > 0)
        )

        const extras = [
            { id: -6, nombre: 'ASOSIACION ANESTESISTA', matricula: 6 },
            { id: -995, nombre: 'PROFESIONAL AYUDANTE', matricula: 995 },
            { id: -9995, nombre: 'GASTOS INTERNACION', matricula: 9995 },
        ]

        for (const extra of extras) {
            if (matriculasActuales.has(extra.matricula)) continue
            profesionales.push(extra)
        }

        profesionales.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))

        return apiOk(profesionales)
    } catch (error) {
        return manejarErrorApi(error)
    }
}

export async function POST(request: Request) {
    try {
        const usuario = await getUsuarioSesion()
        const puedeCrear =
            tienePermiso(usuario.rol, 'AMBULATORIO', 'CREAR') ||
            tienePermiso(usuario.rol, 'ADMISION', 'CREAR') ||
            tienePermiso(usuario.rol, 'INTERNACION', 'CREAR') ||
            tienePermiso(usuario.rol, 'FACTURACION', 'CREAR')

        if (!puedeCrear) return apiForbidden()

        const body = await request.json().catch(() => null)
        const parsed = CrearProfesionalManualSchema.parse(body)

        const matricula = Number(parsed.matricula)
        const nombre = parsed.nombre.trim().slice(0, 200)

        const existente = await prisma.profesional.findFirst({
            where: { matricula },
            orderBy: { id: 'asc' },
            select: { id: true, nombre: true, matricula: true, estado: true },
        })

        if (existente) {
            if (existente.estado !== 'A') {
                await prisma.profesional.update({
                    where: { id: existente.id },
                    data: {
                        estado: 'A',
                        fechaEstado: new Date(),
                        usuario: usuario.codigoUsuario,
                    },
                })
            }

            revalidateTag('catalogo-profesionales')
            return apiOk({
                id: existente.id,
                nombre: existente.nombre,
                matricula: existente.matricula,
                creado: false,
            })
        }

        const creado = await prisma.profesional.create({
            data: {
                nombre,
                matricula,
                estado: 'A',
                fechaEstado: new Date(),
                usuario: usuario.codigoUsuario,
            },
            select: { id: true, nombre: true, matricula: true },
        })

        revalidateTag('catalogo-profesionales')
        return apiOk({ ...creado, creado: true }, 201)
    } catch (error) {
        return manejarErrorApi(error)
    }
}
