import { PrismaClient } from '@prisma/client'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { read, utils } from 'xlsx'

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

type ProfesionalExcelRow = {
    nombre: string
    matricula: number
    telefono: string | null
}

type ParsedProfesionales =
    | {
        sourceType: 'csv'
        rowsRead: number
        invalidRows: number
        data: ProfesionalCsvRow[]
    }
    | {
        sourceType: 'xlsx'
        rowsRead: number
        invalidRows: number
        data: ProfesionalExcelRow[]
    }

const DEFAULT_PROFESIONAL_FILES = [
    'LISTADO DE MEDICOS ACTIVOS (1).xlsx',
    'Profesional(Hoja1).csv',
] as const

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

function normalizeText(value: unknown): string | null {
    if (value == null) return null
    const trimmed = String(value).trim()
    if (!trimmed || /^null$/i.test(trimmed)) return null
    return trimmed
}

function normalizeProfessionalLookupName(value: unknown): string | null {
    const normalized = normalizeText(value)
    if (!normalized) return null

    return normalized
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/\bDRA?\.?\s+/g, '')
        .replace(/\s*\([^)]*\)\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function normalizeEstado(value: unknown, fallback: 'A' | 'B' = 'A'): string {
    const normalized = normalizeText(value)?.toUpperCase()
    if (!normalized) return fallback
    if (normalized === 'A' || normalized === 'B') return normalized
    return fallback
}

function parseDateWithFallback(value: unknown): Date {
    const raw = normalizeText(value)
    if (!raw) return new Date()

    const directDate = new Date(raw)
    if (!Number.isNaN(directDate.getTime())) return directDate

    return new Date()
}

