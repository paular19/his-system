import { type NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiForbidden, apiOk, manejarErrorApi } from '@/lib/utils/response'
import { BusquedaLotesSchema } from '@/modules/facturacion/schemas'
import { buscarPracticasFacturadasProfesionalEnLotes } from '@/modules/facturacion/service'

export async function GET(request: NextRequest) {
    try {
        const usuario = await getUsuarioSesion()
        if (!tienePermiso(usuario.rol, 'FACTURACION', 'LEER')) return apiForbidden()

        const { searchParams } = request.nextUrl
        const params = BusquedaLotesSchema.parse({
            periodo: searchParams.get('periodo') ?? undefined,
            estado: searchParams.get('estado') ?? undefined,
            obraSocialId: searchParams.get('obraSocialId') ?? undefined,
            tipo: searchParams.get('tipo') ?? undefined,
            medico: searchParams.get('medico') ?? undefined,
            matricula: searchParams.get('matricula') ?? undefined,
            pagina: searchParams.get('pagina') ?? 1,
            porPagina: searchParams.get('porPagina') ?? 20,
        })

        const data = await buscarPracticasFacturadasProfesionalEnLotes(params)
        return apiOk(data)
    } catch (error) {
        return manejarErrorApi(error)
    }
}
