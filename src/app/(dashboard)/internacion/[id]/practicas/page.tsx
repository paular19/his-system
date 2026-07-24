import { Header } from '@/components/layout/header'
import { PracticaCargaRapidaPage } from '@/components/internacion/practica-carga-rapida-page'
import { getUsuarioSesion } from '@/lib/auth'
import { ROLES, tienePermiso } from '@/lib/auth/rbac'
import { obtenerInternacionDetalle } from '@/modules/internacion/service'
import Link from 'next/link'
import { ChevronRight, ArrowLeft } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'

interface PageProps {
    params: Promise<{ id: string }>
}

export default async function InternacionPracticasRapidasPage({ params }: PageProps) {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'INTERNACION', 'LEER')) redirect('/dashboard')

    const puedeCrear =
        tienePermiso(usuario.rol, 'INTERNACION', 'CREAR') ||
        tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR') ||
        (usuario.rol === ROLES.ADMIN)

    const { id } = await params
    const ingresoId = parseInt(id, 10)
    if (Number.isNaN(ingresoId)) notFound()

    let detalle
    try {
        detalle = await obtenerInternacionDetalle(ingresoId, usuario.codigoUsuario)
    } catch {
        notFound()
    }

    if (!detalle || detalle.tipoIngresoCodigo !== 'INT') notFound()

    return (
        <>
            <Header titulo="Carga rapida de practicas" />
            <div className="p-6 space-y-4 max-w-7xl">
                <nav className="flex items-center gap-1 text-xs text-gray-500">
                    <Link href="/dashboard/internacion" className="hover:text-gray-700">Internacion</Link>
                    <ChevronRight className="h-3 w-3" />
                    <Link href={`/dashboard/internacion/${ingresoId}`} className="hover:text-gray-700">
                        INT-{detalle.numeroIngreso}
                    </Link>
                    <ChevronRight className="h-3 w-3" />
                    <span className="text-gray-900 font-medium">Carga de practicas</span>
                </nav>

                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Carga centralizada de practicas</h2>
                        <p className="text-sm text-gray-600">
                            Carga continua por codigo, sin hora, con confirmacion visual inmediata de cada practica.
                        </p>
                    </div>

                    <Link
                        href={`/dashboard/internacion/${ingresoId}#internacion-practicas`}
                        className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Volver a ficha
                    </Link>
                </div>

                <PracticaCargaRapidaPage
                    ingresoId={ingresoId}
                    convenioId={detalle.obraSocial?.id ?? null}
                    sectorInternacionActual={detalle.cama?.sector ?? null}
                    matriculaTratanteDefault={detalle.profesionalTratante?.matricula ?? null}
                    puedeCrear={puedeCrear}
                    practicasIniciales={detalle.practicas}
                />
            </div>
        </>
    )
}
