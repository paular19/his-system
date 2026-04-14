'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Plus, X, Loader2 } from 'lucide-react'
import { BuscarPaciente } from '@/components/admision/buscar-paciente'
import type { PacienteResumen } from '@/modules/admision/types'
import { crearOrdenAction } from '@/modules/orden/actions'
import type { OrdenPracticaItemInput } from '@/modules/orden/schemas'
import type { NomencladorPracticaItem } from '@/modules/orden/types'

interface ObraSocialItem {
  id: number
  nombre: string
}

interface PlanItem {
  id: number
  descripcion: string
  obraSocialId: number
}

interface ProfesionalItem {
  id: number
  nombre: string
  matricula?: number | null
}

interface TipoIngresoItem {
  codigo: string
  descripcion: string
}

interface ConsultaFormProps {
  obraSociales: ObraSocialItem[]
  planes: PlanItem[]
  profesionales: ProfesionalItem[]
  pacienteInicial?: PacienteResumen | null
  usuario: string
  tiposIngreso?: TipoIngresoItem[]
}

type ItemPractica = OrdenPracticaItemInput & { descripcionPractica: string; _key: string }

export function ConsultaForm({
  obraSociales,
  planes,
  profesionales,
  pacienteInicial,
  tiposIngreso,
}: ConsultaFormProps) {
  const router = useRouter()

  const [paciente, setPaciente] = useState<PacienteResumen | null>(pacienteInicial ?? null)
  const [tipoIngresoCodigo, setTipoIngresoCodigo] = useState<string>(
    tiposIngreso?.find((t) => t.codigo === 'A')?.codigo ?? tiposIngreso?.[0]?.codigo ?? 'A'
  )
  const [obraSocialId, setObraSocialId] = useState<string>(
    pacienteInicial?.obraSocialId?.toString() ?? ''
  )
  const [planId, setPlanId] = useState<string>('')
  const [profesionalId, setProfesionalId] = useState<string>('')
  const [diagnostico, setDiagnostico] = useState('')
  const [practicas, setPracticas] = useState<ItemPractica[]>([])

  // Búsqueda de prácticas
  const [busquedaPractica, setBusquedaPractica] = useState('')
  const [resultadosPractica, setResultadosPractica] = useState<NomencladorPracticaItem[]>([])
  const [buscandoPractica, setBuscandoPractica] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const planesDisponibles = obraSocialId
    ? planes.filter((p) => String(p.obraSocialId) === obraSocialId)
    : []

  const handlePacienteSeleccionado = useCallback(
    (p: PacienteResumen | null) => {
      setPaciente(p)
      if (p?.obraSocialId) {
        setObraSocialId(String(p.obraSocialId))
        setPlanId('')
      }
    },
    []
  )

  const buscarPractica = async () => {
    if (busquedaPractica.trim().length < 2) return
    if (!obraSocialId) {
      setError('Seleccioná una obra social antes de buscar prácticas')
      return
    }

    setError(null)
    setBuscandoPractica(true)
    try {
      const qs = new URLSearchParams({
        q: busquedaPractica.trim(),
        convenioId: obraSocialId,
      })
      const res = await fetch(`/api/practicas-nomenclador?${qs.toString()}`)
      const json = await res.json()
      setResultadosPractica(Array.isArray(json.data) ? json.data : [])
    } catch {
      setResultadosPractica([])
    } finally {
      setBuscandoPractica(false)
    }
  }

  const agregarPractica = (practica: NomencladorPracticaItem) => {
    const nueva: ItemPractica = {
      _key: `${practica.convenioId}-${practica.codigo}-${Date.now()}`,
      convenioId: practica.convenioId,
      codigoPractica: practica.codigo,
      descripcionPractica: practica.descripcion,
      cantidad: 1,
      tipoFacturacion: 'H',
    }
    setPracticas((prev) => [...prev, nueva])
    setResultadosPractica([])
    setBusquedaPractica('')
  }

  const agregarPracticaManual = () => {
    if (!busquedaPractica.trim()) return
    if (!obraSocialId) {
      setError('Seleccioná una obra social antes de agregar una práctica')
      return
    }

    setError(null)
    const nueva: ItemPractica = {
      _key: `manual-${Date.now()}`,
      convenioId: parseInt(obraSocialId, 10),
      codigoPractica: busquedaPractica.trim().slice(0, 8).toUpperCase(),
      descripcionPractica: busquedaPractica.trim(),
      cantidad: 1,
      tipoFacturacion: 'H',
    }
    setPracticas((prev) => [...prev, nueva])
    setResultadosPractica([])
    setBusquedaPractica('')
  }

  const quitarPractica = (key: string) => {
    setPracticas((prev) => prev.filter((p) => p._key !== key))
  }

  const actualizarCantidad = (key: string, cantidad: number) => {
    setPracticas((prev) => prev.map((p) => (p._key === key ? { ...p, cantidad } : p)))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!paciente) return setError('Seleccioná un paciente')
    if (!obraSocialId) return setError('Seleccioná una obra social')
    if (!planId) return setError('Seleccioná un plan')
    if (!profesionalId) return setError('Seleccioná un profesional')
    if (practicas.length === 0) return setError('Agregá al menos una práctica')

    setSubmitting(true)
    try {
      const result = await crearOrdenAction({
        pacienteId: paciente.id,
        nombrePaciente: paciente.nombreCompleto.slice(0, 50),
        numeroAfiliado: paciente.numeroAfiliado ?? '',
        obraSocialId: parseInt(obraSocialId, 10),
        planId: parseInt(planId, 10),
        profesionalId: parseInt(profesionalId, 10),
        tipoOrdenCodigo: 'PRA',
        descripcionPatologia: diagnostico || undefined,
        items: practicas.map((p) => ({
          convenioId: p.convenioId,
          codigoPractica: p.codigoPractica,
          descripcionPractica: p.descripcionPractica,
          cantidad: p.cantidad,
          tipoFacturacion: p.tipoFacturacion,
        })),
      })

      if ('error' in result && result.error) {
        setError(result.error)
      } else if ('puestoNumero' in result && result.puestoNumero) {
        router.push(`/dashboard/ambulatorio/${result.puestoNumero}/${result.numero}`)
      }
    } catch {
      setError('Error inesperado al generar la autorización')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
      {/* Tipo de Ingreso */}
      {tiposIngreso && tiposIngreso.length > 0 && (
        <div className="his-card space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Tipo de Ingreso
          </h2>
          <div className="flex flex-wrap gap-2">
            {tiposIngreso.map((t) => (
              <button
                key={t.codigo}
                type="button"
                onClick={() => setTipoIngresoCodigo(t.codigo)}
                className={`rounded-md px-4 py-2 text-sm font-medium border transition-colors ${
                  tipoIngresoCodigo === t.codigo
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span className="font-mono text-xs mr-1.5 opacity-60">{t.codigo}</span>
                {t.descripcion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Paciente */}
      <div className="his-card space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Paciente</h2>
        <BuscarPaciente
          onSeleccionar={handlePacienteSeleccionado}
          pacienteSeleccionado={paciente}
        />
      </div>

      {/* Obra Social y Plan */}
      <div className="his-card space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Cobertura
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Obra Social</label>
            <select
              value={obraSocialId}
              onChange={(e) => {
                setObraSocialId(e.target.value)
                setPlanId('')
                setResultadosPractica([])
                setPracticas([])
              }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Seleccionar --</option>
              {obraSociales.map((os) => (
                <option key={os.id} value={String(os.id)}>
                  {os.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Plan</label>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              disabled={!obraSocialId || planesDisponibles.length === 0}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
            >
              <option value="">
                {!obraSocialId
                  ? '-- Seleccione OS primero --'
                  : planesDisponibles.length === 0
                    ? '-- Sin planes --'
                    : '-- Seleccionar --'}
              </option>
              {planesDisponibles.map((plan) => (
                <option key={plan.id} value={String(plan.id)}>
                  {plan.descripcion}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Profesional */}
      <div className="his-card space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Profesional prescriptor
        </h2>
        <select
          value={profesionalId}
          onChange={(e) => setProfesionalId(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">-- Seleccionar profesional --</option>
          {profesionales.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.nombre}
              {p.matricula ? ` (M.P. ${p.matricula})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Diagnóstico */}
      <div className="his-card space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Diagnóstico (opcional)
        </h2>
        <input
          type="text"
          value={diagnostico}
          onChange={(e) => setDiagnostico(e.target.value)}
          placeholder="Descripción del diagnóstico..."
          maxLength={300}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Prácticas */}
      <div className="his-card space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Prácticas
        </h2>

        {/* Buscador */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={busquedaPractica}
              onChange={(e) => setBusquedaPractica(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); void buscarPractica() }
              }}
              placeholder="Buscar práctica por código o descripción..."
              className="w-full rounded-md border border-gray-300 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={() => void buscarPractica()}
            disabled={buscandoPractica || busquedaPractica.trim().length < 2}
            className="rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
          >
            {buscandoPractica ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
          </button>
          <button
            type="button"
            onClick={agregarPracticaManual}
            disabled={!busquedaPractica.trim()}
            title="Agregar práctica manual"
            className="rounded-md bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Resultados de búsqueda */}
        {resultadosPractica.length > 0 && (
          <div className="rounded-md border bg-white shadow-sm max-h-48 overflow-y-auto divide-y">
            {resultadosPractica.map((p) => (
              <button
                key={`${p.convenioId}-${p.codigo}`}
                type="button"
                onClick={() => agregarPractica(p)}
                className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors"
              >
                <p className="text-sm font-medium text-gray-900">{p.descripcion}</p>
                <p className="text-xs text-gray-500">Código: {p.codigo.trim()}</p>
              </button>
            ))}
          </div>
        )}

        {/* Lista de prácticas agregadas */}
        {practicas.length > 0 ? (
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Código</th>
                  <th className="px-3 py-2 text-left">Práctica</th>
                  <th className="px-3 py-2 text-center w-20">Cant.</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {practicas.map((p) => (
                  <tr key={p._key} className="bg-white">
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">
                      {p.codigoPractica.trim()}
                    </td>
                    <td className="px-3 py-2 text-gray-900">{p.descripcionPractica}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={p.cantidad}
                        onChange={(e) =>
                          actualizarCantidad(p._key, parseInt(e.target.value, 10) || 1)
                        }
                        className="w-full text-center rounded border border-gray-200 px-1 py-0.5 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => quitarPractica(p._key)}
                        className="text-red-400 hover:text-red-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4 border border-dashed rounded-md">
            Sin prácticas. Buscá una o agregala manualmente.
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? 'Generando...' : 'Generar Autorización'}
        </button>
      </div>
    </form>
  )
}
