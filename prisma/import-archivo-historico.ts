/**
 * Importa el archivo historico del sistema anterior a la tabla ArchivoPaciente.
 *
 * La tabla es una copia congelada de solo lectura: no se relaciona con Paciente
 * ni con ninguna tabla del HIS nuevo. Sirve unicamente para ubicar el legajo en
 * el archivo fisico a partir de la historia clinica vieja.
 *
 * Uso:
 *   npx tsx prisma/import-archivo-historico.ts --archivo="C:/ruta/paciente_export.sql" --dry-run
 *   npx tsx prisma/import-archivo-historico.ts --archivo="C:/ruta/paciente_export.sql"
 *
 * El archivo de entrada es el export del SQL Server viejo: una fila por linea,
 * campos separados por coma, texto entre comillas dobles, en el orden de
 * columnas de dbo.Paciente.
 */
import { PrismaClient } from '@prisma/client'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { normalizarBusqueda } from '@/modules/archivo/normalizar'

const prisma = new PrismaClient()

// Orden de columnas del export de dbo.Paciente
const COL = {
    pacienteId: 0,
    historiaClinica: 1,
    apellido: 2,
    nombre: 3,
    nombreCompleto: 4,
    tipoDocumento: 5,
    numeroDocumento: 6,
    cuil: 7,
    fechaNacimiento: 8,
    sexo: 9,
    estadoCivil: 10,
    domicilio: 13,
    telefonoFijo: 17,
    telefonoLaboral: 18,
    celular1: 19,
    celular2: 20,
    email: 21,
    obraSocialId: 22,
    planId: 23,
    numeroAfiliado: 24,
    observaciones: 29,
    usuarioAlta: 30,
    fechaAlta: 31,
    fechaModificacion: 32,
} as const

const CANTIDAD_COLUMNAS = 34

type ArchivoRow = {
    pacienteIdViejo: number
    historiaClinicaVieja: number | null
    apellido: string
    nombre: string
    nombreCompleto: string
    tipoDocumento: string | null
    numeroDocumento: string | null
    cuil: string | null
    fechaNacimiento: Date | null
    sexo: string | null
    estadoCivil: string | null
    domicilio: string | null
    telefonoFijo: string | null
    telefonoLaboral: string | null
    celular1: string | null
    celular2: string | null
    email: string | null
    obraSocialIdViejo: number | null
    planIdViejo: number | null
    numeroAfiliado: string | null
    observaciones: string | null
    usuarioAlta: string | null
    fechaAlta: Date | null
    fechaModificacion: Date | null
    busqueda: string
}

function getOptionValue(flag: string): string | undefined {
    const prefix = `--${flag}=`
    const found = process.argv.find((arg) => arg.startsWith(prefix))
    return found ? found.slice(prefix.length) : undefined
}

/**
 * Parte el export en filas. Un valor entre comillas puede contener saltos de
 * linea, asi que el estado de comillas se arrastra entre lineas fisicas.
 */
function parseRegistros(texto: string): string[][] {
    const filas: string[][] = []
    let fila: string[] = []
    let actual = ''
    let enComillas = false

    for (let i = 0; i < texto.length; i += 1) {
        const ch = texto[i]!

        if (ch === '"') {
            if (enComillas && texto[i + 1] === '"') {
                actual += '"'
                i += 1
            } else {
                enComillas = !enComillas
            }
            continue
        }

        if (!enComillas) {
            if (ch === ',') {
                fila.push(actual)
                actual = ''
                continue
            }

            if (ch === '\n' || ch === '\r') {
                if (ch === '\r' && texto[i + 1] === '\n') i += 1
                fila.push(actual)
                actual = ''
                if (fila.length > 1 || fila[0]!.trim() !== '') filas.push(fila)
                fila = []
                continue
            }
        }

        actual += ch
    }

    fila.push(actual)
    if (fila.length > 1 || fila[0]!.trim() !== '') filas.push(fila)

    return filas
}

function texto(valor: string | undefined, largo: number): string | null {
    if (valor == null) return null
    const limpio = valor.trim()
    if (!limpio || /^null$/i.test(limpio)) return null
    return limpio.slice(0, largo)
}

function entero(valor: string | undefined): number | null {
    const limpio = texto(valor, 20)
    if (!limpio || !/^-?[0-9]+$/.test(limpio)) return null
    const n = Number.parseInt(limpio, 10)
    return Number.isFinite(n) ? n : null
}

function fecha(valor: string | undefined): Date | null {
    const limpio = texto(valor, 40)
    if (!limpio) return null
    const d = new Date(limpio)
    if (Number.isNaN(d.getTime())) return null
    // El sistema viejo usaba 1900-01-01 como fecha vacia.
    if (d.getUTCFullYear() < 1901) return null
    return d
}

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = []
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
    return out
}

