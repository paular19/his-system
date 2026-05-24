import { auth, currentUser } from '@clerk/nextjs/server'
import { headers } from 'next/headers'
import { type RolHIS, ROLES } from './rbac'
import { setAuditContext } from '@/lib/security/audit-context'

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

function normalizarIpDesdeHeader(raw: string | null): string | undefined {
  if (!raw) return undefined
  const first = raw.split(',')[0]?.trim()
  return first || undefined
}

async function obtenerMetadataRequestAudit(): Promise<{
  direccionIp?: string
  userAgent?: string
}> {
  try {
    const h = await headers()
    return {
      direccionIp:
        normalizarIpDesdeHeader(h.get('x-forwarded-for')) ??
        h.get('x-real-ip') ??
        undefined,
      userAgent: h.get('user-agent') ?? undefined,
    }
  } catch {
    // Puede no existir contexto request (scripts/seed/tests).
    return {}
  }
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

  const requestMetadata = await obtenerMetadataRequestAudit()
  setAuditContext({
    usuario: codigoUsuario,
    direccionIp: requestMetadata.direccionIp,
    userAgent: requestMetadata.userAgent,
  })

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
