import { Header } from '@/components/layout/header'
import { PracticaCargaRapidaPage } from '@/components/internacion/practica-carga-rapida-page'
import { InternacionPracticasFichaTable } from '@/components/internacion/internacion-practicas-ficha-table'
import { getUsuarioSesion } from '@/lib/auth'
import { ROLES, tienePermiso } from '@/lib/auth/rbac'
import { obtenerInternacionDetalle } from '@/modules/internacion/service'
import Link from 'next/link'
import { ChevronRight, ArrowLeft } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'

interface PageProps {
    params: Promise<{ id: string }>
    searchParams: Promise<{ cirugiaId?: string }>
}

export default async function InternacionPracticasRapidasPage({ params, searchParams }: PageProps) {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'INTERNACION', 'LEER')) redirect('/dashboard')

    const puedeCrear =
        tienePermiso(usuario.rol, 'INTERNACION', 'CREAR') ||
        tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR') ||
        (usuario.rol === ROLES.ADMIN)

    const { id } = await params
    const { cirugiaId: cirugiaIdParam } = await searchParams
    const ingresoId = parseInt(id, 10)
    if (Number.isNaN(ingresoId)) notFound()

    let detalle
    try {
        detalle = await obtenerInternacionDetalle(ingresoId, usuario.codigoUsuario)
    } catch {
        notFound()
    }

    if (!detalle || detalle.tipoIngresoCodigo !== 'INT') notFound()

    const cirugiaId = cirugiaIdParam ? Number.parseInt(cirugiaIdParam, 10) : null
    const cirugiaObjetivo =
        cirugiaId != null && Number.isFinite(cirugiaId)
            ? (detalle.cirugiasUrgencia.find((cirugia) => cirugia.id === cirugiaId) ?? null)
            : null

    const practicaIdsInternacionCirugiaObjetivo = (() => {
        if (!cirugiaObjetivo) return [] as number[]

        const practicasPorCodigo = new Map<string, typeof detalle.practicas>()
        for (const practica of detalle.practicas) {
            const estado = (practica.estado ?? 'A').trim().toUpperCase()
            if (estado === 'X') continue

            const codigo = practica.codigoPractica.trim().toUpperCase()
            if (!codigo) continue

            const bucket = practicasPorCodigo.get(codigo) ?? []
            bucket.push(practica)
            practicasPorCodigo.set(codigo, bucket)
        }

        for (const bucket of practicasPorCodigo.values()) {
            bucket.sort((a, b) => a.id - b.id)
        }

        const usadosPorCodigo = new Set<number>()
        const ids: number[] = []

        for (const practicaCirugia of cirugiaObjetivo.practicas) {
            const codigo = practicaCirugia.codigo.trim().toUpperCase()
            const candidatas = practicasPorCodigo.get(codigo) ?? []

            const candidata = candidatas.find((item) => {
                if (usadosPorCodigo.has(item.id)) return false
                const usuario = (item.usuario ?? '').trim().toUpperCase()
                return usuario === 'CIRUGIA'
            })
                ?? candidatas.find((item) => !usadosPorCodigo.has(item.id))

            if (!candidata) continue
            usadosPorCodigo.add(candidata.id)
            ids.push(candidata.id)
        }

        return ids
    })()

    const contextoCirugia =
        cirugiaObjetivo && detalle.paciente
            ? {
                cirugiaId: cirugiaObjetivo.id,
                pacienteId: detalle.paciente.id,
                fechaCirugia: cirugiaObjetivo.fechaCirugia,
                obraSocialId: detalle.obraSocial?.id ?? null,
                planId: detalle.plan?.id ?? null,
                obraSocialCoseguroId: detalle.obraSocialCoseguroId ?? null,
                numeroAfiliado: detalle.numeroAfiliado ?? null,
                practicaIdsInternacion: practicaIdsInternacionCirugiaObjetivo,
            }
            : null

    return (
        <>
            <Header titulo={contextoCirugia ? 'Practicas de cirugia' : 'Practicas de internacion'} />
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
                        <h2 className="text-lg font-semibold text-gray-900">
                            {contextoCirugia
                                ? `Practicas para cirugia #${contextoCirugia.cirugiaId}`
                                : 'Practicas de internacion'}
                        </h2>
                        <p className="text-sm text-gray-600">
                            {contextoCirugia
                                ? 'Gestion y carga continua por codigo para esta cirugia, con confirmacion visual inmediata de cada practica.'
                                : 'Gestion de ordenes y carga continua por codigo, con confirmacion visual inmediata de cada practica.'}
                        </p>
                    </div>

                    <Link
                        href={contextoCirugia
                            ? `/dashboard/internacion/${ingresoId}#internacion-cirugia`
                            : `/dashboard/internacion/${ingresoId}#internacion-practicas`}
                        className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Volver a ficha
                    </Link>
                </div>

                <InternacionPracticasFichaTable
                    practicas={detalle.practicas}
                    obraSocialNombre={detalle.obraSocial?.nombre ?? null}
                    pacienteNombre={detalle.nombre ?? detalle.paciente?.nombreCompleto ?? null}
                    pacienteDni={detalle.paciente?.numeroDocumento ?? null}
                />

                <PracticaCargaRapidaPage
                    ingresoId={ingresoId}
                    convenioId={detalle.obraSocial?.id ?? null}
                    sectorInternacionActual={detalle.cama?.sector ?? null}
                    matriculaTratanteDefault={detalle.profesionalTratante?.matricula ?? null}
                    puedeCrear={puedeCrear}
                    practicasIniciales={detalle.practicas}
                    contextoCirugia={contextoCirugia}
                />
            </div>
        </>
    )
}
