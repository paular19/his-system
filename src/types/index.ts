// ============================================
// TIPOS GLOBALES DEL SISTEMA HIS
// ============================================

export type { RolHIS, ModuloHIS, PermisoHIS } from '@/lib/auth/rbac'

// Estados comunes en el sistema legacy (Char(1))
export const ESTADOS = {
  ACTIVO: 'A',
  INACTIVO: 'I',
  PENDIENTE: 'P',
  ANULADO: 'X',
} as const

export type Estado = (typeof ESTADOS)[keyof typeof ESTADOS]

// Sexo biológico según estándar SISA
export const SEXO = {
  MASCULINO: 'M',
  FEMENINO: 'F',
  INDETERMINADO: 'I',
} as const

export type Sexo = (typeof SEXO)[keyof typeof SEXO]

// Estado civil
export const ESTADO_CIVIL = {
  SOLTERO: 'S',
  CASADO: 'C',
  DIVORCIADO: 'D',
  VIUDO: 'V',
  UNION_CONVIVENCIAL: 'U',
} as const

export type EstadoCivil = (typeof ESTADO_CIVIL)[keyof typeof ESTADO_CIVIL]

// Tipos de documento
export const TIPO_DOCUMENTO = {
  DNI: 'DNI',
  LC: 'LC ',
  LE: 'LE ',
  PAS: 'PAS',
  CUI: 'CUI',
} as const

export type TipoDocumento = (typeof TIPO_DOCUMENTO)[keyof typeof TIPO_DOCUMENTO]

// Sectores de camas
export const SECTOR_CAMA = {
  TERAPIA_INTENSIVA: 'TERAPIA_INTENSIVA',
  PISO_2: 'PISO_2',
  PISO_3: 'PISO_3',
} as const

export type SectorCama = (typeof SECTOR_CAMA)[keyof typeof SECTOR_CAMA]

// Estados de cama
export const ESTADO_CAMA = {
  DISPONIBLE: 'DISPONIBLE',
  OCUPADA: 'OCUPADA',
  RESERVADA: 'RESERVADA',
  MANTENIMIENTO: 'MANTENIMIENTO',
} as const

export type EstadoCama = (typeof ESTADO_CAMA)[keyof typeof ESTADO_CAMA]

// Tipos de movimiento de internación
export const TIPO_MOVIMIENTO_INTERNACION = {
  INGRESO: 'ING',
  TRASLADO: 'TRS',
  ALTA: 'ALT',
  FALLECIMIENTO: 'FAL',
} as const

// Tipos de comprobante de caja
export const TIPO_COMPROBANTE = {
  RECIBO_COMUN: 'RECIBO_COMUN',
  TICKET_CAJA: 'TICKET_CAJA',
  RECIBO_PROVISORIO: 'RECIBO_PROVISORIO',
} as const

export type TipoComprobante = (typeof TIPO_COMPROBANTE)[keyof typeof TIPO_COMPROBANTE]

// Formas de pago
export const FORMA_PAGO = {
  EFECTIVO: 'EFECTIVO',
  TARJETA_DEBITO: 'TARJETA_DEBITO',
  TARJETA_CREDITO: 'TARJETA_CREDITO',
  TRANSFERENCIA: 'TRANSFERENCIA',
  CHEQUE: 'CHEQUE',
} as const

export type FormaPago = (typeof FORMA_PAGO)[keyof typeof FORMA_PAGO]

// Categorías del nomenclador
export const CATEGORIA_PRESTACION = {
  HONORARIOS: 'HONORARIOS',
  QUIROFANO: 'QUIROFANO',
  ANESTESIA: 'ANESTESIA',
  MATERIAL_DESCARTABLE: 'MATERIAL_DESCARTABLE',
} as const

export type CategoriaPrestacion = (typeof CATEGORIA_PRESTACION)[keyof typeof CATEGORIA_PRESTACION]

// Tipo para paginación
export interface Paginacion {
  pagina: number
  porPagina: number
  total: number
  totalPaginas: number
}

export interface ResultadoPaginado<T> {
  items: T[]
  paginacion: Paginacion
}
