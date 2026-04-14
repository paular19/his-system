import { Prisma, PrismaClient } from '@prisma/client'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

type CsvPracticaRow = {
    practicaId: number
    convenioId: number
    codigoPractica: string
    descripcionPractica: string
    cantidad: Prisma.Decimal
    importeTotal: Prisma.Decimal
    usuarioRegistro: string
}

type NomencladorRow = {
    convenioId: number
    codigo: string
    descripcion: string
}

function parseCsvLine(line: string): string[] {
    const values: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i]

        if (char === '"') {
            const nextChar = line[i + 1]
            if (inQuotes && nextChar === '"') {
                current += '"'
                i += 1
            } else {
                inQuotes = !inQuotes
            }
            continue
        }

        if (char === ',' && !inQuotes) {
            values.push(current)
            current = ''
            continue
        }

        current += char
    }

    values.push(current)
    return values
}

function parseDecimal(value: string): Prisma.Decimal {
    const normalized = value.trim().replace(',', '.')
    if (!normalized) return new Prisma.Decimal(0)
    if (!/^[-+]?\d+(\.\d+)?$/.test(normalized)) {
        throw new Error(`Valor decimal invalido: "${value}"`)
    }
    return new Prisma.Decimal(normalized)
}

function normalizeCodigo(codigo: string): string {
    return codigo.trim()
}

function normalizeDescripcion(descripcion: string): string {
    return descripcion.replace(/\s+/g, ' ').trim()
}

function normalizeUsuario(usuario: string): string {
    const cleaned = usuario.trim()
    if (cleaned.length === 0) return 'IMPORTCSV'
    return cleaned.slice(0, 10)
}

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = []
    for (let i = 0; i < items.length; i += size) {
        out.push(items.slice(i, i + size))
    }
    return out
}

function getCsvValue(cols: string[], index: number): string {
    return cols[index] ?? ''
}

function parsePositiveInt(value: string, label: string): number {
    const parsed = Number.parseInt(value, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`${label} invalido: "${value}"`)
    }
    return parsed
}

function parseBooleanFlag(value: string): boolean {
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 't', 'si', 's', 'yes', 'y'].includes(normalized)) return true
    if (['0', 'false', 'f', 'no', 'n'].includes(normalized)) return false
    throw new Error(`Valor booleano invalido: "${value}"`)
}

