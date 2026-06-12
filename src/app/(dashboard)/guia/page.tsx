export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Header } from '@/components/layout/header'
import { prisma } from '@/lib/db'
import {
  GUIA_MODULOS,
  GUIA_VIDEO_USABILIDAD,
  GUIA_VIDEOS_POR_MODULO,
  esGuiaModuloId,
  esGuiaPrioridadFeedback,
  esGuiaTipoFeedback,
} from '@/modules/guia/constants'
import {
  GuiaFeedbackBoard,
  type GuiaFeedbackItem,
} from '@/modules/guia/components/guia-feedback-board'

function extraerYoutubeId(url: string): string | null {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '')

    if (host === 'youtu.be') {
      const [id] = parsed.pathname.split('/').filter(Boolean)
      return id ?? null
    }

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (parsed.pathname === '/watch') {
        return parsed.searchParams.get('v')
      }

      if (parsed.pathname.startsWith('/embed/')) {
        const [, , id] = parsed.pathname.split('/')
        return id ?? null
      }

      if (parsed.pathname.startsWith('/shorts/')) {
        const [, , id] = parsed.pathname.split('/')
        return id ?? null
      }
    }

    return null
  } catch {
    return null
  }
}

function construirMiniaturaYoutube(url: string): string | null {
  const id = extraerYoutubeId(url)
  return id ? `/api/guia/video-thumbnail?id=${encodeURIComponent(id)}` : null
}

