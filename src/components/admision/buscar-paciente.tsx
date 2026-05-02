'use client'

import { useState } from 'react'
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
  obraSocialId: number | null
  planId: number | null
  obraSocialCoseguroId: number | null
  numeroAfiliado: string | null
}

export function BuscarPaciente({ onSeleccionar, pacienteSeleccionado }: BuscarPacienteProps) {
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<ApiPaciente[]>([])
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [buscado, setBuscado] = useState(false)

  const buscar = async () => {
    if (!busqueda.trim()) return
    setBuscando(true)
    setError(null)
    setBuscado(false)
    setResultados([])

    try {
      const res = await fetch(
        `/api/pacientes?q=${encodeURIComponent(busqueda.trim())}&porPagina=10`
      )
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? 'Error en búsqueda')
      setResultados(json.data.items as ApiPaciente[])
      setBuscado(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al buscar')
    } finally {
      setBuscando(false)
    }
  }

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
      obraSocialId: paciente.obraSocialId,
      planId: paciente.planId,
      obraSocialCoseguroId: paciente.obraSocialCoseguroId,
      numeroAfiliado: paciente.numeroAfiliado,
    })
    setResultados([])
    setBusqueda('')
    setBuscado(false)
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
              if (e.key === 'Enter') {
                e.preventDefault()
                void buscar()
              }
            }}
            placeholder="Nombre, apellido o número de documento..."
            className="w-full rounded-md border border-gray-300 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="button"
          onClick={() => void buscar()}
          disabled={buscando || !busqueda.trim()}
          className="rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          {buscando ? 'Buscando...' : 'Buscar'}
        </button>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {resultados.length > 0 && (
        <div className="rounded-md border bg-white shadow-sm max-h-56 overflow-y-auto divide-y">
          {resultados.map((paciente) => (
            <button
              key={paciente.id}
              type="button"
              onClick={() => seleccionar(paciente)}
              className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors"
            >
              <p className="text-sm font-medium text-gray-900">{paciente.nombreCompleto}</p>
              <p className="text-xs text-gray-500">
                {paciente.tipoDocumento?.trim()} {paciente.numeroDocumento ?? '-'}
                {paciente.historiaClinica && ` · HC: ${paciente.historiaClinica}`}
              </p>
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
