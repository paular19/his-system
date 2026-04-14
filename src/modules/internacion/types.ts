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
