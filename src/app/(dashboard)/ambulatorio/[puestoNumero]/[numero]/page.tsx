import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect, notFound } from 'next/navigation'
import { motivoBloqueoCambioProfesional, obtenerOrden } from '@/modules/orden/repository'
import { AutorizacionPrint } from '@/components/orden/autorizacion-print'
import { CambiarProfesionalOrden } from '@/components/orden/cambiar-profesional-orden'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Autorización' }

interface PageProps {
  params: Promise<{ puestoNumero: string; numero: string }>
}

export default async function AutorizacionPage({ params }: PageProps) {
  const usuario = await getUsuarioSesion()
  if (!tienePermiso(usuario.rol, 'AMBULATORIO', 'LEER')) redirect('/dashboard')

  const { puestoNumero: pStr, numero: nStr } = await params
  const puestoNumero = parseInt(pStr, 10)
  const numero = parseInt(nStr, 10)

  if (isNaN(puestoNumero) || isNaN(numero)) notFound()

  const orden = await obtenerOrden(puestoNumero, numero)
  if (!orden) notFound()

  const puedeModificar =
    tienePermiso(usuario.rol, 'AMBULATORIO', 'MODIFICAR') ||
    tienePermiso(usuario.rol, 'ADMISION', 'MODIFICAR') ||
    tienePermiso(usuario.rol, 'FACTURACION', 'MODIFICAR')

  const bloqueo = puedeModificar
    ? await motivoBloqueoCambioProfesional(puestoNumero, numero)
    : 'Sin permiso para modificar'

  return (
    <div className="p-6 max-w-4xl print:p-0 print:max-w-none">
      <div className="mb-4">
        <CambiarProfesionalOrden
          puestoNumero={puestoNumero}
          numero={numero}
          profesionalActual={orden.profesional}
          bloqueo={bloqueo}
        />
      </div>

      <AutorizacionPrint
        orden={orden}
        nombreClinica="CLINICA SAN RAFAEL"
        usuario={usuario.codigoUsuario}
      />
    </div>
  )
}
