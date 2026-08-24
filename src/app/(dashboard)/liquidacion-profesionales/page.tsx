import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermisoUsuario } from '@/lib/auth/role-registry'
import { LiquidacionProfesionalesPanel } from '@/components/liquidacion-profesionales/liquidacion-panel'

export const metadata: Metadata = { title: 'Liquidación de Profesionales' }

export default async function LiquidacionProfesionalesPage() {
    const usuario = await getUsuarioSesion()
    if (!tienePermisoUsuario(usuario, 'LIQUIDACION_PROFESIONALES', 'LEER')) redirect('/dashboard')

    return (
        <>
            <Header titulo="Liquidación de Profesionales" />
            <LiquidacionProfesionalesPanel />
        </>
    )
}
