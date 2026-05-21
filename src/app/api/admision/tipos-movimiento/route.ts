import { type NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiOk, manejarErrorApi } from '@/lib/utils/response'
import { prisma } from '@/lib/db'

// GET /api/admision/tipos-movimiento
export async function GET(request: NextRequest) {
    try {
        const usuario = await getUsuarioSesion()
        if (!tienePermiso(usuario.rol, 'ADMISION', 'LEER')) {
            return new Response(JSON.stringify({ message: 'No autorizado' }), { status: 403 })
        }

        const tiposMovimiento = await prisma.tipoMovimientoIngreso.findMany({
            select: {
                codigo: true,
                descripcion: true,
            },
            orderBy: { descripcion: 'asc' },
        })

        return apiOk(tiposMovimiento)
    } catch (error) {
        return manejarErrorApi(error)
    }
}
