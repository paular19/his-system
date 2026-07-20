import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { prisma } from '@/lib/db'
import { apiForbidden, apiOk, manejarErrorApi } from '@/lib/utils/response'

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
