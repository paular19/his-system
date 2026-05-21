import { type NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiForbidden, apiOk, apiCreado, manejarErrorApi } from '@/lib/utils/response'
import { BusquedaLotesSchema, CrearLoteFacturacionSchema } from '@/modules/facturacion/schemas'
import { buscarLotes, crearLote } from '@/modules/facturacion/service'

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

        const data = await buscarLotes(params)
        return apiOk(data)
    } catch (error) {
        return manejarErrorApi(error)
    }
}

export async function POST(request: NextRequest) {
    try {
        const usuario = await getUsuarioSesion()
        if (!tienePermiso(usuario.rol, 'FACTURACION', 'CREAR')) return apiForbidden()

        const body = await request.json()
        const data = CrearLoteFacturacionSchema.parse(body)
        const lote = await crearLote(data, usuario.codigoUsuario, request.headers.get('x-forwarded-for') ?? undefined)

        return apiCreado(lote)
    } catch (error) {
        return manejarErrorApi(error)
    }
}
