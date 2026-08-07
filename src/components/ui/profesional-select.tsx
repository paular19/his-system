'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  coincideBusquedaProfesional,
  nombreProfesionalParaMostrar,
  type ProfesionalBasico,
} from '@/lib/profesionales'

type ProfesionalManualInput = {
  nombre: string
  matricula: number
}

interface ProfesionalSelectProps {
  profesionales: ProfesionalBasico[]
  value: string
  onChange: (value: string) => void
  autoSelectOnSearch?: boolean
  placeholderOption?: string
  searchPlaceholder?: string
  disabled?: boolean
  required?: boolean
  id?: string
  name?: string
  selectClassName?: string
  searchClassName?: string
  permitirCargaManual?: boolean
  textoBotonCargaManual?: string
  onCrearManual?: (input: ProfesionalManualInput) => Promise<ProfesionalBasico | null>
  onProfesionalCreado?: (profesional: ProfesionalBasico) => void
}

const SELECT_CLASSNAME_DEFAULT =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100'

const SEARCH_CLASSNAME_DEFAULT =
  'w-full rounded-md border border-gray-200 px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400'

async function crearProfesionalManualDefault(
  input: ProfesionalManualInput
): Promise<ProfesionalBasico | null> {
  const res = await fetch('/api/cirugia/profesionales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.ok || !json?.data) {
    throw new Error(json?.error ?? 'No se pudo crear el profesional')
  }

  const data = json.data as { id?: unknown; nombre?: unknown; matricula?: unknown }
  if (
    typeof data.id !== 'number' ||
    typeof data.nombre !== 'string' ||
    typeof data.matricula !== 'number'
  ) {
    throw new Error('Respuesta invalida al crear profesional')
  }

  return {
    id: data.id,
    nombre: data.nombre,
    matricula: data.matricula,
  }
}

