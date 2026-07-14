'use client'

import { useEffect, useMemo, useState } from 'react'

type CamposNotasCirujano = {
  diagnosticoPreoperatorio: string
  descripcionProcedimiento: string
  hallazgosIntraoperatorios: string
  tecnicaQuirurgica: string
  complicaciones: string
  indicacionesPostoperatorias: string
  firmaCirujano: string
}

interface FichaQuirurgicaNotasCirujanoProps {
  ingresoId: number
  cirugiaId: number
  fechaCirugiaLabel: string
  diagnosticoInicial?: string | null
  observacionesIniciales?: string | null
}

function storageKey(ingresoId: number, cirugiaId: number): string {
  return `ficha-quirurgica:notas:${ingresoId}:${cirugiaId}`
}

function buildInitialState(
  diagnosticoInicial?: string | null,
  observacionesIniciales?: string | null
): CamposNotasCirujano {
  return {
    diagnosticoPreoperatorio: (diagnosticoInicial ?? '').trim(),
    descripcionProcedimiento: '',
    hallazgosIntraoperatorios: '',
    tecnicaQuirurgica: '',
    complicaciones: '',
    indicacionesPostoperatorias: (observacionesIniciales ?? '').trim(),
    firmaCirujano: '',
  }
}

export function FichaQuirurgicaNotasCirujano({
  ingresoId,
  cirugiaId,
  fechaCirugiaLabel,
  diagnosticoInicial,
  observacionesIniciales,
}: FichaQuirurgicaNotasCirujanoProps) {
  const fallback = useMemo(
    () => buildInitialState(diagnosticoInicial, observacionesIniciales),
    [diagnosticoInicial, observacionesIniciales]
  )

  const [campos, setCampos] = useState<CamposNotasCirujano>(fallback)

  useEffect(() => {
    const key = storageKey(ingresoId, cirugiaId)
    try {
      const raw = window.localStorage.getItem(key)
      if (!raw) {
        setCampos(fallback)
        return
      }
      const parsed = JSON.parse(raw) as Partial<CamposNotasCirujano>
      setCampos({
        diagnosticoPreoperatorio: parsed.diagnosticoPreoperatorio ?? fallback.diagnosticoPreoperatorio,
        descripcionProcedimiento: parsed.descripcionProcedimiento ?? fallback.descripcionProcedimiento,
        hallazgosIntraoperatorios: parsed.hallazgosIntraoperatorios ?? fallback.hallazgosIntraoperatorios,
        tecnicaQuirurgica: parsed.tecnicaQuirurgica ?? fallback.tecnicaQuirurgica,
        complicaciones: parsed.complicaciones ?? fallback.complicaciones,
        indicacionesPostoperatorias:
          parsed.indicacionesPostoperatorias ?? fallback.indicacionesPostoperatorias,
        firmaCirujano: parsed.firmaCirujano ?? fallback.firmaCirujano,
      })
    } catch {
      setCampos(fallback)
    }
  }, [cirugiaId, fallback, ingresoId])

  const updateCampo = (field: keyof CamposNotasCirujano, value: string) => {
    setCampos((prev) => {
      const next = { ...prev, [field]: value }
      try {
        window.localStorage.setItem(storageKey(ingresoId, cirugiaId), JSON.stringify(next))
      } catch {
        // ignore storage errors silently
      }
      return next
    })
  }

  const limpiar = () => {
    setCampos(fallback)
    try {
      window.localStorage.removeItem(storageKey(ingresoId, cirugiaId))
    } catch {
      // ignore storage errors silently
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 print:bg-white print:border-gray-300">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Completar por cirujano</p>
          <p className="text-[11px] text-slate-500 print:hidden">
            Cirugia {cirugiaId} - {fechaCirugiaLabel}. El texto queda listo para imprimir.
          </p>
        </div>
        <button
          type="button"
          onClick={limpiar}
          className="text-xs text-slate-600 border rounded px-2 py-1 hover:bg-white print:hidden"
        >
          Limpiar
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Diagnostico preoperatorio</label>
          <textarea
            rows={3}
            value={campos.diagnosticoPreoperatorio}
            onChange={(e) => updateCampo('diagnosticoPreoperatorio', e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm resize-y"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Descripcion del procedimiento</label>
          <textarea
            rows={3}
            value={campos.descripcionProcedimiento}
            onChange={(e) => updateCampo('descripcionProcedimiento', e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm resize-y"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Hallazgos intraoperatorios</label>
          <textarea
            rows={3}
            value={campos.hallazgosIntraoperatorios}
            onChange={(e) => updateCampo('hallazgosIntraoperatorios', e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm resize-y"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Tecnica quirurgica</label>
          <textarea
            rows={3}
            value={campos.tecnicaQuirurgica}
            onChange={(e) => updateCampo('tecnicaQuirurgica', e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm resize-y"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Complicaciones</label>
          <textarea
            rows={3}
            value={campos.complicaciones}
            onChange={(e) => updateCampo('complicaciones', e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm resize-y"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Indicaciones postoperatorias</label>
          <textarea
            rows={3}
            value={campos.indicacionesPostoperatorias}
            onChange={(e) => updateCampo('indicacionesPostoperatorias', e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm resize-y"
          />
        </div>
      </div>

      <div className="mt-3">
        <label className="block text-xs font-medium text-slate-600 mb-1">Firma / aclaracion del cirujano</label>
        <input
          type="text"
          value={campos.firmaCirujano}
          onChange={(e) => updateCampo('firmaCirujano', e.target.value)}
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          placeholder="Nombre y matricula"
        />
      </div>
    </section>
  )
}
