import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Rutas públicas: no requieren autenticación
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
])

// Rutas de API: requieren autenticación pero el control de acceso
// detallado (RBAC) se maneja dentro de cada route handler.
const isApiRoute = createRouteMatcher(['/api(.*)'])

export default clerkMiddleware(async (auth, request: NextRequest) => {
  const { userId } = await auth()

  // Si es ruta pública, dejar pasar
  if (isPublicRoute(request)) {
    // Si ya está autenticado y accede a sign-in/sign-up, redirigir al dashboard
    if (userId) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return NextResponse.next()
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

  // Usuario autenticado: agregar headers de seguridad
  const response = NextResponse.next()

  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  )

  return response
})

export const config = {
  matcher: [
    // Incluir todas las rutas excepto archivos estáticos de Next.js y assets
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}