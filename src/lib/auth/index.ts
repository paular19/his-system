import { auth, currentUser } from '@clerk/nextjs/server'
import { type RolHIS, ROLES } from './rbac'

export interface UsuarioSesion {
  clerkId: string
  email: string
  nombre: string
  rol: RolHIS
  codigoUsuario: string
}

function resolverRolDesdeMetadata(user: Awaited<ReturnType<typeof currentUser>>): RolHIS {
  const rolMetadata = user?.publicMetadata?.rol as string | undefined
  const rolesValidos = Object.values(ROLES) as string[]
  if (rolMetadata && rolesValidos.includes(rolMetadata)) {
    return rolMetadata as RolHIS
  }
  // Fallback por defecto
  return ROLES.ADMISION
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

  // Rol fijo temporal hasta completar configuración RBAC en Clerk.
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
