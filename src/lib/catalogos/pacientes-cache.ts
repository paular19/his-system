import 'server-only'

import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/db'
import { asegurarCosegurosIPSS, filtrarObrasSocialesPrincipales } from '@/lib/utils/coseguros'

export type CatalogoObraSocialPaciente = {
  id: number
  nombre: string
  requiereCoseguro: boolean
}

export type CatalogoCoseguroPaciente = {
  id: number
  nombre: string
}

const VALORES_TRUE = new Set(['S', 'SI', '1', 'TRUE', 'T'])

const getCatalogoPacienteFormCached = unstable_cache(
  async (): Promise<{
    obraSociales: CatalogoObraSocialPaciente[]
    coseguros: CatalogoCoseguroPaciente[]
  }> => {
    const [obraSocialesRows, coseguros] = await Promise.all([
      prisma.obraSocial.findMany({
        where: { estado: 'A' },
        select: { id: true, nombre: true, requiereCoseguro: true },
        orderBy: { nombre: 'asc' },
      }),
      asegurarCosegurosIPSS(),
    ])

    const obraSociales = filtrarObrasSocialesPrincipales(obraSocialesRows).map((os) => {
      const req = (os.requiereCoseguro ?? '').trim().toUpperCase()
      return {
        id: os.id,
        nombre: os.nombre.trim(),
        requiereCoseguro: VALORES_TRUE.has(req),
      }
    })

    return { obraSociales, coseguros }
  },
  ['catalogo-paciente-form-v1'],
  { revalidate: 300, tags: ['catalogo-pacientes', 'catalogo-obras-sociales', 'catalogo-coseguros-ipss'] }
)

export async function getCatalogoPacienteForm(): Promise<{
  obraSociales: CatalogoObraSocialPaciente[]
  coseguros: CatalogoCoseguroPaciente[]
}> {
  return getCatalogoPacienteFormCached()
}
