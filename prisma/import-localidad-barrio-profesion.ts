import { PrismaClient } from '@prisma/client'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

type ParsedCsv = {
    headers: string[]
    rows: string[][]
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

async function readCsv(filePath: string): Promise<ParsedCsv> {
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

function getOptionValue(flag: string): string | undefined {
    const prefix = `--${flag}=`
    const found = process.argv.find((arg) => arg.startsWith(prefix))
    return found ? found.slice(prefix.length) : undefined
}

function requireHeader(headers: string[], name: string): number {
    const idx = headers.indexOf(name)
    if (idx < 0) {
        throw new Error(`Falta columna requerida: ${name}`)
    }
    return idx
}

function normalizeText(value: string | undefined): string | null {
    if (value == null) return null
    const trimmed = value.trim()
    if (!trimmed || /^null$/i.test(trimmed)) return null
    return trimmed
}

function parsePositiveInt(value: string | undefined): number | null {
    const raw = normalizeText(value)
    if (!raw) return null
    if (!/^[0-9]+$/.test(raw)) return null
    const num = Number.parseInt(raw, 10)
    if (!Number.isFinite(num) || num <= 0) return null
    return num
}

function chunk<T>(items: T[], size: number): T[][] {
    if (size <= 0) throw new Error('chunk size debe ser > 0')
    const result: T[][] = []
    for (let i = 0; i < items.length; i += size) {
        result.push(items.slice(i, i + size))
    }
    return result
}

async function main() {
    const localidadFileArg = getOptionValue('localidad') ?? 'Localidad(Hoja1).csv'
    const barrioFileArg = getOptionValue('barrio') ?? 'Barrio(Hoja1).csv'
    const profesionFileArg = getOptionValue('profesion') ?? 'Profesion(Hoja1).csv'
    const dryRun = process.argv.includes('--dry-run')

    const localidadPath = path.resolve(process.cwd(), localidadFileArg)
    const barrioPath = path.resolve(process.cwd(), barrioFileArg)
    const profesionPath = path.resolve(process.cwd(), profesionFileArg)

    const [localidadCsv, barrioCsv, profesionCsv] = await Promise.all([
        readCsv(localidadPath),
        readCsv(barrioPath),
        readCsv(profesionPath),
    ])

    const lIdx = {
        provinciaId: requireHeader(localidadCsv.headers, 'PrvID'),
        id: requireHeader(localidadCsv.headers, 'LodID'),
        descripcion: requireHeader(localidadCsv.headers, 'LodDescrip'),
        codigoPostal: requireHeader(localidadCsv.headers, 'LodCP'),
    }

    const bIdx = {
        provinciaId: requireHeader(barrioCsv.headers, 'PrvID'),
        localidadId: requireHeader(barrioCsv.headers, 'LodID'),
        id: requireHeader(barrioCsv.headers, 'BarID'),
        descripcion: requireHeader(barrioCsv.headers, 'BarDescrip'),
    }

    const pIdx = {
        id: requireHeader(profesionCsv.headers, 'PfeID'),
        descripcion: requireHeader(profesionCsv.headers, 'PfeDescrip'),
    }

    const provinciaIds = new Set((await prisma.provincia.findMany({ select: { id: true } })).map((p) => p.id))

    const localidadesParsed: Array<{ provinciaId: number; id: number; descripcion: string | null; codigoPostal: string | null }> = []
    let localidadesInvalidas = 0

    for (const cols of localidadCsv.rows) {
        const provinciaId = parsePositiveInt(cols[lIdx.provinciaId])
        const id = parsePositiveInt(cols[lIdx.id])
        if (!provinciaId || !id || !provinciaIds.has(provinciaId)) {
            localidadesInvalidas += 1
            continue
        }
        localidadesParsed.push({
            provinciaId,
            id,
            descripcion: normalizeText(cols[lIdx.descripcion])?.slice(0, 100) ?? null,
            codigoPostal: normalizeText(cols[lIdx.codigoPostal])?.slice(0, 10) ?? null,
        })
    }

    const localidadKeys = new Set(localidadesParsed.map((l) => `${l.provinciaId}|${l.id}`))

    const barriosParsed: Array<{ provinciaId: number; localidadId: number; id: number; descripcion: string | null }> = []
    let barriosInvalidos = 0

    for (const cols of barrioCsv.rows) {
        const provinciaId = parsePositiveInt(cols[bIdx.provinciaId])
        const localidadId = parsePositiveInt(cols[bIdx.localidadId])
        const id = parsePositiveInt(cols[bIdx.id])
        if (!provinciaId || !localidadId || !id) {
            barriosInvalidos += 1
            continue
        }
        if (!localidadKeys.has(`${provinciaId}|${localidadId}`)) {
            barriosInvalidos += 1
            continue
        }
        barriosParsed.push({
            provinciaId,
            localidadId,
            id,
            descripcion: normalizeText(cols[bIdx.descripcion])?.slice(0, 100) ?? null,
        })
    }

    const profesionesParsed: Array<{ id: number; descripcion: string }> = []
    let profesionesInvalidas = 0

    for (const cols of profesionCsv.rows) {
        const id = parsePositiveInt(cols[pIdx.id])
        const descripcion = normalizeText(cols[pIdx.descripcion])
        if (!id || !descripcion) {
            profesionesInvalidas += 1
            continue
        }
        profesionesParsed.push({ id, descripcion: descripcion.slice(0, 100) })
    }

    console.log(`Archivo Localidad: ${localidadPath}`)
    console.log(`Filas Localidad: ${localidadCsv.rows.length}`)
    console.log(`Filas Localidad invalidas: ${localidadesInvalidas}`)
    console.log(`Localidades validas: ${localidadesParsed.length}`)
    console.log('')
    console.log(`Archivo Barrio: ${barrioPath}`)
    console.log(`Filas Barrio: ${barrioCsv.rows.length}`)
    console.log(`Filas Barrio invalidas: ${barriosInvalidos}`)
    console.log(`Barrios validos: ${barriosParsed.length}`)
    console.log('')
    console.log(`Archivo Profesion: ${profesionPath}`)
    console.log(`Filas Profesion: ${profesionCsv.rows.length}`)
    console.log(`Filas Profesion invalidas: ${profesionesInvalidas}`)
    console.log(`Profesiones validas: ${profesionesParsed.length}`)

    if (dryRun) {
        console.log('\nDry-run: no se realizaron cambios en base de datos.')
        await prisma.$disconnect()
        return
    }

    let localidadInsertada = 0
    for (const batch of chunk(localidadesParsed, 1000)) {
        const result = await prisma.localidad.createMany({
            data: batch.map((row) => ({
                provinciaId: row.provinciaId,
                id: row.id,
                descripcion: row.descripcion,
                codigoPostal: row.codigoPostal,
            })),
            skipDuplicates: true,
        })
        localidadInsertada += result.count
    }
    const localidadOmitida = localidadesParsed.length - localidadInsertada

    let barrioInsertado = 0
    for (const batch of chunk(barriosParsed, 1000)) {
        const result = await prisma.barrio.createMany({
            data: batch.map((row) => ({
                provinciaId: row.provinciaId,
                localidadId: row.localidadId,
                id: row.id,
                descripcion: row.descripcion,
            })),
            skipDuplicates: true,
        })
        barrioInsertado += result.count
    }
    const barrioOmitido = barriosParsed.length - barrioInsertado

    let profesionInsertada = 0
    for (const batch of chunk(profesionesParsed, 1000)) {
        const result = await prisma.profesion.createMany({
            data: batch.map((row) => ({ id: row.id, descripcion: row.descripcion })),
            skipDuplicates: true,
        })
        profesionInsertada += result.count
    }
    const profesionOmitida = profesionesParsed.length - profesionInsertada

    console.log('\nImportacion finalizada:')
    console.log(`Localidades insertadas: ${localidadInsertada}`)
    console.log(`Localidades omitidas (duplicadas): ${localidadOmitida}`)
    console.log(`Barrios insertados: ${barrioInsertado}`)
    console.log(`Barrios omitidos (duplicados): ${barrioOmitido}`)
    console.log(`Profesiones insertadas: ${profesionInsertada}`)
    console.log(`Profesiones omitidas (duplicadas): ${profesionOmitida}`)

    await prisma.$disconnect()
}

main().catch(async (error) => {
    console.error('Error en importacion de Localidad/Barrio/Profesion:', error)
    await prisma.$disconnect()
    process.exit(1)
})
