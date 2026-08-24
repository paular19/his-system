import { type ModuloHIS, type PermisoHIS, type RolHIS, ROLES, tienePermiso } from './rbac'

const ROLES_POR_EMAIL_FORZADOS: Record<string, RolHIS> = {
  'cirugiaclinicasr@gmail.com': ROLES.INTERNACION,
  'ivictoria123@hotmail.com': ROLES.ADMISION,
}

const ROLES_POR_EMAIL_REGISTRADOS: Record<string, RolHIS> = {
  'cirugiaclinicasr@gmail.com': ROLES.INTERNACION,
  'natividaddelvallelopez@gmail.com': ROLES.ORDENES,
  'ivictoria123@hotmail.com': ROLES.ADMISION,
  'sorianokaren223@gmail.com': ROLES.ORDENES,
  'lautarouti@gmail.com': ROLES.ORDENES,
  'internacionsanar@gmail.com': ROLES.ORDENES,
  'altamirano97.leandro@gmail.com': ROLES.ORDENES,
  'ficacode@gmail.com': ROLES.ADMISION,
  'barrionuevodamarisbelen@gmail.com': ROLES.ADMISION,
  'eduardogutierrez0770@gmail.com': ROLES.ADMISION,
  'enahirtni@gmail.com': ROLES.ADMISION,
  'lucianolozanoj2@gmail.com': ROLES.ADMISION,
  'ivanagtarcaya78@gmail.com': ROLES.ADMISION,
  'emilio_xeneize_22@hotmail.com.ar': ROLES.ADMISION,
  'marcelalejandra2015@gmail.com': ROLES.ADMIN,
  'alejandro.toromejia@gmail.com': ROLES.ADMIN,
  'marianacanaza24@gmail.com': ROLES.FACTURACION,
  'kmontano137@gmail.com': ROLES.FACTURACION,
  'serapiogabriela40@gmail.com': ROLES.FACTURACION,
  'ramospaula1996@gmail.com': ROLES.FACTURACION,
  'tarosaicha1812@gmail.com': ROLES.OPERADOR,
  'zeballosmonika@gmail.com': ROLES.OPERADOR,
  'sanarproveedores@gmail.com': ROLES.FACTURACION_PROFESIONALES,
  'admsanar@gmail.com': ROLES.FACTURACION_PROFESIONALES,
}

/**
 * Acceso extra a un modulo, sin cambiarle el rol al usuario.
 *
 * Sirve para el caso de "que ademas pueda ver X": cambiarle el rol le sacaria lo que
 * ya hace, y sumar el modulo al rol se lo daria a todos los que comparten ese rol.
 * Solo agrega permisos, nunca los quita.
 */
const MODULOS_EXTRA_POR_EMAIL: Record<string, Partial<Record<ModuloHIS, PermisoHIS[]>>> = {
  // Sigue siendo ADMISION; se le suma la liquidacion para poder chequearla.
  'ficacode@gmail.com': { LIQUIDACION_PROFESIONALES: ['LEER'] },
}

function normalizarEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

/**
 * Permiso efectivo de un usuario: lo que le da su rol mas lo que le sume
 * MODULOS_EXTRA_POR_EMAIL. Usar esta en lugar de `tienePermiso` cuando se tiene el
 * usuario de sesion entero y no solo el rol.
 */
export function tienePermisoUsuario(
  usuario: { rol: RolHIS; email: string },
  modulo: ModuloHIS,
  permiso: PermisoHIS
): boolean {
  if (tienePermiso(usuario.rol, modulo, permiso)) return true
  const extra = MODULOS_EXTRA_POR_EMAIL[normalizarEmail(usuario.email)]?.[modulo]
  return extra?.includes(permiso) ?? false
}

export function resolverRolForzadoPorEmail(email: unknown): RolHIS | null {
  return ROLES_POR_EMAIL_FORZADOS[normalizarEmail(email)] ?? null
}

export function resolverRolRegistradoPorEmail(email: unknown): RolHIS | null {
  return ROLES_POR_EMAIL_REGISTRADOS[normalizarEmail(email)] ?? null
}