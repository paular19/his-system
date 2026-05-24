export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Header } from '@/components/layout/header'
import { prisma } from '@/lib/db'
import {
  GUIA_MODULOS,
  esGuiaModuloId,
  esGuiaPrioridadFeedback,
  esGuiaTipoFeedback,
} from '@/modules/guia/constants'
import {
  GuiaFeedbackBoard,
  type GuiaFeedbackItem,
} from '@/modules/guia/components/guia-feedback-board'

export default async function GuiaPage() {
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
            Aqui vamos a publicar tutoriales por modulo. De momento quedan creados los espacios para cargar los videos.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {GUIA_MODULOS.map((modulo) => (
              <div key={modulo.id} className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
                <p className="text-sm font-semibold text-gray-800">{modulo.nombre}</p>
                <p className="text-xs text-gray-600 mt-1">Video pendiente de carga</p>
              </div>
            ))}
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
