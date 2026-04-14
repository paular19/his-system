import { PrismaClient } from '@prisma/client'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

type ProfesionalCsvRow = {
    id: number
    nombre: string
    matricula: number | null
    especialidadId: number | null
    tipoProfesionalCodigo: string | null
    domicilio: string | null
    provinciaId: number | null
    localidadId: number | null
    codigoPostal: string | null
    telefono: string | null
    celular: string | null
    email: string | null
    estado: string
    fechaEstado: Date
    usuario: string
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

function parseDateWithFallback(value: string | undefined): Date {
    const raw = normalizeText(value)
    if (!raw) return new Date()

    const directDate = new Date(raw)
    if (!Number.isNaN(directDate.getTime())) return directDate

    return new Date()
}

function parseRequiredInt(value: string | undefined, fieldName: string): number {
    const raw = normalizeText(value)
    if (!raw) {
        throw new Error(`${fieldName} vacio`)
    }

    const num = Number.parseInt(raw, 10)
    if (!Number.isFinite(num) || num <= 0) {
        throw new Error(`${fieldName} invalido: ${value}`)
    }

    return num
}

function parseOptionalInt(value: string | undefined): number | null {
    const raw = normalizeText(value)
    if (!raw) return null
    const num = Number.parseInt(raw, 10)
    if (!Number.isFinite(num) || num <= 0) return null
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

function parseProfesionales(headers: string[], rows: string[][]): { data: ProfesionalCsvRow[]; invalidRows: number } {
    const idx = {
        id: requireHeader(headers, 'PrfID'),
        nombre: requireHeader(headers, 'PrfNombre'),
        matricula: requireHeader(headers, 'PrfMatric'),
        especialidadId: requireHeader(headers, 'EspID'),
        tipoProfesionalCodigo: requireHeader(headers, 'TpfCodig'),
        domicilio: requireHeader(headers, 'PrfDomic'),
        provinciaId: requireHeader(headers, 'PrvID'),
        localidadId: requireHeader(headers, 'LodID'),
        codigoPostal: requireHeader(headers, 'PrfCP'),
        telefono: requireHeader(headers, 'PrfTelef'),
        celular: requireHeader(headers, 'PrfTelCel'),
        email: requireHeader(headers, 'PrfEmail'),
        estado: requireHeader(headers, 'PrfEstad'),
        fechaEstado: requireHeader(headers, 'PrfFchEst'),
        usuario: requireHeader(headers, 'UsuCodig'),
    }

    const data: ProfesionalCsvRow[] = []
    let invalidRows = 0

    rows.forEach((cols, rowIndex) => {
        try {
            const id = parseRequiredInt(cols[idx.id], 'PrfID')
            const nombre = normalizeText(cols[idx.nombre])
            if (!nombre) throw new Error('PrfNombre vacio')

            data.push({
                id,
                nombre: nombre.slice(0, 200),
                matricula: parseOptionalInt(cols[idx.matricula]),
                especialidadId: parseOptionalInt(cols[idx.especialidadId]),
                tipoProfesionalCodigo: normalizeText(cols[idx.tipoProfesionalCodigo])?.slice(0, 3) ?? null,
                domicilio: normalizeText(cols[idx.domicilio])?.slice(0, 200) ?? null,
                provinciaId: parseOptionalInt(cols[idx.provinciaId]),
                localidadId: parseOptionalInt(cols[idx.localidadId]),
                codigoPostal: normalizeText(cols[idx.codigoPostal])?.slice(0, 10) ?? null,
                telefono: normalizeText(cols[idx.telefono])?.slice(0, 50) ?? null,
                celular: normalizeText(cols[idx.celular])?.slice(0, 50) ?? null,
                email: normalizeText(cols[idx.email])?.slice(0, 100) ?? null,
                estado: normalizeEstado(cols[idx.estado], 'A'),
                fechaEstado: parseDateWithFallback(cols[idx.fechaEstado]),
                usuario: (normalizeText(cols[idx.usuario]) ?? 'SUPERVISOR').slice(0, 10),
            })
        } catch (error) {
            invalidRows += 1
            const message = error instanceof Error ? error.message : String(error)
            console.warn(`Fila invalida Profesionales #${rowIndex + 2}: ${message}`)
        }
    })

    return { data, invalidRows }
}

async function main() {
    const profesionalFileArg = getOptionValue('profesional') ?? 'Profesional(Hoja1).csv'
    const dryRun = process.argv.includes('--dry-run')

    const profesionalPath = path.resolve(process.cwd(), profesionalFileArg)

    const profesionalesCsv = await readCsv(profesionalPath)

    const profesionalesParsed = parseProfesionales(profesionalesCsv.headers, profesionalesCsv.rows)

    console.log(`Archivo Profesional: ${profesionalPath}`)
    console.log(`Filas Profesionales: ${profesionalesCsv.rows.length}`)
    console.log(`Filas Profesionales invalidas: ${profesionalesParsed.invalidRows}`)
    console.log(`Registros Profesionales validos: ${profesionalesParsed.data.length}`)

    if (dryRun) {
        console.log('\nDry-run: no se realizaron cambios en base de datos.')
        await prisma.$disconnect()
        return
    }

    let profesionalesInsertados = 0
    let profesionalesActualizados = 0

    for (const row of profesionalesParsed.data) {
        const updated = await prisma.profesional.updateMany({
            where: { id: row.id },
            data: {
                nombre: row.nombre,
                matricula: row.matricula,
                especialidadId: row.especialidadId,
                tipoProfesionalCodigo: row.tipoProfesionalCodigo,
                domicilio: row.domicilio,
                provinciaId: row.provinciaId,
                localidadId: row.localidadId,
                codigoPostal: row.codigoPostal,
                telefono: row.telefono,
                celular: row.celular,
                email: row.email,
                estado: row.estado,
                fechaEstado: row.fechaEstado,
                usuario: row.usuario,
            },
        })

        if (updated.count > 0) {
            profesionalesActualizados += updated.count
            continue
        }

        await prisma.profesional.create({
            data: {
                id: row.id,
                nombre: row.nombre,
                matricula: row.matricula,
                especialidadId: row.especialidadId,
                tipoProfesionalCodigo: row.tipoProfesionalCodigo,
                domicilio: row.domicilio,
                provinciaId: row.provinciaId,
                localidadId: row.localidadId,
                codigoPostal: row.codigoPostal,
                telefono: row.telefono,
                celular: row.celular,
                email: row.email,
                estado: row.estado,
                fechaEstado: row.fechaEstado,
                usuario: row.usuario,
            },
        })
        profesionalesInsertados += 1
    }

    console.log('\nImportacion finalizada:')
    console.log(`Profesionales insertados: ${profesionalesInsertados}`)
    console.log(`Profesionales actualizados: ${profesionalesActualizados}`)

    await prisma.$disconnect()
}

main().catch(async (error) => {
    console.error('Error en importacion de Profesionales:', error)
    await prisma.$disconnect()
    process.exit(1)
})