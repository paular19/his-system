import { Header } from '@/components/layout/header'
import { FacturacionPanel } from '@/components/facturacion/facturacion-panel'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Facturacion facturadas' }

export default async function FacturacionFacturadasPage() {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'FACTURACION', 'LEER')) redirect('/dashboard')

    return (
        <>
            <Header titulo="Facturacion · Facturadas" />
            <FacturacionPanel vista="FACTURADAS" />
        </>
    )
}
