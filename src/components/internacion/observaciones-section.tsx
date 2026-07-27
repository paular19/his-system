'use client'

import { useEffect, useMemo, useState } from 'react'
import { ClipboardCheck, FileText, Loader2, Plus, Trash2, Wallet } from 'lucide-react'
import {
  parseObservacionesInternacion,
  REQUISITOS_DOCUMENTALES,
  tieneChecklistCompleto,
  type ChecklistDocumental,
} from '@/modules/internacion/observaciones-meta'
import { useBackgroundRefresh } from '@/lib/utils/client-mutation'

interface ObservacionesSectionProps {
  ingresoId: number
  observacionesIniciales: string | null
  puedeModificar: boolean
}

interface DepositoRegistroEditable {
  id: string
  fecha: string
  importe: string
  observaciones: string
}

const formatoMoneda = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
})

function crearIdTemporalDeposito(): string {
  return `dep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}

function mapearDepositosEditable(
  depositos: Array<{ id: string; fecha: string; importe: number; observaciones: string | null }>
): DepositoRegistroEditable[] {
  return depositos.map((item, index) => ({
    id: item.id || `dep-${index + 1}`,
    fecha: toDateInput(item.fecha),
    importe: Number.isFinite(Number(item.importe)) ? String(Number(item.importe)) : '',
    observaciones: item.observaciones ?? '',
  }))
}

export function ObservacionesSection({
  ingresoId,
  observacionesIniciales,
  puedeModificar,
}: ObservacionesSectionProps) {
  const { refreshInBackground } = useBackgroundRefresh()
  const parsedInicial = useMemo(
    () => parseObservacionesInternacion(observacionesIniciales),
    [observacionesIniciales]
  )

  const [editando, setEditando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [observaciones, setObservaciones] = useState(parsedInicial.observaciones ?? '')
  const [checklistDocumental, setChecklistDocumental] = useState<ChecklistDocumental>(
    parsedInicial.checklistDocumental
  )
  const [depositosRegistros, setDepositosRegistros] = useState<DepositoRegistroEditable[]>(
    mapearDepositosEditable(parsedInicial.depositosRegistros)
  )

  useEffect(() => {
    const parsed = parseObservacionesInternacion(observacionesIniciales)
    setObservaciones(parsed.observaciones ?? '')
    setChecklistDocumental(parsed.checklistDocumental)
    setDepositosRegistros(mapearDepositosEditable(parsed.depositosRegistros))
  }, [observacionesIniciales])

  const checklistCompleto = useMemo(
    () => tieneChecklistCompleto(checklistDocumental),
    [checklistDocumental]
  )

  const cancelarEdicion = () => {
    const parsed = parseObservacionesInternacion(observacionesIniciales)
    setEditando(false)
    setError(null)
    setObservaciones(parsed.observaciones ?? '')
    setChecklistDocumental(parsed.checklistDocumental)
    setDepositosRegistros(mapearDepositosEditable(parsed.depositosRegistros))
  }

  const toggleChecklist = (key: keyof ChecklistDocumental) => {
    setChecklistDocumental((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const agregarDeposito = () => {
    setDepositosRegistros((prev) => [
      ...prev,
      {
        id: crearIdTemporalDeposito(),
        fecha: '',
        importe: '',
        observaciones: '',
      },
    ])
  }

  const actualizarDeposito = (
    id: string,
    field: keyof DepositoRegistroEditable,
    value: string
  ) => {
    setDepositosRegistros((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    )
  }

  const eliminarDeposito = (id: string) => {
    setDepositosRegistros((prev) => prev.filter((item) => item.id !== id))
  }

  const validarDepositos = (): string | null => {
    for (const item of depositosRegistros) {
      if (!item.fecha) {
        return 'Todos los depositos deben tener fecha.'
      }

      if (!item.importe.trim()) {
        return 'Todos los depositos deben tener importe.'
      }

      const importe = Number(item.importe)
      if (!Number.isFinite(importe) || importe < 0) {
        return 'Todos los importes de depositos deben ser validos.'
      }
    }

    return null
  }

  const guardar = async () => {
    const errorDepositos = validarDepositos()
    if (errorDepositos) {
      setError(errorDepositos)
      return
    }

    setGuardando(true)
    setError(null)
    try {
      const res = await fetch(`/api/internacion/${ingresoId}/observaciones`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          observaciones: observaciones.trim() || null,
          checklistDocumental,
          depositosRegistros: depositosRegistros.map((item) => ({
            id: item.id,
            fecha: item.fecha,
            importe: Number(item.importe),
            observaciones: item.observaciones.trim() || null,
          })),
        }),
      })

      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error ?? 'No se pudieron guardar las observaciones')
        return
      }

      setEditando(false)
      refreshInBackground()
    } catch {
      setError('Error de conexión al guardar observaciones')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="his-card p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">Observaciones</h3>
        </div>

        {puedeModificar && !editando && (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            Editar
          </button>
        )}
      </div>

      {!editando ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-700 whitespace-pre-wrap wrap-break-word">
            {parsedInicial.observaciones?.trim() ? parsedInicial.observaciones : 'Sin observaciones'}
          </p>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="mb-2 flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-gray-500" />
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                Checklist documental
              </h4>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  checklistCompleto
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {checklistCompleto ? 'Completo' : 'Pendiente'}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {REQUISITOS_DOCUMENTALES.map((item) => (
                <label key={item.key} className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={checklistDocumental[item.key]}
                    readOnly
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Wallet className="h-4 w-4 text-gray-500" />
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                Depositos
              </h4>
            </div>

            {depositosRegistros.length === 0 ? (
              <p className="text-sm text-gray-500">Sin depositos registrados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-2 py-2">Fecha</th>
                      <th className="px-2 py-2">Importe</th>
                      <th className="px-2 py-2">Observaciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {depositosRegistros.map((item) => (
                      <tr key={item.id} className="text-gray-700">
                        <td className="px-2 py-2">{item.fecha || '—'}</td>
                        <td className="px-2 py-2">
                          {Number.isFinite(Number(item.importe))
                            ? formatoMoneda.format(Number(item.importe))
                            : '—'}
                        </td>
                        <td className="px-2 py-2">{item.observaciones.trim() || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={4}
            maxLength={5000}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y"
            placeholder="Agregar observaciones de internacion"
          />

          <div className="rounded-lg border border-gray-200 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-700">
              Checklist documental
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {REQUISITOS_DOCUMENTALES.map((item) => (
                <label key={item.key} className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={checklistDocumental[item.key]}
                    onChange={() => toggleChecklist(item.key)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                Depositos
              </p>
              <button
                type="button"
                onClick={agregarDeposito}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar deposito
              </button>
            </div>

            {depositosRegistros.length === 0 ? (
              <p className="text-xs text-gray-500">Sin depositos registrados.</p>
            ) : (
              <div className="space-y-2">
                {depositosRegistros.map((item) => (
                  <div key={item.id} className="rounded-md border border-gray-200 p-2">
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                          Fecha
                        </label>
                        <input
                          type="date"
                          value={item.fecha}
                          onChange={(e) => actualizarDeposito(item.id, 'fecha', e.target.value)}
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                          Importe
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.importe}
                          onChange={(e) => actualizarDeposito(item.id, 'importe', e.target.value)}
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                          Observaciones
                        </label>
                        <input
                          type="text"
                          value={item.observaciones}
                          onChange={(e) => actualizarDeposito(item.id, 'observaciones', e.target.value)}
                          maxLength={500}
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs"
                          placeholder="Opcional"
                        />
                      </div>
                    </div>

                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => eliminarDeposito(item.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={cancelarEdicion}
              disabled={guardando}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void guardar()}
              disabled={guardando}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
