import { PrismaClient } from '@prisma/client'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

type ObraSocialCsvRow = {
    id: number
    nombre: string
    requiereCoseguro: string
    estado: string
    fechaEstado: Date
}

type PlanCsvRow = {
    obraSocialId: number
    id: number
    descripcion: string
    norma: string | null
    estado: string
    fechaEstado: Date
    exportarIOSE: string | null
    codigoAnterior: string | null
    usuarioRegistro: string
}

const prisma = new PrismaClient()

function parseCsvLine(line: string): string[] {
    const values: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i]

        if (ch === '"') {
            const next = line[i + 1]
            if (inQuotes && next === '"') {
                current += '"'
                i += 1
            } else {
                inQuotes = !inQuotes
            }
            continue
        }

        if (ch === ',' && !inQuotes) {
            values.push(current)
            current = ''
            continue
        }

        current += ch
    }

    values.push(current)
    return values
}

function normalizeText(value: string | undefined): string | null {
    if (value == null) return null
    const trimmed = value.trim()
    if (!trimmed || /^null$/i.test(trimmed)) return null
    return trimmed
}

function normalizeEstado(value: string | undefined, fallback: 'A' | 'B' = 'A'): string {
    const normalized = normalizeText(value)?.toUpperCase()
    if (!normalized) return fallback
    if (normalized === 'A' || normalized === 'B') return normalized
    return fallback
}

function normalizeReqCoseg(value: string | undefined): string {
    const normalized = normalizeText(value)?.toUpperCase()
    if (!normalized) return 'N'
    if (normalized === '1' || normalized === 'S' || normalized === 'SI' || normalized === 'Y' || normalized === 'YES') {
        return 'S'
    }
    return 'N'
}

function parseDateWithFallback(value: string | undefined): Date {
    const raw = normalizeText(value)
    if (!raw) return new Date()

    const directDate = new Date(raw)
    if (!Number.isNaN(directDate.getTime())) return directDate

    // Algunos CSV legacy traen solo mm:ss.t sin fecha real.
    return new Date()
}

function parseRequiredInt(value: string | undefined, fieldName: string): number {
    const raw = normalizeText(value)
    if (!raw) {
        throw new Error(`${fieldName} vacio`)
    }

    const num = parseInt(raw, 10)
    if (!Number.isFinite(num) || num <= 0) {
        throw new Error(`${fieldName} invalido: ${value}`)
    }

    return num
}

function getOptionValue(flag: string): string | undefined {
    const prefix = `--${flag}=`
    const found = process.argv.find((arg) => arg.startsWith(prefix))
    return found ? found.slice(prefix.length) : undefined
}

async function readCsv(filePath: string): Promise<{ headers: string[]; rows: string[][] }> {
    const raw = await readFile(filePath, 'utf8')
    const lines = raw
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)

    if (lines.length < 2) {
        throw new Error(`CSV sin datos: ${filePath}`)
    }

    return {
        headers: parseCsvLine(lines[0]!).map((h) => h.trim()),
        rows: lines.slice(1).map(parseCsvLine),
    }
}

function requireHeader(headers: string[], name: string): number {
    const idx = headers.indexOf(name)
    if (idx < 0) {
        throw new Error(`Falta columna requerida: ${name}`)
    }
    return idx
}

function parseObrasSociales(headers: string[], rows: string[][]): { data: ObraSocialCsvRow[]; invalidRows: number } {
    const data: ObraSocialCsvRow[] = []
    let invalidRows = 0

    rows.forEach((cols, rowIndex) => {
        try {
            console.log(`Fila ${rowIndex + 2}: cols[0] = '${cols[0]}'`)
            // Asumir posiciones fijas: OSID=0, OSNom=1, OSReqCoseg=2, OSEstad=3, OSFchEstado=4
            const id = parseRequiredInt(cols[0], 'OSID')
            const nombre = normalizeText(cols[1])
            if (!nombre) throw new Error('OSNom vacio')

            data.push({
                id,
                nombre: nombre.slice(0, 200),
                requiereCoseguro: normalizeReqCoseg(cols[14]),
                estado: normalizeEstado(cols[15], 'A'),
                fechaEstado: parseDateWithFallback(cols[16]),
            })
        } catch (error) {
            invalidRows += 1
            const message = error instanceof Error ? error.message : String(error)
            console.warn(`Fila invalida ObrasSociales #${rowIndex + 2}: ${message}`)
        }
    })

    return { data, invalidRows }
}

