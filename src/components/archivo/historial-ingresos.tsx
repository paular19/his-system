import { formatearFechaCalendario } from '@/lib/utils'
import type { ArchivoIngresoResumen } from '@/modules/archivo/types'

// ============================================
// HISTORIAL DE INGRESOS DEL SISTEMA ANTERIOR
// Se despliega con <details> para no necesitar javascript de cliente: la pagina
// del archivo es un server component y la lista solo se mira de a un paciente.
// ============================================

interface HistorialIngresosProps {
  ingresos: ArchivoIngresoResumen[]
  totalInternaciones: number
  totalAmbulatorios: number
}

/**
 * OBI es obito en el nomenclador viejo de motivos de egreso, y es el unico que
 * conviene resaltar cuando alguien esta por ir a buscar el legajo.
 */
function claseEgreso(codigo: string | null): string {
  if (codigo === 'OBI') return 'bg-red-100 text-red-800'
  if (codigo === 'ALT') return 'bg-green-100 text-green-800'
  if (codigo === null) return 'bg-gray-100 text-gray-500'
  return 'bg-blue-100 text-blue-800'
}

export function HistorialIngresos({
  ingresos,
  totalInternaciones,
  totalAmbulatorios,
}: HistorialIngresosProps) {
  if (ingresos.length === 0) {
    return <span className="text-xs text-gray-400">Sin ingresos registrados</span>
  }

  const partes = [
    totalInternaciones > 0
      ? `${totalInternaciones} ${totalInternaciones === 1 ? 'internacion' : 'internaciones'}`
      : null,
    totalAmbulatorios > 0 ? `${totalAmbulatorios} ambulatorios` : null,
  ].filter(Boolean)

  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-xs">
        <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 font-medium text-blue-800 hover:bg-blue-100 transition-colors">
          {partes.join(' · ')}
          <span className="text-blue-400 group-open:hidden">ver</span>
          <span className="hidden text-blue-400 group-open:inline">ocultar</span>
        </span>
      </summary>

      <ul className="mt-2 space-y-2">
        {ingresos.map((ingreso) => (
          <li key={ingreso.ingresoIdViejo} className="border-l-2 border-gray-200 pl-2 text-xs">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium text-gray-700">
                {formatearFechaCalendario(ingreso.fechaIngreso)}
                {ingreso.fechaEgreso != null && (
                  <span className="text-gray-400">
                    {' '}
                    al {formatearFechaCalendario(ingreso.fechaEgreso)}
                  </span>
                )}
              </span>

              <span
                className={`rounded px-1.5 py-0.5 ${
                  ingreso.esInternacion
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {ingreso.esInternacion
                  ? (ingreso.tipoInternacionDescripcion ?? 'Internacion')
                  : 'Ambulatorio'}
              </span>

              <span className={`rounded px-1.5 py-0.5 ${claseEgreso(ingreso.motivoEgresoCodigo)}`}>
                {ingreso.motivoEgresoDescripcion ?? 'Sin egreso registrado'}
              </span>
            </div>

            {ingreso.descripcionPatologia != null && (
              <div className="text-gray-500 line-clamp-1">{ingreso.descripcionPatologia}</div>
            )}

            <div className="text-gray-400">
              {ingreso.obraSocialNombre ?? 'Sin obra social'}
              {ingreso.profesionalTratanteNombre != null && ` · ${ingreso.profesionalTratanteNombre}`}
            </div>
          </li>
        ))}
      </ul>
    </details>
  )
}
