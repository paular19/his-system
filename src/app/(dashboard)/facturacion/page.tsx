import { Header } from '@/components/layout/header'
import { FacturacionPanel } from '@/components/facturacion/facturacion-panel'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Facturacion' }

export default async function FacturacionPage() {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'FACTURACION', 'LEER')) redirect('/dashboard')

    return (
        <>
            <Header titulo="Facturacion" />
            <FacturacionPanel />
        </>
    )
}
