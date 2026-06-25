import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

type FechaValor = Date | string | null | undefined

function parseFecha(fecha: FechaValor): Date | null {
  if (!fecha) return null
  const d = typeof fecha === 'string' ? new Date(fecha) : fecha
  return Number.isNaN(d.getTime()) ? null : d
}

function partesFechaUTC(fecha: FechaValor): { year: number; month: number; day: number } | null {
  const d = parseFecha(fecha)
  if (!d) return null
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  }
}

/**
 * Formatea fechas de calendario (sin hora) evitando corrimientos por zona horaria.
 */
export function formatearFechaCalendario(fecha: FechaValor): string {
  const partes = partesFechaUTC(fecha)
  if (!partes) return '-'
  const day = String(partes.day).padStart(2, '0')
  const month = String(partes.month).padStart(2, '0')
  return `${day}/${month}/${partes.year}`
}

/**
 * Convierte una fecha a YYYY-MM-DD para inputs type="date" sin corrimiento horario.
 */
export function fechaCalendarioAInput(fecha: FechaValor): string {
  const partes = partesFechaUTC(fecha)
  if (!partes) return ''
  const month = String(partes.month).padStart(2, '0')
  const day = String(partes.day).padStart(2, '0')
  return `${partes.year}-${month}-${day}`
}

/**
 * Formatea una fecha al formato local argentino (DD/MM/YYYY).
 */
export function formatearFecha(fecha: Date | string | null | undefined): string {
  if (!fecha) return '-'
  const d = typeof fecha === 'string' ? new Date(fecha) : fecha
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/**
 * Formatea una fecha con hora.
 */
export function formatearFechaHora(fecha: Date | string | null | undefined): string {
  if (!fecha) return '-'
  const d = typeof fecha === 'string' ? new Date(fecha) : fecha
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Formatea un monto monetario en pesos argentinos.
 */
export function formatearMoneda(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined) return '$0,00'
  const num = typeof valor === 'string' ? parseFloat(valor) : valor
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(num)
}

/**
 * Calcula la edad en años a partir de la fecha de nacimiento.
 */
export function calcularEdad(fechaNacimiento: Date | string | null | undefined): number | null {
  const partesNacimiento = partesFechaUTC(fechaNacimiento)
  if (!partesNacimiento) return null
  const today = new Date()
  let edad = today.getFullYear() - partesNacimiento.year
  const m = today.getMonth() + 1 - partesNacimiento.month
  if (m < 0 || (m === 0 && today.getDate() < partesNacimiento.day)) {
    edad--
  }
  return edad
}

/**
 * Sanitiza una cadena para prevenir XSS básico.
 * Para uso en texto plano, no en HTML renderizado.
 */
export function sanitizarTexto(texto: string): string {
  return texto
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim()
}

/**
 * Genera el nombre completo concatenando apellido y nombre.
 */
export function generarNombreCompleto(apellido: string, nombre: string): string {
  return `${apellido.trim().toUpperCase()}, ${nombre.trim()}`
}
