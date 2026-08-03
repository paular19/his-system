import Link from 'next/link'
import { BedDouble, User, Clock, Wrench } from 'lucide-react'
import type { CamaConOcupante } from '@/modules/internacion/types'
import { formatearFechaHoraArgentina } from '@/lib/utils/argentina-date'

interface TarjetaCamaProps {
  cama: CamaConOcupante
}

const ESTADO_STYLES: Record<string, string> = {
  DISPONIBLE: 'bg-green-50 border-green-300 hover:bg-green-100',
  OCUPADA: 'bg-red-50 border-red-300 hover:bg-red-100',
  RESERVADA: 'bg-yellow-50 border-yellow-300 hover:bg-yellow-100',
  MANTENIMIENTO: 'bg-gray-100 border-gray-300 hover:bg-gray-200',
}

const ESTADO_TEXT: Record<string, string> = {
  DISPONIBLE: 'text-green-700',
  OCUPADA: 'text-red-700',
  RESERVADA: 'text-yellow-700',
  MANTENIMIENTO: 'text-gray-500',
}

const ESTADO_DOT: Record<string, string> = {
  DISPONIBLE: 'bg-green-500',
  OCUPADA: 'bg-red-500',
  RESERVADA: 'bg-yellow-500',
  MANTENIMIENTO: 'bg-gray-400',
}

function formatearIngreso(fechaIngreso: Date | null): string {
  if (!fechaIngreso) return '—'
  return formatearFechaHoraArgentina(fechaIngreso, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function TarjetaCama({ cama }: TarjetaCamaProps) {
  const estiloCard = ESTADO_STYLES[cama.estado] ?? 'bg-white border-gray-200'
  const estiloTexto = ESTADO_TEXT[cama.estado] ?? 'text-gray-700'
  const estiloDot = ESTADO_DOT[cama.estado] ?? 'bg-gray-400'

  const contenido = (
    <div
      className={`
        relative border rounded-lg p-3 cursor-pointer transition-colors min-h-36
        flex flex-col gap-0.5 ${estiloCard}
      `}
    >
      {/* Header: ID + estado */}
      <div className="flex items-center justify-between">
        <span className="font-bold text-sm text-gray-900">{cama.identificador}</span>
        <span className={`w-2.5 h-2.5 rounded-full ${estiloDot}`} />
      </div>

      {/* Habitación */}
      {cama.habitacion && (
        <span className="text-xs text-gray-500">Hab. {cama.habitacion}</span>
      )}

      {/* Contenido según estado */}
      {cama.estado === 'DISPONIBLE' && (
        <div className="flex items-center gap-1 mt-auto">
          <BedDouble className={`h-4 w-4 ${estiloTexto}`} />
          <span className={`text-xs font-medium ${estiloTexto}`}>Disponible</span>
        </div>
      )}

      {cama.estado === 'OCUPADA' && cama.ocupante && (
        <div className="mt-auto space-y-1">
          <div className="flex items-start gap-1">
            <User className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${estiloTexto}`} />
            <span className="text-xs font-medium text-gray-800 leading-tight line-clamp-2">
              {cama.ocupante.nombre}
            </span>
          </div>
          {cama.ocupante.obraSocialNombre && (
            <p className="text-[11px] text-gray-600 leading-tight line-clamp-1">
              {cama.ocupante.obraSocialNombre}
            </p>
          )}
          <div className="flex items-center gap-1 text-[11px] text-gray-600">
            <Clock className="h-3 w-3 text-gray-400" />
            <span className="line-clamp-1">
              {formatearIngreso(cama.ocupante.fechaIngreso)}
            </span>
          </div>
          <p className="text-[11px] text-gray-600 leading-tight line-clamp-1">
            Tratante: {cama.ocupante.profesionalTratanteNombre ?? '—'}
          </p>
          <p className="text-[11px] text-gray-600 leading-tight line-clamp-2">
            Dx: {cama.ocupante.diagnostico?.trim() || '—'}
          </p>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-gray-600">
              Coseguro: {cama.ocupante.tieneCoseguro ? 'Si' : 'No'}
            </span>
            <span className="text-[11px] text-gray-400 shrink-0">
              #{cama.ocupante.numeroIngreso}
            </span>
          </div>
        </div>
      )}

      {cama.estado === 'RESERVADA' && cama.ocupante && (
        <div className="mt-auto space-y-1">
          <div className="flex items-start gap-1">
            <User className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${estiloTexto}`} />
            <span className="text-xs font-medium text-gray-800 leading-tight line-clamp-2">
              {cama.ocupante.nombre}
            </span>
          </div>
          {cama.ocupante.obraSocialNombre && (
            <p className="text-[11px] text-gray-600 leading-tight line-clamp-1">
              {cama.ocupante.obraSocialNombre}
            </p>
          )}
          <div className="flex items-center gap-1 text-[11px] text-gray-600">
            <Clock className="h-3 w-3 text-gray-400" />
            <span className="line-clamp-1">
              {formatearIngreso(cama.ocupante.fechaIngreso)}
            </span>
          </div>
          <p className="text-[11px] text-gray-600 leading-tight line-clamp-1">
            Tratante: {cama.ocupante.profesionalTratanteNombre ?? '—'}
          </p>
          <p className="text-[11px] text-gray-600 leading-tight line-clamp-2">
            Dx: {cama.ocupante.diagnostico?.trim() || '—'}
          </p>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-gray-600">
              Coseguro: {cama.ocupante.tieneCoseguro ? 'Si' : 'No'}
            </span>
            <span className="text-[11px] text-gray-400 shrink-0">
              #{cama.ocupante.numeroIngreso}
            </span>
          </div>
        </div>
      )}

      {cama.estado === 'RESERVADA' && !cama.ocupante && (
        <div className="flex items-center gap-1 mt-auto">
          <span className={`text-xs font-medium ${estiloTexto}`}>Reservada</span>
        </div>
      )}

      {cama.estado === 'MANTENIMIENTO' && (
        <div className="flex items-center gap-1 mt-auto">
          <Wrench className={`h-3.5 w-3.5 ${estiloTexto}`} />
          <span className={`text-xs font-medium ${estiloTexto}`}>Mantenimiento</span>
        </div>
      )}
    </div>
  )

  // Ocupada/Reservada con ingreso asociado → link al ingreso
  if ((cama.estado === 'OCUPADA' || cama.estado === 'RESERVADA') && cama.ocupante) {
    return (
      <Link href={`/dashboard/internacion/${cama.ocupante.ingresoId}`}>
        {contenido}
      </Link>
    )
  }

  // Disponible → link a nueva internación con cama preseleccionada
  if (cama.estado === 'DISPONIBLE') {
    return (
      <Link href={`/dashboard/internacion/nuevo?camaId=${cama.id}`}>
        {contenido}
      </Link>
    )
  }

  return contenido
}
