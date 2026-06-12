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

type SessionClaimsLike = {
  email?: unknown
  firstName?: unknown
  lastName?: unknown
  given_name?: unknown
  family_name?: unknown
  publicMetadata?: unknown
  metadata?: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function resolverMetadataDesdeClaims(claims: unknown): Record<string, unknown> {
  const safeClaims = asRecord(claims as SessionClaimsLike)
  const fromPublic = asRecord(safeClaims?.publicMetadata)
  if (fromPublic) return fromPublic

  const fromMetadata = asRecord(safeClaims?.metadata)
  if (fromMetadata) return fromMetadata

  return {}
}

function resolverRolDesdeClaims(claims: unknown): RolHIS {
  const metadata = resolverMetadataDesdeClaims(claims)
  const rolMetadata = asString(metadata.rol)
  const rolesValidos = Object.values(ROLES) as string[]

  if (rolMetadata && rolesValidos.includes(rolMetadata)) {
    return rolMetadata as RolHIS
  }

  return ROLES.ADMISION
}

function resolverCodigoUsuarioDesdeClaims(claims: unknown, userId: string): string {
  const metadata = resolverMetadataDesdeClaims(claims)
  const codigo = asString(metadata.codigoUsuario)
  return (codigo ?? userId).slice(0, 10)
}

function resolverEmailDesdeClaims(claims: unknown): string {
  const safeClaims = asRecord(claims as SessionClaimsLike)
  return asString(safeClaims?.email) ?? ''
}

function resolverNombreDesdeClaims(claims: unknown): string {
  const safeClaims = asRecord(claims as SessionClaimsLike)
  const firstName = asString(safeClaims?.firstName) ?? asString(safeClaims?.given_name) ?? ''
  const lastName = asString(safeClaims?.lastName) ?? asString(safeClaims?.family_name) ?? ''
  return `${firstName} ${lastName}`.trim()
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
 * Variante liviana para endpoints de lectura:
 * evita la llamada a currentUser() y usa claims del token de sesión.
 */
export async function getUsuarioSesionLectura(): Promise<UsuarioSesion> {
  const { userId, sessionClaims } = await auth()

  if (!userId) {
    throw new Error('No autenticado')
  }

  const codigoUsuario = resolverCodigoUsuarioDesdeClaims(sessionClaims, userId)
  const requestMetadata = await obtenerMetadataRequestAudit()
  setAuditContext({
    usuario: codigoUsuario,
    direccionIp: requestMetadata.direccionIp,
    userAgent: requestMetadata.userAgent,
  })

  return {
    clerkId: userId,
    email: resolverEmailDesdeClaims(sessionClaims),
    nombre: resolverNombreDesdeClaims(sessionClaims),
    rol: resolverRolDesdeClaims(sessionClaims),
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
