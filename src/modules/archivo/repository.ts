import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import type {
  ArchivoIngresoResumen,
  ArchivoPacienteBusqueda,
  BusquedaArchivoInput,
  ResultadoBusquedaArchivoCrudo,
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
  obraSocialIdViejo: true,
  numeroAfiliado: true,
  observaciones: true,
  fechaAlta: true,
} as const

const SELECT_INGRESO = {
  ingresoIdViejo: true,
  numeroIngreso: true,
  esInternacion: true,
  tipoIngresoDescripcion: true,
  fechaIngreso: true,
  fechaEgreso: true,
  tipoInternacionDescripcion: true,
  motivoEgresoCodigo: true,
  motivoEgresoDescripcion: true,
  obraSocialNombre: true,
  planDescripcion: true,
  descripcionPatologia: true,
  profesionalTratanteNombre: true,
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
): Promise<ResultadoBusquedaArchivoCrudo> {
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

/**
 * Ingresos del sistema viejo de un conjunto de pacientes, agrupados por paciente.
 *
 * Va en una consulta aparte en vez de un include: estas tablas no declaran
 * relaciones Prisma a proposito (ver el comentario del schema), asi que el
 * cruce se hace en memoria contra el id viejo.
 */
export async function obtenerIngresosDePacientes(
  pacienteIds: number[]
): Promise<Map<number, ArchivoIngresoResumen[]>> {
  const porPaciente = new Map<number, ArchivoIngresoResumen[]>()
  if (pacienteIds.length === 0) return porPaciente

  const filas = await prisma.archivoIngreso.findMany({
    where: { pacienteIdViejo: { in: pacienteIds } },
    select: { ...SELECT_INGRESO, pacienteIdViejo: true },
    // Lo mas reciente primero: es lo que se busca cuando se pide el legajo.
    orderBy: [{ fechaIngreso: 'desc' }, { ingresoIdViejo: 'desc' }],
  })

  for (const fila of filas) {
    const { pacienteIdViejo, ...ingreso } = fila
    const actuales = porPaciente.get(pacienteIdViejo)
    if (actuales) actuales.push(ingreso)
    else porPaciente.set(pacienteIdViejo, [ingreso])
  }

  return porPaciente
}

/**
 * Nombres de obra social del sistema viejo. ArchivoPaciente solo guarda el id, y
 * el maestro nuevo no alcanza: tiene 89 obras sociales contra las 395 del viejo,
 * asi que 214 ids quedarian sin nombre si se resolviera contra ObraSocial.
 */
export async function obtenerNombresObraSocialArchivo(
  obraSocialIds: number[]
): Promise<Map<number, string>> {
  const porId = new Map<number, string>()
  if (obraSocialIds.length === 0) return porId

  const filas = await prisma.archivoObraSocial.findMany({
    where: { obraSocialIdViejo: { in: obraSocialIds } },
    select: { obraSocialIdViejo: true, nombre: true },
  })

  for (const fila of filas) porId.set(fila.obraSocialIdViejo, fila.nombre)

  return porId
}

export async function obtenerResumenArchivo(): Promise<ResumenArchivo> {
  const [total, conHistoriaClinica, pacientesConIngreso, totalInternaciones] = await Promise.all([
    prisma.archivoPaciente.count(),
    prisma.archivoPaciente.count({ where: { historiaClinicaVieja: { not: null } } }),
    prisma.archivoIngreso.findMany({
      distinct: ['pacienteIdViejo'],
      select: { pacienteIdViejo: true },
    }),
    prisma.archivoIngreso.count({ where: { esInternacion: true } }),
  ])

  return {
    total,
    conHistoriaClinica,
    conIngresos: pacientesConIngreso.length,
    totalInternaciones,
  }
}
