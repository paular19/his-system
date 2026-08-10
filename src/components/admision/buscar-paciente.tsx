'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, X, User } from 'lucide-react'
import type { PacienteResumen } from '@/modules/admision/types'

interface BuscarPacienteProps {
  onSeleccionar: (paciente: PacienteResumen | null) => void
  pacienteSeleccionado: PacienteResumen | null
}

interface ApiPaciente {
  id: number
  historiaClinica: number | null
  apellido: string | null
  nombre: string | null
  nombreCompleto: string
  tipoDocumento: string | null
  numeroDocumento: number | null
  sexo: string | null
  fechaNacimiento: string | null
  domicilio: string | null
  telefonoFijo: string | null
  celular1: string | null
  email: string | null
  profesionalCabeceraId: number | null
  obraSocialId: number | null
  planId: number | null
  obraSocialCoseguroId: number | null
  obraSocialNombre: string | null
  planDescripcion: string | null
  obraSocialCoseguroNombre: string | null
  numeroAfiliado: string | null
  nombreTutor: string | null
  telefonoTutor: string | null
}

function normalizarTexto(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function BuscarPaciente({ onSeleccionar, pacienteSeleccionado }: BuscarPacienteProps) {
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<ApiPaciente[]>([])
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [buscado, setBuscado] = useState(false)
  const [indiceActivo, setIndiceActivo] = useState(-1)

  const abortRef = useRef<AbortController | null>(null)
  const cacheRef = useRef<Map<string, ApiPaciente[]>>(new Map())

  const buscar = async (terminoRaw?: string, forzar = false) => {
    const termino = (terminoRaw ?? busqueda).trim()
    if (termino.length < 2) {
      setResultados([])
      setBuscado(false)
      setIndiceActivo(-1)
      return
    }

    const cacheKey = termino.toLowerCase()
    if (!forzar) {
      const cacheado = cacheRef.current.get(cacheKey)
      if (cacheado) {
        setResultados(cacheado)
        setBuscado(true)
        setIndiceActivo(cacheado.length > 0 ? 0 : -1)
        return
      }
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setBuscando(true)
    setError(null)

    try {
      const res = await fetch(
        `/api/pacientes/busqueda-rapida?q=${encodeURIComponent(termino)}&limit=10`,
        { signal: controller.signal, cache: 'no-store' }
      )
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? 'Error en búsqueda')

      const items = Array.isArray(json.data) ? (json.data as ApiPaciente[]) : []
      cacheRef.current.set(cacheKey, items)
      setResultados(items)
      setBuscado(true)
      setIndiceActivo(items.length > 0 ? 0 : -1)
    } catch (err) {
      if (controller.signal.aborted) return
      setError(err instanceof Error ? err.message : 'Error al buscar')
      setResultados([])
      setBuscado(true)
      setIndiceActivo(-1)
    } finally {
      if (!controller.signal.aborted) {
        setBuscando(false)
      }
    }
  }

  useEffect(() => {
    const termino = busqueda.trim()
    if (termino.length < 2) {
      setResultados([])
      setBuscado(false)
      setIndiceActivo(-1)
      setBuscando(false)
      setError(null)
      abortRef.current?.abort()
      return
    }

    const timer = setTimeout(() => {
      void buscar(termino)
    }, 180)

    return () => clearTimeout(timer)
  }, [busqueda])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const seleccionar = (paciente: ApiPaciente) => {
    onSeleccionar({
      id: paciente.id,
      historiaClinica: paciente.historiaClinica,
      apellido: paciente.apellido,
      nombre: paciente.nombre,
      nombreCompleto: paciente.nombreCompleto,
      tipoDocumento: paciente.tipoDocumento,
      numeroDocumento: paciente.numeroDocumento,
      sexo: paciente.sexo,
      fechaNacimiento: paciente.fechaNacimiento,
      domicilio: paciente.domicilio,
      telefonoFijo: paciente.telefonoFijo,
      celular1: paciente.celular1,
      email: paciente.email,
      profesionalCabeceraId: paciente.profesionalCabeceraId,
      obraSocialId: paciente.obraSocialId,
      planId: paciente.planId,
      obraSocialCoseguroId: paciente.obraSocialCoseguroId,
      obraSocialNombre: paciente.obraSocialNombre,
      planDescripcion: paciente.planDescripcion,
      obraSocialCoseguroNombre: paciente.obraSocialCoseguroNombre,
      numeroAfiliado: paciente.numeroAfiliado,
      nombreTutor: paciente.nombreTutor,
      telefonoTutor: paciente.telefonoTutor,
    })
    setResultados([])
    setBusqueda('')
    setBuscado(false)
    setIndiceActivo(-1)
  }

  if (pacienteSeleccionado) {
    return (
      <div className="flex items-center justify-between rounded-md border border-green-200 bg-green-50 px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="rounded-full bg-green-100 p-1.5">
            <User className="h-4 w-4 text-green-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-green-900">
              {pacienteSeleccionado.nombreCompleto}
            </p>
            <p className="text-xs text-green-700">
              {pacienteSeleccionado.tipoDocumento?.trim()}{' '}
              {pacienteSeleccionado.numeroDocumento ?? '-'}
              {pacienteSeleccionado.historiaClinica && (
                <> · HC: {pacienteSeleccionado.historiaClinica}</>
              )}
            </p>
            {(pacienteSeleccionado.obraSocialNombre || pacienteSeleccionado.obraSocialCoseguroNombre) && (
              <p className="text-[11px] text-green-700">
                Cobertura:{' '}
                {`${pacienteSeleccionado.obraSocialNombre ?? '—'} · Coseguro: ${pacienteSeleccionado.obraSocialCoseguroNombre ?? 'Sin coseguro'}`}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onSeleccionar(null)}
          className="ml-3 rounded p-1 text-green-600 hover:bg-green-100 hover:text-green-800 transition-colors"
          title="Cambiar paciente"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                if (resultados.length === 0) return
                e.preventDefault()
                setIndiceActivo((prev) => {
                  if (prev < 0) return 0
                  return Math.min(prev + 1, resultados.length - 1)
                })
                return
              }

              if (e.key === 'ArrowUp') {
                if (resultados.length === 0) return
                e.preventDefault()
                setIndiceActivo((prev) => {
                  if (prev <= 0) return 0
                  return prev - 1
                })
                return
              }

              if (e.key === 'Enter') {
                e.preventDefault()
                if (resultados.length > 0) {
                  const candidato = resultados[indiceActivo >= 0 ? indiceActivo : 0]
                  if (candidato) {
                    seleccionar(candidato)
                    return
                  }
                }

                void buscar(undefined, true)
              }

              if (e.key === 'Escape') {
                setResultados([])
                setIndiceActivo(-1)
              }
            }}
            placeholder="Nombre, apellido o número de documento..."
            className="w-full rounded-md border border-gray-300 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="button"
          onClick={() => void buscar(undefined, true)}
          disabled={buscando || !busqueda.trim()}
          className="rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          {buscando ? 'Buscando...' : 'Buscar'}
        </button>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {resultados.length > 0 && (
        <div className="rounded-md border bg-white shadow-sm max-h-56 overflow-y-auto divide-y">
          {resultados.map((paciente, idx) => (
            <button
              key={paciente.id}
              type="button"
              onClick={() => seleccionar(paciente)}
              onMouseEnter={() => setIndiceActivo(idx)}
              className={`w-full text-left px-3 py-2.5 transition-colors ${
                idx === indiceActivo ? 'bg-blue-50' : 'hover:bg-blue-50'
              }`}
            >
              <p className="text-sm font-medium text-gray-900">{paciente.nombreCompleto}</p>
              <p className="text-xs text-gray-500">
                {paciente.tipoDocumento?.trim()} {paciente.numeroDocumento ?? '-'}
                {paciente.historiaClinica && ` · HC: ${paciente.historiaClinica}`}
              </p>
              {(paciente.obraSocialNombre || paciente.obraSocialCoseguroNombre) && (
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {`${paciente.obraSocialNombre ?? '—'} · Coseguro: ${paciente.obraSocialCoseguroNombre ?? 'Sin coseguro'}`}
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {buscado && resultados.length === 0 && (
        <div className="rounded-md border border-dashed bg-gray-50 px-4 py-3 text-sm text-gray-500">
          No se encontraron pacientes.{' '}
          <a
            href="/dashboard/pacientes/nuevo"
            className="text-blue-600 hover:underline font-medium"
          >
            Registrar nuevo paciente
          </a>
        </div>
      )}
    </div>
  )
}
