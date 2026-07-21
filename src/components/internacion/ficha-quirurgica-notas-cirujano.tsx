'use client'

import { useEffect, useMemo, useState } from 'react'

type CamposNotasCirujano = {
  apellidoNombre: string
  dni: string
  obraSocial: string
  cirujano: string
  ayudantePrimero: string
  ayudanteSegundo: string
  ayudanteTercero: string
  instrumentadora: string
  circular: string
  fecha: string
  horaComienzo: string
  horaTermino: string
  diagnosticoOperatorio: string
  diagnosticoPosoperatorio: string
  procedimientoQuirurgico: string
  operacionHallazgos: string
  cirugiasMultiples: boolean
  tipoCirugiaMultiple: '' | 'MISMA_VIA_MISMA_PATOLOGIA' | 'MISMA_VIA_DISTINTA_PATOLOGIA' | 'DISTINTA_VIA_DISTINTA_PATOLOGIA'
  monitoreoIntraoperatorio: 'SI' | 'NO'
  radiografiaConIntensificador: 'SI' | 'NO'
  cantidadDisparos: string
  tecnicoRadiologia: string
  firmaSelloRadiologo: string
  firmaSelloCirujano: string
}

interface FichaQuirurgicaNotasCirujanoProps {
  ingresoId: number
  cirugiaId: number
  fechaCirugiaLabel: string
  fechaCirugiaInput?: string | null
  cirugiasMultiplesInicial?: boolean
  tipoCirugiaMultipleInicial?: '' | 'MISMA_VIA_MISMA_PATOLOGIA' | 'MISMA_VIA_DISTINTA_PATOLOGIA' | 'DISTINTA_VIA_DISTINTA_PATOLOGIA'
  pacienteNombre?: string | null
  pacienteDni?: string | null
  obraSocial?: string | null
  cirujanoInicial?: string | null
  diagnosticoInicial?: string | null
  observacionesIniciales?: string | null
  cirujanoMatricula?: number | null
}

function storageKey(ingresoId: number, cirugiaId: number): string {
  return `ficha-quirurgica:notas:${ingresoId}:${cirugiaId}`
}

function buildInitialState(
  pacienteNombre?: string | null,
  pacienteDni?: string | null,
  obraSocial?: string | null,
  fechaCirugiaInput?: string | null,
  cirugiasMultiplesInicial?: boolean,
  tipoCirugiaMultipleInicial?: '' | 'MISMA_VIA_MISMA_PATOLOGIA' | 'MISMA_VIA_DISTINTA_PATOLOGIA' | 'DISTINTA_VIA_DISTINTA_PATOLOGIA',
  cirujanoInicial?: string | null,
  diagnosticoInicial?: string | null,
  observacionesIniciales?: string | null
): CamposNotasCirujano {
  return {
    apellidoNombre: (pacienteNombre ?? '').trim(),
    dni: (pacienteDni ?? '').trim(),
    obraSocial: (obraSocial ?? '').trim(),
    cirujano: (cirujanoInicial ?? '').trim(),
    ayudantePrimero: '',
    ayudanteSegundo: '',
    ayudanteTercero: '',
    instrumentadora: '',
    circular: '',
    fecha: (fechaCirugiaInput ?? '').trim(),
    horaComienzo: '',
    horaTermino: '',
    diagnosticoOperatorio: (diagnosticoInicial ?? '').trim(),
    diagnosticoPosoperatorio: '',
    procedimientoQuirurgico: '',
    operacionHallazgos: (observacionesIniciales ?? '').trim(),
    cirugiasMultiples: Boolean(cirugiasMultiplesInicial),
    tipoCirugiaMultiple: tipoCirugiaMultipleInicial ?? '',
    monitoreoIntraoperatorio: 'NO',
    radiografiaConIntensificador: 'NO',
    cantidadDisparos: '',
    tecnicoRadiologia: '',
    firmaSelloRadiologo: '',
    firmaSelloCirujano: '',
  }
}

