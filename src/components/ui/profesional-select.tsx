'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  coincideBusquedaProfesional,
  nombreProfesionalParaMostrar,
  type ProfesionalBasico,
} from '@/lib/profesionales'

interface ProfesionalSelectProps {
  profesionales: ProfesionalBasico[]
  value: string
  onChange: (value: string) => void
  placeholderOption?: string
  searchPlaceholder?: string
  disabled?: boolean
  required?: boolean
  id?: string
  name?: string
  selectClassName?: string
  searchClassName?: string
}

const SELECT_CLASSNAME_DEFAULT =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100'

const SEARCH_CLASSNAME_DEFAULT =
  'w-full rounded-md border border-gray-200 px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400'

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
  placeholderOption = '-- Seleccionar profesional --',
  searchPlaceholder = 'Buscar por nombre o matricula',
  disabled = false,
  required = false,
  id,
  name,
  selectClassName = SELECT_CLASSNAME_DEFAULT,
  searchClassName = SEARCH_CLASSNAME_DEFAULT,
}: ProfesionalSelectProps) {
  const [termino, setTermino] = useState('')

  const profesionalSeleccionado = useMemo(
    () => profesionales.find((profesional) => String(profesional.id) === value) ?? null,
    [profesionales, value]
  )

  useEffect(() => {
    if (!profesionalSeleccionado) return
    if (termino.trim()) return

    setTermino(etiquetaProfesional(profesionalSeleccionado))
  }, [profesionalSeleccionado, termino])

  const profesionalesFiltrados = useMemo(() => {
    const filtrados = profesionales.filter((profesional) =>
      coincideBusquedaProfesional(profesional, termino)
    )

    if (!value) return filtrados

    const actual = profesionales.find((profesional) => String(profesional.id) === value)
    if (!actual) return filtrados
    if (filtrados.some((profesional) => profesional.id === actual.id)) return filtrados

    return [actual, ...filtrados]
  }, [profesionales, termino, value])

  const resolverSeleccionPorTexto = (texto: string): string => {
    const textoLimpio = texto.trim()
    if (!textoLimpio) return ''

    const soloDigitos = textoLimpio.replace(/\D+/g, '')

    const q = normalizar(textoLimpio)
    const exacto = profesionales.find((profesional) => {
      const nombreVisible = normalizar(nombreProfesionalParaMostrar(profesional.nombre))
      const nombreOriginal = normalizar(profesional.nombre)
      const matricula =
        profesional.matricula != null && String(profesional.matricula).trim() !== ''
          ? String(profesional.matricula).trim()
          : ''

      return nombreVisible === q || nombreOriginal === q || matricula === textoLimpio
    })

    if (exacto) return String(exacto.id)

    const coincidencias = profesionales.filter((profesional) =>
      coincideBusquedaProfesional(profesional, textoLimpio)
    )
    if (coincidencias.length === 1 && coincidencias[0]) return String(coincidencias[0].id)

    if (soloDigitos.length > 0) {
      const coincidenciasMatricula = profesionales.filter((profesional) => {
        if (profesional.matricula == null) return false
        return String(profesional.matricula).includes(soloDigitos)
      })

      if (coincidenciasMatricula[0]) return String(coincidenciasMatricula[0].id)
    }

    return ''
  }

  const handleTerminoChange = (nextTermino: string) => {
    setTermino(nextTermino)

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
          const elegido = profesionales.find((profesional) => String(profesional.id) === next)
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
    </div>
  )
}
