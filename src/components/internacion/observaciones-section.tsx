'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, CheckCircle2, ClipboardCheck, FileText, Loader2 } from 'lucide-react'
import {
  parseObservacionesInternacion,
  REQUISITOS_DOCUMENTALES,
  tieneChecklistCompleto,
  type ChecklistDocumental,
} from '@/modules/internacion/observaciones-meta'
import { formatearFechaHoraArgentina } from '@/lib/utils/argentina-date'

interface ObservacionesSectionProps {
  ingresoId: number
  observacionesIniciales: string | null
  puedeModificar: boolean
  profesionales: Array<{ id: number; nombre: string }>
}

interface RegistroArmEditable {
  id: string
  fechaIngreso: string
  fechaEgreso: string
  profesionalId: string
}

interface RegistroOxigenoterapiaEditable {
  id: string
  fechaIngreso: string
  fechaEgreso: string
  litros: string
  profesionalId: string
}

function ahoraLocalDateTimeInput(): string {
  const now = new Date()
  const tzOffset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16)
}

function toDateTimeLocalInput(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const tzOffset = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16)
}

function crearIdTemporal(prefix: 'arm' | 'oxi') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function mapearArmEditable(
  armRegistros: Array<{ id: string; fechaIngreso: string; fechaEgreso: string | null; profesionalId: number | null }>
): RegistroArmEditable[] {
  return armRegistros.map((item, index) => ({
    id: item.id || `arm-${index + 1}`,
    fechaIngreso: toDateTimeLocalInput(item.fechaIngreso),
    fechaEgreso: toDateTimeLocalInput(item.fechaEgreso),
    profesionalId: item.profesionalId != null ? String(item.profesionalId) : '',
  }))
}

function mapearOxigenoterapiaEditable(
  oxigenoterapiaRegistros: Array<{
    id: string
    fechaIngreso: string
    fechaEgreso: string | null
    litros: number | null
    profesionalId: number | null
  }>
): RegistroOxigenoterapiaEditable[] {
  return oxigenoterapiaRegistros.map((item, index) => ({
    id: item.id || `oxi-${index + 1}`,
    fechaIngreso: toDateTimeLocalInput(item.fechaIngreso),
    fechaEgreso: toDateTimeLocalInput(item.fechaEgreso),
    litros: item.litros != null ? String(item.litros) : '',
    profesionalId: item.profesionalId != null ? String(item.profesionalId) : '',
  }))
}

function nombreProfesionalPorId(
  profesionales: Array<{ id: number; nombre: string }>,
  profesionalId: string
): string {
  if (!profesionalId) return 'Sin medico a cargo'
  const found = profesionales.find((item) => item.id === Number(profesionalId))
  return found?.nombre ?? `Profesional #${profesionalId}`
}

