'use client'

import { useState } from 'react'
import { BedDouble, ChevronDown, ChevronUp } from 'lucide-react'
import { TarjetaCama } from './tarjeta-cama'
import { CambiarEstadoCama } from './cambiar-estado-cama'
import type { DisponibilidadSector, CamaConOcupante } from '@/modules/internacion/types'

interface SeccionSectorProps {
  sector: DisponibilidadSector
  soloOcupadas?: boolean
}

export function SeccionSector({ sector, soloOcupadas = false }: SeccionSectorProps) {
  const [expandido, setExpandido] = useState(true)
  const [camaEditando, setCamaEditando] = useState<CamaConOcupante | null>(null)

  const camasVisibles = soloOcupadas
    ? sector.camas.filter((cama) => cama.estado === 'OCUPADA')
    : sector.camas

  const totalVisible = soloOcupadas ? camasVisibles.length : sector.total
  const ocupadasVisibles = soloOcupadas ? camasVisibles.length : sector.ocupadas
  const disponiblesVisibles = soloOcupadas ? 0 : sector.disponibles

  const porcentajeOcupacion =
    totalVisible > 0 ? Math.round((ocupadasVisibles / totalVisible) * 100) : 0

  return (
    <div className="his-card overflow-hidden">
      {/* Header del sector */}
      <button
        onClick={() => setExpandido(!expandido)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <BedDouble className="h-5 w-5 text-blue-600" />
          <div className="text-left">
            <h3 className="font-semibold text-gray-900">{sector.label}</h3>
            <p className="text-xs text-gray-500">
              {soloOcupadas
                ? `${ocupadasVisibles} ocupadas`
                : `${disponiblesVisibles} disponibles · ${ocupadasVisibles} ocupadas · ${totalVisible} total`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Barra de ocupación */}
          <div className={`hidden sm:flex items-center gap-2 ${soloOcupadas ? 'opacity-60' : ''}`}>
            <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{ width: `${porcentajeOcupacion}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 w-8">{porcentajeOcupacion}%</span>
          </div>
          {expandido ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Listado de camas */}
      {expandido && (
        <div className="px-4 pb-3 border-t border-gray-100">
          {camasVisibles.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">
              {soloOcupadas
                ? 'Sin camas ocupadas para la obra social seleccionada'
                : 'Sin camas registradas en este sector'}
            </p>
          ) : (
            <div className="pt-3 space-y-2">
              {camasVisibles.map((cama) => (
                <div
                  key={cama.id}
                  className="w-full"
                  onContextMenu={(e) => {
                    // Click derecho para cambiar estado (no en camas ocupadas)
                    if (!soloOcupadas && cama.estado !== 'OCUPADA') {
                      e.preventDefault()
                      setCamaEditando(cama)
                    }
                  }}
                >
                  <TarjetaCama cama={cama} />
                </div>
              ))}
            </div>
          )}

          {/* Leyenda */}
          <div className="flex flex-wrap items-center gap-3 mt-2 pt-2 border-t border-gray-100">
            {(soloOcupadas
              ? [{ color: 'bg-red-500', label: 'Ocupada' }]
              : [
                { color: 'bg-green-500', label: 'Disponible' },
                { color: 'bg-red-500', label: 'Ocupada' },
                { color: 'bg-yellow-500', label: 'Reservada' },
                { color: 'bg-gray-400', label: 'Mantenimiento' },
              ]
            ).map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
                <span className="text-xs text-gray-500">{label}</span>
              </div>
            ))}
            <span className={`text-xs text-gray-400 ml-auto hidden sm:block ${soloOcupadas ? 'hidden' : ''}`}>
              Click derecho en cama libre/reservada para cambiar estado
            </span>
          </div>
        </div>
      )}

      {/* Modal cambio de estado */}
      {camaEditando && (
        <CambiarEstadoCama
          camaId={camaEditando.id}
          estadoActual={camaEditando.estado}
          identificador={camaEditando.identificador}
          onClose={() => setCamaEditando(null)}
        />
      )}
    </div>
  )
}
