// ============================================
// ARCHIVO HISTORICO - SISTEMA ANTERIOR
// Modulo de solo lectura. No comparte tipos ni relaciones con Pacientes.
// ============================================

export interface ArchivoPacienteBusqueda {
  pacienteIdViejo: number
  historiaClinicaVieja: number | null
  apellido: string
  nombre: string
  nombreCompleto: string
  tipoDocumento: string | null
  numeroDocumento: string | null
  fechaNacimiento: Date | null
  sexo: string | null
  domicilio: string | null
  telefonoFijo: string | null
  celular1: string | null
  celular2: string | null
  email: string | null
  numeroAfiliado: string | null
  observaciones: string | null
  fechaAlta: Date | null
}

export interface BusquedaArchivoInput {
  q?: string
  soloConHistoriaClinica?: boolean
  pagina?: number
  porPagina?: number
}

export interface ResultadoBusquedaArchivo {
  items: ArchivoPacienteBusqueda[]
  paginacion: {
    total: number
    pagina: number
    porPagina: number
    totalPaginas: number
  }
}

export interface ResumenArchivo {
  total: number
  conHistoriaClinica: number
}