export function ObservacionesSection({
  ingresoId,
  observacionesIniciales,
  puedeModificar,
  profesionales,
}: ObservacionesSectionProps) {
  const router = useRouter()
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
  const [armRegistros, setArmRegistros] = useState<RegistroArmEditable[]>(
    mapearArmEditable(parsedInicial.armRegistros)
  )
  const [oxigenoterapiaRegistros, setOxigenoterapiaRegistros] = useState<RegistroOxigenoterapiaEditable[]>(
    mapearOxigenoterapiaEditable(parsedInicial.oxigenoterapiaRegistros)
  )

  useEffect(() => {
    const parsed = parseObservacionesInternacion(observacionesIniciales)
    setObservaciones(parsed.observaciones ?? '')
    setChecklistDocumental(parsed.checklistDocumental)
    setArmRegistros(mapearArmEditable(parsed.armRegistros))
    setOxigenoterapiaRegistros(mapearOxigenoterapiaEditable(parsed.oxigenoterapiaRegistros))
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
    setArmRegistros(mapearArmEditable(parsed.armRegistros))
    setOxigenoterapiaRegistros(mapearOxigenoterapiaEditable(parsed.oxigenoterapiaRegistros))
  }

  const toggleChecklist = (key: keyof ChecklistDocumental) => {
    setChecklistDocumental((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const agregarArmRegistro = () => {
    setArmRegistros((prev) => [
      ...prev,
      {
        id: crearIdTemporal('arm'),
        fechaIngreso: ahoraLocalDateTimeInput(),
        fechaEgreso: '',
        profesionalId: '',
      },
    ])
  }

  const agregarOxigenoterapiaRegistro = () => {
    setOxigenoterapiaRegistros((prev) => [
      ...prev,
      {
        id: crearIdTemporal('oxi'),
        fechaIngreso: ahoraLocalDateTimeInput(),
        fechaEgreso: '',
        litros: '',
        profesionalId: '',
      },
    ])
  }

  const actualizarArmRegistro = (
    id: string,
    field: keyof RegistroArmEditable,
    value: string
  ) => {
    setArmRegistros((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    )
  }

  const actualizarOxigenoterapiaRegistro = (
    id: string,
    field: keyof RegistroOxigenoterapiaEditable,
    value: string
  ) => {
    setOxigenoterapiaRegistros((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    )
  }

  const eliminarArmRegistro = (id: string) => {
    setArmRegistros((prev) => prev.filter((item) => item.id !== id))
  }

  const eliminarOxigenoterapiaRegistro = (id: string) => {
    setOxigenoterapiaRegistros((prev) => prev.filter((item) => item.id !== id))
  }

  const validarRegistros = (): string | null => {
    const armInvalido = armRegistros.find((item) => !item.fechaIngreso)
    if (armInvalido) return 'Todos los registros ARM deben tener fecha y hora de ingreso.'

    const oxiSinIngreso = oxigenoterapiaRegistros.find((item) => !item.fechaIngreso)
    if (oxiSinIngreso) {
      return 'Todos los registros de oxigenoterapia deben tener fecha y hora de ingreso.'
    }

    const oxiSinLitros = oxigenoterapiaRegistros.find((item) => {
      if (!item.litros.trim()) return true
      const litros = Number(item.litros)
      return !Number.isFinite(litros) || litros < 0
    })
    if (oxiSinLitros) {
      return 'Cada registro de oxigenoterapia debe indicar litros validos.'
    }

    return null
  }

  const guardar = async () => {
    const errorValidacion = validarRegistros()
    if (errorValidacion) {
      setError(errorValidacion)
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
          armRegistros: armRegistros.map((item) => ({
            id: item.id,
            fechaIngreso: item.fechaIngreso,
            fechaEgreso: item.fechaEgreso || null,
            profesionalId: item.profesionalId ? Number(item.profesionalId) : null,
          })),
          oxigenoterapiaRegistros: oxigenoterapiaRegistros.map((item) => ({
            id: item.id,
            fechaIngreso: item.fechaIngreso,
            fechaEgreso: item.fechaEgreso || null,
            litros: item.litros ? Number(item.litros) : null,
            profesionalId: item.profesionalId ? Number(item.profesionalId) : null,
          })),
        }),
      })

      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error ?? 'No se pudieron guardar las observaciones')
        return
      }

      setEditando(false)
      router.refresh()
    } catch {
      setError('Error de conexión al guardar observaciones')
    } finally {
      setGuardando(false)
    }
  }

  const formatearFechaHora = (value: string | null | undefined) => {
    if (!value) return 'Sin fecha de salida'
    return formatearFechaHoraArgentina(value, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) ?? value
  }

  return (
    <div className="space-y-4">
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
            <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
              {parsedInicial.observaciones?.trim() ? parsedInicial.observaciones : 'Sin observaciones'}
            </p>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-gray-500" />
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                  Requisitos documentales
                </h4>
                {checklistCompleto ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                    Completo
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    Pendiente
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {REQUISITOS_DOCUMENTALES.map((item) => (
                  <div key={item.key} className="flex items-center gap-2 text-xs text-gray-700">
                    <CheckCircle2
                      className={`h-3.5 w-3.5 ${
                        checklistDocumental[item.key] ? 'text-emerald-600' : 'text-gray-300'
                      }`}
                    />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
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

      <div className="his-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">ARM y Oxigenoterapia</h3>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-700">ARM</p>
              {editando && puedeModificar && (
                <button
                  type="button"
                  onClick={agregarArmRegistro}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  Agregar ARM
                </button>
              )}
            </div>

            {!editando ? (
              armRegistros.length === 0 ? (
                <p className="text-xs text-gray-500">Sin registros de ARM.</p>
              ) : (
                <div className="space-y-2">
                  {armRegistros.map((item) => (
                    <div key={item.id} className="rounded-md border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700">
                      <p>
                        Entra: <span className="font-medium">{formatearFechaHora(item.fechaIngreso)}</span>
                      </p>
                      <p>
                        Sale: <span className="font-medium">{formatearFechaHora(item.fechaEgreso || null)}</span>
                      </p>
                      <p>
                        Medico a cargo:{' '}
                        <span className="font-medium">
                          {nombreProfesionalPorId(profesionales, item.profesionalId)}
                        </span>
                      </p>
                    </div>
                  ))}
                </div>
              )
            ) : armRegistros.length === 0 ? (
              <p className="text-xs text-gray-500">Sin registros de ARM.</p>
            ) : (
              <div className="space-y-2">
                {armRegistros.map((item) => (
                  <div key={item.id} className="rounded-md border border-gray-200 p-2">
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                          Dia y hora que entra
                        </label>
                        <input
                          type="datetime-local"
                          value={item.fechaIngreso}
                          onChange={(e) => actualizarArmRegistro(item.id, 'fechaIngreso', e.target.value)}
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                          Dia y hora que sale
                        </label>
                        <input
                          type="datetime-local"
                          value={item.fechaEgreso}
                          onChange={(e) => actualizarArmRegistro(item.id, 'fechaEgreso', e.target.value)}
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                          Medico a cargo
                        </label>
                        <select
                          value={item.profesionalId}
                          onChange={(e) => actualizarArmRegistro(item.id, 'profesionalId', e.target.value)}
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs"
                        >
                          <option value="">Sin asignar</option>
                          {profesionales.map((profesional) => (
                            <option key={profesional.id} value={String(profesional.id)}>
                              {profesional.nombre}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => eliminarArmRegistro(item.id)}
                        className="text-xs font-medium text-red-600 hover:text-red-700"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-700">Oxigenoterapia</p>
              {editando && puedeModificar && (
                <button
                  type="button"
                  onClick={agregarOxigenoterapiaRegistro}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  Agregar oxigenoterapia
                </button>
              )}
            </div>

            {!editando ? (
              oxigenoterapiaRegistros.length === 0 ? (
                <p className="text-xs text-gray-500">Sin registros de oxigenoterapia.</p>
              ) : (
                <div className="space-y-2">
                  {oxigenoterapiaRegistros.map((item) => (
                    <div key={item.id} className="rounded-md border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700">
                      <p>
                        Entra: <span className="font-medium">{formatearFechaHora(item.fechaIngreso)}</span>
                      </p>
                      <p>
                        Sale: <span className="font-medium">{formatearFechaHora(item.fechaEgreso || null)}</span>
                      </p>
                      <p>
                        Indicacion (litros): <span className="font-medium">{item.litros || '—'}</span>
                      </p>
                      <p>
                        Medico a cargo:{' '}
                        <span className="font-medium">
                          {nombreProfesionalPorId(profesionales, item.profesionalId)}
                        </span>
                      </p>
                    </div>
                  ))}
                </div>
              )
            ) : oxigenoterapiaRegistros.length === 0 ? (
              <p className="text-xs text-gray-500">Sin registros de oxigenoterapia.</p>
            ) : (
              <div className="space-y-2">
                {oxigenoterapiaRegistros.map((item) => (
                  <div key={item.id} className="rounded-md border border-gray-200 p-2">
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                      <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                          Dia y hora que entra
                        </label>
                        <input
                          type="datetime-local"
                          value={item.fechaIngreso}
                          onChange={(e) =>
                            actualizarOxigenoterapiaRegistro(item.id, 'fechaIngreso', e.target.value)
                          }
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                          Dia y hora que sale
                        </label>
                        <input
                          type="datetime-local"
                          value={item.fechaEgreso}
                          onChange={(e) =>
                            actualizarOxigenoterapiaRegistro(item.id, 'fechaEgreso', e.target.value)
                          }
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                          Indicacion en litros
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={item.litros}
                          onChange={(e) =>
                            actualizarOxigenoterapiaRegistro(item.id, 'litros', e.target.value)
                          }
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs"
                          placeholder="Ej: 2"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                          Medico a cargo
                        </label>
                        <select
                          value={item.profesionalId}
                          onChange={(e) =>
                            actualizarOxigenoterapiaRegistro(item.id, 'profesionalId', e.target.value)
                          }
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs"
                        >
                          <option value="">Sin asignar</option>
                          {profesionales.map((profesional) => (
                            <option key={profesional.id} value={String(profesional.id)}>
                              {profesional.nombre}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => eliminarOxigenoterapiaRegistro(item.id)}
                        className="text-xs font-medium text-red-600 hover:text-red-700"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
