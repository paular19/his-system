'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BuscarPaciente } from '@/components/admision/buscar-paciente'
import type { PacienteResumen } from '@/modules/admision/types'
import type { CamaConOcupante } from '@/modules/internacion/types'
import { SECTOR_LABEL } from '@/modules/internacion/types'
import { BedDouble } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface ProfesionalOption {
  id: number
  nombre: string
}

interface ObraSocialOption {
  id: number
  nombre: string
  requiereCoseguro: boolean
}

interface PlanOption {
  id: number
  nombre: string
  obraSocialId: number | null
}

interface InternacionFormProps {
  profesionales: ProfesionalOption[]
  obraSociales: ObraSocialOption[]
  planes: PlanOption[]
  camasDisponibles: CamaConOcupante[]
  pacienteInicial?: PacienteResumen | null
  camaInicial?: number | null
}

function hoyLocalInput(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function InternacionForm({
  profesionales,
  obraSociales,
  planes,
  camasDisponibles,
  pacienteInicial,
  camaInicial,
}: InternacionFormProps) {
  const router = useRouter()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paciente, setPaciente] = useState<PacienteResumen | null>(pacienteInicial ?? null)

  const [fechaIngreso, setFechaIngreso] = useState(hoyLocalInput())
  const [fechaEgresoPrevista, setFechaEgresoPrevista] = useState('')
  const [camaId, setCamaId] = useState(camaInicial?.toString() ?? '')
  const [profesionalGuardiaId, setProfesionalGuardiaId] = useState('')
  const [profesionalTratanteId, setProfesionalTratanteId] = useState('')
  const [obraSocialId, setObraSocialId] = useState(
    pacienteInicial?.obraSocialId?.toString() ?? ''
  )
  const [planId, setPlanId] = useState('')
  const [numeroAfiliado, setNumeroAfiliado] = useState(pacienteInicial?.numeroAfiliado ?? '')
  const [descripcionPatologia, setDescripcionPatologia] = useState('')
  const [observaciones, setObservaciones] = useState('')

  const planesDisponibles = (() => {
    const filtered = obraSocialId
      ? planes.filter((p) => String(p.obraSocialId ?? '') === obraSocialId)
      : planes
    const seen = new Set<number>()
    return filtered.filter((p) => {
      if (seen.has(p.id)) return false
      seen.add(p.id)
      return true
    })
  })()

  const camaSeleccionada = camasDisponibles.find((c) => c.id.toString() === camaId)

  const handleSeleccionarPaciente = (p: PacienteResumen | null) => {
    setPaciente(p)
    if (p) {
      setObraSocialId(p.obraSocialId ? p.obraSocialId.toString() : '')
      setPlanId('')
      setNumeroAfiliado(p.numeroAfiliado ?? '')
    } else {
      setObraSocialId('')
      setPlanId('')
      setNumeroAfiliado('')
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!paciente) {
      setError('Seleccione un paciente')
      return
    }

    setGuardando(true)
    setError(null)

    try {
      const body = {
        tipoIngresoCodigo: 'INT',
        subtipoAdmisionCodigo: null,
        pacienteId: paciente.id,
        fechaIngreso: fechaIngreso || undefined,
        fechaEgresoPrevista: fechaEgresoPrevista || undefined,
        camaId: camaId ? parseInt(camaId, 10) : undefined,
        profesionalGuardiaId: profesionalGuardiaId ? parseInt(profesionalGuardiaId, 10) : undefined,
        profesionalTratanteId: profesionalTratanteId
          ? parseInt(profesionalTratanteId, 10)
          : undefined,
        obraSocialId: obraSocialId ? parseInt(obraSocialId, 10) : undefined,
        planId: planId ? parseInt(planId, 10) : undefined,
        numeroAfiliado: numeroAfiliado || undefined,
        descripcionPatologia: descripcionPatologia || undefined,
        observaciones: observaciones || undefined,
      }

      const res = await fetch('/api/admision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Error al crear la internación')
      }

      const { data: ingreso } = await res.json()

      // Marcar la cama como OCUPADA
      if (camaId) {
        await fetch(`/api/internacion/camas/${camaId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado: 'OCUPADA' }),
        })
      }

      router.push(`/dashboard/internacion/${ingreso.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setGuardando(false)
    }
  }

  if (guardando) {
    return (
      <div className="p-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <Skeleton className="h-8 w-1/2 mb-4" />
          <Skeleton className="h-6 w-full mb-2" />
          <Skeleton className="h-6 w-full mb-2" />
          <Skeleton className="h-6 w-2/3" />
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Paciente */}
      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Paciente</h3>
        <BuscarPaciente
          pacienteSeleccionado={paciente}
          onSeleccionar={handleSeleccionarPaciente}
        />
      </div>

      {/* Datos de internación */}
      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Datos de internación</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Fecha de ingreso <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              required
              value={fechaIngreso}
              onChange={(e) => setFechaIngreso(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Alta prevista
            </label>
            <input
              type="date"
              value={fechaEgresoPrevista}
              onChange={(e) => setFechaEgresoPrevista(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Médico de guardia
            </label>
            <select
              value={profesionalGuardiaId}
              onChange={(e) => setProfesionalGuardiaId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">— Seleccionar —</option>
              {profesionales.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Médico tratante
            </label>
            <select
              value={profesionalTratanteId}
              onChange={(e) => setProfesionalTratanteId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">— Seleccionar —</option>
              {profesionales.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Diagnóstico / Motivo de internación
            </label>
            <textarea
              value={descripcionPatologia}
              onChange={(e) => setDescripcionPatologia(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm resize-none h-20"
              placeholder="Describe el motivo de la internación..."
            />
          </div>
        </div>
      </div>

      {/* Selección de cama */}
      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Asignación de cama</h3>

        {camasDisponibles.length === 0 ? (
          <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">
            No hay camas disponibles en este momento.
          </p>
        ) : (
          <>
            <select
              value={camaId}
              onChange={(e) => setCamaId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white mb-3"
            >
              <option value="">— Sin asignar —</option>
              {Object.entries(
                camasDisponibles.reduce<Record<string, CamaConOcupante[]>>((acc, cama) => {
                  const key = cama.sector
                  if (!acc[key]) acc[key] = []
                  acc[key].push(cama)
                  return acc
                }, {})
              ).map(([sector, camas]) => (
                <optgroup key={sector} label={SECTOR_LABEL[sector] ?? sector}>
                  {camas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.identificador}
                      {c.habitacion ? ` — Hab. ${c.habitacion}` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {camaSeleccionada && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <BedDouble className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-700 font-medium">
                  Cama {camaSeleccionada.identificador} seleccionada —{' '}
                  {SECTOR_LABEL[camaSeleccionada.sector] ?? camaSeleccionada.sector}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Cobertura médica */}
      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Cobertura médica</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Obra social</label>
            <select
              value={obraSocialId}
              onChange={(e) => {
                setObraSocialId(e.target.value)
                setPlanId('')
              }}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">— Sin cobertura —</option>
              {obraSociales.map((os) => (
                <option key={os.id} value={os.id}>{os.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Plan</label>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              disabled={!obraSocialId}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white disabled:bg-gray-50"
            >
              <option value="">— Seleccionar plan —</option>
              {planesDisponibles.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nro. afiliado</label>
            <input
              type="text"
              value={numeroAfiliado}
              onChange={(e) => setNumeroAfiliado(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="Número de afiliado"
            />
          </div>
        </div>
      </div>

      {/* Observaciones */}
      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Observaciones</h3>
        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm resize-none h-20"
          placeholder="Observaciones adicionales..."
        />
      </div>

      {/* Acciones */}
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={guardando}
          className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={guardando || !paciente}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {guardando ? 'Guardando...' : 'Crear internación'}
        </button>
      </div>
    </form>
  )
}
