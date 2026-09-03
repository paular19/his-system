import {
  buscarArchivoPacientes,
  buscarPorHistoriaClinicaExacta,
  obtenerIngresosDePacientes,
  obtenerNombresObraSocialArchivo,
  obtenerResumenArchivo,
} from './repository'
import type {
  ArchivoPacienteBusqueda,
  ArchivoPacienteConHistoria,
  BusquedaArchivoInput,
  ResultadoBusquedaArchivo,
  ResumenArchivo,
} from './types'

// ============================================
// SERVICIO ARCHIVO HISTORICO
// Solo consulta. Este modulo no expone ninguna operacion de escritura
// y no debe usarse para crear ni actualizar pacientes del sistema nuevo.
// ============================================

const MINIMO_CARACTERES_BUSQUEDA = 2

/**
 * Le cuelga a cada paciente el nombre de su obra social y sus ingresos.
 *
 * Se resuelve por lote y no fila por fila: son dos consultas para toda la
 * pagina, contra el id viejo, porque estas tablas no tienen relaciones Prisma.
 */
async function agregarHistoria(
  pacientes: ArchivoPacienteBusqueda[]
): Promise<ArchivoPacienteConHistoria[]> {
  if (pacientes.length === 0) return []

  const obraSocialIds = [
    ...new Set(
      pacientes
        .map((p) => p.obraSocialIdViejo)
        .filter((id): id is number => id != null)
    ),
  ]

  const [ingresosPorPaciente, nombresObraSocial] = await Promise.all([
    obtenerIngresosDePacientes(pacientes.map((p) => p.pacienteIdViejo)),
    obtenerNombresObraSocialArchivo(obraSocialIds),
  ])

  return pacientes.map((paciente) => {
    const ingresos = ingresosPorPaciente.get(paciente.pacienteIdViejo) ?? []
    const totalInternaciones = ingresos.filter((i) => i.esInternacion).length

    return {
      ...paciente,
      obraSocialNombre:
        paciente.obraSocialIdViejo != null
          ? (nombresObraSocial.get(paciente.obraSocialIdViejo) ?? null)
          : null,
      ingresos,
      totalInternaciones,
      totalAmbulatorios: ingresos.length - totalInternaciones,
    }
  })
}

export async function consultarArchivo(
  input: BusquedaArchivoInput
): Promise<ResultadoBusquedaArchivo> {
  const q = input.q?.trim()

  // Sin criterio no listamos las 54k filas: el archivo se consulta, no se pasea.
  if (!q || q.length < MINIMO_CARACTERES_BUSQUEDA) {
    return {
      items: [],
      paginacion: {
        total: 0,
        pagina: 1,
        porPagina: input.porPagina ?? 20,
        totalPaginas: 1,
      },
    }
  }

  const resultado = await buscarArchivoPacientes({ ...input, q })
  let items = resultado.items

  // En la primera pagina, el match exacto de historia clinica va arriba de todo:
  // es el caso que mas se usa para ir a buscar el legajo al archivo.
  if (resultado.paginacion.pagina === 1) {
    const exacto = await buscarPorHistoriaClinicaExacta(q)

    if (exacto) {
      const resto = items.filter((item) => item.pacienteIdViejo !== exacto.pacienteIdViejo)
      items = [exacto, ...resto].slice(0, resultado.paginacion.porPagina)
    }
  }

  return {
    items: await agregarHistoria(items),
    paginacion: resultado.paginacion,
  }
}

export async function resumenArchivo(): Promise<ResumenArchivo> {
  return obtenerResumenArchivo()
}
