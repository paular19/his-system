import { prisma } from '@/lib/db'

// Un paciente particular se guarda con Ingreso.obraSocialId = null: es lo que el
// resto del sistema entiende por "sin cobertura" (los lotes particulares filtran
// por null, y el convenio de las practicas cae al nomenclador general).
//
// Pero Orden.obraSocialId es NOT NULL, asi que la orden de un particular necesita
// igual un OSID concreto. Para eso existe la OS PARTICULAR.
export const OBRA_SOCIAL_PARTICULAR_ID = 500

const NOMBRES_PARTICULAR = ['PARTICULAR', 'SIN COBERTURA', 'PRIVADO']

/**
 * Devuelve el OSID que representa a un paciente particular.
 *
 * Antes esta funcion terminaba cayendo en "la primera OS activa por id", que en
 * esta base es la 1 (IPSS): toda orden de un particular salia a nombre del IPS y
 * de ahi se contagiaba al ingreso. Ahora, si no hay una OS PARTICULAR cargada,
 * corta con un error explicito en lugar de inventar una cobertura.
 */
export async function resolverObraSocialParticularId(): Promise<number> {
  const porIdEstandar = await prisma.obraSocial.findUnique({
    where: { id: OBRA_SOCIAL_PARTICULAR_ID },
    select: { id: true, estado: true },
  })
  if (porIdEstandar) {
    if (porIdEstandar.estado !== 'A') {
      console.warn(
        `[OS-PARTICULAR] Usando OS id ${OBRA_SOCIAL_PARTICULAR_ID} para PARTICULAR aunque no este activa`
      )
    }
    return porIdEstandar.id
  }

  const porNombre = await prisma.obraSocial.findFirst({
    where: {
      OR: NOMBRES_PARTICULAR.map((nombre) => ({
        nombre: { contains: nombre, mode: 'insensitive' as const },
      })),
    },
    orderBy: [{ estado: 'asc' }, { id: 'asc' }],
    select: { id: true },
  })
  if (porNombre) {
    console.warn('[OS-PARTICULAR] OS PARTICULAR resuelta por nombre (fallback)')
    return porNombre.id
  }

  throw new Error(
    'No hay una obra social PARTICULAR cargada. Debe existir para emitir ordenes de pacientes sin cobertura.'
  )
}

/** true si ese OSID es el que representa a un particular (no es cobertura real). */
export async function esObraSocialParticular(
  obraSocialId: number | null | undefined
): Promise<boolean> {
  if (obraSocialId == null) return false
  try {
    return obraSocialId === (await resolverObraSocialParticularId())
  } catch {
    return false
  }
}
