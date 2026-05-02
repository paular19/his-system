import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { obtenerInternacionDetalle } from '@/modules/internacion/service'
import { EvolucionSection } from '@/components/internacion/evolucion-section'
import { MedicacionSection } from '@/components/internacion/medicacion-section'
import { TransferenciaCama } from '@/components/internacion/transferencia-cama'
import { PracticaSection } from '@/components/internacion/practica-section'
import { SECTOR_LABEL, ESTADO_CAMA_LABEL } from '@/modules/internacion/types'
import Link from 'next/link'
import type { Metadata } from 'next'
import {
    ChevronRight,
    User,
    Building2,
    Calendar,
    FileText,
    Activity,
    Printer,
} from 'lucide-react'

interface PageProps {
    params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params
    return { title: `Internación #${id}` }
}

export default async function InternacionDetallePage({ params }: PageProps) {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'INTERNACION', 'LEER')) redirect('/dashboard')

    const { id } = await params
    const ingresoId = parseInt(id, 10)
    if (isNaN(ingresoId)) notFound()

    let detalle
    try {
        detalle = await obtenerInternacionDetalle(ingresoId, usuario.codigoUsuario)
    } catch {
        notFound()
    }

    if (detalle.tipoIngresoCodigo !== 'INT') notFound()

    const puedeModificar = tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR')
    const puedeCrear = puedeModificar || tienePermiso(usuario.rol, 'INTERNACION', 'CREAR')
    const puedeCambiarCama = puedeModificar || tienePermiso(usuario.rol, 'INTERNACION', 'CREAR')

    // Load profesionales y camas disponibles para los formularios
    const [profesionales, camasDisponibles] = await Promise.all([
        prisma.profesional.findMany({
            where: { estado: 'A' },
            select: { id: true, nombre: true },
            orderBy: { nombre: 'asc' },
        }),
        prisma.cama.findMany({
            where: { estado: 'DISPONIBLE' },
            select: { id: true, identificador: true, habitacion: true, sector: true, estado: true, observaciones: true, sedeId: true, usuario: true, fechaEstado: true },
            orderBy: [{ sector: 'asc' }, { identificador: 'asc' }],
        }),
    ])

    const fmtDate = (d: Date | null | undefined) =>
        d ? new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'

    const fmtDateTime = (d: Date | null | undefined) =>
        d ? new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

    const diasEstancia = () => {
        if (!detalle.fechaIngreso) return '—'
        const fin = detalle.fechaEgreso ?? new Date()
        return `${Math.floor((fin.getTime() - new Date(detalle.fechaIngreso).getTime()) / 86_400_000)} días`
    }

    const estadoLabel = (e: string | null) => {
        const m: Record<string, string> = { A: 'Activo', E: 'Egresado', P: 'Pendiente', X: 'Anulado' }
        return m[e ?? ''] ?? e ?? '—'
    }

    const edad = () => {
        const fn = detalle.paciente?.fechaNacimiento
        if (!fn) return '—'
        const hoy = new Date()
        const nac = new Date(fn)
        let a = hoy.getFullYear() - nac.getFullYear()
        if (hoy < new Date(hoy.getFullYear(), nac.getMonth(), nac.getDate())) a--
        return `${a} años`
    }

    const camasDisponiblesConOcupante = camasDisponibles.map((c) => ({
        ...c,
        ocupante: null as null,
    }))

    return (
        <>
            <Header titulo={`Internación INT-${detalle.numeroIngreso}`} />
            <div className="p-6 max-w-7xl space-y-5">
                {/* Breadcrumb */}
                <nav className="flex items-center gap-1 text-xs text-gray-500">
                    <Link href="/dashboard/internacion" className="hover:text-gray-700">Internación</Link>
                    <ChevronRight className="h-3 w-3" />
                    <span className="text-gray-900 font-medium">INT-{detalle.numeroIngreso}</span>
                </nav>

                {/* Header del paciente */}
                <div className="his-card p-4">
                    <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                                <User className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                                <h1 className="text-lg font-semibold text-gray-900">
                                    {detalle.nombre ?? detalle.paciente?.nombreCompleto ?? 'Sin nombre'}
                                </h1>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-gray-500">
                                    {detalle.paciente?.tipoDocumento && detalle.paciente.numeroDocumento && (
                                        <span>{detalle.paciente.tipoDocumento} {detalle.paciente.numeroDocumento.toLocaleString('es-AR')}</span>
                                    )}
                                    <span>{edad()}</span>
                                    {detalle.paciente?.celular1 && <span>{detalle.paciente.celular1}</span>}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${detalle.estado === 'A'
                                ? 'bg-green-100 text-green-700'
                                : detalle.estado === 'E'
                                    ? 'bg-gray-100 text-gray-600'
                                    : 'bg-yellow-100 text-yellow-700'
                                }`}>
                                {estadoLabel(detalle.estado)}
                            </span>
                            <Link
                                href={`/dashboard/internacion/${ingresoId}/informe`}
                                className="flex items-center gap-1.5 text-xs font-medium border rounded-lg px-3 py-1.5 hover:bg-gray-50"
                            >
                                <FileText className="h-3.5 w-3.5" />
                                Informe
                            </Link>
                            <Link
                                href={`/dashboard/admision/${ingresoId}`}
                                className="flex items-center gap-1.5 text-xs font-medium border rounded-lg px-3 py-1.5 hover:bg-gray-50"
                            >
                                <Activity className="h-3.5 w-3.5" />
                                Admisión
                            </Link>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* Columna izquierda: datos + cama + diagnósticos */}
                    <div className="space-y-4">
                        {/* Datos de internación */}
                        <div className="his-card p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Calendar className="h-4 w-4 text-gray-400" />
                                <h3 className="text-sm font-semibold text-gray-900">Datos de internación</h3>
                            </div>
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                                <DataItem label="Ingreso" value={fmtDateTime(detalle.fechaIngreso)} />
                                <DataItem label="Alta prevista" value={fmtDate(detalle.fechaEgresoPrevista)} />
                                <DataItem label="Estancia" value={diasEstancia()} />
                                {detalle.fechaEgreso && <DataItem label="Alta real" value={fmtDate(detalle.fechaEgreso)} />}
                                <DataItem label="Médico guardia" value={detalle.profesionalGuardia?.nombre ?? null} />
                                <DataItem label="Médico tratante" value={detalle.profesionalTratante?.nombre ?? null} />
                            </dl>
                        </div>

                        {/* O. Social */}
                        <div className="his-card p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Building2 className="h-4 w-4 text-gray-400" />
                                <h3 className="text-sm font-semibold text-gray-900">Obra social</h3>
                            </div>
                            <dl className="grid grid-cols-1 gap-y-2.5 text-sm">
                                <DataItem label="Cobertura" value={detalle.obraSocial?.nombre ?? null} />
                                <DataItem label="Plan" value={detalle.plan?.descripcion ?? null} />
                                <DataItem label="Nro. afiliado" value={detalle.numeroAfiliado} />
                            </dl>
                        </div>

                        {/* Diagnósticos */}
                        <div className="his-card p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-semibold text-gray-900">Diagnósticos</h3>
                                {puedeModificar && (
                                    <Link
                                        href={`/dashboard/admision/${ingresoId}/diagnostico`}
                                        className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                                    >
                                        + Agregar
                                    </Link>
                                )}
                            </div>
                            {detalle.descripcionPatologia && (
                                <p className="text-xs text-gray-600 italic mb-2">{detalle.descripcionPatologia}</p>
                            )}
                            {detalle.ingresoPatologias.length === 0 ? (
                                <p className="text-xs text-gray-400">Sin diagnósticos registrados</p>
                            ) : (
                                <ul className="space-y-2">
                                    {detalle.ingresoPatologias.map((p) => (
                                        <li key={p.id} className="flex items-start gap-2">
                                            <span className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${p.estado === 'A' ? 'bg-blue-500' : 'bg-gray-300'}`} />
                                            <span className="text-xs text-gray-700">{p.descripcion ?? `Patología ${p.patologiaId}`}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* Cama + Transferencias */}
                        <TransferenciaCama
                            ingresoId={ingresoId}
                            camaActual={detalle.cama}
                            transferencias={detalle.transferencias}
                            camasDisponibles={camasDisponiblesConOcupante}
                            profesionales={profesionales}
                            puedeModificar={puedeCambiarCama}
                        />

                        {/* Órdenes / Autorizaciones */}
                        {detalle.ordenes.length > 0 && (
                            <div className="his-card p-4">
                                <h3 className="text-sm font-semibold text-gray-900 mb-3">Autorizaciones</h3>
                                <div className="space-y-2">
                                    {detalle.ordenes.map((o) => (
                                        <div key={`${o.puestoNumero}-${o.numero}`} className="text-xs border rounded-lg p-2">
                                            <div className="flex justify-between items-center">
                                                <span className="font-medium">
                                                    {String(o.puestoNumero).padStart(4, '0')}-{String(o.numero).padStart(8, '0')}
                                                </span>
                                                <span className={`px-1.5 py-0.5 rounded ${o.estado === 'A' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                                    {o.estado === 'A' ? 'Activa' : 'Cerrada'}
                                                </span>
                                            </div>
                                            <p className="text-gray-400 mt-0.5">
                                                {new Date(o.fechaEmision).toLocaleDateString('es-AR')} · {o.items.length} práctica(s)
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Columna central + derecha: evolución + medicaciones */}
                    <div className="lg:col-span-2 space-y-4">
                        <EvolucionSection
                            ingresoId={ingresoId}
                            evoluciones={detalle.evoluciones}
                            profesionales={profesionales}
                            puedeCrear={puedeCrear}
                        />

                        <MedicacionSection
                            ingresoId={ingresoId}
                            medicaciones={detalle.medicaciones}
                            profesionales={profesionales}
                            puedeCrear={puedeCrear}
                            puedeModificar={puedeModificar}
                        />

                        <PracticaSection
                            ingresoId={ingresoId}
                            convenioId={detalle.obraSocial?.id ?? null}
                            practicas={detalle.practicas}
                            puedeCrear={puedeCrear}
                        />
                    </div>
                </div>
            </div>
        </>
    )
}

function DataItem({ label, value }: { label: string; value: string | null | undefined }) {
    return (
        <div>
            <dt className="text-xs text-gray-400 uppercase tracking-wide">{label}</dt>
            <dd className="mt-0.5 text-sm text-gray-900">{value ?? '—'}</dd>
        </div>
    )
}
