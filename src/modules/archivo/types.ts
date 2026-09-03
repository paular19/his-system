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
  obraSocialIdViejo: number | null
  numeroAfiliado: string | null
  observaciones: string | null
  fechaAlta: Date | null
}

/**
 * Un ingreso del sistema anterior. El sistema viejo mezclaba ambulatorios e
 * internaciones en la misma tabla; `esInternacion` es el corte (TigCodig = 'I').
 */
export interface ArchivoIngresoResumen {
  ingresoIdViejo: number
  numeroIngreso: number | null
  esInternacion: boolean
  tipoIngresoDescripcion: string | null
  fechaIngreso: Date | null
  fechaEgreso: Date | null
  tipoInternacionDescripcion: string | null
  motivoEgresoCodigo: string | null
  motivoEgresoDescripcion: string | null
  obraSocialNombre: string | null
  planDescripcion: string | null
  descripcionPatologia: string | null
  profesionalTratanteNombre: string | null
}

/**
 * Paciente del archivo con lo que se le pudo colgar del sistema viejo: el nombre
 * de la obra social (la tabla solo guarda el id) y sus ingresos.
 *
 * Ojo con la expectativa: solo 3.606 de los 54.154 pacientes del archivo tienen
 * algun ingreso cargado, porque el sistema anterior recien se uso en serio desde
 * fines de 2024. Que la lista venga vacia es lo normal, no un error de carga.
 */
export interface ArchivoPacienteConHistoria extends ArchivoPacienteBusqueda {
  obraSocialNombre: string | null
  ingresos: ArchivoIngresoResumen[]
  totalInternaciones: number
  totalAmbulatorios: number
}

export interface BusquedaArchivoInput {
  q?: string
  soloConHistoriaClinica?: boolean
  pagina?: number
  porPagina?: number
}

export interface Paginacion {
  total: number
  pagina: number
  porPagina: number
  totalPaginas: number
}

/** Lo que devuelve el repositorio: las filas de ArchivoPaciente, sin enriquecer. */
export interface ResultadoBusquedaArchivoCrudo {
  items: ArchivoPacienteBusqueda[]
  paginacion: Paginacion
}

export interface ResultadoBusquedaArchivo {
  items: ArchivoPacienteConHistoria[]
  paginacion: Paginacion
}

export interface ResumenArchivo {
  total: number
  conHistoriaClinica: number
  conIngresos: number
  totalInternaciones: number
}
