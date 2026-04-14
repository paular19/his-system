// Módulo Ambulatorio - Tipos base
// Implementación completa en etapas posteriores

export const ESTADO_ATENCION_AMBULATORIA = {
  PENDIENTE: 'P',
  EN_ATENCION: 'A',
  FINALIZADO: 'F',
  AUSENTE: 'X',
} as const

export type EstadoAtencionAmbulatoria =
  (typeof ESTADO_ATENCION_AMBULATORIA)[keyof typeof ESTADO_ATENCION_AMBULATORIA]

export interface AtencionAmbulatoria {
  ingresoId: number
  pacienteId: number
  profesionalId: number
  fechaAtencion: Date
  diagnostico?: string
  observaciones?: string
  estado: EstadoAtencionAmbulatoria
}
