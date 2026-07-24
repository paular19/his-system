import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { ROLES, tienePermiso } from '@/lib/auth/rbac'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { obtenerInternacionDetalle } from '@/modules/internacion/service'
import { TransferenciaCama } from '@/components/internacion/transferencia-cama'
import { PracticaSection } from '@/components/internacion/practica-section'
import { DiagnosticosSection } from '@/components/internacion/diagnosticos-section'
import { TratanteSection } from '@/components/internacion/tratante-section'
import { CirugiaUrgenciaSection } from '@/components/internacion/cirugia-urgencia-section'
import { ObservacionesSection } from '@/components/internacion/observaciones-section'
import { ViasSection } from '@/components/internacion/vias-section'
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

type SectorPracticaFiltro = 'UTI' | 'PISO'

function esSectorUti(sector: string | null | undefined): boolean {
    const normalized = (sector ?? '').trim().toUpperCase()
    return normalized === 'CU' || normalized === 'UTI' || normalized === 'TERAPIA_INTENSIVA'
}

function resolverSectorPorFecha(
    fechaPractica: Date | string,
    transferencias: Array<{
        fecha: Date
        camaOrigen: { sector: string } | null
        camaDestino: { sector: string } | null
    }>,
    sectorActual: string | null | undefined
): SectorPracticaFiltro {
    const practicaMs = new Date(fechaPractica).getTime()
    const transferenciasOrdenadas = [...transferencias]
        .filter((item) => Number.isFinite(new Date(item.fecha).getTime()))
        .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())

    let sectorVigente: string | null | undefined =
        transferenciasOrdenadas[0]?.camaOrigen?.sector ??
        transferenciasOrdenadas[0]?.camaDestino?.sector ??
        sectorActual

    for (const transferencia of transferenciasOrdenadas) {
        const transferenciaMs = new Date(transferencia.fecha).getTime()
        if (!Number.isFinite(transferenciaMs) || transferenciaMs > practicaMs) break
        sectorVigente = transferencia.camaDestino?.sector ?? sectorVigente
    }

    return esSectorUti(sectorVigente) ? 'UTI' : 'PISO'
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

    return { title: apellido ? `Internación - ${apellido}` : 'Internación' }
}

