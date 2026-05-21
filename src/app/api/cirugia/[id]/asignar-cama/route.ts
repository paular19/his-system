import { type NextRequest } from 'next/server'
import { ActualizarIngresoSchema } from '@/modules/admision/schemas'
import { TransferirCamaSchema } from '@/modules/internacion/schemas'
import * as admisionService from '@/modules/admision/service'
import * as internacionService from '@/modules/internacion/service'
import { extraerIP } from '@/lib/security/audit'
import { apiNotFound, apiOk, manejarErrorApi } from '@/lib/utils/response'

interface RouteParams {
    params: Promise<{ id: string }>
}

const USUARIO_SISTEMA = 'CIRUGIA_PROGRAMADA'

export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params
        const ingresoId = parseInt(id, 10)
        if (Number.isNaN(ingresoId) || ingresoId <= 0) {
            return apiNotFound('Ingreso')
        }

        const body: Record<string, unknown> = await request.json()

        const dataIngreso = ActualizarIngresoSchema.parse({
            fechaIngreso: body.fechaIngreso,
            fechaEgresoPrevista: body.fechaEgresoPrevista,
        })

        const transferenciaInput = TransferirCamaSchema.parse({
            ingresoId,
            camaDestinoId: body.camaDestinoId,
            motivo: body.motivo,
            profesionalId: body.profesionalId,
        })

        const ip = extraerIP(request)

        await admisionService.actualizarIngreso(ingresoId, dataIngreso, USUARIO_SISTEMA, ip)
        const transferencia = await internacionService.transferirCama(
            transferenciaInput,
            USUARIO_SISTEMA,
            ip
        )

        return apiOk({ transferencia }, 201)
    } catch (error) {
        return manejarErrorApi(error)
    }
}
