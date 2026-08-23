import {
  buscarArchivoPacientes,
  buscarPorHistoriaClinicaExacta,
  obtenerResumenArchivo,
} from './repository'
import type {
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

  // En la primera pagina, el match exacto de historia clinica va arriba de todo:
  // es el caso que mas se usa para ir a buscar el legajo al archivo.
  if (resultado.paginacion.pagina === 1) {
    const exacto = await buscarPorHistoriaClinicaExacta(q)

    if (exacto) {
      const resto = resultado.items.filter(
        (item) => item.pacienteIdViejo !== exacto.pacienteIdViejo
      )
      resultado.items = [exacto, ...resto].slice(0, resultado.paginacion.porPagina)
    }
  }

  return resultado
}

export async function resumenArchivo(): Promise<ResumenArchivo> {
  return obtenerResumenArchivo()
}
