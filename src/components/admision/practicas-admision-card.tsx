'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Trash2 } from 'lucide-react'
import {
  ComponenteSelector,
  seleccionPorDefecto,
  type ComponenteSeleccion,
  type ComponenteValores,
} from '@/components/ui/componente-selector'

const PRACTICAS_POR_PAGINA = 6

export interface PracticaAdmisionBusquedaItem {
  convenioId: number
  codigo: string
  descripcion: string
  valorEspecialista?: number | null
  valorAyudante?: number | null
  valorAnestesista?: number | null
  valorGastos?: number | null
}

export interface PracticaAdmisionItem {
  tempId: string
  convenioId: number | null
  codigo: string
  descripcion: string
  numeroAutorizacion?: string | null
  desglose: ComponenteValores
  seleccionComponentes: ComponenteSeleccion
  requiereMatriculaEspecialista?: boolean
  requiereMatriculaAnestesista?: boolean
  matriculaEspecialista?: number | null
  matriculaAnestesista?: number | null
}

interface PendingSearchState {
  termino: string
  hayResultados: boolean
}

interface PracticasAdmisionCardProps {
  obraSocialId: string | number | null | undefined
  etiquetaBusqueda: string
  practicas: PracticaAdmisionItem[]
  setPracticas: React.Dispatch<React.SetStateAction<PracticaAdmisionItem[]>>
  obtenerMatriculaDefault: () => number
  disabled?: boolean
  onPendingSearchChange?: (state: PendingSearchState) => void
}

