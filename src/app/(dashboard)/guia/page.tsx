export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Header } from '@/components/layout/header'
import { getUsuarioSesion } from '@/lib/auth'
import { ROLES } from '@/lib/auth/rbac'
import {
  GUIA_MODULOS,
  type GuiaVideoItem,
} from '@/modules/guia/constants'

const MODULOS_EXCLUIDOS_ADMISION = new Set(['CIRUGIA', 'TURNOS', 'FACTURACION'])
const MODULOS_EXCLUIDOS_ORDENES = new Set(['CIRUGIA', 'TURNOS', 'FACTURACION'])

const GUIA_MODULOS_ADMISION = [
  ...GUIA_MODULOS.filter((modulo) => !MODULOS_EXCLUIDOS_ADMISION.has(modulo.id)),
  {
    id: 'PRESUPUESTO',
    nombre: 'Presupuesto',
    descripcion: 'Cotizacion y simulacion de practicas para orientar al paciente.',
    ruta: '/dashboard/cotizador',
  },
]

const GUIA_MODULOS_ORDENES = GUIA_MODULOS.filter(
  (modulo) => !MODULOS_EXCLUIDOS_ORDENES.has(modulo.id)
)

const GUIA_VIDEOS_CENTRALES_ADMISION: GuiaVideoItem[] = [
  {
    titulo: 'Sistema HIS - Video central del sistema',
    url: 'https://www.youtube.com/watch?v=c3FHHSiQTsg',
  },
  {
    titulo: 'Uso de multiples pestanas',
    url: 'https://www.youtube.com/watch?v=U5hMlxJjCF0',
  },
]

const GUIA_VIDEOS_CENTRALES_ORDENES: GuiaVideoItem[] = [
  {
    titulo: 'Uso de multiples pestanas',
    url: 'https://www.youtube.com/watch?v=U5hMlxJjCF0',
  },
]

const GUIA_VIDEOS_PASO_A_PASO_ADMISION: Array<{
  id: string
  nombre: string
  videos: GuiaVideoItem[]
}> = [
  {
    id: 'PACIENTES_ADMISION',
    nombre: 'Registro de paciente y admision',
    videos: [
      {
        titulo: 'Registro de paciente y admision',
        url: 'https://www.youtube.com/watch?v=XMh5exNwx9w',
      },
    ],
  },
  {
    id: 'INTERNACION_ADMISION',
    nombre: 'Internacion (admision y modulo general)',
    videos: [
      {
        titulo: 'Admision por internacion',
        url: 'https://www.youtube.com/watch?v=PAoQoO66KAE',
      },
      {
        titulo: 'Modulo general de internacion',
        url: 'https://www.youtube.com/watch?v=jKsp8N3xBH8',
      },
    ],
  },
  {
    id: 'PRESUPUESTO',
    nombre: 'Uso del modulo de presupuesto',
    videos: [
      {
        titulo: 'Uso del modulo de presupuesto',
        url: 'https://youtu.be/xllLmDDun4E',
      },
    ],
  },
]

