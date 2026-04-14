import { SignUp } from '@clerk/nextjs'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Registro',
}

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
      <div className="w-full max-w-md space-y-6 p-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">Sistema HIS</h1>
          <p className="text-gray-500 text-sm">Crear cuenta de acceso</p>
        </div>
        <div className="flex justify-center">
          <SignUp />
        </div>
      </div>
    </div>
  )
}
