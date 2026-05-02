import type { Cama } from '@prisma/client'

export type { Cama }

// ============================================
// SECTORES Y ESTADOS
// ============================================

export const SECTOR_CAMA = {
  TERAPIA_INTENSIVA: 'TERAPIA_INTENSIVA',
  PISO_2: 'PISO_2',
  PISO_3: 'PISO_3',
} as const

export const SECTOR_LABEL: Record<string, string> = {
  TERAPIA_INTENSIVA: 'UTI — Terapia Intensiva',
  PISO_2: 'Internación Piso 2',
  PISO_3: 'Internación Piso 3',
}

export const ESTADO_CAMA = {
  DISPONIBLE: 'DISPONIBLE',
  OCUPADA: 'OCUPADA',
  RESERVADA: 'RESERVADA',
  MANTENIMIENTO: 'MANTENIMIENTO',
} as const

export const ESTADO_CAMA_LABEL: Record<string, string> = {
  DISPONIBLE: 'Disponible',
  OCUPADA: 'Ocupada',
  RESERVADA: 'Reservada',
  MANTENIMIENTO: 'Mantenimiento',
}

export type SectorCama = (typeof SECTOR_CAMA)[keyof typeof SECTOR_CAMA]
export type EstadoCama = (typeof ESTADO_CAMA)[keyof typeof ESTADO_CAMA]

// ============================================
// TIPOS DE DATOS
// ============================================

export interface OcupanteCama {
  ingresoId: number
  numeroIngreso: number
  nombre: string
  fechaIngreso: Date | null
}

export interface CamaConOcupante extends Cama {
  ocupante: OcupanteCama | null
}

export interface DisponibilidadSector {
  sector: string
  label: string
  total: number
  disponibles: number
  ocupadas: number
  reservadas: number
  mantenimiento: number
  camas: CamaConOcupante[]
}

export interface MapaCamas {
  sectores: DisponibilidadSector[]
  totales: {
    total: number
    disponibles: number
    ocupadas: number
    reservadas: number
    mantenimiento: number
  }
}

export interface InternacionListItem {
  id: number
  numeroIngreso: number
  nombre: string | null
  fechaIngreso: Date | null
  fechaEgresoPrevista: Date | null
  estado: string | null
  cama: {
    id: number
    identificador: string
    sector: string
    habitacion: string | null
  } | null
  paciente: {
    id: number
    nombreCompleto: string
    numeroDocumento: number | null
  } | null
  profesionalTratante: {
    id: number
    nombre: string
  } | null
}

export interface ActualizarCamaInput {
  estado: EstadoCama
  observaciones?: string | null
}

// ============================================
// DETALLE DE INTERNACIÓN
// ============================================

export interface InternacionDetalle {
  id: number
  numeroIngreso: number
  tipoIngresoCodigo: string
  nombre: string | null
  fechaIngreso: Date | null
  fechaEgresoPrevista: Date | null
  fechaEgreso: Date | null
  estado: string | null
  descripcionPatologia: string | null

  paciente: {
    id: number
    nombreCompleto: string
    numeroDocumento: number | null
    tipoDocumento: string | null
    fechaNacimiento: Date | null
    celular1: string | null
    obraSocialId: number | null
  } | null

  cama: {
    id: number
    identificador: string
    sector: string
    habitacion: string | null
  } | null

  profesionalGuardia: { id: number; nombre: string } | null
  profesionalTratante: { id: number; nombre: string } | null
  obraSocial: { id: number; nombre: string } | null
  plan: { id: number; descripcion: string } | null
  numeroAfiliado: string | null

  ingresoPatologias: Array<{
    id: number
    patologiaId: number | null
    descripcion: string | null
    estado: string
    fecha: Date
  }>

  evoluciones: EvolucionItem[]
  medicaciones: MedicacionItem[]
  transferencias: TransferenciaItem[]
  practicas: PracticaItem[]
  ordenes: Array<{
    puestoNumero: number
    numero: number
    fechaEmision: Date
    estado: string
    items: Array<{ item: number; codigoPractica: string; cantidad: number; numeroAutorizacion: string | null }>
  }>
}

// ============================================
// PRÁCTICAS
// ============================================

export interface PracticaItem {
  id: number
  ingresoId: number
  convenioId: number
  codigoPractica: string
  descripcionPractica: string | null
  fecha: Date
  cantidad: number
  numeroAutorizacion: string | null
  facturable: boolean
  estado: string | null
  usuario: string
}

// ============================================
// EVOLUCIÓN CLÍNICA
// ============================================

export const TIPO_EVOLUCION = {
  MEDICA: 'MEDICA',
  ENFERMERIA: 'ENFERMERIA',
  KINESIO: 'KINESIO',
  NUTRICION: 'NUTRICION',
  SERVICIO_SOCIAL: 'SERVICIO_SOCIAL',
  PSICOLOGIA: 'PSICOLOGIA',
  OTRO: 'OTRO',
} as const

export const TIPO_EVOLUCION_LABEL: Record<string, string> = {
  MEDICA: 'Evolución Médica',
  ENFERMERIA: 'Enfermería',
  KINESIO: 'Kinesiología',
  NUTRICION: 'Nutrición',
  SERVICIO_SOCIAL: 'Servicio Social',
  PSICOLOGIA: 'Psicología',
  OTRO: 'Otro',
}

export type TipoEvolucion = (typeof TIPO_EVOLUCION)[keyof typeof TIPO_EVOLUCION]

export interface EvolucionItem {
  id: number
  ingresoId: number
  fecha: Date
  tipo: string
  descripcion: string
  tensionArterial: string | null
  frecuenciaCardiaca: number | null
  frecuenciaRespiratoria: number | null
  temperatura: number | null
  saturacionO2: number | null
  profesional: { id: number; nombre: string } | null
  usuario: string
}

// ============================================
// MEDICACIÓN
// ============================================

export const ESTADO_MEDICACION = {
  ACTIVO: 'A',
  SUSPENDIDO: 'S',
  FINALIZADO: 'F',
} as const

export const ESTADO_MEDICACION_LABEL: Record<string, string> = {
  A: 'Activa',
  S: 'Suspendida',
  F: 'Finalizada',
}

export interface MedicacionItem {
  id: number
  ingresoId: number
  nombre: string
  dosis: string | null
  viaAdministracion: string | null
  frecuencia: string | null
  fechaInicio: Date
  fechaFin: Date | null
  observaciones: string | null
  estado: string
  profesional: { id: number; nombre: string } | null
  usuario: string
}

// ============================================
// TRANSFERENCIA DE CAMA
// ============================================

export interface TransferenciaItem {
  id: number
  ingresoId: number
  fecha: Date
  motivo: string | null
  camaOrigen: { id: number; identificador: string; sector: string } | null
  camaDestino: { id: number; identificador: string; sector: string }
  profesional: { id: number; nombre: string } | null
  usuario: string
}
