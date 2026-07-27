import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { ROLES, tienePermiso } from '@/lib/auth/rbac'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { obtenerInternacionDetalle } from '@/modules/internacion/service'
import { TransferenciaCama } from '@/components/internacion/transferencia-cama'
import { DiagnosticosSection } from '@/components/internacion/diagnosticos-section'
import { TratanteSection } from '@/components/internacion/tratante-section'
import { ObservacionesSection } from '@/components/internacion/observaciones-section'
import { SoporteRespiratorioSection } from '@/components/internacion/soporte-respiratorio-section'
import { ViasSection } from '@/components/internacion/vias-section'
import { InternacionPanelClinicoLazy } from '@/components/internacion/internacion-panel-clinico-lazy'
import Link from 'next/link'
import type { Metadata } from 'next'
import {
    getCatalogoCoberturaAtencion,
    getProfesionalesActivosCatalogo,
} from '@/lib/catalogos/atencion-cache'
import {
    ChevronRight,
    User,
    Building2,
    Calendar,
    FileText,
    Activity,
    Plus,
} from 'lucide-react'
import { nombreProfesionalParaMostrar } from '@/lib/profesionales'
import {
    diferenciaDiasCalendarioArgentina,
    formatearFechaArgentina,
    formatearFechaHoraArgentina,
} from '@/lib/utils/argentina-date'
import { calcularEdad } from '@/lib/utils'
import { logServerPerf } from '@/lib/perf/server-perf'

interface PageProps {
    params: Promise<{ id: string }>
}

function resolverApellidoParaTitulo(nombreCompleto: string | null | undefined): string | null {
    const raw = nombreCompleto?.trim()
    if (!raw) return null

    if (raw.includes(',')) {
        const [apellido] = raw.split(',')
        const normalizado = apellido?.trim()
        return normalizado && normalizado.length > 0 ? normalizado : null
    }

    const partes = raw.split(/\s+/).filter(Boolean)
    return partes[0] ?? null
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params
    const ingresoId = parseInt(id, 10)
    if (isNaN(ingresoId)) {
        return { title: 'Internación' }
    }

    const ingreso = await prisma.ingreso.findUnique({
        where: { id: ingresoId },
        select: {
            nombre: true,
            paciente: {
                select: {
                    nombreCompleto: true,
                },
            },
        },
    })

    const apellido = resolverApellidoParaTitulo(
        ingreso?.paciente?.nombreCompleto ?? ingreso?.nombre ?? null
    )

    return { title: apellido ? `INT-${apellido}` : 'Internación' }
}

