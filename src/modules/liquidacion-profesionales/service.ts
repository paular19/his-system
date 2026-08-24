import { registrarAudit } from '@/lib/security/audit'
import {
    listarObrasSocialesConLotes,
    listarProfesionalesEfectores,
    obtenerLiquidacionProfesionales,
} from './repository'
import type { BusquedaLiquidacionInput } from './schemas'
import type { LiquidacionResumen, ProfesionalEfectorItem } from './types'

export async function consultarLiquidacionProfesionales(
    params: BusquedaLiquidacionInput,
    usuario: string
): Promise<LiquidacionResumen> {
    const resumen = await obtenerLiquidacionProfesionales(params)

    // Es un reporte con datos de pacientes y honorarios: se audita la consulta.
    await registrarAudit({
        usuario,
        accion: 'CONSULTAR',
        entidad: 'LiquidacionProfesionales',
        registroId: `${params.desde}_${params.hasta}`,
        detalle: JSON.stringify({
            obraSocialId: params.obraSocialId ?? null,
            matricula: params.matricula ?? null,
            categorias: params.categorias ?? [],
            estadosLote: params.estadosLote,
            tipoIngreso: params.tipoIngreso ?? null,
            profesionales: resumen.profesionales.length,
            practicas: resumen.cantidadPracticas,
        }),
    })

    return resumen
}

export function consultarProfesionalesEfectores(): Promise<ProfesionalEfectorItem[]> {
    return listarProfesionalesEfectores()
}

export function consultarObrasSocialesLiquidacion(): Promise<Array<{ id: number; nombre: string }>> {
    return listarObrasSocialesConLotes()
}