const GUIA_VIDEOS_PASO_A_PASO_ORDENES: Array<{
  id: string
  nombre: string
  videos: GuiaVideoItem[]
}> = [
  {
    id: 'PACIENTES_ADMISION',
    nombre: 'Registro de paciente y admision',
    videos: [
      {
        titulo: 'Registro de paciente y admision',
        url: 'https://www.youtube.com/watch?v=XMh5exNwx9w',
      },
    ],
  },
  {
    id: 'INTERNACION_ORDENES',
    nombre: 'Internacion',
    videos: [
      {
        titulo: 'Admision por internacion',
        url: 'https://www.youtube.com/watch?v=PAoQoO66KAE',
      },
      {
        titulo: 'MODULO GENERAL DE INTERNACION',
        url: 'https://youtube.com/watch?v=kEghaXK6jCU&feature=youtu.be',
      },
      {
        titulo: 'CARGA DE PROTOCOLO BIOQUIMICO',
        url: 'https://www.youtube.com/watch?v=0RpzFlJhVdg&feature=youtu.be',
      },
    ],
  },
]

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
  const usuario = await getUsuarioSesion()
  const esVersionAdmision = usuario.rol === ROLES.ADMISION
  const esVersionOrdenes = usuario.rol === ROLES.ORDENES
  const esVersionOperativa = esVersionAdmision || esVersionOrdenes

  const modulosGuia = esVersionAdmision
    ? GUIA_MODULOS_ADMISION
    : esVersionOrdenes
      ? GUIA_MODULOS_ORDENES
      : GUIA_MODULOS

  const videosCentrales = esVersionOrdenes
    ? GUIA_VIDEOS_CENTRALES_ORDENES
    : GUIA_VIDEOS_CENTRALES_ADMISION

  const bloquesVideos = esVersionOrdenes
    ? GUIA_VIDEOS_PASO_A_PASO_ORDENES
    : GUIA_VIDEOS_PASO_A_PASO_ADMISION

  return (
    <>
      <Header titulo="Guia del sistema" />

      <div className="p-6 space-y-6">
        <section className="his-card p-5 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Como funciona el sistema</h2>
          <p className="text-sm text-gray-600">
            Esta guia resume el objetivo de cada modulo y concentra buenas practicas de uso para evitar errores de carga.
            A medida que avances, vas a encontrar videos paso a paso para cada circuito.
          </p>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-900">Estructura base del circuito operativo</p>
            {esVersionOperativa ? (
              <div className="mt-2 space-y-2 text-sm text-blue-900">
                <p>En caso de que el paciente no este registrado y sea su primera vez en la clinica hacemos el registro desde el modulo Pacientes (como muestra el video).</p>
                <p>Con el paciente validado, se genera la admision segun el tipo de atencion.</p>
                <p>Genero una nueva admision desde el modulo Pacientes o desde el Dashboard (tal como se muestra en el video).</p>
                <p>Las internaciones se gestionan desde Internacion, con cama, movimientos y seguimiento.</p>
              </div>
            ) : (
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
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {modulosGuia.map((modulo) => (
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
          {esVersionOperativa ? (
            <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600">
              <li>No hace falta que uses una pestana a la vez. Se recomienda el uso de multiples pestanas para evitar tener que recargar muchas veces la misma pagina (click derecho y luego abrir vinculo en una nueva pestana).</li>
              <li>No recargues la pagina varias veces mientras una accion este procesando.</li>
              <li>Espera la confirmacion visual antes de pasar al siguiente paso.</li>
              <li>Si una grilla tarda en cargar, evita hacer multiples clics seguidos.</li>
              <li>Antes de cerrar, valida que el registro aparezca en el listado.</li>
            </ul>
          ) : (
            <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600">
              <li>No recargues la pagina varias veces mientras una accion este procesando.</li>
              <li>Espera la confirmacion visual antes de pasar al siguiente paso.</li>
              <li>Si una grilla tarda en cargar, evita hacer multiples clics seguidos.</li>
              <li>Usa un solo navegador/pestana por tarea para evitar datos cruzados.</li>
              <li>Antes de cerrar, valida que el registro aparezca en el listado.</li>
            </ul>
          )}
        </section>

        <section className="his-card p-5 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Videos paso a paso</h2>
          <p className="text-sm text-gray-600">
            {esVersionOrdenes
              ? 'Estos videos cubren el flujo de pacientes, admision e internacion, incluyendo carga de protocolo bioquimico.'
              : 'Estos videos cubren el flujo principal de admision, internacion, el uso de multiples pestanas y la carga de presupuesto.'}
          </p>

          <article className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Videos centrales del sistema</p>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              {videosCentrales.map((video) => {
                const miniatura = construirMiniaturaYoutube(video.url)

                return (
                  <a
                    key={video.url}
                    href={video.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group block rounded-md border border-emerald-200 bg-white p-2 hover:border-emerald-300"
                  >
                    {miniatura ? (
                      <img
                        src={miniatura}
                        alt={video.titulo}
                        className="h-24 w-full rounded object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-24 w-full items-center justify-center rounded bg-emerald-100 text-xs text-emerald-700">
                        Vista previa no disponible
                      </div>
                    )}
                    <p className="mt-2 text-xs font-medium text-emerald-900 group-hover:text-emerald-700">
                      {video.titulo}
                    </p>
                    <p className="text-[11px] text-emerald-700">Abrir en YouTube</p>
                  </a>
                )
              })}
            </div>
          </article>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {bloquesVideos.map((bloque) => {
              if (bloque.videos.length === 0) {
                return (
                  <div key={bloque.id} className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
                    <p className="text-sm font-semibold text-gray-800">{bloque.nombre}</p>
                    <p className="text-xs text-gray-600 mt-1">Video pendiente de carga</p>
                  </div>
                )
              }

              return (
                <article key={bloque.id} className="rounded-lg border border-gray-200 bg-white p-4">
                  <p className="text-sm font-semibold text-gray-900">{bloque.nombre}</p>
                  <ul className="mt-3 space-y-3">
                    {bloque.videos.map((video) => {
                      const miniatura = construirMiniaturaYoutube(video.url)

                      return (
                        <li key={`${bloque.id}-${video.url}`}>
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

      </div>
    </>
  )
}
