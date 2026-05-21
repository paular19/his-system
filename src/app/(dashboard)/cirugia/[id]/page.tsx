import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { prisma } from '@/lib/db'
import { Header } from '@/components/layout/header'
import { PracticasAutorizacionSection } from '@/components/cirugia/practicas-autorizacion-section'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { generarCodigoBarras } from '@/modules/orden/types'

export const metadata: Metadata = {
    title: 'Detalle Cirugia Programada',
}

interface CirugiaProgramadaDetallePageProps {
    params: Promise<{ id: string }>
}

function normalizarNumeroAutorizacion(value: string | null | undefined): string | null {
    const normalized = value?.trim() ?? ''
    return normalized.length > 0 ? normalized : null
}

function resolverNumeroAutorizacionOrdenItem(
    numeroItem: string | null | undefined,
    numeroOrden: string | null | undefined,
    numeroPractica: string | null | undefined,
    puestoNumero: number,
    ordenNumero: number,
    item: number
): string | null {
    const generado = generarCodigoBarras(puestoNumero, ordenNumero, item)
    const candidatos = [
        normalizarNumeroAutorizacion(numeroItem),
        normalizarNumeroAutorizacion(numeroOrden),
        normalizarNumeroAutorizacion(numeroPractica),
    ]

    for (const candidato of candidatos) {
        if (!candidato) continue
        if (candidato === generado) continue
        return candidato
    }

    return null
}

