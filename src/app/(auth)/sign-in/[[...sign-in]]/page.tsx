import { SignIn } from '@clerk/nextjs'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Iniciar Sesión',
}

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
      <div className="w-full max-w-md space-y-6 p-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="h-12 w-12 rounded-full bg-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-lg">HIS</span>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Sistema HIS</h1>
          <p className="text-gray-500 text-sm">Sistema de Información Hospitalaria</p>
        </div>
        <div className="flex justify-center">
          <SignIn />
        </div>
      </div>
    </div>
  )
}
