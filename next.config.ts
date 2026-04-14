import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    typedRoutes: true,
  },
  async redirects() {
    return [
      {
        source: '/dashbord',
        destination: '/dashboard',
        permanent: false,
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: '/dashboard/:path*',
        destination: '/:path*',
      },
      {
        source: '/dashbord/:path*',
        destination: '/dashboard/:path*',
      },
    ]
  },
  // Evitar que datos sensibles sean expuestos en el cliente
  serverRuntimeConfig: {
    DATABASE_URL: process.env.DATABASE_URL,
  },
  publicRuntimeConfig: {
    // Solo variables seguras para el cliente
  },
}

export default nextConfig
