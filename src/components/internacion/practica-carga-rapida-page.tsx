'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, ClipboardList } from 'lucide-react'
import { PracticaCargaForm, type PracticaCargaEntrada } from '@/components/internacion/practica-carga-form'
import type { PracticaItem } from '@/modules/internacion/types'
import { formatearFechaArgentina } from '@/lib/utils/argentina-date'

type GuardadaSesionItem = {
    id: string
    codigo: string
    descripcion: string
    cantidad: number
    clasificacion: string
    fecha: string
}

interface PracticaCargaRapidaPageProps {
    ingresoId: number
    convenioId: number | null
    sectorInternacionActual?: string | null
    matriculaTratanteDefault?: number | null
    puedeCrear: boolean
    practicasIniciales: PracticaItem[]
}

function practicaActiva(estado: string | null | undefined): boolean {
    return (estado?.trim().toUpperCase() ?? 'A') !== 'X'
}

function descripcionParaMostrar(practica: Pick<PracticaItem, 'descripcionPractica' | 'codigoPractica'>): string {
    const descripcion = practica.descripcionPractica?.trim()
    if (descripcion && descripcion.length > 0) return descripcion
    return practica.codigoPractica.trim()
}

export function PracticaCargaRapidaPage({
    ingresoId,
    convenioId,
    sectorInternacionActual,
    matriculaTratanteDefault,
    puedeCrear,
    practicasIniciales,
}: PracticaCargaRapidaPageProps) {
    const [practicas, setPracticas] = useState<PracticaItem[]>(
        practicasIniciales
            .filter((practica) => practicaActiva(practica.estado))
            .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
    )
    const [guardadasSesion, setGuardadasSesion] = useState<GuardadaSesionItem[]>([])
    const [mensajeError, setMensajeError] = useState<string | null>(null)

    const practicasRecientes = useMemo(() => practicas.slice(0, 18), [practicas])

    const registrarGuardadasSesion = (creadas: PracticaItem[], entradasCrear: PracticaCargaEntrada[]) => {
        if (creadas.length === 0) return

        const nuevas = creadas.map((practicaCreada, idx) => {
            const entrada = entradasCrear[idx]
            return {
                id: `${practicaCreada.id}-${Date.now()}-${idx}`,
                codigo: practicaCreada.codigoPractica.trim(),
                descripcion: descripcionParaMostrar(practicaCreada),
                cantidad: Number(practicaCreada.cantidad),
                clasificacion: entrada?.clasificacion ?? 'HE',
                fecha: formatearFechaArgentina(practicaCreada.fecha, {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                }),
            }
        })

        setGuardadasSesion((prev) => [...nuevas, ...prev])
    }

    const handleGuardarPracticas = async (entradasCrear: PracticaCargaEntrada[]) => {
        setMensajeError(null)

        try {
            const practicasCreadas: PracticaItem[] = []

            for (const entrada of entradasCrear) {
                const res = await fetch(`/api/internacion/${ingresoId}/practicas`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(entrada.payload),
                })
                const json = await res.json().catch(() => null)
                if (!res.ok) {
                    if (practicasCreadas.length > 0) {
                        setPracticas((prev) => [...practicasCreadas, ...prev])
                        registrarGuardadasSesion(practicasCreadas, entradasCrear)
                    }
                    const mensaje = json?.error ?? 'No se pudo registrar la practica'
                    setMensajeError(mensaje)
                    return { ok: false, error: mensaje }
                }

                practicasCreadas.push(json.data as PracticaItem)
            }

            setPracticas((prev) => [...practicasCreadas, ...prev])
            registrarGuardadasSesion(practicasCreadas, entradasCrear)
            return { ok: true }
        } catch {
            const mensaje = 'Error de conexion al guardar practicas'
            setMensajeError(mensaje)
            return { ok: false, error: mensaje }
        }
    }

    return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-4">
                {puedeCrear ? (
                    <PracticaCargaForm
                        convenioId={convenioId}
                        sectorInternacionActual={sectorInternacionActual}
                        matriculaTratanteDefault={matriculaTratanteDefault}
                        onGuardar={handleGuardarPracticas}
                        titulo="Carga rapida de practicas"
                        modoCargaRapida
                        autoFocusBusqueda
                        soloFechaPractica
                    />
                ) : (
                    <div className="his-card p-4 text-sm text-gray-700">
                        No tenes permisos para cargar practicas en esta internacion.
                    </div>
                )}

                {mensajeError && (
                    <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                        {mensajeError}
                    </p>
                )}

                <div className="his-card p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-gray-900">Ultimas practicas registradas</h3>
                        <span className="text-xs text-gray-500">{practicas.length} activas</span>
                    </div>

                    {practicasRecientes.length === 0 ? (
                        <p className="text-xs text-gray-500">No hay practicas activas registradas.</p>
                    ) : (
                        <div className="space-y-2">
                            {practicasRecientes.map((practica) => (
                                <div
                                    key={practica.id}
                                    className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2"
                                >
                                    <span className="rounded bg-white px-2 py-1 font-mono text-xs font-semibold text-gray-700 border border-gray-200">
                                        {practica.codigoPractica.trim()}
                                    </span>
                                    <span className="text-sm text-gray-800">
                                        {descripcionParaMostrar(practica)}
                                    </span>
                                    <span className="text-xs text-gray-500">Cant: {Number(practica.cantidad)}</span>
                                    <span className="text-xs text-gray-500">
                                        Fecha: {formatearFechaArgentina(practica.fecha, {
                                            day: '2-digit',
                                            month: '2-digit',
                                            year: 'numeric',
                                        })}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-4">
                <div className="his-card p-4 space-y-3">
                    <div className="flex items-center gap-2">
                        <ClipboardList className="h-4 w-4 text-blue-600" />
                        <h3 className="text-sm font-semibold text-gray-900">Codigos agregados en esta sesion</h3>
                    </div>
                    <p className="text-xs text-gray-600">
                        Este panel confirma al instante cada codigo guardado para validar la carga sin perder ritmo.
                    </p>

                    {guardadasSesion.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-500">
                            Todavia no agregaste practicas en esta sesion.
                        </p>
                    ) : (
                        <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
                            {guardadasSesion.map((item) => (
                                <div key={item.id} className="rounded-lg border border-blue-100 bg-blue-50/50 p-2.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="rounded bg-white px-2 py-1 font-mono text-xs font-semibold text-blue-700 border border-blue-100">
                                            {item.codigo}
                                        </span>
                                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                            Guardada
                                        </span>
                                    </div>
                                    <p className="mt-1 text-xs text-gray-700">{item.descripcion}</p>
                                    <p className="mt-1 text-[11px] text-gray-600">
                                        Cant: {item.cantidad} · Clasif: {item.clasificacion} · Fecha: {item.fecha}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
