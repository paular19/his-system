'use client'

import { useMemo, useState } from 'react'
import {
  GUIA_MODULOS,
  GUIA_MODULOS_IDS,
  type GuiaModuloId,
  GUIA_PRIORIDADES,
  GUIA_TIPOS_FEEDBACK,
  GUIA_TIPO_LABELS,
  type GuiaPrioridadFeedback,
  type GuiaTipoFeedback,
} from '@/modules/guia/constants'

export interface GuiaFeedbackItem {
  id: number
  modulo: GuiaModuloId
  tipo: GuiaTipoFeedback
  prioridad: GuiaPrioridadFeedback
  titulo: string
  comentario: string
  pantalla: string | null
  pasos: string | null
  resultadoEsperado: string | null
  usuarioNombre: string
  usuarioEmail: string
  usuarioCodigo: string
  createdAt: string
}

interface FormularioFeedback {
  tipo: GuiaTipoFeedback
  prioridad: GuiaPrioridadFeedback
  titulo: string
  comentario: string
  pantalla: string
  pasos: string
  resultadoEsperado: string
}

interface GuiaFeedbackBoardProps {
  feedbacksIniciales: GuiaFeedbackItem[]
}

function crearFormularioVacio(): FormularioFeedback {
  return {
    tipo: 'MEJORA',
    prioridad: 'MEDIA',
    titulo: '',
    comentario: '',
    pantalla: '',
    pasos: '',
    resultadoEsperado: '',
  }
}

function crearEstadoBooleanoInicial(valor: boolean): Record<GuiaModuloId, boolean> {
  const estado = {} as Record<GuiaModuloId, boolean>

  for (const moduloId of GUIA_MODULOS_IDS) {
    estado[moduloId] = valor
  }

  return estado
}

function crearEstadoTextoInicial(): Record<GuiaModuloId, string> {
  const estado = {} as Record<GuiaModuloId, string>

  for (const moduloId of GUIA_MODULOS_IDS) {
    estado[moduloId] = ''
  }

  return estado
}

function crearFormulariosIniciales(): Record<GuiaModuloId, FormularioFeedback> {
  const estado = {} as Record<GuiaModuloId, FormularioFeedback>

  for (const moduloId of GUIA_MODULOS_IDS) {
    estado[moduloId] = crearFormularioVacio()
  }

  return estado
}

