import { Header } from '@/components/layout/header'
import { LotesPanel } from '@/components/facturacion/lotes-panel'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Lotes de Facturación' }

export default async function LotesPage() {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'FACTURACION', 'LEER')) redirect('/dashboard')

    return (
        <>
            <Header titulo="Lotes de Facturación" />
            <LotesPanel />
        </>
    )
}
