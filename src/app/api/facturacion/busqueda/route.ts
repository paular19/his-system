import { type NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiForbidden, apiOk, manejarErrorApi } from '@/lib/utils/response'
import { BusquedaFacturacionSchema } from '@/modules/facturacion/schemas'
import { buscarAdmisionesFacturacion } from '@/modules/facturacion/service'

export async function GET(request: NextRequest) {
    try {
        const usuario = await getUsuarioSesion()
        if (!tienePermiso(usuario.rol, 'FACTURACION', 'LEER')) return apiForbidden()

        const { searchParams } = request.nextUrl
        const params = BusquedaFacturacionSchema.parse({
            q: searchParams.get('q') ?? undefined,
            pacienteNombre: searchParams.get('pacienteNombre') ?? undefined,
            historiaClinica: searchParams.get('historiaClinica') ?? undefined,
            numeroDocumento: searchParams.get('numeroDocumento') ?? undefined,
            obraSocialId: searchParams.get('obraSocialId') ?? undefined,
            tipoIngresoCodigo: searchParams.get('tipoIngresoCodigo') ?? undefined,
            codigoPractica: searchParams.get('codigoPractica') ?? undefined,
            fechaIngreso: searchParams.get('fechaIngreso') ?? undefined,
            fechaDesde: searchParams.get('fechaDesde') ?? undefined,
            fechaHasta: searchParams.get('fechaHasta') ?? undefined,
            pagina: searchParams.get('pagina') ?? 1,
            porPagina: searchParams.get('porPagina') ?? 20,
        })

        const data = await buscarAdmisionesFacturacion(params)
        return apiOk(data)
    } catch (error) {
        return manejarErrorApi(error)
    }
}
