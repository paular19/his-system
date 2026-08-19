import { SECTOR_CAMA } from './types'

/**
 * De todos los movimientos de cama, los unicos relevantes para la ficha del
 * paciente son los que cruzan entre piso y UTI. Los cambios dentro del mismo
 * sector (de una cama a otra del mismo piso) no se muestran.
 */
export type TipoTraspasoUti = 'INGRESO_UTI' | 'PISO_A_UTI' | 'UTI_A_PISO'

export const TIPO_TRASPASO_UTI_LABEL: Record<TipoTraspasoUti, string> = {
  INGRESO_UTI: 'Ingreso a UTI',
  PISO_A_UTI: 'Piso → UTI',
  UTI_A_PISO: 'UTI → Piso',
}

type CamaSector = { sector: string | null } | null

export function clasificarTraspasoUti(traspaso: {
  camaOrigen: CamaSector
  camaDestino: CamaSector
}): TipoTraspasoUti | null {
  const origen = traspaso.camaOrigen?.sector ?? null
  const destino = traspaso.camaDestino?.sector ?? null

  const origenEsUti = origen === SECTOR_CAMA.TERAPIA_INTENSIVA
  const destinoEsUti = destino === SECTOR_CAMA.TERAPIA_INTENSIVA

  if (destinoEsUti && !origenEsUti) {
    // Sin cama de origen es la asignacion inicial: el paciente entro directo a UTI.
    return origen === null ? 'INGRESO_UTI' : 'PISO_A_UTI'
  }

  if (origenEsUti && !destinoEsUti && destino !== null) {
    return 'UTI_A_PISO'
  }

  return null
}

export function filtrarTraspasosUti<T extends { camaOrigen: CamaSector; camaDestino: CamaSector }>(
  traspasos: T[]
): Array<T & { tipoTraspaso: TipoTraspasoUti }> {
  return traspasos.flatMap((traspaso) => {
    const tipoTraspaso = clasificarTraspasoUti(traspaso)
    return tipoTraspaso ? [{ ...traspaso, tipoTraspaso }] : []
  })
}
