'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BedDouble } from 'lucide-react'
import { BuscarPaciente } from '@/components/admision/buscar-paciente'
import { Skeleton } from '@/components/ui/skeleton'
import { ProfesionalSelect } from '@/components/ui/profesional-select'
import type { PacienteResumen } from '@/modules/admision/types'
import type { CamaConOcupante } from '@/modules/internacion/types'
import { SECTOR_LABEL } from '@/modules/internacion/types'

interface ProfesionalOption {
  id: number
  nombre: string
  matricula?: number | null
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

function ahoraLocalDateTimeInput(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d}T${hh}:${mm}`
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
  const submitEnCursoRef = useRef(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paciente, setPaciente] = useState<PacienteResumen | null>(pacienteInicial ?? null)

  const [fechaIngreso, setFechaIngreso] = useState(ahoraLocalDateTimeInput())
  const [fechaEgresoPrevista, setFechaEgresoPrevista] = useState('')
  const [camaId, setCamaId] = useState(camaInicial?.toString() ?? '')
  const [profesionalGuardiaId, setProfesionalGuardiaId] = useState('')
  const [profesionalTratanteId, setProfesionalTratanteId] = useState('')
  const [esCirugiaProgramada, setEsCirugiaProgramada] = useState(false)
  const [fechaCirugiaProgramada, setFechaCirugiaProgramada] = useState(ahoraLocalDateTimeInput())
  const [obraSocialId, setObraSocialId] = useState(pacienteInicial?.obraSocialId?.toString() ?? '')
  const [planId, setPlanId] = useState(pacienteInicial?.planId?.toString() ?? '')
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
      setPlanId(p.planId ? p.planId.toString() : '')
      setNumeroAfiliado(p.numeroAfiliado ?? '')
    } else {
      setObraSocialId('')
      setPlanId('')
      setNumeroAfiliado('')
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (submitEnCursoRef.current || guardando) return

    if (!paciente) {
      setError('Seleccione un paciente')
      return
    }

    if (!profesionalTratanteId) {
      setError('Debe asignar un medico de cabecera')
      return
    }

    if (esCirugiaProgramada && !camaId) {
      setError('Para cirugia programada debe seleccionar una cama')
      return
    }

    if (esCirugiaProgramada && !fechaCirugiaProgramada) {
      setError('Debe completar fecha y hora de la cirugia programada')
      return
    }

    submitEnCursoRef.current = true
    setGuardando(true)
    setError(null)

    try {
      const body = {
        tipoIngresoCodigo: 'INT',
        subtipoAdmisionCodigo: esCirugiaProgramada ? 'PRG' : null,
        pacienteId: paciente.id,
        fechaIngreso: fechaIngreso || undefined,
        fechaEgresoPrevista: fechaEgresoPrevista || undefined,
        fechaTurno: esCirugiaProgramada ? fechaCirugiaProgramada : undefined,
        camaId: camaId ? parseInt(camaId, 10) : undefined,
        profesionalGuardiaId: profesionalGuardiaId ? parseInt(profesionalGuardiaId, 10) : undefined,
        profesionalTratanteId: parseInt(profesionalTratanteId, 10),
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
        throw new Error(data.error ?? 'Error al crear la internacion')
      }

      const { data: ingreso } = await res.json()
      router.push(`/dashboard/internacion/${ingreso.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
      submitEnCursoRef.current = false
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

      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Paciente</h3>
        <BuscarPaciente
          pacienteSeleccionado={paciente}
          onSeleccionar={handleSeleccionarPaciente}
        />
      </div>

      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Datos de internacion</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Fecha y hora de ingreso <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
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
              Medico de guardia
            </label>
            <ProfesionalSelect
              profesionales={profesionales}
              value={profesionalGuardiaId}
              onChange={setProfesionalGuardiaId}
              placeholderOption="— Seleccionar —"
              selectClassName="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Medico de cabecera <span className="text-red-500">*</span>
            </label>
            <ProfesionalSelect
              profesionales={profesionales}
              value={profesionalTratanteId}
              onChange={setProfesionalTratanteId}
              placeholderOption="— Seleccionar medico de cabecera —"
              selectClassName="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Diagnostico / Motivo de internacion
            </label>
            <textarea
              value={descripcionPatologia}
              onChange={(e) => setDescripcionPatologia(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm resize-none h-20"
              placeholder="Describe el motivo de la internacion..."
            />
          </div>
        </div>
      </div>

      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Asignacion de cama</h3>

        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <label className="flex items-center gap-2 text-sm text-amber-900">
            <input
              type="checkbox"
              checked={esCirugiaProgramada}
              onChange={(e) => setEsCirugiaProgramada(e.target.checked)}
              className="h-4 w-4 rounded border-amber-300"
            />
            Internacion por cirugia programada (reserva de cama)
          </label>
          {esCirugiaProgramada && (
            <div className="mt-3 max-w-sm">
              <label className="block text-xs font-medium text-amber-900 mb-1">
                Fecha y hora de la cirugia <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={fechaCirugiaProgramada}
                onChange={(e) => setFechaCirugiaProgramada(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
              />
              <p className="mt-1 text-xs text-amber-800">
                La cama quedara en estado reservada para esta internacion.
              </p>
            </div>
          )}
        </div>

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
                  {esCirugiaProgramada ? ' (se reservara)' : ''}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Cobertura medica</h3>
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
              placeholder="Numero de afiliado"
            />
          </div>
        </div>
      </div>

      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Observaciones</h3>
        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm resize-none h-20"
          placeholder="Observaciones adicionales..."
        />
      </div>

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
          {guardando ? 'Guardando...' : 'Crear internacion'}
        </button>
      </div>
    </form>
  )
}
