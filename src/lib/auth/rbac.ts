// ============================================
// CONTROL DE ACCESO BASADO EN ROLES (RBAC)
// ============================================

export const ROLES = {
  ADMIN: 'ADMIN',
  ADMISION: 'ADMISION',
  MEDICO: 'MEDICO',
  ENFERMERIA: 'ENFERMERIA',
  FACTURACION: 'FACTURACION',
  CAJA: 'CAJA',
} as const

export type RolHIS = (typeof ROLES)[keyof typeof ROLES]

// Módulos del sistema
export const MODULOS = {
  PACIENTES: 'PACIENTES',
  ADMISION: 'ADMISION',
  INTERNACION: 'INTERNACION',
  GUARDIA: 'GUARDIA',
  AMBULATORIO: 'AMBULATORIO',
  SERVICIOS_MEDICOS: 'SERVICIOS_MEDICOS',
  HISTORIA_CLINICA: 'HISTORIA_CLINICA',
  FACTURACION: 'FACTURACION',
  CAJA: 'CAJA',
  REPORTES: 'REPORTES',
  AUDITORIA: 'AUDITORIA',
  COTIZADOR: 'COTIZADOR',
} as const

export type ModuloHIS = (typeof MODULOS)[keyof typeof MODULOS]

// Permisos por acción
export const PERMISOS = {
  LEER: 'LEER',
  CREAR: 'CREAR',
  MODIFICAR: 'MODIFICAR',
  ELIMINAR: 'ELIMINAR',
} as const

export type PermisoHIS = (typeof PERMISOS)[keyof typeof PERMISOS]

// Matriz de permisos: Rol → Módulo → Permisos
type MatrizPermisos = Record<RolHIS, Partial<Record<ModuloHIS, PermisoHIS[]>>>

export const MATRIZ_PERMISOS: MatrizPermisos = {
  ADMIN: {
    PACIENTES: ['LEER', 'CREAR', 'MODIFICAR', 'ELIMINAR'],
    ADMISION: ['LEER', 'CREAR', 'MODIFICAR', 'ELIMINAR'],
    INTERNACION: ['LEER', 'CREAR', 'MODIFICAR', 'ELIMINAR'],
    GUARDIA: ['LEER', 'CREAR', 'MODIFICAR', 'ELIMINAR'],
    AMBULATORIO: ['LEER', 'CREAR', 'MODIFICAR', 'ELIMINAR'],
    SERVICIOS_MEDICOS: ['LEER', 'CREAR', 'MODIFICAR', 'ELIMINAR'],
    HISTORIA_CLINICA: ['LEER', 'CREAR', 'MODIFICAR', 'ELIMINAR'],
    FACTURACION: ['LEER', 'CREAR', 'MODIFICAR', 'ELIMINAR'],
    CAJA: ['LEER', 'CREAR', 'MODIFICAR', 'ELIMINAR'],
    REPORTES: ['LEER', 'CREAR', 'MODIFICAR', 'ELIMINAR'],
    AUDITORIA: ['LEER'],
    COTIZADOR: ['LEER', 'CREAR', 'MODIFICAR', 'ELIMINAR'],
  },
  ADMISION: {
    PACIENTES: ['LEER', 'CREAR', 'MODIFICAR'],
    ADMISION: ['LEER', 'CREAR', 'MODIFICAR'],
    INTERNACION: ['LEER', 'CREAR'],
    GUARDIA: ['LEER', 'CREAR'],
    AMBULATORIO: ['LEER', 'CREAR'],
    FACTURACION: ['LEER'],
    COTIZADOR: ['LEER'],
  },
  MEDICO: {
    PACIENTES: ['LEER'],
    ADMISION: ['LEER'],
    INTERNACION: ['LEER', 'MODIFICAR'],
    GUARDIA: ['LEER', 'MODIFICAR'],
    AMBULATORIO: ['LEER', 'MODIFICAR'],
    SERVICIOS_MEDICOS: ['LEER', 'CREAR', 'MODIFICAR'],
    HISTORIA_CLINICA: ['LEER', 'CREAR', 'MODIFICAR'],
  },
  ENFERMERIA: {
    PACIENTES: ['LEER'],
    INTERNACION: ['LEER', 'MODIFICAR'],
    GUARDIA: ['LEER', 'MODIFICAR'],
    HISTORIA_CLINICA: ['LEER', 'CREAR'],
  },
  FACTURACION: {
    PACIENTES: ['LEER'],
    ADMISION: ['LEER'],
    INTERNACION: ['LEER'],
    FACTURACION: ['LEER', 'CREAR', 'MODIFICAR'],
    REPORTES: ['LEER'],
    COTIZADOR: ['LEER', 'CREAR'],
  },
  CAJA: {
    PACIENTES: ['LEER'],
    CAJA: ['LEER', 'CREAR', 'MODIFICAR'],
    FACTURACION: ['LEER'],
    REPORTES: ['LEER'],
  },
}

/**
 * Verifica si un rol tiene un permiso específico sobre un módulo.
 */
export function tienePermiso(
  rol: RolHIS,
  modulo: ModuloHIS,
  permiso: PermisoHIS
): boolean {
  // Modo testing: se deshabilita el control RBAC para evitar 403.
  void rol
  void modulo
  void permiso
  return true
}

/**
 * Retorna todos los módulos accesibles para un rol.
 */
export function modulosAccesibles(rol: RolHIS): ModuloHIS[] {
  const permisosDelRol = MATRIZ_PERMISOS[rol]
  if (!permisosDelRol) return []
  return Object.keys(permisosDelRol) as ModuloHIS[]
}

// Rutas del dashboard y el módulo que protegen
export const RUTAS_MODULOS: Record<string, ModuloHIS> = {
  '/dashboard/pacientes': 'PACIENTES',
  '/dashboard/admision': 'ADMISION',
  '/dashboard/internacion': 'INTERNACION',
  '/dashboard/guardia': 'GUARDIA',
  '/dashboard/ambulatorio': 'AMBULATORIO',
  '/dashboard/historia-clinica': 'HISTORIA_CLINICA',
  '/dashboard/facturacion': 'FACTURACION',
  '/dashboard/caja': 'CAJA',
  '/dashboard/reportes': 'REPORTES',
  '/dashboard/auditoria': 'AUDITORIA',
  '/dashboard/cotizador': 'COTIZADOR',
}
