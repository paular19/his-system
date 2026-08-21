import { type RolHIS, ROLES } from './rbac'

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
  'marianacanaza24@gmail.com': ROLES.FACTURACION,
  'kmontano137@gmail.com': ROLES.FACTURACION,
  'serapiogabriela40@gmail.com': ROLES.FACTURACION,
  'ramospaula1996@gmail.com': ROLES.FACTURACION,
  'tarosaicha1812@gmail.com': ROLES.OPERADOR,
  'zeballosmonika@gmail.com': ROLES.OPERADOR,
}

function normalizarEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

export function resolverRolForzadoPorEmail(email: unknown): RolHIS | null {
  return ROLES_POR_EMAIL_FORZADOS[normalizarEmail(email)] ?? null
}

export function resolverRolRegistradoPorEmail(email: unknown): RolHIS | null {
  return ROLES_POR_EMAIL_REGISTRADOS[normalizarEmail(email)] ?? null
}