function parsePlanes(headers: string[], rows: string[][]): { data: PlanCsvRow[]; invalidRows: number } {
    const data: PlanCsvRow[] = []
    let invalidRows = 0

    rows.forEach((cols, rowIndex) => {
        try {
            // Asumir posiciones fijas: OSID=0, PosID=1, PosDescrip=2, PosNorma=3, PosEstado=4, PosFchEstado=5, PosExportIOSE=6, PosCodOld=7, UsuCodig=8
            const obraSocialId = parseRequiredInt(cols[0], 'OSID')
            const id = parseRequiredInt(cols[1], 'PosID')
            const descripcion = normalizeText(cols[2])
            if (!descripcion) throw new Error('PosDescrip vacio')

            data.push({
                obraSocialId,
                id,
                descripcion: descripcion.slice(0, 200),
                norma: normalizeText(cols[3]),
                estado: normalizeEstado(cols[4], 'A'),
                fechaEstado: parseDateWithFallback(cols[5]),
                exportarIOSE: normalizeText(cols[6]),
                codigoAnterior: normalizeText(cols[7]),
                usuarioRegistro: (normalizeText(cols[8]) ?? 'SUPERVISOR').slice(0, 10),
            })
        } catch (error) {
            invalidRows += 1
            const message = error instanceof Error ? error.message : String(error)
            console.warn(`Fila invalida Planes #${rowIndex + 2}: ${message}`)
        }
    })

    return { data, invalidRows }
}

async function main() {
    const obraSocialFileArg = getOptionValue('obrasocial') ?? 'obrasocial(Hoja1).csv'
    const planFileArg = getOptionValue('plan') ?? 'planobrasocial(Hoja1).csv'
    const dryRun = process.argv.includes('--dry-run')

    const obraSocialPath = path.resolve(process.cwd(), obraSocialFileArg)
    const planPath = path.resolve(process.cwd(), planFileArg)

    const [obrasSocialesCsv, planesCsv] = await Promise.all([
        readCsv(obraSocialPath),
        readCsv(planPath),
    ])

    const obrasParsed = parseObrasSociales(obrasSocialesCsv.headers, obrasSocialesCsv.rows)
    const planesParsed = parsePlanes(planesCsv.headers, planesCsv.rows)

    console.log(`Archivo ObraSocial: ${obraSocialPath}`)
    console.log(`Filas ObrasSociales: ${obrasSocialesCsv.rows.length}`)
    console.log(`Filas ObrasSociales invalidas: ${obrasParsed.invalidRows}`)
    console.log(`Registros ObrasSociales validos: ${obrasParsed.data.length}`)
    console.log('')
    console.log(`Archivo Planes: ${planPath}`)
    console.log(`Filas Planes: ${planesCsv.rows.length}`)
    console.log(`Filas Planes invalidas: ${planesParsed.invalidRows}`)
    console.log(`Registros Planes validos: ${planesParsed.data.length}`)

    if (dryRun) {
        console.log('\nDry-run: no se realizaron cambios en base de datos.')
        await prisma.$disconnect()
        return
    }

    let obrasInsertadas = 0
    let obrasActualizadas = 0

    for (const row of obrasParsed.data) {
        const updated = await prisma.obraSocial.updateMany({
            where: { id: row.id },
            data: {
                nombre: row.nombre,
                requiereCoseguro: row.requiereCoseguro,
                estado: row.estado,
                fechaEstado: row.fechaEstado,
            },
        })

        if (updated.count > 0) {
            obrasActualizadas += updated.count
            continue
        }

        await prisma.obraSocial.create({
            data: {
                id: row.id,
                nombre: row.nombre,
                requiereCoseguro: row.requiereCoseguro,
                estado: row.estado,
                fechaEstado: row.fechaEstado,
            },
        })
        obrasInsertadas += 1
    }

    let planesInsertados = 0
    let planesActualizados = 0

    for (const row of planesParsed.data) {
        const updated = await prisma.planObraSocial.updateMany({
            where: {
                obraSocialId: row.obraSocialId,
                id: row.id,
            },
            data: {
                descripcion: row.descripcion,
                norma: row.norma,
                estado: row.estado,
                fechaEstado: row.fechaEstado,
                exportarIOSE: row.exportarIOSE,
                codigoAnterior: row.codigoAnterior,
                usuarioRegistro: row.usuarioRegistro,
            },
        })

        if (updated.count > 0) {
            planesActualizados += updated.count
            continue
        }

        await prisma.planObraSocial.create({
            data: {
                obraSocialId: row.obraSocialId,
                id: row.id,
                descripcion: row.descripcion,
                norma: row.norma,
                estado: row.estado,
                fechaEstado: row.fechaEstado,
                exportarIOSE: row.exportarIOSE,
                codigoAnterior: row.codigoAnterior,
                usuarioRegistro: row.usuarioRegistro,
            },
        })
        planesInsertados += 1
    }

    console.log('\nImportacion finalizada:')
    console.log(`Obras sociales insertadas: ${obrasInsertadas}`)
    console.log(`Obras sociales actualizadas: ${obrasActualizadas}`)
    console.log(`Planes insertados: ${planesInsertados}`)
    console.log(`Planes actualizados: ${planesActualizados}`)

    await prisma.$disconnect()
}

main().catch(async (error) => {
    console.error('Error en importacion de Obras Sociales/Planes:', error)
    await prisma.$disconnect()
    process.exit(1)
})