export default async function GuiaPage() {
  const miniaturaUsabilidad = construirMiniaturaYoutube(GUIA_VIDEO_USABILIDAD.url)

  let dbDisponible = true
  let feedbacks: Awaited<ReturnType<typeof prisma.guiaFeedback.findMany>> = []

  try {
    feedbacks = await prisma.guiaFeedback.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: 300,
    })
  } catch {
    dbDisponible = false
  }

  const feedbacksIniciales: GuiaFeedbackItem[] = []

  for (const item of feedbacks) {
    if (!esGuiaModuloId(item.modulo)) continue
    if (!esGuiaTipoFeedback(item.tipo)) continue
    if (!esGuiaPrioridadFeedback(item.prioridad)) continue

    feedbacksIniciales.push({
      id: item.id,
      modulo: item.modulo,
      tipo: item.tipo,
      prioridad: item.prioridad,
      titulo: item.titulo,
      comentario: item.comentario,
      respuesta: item.respuesta,
      respuestaAt: item.respuestaAt ? item.respuestaAt.toISOString() : null,
      respuestaUsuarioCodigo: item.respuestaUsuarioCodigo,
      respuestaUsuarioNombre: item.respuestaUsuarioNombre,
      respuestaUsuarioEmail: item.respuestaUsuarioEmail,
      pantalla: item.pantalla,
      pasos: item.pasos,
      resultadoEsperado: item.resultadoEsperado,
      usuarioNombre: item.usuarioNombre,
      usuarioEmail: item.usuarioEmail,
      usuarioCodigo: item.usuarioCodigo,
      createdAt: item.createdAt.toISOString(),
    })
  }

  return (
    <>
      <Header titulo="Guia del sistema" />

      <div className="p-6 space-y-6">
        {!dbDisponible && (
          <section className="his-card border-orange-200 bg-orange-50 p-4">
            <h2 className="text-sm font-semibold text-orange-800">
              Conexion a base de datos no disponible
            </h2>
            <p className="mt-1 text-sm text-orange-700">
              La guia sigue visible, pero los comentarios no pueden cargarse por ahora.
              Si estas con Starlink, proba con VPN activa y recarga esta pantalla.
            </p>
          </section>
        )}

        <section className="his-card p-5 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Como funciona el sistema</h2>
          <p className="text-sm text-gray-600">
            Esta guia resume el objetivo de cada modulo y concentra buenas practicas de uso para evitar errores de carga.
            A medida que avances, vas a encontrar videos paso a paso para cada circuito.
          </p>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-900">Estructura base del circuito operativo</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-blue-900">
              <li>Primero se registra el paciente en el modulo Pacientes.</li>
              <li>Con el paciente validado, se genera la admision segun el tipo de atencion.</li>
              <li>Las admisiones ambulatorias se gestionan desde Autorizaciones/Ambulatorio.</li>
              <li>Las internaciones se gestionan desde Internacion, con cama, movimientos y seguimiento.</li>
              <li>Las practicas de cirugia programada se cargan desde Cirugia como admision tipo INT: la cama queda reservada y luego se confirma al concretar el ingreso.</li>
              <li>Las cirugias de emergencia se registran desde Internacion, en el modulo de Cirugia de Emergencia.</li>
              <li>Luego se consolidan prestaciones en Facturacion para el cierre administrativo.</li>
              <li>Cada etapa debe cerrar correctamente antes de pasar a la siguiente para evitar reprocesos.</li>
            </ol>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {GUIA_MODULOS.map((modulo) => (
              <article key={modulo.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <p className="text-sm font-semibold text-gray-900">{modulo.nombre}</p>
                <p className="text-xs text-gray-600 mt-1">{modulo.descripcion}</p>
                <Link
                  href={modulo.ruta}
                  className="mt-3 inline-flex text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  Ir al modulo
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="his-card p-5 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Advertencias de uso</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600">
            <li>No recargues la pagina varias veces mientras una accion este procesando.</li>
            <li>Espera la confirmacion visual antes de pasar al siguiente paso.</li>
            <li>Si una grilla tarda en cargar, evita hacer multiples clics seguidos.</li>
            <li>Usa un solo navegador/pestana por tarea para evitar datos cruzados.</li>
            <li>Antes de cerrar, valida que el registro aparezca en el listado.</li>
          </ul>
        </section>

        <section className="his-card p-5 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Videos paso a paso</h2>
          <p className="text-sm text-gray-600">
            Cada modulo incluye sus tutoriales oficiales. Si no hay material publicado todavia, el espacio queda marcado como pendiente.
          </p>

          <article className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Video recomendado</p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
              {miniaturaUsabilidad ? (
                <img
                  src={miniaturaUsabilidad}
                  alt={GUIA_VIDEO_USABILIDAD.titulo}
                  className="h-28 w-full max-w-55 rounded-md border border-emerald-200 object-cover"
                  loading="lazy"
                />
              ) : null}
              <div>
                <p className="text-sm font-semibold text-emerald-900">{GUIA_VIDEO_USABILIDAD.titulo}</p>
                <a
                  href={GUIA_VIDEO_USABILIDAD.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex text-xs font-medium text-emerald-700 hover:text-emerald-800"
                >
                  Ver video de usabilidad
                </a>
              </div>
            </div>
          </article>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {GUIA_MODULOS.map((modulo) => {
              const videos = GUIA_VIDEOS_POR_MODULO[modulo.id] ?? []

              if (videos.length === 0) {
                return (
                  <div key={modulo.id} className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
                    <p className="text-sm font-semibold text-gray-800">{modulo.nombre}</p>
                    <p className="text-xs text-gray-600 mt-1">Video pendiente de carga</p>
                  </div>
                )
              }

              return (
                <article key={modulo.id} className="rounded-lg border border-gray-200 bg-white p-4">
                  <p className="text-sm font-semibold text-gray-900">{modulo.nombre}</p>
                  <ul className="mt-3 space-y-3">
                    {videos.map((video) => {
                      const miniatura = construirMiniaturaYoutube(video.url)

                      return (
                        <li key={`${modulo.id}-${video.url}`}>
                          <a
                            href={video.url}
                            target="_blank"
                            rel="noreferrer"
                            className="group block rounded-md border border-gray-200 p-2 hover:border-blue-300 hover:bg-blue-50"
                          >
                            {miniatura ? (
                              <img
                                src={miniatura}
                                alt={video.titulo}
                                className="h-24 w-full rounded object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-24 w-full items-center justify-center rounded bg-gray-100 text-xs text-gray-500">
                                Vista previa no disponible
                              </div>
                            )}
                            <p className="mt-2 text-xs font-medium text-gray-800 group-hover:text-blue-700">
                              {video.titulo}
                            </p>
                            <p className="text-[11px] text-gray-500">Abrir en YouTube</p>
                          </a>
                        </li>
                      )
                    })}
                  </ul>
                </article>
              )
            })}
          </div>
        </section>

        <section className="his-card p-5 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Como dejar buen feedback</h2>
          <p className="text-sm text-gray-600">
            Para que podamos resolver rapido, el comentario tiene que ser concreto y reproducible.
          </p>
          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600">
            <li>Defini el tipo: bug, mejora, duda o usabilidad.</li>
            <li>Escribi un titulo corto que describa el problema real.</li>
            <li>Indica pantalla o funcion donde ocurre.</li>
            <li>Detalla que hiciste (pasos) y que esperabas que sucediera.</li>
            <li>Marca prioridad alta solo si bloquea el trabajo o afecta datos criticos.</li>
          </ul>
        </section>

        <GuiaFeedbackBoard feedbacksIniciales={feedbacksIniciales} />
      </div>
    </>
  )
}
