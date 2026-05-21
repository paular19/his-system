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

        const profesionales = await prisma.profesional.findMany({
            where: { estado: 'A' },
            select: { id: true, nombre: true, matricula: true },
            orderBy: { nombre: 'asc' },
        })

        return apiOk(profesionales)
    } catch (error) {
        return manejarErrorApi(error)
    }
}
