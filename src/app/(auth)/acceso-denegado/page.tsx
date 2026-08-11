import type { Metadata } from 'next'
import Image from 'next/image'
import { SignOutButton } from '@clerk/nextjs'

export const metadata: Metadata = {
  title: 'Acceso no autorizado',
}

export default function AccesoDenegadoPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-linear-to-br from-gray-50 to-red-50 p-6">
      <section className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
        <Image
          src="/logo-clinica.png"
          alt="Clínica San Rafael"
          width={120}
          height={120}
          className="mx-auto h-20 w-auto"
          priority
        />
        <h1 className="mt-5 text-xl font-bold text-gray-900">Acceso no autorizado</h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          Tu cuenta no tiene un rol asignado. Solicitá al administrador que habilite tu acceso.
        </p>
        <SignOutButton redirectUrl="/sign-in">
          <button
            type="button"
            className="mt-6 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            Cerrar sesión
          </button>
        </SignOutButton>
      </section>
    </main>
  )
}