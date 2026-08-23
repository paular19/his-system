import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import type {
  ArchivoPacienteBusqueda,
  BusquedaArchivoInput,
  ResultadoBusquedaArchivo,
  ResumenArchivo,
} from './types'
import { normalizarBusqueda } from './normalizar'

// ============================================
// REPOSITORIO ARCHIVO HISTORICO
// Solo lectura sobre ArchivoPaciente. Esta tabla es una copia congelada
// del sistema anterior: no se escribe, no se relaciona con Paciente.
// ============================================

const SELECT_ARCHIVO = {
  pacienteIdViejo: true,
  historiaClinicaVieja: true,
  apellido: true,
  nombre: true,
  nombreCompleto: true,
  tipoDocumento: true,
  numeroDocumento: true,
  fechaNacimiento: true,
  sexo: true,
  domicilio: true,
  telefonoFijo: true,
  celular1: true,
  celular2: true,
  email: true,
  numeroAfiliado: true,
  observaciones: true,
  fechaAlta: true,
} as const

function construirWhere(input: BusquedaArchivoInput): Prisma.ArchivoPacienteWhereInput {
  const condiciones: Prisma.ArchivoPacienteWhereInput[] = []

  if (input.soloConHistoriaClinica) {
    condiciones.push({ historiaClinicaVieja: { not: null } })
  }

  const q = normalizarBusqueda(input.q ?? '')

  if (q) {
    const tokens = q.split(' ').filter(Boolean)

    // Si la busqueda es un numero puro puede ser la HC vieja o el documento.
    const esNumero = /^[0-9]+$/.test(q)
    const alternativas: Prisma.ArchivoPacienteWhereInput[] = [
      { AND: tokens.map((token) => ({ busqueda: { contains: token } })) },
    ]

    if (esNumero) {
      const numero = Number.parseInt(q, 10)
      if (Number.isSafeInteger(numero)) {
        alternativas.push({ historiaClinicaVieja: numero })
      }
      alternativas.push({ numeroDocumento: q })
    }

    condiciones.push({ OR: alternativas })
  }

  return condiciones.length > 0 ? { AND: condiciones } : {}
}

export async function buscarArchivoPacientes(
  input: BusquedaArchivoInput
): Promise<ResultadoBusquedaArchivo> {
  const pagina = Math.max(1, input.pagina ?? 1)
  const porPagina = Math.min(100, Math.max(1, input.porPagina ?? 20))
  const where = construirWhere(input)

  const [items, total] = await Promise.all([
    prisma.archivoPaciente.findMany({
      where,
      select: SELECT_ARCHIVO,
      orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    }),
    prisma.archivoPaciente.count({ where }),
  ])

  return {
    items: items as ArchivoPacienteBusqueda[],
    paginacion: {
      total,
      pagina,
      porPagina,
      totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
    },
  }
}

/**
 * Match exacto por historia clinica vieja.
 *
 * Cuando se busca un numero, ese numero tambien aparece como parte de otros
 * documentos, asi que el resultado exacto se fija arriba en vez de quedar
 * sujeto al orden alfabetico.
 */
export async function buscarPorHistoriaClinicaExacta(
  q: string
): Promise<ArchivoPacienteBusqueda | null> {
  if (!/^[0-9]+$/.test(q)) return null

  const numero = Number.parseInt(q, 10)
  if (!Number.isSafeInteger(numero)) return null

  const fila = await prisma.archivoPaciente.findFirst({
    where: { historiaClinicaVieja: numero },
    select: SELECT_ARCHIVO,
  })

  return (fila as ArchivoPacienteBusqueda | null) ?? null
}

export async function obtenerResumenArchivo(): Promise<ResumenArchivo> {
  const [total, conHistoriaClinica] = await Promise.all([
    prisma.archivoPaciente.count(),
    prisma.archivoPaciente.count({ where: { historiaClinicaVieja: { not: null } } }),
  ])

  return { total, conHistoriaClinica }
}