async function main() {
    const prisma = new PrismaClient()
    const argv = process.argv.slice(2)
    const getOptionValue = (name: string) => {
        const withEquals = argv.find((arg) => arg.startsWith(`--${name}=`))
        if (withEquals) return withEquals.slice(name.length + 3)

        const idx = argv.findIndex((arg) => arg === `--${name}`)
        if (idx >= 0) {
            const next = argv[idx + 1]
            if (next && !next.startsWith('--')) return next
        }

        return undefined
    }

    const positionalArgs = argv.filter((arg) => !arg.startsWith('--'))
    const fileArg = getOptionValue('file') ?? getOptionValue('csv') ?? positionalArgs[0] ?? 'Book-1.csv'
    const dryRun = process.argv.includes('--dry-run')
    const csvPath = path.resolve(process.cwd(), fileArg)

    const raw = await readFile(csvPath, 'utf8')
    const lines = raw
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)

    if (lines.length < 2) {
        throw new Error('El CSV no tiene filas de datos para importar.')
    }

    const headers = parseCsvLine(lines[0]!).map((h) => h.trim())
    const idx = {
        practicaId: headers.indexOf('ID Práctica'),
        convenioId: headers.indexOf('ID Convenio'),
        codigoPractica: headers.indexOf('Código Práctica'),
        descripcionPractica: headers.indexOf('Descripción Práctica'),
        cantidad: headers.indexOf('Cantidad'),
        importeTotal: headers.indexOf('Importe Total'),
        usuarioRegistro: headers.indexOf('Usuario Registro'),
    }

    const missingHeader = Object.entries(idx).find(([, index]) => index < 0)
    if (missingHeader) {
        throw new Error(`Falta columna requerida en CSV: ${missingHeader[0]}`)
    }

    const practicaById = new Map<number, CsvPracticaRow>()
    const nomencladorByKey = new Map<string, NomencladorRow>()

    let invalidRows = 0

    for (let lineNumber = 2; lineNumber <= lines.length; lineNumber += 1) {
        const cols = parseCsvLine(lines[lineNumber - 1]!)

        try {
            const practicaId = Number.parseInt(getCsvValue(cols, idx.practicaId), 10)
            const convenioId = Number.parseInt(getCsvValue(cols, idx.convenioId), 10)
            const codigoPractica = normalizeCodigo(getCsvValue(cols, idx.codigoPractica))
            const descripcionPractica = normalizeDescripcion(getCsvValue(cols, idx.descripcionPractica))
            const cantidad = parseDecimal(getCsvValue(cols, idx.cantidad))
            const importeTotal = parseDecimal(getCsvValue(cols, idx.importeTotal))
            const usuarioRegistro = normalizeUsuario(getCsvValue(cols, idx.usuarioRegistro))

            if (!Number.isFinite(practicaId) || practicaId <= 0) throw new Error('ID Práctica invalido')
            if (!Number.isFinite(convenioId) || convenioId <= 0) throw new Error('ID Convenio invalido')
            if (!codigoPractica) throw new Error('Codigo Practica vacio')
            if (!descripcionPractica) throw new Error('Descripcion Practica vacia')

            practicaById.set(practicaId, {
                practicaId,
                convenioId,
                codigoPractica,
                descripcionPractica,
                cantidad,
                importeTotal,
                usuarioRegistro,
            })

            const nomencladorKey = `${convenioId}::${codigoPractica}`
            const existingNomenclador = nomencladorByKey.get(nomencladorKey)
            if (!existingNomenclador || descripcionPractica.length > existingNomenclador.descripcion.length) {
                nomencladorByKey.set(nomencladorKey, {
                    convenioId,
                    codigo: codigoPractica,
                    descripcion: descripcionPractica,
                })
            }
        } catch (error) {
            invalidRows += 1
            console.warn(`Fila ${lineNumber} omitida: ${(error as Error).message}`)
        }
    }

    const practicas = [...practicaById.values()]
    const nomencladores = [...nomencladorByKey.values()]

    console.log(`Archivo: ${csvPath}`)
    console.log(`Filas leidas: ${lines.length - 1}`)
    console.log(`Filas invalidas: ${invalidRows}`)
    console.log(`Practicas a procesar: ${practicas.length}`)
    console.log(`Nomenclador a procesar: ${nomencladores.length}`)

    if (dryRun) {
        console.log('Modo dry-run activado. No se realizaron cambios en base de datos.')
        await prisma.$disconnect()
        return
    }

    const ingresoIdArg = getOptionValue('ingreso-id')
    const ingresoIdDefault = ingresoIdArg
        ? parsePositiveInt(ingresoIdArg, 'ingreso-id')
        : (await prisma.ingreso.findFirst({ orderBy: { id: 'asc' }, select: { id: true } }))?.id

    if (!ingresoIdDefault) {
        throw new Error('No hay ingresos en la base para crear Practica. Crea un Ingreso o pasa --ingreso-id=<id>.')
    }

    const convenioValorIdArg = getOptionValue('convenio-valor-id')
    const convenioValorIdFijo = convenioValorIdArg
        ? parsePositiveInt(convenioValorIdArg, 'convenio-valor-id')
        : null

    const fechaPracticaArg = getOptionValue('fecha-practica')
    const fechaPractica = fechaPracticaArg ? new Date(fechaPracticaArg) : new Date()
    if (Number.isNaN(fechaPractica.getTime())) {
        throw new Error(`fecha-practica invalida: "${fechaPracticaArg}"`)
    }

    const facturableArg = getOptionValue('facturable')
    const facturableDefault = facturableArg ? parseBooleanFlag(facturableArg) : true
    const estadoPractica = (getOptionValue('estado-practica') ?? 'A').trim().slice(0, 1) || 'A'

    let nomencladorCreatedOrUpdated = 0
    for (const batch of chunk(nomencladores, 100)) {
        await Promise.all(
            batch.map((row) =>
                prisma.nomencladorPractica.upsert({
                    where: {
                        convenioId_codigo: {
                            convenioId: row.convenioId,
                            codigo: row.codigo,
                        },
                    },
                    create: {
                        convenioId: row.convenioId,
                        codigo: row.codigo,
                        descripcion: row.descripcion,
                    },
                    update: {
                        descripcion: row.descripcion,
                    },
                })
            )
        )
        nomencladorCreatedOrUpdated += batch.length
    }

    let practicasInserted = 0
    let practicasUpdated = 0

    for (const batch of chunk(practicas, 200)) {
        const ids = batch.map((row) => row.practicaId)
        const existing = await prisma.practica.findMany({
            where: { id: { in: ids } },
            select: { id: true },
        })
        const existingIds = new Set(existing.map((row) => row.id))

        const toInsert = batch.filter((row) => !existingIds.has(row.practicaId))
        if (toInsert.length > 0) {
            const insertResult = await prisma.practica.createMany({
                data: toInsert.map((row) => ({
                    id: row.practicaId,
                    ingresoId: ingresoIdDefault,
                    convenioId: row.convenioId,
                    codigoPractica: row.codigoPractica,
                    convenioValorId: convenioValorIdFijo ?? row.convenioId,
                    fecha: fechaPractica,
                    cantidad: row.cantidad,
                    facturable: facturableDefault,
                    importeTotal: row.importeTotal,
                    estado: estadoPractica,
                    usuarioRegistro: row.usuarioRegistro,
                    fechaUsuario: fechaPractica,
                })),
                skipDuplicates: true,
            })
            practicasInserted += insertResult.count
        }

        const toUpdate = batch.filter((row) => existingIds.has(row.practicaId))
        if (toUpdate.length > 0) {
            const updateResults = await Promise.all(
                toUpdate.map((row) =>
                    prisma.practica.updateMany({
                        where: { id: row.practicaId },
                        data: {
                            convenioId: row.convenioId,
                            codigoPractica: row.codigoPractica,
                            convenioValorId: convenioValorIdFijo ?? row.convenioId,
                            cantidad: row.cantidad,
                            importeTotal: row.importeTotal,
                            usuarioRegistro: row.usuarioRegistro,
                            fechaUsuario: fechaPractica,
                        },
                    })
                )
            )
            practicasUpdated += updateResults.reduce((acc, result) => acc + result.count, 0)
        }
    }

    console.log('Importacion finalizada:')
    console.log(`Nomenclador actualizados/insertados: ${nomencladorCreatedOrUpdated}`)
    console.log(`Practicas insertadas: ${practicasInserted}`)
    console.log(`Practicas actualizadas: ${practicasUpdated}`)
    console.log(`Practicas procesadas: ${practicasInserted + practicasUpdated}`)

    await prisma.$disconnect()
}

main().catch(async (error) => {
    console.error('Error en importacion:', error)
    process.exitCode = 1
})
