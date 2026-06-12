import type { Metadata } from 'next'
import Image from 'next/image'
import { SignInCard } from '@/components/auth/sign-in-card'

export const metadata: Metadata = {
  title: 'Iniciar Sesión',
}

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-blue-50 to-blue-100">
      <div className="w-full max-w-md space-y-6 p-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <Image
              src="/logo-clinica.png"
              alt="Clínica San Rafael"
              width={120}
              height={120}
              className="h-20 w-auto"
              priority
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Sistema HIS</h1>
          <p className="text-gray-500 text-sm">Sistema de Información Hospitalaria</p>
        </div>
        <div className="flex justify-center">
          <SignInCard />
        </div>
      </div>
    </div>
  )
}