function parseRequiredInt(value: unknown, fieldName: string): number {
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

function parseOptionalInt(value: unknown): number | null {
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

async function readExcelRows(filePath: string): Promise<unknown[][]> {
    const raw = await readFile(filePath)
    const workbook = read(raw, { type: 'buffer', cellDates: false })
    const firstSheetName = workbook.SheetNames[0]

    if (!firstSheetName) {
        throw new Error(`Excel sin hojas: ${filePath}`)
    }

    const firstSheet = workbook.Sheets[firstSheetName]
    if (!firstSheet) { throw new Error(`Hoja "${firstSheetName}" no encontrada en ${filePath}`) }; const rows = utils.sheet_to_json(firstSheet, {
        header: 1,
        raw: false,
        defval: '',
        blankrows: false,
    }) as unknown[][]

    if (rows.length === 0) {
        throw new Error(`Excel sin datos: ${filePath}`)
    }

    return rows
}

function requireHeader(headers: string[], name: string): number {
    const idx = headers.indexOf(name)
    if (idx < 0) {
        throw new Error(`Falta columna requerida: ${name}`)
    }
    return idx
}

function findExcelHeaderRow(rows: unknown[][]): number {
    const headerIndex = rows.findIndex((row) => {
        const normalizedRow = row.map((cell) => normalizeText(cell)?.toUpperCase() ?? '')
        return normalizedRow.includes('MEDICO') && normalizedRow.includes('MATRICULA')
    })

    if (headerIndex < 0) {
        throw new Error('No se encontraron encabezados MEDICO/MATRICULA en el Excel de profesionales')
    }

    return headerIndex
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

function parseProfesionalesExcel(rows: unknown[][]): { data: ProfesionalExcelRow[]; invalidRows: number; rowsRead: number } {
    const headerRowIndex = findExcelHeaderRow(rows)
    const headers = rows[headerRowIndex]!.map((cell) => normalizeText(cell)?.toUpperCase() ?? '')
    const idx = {
        nombre: requireHeader(headers, 'MEDICO'),
        matricula: requireHeader(headers, 'MATRICULA'),
        telefono: headers.indexOf('TELEFONO'),
    }

    const data: ProfesionalExcelRow[] = []
    let invalidRows = 0
    const dataRows = rows.slice(headerRowIndex + 1)

    dataRows.forEach((cols, rowIndex) => {
        const isBlank = cols.every((cell) => normalizeText(cell) == null)
        if (isBlank) {
            return
        }

        try {
            const nombre = normalizeText(cols[idx.nombre])
            if (!nombre) throw new Error('MEDICO vacio')

            data.push({
                nombre: nombre.slice(0, 200),
                matricula: parseRequiredInt(cols[idx.matricula], 'MATRICULA'),
                telefono: idx.telefono >= 0 ? normalizeText(cols[idx.telefono])?.slice(0, 50) ?? null : null,
            })
        } catch (error) {
            invalidRows += 1
            const message = error instanceof Error ? error.message : String(error)
            console.warn(`Fila invalida Excel Profesionales #${headerRowIndex + rowIndex + 2}: ${message}`)
        }
    })

    return { data, invalidRows, rowsRead: dataRows.length }
}

async function resolveProfesionalPath(): Promise<string> {
    const profesionalFileArg = getOptionValue('profesional')
    if (profesionalFileArg) {
        return path.resolve(process.cwd(), profesionalFileArg)
    }

    for (const candidate of DEFAULT_PROFESIONAL_FILES) {
        const candidatePath = path.resolve(process.cwd(), candidate)
        try {
            await access(candidatePath)
            return candidatePath
        } catch {
            // Ignore and continue with the next fallback.
        }
    }

    return path.resolve(process.cwd(), DEFAULT_PROFESIONAL_FILES[0])
}

async function loadProfesionales(filePath: string): Promise<ParsedProfesionales> {
    const extension = path.extname(filePath).toLowerCase()

    if (extension === '.xlsx' || extension === '.xls' || extension === '.xlsm') {
        const rows = await readExcelRows(filePath)
        const parsed = parseProfesionalesExcel(rows)
        return {
            sourceType: 'xlsx',
            rowsRead: parsed.rowsRead,
            invalidRows: parsed.invalidRows,
            data: parsed.data,
        }
    }

    const csv = await readCsv(filePath)
    const parsed = parseProfesionales(csv.headers, csv.rows)
    return {
        sourceType: 'csv',
        rowsRead: csv.rows.length,
        invalidRows: parsed.invalidRows,
        data: parsed.data,
    }
}

async function main() {
    const dryRun = process.argv.includes('--dry-run') || process.env.npm_config_dry_run === 'true'

    const profesionalPath = await resolveProfesionalPath()
    const profesionalesParsed = await loadProfesionales(profesionalPath)

    console.log(`Archivo Profesional: ${profesionalPath}`)
    console.log(`Fuente detectada: ${profesionalesParsed.sourceType.toUpperCase()}`)
    console.log(`Filas Profesionales: ${profesionalesParsed.rowsRead}`)
    console.log(`Filas Profesionales invalidas: ${profesionalesParsed.invalidRows}`)
    console.log(`Registros Profesionales validos: ${profesionalesParsed.data.length}`)

    if (dryRun) {
        console.log('\nDry-run: no se realizaron cambios en base de datos.')
        await prisma.$disconnect()
        return
    }

    let profesionalesInsertados = 0
    let profesionalesActualizados = 0

    if (profesionalesParsed.sourceType === 'csv') {
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
    } else {
        const profesionalesExistentes = await prisma.profesional.findMany({
            select: { id: true, nombre: true, matricula: true },
        })
        let nextProfesionalId = (profesionalesExistentes.reduce(
            (maxId, profesional) => Math.max(maxId, profesional.id),
            0
        )) + 1
        const profesionalPorMatricula = new Map<number, { id: number; nombre: string; matricula: number | null }>()
        const profesionalPorNombre = new Map<string, { id: number; nombre: string; matricula: number | null } | null>()

        for (const profesional of profesionalesExistentes) {
            if (typeof profesional.matricula === 'number' && profesional.matricula > 0) {
                profesionalPorMatricula.set(profesional.matricula, profesional)
            }

            const normalizedName = normalizeProfessionalLookupName(profesional.nombre)
            if (!normalizedName) continue

            if (profesionalPorNombre.has(normalizedName)) {
                profesionalPorNombre.set(normalizedName, null)
            } else {
                profesionalPorNombre.set(normalizedName, profesional)
            }
        }

        for (const row of profesionalesParsed.data) {
            const normalizedName = normalizeProfessionalLookupName(row.nombre)
            const existingByMatricula = profesionalPorMatricula.get(row.matricula)
            const existingByName = normalizedName ? profesionalPorNombre.get(normalizedName) ?? null : null
            const existing = existingByMatricula ?? existingByName

            if (existing) {
                await prisma.profesional.update({
                    where: { id: existing.id },
                    data: {
                        nombre: row.nombre,
                        matricula: row.matricula,
                        telefono: row.telefono,
                        estado: 'A',
                        fechaEstado: new Date(),
                    },
                })
                profesionalesActualizados += 1
            } else {
                const created = await prisma.profesional.create({
                    data: {
                        id: nextProfesionalId,
                        nombre: row.nombre,
                        matricula: row.matricula,
                        telefono: row.telefono,
                        estado: 'A',
                        fechaEstado: new Date(),
                        usuario: 'SUPERVISOR',
                    },
                    select: { id: true, nombre: true, matricula: true },
                })
                nextProfesionalId += 1
                profesionalesInsertados += 1

                profesionalPorMatricula.set(row.matricula, created)
                if (normalizedName) {
                    profesionalPorNombre.set(normalizedName, created)
                }
            }
        }
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