function mergeCampos(
  fallback: CamposNotasCirujano,
  parsed: Partial<CamposNotasCirujano> & {
    diagnosticoPreoperatorio?: string
    descripcionProcedimiento?: string
    hallazgosIntraoperatorios?: string
    tecnicaQuirurgica?: string
    complicaciones?: string
    indicacionesPostoperatorias?: string
    firmaCirujano?: string
  }
): CamposNotasCirujano {
  const operacionHallazgosLegacy = [
    parsed.hallazgosIntraoperatorios?.trim(),
    parsed.tecnicaQuirurgica?.trim(),
    parsed.complicaciones?.trim(),
  ]
    .filter((item): item is string => Boolean(item && item.length > 0))
    .join('\n\n')

  return {
    apellidoNombre: parsed.apellidoNombre ?? fallback.apellidoNombre,
    dni: parsed.dni ?? fallback.dni,
    obraSocial: parsed.obraSocial ?? fallback.obraSocial,
    cirujano: parsed.cirujano ?? fallback.cirujano,
    ayudantePrimero: parsed.ayudantePrimero ?? fallback.ayudantePrimero,
    ayudanteSegundo: parsed.ayudanteSegundo ?? fallback.ayudanteSegundo,
    ayudanteTercero: parsed.ayudanteTercero ?? fallback.ayudanteTercero,
    instrumentadora: parsed.instrumentadora ?? fallback.instrumentadora,
    circular: parsed.circular ?? fallback.circular,
    fecha: parsed.fecha ?? fallback.fecha,
    horaComienzo: parsed.horaComienzo ?? fallback.horaComienzo,
    horaTermino: parsed.horaTermino ?? fallback.horaTermino,
    diagnosticoOperatorio:
      parsed.diagnosticoOperatorio ??
      parsed.diagnosticoPreoperatorio ??
      fallback.diagnosticoOperatorio,
    diagnosticoPosoperatorio: parsed.diagnosticoPosoperatorio ?? fallback.diagnosticoPosoperatorio,
    procedimientoQuirurgico:
      parsed.procedimientoQuirurgico ??
      parsed.descripcionProcedimiento ??
      fallback.procedimientoQuirurgico,
    operacionHallazgos:
      parsed.operacionHallazgos ??
      (operacionHallazgosLegacy || fallback.operacionHallazgos),
    cirugiasMultiples: parsed.cirugiasMultiples ?? fallback.cirugiasMultiples,
    tipoCirugiaMultiple: parsed.tipoCirugiaMultiple ?? fallback.tipoCirugiaMultiple,
    monitoreoIntraoperatorio: parsed.monitoreoIntraoperatorio ?? fallback.monitoreoIntraoperatorio,
    radiografiaConIntensificador:
      parsed.radiografiaConIntensificador ?? fallback.radiografiaConIntensificador,
    cantidadDisparos: parsed.cantidadDisparos ?? fallback.cantidadDisparos,
    tecnicoRadiologia: parsed.tecnicoRadiologia ?? fallback.tecnicoRadiologia,
    firmaSelloRadiologo: parsed.firmaSelloRadiologo ?? fallback.firmaSelloRadiologo,
    firmaSelloCirujano: parsed.firmaSelloCirujano ?? parsed.firmaCirujano ?? fallback.firmaSelloCirujano,
  }
}

