import { Header } from '@/components/layout/header'
import { LoteDetallePage } from '@/components/facturacion/lote-detalle-page'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Detalle de Lote' }

type Props = { params: Promise<{ id: string }> }

export default async function LoteDetallePageRoute({ params }: Props) {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'FACTURACION', 'LEER')) redirect('/dashboard')

    const { id } = await params

    return (
        <>
            <Header titulo={`Lote #${id}`} />
            <LoteDetallePage loteId={Number(id)} />
        </>
    )
}
