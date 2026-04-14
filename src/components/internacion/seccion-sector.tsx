'use client'

import { useState } from 'react'
import { BedDouble, ChevronDown, ChevronUp } from 'lucide-react'
import { TarjetaCama } from './tarjeta-cama'
import { CambiarEstadoCama } from './cambiar-estado-cama'
import type { DisponibilidadSector, CamaConOcupante } from '@/modules/internacion/types'

interface SeccionSectorProps {
  sector: DisponibilidadSector
}

export function SeccionSector({ sector }: SeccionSectorProps) {
  const [expandido, setExpandido] = useState(true)
  const [camaEditando, setCamaEditando] = useState<CamaConOcupante | null>(null)

  const porcentajeOcupacion =
    sector.total > 0 ? Math.round((sector.ocupadas / sector.total) * 100) : 0

  return (
    <div className="his-card overflow-hidden">
      {/* Header del sector */}
      <button
        onClick={() => setExpandido(!expandido)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <BedDouble className="h-5 w-5 text-blue-600" />
          <div className="text-left">
            <h3 className="font-semibold text-gray-900">{sector.label}</h3>
            <p className="text-xs text-gray-500">
              {sector.disponibles} disponibles · {sector.ocupadas} ocupadas · {sector.total} total
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Barra de ocupación */}
          <div className="hidden sm:flex items-center gap-2">
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

      {/* Grid de camas */}
      {expandido && (
        <div className="px-5 pb-5 border-t border-gray-100">
          {sector.camas.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">
              Sin camas registradas en este sector
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2 pt-4">
              {sector.camas.map((cama) => (
                <div
                  key={cama.id}
                  onContextMenu={(e) => {
                    // Click derecho para cambiar estado (no en camas ocupadas)
                    if (cama.estado !== 'OCUPADA') {
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
          <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-gray-100">
            {[
              { color: 'bg-green-500', label: 'Disponible' },
              { color: 'bg-red-500', label: 'Ocupada' },
              { color: 'bg-yellow-500', label: 'Reservada' },
              { color: 'bg-gray-400', label: 'Mantenimiento' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
                <span className="text-xs text-gray-500">{label}</span>
              </div>
            ))}
            <span className="text-xs text-gray-400 ml-auto hidden sm:block">
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
