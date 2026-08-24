import type { CategoriaPractica } from '@/modules/facturacion/categorias-practica'
import type { SubitemLiquidacion } from './subitem'

// Subitems que se le liquidan al profesional efector. HA (anestesista) y HP
// (patologo) quedan afuera a proposito: se liquidan por otro circuito.
export const SUBITEMS_LIQUIDABLES = ['HE', 'A1', 'A2', 'A3', 'GA'] as const
export type SubitemLiquidable = (typeof SUBITEMS_LIQUIDABLES)[number]

export function esSubitemLiquidable(subitem: SubitemLiquidacion): subitem is SubitemLiquidable {
    return (SUBITEMS_LIQUIDABLES as readonly string[]).includes(subitem)
}

export type EstadoLoteLiquidacion = 'PEN' | 'CON'

/** Una linea del resumen: equivale a una fila de OrdenPractica ya atribuida a un efector. */
export interface LiquidacionLinea {
    ingresoId: number
    tipoIngresoCodigo: string | null
    numeroIngreso: number
    paciente: string
    numeroAfiliado: string | null
    numeroAutorizacion: string | null
    fecha: Date
    codigoPractica: string
    descripcionPractica: string | null
    categoria: CategoriaPractica | null
    subitem: SubitemLiquidable
    cantidad: number
    // El importe de la fila va entero a honorarios o entero a gastos segun el
    // subitem: en esta base cada componente de la practica es una fila propia.
    importeHonorarios: number
    importeGastos: number
    importeTotal: number
    // Trazabilidad: de que orden y de que lote salio la linea.
    ordenPuestoNumero: number
    ordenNumero: number
    ordenItem: number
    loteId: number
    loteNumero: number
    loteEstado: EstadoLoteLiquidacion
    lotePeriodo: string
}

/** Bloque PRESTADOR del resumen. */
export interface LiquidacionProfesional {
    matricula: number
    nombre: string
    profesionalId: number | null
    lineas: LiquidacionLinea[]
    totalHonorarios: number
    totalGastos: number
    total: number
}

/**
 * Lo que se dejo afuera. Se reporta explicitamente para que un total bajo se pueda
 * explicar sin abrir la base: las lineas descartadas no desaparecen en silencio.
 */
export interface LiquidacionDescartes {
    gastosDeLaClinica: { lineas: number; importe: number }
    sinEfector: { lineas: number; importe: number }
    anestesia: { lineas: number; importe: number }
    patologia: { lineas: number; importe: number }
    fueraDeCategoria: { lineas: number; importe: number }
}

export interface LiquidacionResumen {
    profesionales: LiquidacionProfesional[]
    totalHonorarios: number
    totalGastos: number
    total: number
    cantidadPracticas: number
    /**
     * Hay practicas que salen de lotes todavia en estado PEN. El lote se puede editar
     * o anular antes de confirmarse, asi que los importes no son definitivos y el
     * resumen tiene que salir marcado como provisorio (tambien impreso y en PDF).
     */
    esProvisorio: boolean
    /** Cuanto del total viene de lotes pendientes. */
    totalPendiente: number
    practicasPendientes: number
    descartes: LiquidacionDescartes
    // Conteo por categoria antes del filtro, para pintar los chips con numeros reales.
    conteoCategorias: Partial<Record<CategoriaPractica, number>>
    filtros: {
        desde: string
        hasta: string
        obraSocial: { id: number; nombre: string } | null
        categorias: CategoriaPractica[]
        matricula: number | null
        estadosLote: EstadoLoteLiquidacion[]
    }
    lotesConsiderados: Array<{
        id: number
        numero: number
        estado: EstadoLoteLiquidacion
        periodo: string
    }>
}

export interface ProfesionalEfectorItem {
    matricula: number
    nombre: string
}
