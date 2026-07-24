import { Header } from '@/components/layout/header'
import { CirugiaProgramadaForm } from '@/components/cirugia'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { Metadata } from 'next'
import { getCatalogoCoberturaAtencion } from '@/lib/catalogos/atencion-cache'

export const metadata: Metadata = { title: 'Nueva cirugia programada' }

export default async function NuevaCirugiaPage() {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'ADMISION', 'CREAR')) {
        redirect('/dashboard/cirugia')
    }

    const { obraSociales, planes, coseguros } = await getCatalogoCoberturaAtencion()

    return (
        <>
            <Header titulo="Nueva cirugía programada" />
            <div className="p-6 max-w-5xl space-y-4">
                <nav className="flex items-center gap-1 text-xs text-gray-500">
                    <Link href="/dashboard/cirugia" className="hover:text-gray-700">
                        Cirugías
                    </Link>
                    <ChevronRight className="h-3 w-3" />
                    <span className="text-gray-900 font-medium">Nueva cirugía programada</span>
                </nav>

                <CirugiaProgramadaForm
                    obraSociales={obraSociales}
                    planes={planes}
                    coseguros={coseguros}
                />
            </div>
        </>
    )
}