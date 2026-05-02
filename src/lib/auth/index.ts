import { auth, currentUser } from '@clerk/nextjs/server'
import { type RolHIS, ROLES } from './rbac'

export interface UsuarioSesion {
  clerkId: string
  email: string
  nombre: string
  rol: RolHIS
  codigoUsuario: string
}

function normalizarRol(valor: unknown): RolHIS {
  if (typeof valor !== 'string') return ROLES.ADMISION

  const normalizado = valor
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (normalizado in ROLES) {
    return ROLES[normalizado as keyof typeof ROLES]
  }

  return ROLES.ADMISION
}

function resolverRolDesdeMetadata(user: Awaited<ReturnType<typeof currentUser>>): RolHIS {
  const publico = (user?.publicMetadata ?? {}) as Record<string, unknown>
  const inseguro = ((user as unknown as { unsafeMetadata?: Record<string, unknown> })?.unsafeMetadata ?? {})

  const candidato =
    publico.rol ??
    publico.role ??
    inseguro.rol ??
    inseguro.role

  const rol = normalizarRol(candidato)

  if (rol === ROLES.ADMISION && typeof candidato !== 'string') {
    console.warn('[auth] Rol no encontrado en metadata, usando ADMISION por defecto')
  }

  return rol
}

/**
 * Obtiene el usuario actual de la sesión con su rol HIS.
 * Lanza un error si no hay sesión activa.
 */
export async function getUsuarioSesion(): Promise<UsuarioSesion> {
  const { userId } = await auth()

  if (!userId) {
    throw new Error('No autenticado')
  }

  const user = await currentUser()
  if (!user) {
    throw new Error('Usuario no encontrado')
  }

  // Acepta variantes de metadata para evitar rechazos por formato
  const rol = resolverRolDesdeMetadata(user)
  const codigoUsuario =
    (user.publicMetadata?.codigoUsuario as string) ?? userId.slice(0, 10)

  return {
    clerkId: userId,
    email: user.emailAddresses[0]?.emailAddress ?? '',
    nombre: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
    rol,
    codigoUsuario,
  }
}

/**
 * Versión que no lanza error, retorna null si no hay sesión.
 */
export async function getUsuarioSesionOpcional(): Promise<UsuarioSesion | null> {
  try {
    return await getUsuarioSesion()
  } catch {
    return null
  }
}