function normalizarBusqueda(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function crearTempId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function PracticasAdmisionCard({
  obraSocialId,
  etiquetaBusqueda,
  practicas,
  setPracticas,
  obtenerMatriculaDefault,
  disabled = false,
  onPendingSearchChange,
}: PracticasAdmisionCardProps) {
  const [buscandoPractica, setBuscandoPractica] = useState(false)
  const [terminoBusquedaPractica, setTerminoBusquedaPractica] = useState('')
  const [terminoFiltroPracticas, setTerminoFiltroPracticas] = useState('')
  const [paginaPracticas, setPaginaPracticas] = useState(1)
  const [resultadosPractica, setResultadosPractica] = useState<PracticaAdmisionBusquedaItem[]>([])
  const [indiceResultadoActivo, setIndiceResultadoActivo] = useState(-1)

  const abortBusquedaRef = useRef<AbortController | null>(null)
  const cacheBusquedaRef = useRef<Map<string, PracticaAdmisionBusquedaItem[]>>(new Map())

  const practicasFiltradas = useMemo(() => {
    const termino = normalizarBusqueda(terminoFiltroPracticas)
    if (!termino) return practicas

    return practicas.filter((p) => {
      const codigo = normalizarBusqueda(p.codigo)
      const descripcion = normalizarBusqueda(p.descripcion)
      return codigo.includes(termino) || descripcion.includes(termino)
    })
  }, [practicas, terminoFiltroPracticas])

  const totalPaginasPracticas = Math.max(1, Math.ceil(practicasFiltradas.length / PRACTICAS_POR_PAGINA))
  const paginaPracticasActual = Math.min(paginaPracticas, totalPaginasPracticas)

  const practicasPaginadas = useMemo(() => {
    const desde = (paginaPracticasActual - 1) * PRACTICAS_POR_PAGINA
    return practicasFiltradas.slice(desde, desde + PRACTICAS_POR_PAGINA)
  }, [paginaPracticasActual, practicasFiltradas])

  const buscarPracticaNomenclador = async (
    terminoRaw: string,
    opciones?: { forzar?: boolean; exactoCodigo?: boolean; limit?: number }
  ): Promise<PracticaAdmisionBusquedaItem[]> => {
    const forzar = opciones?.forzar ?? false
    const exactoCodigo = opciones?.exactoCodigo ?? false
    const limit = opciones?.limit ?? 20
    const termino = terminoRaw.trim()
    if (termino.length < 2) {
      setResultadosPractica([])
      setIndiceResultadoActivo(-1)
      return []
    }

    const convenioIdParsed = Number.parseInt(String(obraSocialId ?? ''), 10)
    const convenioId = Number.isFinite(convenioIdParsed) ? convenioIdParsed : undefined

    const cacheKey = `${convenioId ?? 'ALL'}:${termino.toUpperCase()}:${exactoCodigo ? 'exact' : 'mixed'}:${limit}`
    if (!forzar) {
      const cacheados = cacheBusquedaRef.current.get(cacheKey)
      if (cacheados) {
        setResultadosPractica(cacheados)
        setIndiceResultadoActivo(cacheados.length > 0 ? 0 : -1)
        return cacheados
      }
    }

    abortBusquedaRef.current?.abort()
    const controller = new AbortController()
    abortBusquedaRef.current = controller

    setBuscandoPractica(true)
    try {
      const params = new URLSearchParams({ q: termino.trim() })
      if (typeof convenioId === 'number') {
        params.set('convenioId', String(convenioId))
      }
      params.set('lite', '1')
      params.set('fallback', '1')
      params.set('limit', String(limit))
      if (exactoCodigo) {
        params.set('exact', '1')
      }

      const res = await fetch(`/api/practicas-nomenclador?${params.toString()}`, {
        signal: controller.signal,
        cache: 'no-store',
      })
      const json = await res.json()
      if (json.ok) {
        const raw = json.data
        const items = Array.isArray(raw) ? raw : (raw?.items ?? [])
        const resultados = items as PracticaAdmisionBusquedaItem[]
        cacheBusquedaRef.current.set(cacheKey, resultados)
        setResultadosPractica(resultados)
        setIndiceResultadoActivo(resultados.length > 0 ? 0 : -1)
        return resultados
      }
    } catch {
      if (controller.signal.aborted) return []
      setResultadosPractica([])
      setIndiceResultadoActivo(-1)
    } finally {
      if (!controller.signal.aborted) {
        setBuscandoPractica(false)
      }
    }

    return []
  }

  const seleccionarResultadoConEnter = async () => {
    const termino = terminoBusquedaPractica.trim()
    if (termino.length < 2) return

    abortBusquedaRef.current?.abort()
    setBuscandoPractica(false)

    const resultadosActuales =
      resultadosPractica.length > 0
        ? resultadosPractica
        : await buscarPracticaNomenclador(termino, { forzar: true, limit: 20 })

    if (resultadosActuales.length === 0) return

    const codigoIngresado = termino.toUpperCase()
    const esCodigo = /^[A-Z0-9]{1,8}$/.test(codigoIngresado)

    if (esCodigo) {
      let exacta = resultadosActuales.find(
        (r) => r.codigo.trim().toUpperCase() === codigoIngresado
      )

      if (!exacta) {
        const exactas = await buscarPracticaNomenclador(termino, {
          forzar: true,
          exactoCodigo: true,
          limit: 10,
        })
        exacta = exactas.find(
          (r) => r.codigo.trim().toUpperCase() === codigoIngresado
        )
      }

      if (exacta) {
        agregarPractica(exacta)
        return
      }

      setBuscandoPractica(false)
      setResultadosPractica([])
      setIndiceResultadoActivo(-1)
      return
    }

    const candidato = resultadosActuales[indiceResultadoActivo >= 0 ? indiceResultadoActivo : 0]
    if (candidato) {
      agregarPractica(candidato)
    }
  }

  useEffect(() => {
    const termino = terminoBusquedaPractica.trim()
    if (termino.length < 2) {
      setResultadosPractica([])
      setIndiceResultadoActivo(-1)
      return
    }

    const timer = setTimeout(() => {
      void buscarPracticaNomenclador(termino, { limit: 20 })
    }, 180)

    return () => clearTimeout(timer)
  }, [terminoBusquedaPractica, obraSocialId])

  useEffect(() => {
    cacheBusquedaRef.current.clear()
    setResultadosPractica([])
    setIndiceResultadoActivo(-1)
    abortBusquedaRef.current?.abort()
  }, [obraSocialId])

  useEffect(() => {
    return () => {
      abortBusquedaRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    setPaginaPracticas(1)
  }, [terminoFiltroPracticas])

  useEffect(() => {
    onPendingSearchChange?.({
      termino: terminoBusquedaPractica,
      hayResultados: resultadosPractica.length > 0,
    })
  }, [terminoBusquedaPractica, resultadosPractica.length, onPendingSearchChange])

  const agregarPractica = (practica: PracticaAdmisionBusquedaItem) => {
    const matriculaDefault = obtenerMatriculaDefault()

    setPracticas((prev) => [
      ...prev,
      {
        tempId: crearTempId(),
        convenioId: practica.convenioId,
        codigo: practica.codigo,
        descripcion: practica.descripcion,
        numeroAutorizacion: '',
        desglose: {
          valorEspecialista: practica.valorEspecialista ?? null,
          valorAyudante: practica.valorAyudante ?? null,
          valorAnestesista: practica.valorAnestesista ?? null,
          valorGastos: practica.valorGastos ?? null,
          valorTotal: null,
        },
        seleccionComponentes: seleccionPorDefecto({
          valorEspecialista: practica.valorEspecialista ?? null,
          valorAyudante: practica.valorAyudante ?? null,
          valorAnestesista: practica.valorAnestesista ?? null,
          valorGastos: practica.valorGastos ?? null,
          valorTotal: null,
        }),
        requiereMatriculaEspecialista: practica.valorEspecialista != null,
        requiereMatriculaAnestesista: practica.valorAnestesista != null,
        matriculaEspecialista: practica.valorEspecialista != null ? matriculaDefault : null,
        matriculaAnestesista: practica.valorAnestesista != null ? matriculaDefault : null,
      },
    ])
    setResultadosPractica([])
    setTerminoBusquedaPractica('')
    setIndiceResultadoActivo(-1)
    setBuscandoPractica(false)
  }

  const quitarPractica = (tempId: string) => {
    setPracticas((prev) => prev.filter((p) => p.tempId !== tempId))
  }

  return (
    <div className="his-card p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">Prácticas realizadas</h3>
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={terminoBusquedaPractica}
            onChange={(e) => setTerminoBusquedaPractica(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                if (resultadosPractica.length === 0) return
                e.preventDefault()
                setIndiceResultadoActivo((prev) => {
                  if (prev < 0) return 0
                  return Math.min(prev + 1, resultadosPractica.length - 1)
                })
                return
              }

              if (e.key === 'ArrowUp') {
                if (resultadosPractica.length === 0) return
                e.preventDefault()
                setIndiceResultadoActivo((prev) => {
                  if (prev <= 0) return 0
                  return prev - 1
                })
                return
              }

              if (e.key === 'Enter') {
                e.preventDefault()
                void seleccionarResultadoConEnter()
              }

              if (e.key === 'Escape') {
                setResultadosPractica([])
                setIndiceResultadoActivo(-1)
              }
            }}
            placeholder={etiquetaBusqueda}
            disabled={disabled}
            className="w-full rounded-md border border-gray-300 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="button"
          onClick={() => void buscarPracticaNomenclador(terminoBusquedaPractica, { forzar: true, limit: 20 })}
          disabled={disabled || buscandoPractica || terminoBusquedaPractica.trim().length < 2}
          className="rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          {buscandoPractica ? 'Buscando...' : 'Buscar'}
        </button>
      </div>
      {resultadosPractica.length > 0 && (
        <div className="mb-3 rounded-md border bg-white shadow-sm max-h-48 overflow-y-auto divide-y">
          {resultadosPractica.map((p, idx) => (
            <button
              key={`${p.convenioId}-${p.codigo}`}
              type="button"
              onClick={() => agregarPractica(p)}
              onMouseEnter={() => setIndiceResultadoActivo(idx)}
              className={`w-full text-left px-3 py-2 transition-colors text-sm ${
                idx === indiceResultadoActivo ? 'bg-blue-50' : 'hover:bg-blue-50'
              }`}
            >
              <span className="font-mono text-xs text-gray-500 mr-2">{p.codigo}</span>
              {p.descripcion}
            </button>
          ))}
        </div>
      )}
      {practicas.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                value={terminoFiltroPracticas}
                onChange={(e) => setTerminoFiltroPracticas(e.target.value)}
                placeholder="Filtrar prácticas agregadas..."
                className="w-full rounded-md border border-gray-300 pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <p className="text-xs text-gray-500">
              {practicasFiltradas.length} de {practicas.length}
            </p>
          </div>
          <div className="divide-y border rounded-md">
            {practicasPaginadas.map((p) => (
              <div key={p.tempId} className="px-3 py-3 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-gray-500 w-20 shrink-0">{p.codigo}</span>
                  <span className="flex-1 text-sm text-gray-800">{p.descripcion}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <label className="text-xs text-gray-500">Aut.</label>
                    <input
                      type="text"
                      value={p.numeroAutorizacion ?? ''}
                      onChange={(e) => {
                        const value = e.target.value
                        setPracticas((prev) => prev.map((x) =>
                          x.tempId === p.tempId
                            ? { ...x, numeroAutorizacion: value }
                            : x
                        ))
                      }}
                      className="w-28 rounded border border-gray-300 px-2 py-1 text-xs"
                      placeholder="Nro autorización"
                      maxLength={50}
                    />
                  </div>
                  {p.requiereMatriculaEspecialista && (
                    <div className="flex items-center gap-1 shrink-0">
                      <label className="text-xs text-gray-500">Mat. HE</label>
                      <input
                        type="number"
                        min={1}
                        value={p.matriculaEspecialista ?? ''}
                        onChange={(e) => {
                          const value = e.target.value.trim()
                          setPracticas((prev) => prev.map((x) =>
                            x.tempId === p.tempId
                              ? { ...x, matriculaEspecialista: value ? parseInt(value, 10) || null : null }
                              : x
                          ))
                        }}
                        className="w-24 rounded border border-gray-300 px-2 py-1 text-xs"
                        placeholder="Matrícula"
                      />
                    </div>
                  )}
                  {p.requiereMatriculaAnestesista && (
                    <div className="flex items-center gap-1 shrink-0">
                      <label className="text-xs text-gray-500">Mat. HA</label>
                      <input
                        type="number"
                        min={1}
                        value={p.matriculaAnestesista ?? ''}
                        onChange={(e) => {
                          const value = e.target.value.trim()
                          setPracticas((prev) => prev.map((x) =>
                            x.tempId === p.tempId
                              ? { ...x, matriculaAnestesista: value ? parseInt(value, 10) || null : null }
                              : x
                          ))
                        }}
                        className="w-24 rounded border border-gray-300 px-2 py-1 text-xs"
                        placeholder="Matrícula"
                      />
                    </div>
                  )}
                  <button type="button" onClick={() => quitarPractica(p.tempId)} className="text-red-400 hover:text-red-600 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <ComponenteSelector
                  valores={p.desglose}
                  seleccion={p.seleccionComponentes}
                  onChange={(nuevaSeleccion) => {
                    setPracticas((prev) => prev.map((x) =>
                      x.tempId === p.tempId
                        ? { ...x, seleccionComponentes: nuevaSeleccion }
                        : x
                    ))
                  }}
                />
              </div>
            ))}
          </div>
          {practicasFiltradas.length > PRACTICAS_POR_PAGINA && (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-gray-500">
                Página {paginaPracticasActual} de {totalPaginasPracticas}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPaginaPracticas((prev) => Math.max(1, prev - 1))}
                  disabled={paginaPracticasActual <= 1}
                  className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setPaginaPracticas((prev) => Math.min(totalPaginasPracticas, prev + 1))}
                  disabled={paginaPracticasActual >= totalPaginasPracticas}
                  className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-400">No se han agregado prácticas.</p>
      )}
    </div>
  )
}