export function FichaQuirurgicaNotasCirujano({
  ingresoId,
  cirugiaId,
  fechaCirugiaLabel,
  fechaCirugiaInput,
  cirugiasMultiplesInicial,
  tipoCirugiaMultipleInicial,
  pacienteNombre,
  pacienteDni,
  obraSocial,
  cirujanoInicial,
  diagnosticoInicial,
  observacionesIniciales,
  cirujanoMatricula,
}: FichaQuirurgicaNotasCirujanoProps) {
  const tipoCirugiaMultipleLabel: Record<NonNullable<CamposNotasCirujano['tipoCirugiaMultiple']>, string> = {
    '': 'No especificada',
    MISMA_VIA_MISMA_PATOLOGIA: 'I) Misma via, misma patologia',
    MISMA_VIA_DISTINTA_PATOLOGIA: 'II) Misma via, distinta patologia',
    DISTINTA_VIA_DISTINTA_PATOLOGIA: 'III) Distinta via, distinta patologia',
  }

  const fallback = useMemo(
    () =>
      buildInitialState(
        pacienteNombre,
        pacienteDni,
        obraSocial,
        fechaCirugiaInput,
        cirugiasMultiplesInicial,
        tipoCirugiaMultipleInicial,
        cirujanoInicial,
        diagnosticoInicial,
        observacionesIniciales
      ),
    [
      pacienteNombre,
      pacienteDni,
      obraSocial,
      fechaCirugiaInput,
      cirugiasMultiplesInicial,
      tipoCirugiaMultipleInicial,
      cirujanoInicial,
      diagnosticoInicial,
      observacionesIniciales,
    ]
  )

  const [campos, setCampos] = useState<CamposNotasCirujano>(fallback)
  const [guardandoFicha, setGuardandoFicha] = useState(false)
  const [modoLectura, setModoLectura] = useState(false)
  const [estadoCondicional, setEstadoCondicional] = useState<
    { tipo: 'ok' | 'error'; mensaje: string } | null
  >(null)

  const textoCampo = (value: string): string => value.trim() || '—'

  const rangoHorario = useMemo(() => {
    const comienzo = campos.horaComienzo.trim()
    const termino = campos.horaTermino.trim()
    if (comienzo && termino) return `${comienzo} a ${termino}`
    if (comienzo) return `Inicio ${comienzo}`
    if (termino) return `Termino ${termino}`
    return '—'
  }, [campos.horaComienzo, campos.horaTermino])

  const fechaFicha = useMemo(() => {
    const value = campos.fecha.trim()
    if (!value) return fechaCirugiaLabel
    const parts = value.split('-')
    if (parts.length !== 3) return value
    return `${parts[2]}/${parts[1]}/${parts[0]}`
  }, [campos.fecha, fechaCirugiaLabel])

  const diagnosticoPreoperatorioTexto =
    campos.diagnosticoOperatorio.trim() || '(CAMPO PARA EL DIAGNOSTICO PREOPERATORIO)'
  const diagnosticoPosoperatorioTexto =
    campos.diagnosticoPosoperatorio.trim() || '(CAMPO PARA EL DIAGNOSTICO POSOPERATORIO)'
  const procedimientoQuirurgicoTexto =
    campos.procedimientoQuirurgico.trim() || '(CAMPO PARA EL PROCEDIMIENTO QUIRURGICO)'
  const operacionHallazgosTexto =
    campos.operacionHallazgos.trim() || '(CAMPO PARA LA OPERACION Y HALLAZGOS)'

  useEffect(() => {
    const key = storageKey(ingresoId, cirugiaId)
    try {
      const raw = window.localStorage.getItem(key)
      if (!raw) {
        setCampos(fallback)
        setModoLectura(false)
        return
      }
      const parsed = JSON.parse(raw) as Partial<CamposNotasCirujano> & {
        diagnosticoPreoperatorio?: string
        descripcionProcedimiento?: string
        hallazgosIntraoperatorios?: string
        tecnicaQuirurgica?: string
        complicaciones?: string
        indicacionesPostoperatorias?: string
        firmaCirujano?: string
      }
      setCampos(mergeCampos(fallback, parsed))
      setModoLectura(true)
    } catch {
      setCampos(fallback)
      setModoLectura(false)
    }
  }, [cirugiaId, fallback, ingresoId])

  const updateCampo = <T extends keyof CamposNotasCirujano>(field: T, value: CamposNotasCirujano[T]) => {
    setEstadoCondicional(null)
    setCampos((prev) => ({ ...prev, [field]: value }))
  }

  const limpiar = () => {
    setCampos(fallback)
    setModoLectura(false)
    setEstadoCondicional(null)
    try {
      window.localStorage.removeItem(storageKey(ingresoId, cirugiaId))
    } catch {
      // ignore storage errors silently
    }
  }

  const guardarFichaYCondicional = async () => {
    if (campos.cirugiasMultiples && !campos.tipoCirugiaMultiple) {
      setEstadoCondicional({
        tipo: 'error',
        mensaje: 'Selecciona el tipo de cirugia multiple antes de guardar.',
      })
      return
    }

    const cantidadDisparosNormalizada = campos.cantidadDisparos.trim()
    let cantidadDisparos: number | null = null
    if (cantidadDisparosNormalizada) {
      const parsedCantidad = Number.parseInt(cantidadDisparosNormalizada, 10)
      if (!Number.isFinite(parsedCantidad) || parsedCantidad < 0) {
        setEstadoCondicional({
          tipo: 'error',
          mensaje: 'La cantidad de disparos debe ser un numero entero mayor o igual a 0.',
        })
        return
      }
      cantidadDisparos = parsedCantidad
    }

    setGuardandoFicha(true)
    setEstadoCondicional(null)

    try {
      try {
        window.localStorage.setItem(storageKey(ingresoId, cirugiaId), JSON.stringify(campos))
      } catch {
        // ignore storage errors silently
      }

      const res = await fetch(`/api/internacion/${ingresoId}/cirugia-urgencia`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cirugiaId,
          cirugiasMultiples: campos.cirugiasMultiples,
          tipoCirugiaMultiple: campos.cirugiasMultiples ? campos.tipoCirugiaMultiple : null,
          monitoreoIntraoperatorio: campos.monitoreoIntraoperatorio === 'SI',
          radiografiaConIntensificador: campos.radiografiaConIntensificador === 'SI',
          cantidadDisparos,
          tecnicoRadiologia: campos.tecnicoRadiologia.trim() || null,
          firmaSelloRadiologo: null,
        }),
      })

      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload.error ?? 'No se pudo guardar el condicional de cirugia multiple')
      }

      setEstadoCondicional({
        tipo: 'ok',
        mensaje: 'Ficha guardada y lista para imprimir. El condicional impacta en facturacion.',
      })
      setModoLectura(true)
    } catch (err) {
      setEstadoCondicional({
        tipo: 'error',
        mensaje: err instanceof Error ? err.message : 'Error desconocido al guardar la ficha.',
      })
    } finally {
      setGuardandoFicha(false)
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 print:bg-white print:border-gray-300">
      <div className={`${modoLectura ? 'hidden' : 'block'} print:hidden`}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Ficha quirurgica</p>
            <p className="text-[11px] text-slate-500">
              Cirugia {cirugiaId} - {fechaCirugiaLabel}. Completar por cirujano y equipo.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={limpiar}
              className="text-xs text-slate-600 border rounded px-2 py-1 hover:bg-white"
            >
              Limpiar
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Apellido y nombre</label>
          <input
            type="text"
            value={campos.apellidoNombre}
            onChange={(e) => updateCampo('apellidoNombre', e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">DNI</label>
          <input
            type="text"
            value={campos.dni}
            onChange={(e) => updateCampo('dni', e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Obra social</label>
          <input
            type="text"
            value={campos.obraSocial}
            onChange={(e) => updateCampo('obraSocial', e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Cirujano</label>
          <input
            type="text"
            value={campos.cirujano}
            onChange={(e) => updateCampo('cirujano', e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">1er ayudante</label>
          <input
            type="text"
            value={campos.ayudantePrimero}
            onChange={(e) => updateCampo('ayudantePrimero', e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">2do ayudante (opcional)</label>
          <input
            type="text"
            value={campos.ayudanteSegundo}
            onChange={(e) => updateCampo('ayudanteSegundo', e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">3er ayudante (opcional)</label>
          <input
            type="text"
            value={campos.ayudanteTercero}
            onChange={(e) => updateCampo('ayudanteTercero', e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Instrumentadora</label>
          <input
            type="text"
            value={campos.instrumentadora}
            onChange={(e) => updateCampo('instrumentadora', e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Circular</label>
          <input
            type="text"
            value={campos.circular}
            onChange={(e) => updateCampo('circular', e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Fecha</label>
          <input
            type="date"
            value={campos.fecha}
            onChange={(e) => updateCampo('fecha', e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Hora de comienzo de la operacion</label>
          <input
            type="time"
            value={campos.horaComienzo}
            onChange={(e) => updateCampo('horaComienzo', e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Hora de termino</label>
          <input
            type="time"
            value={campos.horaTermino}
            onChange={(e) => updateCampo('horaTermino', e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Diagnostico operatorio</label>
          <textarea
            rows={3}
            value={campos.diagnosticoOperatorio}
            onChange={(e) => updateCampo('diagnosticoOperatorio', e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm resize-y"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Diagnostico posoperatorio</label>
          <textarea
            rows={3}
            value={campos.diagnosticoPosoperatorio}
            onChange={(e) => updateCampo('diagnosticoPosoperatorio', e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm resize-y"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Procedimiento quirurgico</label>
          <textarea
            rows={3}
            value={campos.procedimientoQuirurgico}
            onChange={(e) => updateCampo('procedimientoQuirurgico', e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm resize-y"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Operacion y hallazgos</label>
          <textarea
            rows={3}
            value={campos.operacionHallazgos}
            onChange={(e) => updateCampo('operacionHallazgos', e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm resize-y"
          />
        </div>
        </div>

        <div className="mt-3 rounded-md border border-slate-200 bg-white/70 p-3 space-y-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={campos.cirugiasMultiples}
            onChange={(e) => {
              const enabled = e.target.checked
              setEstadoCondicional(null)
              setCampos((prev) => ({
                ...prev,
                cirugiasMultiples: enabled,
                tipoCirugiaMultiple: enabled ? prev.tipoCirugiaMultiple : '',
                monitoreoIntraoperatorio: enabled ? prev.monitoreoIntraoperatorio : 'NO',
                radiografiaConIntensificador: enabled ? prev.radiografiaConIntensificador : 'NO',
                cantidadDisparos: enabled ? prev.cantidadDisparos : '',
                tecnicoRadiologia: enabled ? prev.tecnicoRadiologia : '',
                firmaSelloRadiologo: enabled ? prev.firmaSelloRadiologo : '',
              }))
            }}
            className="h-4 w-4 rounded border-slate-300 text-blue-600"
          />
          Cirugias multiples
        </label>

        {campos.cirugiasMultiples && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Clasificacion</label>
              <select
                value={campos.tipoCirugiaMultiple}
                onChange={(e) =>
                  updateCampo(
                    'tipoCirugiaMultiple',
                    e.target.value as CamposNotasCirujano['tipoCirugiaMultiple']
                  )
                }
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">-- Seleccionar --</option>
                <option value="MISMA_VIA_MISMA_PATOLOGIA">I) misma via misma patologia</option>
                <option value="MISMA_VIA_DISTINTA_PATOLOGIA">II) misma via distinta patologia</option>
                <option value="DISTINTA_VIA_DISTINTA_PATOLOGIA">III) distinta via, distinta patologia</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">IV) monitoreo intraoperatorio</label>
              <select
                value={campos.monitoreoIntraoperatorio}
                onChange={(e) =>
                  updateCampo(
                    'monitoreoIntraoperatorio',
                    e.target.value as CamposNotasCirujano['monitoreoIntraoperatorio']
                  )
                }
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value="NO">No</option>
                <option value="SI">Si</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">V) radiografia con intensificador</label>
              <select
                value={campos.radiografiaConIntensificador}
                onChange={(e) =>
                  updateCampo(
                    'radiografiaConIntensificador',
                    e.target.value as CamposNotasCirujano['radiografiaConIntensificador']
                  )
                }
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value="NO">No</option>
                <option value="SI">Si</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">VI) cantidad de disparos</label>
              <input
                type="number"
                min={0}
                step={1}
                value={campos.cantidadDisparos}
                onChange={(e) => updateCampo('cantidadDisparos', e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tecnico</label>
              <input
                type="text"
                value={campos.tecnicoRadiologia}
                onChange={(e) => updateCampo('tecnicoRadiologia', e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                placeholder="Nombre del tecnico"
              />
            </div>

            <p className="md:col-span-2 text-xs text-slate-500">
              Firma y sello se completan en papel al imprimir la ficha.
            </p>
          </div>
        )}

        {estadoCondicional && (
          <p
            className={
              estadoCondicional.tipo === 'ok'
                ? 'text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5'
                : 'text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5'
            }
          >
            {estadoCondicional.mensaje}
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void guardarFichaYCondicional()}
            disabled={guardandoFicha}
            className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            {guardandoFicha
              ? 'Guardando ficha...'
              : 'Guardar ficha y condicional'}
          </button>
        </div>
        </div>
      </div>

      {modoLectura && (
        <div className="mb-2 flex items-center justify-end gap-2 print:hidden">
          <button
            type="button"
            onClick={() => setModoLectura(false)}
            className="text-xs text-blue-700 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={limpiar}
            className="text-xs text-slate-600 border rounded px-2 py-1 hover:bg-white"
          >
            Limpiar
          </button>
        </div>
      )}

      <div className={`${modoLectura ? 'block' : 'hidden'} print:block`}>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-700 print:hidden">
          Vista de impresion maquetada
        </p>

        <div className="mx-auto w-full max-w-[900px] rounded bg-white text-[10.2px] text-black print:max-w-none print:rounded-none print:text-[9.8px]">
          <div className="border border-black">
            <div className="grid grid-cols-[46%_22%_32%] border-b border-black">
              <div className="border-r border-black px-2 py-1">
                <span className="font-semibold uppercase">APELLIDO Y NOMBRE</span> {campos.apellidoNombre.trim()}
              </div>
              <div className="border-r border-black px-2 py-1">
                <span className="font-semibold uppercase">DNI N</span> {campos.dni.trim()}
              </div>
              <div className="px-2 py-1">
                <span className="font-semibold uppercase">O SOCIAL</span> {campos.obraSocial.trim()}
              </div>
            </div>

            <div className="grid grid-cols-2 border-b border-black">
              <div className="border-r border-black px-2 py-1">
                <span className="font-semibold uppercase">CIRUJANO</span> {campos.cirujano.trim()}
              </div>
              <div className="px-2 py-1">
                <span className="font-semibold uppercase">1er. AYUDANTE</span> {campos.ayudantePrimero.trim()}
              </div>
            </div>

            <div className="grid grid-cols-2 border-b border-black">
              <div className="border-r border-black px-2 py-1">
                <span className="font-semibold uppercase">2do. AYUDANTE</span> {campos.ayudanteSegundo.trim()}
              </div>
              <div className="px-2 py-1">
                <span className="font-semibold uppercase">3er. AYUDANTE</span> {campos.ayudanteTercero.trim()}
              </div>
            </div>

            <div className="grid grid-cols-2 border-b border-black">
              <div className="border-r border-black px-2 py-1">
                <span className="font-semibold uppercase">INSTRUMENTADORA</span> {campos.instrumentadora.trim()}
              </div>
              <div className="px-2 py-1">
                <span className="font-semibold uppercase">CIRCULAR</span> {campos.circular.trim()}
              </div>
            </div>

            <div className="grid grid-cols-[20%_48%_32%] border-b border-black">
              <div className="border-r border-black px-2 py-1">
                <span className="font-semibold uppercase">FECHA</span> {fechaFicha}
              </div>
              <div className="border-r border-black px-2 py-1">
                <span className="font-semibold uppercase">HORA COMIENZO OPERACION</span> {campos.horaComienzo.trim()}
              </div>
              <div className="px-2 py-1">
                <span className="font-semibold uppercase">TERMINO</span> {campos.horaTermino.trim()}
              </div>
            </div>

            <div className="grid grid-cols-[16%_30%_30%_24%] border-b border-black">
              <div className="border-r border-black px-2 py-1 font-semibold uppercase">ORDENAMIENTO</div>
              <div className="border-r border-black px-2 py-1 font-semibold uppercase">1 DIAGNOSTICO PREOPERATORIO</div>
              <div className="border-r border-black px-2 py-1 font-semibold uppercase">2 DIAGNOSTICO POSTOPERATORIO</div>
              <div className="px-2 py-1 font-semibold uppercase">3 PROCEDIMIENTO QUIRURGICO</div>
            </div>

            <div className="grid grid-cols-[16%_44%_40%] border-b border-black">
              <div className="border-r border-black px-2 py-1" />
              <div className="border-r border-black px-2 py-1 font-semibold uppercase">4 OPERACION Y HALLAZGOS</div>
              <div className="px-2 py-1 font-semibold uppercase">5 FIRMA</div>
            </div>

            <div
              className="relative min-h-[210mm]"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(to bottom, transparent 0, transparent 7.7mm, rgb(0 0 0) 7.7mm, rgb(0 0 0) 7.9mm)',
              }}
            >
              <div className="relative z-10 space-y-1 px-2 pt-1">
                <p><span className="font-semibold">1)</span> {diagnosticoPreoperatorioTexto}</p>
                <p><span className="font-semibold">2)</span> {diagnosticoPosoperatorioTexto}</p>
                <p><span className="font-semibold">3)</span> {procedimientoQuirurgicoTexto}</p>
                <p><span className="font-semibold">4)</span> {operacionHallazgosTexto}</p>
              </div>

              <div className="absolute bottom-[52mm] right-[2mm] z-10 w-[44%] bg-white/95 px-2 pt-2 pb-1">
                <div className="border-b border-black" />
                <p className="mt-1 text-[10px] font-semibold">Firma y sello del cirujano</p>
                <p className="text-[10px]">Nombre: {campos.cirujano || '________________'}</p>
                <p className="text-[10px]">Matricula: {cirujanoMatricula ? String(cirujanoMatricula) : '________________'}</p>
              </div>

              <div className="absolute bottom-0 right-0 z-20 h-[45mm] w-[27%] border-l border-t border-black bg-white px-2 py-1 text-[8.8px]">
                <p className="font-semibold uppercase">FIRMA Y SELLO</p>
                <div className="mt-1 space-y-0.5">
                  <p className="font-semibold uppercase">CIRUGIA MULTIPLE</p>
                  <p>Aplica: {campos.cirugiasMultiples ? 'Si' : 'No'}</p>
                  <p>Tipo: {campos.cirugiasMultiples ? tipoCirugiaMultipleLabel[campos.tipoCirugiaMultiple] : 'No aplica'}</p>
                  <p>Monitoreo: {campos.monitoreoIntraoperatorio}</p>
                  <p>Rx intensificador: {campos.radiografiaConIntensificador}</p>
                  <p>Disparos: {campos.cantidadDisparos.trim() || '0'}</p>
                  <p className="pt-0.5 font-semibold">Firma y sello del radiologo</p>
                  <p>Nombre: {campos.tecnicoRadiologia.trim() || '________________'}</p>
                  <p>Matricula: __________________</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
