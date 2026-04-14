import type {
  Ingreso,
  Paciente,
  Profesional,
  TipoIngreso,
  IngresoPatologia,
  MovimientoIngreso,
  TipoMovimientoIngreso,
  Cama,
} from '@prisma/client'

export type IngresoConRelaciones = Ingreso & {
  paciente?: Paciente | null
  tipoIngreso?: TipoIngreso | null
  profesionalGuardia?: Profesional | null
  profesionalTratante?: Profesional | null
}

// Tipo completo para la ficha de ingreso
export type IngresoDetalle = IngresoConRelaciones & {
  cama?: (Pick<Cama, 'id' | 'identificador' | 'sector' | 'habitacion'>) | null
  ingresoPatologias: IngresoPatologia[]
  movimientosIngreso: (MovimientoIngreso & {
    tipoMovimiento: TipoMovimientoIngreso
  })[]
}

// DTO para listado de ingresos
export interface IngresoListItem {
  id: number
  tipoIngresoCodigo: string
  numeroIngreso: number
  nombre: string | null
  pacienteId: number | null
  fechaIngreso: Date | null
  estado: string | null
  obraSocialId: number | null
  tipoIngreso: { codigo: string; descripcion: string | null } | null
  paciente: { id: number; nombreCompleto: string; numeroDocumento: number | null } | null
}

// Resumen de paciente para formularios de admisión
export interface PacienteResumen {
  id: number
  historiaClinica: number | null
  nombreCompleto: string
  tipoDocumento: string | null
  numeroDocumento: number | null
  obraSocialId: number | null
  numeroAfiliado: string | null
}

// Tipos de admisión disponibles
export const TIPO_ADMISION = {
  GUARDIA: 'GUA',
  INTERNACION: 'INT',
  AMBULATORIO: 'AMB',
  CONSULTA_EXTERNA: 'CEX',
} as const

export type TipoAdmision = (typeof TIPO_ADMISION)[keyof typeof TIPO_ADMISION]

// Estado del ingreso
export const ESTADO_INGRESO = {
  ACTIVO: 'A',
  EGRESADO: 'E',
  PENDIENTE: 'P',
  ANULADO: 'X',
} as const

export type EstadoIngreso = (typeof ESTADO_INGRESO)[keyof typeof ESTADO_INGRESO]

export interface AdmisionGuardiaInput {
  pacienteId: number
  motivoConsulta: string
  prioridad: 'NORMAL' | 'URGENTE' | 'EMERGENCIA'
  profesionalGuardiaId?: number
  obraSocialId?: number
  planId?: number
  numeroAfiliado?: string
  observaciones?: string
}

export interface AdmisionInternacionInput {
  pacienteId: number
  diagnosticoIngreso: string
  profesionalTratanteId: number
  camaId?: number
  obraSocialId?: number
  planId?: number
  numeroAfiliado?: string
  fechaEgresoPrevista?: Date
  observaciones?: string
}