function construirFila(cols: string[]): ArchivoRow | null {
    const pacienteIdViejo = entero(cols[COL.pacienteId])
    const apellido = texto(cols[COL.apellido], 100)
    const nombre = texto(cols[COL.nombre], 100)
    if (!pacienteIdViejo || !apellido) return null

    const nombreCompleto =
        texto(cols[COL.nombreCompleto], 200) ?? `${apellido} ${nombre ?? ''}`.trim()

    const historiaClinicaVieja = entero(cols[COL.historiaClinica])
    const numeroDocumento = texto(cols[COL.numeroDocumento], 20)

    const busqueda = normalizarBusqueda(
        [nombreCompleto, numeroDocumento ?? '', historiaClinicaVieja ?? ''].join(' ')
    ).slice(0, 240)

    return {
        pacienteIdViejo,
        historiaClinicaVieja,
        apellido,
        nombre: nombre ?? '',
        nombreCompleto,
        tipoDocumento: texto(cols[COL.tipoDocumento], 10),
        numeroDocumento,
        cuil: texto(cols[COL.cuil], 20),
        fechaNacimiento: fecha(cols[COL.fechaNacimiento]),
        sexo: texto(cols[COL.sexo], 1),
        estadoCivil: texto(cols[COL.estadoCivil], 1),
        domicilio: texto(cols[COL.domicilio], 200),
        telefonoFijo: texto(cols[COL.telefonoFijo], 50),
        telefonoLaboral: texto(cols[COL.telefonoLaboral], 50),
        celular1: texto(cols[COL.celular1], 50),
        celular2: texto(cols[COL.celular2], 50),
        email: texto(cols[COL.email], 100),
        obraSocialIdViejo: entero(cols[COL.obraSocialId]),
        planIdViejo: entero(cols[COL.planId]),
        numeroAfiliado: texto(cols[COL.numeroAfiliado], 50),
        observaciones: texto(cols[COL.observaciones], 4000),
        usuarioAlta: texto(cols[COL.usuarioAlta], 10),
        fechaAlta: fecha(cols[COL.fechaAlta]),
        fechaModificacion: fecha(cols[COL.fechaModificacion]),
        busqueda,
    }
}

async function main() {
    const archivoArg = getOptionValue('archivo') ?? 'paciente_export.sql'
    const dryRun = process.argv.includes('--dry-run')
    const reemplazar = process.argv.includes('--reemplazar')

    const archivoPath = path.resolve(process.cwd(), archivoArg)
    const raw = await readFile(archivoPath, 'utf8')
    const registros = parseRegistros(raw.replace(/^\uFEFF/, ''))

    const filas: ArchivoRow[] = []
    let descartadas = 0
    let columnasRaras = 0

    for (const cols of registros) {
        if (cols.length !== CANTIDAD_COLUMNAS) columnasRaras += 1
        const fila = construirFila(cols)
        if (fila) filas.push(fila)
        else descartadas += 1
    }

    // El PacID viejo es la PK: si el export trae repetidos, gana el ultimo.
    const porId = new Map<number, ArchivoRow>()
    for (const fila of filas) porId.set(fila.pacienteIdViejo, fila)
    const unicas = [...porId.values()]

    const conHC = unicas.filter((f) => f.historiaClinicaVieja != null).length

    console.log(`Archivo: ${archivoPath}`)
    console.log(`Registros leidos: ${registros.length}`)
    console.log(`Registros con cantidad de columnas inesperada: ${columnasRaras}`)
    console.log(`Registros descartados (sin PacID o sin apellido): ${descartadas}`)
    console.log(`Filas validas: ${filas.length}`)
    console.log(`Filas unicas por PacID: ${unicas.length}`)
    console.log(`Con historia clinica vieja: ${conHC}`)
    console.log(`Sin historia clinica vieja: ${unicas.length - conHC}`)

    if (dryRun) {
        console.log('\nDry-run: no se escribio nada en la base.')
        console.log('Muestra:', JSON.stringify(unicas.slice(0, 2), null, 2))
        await prisma.$disconnect()
        return
    }

    if (reemplazar) {
        const borradas = await prisma.archivoPaciente.deleteMany({})
        console.log(`\nFilas borradas antes de recargar: ${borradas.count}`)
    }

    let insertadas = 0
    let rechazadas = 0

    for (const lote of chunk(unicas, 1000)) {
        try {
            const r = await prisma.archivoPaciente.createMany({ data: lote, skipDuplicates: true })
            insertadas += r.count
        } catch {
            // Si un lote falla, reintento fila a fila para no frenar la importacion.
            for (const fila of lote) {
                try {
                    const r = await prisma.archivoPaciente.createMany({
                        data: [fila],
                        skipDuplicates: true,
                    })
                    insertadas += r.count
                } catch {
                    rechazadas += 1
                }
            }
        }
    }

    const total = await prisma.archivoPaciente.count()

    console.log('\nImportacion finalizada:')
    console.log(`Insertadas: ${insertadas}`)
    console.log(`Rechazadas: ${rechazadas}`)
    console.log(`Omitidas (ya existian): ${unicas.length - insertadas - rechazadas}`)
    console.log(`Total en ArchivoPaciente: ${total}`)

    await prisma.$disconnect()
}

main().catch(async (error) => {
    console.error('Error importando el archivo historico:', error)
    await prisma.$disconnect()
    process.exit(1)
})
