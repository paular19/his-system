import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

export interface ApiResponse<T = unknown> {
  ok: boolean
  data?: T
  error?: string
  errores?: Record<string, string[]>
}

function serializarSeguroJson<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    )
  ) as T
}

export function apiOk<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ ok: true, data: serializarSeguroJson(data) }, { status })
}

export function apiCreado<T>(data: T): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    { ok: true, data: serializarSeguroJson(data) },
    { status: 201 }
  )
}

export function apiError(
  mensaje: string,
  status = 500
): NextResponse<ApiResponse> {
  return NextResponse.json({ ok: false, error: mensaje }, { status })
}

export function apiNoAutorizado(): NextResponse<ApiResponse> {
  return NextResponse.json(
    { ok: false, error: 'No autenticado' },
    { status: 401 }
  )
}

export function apiForbidden(): NextResponse<ApiResponse> {
  return NextResponse.json(
    { ok: false, error: 'Sin permisos para realizar esta acción' },
    { status: 403 }
  )
}

export function apiNotFound(recurso = 'Recurso'): NextResponse<ApiResponse> {
  return NextResponse.json(
    { ok: false, error: `${recurso} no encontrado` },
    { status: 404 }
  )
}

export function apiValidationError(error: ZodError): NextResponse<ApiResponse> {
  const errores = error.flatten().fieldErrors as Record<string, string[]>
  return NextResponse.json(
    { ok: false, error: 'Datos inválidos', errores },
    { status: 422 }
  )
}

/**
 * Wrapper para manejar errores en route handlers.
 * Captura ZodError, errores conocidos y errores inesperados.
 */
export function manejarErrorApi(error: unknown): NextResponse<ApiResponse> {
  if (error instanceof ZodError) {
    return apiValidationError(error)
  }

  if (error instanceof Error) {
    if (error.message === 'No autenticado') return apiNoAutorizado()
    if (error.message === 'Sin permisos') return apiForbidden()
    if (error.message.includes('no encontrado')) return apiNotFound()
    if (error.message.includes('Ya existe')) return apiError(error.message, 409)

    // En producción no exponer detalles internos
    const mensaje =
      process.env.NODE_ENV === 'development'
        ? error.message
        : 'Error interno del servidor'
    return apiError(mensaje)
  }

  return apiError('Error interno del servidor')
}
