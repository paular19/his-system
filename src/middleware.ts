import { clerkClient, clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { esRolHIS } from '@/lib/auth/rbac'
import {
  resolverRolForzadoPorEmail,
  resolverRolRegistradoPorEmail,
} from '@/lib/auth/role-registry'

const isAuthRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
])
const isAccessDeniedRoute = createRouteMatcher(['/acceso-denegado'])

// Rutas de API: requieren autenticación pero el control de acceso
// detallado (RBAC) se maneja dentro de cada route handler.
const isApiRoute = createRouteMatcher(['/api(.*)'])
const isApiRouteConAuthEnHandler = createRouteMatcher(['/api/admision(.*)'])

function aplicarHeadersSeguridad(response: NextResponse) {
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  )

  return response
}

function tieneRolRegistradoEnClaims(sessionClaims: unknown): boolean {
  if (!sessionClaims || typeof sessionClaims !== 'object') return false

  const claims = sessionClaims as Record<string, unknown>
  const rolForzado = resolverRolForzadoPorEmail(claims.email)
  if (rolForzado) return true

  const metadata = claims.publicMetadata ?? claims.metadata
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const rolMetadata = (metadata as Record<string, unknown>).rol
    if (esRolHIS(rolMetadata)) return true
  }

  return resolverRolRegistradoPorEmail(claims.email) !== null
}

async function tieneRolRegistradoEnClerk(userId: string): Promise<boolean> {
  const client = await clerkClient()
  const user = await client.users.getUser(userId)
  const email = user.emailAddresses[0]?.emailAddress
  const rolForzado = resolverRolForzadoPorEmail(email)
  if (rolForzado) return true
  if (esRolHIS(user.publicMetadata.rol)) return true
  return resolverRolRegistradoPorEmail(email) !== null
}

export default clerkMiddleware(async (auth, request: NextRequest) => {
  // En este endpoint, la autenticación y autorización se resuelven
  // directamente en el route handler para evitar doble round-trip de auth.
  if (isApiRouteConAuthEnHandler(request)) {
    return aplicarHeadersSeguridad(NextResponse.next())
  }

  const { userId, sessionClaims } = await auth()
  const tieneRolRegistrado = userId
    ? tieneRolRegistradoEnClaims(sessionClaims) || await tieneRolRegistradoEnClerk(userId)
    : false

  if (isAccessDeniedRoute(request)) {
    return aplicarHeadersSeguridad(NextResponse.next())
  }

  if (isAuthRoute(request)) {
    if (userId) {
      const destino = tieneRolRegistrado ? '/dashboard' : '/acceso-denegado'
      return NextResponse.redirect(new URL(destino, request.url))
    }
    return aplicarHeadersSeguridad(NextResponse.next())
  }

  // Si no está autenticado y accede a ruta protegida
  if (!userId) {
    if (isApiRoute(request)) {
      return NextResponse.json(
        { ok: false, error: 'No autenticado' },
        { status: 401 }
      )
    }
    return NextResponse.redirect(new URL('/sign-in', request.url))
  }

  if (!tieneRolRegistrado) {
    if (isApiRoute(request)) {
      return NextResponse.json(
        { ok: false, error: 'Usuario sin rol asignado' },
        { status: 403 }
      )
    }
    return NextResponse.redirect(new URL('/acceso-denegado', request.url))
  }

  // Usuario autenticado: agregar headers de seguridad
  return aplicarHeadersSeguridad(NextResponse.next())
})

export const config = {
  matcher: [
    // Incluir todas las rutas excepto archivos estáticos de Next.js y assets
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}