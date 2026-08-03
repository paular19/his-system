'use client'

import { useEffect, useMemo, useState } from 'react'
import { PracticaSection } from '@/components/internacion/practica-section'
import { CirugiaUrgenciaSection } from '@/components/internacion/cirugia-urgencia-section'
import Link from 'next/link'

type SectorPracticaFiltro = 'UTI' | 'PISO'

type TransferenciaLite = {
  fecha: Date | string
  camaOrigen: { sector: string } | null
  camaDestino: { sector: string } | null
}

type PracticaLite = {
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
}

type PracticaApi = {
  id: number
  ingresoId: number
  convenioId: number
  codigoPractica: string
  descripcionPractica: string | null
  numeroProtocoloLaboratorio?: string | null
  diagnosticoLaboratorio?: string | null
  fecha: string
  cantidad: number
  importeTotal?: number | null
  numeroAutorizacion: string | null
  matriculaEspecialista?: number | null
  matriculaAnestesista?: number | null
  puestoNumero?: number | null
  ordenNumero?: number | null
  ordenItem?: number | null
  facturada?: boolean
  ordenPractica: Array<{
    puestoNumero: number
    ordenNumero: number
    item: number
    numeroAutorizacion: string | null
  }>
  facturable: boolean
  estado: string | null
  usuario: string
}

type CirugiaApi = {
  id: number
  fechaCirugia: string
  horaCirugia: string | null
  numeroAutorizacion: string | null
  observaciones: string | null
  cama: {
    id: number
    identificador: string
    sector: string
    habitacion: string | null
  } | null
  practicas: Array<{
    id: number
    codigo: string
    descripcion: string
    cantidad: number
    numeroAutorizacion: string | null
  }>
  diferenciales: Array<{
    esFeriado: boolean
    esNocturna: boolean
    mismaViaPatologia: boolean
    diferentesViasPatologia: boolean
    diferentesViasDiferentesPatologia: boolean
    dobleCirugia?: boolean
  }>
}

type PracticaEspejoApi = {
  id: number
  codigoPractica: string
  fecha: string
  cantidad: number
  numeroAutorizacion: string | null
  facturable: boolean
  puestoNumero: number | null
  ordenNumero: number | null
  estado: string | null
  usuarioRegistro: string
  matriculaEspecialista: number | null
  matriculaAnestesista: number | null
  ordenPractica: Array<{
    puestoNumero: number
    ordenNumero: number
    item: number
    numeroAutorizacion: string | null
  }>
}

interface InternacionPanelClinicoLazyProps {
  ingresoId: number
  pacienteId: number | null
  convenioId: number | null
  sectorInternacionActual: string | null
  transferencias: TransferenciaLite[]
  puedeEditarPracticas: boolean
  puedeCrearCirugia: boolean
  obraSociales: Array<{ id: number; nombre: string; requiereCoseguro: boolean }>
  planes: Array<{ id: number; obraSocialId: number | null; nombre: string }>
  coseguros: Array<{ id: number; nombre: string }>
  camasDisponibles: Array<{ id: number; identificador: string; sector: string; habitacion: string | null }>
  matriculaTratanteDefault: number | null
}

function esSectorUti(sector: string | null | undefined): boolean {
  const normalized = (sector ?? '').trim().toUpperCase()
  return normalized === 'CU' || normalized === 'UTI' || normalized === 'TERAPIA_INTENSIVA'
}

