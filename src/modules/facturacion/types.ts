export type TipoPrestacionFacturable =
    | 'ORDEN_ITEM'
    | 'PRACTICA'
    | 'MEDICACION'
    | 'DIA_INTERNACION'

export interface AdmisionFacturacionListItem {
    id: number
    tipoIngresoCodigo: string
    numeroIngreso: number
    estado: string | null
    fechaIngreso: Date | null
    fechaEgreso: Date | null
    paciente: {
        id: number
        nombreCompleto: string
        numeroDocumento: number | null
    } | null
    obraSocial: { id: number; nombre: string } | null
    plan: { id: number; descripcion: string } | null
}

export interface PrestacionFacturableItem {
    uid: string
    tipo: TipoPrestacionFacturable
    referencia: string
    fecha: Date
    descripcion: string
    cantidad: number
    precioUnitario: number | null
    importeTotal: number | null
    facturada: boolean
    matriculaProfesional: number | null
    ordenPuestoNumero: number | null
    ordenNumero: number | null
    convenioId: number | null
    codigoPractica: string | null
    numeroAutorizacion: string | null
    origen: {
        ingresoId: number
        practicaId?: number
        ordenPuestoNumero?: number
        ordenNumero?: number
        ordenItem?: number
        medicacionId?: number
    }
}

export interface FacturacionContexto {
    ingreso: {
        id: number
        tipoIngresoCodigo: string
        numeroIngreso: number
        estado: string | null
        fechaIngreso: Date | null
        fechaEgreso: Date | null
        nombre: string | null
        descripcionPatologia: string | null
        numeroAfiliado: string | null
        observaciones: string | null
        obraSocialId: number | null
        planId: number | null
        obraSocialCoseguroId: number | null
    }
    paciente: {
        id: number
        apellido: string
        nombre: string
        nombreCompleto: string
        numeroDocumento: number | null
        celular1: string | null
        email: string | null
        domicilio: string | null
    } | null
    obraSocial: { id: number; nombre: string } | null
    obraSocialCoseguro: { id: number; nombre: string } | null
    plan: { id: number; descripcion: string } | null
    reglaFacturacion: {
        codigo: string
        descripcion: string
        porcentajeFacturacion: number
        porcentajeCargoPaciente: number
    }
    prestaciones: PrestacionFacturableItem[]
}

export interface OrdenFacturacionResultado {
    modo: 'MASIVA' | 'INDIVIDUAL'
    ordenes: Array<{ puestoNumero: number; numero: number }>
}

// ============================================
// LOTES DE FACTURACIÓN
// ============================================

export type TipoLote = 'PRACTICAS' | 'MEDICAMENTOS'
export type EstadoLote = 'PEN' | 'CON' | 'ANU'

export interface LoteFacturacionListItem {
    id: number
    numero: number
    fecha: Date
    periodo: string
    tipo: TipoLote
    estado: EstadoLote
    obraSocial: { id: number; nombre: string } | null
    plan: { id: number; descripcion: string } | null
    sedeId: number | null
    descripcion: string | null
    concepto: string | null
    importeTotal: number
    tipoIngresoCodigo: string | null
    rangoDesde: number | null
    rangoHasta: number | null
}

export interface LoteFacturacionDetalle extends LoteFacturacionListItem {
    items: LoteFacturacionItemDetalle[]
}

export interface LoteFacturacionItemDetalle {
    id: number
    loteId: number
    ingresoId: number
    incluido: boolean
    importeTotal: number
    ingreso: {
        id: number
        tipoIngresoCodigo: string
        numeroIngreso: number
        estado: string | null
        fechaIngreso: Date | null
        fechaEgreso: Date | null
        nombre: string | null
        numeroAfiliado: string | null
        descripcionPatologia: string | null
    }
    paciente: {
        id: number
        nombreCompleto: string
        numeroDocumento: number | null
    } | null
}

export interface OrdenAutorizadaLote {
    puestoNumero: number
    numero: number
    fechaEmision: Date
    descripcion: string | null
    numeroAutorizacion: string | null
    importeTotal: number
    items: Array<{
        item: number
        codigoPractica: string
        descripcion: string | null
        cantidad: number
        numeroAutorizacion: string | null
        importeTotal: number
    }>
}