export default async function InternacionDetallePage({ params }: PageProps) {
    const tInicio = Date.now()
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'INTERNACION', 'LEER')) redirect('/dashboard')

    const { id } = await params
    const ingresoId = parseInt(id, 10)
    if (isNaN(ingresoId)) notFound()

    const puedeModificar =
        tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR') ||
        tienePermiso(usuario.rol, 'INTERNACION', 'CREAR') ||
        tienePermiso(usuario.rol, 'ADMISION', 'MODIFICAR') ||
        tienePermiso(usuario.rol, 'ADMISION', 'CREAR')
    const puedeCrear =
        tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR') ||
        tienePermiso(usuario.rol, 'INTERNACION', 'CREAR') ||
        tienePermiso(usuario.rol, 'ADMISION', 'MODIFICAR') ||
        tienePermiso(usuario.rol, 'ADMISION', 'CREAR')
    const puedeCambiarCama = puedeModificar
    const puedeEditarPracticas =
        puedeCrear ||
        tienePermiso(usuario.rol, 'ADMISION', 'MODIFICAR') ||
        tienePermiso(usuario.rol, 'ADMISION', 'CREAR')
    const esVistaAdmision = usuario.rol === ROLES.ADMISION

    const catalogosPromise = (async () => {
        const tCatalogosInicio = Date.now()
        const [profesionales, camasDisponibles, catalogoCobertura] = await Promise.all([
            getProfesionalesActivosCatalogo(),
            puedeCambiarCama
                ? prisma.cama.findMany({
                    where: { estado: 'DISPONIBLE' },
                    select: { id: true, identificador: true, habitacion: true, sector: true, estado: true, observaciones: true, sedeId: true, usuario: true, fechaEstado: true },
                    orderBy: [{ sector: 'asc' }, { identificador: 'asc' }],
                })
                : Promise.resolve([]),
            getCatalogoCoberturaAtencion(),
        ])

        return {
            profesionales,
            camasDisponibles,
            catalogoCobertura,
            msCatalogos: Date.now() - tCatalogosInicio,
        }
    })()

    const tDetalleInicio = Date.now()
    let detalle
    try {
        detalle = await obtenerInternacionDetalle(
            ingresoId,
            usuario.codigoUsuario,
            undefined,
            { incluirPanelClinico: false }
        )
    } catch {
        notFound()
    }
    const msDetalle = Date.now() - tDetalleInicio

    if (detalle.tipoIngresoCodigo !== 'INT') notFound()

    const [catalogosData] = await Promise.all([catalogosPromise])
    const { profesionales, camasDisponibles, catalogoCobertura, msCatalogos } = catalogosData

    const { obraSociales, planes, coseguros } = catalogoCobertura

    const camasDisponiblesSimple = camasDisponibles.map((c) => ({
        id: c.id,
        identificador: c.identificador,
        sector: c.sector,
        habitacion: c.habitacion,
    }))

    const fmtDate = (d: Date | null | undefined) =>
        formatearFechaArgentina(d, { day: 'numeric', month: 'long', year: 'numeric' })

    const fmtDateTime = (d: Date | null | undefined) =>
        formatearFechaHoraArgentina(d, {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })

    const diasEstancia = () => {
        if (!detalle.fechaIngreso) return '—'
        const dias = diferenciaDiasCalendarioArgentina(detalle.fechaIngreso, detalle.fechaEgreso ?? new Date())
        if (dias === null) return '—'
        return `${Math.max(0, dias)} días`
    }

    const estadoLabel = (e: string | null) => {
        const m: Record<string, string> = { A: 'Activo', E: 'Egresado', P: 'Pendiente', X: 'Anulado' }
        return m[e ?? ''] ?? e ?? '—'
    }

    const edad = () => {
        const fn = detalle.paciente?.fechaNacimiento
        if (!fn) return '—'
        const a = calcularEdad(fn)
        return a === null ? '—' : `${a} años`
    }

    const camasDisponiblesConOcupante = camasDisponibles.map((c) => ({
        ...c,
        ocupante: null as null,
    }))

    const matriculaTratanteDefault =
        detalle.profesionalTratante?.matricula ??
        (detalle.profesionalTratante?.id
            ? profesionales.find((p) => p.id === detalle.profesionalTratante?.id)?.matricula ?? null
            : null)

    logServerPerf('internacion.ficha', {
        ingresoId,
        msDetalle,
        msCatalogos,
        panelClinicoDiferido: 1,
        totalMs: Date.now() - tInicio,
    })

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
                            {puedeEditarPracticas && (
                                <Link
                                    href={`/dashboard/internacion/${ingresoId}/practicas`}
                                    prefetch
                                    className="flex items-center gap-1.5 text-xs font-medium border rounded-lg px-3 py-1.5 hover:bg-gray-50"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    Practicas
                                </Link>
                            )}
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

                <div className={`grid grid-cols-1 ${esVistaAdmision ? '' : 'lg:grid-cols-3'} gap-5`}>
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
                                <DataItem label="Estancia" value={diasEstancia()} />
                                {detalle.fechaEgreso && <DataItem label="Alta real" value={fmtDate(detalle.fechaEgreso)} />}
                                <DataItem label="Médico tratante" value={detalle.profesionalTratante?.nombre ? nombreProfesionalParaMostrar(detalle.profesionalTratante.nombre) : null} />
                                <DataItem label="Médico de cabecera" value={detalle.profesionalGuardia?.nombre ? nombreProfesionalParaMostrar(detalle.profesionalGuardia.nombre) : null} />
                            </dl>
                        </div>

                        <TratanteSection
                            ingresoId={ingresoId}
                            tratanteActualId={detalle.profesionalTratante?.id ?? null}
                            profesionales={profesionales}
                            historialTratantes={detalle.historialTratantes}
                            puedeModificar={puedeModificar}
                        />

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

                        {esVistaAdmision && (
                            <>
                                <SoporteRespiratorioSection
                                    ingresoId={ingresoId}
                                    observacionesIniciales={detalle.observaciones ?? null}
                                    puedeModificar={puedeModificar}
                                    profesionales={profesionales}
                                />

                                <ObservacionesSection
                                    ingresoId={ingresoId}
                                    observacionesIniciales={detalle.observaciones ?? null}
                                    puedeModificar={puedeModificar}
                                />
                            </>
                        )}

                        <DiagnosticosSection
                            ingresoId={ingresoId}
                            descripcionPatologia={detalle.descripcionPatologia}
                            diagnosticos={detalle.ingresoPatologias}
                            puedeModificar={puedeModificar}
                        />

                        {/* Cama + Transferencias */}
                        <TransferenciaCama
                            ingresoId={ingresoId}
                            camaActual={detalle.cama}
                            transferencias={detalle.transferencias}
                            camasDisponibles={camasDisponiblesConOcupante}
                            profesionales={profesionales}
                            puedeModificar={puedeCambiarCama}
                            estadoInternacion={detalle.estado}
                        />
                    </div>

                    {!esVistaAdmision && (
                        <>
                            {/* Columna central + derecha */}
                            <div className="lg:col-span-2 min-w-0 space-y-4">
                                <div id="internacion-practicas">
                                    {detalle.paciente ? (
                                        <InternacionPanelClinicoLazy
                                            ingresoId={ingresoId}
                                            pacienteId={detalle.paciente.id}
                                            convenioId={detalle.obraSocial?.id ?? null}
                                            sectorInternacionActual={detalle.cama?.sector ?? null}
                                            transferencias={detalle.transferencias}
                                            puedeEditarPracticas={puedeEditarPracticas}
                                            puedeCrearCirugia={puedeCrear}
                                            obraSociales={obraSociales}
                                            planes={planes}
                                            coseguros={coseguros}
                                            camasDisponibles={camasDisponiblesSimple}
                                            matriculaTratanteDefault={matriculaTratanteDefault}
                                        />
                                    ) : (
                                        <div className="his-card p-4 text-sm text-gray-500">
                                            No hay paciente asociado para mostrar panel clinico.
                                        </div>
                                    )}
                                </div>

                                <ViasSection
                                    ingresoId={ingresoId}
                                    numeroIngreso={detalle.numeroIngreso}
                                    profesionales={profesionales}
                                    puedeCrear={puedeCrear}
                                />

                                <SoporteRespiratorioSection
                                    ingresoId={ingresoId}
                                    observacionesIniciales={detalle.observaciones ?? null}
                                    puedeModificar={puedeModificar}
                                    profesionales={profesionales}
                                />

                                <ObservacionesSection
                                    ingresoId={ingresoId}
                                    observacionesIniciales={detalle.observaciones ?? null}
                                    puedeModificar={puedeModificar}
                                />
                            </div>
                        </>
                    )}
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
