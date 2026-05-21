import type { Paciente, Profesion, Pais, Provincia, Localidad, ObraSocial } from '@prisma/client'

// Tipo completo con relaciones para listados y ficha
export type PacienteConRelaciones = Paciente & {
  profesion?: Profesion | null
  pais?: Pais | null
  provincia?: Provincia | null
  localidad?: Localidad | null
  obraSocial?: ObraSocial | null
}

// DTO para listado (campos mínimos necesarios en tablas)
export interface PacienteListItem {
  id: number
  historiaClinica: number | null
  apellido: string
  nombre: string
  nombreCompleto: string
  tipoDocumento: string | null
  numeroDocumento: number | null
  sexo: string | null
  fechaNacimiento: Date | null
  celular1: string | null
  obraSocialId: number | null
  estado: 'activo' // derivado del sistema
}

// DTO para búsqueda rápida (admisión)
export interface PacienteBusqueda {
  id: number
  historiaClinica: number | null
  apellido: string | null
  nombre: string | null
  nombreCompleto: string
  domicilio: string | null
  tipoDocumento: string | null
  numeroDocumento: number | null
  fechaNacimiento: Date | null
  sexo: string | null
  telefonoFijo: string | null
  celular1: string | null
  email: string | null
  obraSocialId: number | null
  planId: number | null
  obraSocialCoseguroId: number | null
  obraSocialNombre: string | null
  planDescripcion: string | null
  numeroAfiliado: string | null
  fechaAlta: Date
}

// Parámetros de búsqueda
export interface BusquedaPacienteParams {
  q?: string              // búsqueda general (nombre, apellido, DNI, HC)
  numeroDocumento?: number
  apellido?: string
  nombre?: string
  historiaClinica?: number
  pagina?: number
  porPagina?: number
}