function resolverSectorPorFecha(
  fechaPractica: Date | string,
  transferencias: TransferenciaLite[],
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

function parsePracticas(practicas: PracticaApi[]): PracticaApi[] {
  return practicas.map((item) => ({
    ...item,
    fecha: new Date(item.fecha).toISOString(),
  }))
}

function parseCirugias(cirugias: CirugiaApi[]): CirugiaApi[] {
  return cirugias.map((item) => ({
    ...item,
    fechaCirugia: new Date(item.fechaCirugia).toISOString(),
  }))
}

function parseEspejo(practicas: PracticaEspejoApi[]): PracticaEspejoApi[] {
  return practicas.map((item) => ({
    ...item,
    fecha: new Date(item.fecha).toISOString(),
  }))
}

export function InternacionPanelClinicoLazy({
  ingresoId,
  pacienteId,
  convenioId,
  sectorInternacionActual,
  transferencias,
  puedeEditarPracticas,
  puedeCrearCirugia,
  obraSociales,
  planes,
  coseguros,
  camasDisponibles,
  matriculaTratanteDefault,
}: InternacionPanelClinicoLazyProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [practicas, setPracticas] = useState<PracticaApi[]>([])
  const [cirugias, setCirugias] = useState<CirugiaApi[]>([])
  const [practicasCirugiaEspejo, setPracticasCirugiaEspejo] = useState<PracticaEspejoApi[]>([])

  const cargar = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/internacion/${ingresoId}/panel-clinico`, {
        method: 'GET',
        cache: 'no-store',
      })
      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.data) {
        throw new Error(json?.error ?? 'No se pudo cargar el panel clinico')
      }

      setPracticas(parsePracticas(json.data.practicas ?? []))
      setCirugias(parseCirugias(json.data.cirugiasUrgencia ?? []))
      setPracticasCirugiaEspejo(parseEspejo(json.data.practicasCirugiaEspejo ?? []))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el panel clinico')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingresoId])

  const practicasInternacionParaCirugia = useMemo(() => {
    const map = new Map<number, PracticaLite>()

    for (const practica of practicas) {
      map.set(practica.id, {
        id: practica.id,
        codigoPractica: practica.codigoPractica,
        fecha: new Date(practica.fecha),
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
      if (map.has(practica.id)) continue

      map.set(practica.id, {
        id: practica.id,
        codigoPractica: practica.codigoPractica,
        fecha: new Date(practica.fecha),
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

    return Array.from(map.values())
  }, [practicas, practicasCirugiaEspejo])

  const sectorPorPracticaId = useMemo(() => {
    return Object.fromEntries(
      practicasInternacionParaCirugia.map((practica) => [
        practica.id,
        resolverSectorPorFecha(practica.fecha, transferencias, sectorInternacionActual),
      ])
    ) as Record<number, SectorPracticaFiltro>
  }, [practicasInternacionParaCirugia, transferencias, sectorInternacionActual])

  if (loading) {
    return (
      <div className="space-y-4">
        {puedeEditarPracticas && (
          <div className="his-card border border-blue-100 bg-blue-50/60 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-700">Atajo de carga</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Link
                href={`/dashboard/internacion/${ingresoId}/practicas`}
                prefetch
                className="inline-flex items-center rounded-md border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
              >
                Agregar practicas
              </Link>
              <span className="text-xs text-blue-700">El panel clinico sigue cargando en segundo plano.</span>
            </div>
          </div>
        )}
        <div className="his-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Cargando practicas</p>
          <div className="mt-3 h-16 animate-pulse rounded-md bg-gray-100" />
        </div>
        <div className="his-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Cargando cirugia</p>
          <div className="mt-3 h-16 animate-pulse rounded-md bg-gray-100" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="his-card p-4">
        <p className="text-sm font-medium text-red-700">No se pudo cargar el panel clinico.</p>
        <p className="mt-1 text-xs text-red-600">{error}</p>
        <button
          type="button"
          onClick={() => void cargar()}
          className="mt-3 rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
        >
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <>
      <div id="internacion-practicas">
        <PracticaSection
          ingresoId={ingresoId}
          convenioId={convenioId}
          sectorInternacionActual={sectorInternacionActual}
          sectorPorPracticaId={sectorPorPracticaId}
          practicas={practicas.map((item) => ({
            ...item,
            fecha: new Date(item.fecha),
          }))}
          puedeCrear={puedeEditarPracticas}
          matriculaTratanteDefault={matriculaTratanteDefault}
        />
      </div>

      <div id="internacion-cirugia">
        <CirugiaUrgenciaSection
          ingresoId={ingresoId}
          pacienteId={pacienteId}
          sectorInternacionActual={sectorInternacionActual}
          sectorPorPracticaId={sectorPorPracticaId}
          puedeCrear={puedeCrearCirugia}
          obraSociales={obraSociales}
          planes={planes}
          coseguros={coseguros}
          camasDisponibles={camasDisponibles}
          cirugias={cirugias.map((item) => ({
            ...item,
            fechaCirugia: new Date(item.fechaCirugia),
          }))}
          practicasInternacion={practicasInternacionParaCirugia}
          matriculaTratanteDefault={matriculaTratanteDefault}
        />
      </div>
    </>
  )
}