export function GuiaFeedbackBoard({ feedbacksIniciales }: GuiaFeedbackBoardProps) {
  const [feedbacks, setFeedbacks] = useState<GuiaFeedbackItem[]>(feedbacksIniciales)
  const [formularios, setFormularios] = useState<Record<GuiaModuloId, FormularioFeedback>>(
    crearFormulariosIniciales
  )
  const [enviando, setEnviando] = useState<Record<GuiaModuloId, boolean>>(
    crearEstadoBooleanoInicial(false)
  )
  const [mensajes, setMensajes] = useState<Record<GuiaModuloId, string>>(
    crearEstadoTextoInicial
  )

  const feedbacksPorModulo = useMemo(() => {
    const agrupados = {} as Record<GuiaModuloId, GuiaFeedbackItem[]>

    for (const moduloId of GUIA_MODULOS_IDS) {
      agrupados[moduloId] = []
    }

    for (const feedback of feedbacks) {
      agrupados[feedback.modulo].push(feedback)
    }

    return agrupados
  }, [feedbacks])

  function actualizarFormulario<K extends keyof FormularioFeedback>(
    moduloId: GuiaModuloId,
    campo: K,
    valor: FormularioFeedback[K]
  ) {
    setFormularios((prev) => ({
      ...prev,
      [moduloId]: {
        ...prev[moduloId],
        [campo]: valor,
      },
    }))
  }

  async function enviarFeedback(moduloId: GuiaModuloId, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setMensajes((prev) => ({
      ...prev,
      [moduloId]: '',
    }))
    setEnviando((prev) => ({
      ...prev,
      [moduloId]: true,
    }))

    try {
      const body = {
        modulo: moduloId,
        ...formularios[moduloId],
      }

      const response = await fetch('/api/guia/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      const payload = await response.json()
      if (!response.ok || !payload?.ok || !payload?.data) {
        const message = payload?.error ?? 'No se pudo guardar el feedback.'
        throw new Error(message)
      }

      const nuevo = payload.data as GuiaFeedbackItem

      setFeedbacks((prev) => [nuevo, ...prev])
      setFormularios((prev) => ({
        ...prev,
        [moduloId]: crearFormularioVacio(),
      }))
      setMensajes((prev) => ({
        ...prev,
        [moduloId]: 'Feedback enviado. Gracias por colaborar.',
      }))
    } catch (error) {
      const mensaje =
        error instanceof Error ? error.message : 'No se pudo guardar el feedback.'
      setMensajes((prev) => ({
        ...prev,
        [moduloId]: mensaje,
      }))
    } finally {
      setEnviando((prev) => ({
        ...prev,
        [moduloId]: false,
      }))
    }
  }

  return (
    <section className="his-card p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Feedback por modulo</h2>
        <p className="text-sm text-gray-600 mt-1">
          Cada modulo tiene su propio espacio para reportar dudas, bugs y mejoras. Los comentarios guardan quien lo envio y fecha.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {GUIA_MODULOS.map((modulo) => {
          const formulario = formularios[modulo.id]
          const comentarios = feedbacksPorModulo[modulo.id] ?? []

          return (
            <article key={modulo.id} className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                  {modulo.nombre}
                </p>
                <p className="text-sm text-gray-600 mt-1">{modulo.descripcion}</p>
              </div>

              <form className="space-y-3" onSubmit={(event) => enviarFeedback(modulo.id, event)}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-sm text-gray-700">
                    Tipo
                    <select
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={formulario.tipo}
                      onChange={(event) =>
                        actualizarFormulario(modulo.id, 'tipo', event.target.value as GuiaTipoFeedback)
                      }
                    >
                      {GUIA_TIPOS_FEEDBACK.map((tipo) => (
                        <option key={tipo} value={tipo}>
                          {GUIA_TIPO_LABELS[tipo]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm text-gray-700">
                    Prioridad
                    <select
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={formulario.prioridad}
                      onChange={(event) =>
                        actualizarFormulario(
                          modulo.id,
                          'prioridad',
                          event.target.value as GuiaPrioridadFeedback
                        )
                      }
                    >
                      {GUIA_PRIORIDADES.map((prioridad) => (
                        <option key={prioridad} value={prioridad}>
                          {prioridad}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="block text-sm text-gray-700">
                  Titulo
                  <input
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    type="text"
                    required
                    minLength={6}
                    maxLength={140}
                    placeholder="Ej: Validar mejor el campo numero de afiliado"
                    value={formulario.titulo}
                    onChange={(event) =>
                      actualizarFormulario(modulo.id, 'titulo', event.target.value)
                    }
                  />
                </label>

                <label className="block text-sm text-gray-700">
                  Pantalla o funcion (opcional)
                  <input
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    type="text"
                    maxLength={120}
                    placeholder="Ej: Nueva admision > datos de obra social"
                    value={formulario.pantalla}
                    onChange={(event) =>
                      actualizarFormulario(modulo.id, 'pantalla', event.target.value)
                    }
                  />
                </label>

                <label className="block text-sm text-gray-700">
                  Comentario
                  <textarea
                    className="mt-1 min-h-24 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    required
                    minLength={20}
                    maxLength={2000}
                    placeholder="Describi claramente que paso, cuando ocurrio y como impacta tu tarea."
                    value={formulario.comentario}
                    onChange={(event) =>
                      actualizarFormulario(modulo.id, 'comentario', event.target.value)
                    }
                  />
                </label>

                <label className="block text-sm text-gray-700">
                  Pasos para reproducir (opcional)
                  <textarea
                    className="mt-1 min-h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    maxLength={1500}
                    placeholder="1) Entrar al modulo... 2) Completar... 3) Guardar..."
                    value={formulario.pasos}
                    onChange={(event) =>
                      actualizarFormulario(modulo.id, 'pasos', event.target.value)
                    }
                  />
                </label>

                <label className="block text-sm text-gray-700">
                  Resultado esperado (opcional)
                  <textarea
                    className="mt-1 min-h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    maxLength={1500}
                    placeholder="Que esperabas que hiciera el sistema."
                    value={formulario.resultadoEsperado}
                    onChange={(event) =>
                      actualizarFormulario(modulo.id, 'resultadoEsperado', event.target.value)
                    }
                  />
                </label>

                <button
                  type="submit"
                  disabled={enviando[modulo.id]}
                  className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {enviando[modulo.id] ? 'Enviando...' : 'Enviar feedback'}
                </button>

                {mensajes[modulo.id] && (
                  <p className="text-xs text-gray-600">{mensajes[modulo.id]}</p>
                )}
              </form>

              <div className="space-y-2 border-t border-gray-100 pt-3">
                <p className="text-sm font-medium text-gray-900">Comentarios recientes</p>
                {comentarios.length === 0 ? (
                  <p className="text-xs text-gray-500">
                    Todavia no hay comentarios para este modulo.
                  </p>
                ) : (
                  comentarios.slice(0, 6).map((comentario) => (
                    <div key={comentario.id} className="rounded-md border border-gray-200 bg-gray-50 p-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                        <span className="rounded-full bg-white px-2 py-0.5 border border-gray-200">
                          {GUIA_TIPO_LABELS[comentario.tipo]}
                        </span>
                        <span className="rounded-full bg-white px-2 py-0.5 border border-gray-200">
                          {comentario.prioridad}
                        </span>
                        <span>
                          {new Date(comentario.createdAt).toLocaleString('es-AR')}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-medium text-gray-900">{comentario.titulo}</p>
                      <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
                        {comentario.comentario}
                      </p>
                      {comentario.pantalla && (
                        <p className="mt-2 text-xs text-gray-600">
                          Pantalla: {comentario.pantalla}
                        </p>
                      )}
                      {comentario.pasos && (
                        <p className="mt-1 text-xs text-gray-600 whitespace-pre-wrap">
                          Pasos: {comentario.pasos}
                        </p>
                      )}
                      {comentario.resultadoEsperado && (
                        <p className="mt-1 text-xs text-gray-600 whitespace-pre-wrap">
                          Esperado: {comentario.resultadoEsperado}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-gray-500">
                        Enviado por {comentario.usuarioNombre || comentario.usuarioCodigo} ({comentario.usuarioEmail})
                      </p>
                    </div>
                  ))
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
