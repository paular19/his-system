import { Header } from '@/components/layout/header'
import { PracticaCargaRapidaPage } from '@/components/internacion/practica-carga-rapida-page'
import { InternacionPracticasFichaTable } from '@/components/internacion/internacion-practicas-ficha-table'
import { getUsuarioSesion } from '@/lib/auth'
import { ROLES, tienePermiso } from '@/lib/auth/rbac'
import { prisma } from '@/lib/db'
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
    const puedeLeerInternacion =
        tienePermiso(usuario.rol, 'INTERNACION', 'LEER') ||
        tienePermiso(usuario.rol, 'ADMISION', 'LEER')
    if (!puedeLeerInternacion) redirect('/dashboard')

    const puedeCrear =
        tienePermiso(usuario.rol, 'INTERNACION', 'CREAR') ||
        tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR') ||
        tienePermiso(usuario.rol, 'ADMISION', 'CREAR') ||
        tienePermiso(usuario.rol, 'ADMISION', 'MODIFICAR') ||
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

    const practicasCirugiaActivas = cirugiaObjetivo
        ? await prisma.practica.findMany({
            where: {
                ingresoId,
                OR: [{ estado: 'A' }, { estado: null }],
                usuarioRegistro: 'CIRUGIA',
            },
            select: {
                id: true,
                ingresoId: true,
                convenioId: true,
                codigoPractica: true,
                fecha: true,
                cantidad: true,
                importeTotal: true,
                numeroAutorizacion: true,
                numeroProtocoloLab: true,
                diagnosticoLab: true,
                matriculaEspecialista: true,
                matriculaAnestesista: true,
                puestoNumero: true,
                ordenNumero: true,
                ordenItem: true,
                facturable: true,
                estado: true,
                usuarioRegistro: true,
                ordenPractica: {
                    where: {
                        orden: {
                            estado: { not: 'X' },
                        },
                    },
                    select: {
                        puestoNumero: true,
                        ordenNumero: true,
                        item: true,
                        numeroAutorizacion: true,
                    },
                },
            },
            orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        })
        : []

    const descripcionCirugiaPorCodigo = new Map<string, string>()
    for (const practicaCirugia of cirugiaObjetivo?.practicas ?? []) {
        const codigo = practicaCirugia.codigo.trim().toUpperCase()
        const descripcion = practicaCirugia.descripcion.trim()
        if (!codigo || !descripcion) continue
        if (!descripcionCirugiaPorCodigo.has(codigo)) {
            descripcionCirugiaPorCodigo.set(codigo, descripcion)
        }
    }
    for (const practica of detalle.practicas) {
        const codigo = practica.codigoPractica.trim().toUpperCase()
        const descripcion = practica.descripcionPractica?.trim() ?? ''
        if (!codigo || !descripcion) continue
        if (!descripcionCirugiaPorCodigo.has(codigo)) {
            descripcionCirugiaPorCodigo.set(codigo, descripcion)
        }
    }

    const practicasCirugiaParaPagina = practicasCirugiaActivas.map((practica) => {
        const codigoNormalizado = practica.codigoPractica.trim().toUpperCase()
        const descripcion = descripcionCirugiaPorCodigo.get(codigoNormalizado) ?? practica.codigoPractica.trim()
        return {
            id: practica.id,
            ingresoId: practica.ingresoId,
            convenioId: practica.convenioId,
            codigoPractica: practica.codigoPractica,
            descripcionPractica: descripcion,
            numeroProtocoloLaboratorio: practica.numeroProtocoloLab,
            diagnosticoLaboratorio: practica.diagnosticoLab,
            fecha: practica.fecha,
            cantidad: Number(practica.cantidad),
            importeTotal: practica.importeTotal != null ? Number(practica.importeTotal) : null,
            numeroAutorizacion: practica.numeroAutorizacion,
            matriculaEspecialista: practica.matriculaEspecialista,
            matriculaAnestesista: practica.matriculaAnestesista,
            puestoNumero: practica.puestoNumero,
            ordenNumero: practica.ordenNumero,
            ordenItem: practica.ordenItem,
            facturada: (practica.estado ?? '').trim().toUpperCase() === 'F',
            ordenPractica: practica.ordenPractica.map((orden) => ({
                puestoNumero: orden.puestoNumero,
                ordenNumero: orden.ordenNumero,
                item: orden.item,
                numeroAutorizacion: orden.numeroAutorizacion,
            })),
            facturable: Boolean(practica.facturable),
            estado: practica.estado,
            usuario: practica.usuarioRegistro,
        }
    })

    const practicaIdsInternacionCirugiaObjetivo = (() => {
        if (!cirugiaObjetivo) return [] as number[]

        const practicasPorCodigo = new Map<string, typeof practicasCirugiaParaPagina>()
        for (const practica of practicasCirugiaParaPagina) {
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

    const practicaIdsCirugiaSet = new Set(practicaIdsInternacionCirugiaObjetivo)
    const practicasPagina = contextoCirugia
        ? practicasCirugiaParaPagina
            .filter((practica) => practicaIdsCirugiaSet.has(practica.id))
            .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
        : detalle.practicas

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
                    practicas={practicasPagina}
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
                    practicasIniciales={practicasPagina}
                    contextoCirugia={contextoCirugia}
                />
            </div>
        </>
    )
}
