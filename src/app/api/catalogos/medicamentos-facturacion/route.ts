import { type NextRequest } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiCreado, apiForbidden, apiOk, manejarErrorApi } from '@/lib/utils/response'
import { CrearMedicamentoCatalogoSchema } from '@/modules/facturacion/schemas'
import {
    crearMedicamentoCatalogo,
    listarMedicamentosCatalogo,
} from '@/modules/facturacion/service'

// GET /api/catalogos/medicamentos-facturacion
// Lista corta y cerrada (7 a 15 renglones), sin paginar ni cachear: se pide
// entera al abrir el panel para llenar el combo de medicacion.
export async function GET() {
    try {
        const usuario = await getUsuarioSesion()
        if (!tienePermiso(usuario.rol, 'FACTURACION', 'LEER')) return apiForbidden()

        return apiOk(await listarMedicamentosCatalogo())
    } catch (error) {
        return manejarErrorApi(error)
    }
}

// POST /api/catalogos/medicamentos-facturacion
export async function POST(request: NextRequest) {
    try {
        const usuario = await getUsuarioSesion()
        const puede =
            tienePermiso(usuario.rol, 'FACTURACION', 'CREAR') ||
            tienePermiso(usuario.rol, 'FACTURACION', 'MODIFICAR')
        if (!puede) return apiForbidden()

        const body = await request.json()
        const data = CrearMedicamentoCatalogoSchema.parse(body)

        const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? undefined
        const creado = await crearMedicamentoCatalogo(data, usuario.codigoUsuario, ip ?? undefined)
        return apiCreado(creado)
    } catch (error) {
        return manejarErrorApi(error)
    }
}