function normalizar(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function etiquetaProfesional(profesional: ProfesionalBasico): string {
  const nombre = nombreProfesionalParaMostrar(profesional.nombre)
  if (typeof profesional.matricula === 'number' && profesional.matricula > 0) {
    return `${nombre} · MP ${profesional.matricula}`
  }
  return nombre
}

export function ProfesionalSelect({
  profesionales,
  value,
  onChange,
  autoSelectOnSearch = true,
  placeholderOption = '-- Seleccionar profesional --',
  searchPlaceholder = 'Buscar por nombre o matricula',
  disabled = false,
  required = false,
  id,
  name,
  selectClassName = SELECT_CLASSNAME_DEFAULT,
  searchClassName = SEARCH_CLASSNAME_DEFAULT,
  permitirCargaManual = false,
  textoBotonCargaManual = 'No esta en la lista? Cargar manualmente',
  onCrearManual,
  onProfesionalCreado,
}: ProfesionalSelectProps) {
  const [termino, setTermino] = useState('')
  const [manuales, setManuales] = useState<ProfesionalBasico[]>([])
  const [mostrarCargaManual, setMostrarCargaManual] = useState(false)
  const [nombreManual, setNombreManual] = useState('')
  const [matriculaManual, setMatriculaManual] = useState('')
  const [errorManual, setErrorManual] = useState<string | null>(null)
  const [guardandoManual, setGuardandoManual] = useState(false)

  useEffect(() => {
    if (manuales.length === 0) return

    setManuales((prev) =>
      prev.filter((item) => !profesionales.some((profesional) => profesional.id === item.id))
    )
  }, [profesionales, manuales.length])

  const todosProfesionales = useMemo(() => {
    const porId = new Map<number, ProfesionalBasico>()
    for (const profesional of profesionales) {
      porId.set(profesional.id, profesional)
    }
    for (const manual of manuales) {
      if (!porId.has(manual.id)) porId.set(manual.id, manual)
    }
    return Array.from(porId.values())
  }, [profesionales, manuales])

  const profesionalSeleccionado = useMemo(
    () => todosProfesionales.find((profesional) => String(profesional.id) === value) ?? null,
    [todosProfesionales, value]
  )

  useEffect(() => {
    if (!profesionalSeleccionado) return
    if (termino.trim()) return

    setTermino(etiquetaProfesional(profesionalSeleccionado))
  }, [profesionalSeleccionado, termino])

  const profesionalesFiltrados = useMemo(() => {
    const filtrados = todosProfesionales.filter((profesional) =>
      coincideBusquedaProfesional(profesional, termino)
    )

    if (!value) return filtrados

    const actual = todosProfesionales.find((profesional) => String(profesional.id) === value)
    if (!actual) return filtrados
    if (filtrados.some((profesional) => profesional.id === actual.id)) return filtrados

    return [actual, ...filtrados]
  }, [todosProfesionales, termino, value])

  const resolverSeleccionPorTexto = (texto: string): string => {
    const textoLimpio = texto.trim()
    if (!textoLimpio) return ''

    const soloDigitos = textoLimpio.replace(/\D+/g, '')

    const q = normalizar(textoLimpio)
    const exacto = todosProfesionales.find((profesional) => {
      const nombreVisible = normalizar(nombreProfesionalParaMostrar(profesional.nombre))
      const nombreOriginal = normalizar(profesional.nombre)
      const matricula =
        profesional.matricula != null && String(profesional.matricula).trim() !== ''
          ? String(profesional.matricula).trim()
          : ''

      return nombreVisible === q || nombreOriginal === q || matricula === textoLimpio
    })

    if (exacto) return String(exacto.id)

    const coincidencias = todosProfesionales.filter((profesional) =>
      coincideBusquedaProfesional(profesional, textoLimpio)
    )
    if (coincidencias.length === 1 && coincidencias[0]) return String(coincidencias[0].id)

    if (soloDigitos.length > 0) {
      const coincidenciasMatricula = todosProfesionales.filter((profesional) => {
        if (profesional.matricula == null) return false
        return String(profesional.matricula).includes(soloDigitos)
      })

      if (coincidenciasMatricula[0]) return String(coincidenciasMatricula[0].id)
    }

    return ''
  }

  const limpiarCargaManual = () => {
    setNombreManual('')
    setMatriculaManual('')
    setErrorManual(null)
  }

  const guardarProfesionalManual = async () => {
    if (guardandoManual || disabled) return

    const nombre = nombreManual.trim()
    const matricula = Number.parseInt(matriculaManual.trim(), 10)

    if (nombre.length < 3) {
      setErrorManual('Ingresa un nombre valido (minimo 3 caracteres).')
      return
    }

    if (!Number.isFinite(matricula) || matricula <= 0) {
      setErrorManual('La matricula debe ser un numero mayor a 0.')
      return
    }

    setErrorManual(null)
    setGuardandoManual(true)

    try {
      const creador = onCrearManual ?? crearProfesionalManualDefault
      const creado = await creador({ nombre, matricula })

      if (!creado || typeof creado.id !== 'number' || typeof creado.nombre !== 'string') {
        throw new Error('No se pudo crear el profesional')
      }

      setManuales((prev) => {
        if (prev.some((item) => item.id === creado.id)) return prev
        return [...prev, creado]
      })

      onProfesionalCreado?.(creado)
      onChange(String(creado.id))
      setTermino(etiquetaProfesional(creado))
      setMostrarCargaManual(false)
      limpiarCargaManual()
    } catch (error) {
      setErrorManual(error instanceof Error ? error.message : 'No se pudo crear el profesional')
    } finally {
      setGuardandoManual(false)
    }
  }

  const handleTerminoChange = (nextTermino: string) => {
    setTermino(nextTermino)

    if (!autoSelectOnSearch) {
      if (!nextTermino.trim()) onChange('')
      return
    }

    const seleccionado = resolverSeleccionPorTexto(nextTermino)
    onChange(seleccionado)
  }

  return (
    <div className="space-y-1">
      <input
        type="text"
        value={termino}
        onChange={(e) => handleTerminoChange(e.target.value)}
        onBlur={() => {
          if (!value) return
          if (profesionalSeleccionado) {
            setTermino(etiquetaProfesional(profesionalSeleccionado))
          }
        }}
        placeholder={searchPlaceholder}
        disabled={disabled}
        className={searchClassName}
      />

      <select
        id={id}
        name={name}
        value={value}
        onChange={(e) => {
          const next = e.target.value
          onChange(next)
          if (!next) {
            setTermino('')
            return
          }
          const elegido = todosProfesionales.find((profesional) => String(profesional.id) === next)
          if (elegido) {
            setTermino(etiquetaProfesional(elegido))
          }
        }}
        required={required}
        disabled={disabled}
        className={selectClassName}
      >
        <option value="">{placeholderOption}</option>
        {profesionalesFiltrados.map((profesional) => (
          <option key={profesional.id} value={String(profesional.id)}>
            {etiquetaProfesional(profesional)}
          </option>
        ))}
      </select>

      {permitirCargaManual && (
        <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-2 py-2">
          <button
            type="button"
            onClick={() => {
              setMostrarCargaManual((prev) => !prev)
              setErrorManual(null)
            }}
            disabled={disabled || guardandoManual}
            className="text-[11px] font-medium text-blue-700 hover:text-blue-800 disabled:opacity-50"
          >
            {mostrarCargaManual ? 'Cancelar carga manual' : textoBotonCargaManual}
          </button>

          {mostrarCargaManual && (
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
              <label className="text-[11px] text-gray-700">
                Nombre profesional
                <input
                  type="text"
                  value={nombreManual}
                  onChange={(e) => setNombreManual(e.target.value)}
                  disabled={disabled || guardandoManual}
                  placeholder="Ej: Dra Maria Perez"
                  className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900"
                />
              </label>

              <label className="text-[11px] text-gray-700">
                Matricula
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={matriculaManual}
                  onChange={(e) => setMatriculaManual(e.target.value)}
                  disabled={disabled || guardandoManual}
                  placeholder="Ej: 12345"
                  className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900"
                />
              </label>

              <div className="md:col-span-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void guardarProfesionalManual()}
                  disabled={disabled || guardandoManual}
                  className="rounded border border-blue-200 bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {guardandoManual ? 'Guardando...' : 'Guardar profesional'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMostrarCargaManual(false)
                    limpiarCargaManual()
                  }}
                  disabled={disabled || guardandoManual}
                  className="rounded border border-gray-300 bg-white px-2.5 py-1 text-[11px] text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                >
                  Cerrar
                </button>
              </div>

              {errorManual && (
                <p className="md:col-span-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
                  {errorManual}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
