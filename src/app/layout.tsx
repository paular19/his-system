import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    template: '%s | Sistema HIS',
    default: 'Sistema HIS',
  },
  description: 'Sistema de Información Hospitalaria',
  robots: {
    index: false,    // Sistema interno, no indexar
    follow: false,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
      <html lang="es" suppressHydrationWarning>
        <body className={inter.className}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
