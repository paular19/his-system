export interface PracticaCirugiaInput {
    convenioId?: number | null
    codigo: string
    descripcion: string
    cantidad: number
    grupoOrden?: number | null
    importeTotal?: number | null
    matriculaEspecialista?: number | null
    matriculaAnestesista?: number | null
}

export interface CrearCirugiaProgramadaInput {
    pacienteId: number
    fechaCirugia: string
    horaCirugia?: string | null
    obraSocialId?: number | null
    planId?: number | null
    obraSocialCoseguroId?: number | null
    numeroAfiliado?: string | null
    diagnostico?: string | null
    observaciones?: string | null
    camaId?: number | null
    practicas: PracticaCirugiaInput[]
    medicaciones?: Array<{
        nombre: string
        dosis?: string | null
        viaAdministracion?: string | null
        frecuencia?: string | null
        observaciones?: string | null
    }>
    descartables?: Array<{
        nombre: string
        cantidad: number
        observaciones?: string | null
    }>
    diferenciales?: {
        esFeriado: boolean
        esNocturna: boolean
        mismaViaPatologia: boolean
        diferentesViasPatologia: boolean
        diferentesViasDiferentesPatologia: boolean
        dobleCirugia: boolean
    }
}

export interface CirugiaProgramadaListItem {
    id: number
    fechaCirugia: Date
    horaCirugia: string | null
    numeroAutorizacion: string | null
    internacionId: number | null
    internacionTipoIngresoCodigo: string | null
    internacionCamaId: number | null
    createdAt: Date
    paciente: {
        id: number
        nombreCompleto: string
        numeroDocumento: number | null
        historiaClinica: number | null
        obraSocial: string | null
        plan: string | null
    }
    practicasCantidad: number
    practicas: Array<{
        id: number
        codigo: string
        descripcion: string
        cantidad: number
        numeroAutorizacion: string | null
        ordenesAutorizacion?: Array<{
            puestoNumero: number
            ordenNumero: number
            item: number
            modulo: string | null
            numeroAutorizacion: string | null
        }>
    }>
}