export default async function CirugiaProgramadaDetallePage({ params }: CirugiaProgramadaDetallePageProps) {
    const { id } = await params
    const cirugiaId = Number.parseInt(id, 10)
    if (!Number.isFinite(cirugiaId)) {
        notFound()
    }

    const cirugia = await prisma.cirugiaProgramada.findUnique({
        where: { id: cirugiaId },
        include: {
            paciente: {
                select: {
                    id: true,
                    nombreCompleto: true,
                    numeroDocumento: true,
                    historiaClinica: true,
                },
            },
            practicas: true,
            diferenciales: true,
            cama: {
                select: {
                    identificador: true,
                    sector: true,
                    habitacion: true,
                },
            },
            internacion: {
                select: {
                    id: true,
                    practicas: {
                        select: {
                            codigoPractica: true,
                            numeroAutorizacion: true,
                            puestoNumero: true,
                            ordenNumero: true,
                            ordenItem: true,
                            ordenPractica: {
                                select: {
                                    puestoNumero: true,
                                    ordenNumero: true,
                                    item: true,
                                    modulo: true,
                                    numeroAutorizacion: true,
                                    orden: {
                                        select: {
                                            numeroAutorizacion: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    })

    if (!cirugia) {
        notFound()
    }

    return (
        <>
            <Header titulo="Detalle Cirugia Programada" />
            <div className="p-6 max-w-5xl space-y-6">
                <nav className="flex items-center gap-1 text-xs text-gray-500">
                    <Link href="/dashboard/cirugia" className="hover:text-gray-700">
                        Cirugias
                    </Link>
                    <ChevronRight className="h-3 w-3" />
                    <span className="text-gray-900 font-medium">{cirugia.paciente.nombreCompleto}</span>
                </nav>

                {/* Informacion del paciente y cirugia */}
                <div className="his-card p-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <h3 className="text-sm font-semibold text-gray-700 mb-3">Paciente</h3>
                            <div className="space-y-1.5 text-sm">
                                <p>
                                    <span className="text-gray-500">Nombre:</span> {cirugia.paciente.nombreCompleto}
                                </p>
                                <p>
                                    <span className="text-gray-500">DNI:</span> {cirugia.paciente.numeroDocumento ?? '-'}
                                </p>
                                <p>
                                    <span className="text-gray-500">HC:</span> {cirugia.paciente.historiaClinica ?? '-'}
                                </p>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-sm font-semibold text-gray-700 mb-3">CirugÃ­a</h3>
                            <div className="space-y-1.5 text-sm">
                                <p>
                                    <span className="text-gray-500">Fecha:</span>{' '}
                                    {new Date(cirugia.fechaCirugia).toLocaleDateString('es-AR')}
                                </p>
                                {cirugia.horaCirugia && (
                                    <p>
                                        <span className="text-gray-500">Hora:</span> {cirugia.horaCirugia}
                                    </p>
                                )}
                                {cirugia.cama && (
                                    <p>
                                        <span className="text-gray-500">Cama:</span> {cirugia.cama.identificador} ({cirugia.cama.sector})
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {cirugia.observaciones && (
                        <div className="pt-4 border-t">
                            <h3 className="text-sm font-semibold text-gray-700 mb-2">Observaciones</h3>
                            <p className="text-sm text-gray-700">{cirugia.observaciones}</p>
                        </div>
                    )}
                </div>

                {/* Diferenciales */}
                {cirugia.diferenciales.length > 0 && (
                    <div className="his-card p-5">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">Diferenciales Detectados</h3>
                        <div className="space-y-2">
                            {cirugia.diferenciales.map((d) => (
                                <div key={d.id} className="flex flex-wrap gap-2">
                                    {d.esFeriado && <span className="inline-block bg-red-100 text-red-800 text-xs px-2 py-1 rounded">Feriado</span>}
                                    {d.esNocturna && <span className="inline-block bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded">CirugÃ­a nocturna</span>}
                                    {d.mismaViaPatologia && <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">Misma vÃ­a, diferentes patologÃ­as</span>}
                                    {d.diferentesViasPatologia && <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">Diferentes vÃ­as, misma patologÃ­a</span>}
                                    {d.diferentesViasDiferentesPatologia && <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">Diferentes vÃ­as y patologÃ­as</span>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* PrÃ¡cticas y autorizaciones */}
                <div className="his-card p-5">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">PrÃ¡cticas y Autorizaciones</h3>
                    <PracticasAutorizacionSection
                        cirugiaId={cirugia.id}
                        internacionId={cirugia.internacionId}
                        practicas={cirugia.practicas.map((p) => ({
                            id: p.id,
                            codigo: p.codigo,
                            descripcion: p.descripcion,
                            cantidad: p.cantidad,
                            numeroAutorizacion: p.numeroAutorizacion,
                            ordenesAutorizacion: (cirugia.internacion?.practicas ?? [])
                                .filter((pi) => pi.codigoPractica.trim() === p.codigo.trim())
                                .flatMap((pi) => {
                                    if (Array.isArray(pi.ordenPractica) && pi.ordenPractica.length > 0) {
                                        return pi.ordenPractica.map((op) => ({
                                            puestoNumero: op.puestoNumero,
                                            ordenNumero: op.ordenNumero,
                                            item: op.item,
                                            modulo: op.modulo?.trim() ?? null,
                                            numeroAutorizacion: resolverNumeroAutorizacionOrdenItem(
                                                op.numeroAutorizacion,
                                                op.orden?.numeroAutorizacion,
                                                pi.numeroAutorizacion,
                                                op.puestoNumero,
                                                op.ordenNumero,
                                                op.item
                                            ),
                                        }))
                                    }

                                    if (
                                        pi.puestoNumero != null &&
                                        pi.ordenNumero != null &&
                                        Number(pi.puestoNumero) > 0
                                    ) {
                                        return [
                                            {
                                                puestoNumero: Number(pi.puestoNumero),
                                                ordenNumero: Number(pi.ordenNumero),
                                                item:
                                                    pi.ordenItem != null && Number(pi.ordenItem) > 0
                                                        ? Number(pi.ordenItem)
                                                        : 1,
                                                modulo: null,
                                                numeroAutorizacion: resolverNumeroAutorizacionOrdenItem(
                                                    pi.numeroAutorizacion,
                                                    null,
                                                    null,
                                                    Number(pi.puestoNumero),
                                                    Number(pi.ordenNumero),
                                                    pi.ordenItem != null && Number(pi.ordenItem) > 0
                                                        ? Number(pi.ordenItem)
                                                        : 1
                                                ),
                                            },
                                        ]
                                    }

                                    return []
                                }),
                        }))}
                    />
                </div>
            </div>
        </>
    )
}