export default async function InternacionDetallePage({ params }: PageProps) {
    const tInicio = Date.now()
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'INTERNACION', 'LEER')) redirect('/dashboard')

    const { id } = await params
    const ingresoId = parseInt(id, 10)
    if (isNaN(ingresoId)) notFound()

    const puedeModificar = tienePermiso(usuario.rol, 'INTERNACION', 'MODIFICAR')
    const puedeCrear = puedeModificar || tienePermiso(usuario.rol, 'INTERNACION', 'CREAR')
    const puedeCambiarCama = puedeModificar || tienePermiso(usuario.rol, 'INTERNACION', 'CREAR')
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

    const practicasCirugiaEspejoPromise = (async () => {
        const tEspejoCirugiaInicio = Date.now()
        const practicasCirugiaEspejo = esVistaAdmision
            ? []
            : await prisma.practica.findMany({
                where: {
                    ingresoId,
                    OR: [{ estado: 'A' }, { estado: null }],
                    usuarioRegistro: 'CIRUGIA',
                },
                select: {
                    id: true,
                    codigoPractica: true,
                    fecha: true,
                    cantidad: true,
                    numeroAutorizacion: true,
                    facturable: true,
                    puestoNumero: true,
                    ordenNumero: true,
                    estado: true,
                    usuarioRegistro: true,
                    matriculaEspecialista: true,
                    matriculaAnestesista: true,
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
                orderBy: { id: 'asc' },
            })

        return {
            practicasCirugiaEspejo,
            msEspejoCirugia: Date.now() - tEspejoCirugiaInicio,
        }
    })()

    const tDetalleInicio = Date.now()
    let detalle
    try {
        detalle = await obtenerInternacionDetalle(ingresoId, usuario.codigoUsuario)
    } catch {
        notFound()
    }
    const msDetalle = Date.now() - tDetalleInicio

    if (detalle.tipoIngresoCodigo !== 'INT') notFound()

    const [catalogosData, espejoData] = await Promise.all([catalogosPromise, practicasCirugiaEspejoPromise])
    const { profesionales, camasDisponibles, catalogoCobertura, msCatalogos } = catalogosData
    const { practicasCirugiaEspejo, msEspejoCirugia } = espejoData

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

    const practicasInternacionParaCirugiaMap = new Map<number, {
        id: number
        codigoPractica: string
        fecha: Date
        cantidad: number
        numeroAutorizacion: string | null
        facturable: boolean
        facturada: boolean
        estado: string | null
        usuario: string | null
        matriculaEspecialista: number | null
        matriculaAnestesista: number | null
        ordenPractica: Array<{
            puestoNumero: number
            ordenNumero: number
            item: number
            numeroAutorizacion: string | null
        }>
    }>()

    for (const practica of detalle.practicas) {
        practicasInternacionParaCirugiaMap.set(practica.id, {
            id: practica.id,
            codigoPractica: practica.codigoPractica,
            fecha: practica.fecha,
            cantidad: Number(practica.cantidad),
            numeroAutorizacion: practica.numeroAutorizacion ?? null,
            facturable: Boolean(practica.facturable),
            facturada: Boolean(practica.facturada),
            estado: practica.estado,
            usuario: practica.usuario ?? null,
            matriculaEspecialista: practica.matriculaEspecialista ?? null,
            matriculaAnestesista: practica.matriculaAnestesista ?? null,
            ordenPractica: Array.isArray(practica.ordenPractica) ? practica.ordenPractica : [],
        })
    }

    for (const practica of practicasCirugiaEspejo) {
        if (practicasInternacionParaCirugiaMap.has(practica.id)) continue

        practicasInternacionParaCirugiaMap.set(practica.id, {
            id: practica.id,
            codigoPractica: practica.codigoPractica,
            fecha: practica.fecha,
            cantidad: Number(practica.cantidad),
            numeroAutorizacion: practica.numeroAutorizacion ?? null,
            facturable: Boolean(practica.facturable),
            facturada: Boolean(
                practica.puestoNumero != null &&
                practica.ordenNumero != null &&
                Number(practica.puestoNumero) > 0 &&
                Number(practica.ordenNumero) > 0
            ),
            estado: practica.estado,
            usuario: practica.usuarioRegistro,
            matriculaEspecialista: practica.matriculaEspecialista ?? null,
            matriculaAnestesista: practica.matriculaAnestesista ?? null,
            ordenPractica: practica.ordenPractica.map((orden) => ({
                puestoNumero: orden.puestoNumero,
                ordenNumero: orden.ordenNumero,
                item: orden.item,
                numeroAutorizacion: orden.numeroAutorizacion,
            })),
        })
    }

    const practicasInternacionParaCirugia = Array.from(practicasInternacionParaCirugiaMap.values())
    const sectorPorPracticaId = Object.fromEntries(
        practicasInternacionParaCirugia.map((practica) => [
            practica.id,
            resolverSectorPorFecha(practica.fecha, detalle.transferencias, detalle.cama?.sector ?? null),
        ])
    ) as Record<number, SectorPracticaFiltro>

    logServerPerf('internacion.ficha', {
        ingresoId,
        msDetalle,
        msCatalogos,
        msEspejoCirugia,
        practicas: detalle.practicas.length,
        cirugias: detalle.cirugiasUrgencia.length,
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
                                <DataItem label="Alta prevista" value={fmtDate(detalle.fechaEgresoPrevista)} />
                                <DataItem label="Estancia" value={diasEstancia()} />
                                {detalle.fechaEgreso && <DataItem label="Alta real" value={fmtDate(detalle.fechaEgreso)} />}
                                <DataItem label="Médico guardia" value={detalle.profesionalGuardia?.nombre ? nombreProfesionalParaMostrar(detalle.profesionalGuardia.nombre) : null} />
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

                        <ObservacionesSection
                            ingresoId={ingresoId}
                            observacionesIniciales={detalle.observaciones ?? null}
                            puedeModificar={puedeModificar}
                        />

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
                                    <PracticaSection
                                        ingresoId={ingresoId}
                                        convenioId={detalle.obraSocial?.id ?? null}
                                        sectorInternacionActual={detalle.cama?.sector ?? null}
                                        sectorPorPracticaId={sectorPorPracticaId}
                                        practicas={detalle.practicas}
                                        puedeCrear={puedeEditarPracticas}
                                        matriculaTratanteDefault={matriculaTratanteDefault}
                                    />
                                </div>

                                <ViasSection
                                    ingresoId={ingresoId}
                                    numeroIngreso={detalle.numeroIngreso}
                                    profesionales={profesionales}
                                    puedeCrear={puedeCrear}
                                />

                                {/* Secciones pausadas temporalmente por flujo actual:
                                - Evolucion Clinica
                                - Medicaciones
                                - Descartables */}

                                {detalle.paciente && (
                                    <div id="internacion-cirugia">
                                        <CirugiaUrgenciaSection
                                            ingresoId={ingresoId}
                                            pacienteId={detalle.paciente.id}
                                            sectorInternacionActual={detalle.cama?.sector ?? null}
                                            sectorPorPracticaId={sectorPorPracticaId}
                                            puedeCrear={puedeCrear}
                                            obraSociales={obraSociales}
                                            planes={planes}
                                            coseguros={coseguros}
                                            camasDisponibles={camasDisponiblesSimple}
                                            cirugias={detalle.cirugiasUrgencia}
                                            practicasInternacion={practicasInternacionParaCirugia}
                                            matriculaTratanteDefault={matriculaTratanteDefault}
                                        />
                                    </div>
                                )}
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
