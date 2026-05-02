import { Prisma, PrismaClient } from '@prisma/client'
import path from 'node:path'
import XLSX from 'xlsx'

type ParsedRow = {
    codigo: string
    descripcion: string
    valor: Prisma.Decimal
    nivel: string | null
}

type CliOptions = {
    filePath: string
    sheetName?: string
    convenioId: number
    usuario: string
    dryRun: boolean
}

function getOptionValue(argv: string[], name: string): string | undefined {
    const withEquals = argv.find((arg) => arg.startsWith(`--${name}=`))
    if (withEquals) return withEquals.slice(name.length + 3)

    const idx = argv.findIndex((arg) => arg === `--${name}`)
    if (idx >= 0) {
        const next = argv[idx + 1]
        if (next && !next.startsWith('--')) return next
    }

    return undefined
}

function parsePositiveInt(value: string | undefined, label: string, fallback: number): number {
    if (!value || value.trim().length === 0) return fallback
    const parsed = Number.parseInt(value, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`${label} invalido: "${value}"`)
    }
    return parsed
}

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim()
}

function normalizeCode(value: unknown): string {
    const asString = String(value ?? '').trim()
    if (!asString) return ''

    const withoutDecimalTail = asString.replace(/[.,]0+$/, '')
    return withoutDecimalTail.trim()
}

function parseDecimal(value: unknown): Prisma.Decimal {
    const raw = String(value ?? '').trim()
    if (!raw) return new Prisma.Decimal(0)

    const compact = raw.replace(/\s+/g, '')
    const hasComma = compact.includes(',')
    const hasDot = compact.includes('.')

    let normalized = compact
    if (hasComma && hasDot) {
        const commaLast = compact.lastIndexOf(',')
        const dotLast = compact.lastIndexOf('.')

        // 1.234,56 => decimal coma
        if (commaLast > dotLast) {
            normalized = compact.replace(/\./g, '').replace(',', '.')
        } else {
            // 1,234.56 => decimal punto
            normalized = compact.replace(/,/g, '')
        }
    } else if (hasComma) {
        // Si termina con ,dd se toma como decimal; si no, como separador de miles.
        normalized = /,\d{1,4}$/.test(compact) ? compact.replace(',', '.') : compact.replace(/,/g, '')
    }

    if (!/^[-+]?\d+(\.\d+)?$/.test(normalized)) {
        throw new Error(`Valor decimal invalido: "${raw}"`)
    }

    return new Prisma.Decimal(normalized)
}

function normalizeHeader(value: unknown): string {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
}

function detectHeaderRow(rows: unknown[][]): { headerRowIndex: number; codeIdx: number; descIdx: number; totalIdx: number; nivelIdx: number } {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex] ?? []
        const headers = row.map((col) => normalizeHeader(col))

        const codeIdx = headers.findIndex((h) => h === 'codigo' || h.includes('codigo'))
        const descIdx = headers.findIndex((h) => h === 'descripcion' || h.includes('descripcion'))
        const totalIdx = headers.findIndex((h) => h.includes('total'))
        const nivelIdx = headers.findIndex((h) => h.includes('nivel'))

        if (codeIdx >= 0 && descIdx >= 0 && totalIdx >= 0) {
            return { headerRowIndex: rowIndex, codeIdx, descIdx, totalIdx, nivelIdx }
        }
    }

    throw new Error('No se encontro la fila de encabezados (Codigo, Descripcion, Total).')
}

function categoriaFromNivel(nivel: string | null): string {
    if (!nivel) return 'GENERAL'
    const clean = normalizeWhitespace(nivel).toUpperCase().replace(/[^A-Z0-9_-]/g, '')
    if (!clean) return 'GENERAL'
    return `NIVEL_${clean}`.slice(0, 30)
}

function normalizeUsuario(value: string): string {
    const clean = value.trim()
    if (!clean) return 'IMPORTXLS'
    return clean.slice(0, 10)
}

function parseCliOptions(): CliOptions {
    const argv = process.argv.slice(2)
    const positional = argv.filter((arg) => !arg.startsWith('--'))

    const fileArg = getOptionValue(argv, 'file') ?? positional[0] ?? 'Nomenclador_2026-02(3).xls'
    const sheetName = getOptionValue(argv, 'sheet')
    const convenioId = parsePositiveInt(getOptionValue(argv, 'convenio-id'), 'convenio-id', 1)
    const usuario = normalizeUsuario(getOptionValue(argv, 'usuario') ?? 'IMPORTXLS')
    const dryRun = argv.includes('--dry-run')

    return {
        filePath: path.resolve(process.cwd(), fileArg),
        sheetName,
        convenioId,
        usuario,
        dryRun,
    }
}

function parseWorkbookRows(filePath: string, requestedSheet?: string): ParsedRow[] {
    const workbook = XLSX.readFile(filePath, { raw: false, cellDates: false })
    const sheetName = requestedSheet ?? workbook.SheetNames[0]
    if (!sheetName) {
        throw new Error('El archivo XLS no contiene hojas para importar.')
    }

    const sheet = workbook.Sheets[sheetName]
    if (!sheet) {
        throw new Error(`No existe la hoja "${sheetName}" en el archivo XLS.`)
    }

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: false,
        defval: '',
        blankrows: false,
    })

    const { headerRowIndex, codeIdx, descIdx, totalIdx, nivelIdx } = detectHeaderRow(rows)

    const parsed = new Map<string, ParsedRow>()
    let invalidRows = 0

    for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
        const row = rows[i] ?? []

        try {
            const codigo = normalizeCode(row[codeIdx])
            const descripcion = normalizeWhitespace(String(row[descIdx] ?? ''))
            const totalRaw = row[totalIdx]
            const nivelRaw = nivelIdx >= 0 ? String(row[nivelIdx] ?? '').trim() : ''

            if (!codigo) continue
            if (/^total\b/i.test(codigo)) continue
            if (!descripcion) throw new Error('Descripcion vacia')

            const valor = parseDecimal(totalRaw)
            const nivel = nivelRaw ? nivelRaw : null

            const existing = parsed.get(codigo)
            if (!existing || descripcion.length >= existing.descripcion.length) {
                parsed.set(codigo, { codigo, descripcion, valor, nivel })
            }
        } catch (error) {
            invalidRows += 1
            console.warn(`Fila ${i + 1} omitida: ${(error as Error).message}`)
        }
    }

    console.log(`Filas invalidas: ${invalidRows}`)
    return [...parsed.values()]
}

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = []
    for (let i = 0; i < items.length; i += size) {
        out.push(items.slice(i, i + size))
    }
    return out
}

async function main() {
    const prisma = new PrismaClient()
    const options = parseCliOptions()

    const rows = parseWorkbookRows(options.filePath, options.sheetName)

    console.log(`Archivo: ${options.filePath}`)
    console.log(`Registros unicos por codigo: ${rows.length}`)
    console.log(`Convenio destino (NPractica): ${options.convenioId}`)

    if (options.dryRun) {
        console.log('Modo dry-run activado. No se realizaron cambios en base de datos.')
        await prisma.$disconnect()
        return
    }

    const now = new Date()

    let upsertsPrestacion = 0
    for (const batch of chunk(rows, 200)) {
        await Promise.all(
            batch.map((row) =>
                prisma.nomencladorPrestacion.upsert({
                    where: { codigo: row.codigo },
                    create: {
                        codigo: row.codigo,
                        descripcion: row.descripcion,
                        categoria: categoriaFromNivel(row.nivel),
                        valor: row.valor,
                        estado: 'A',
                        fechaEstado: now,
                        usuario: options.usuario,
                    },
                    update: {
                        descripcion: row.descripcion,
                        categoria: categoriaFromNivel(row.nivel),
                        valor: row.valor,
                        estado: 'A',
                        fechaEstado: now,
                        usuario: options.usuario,
                    },
                })
            )
        )
        upsertsPrestacion += batch.length
    }

    let upsertsPractica = 0
    let skippedPracticaByCodeLength = 0

    for (const batch of chunk(rows, 200)) {
        const validForPractica = batch.filter((row) => row.codigo.length <= 8)
        skippedPracticaByCodeLength += batch.length - validForPractica.length

        await Promise.all(
            validForPractica.map((row) =>
                prisma.nomencladorPractica.upsert({
                    where: {
                        convenioId_codigo: {
                            convenioId: options.convenioId,
                            codigo: row.codigo,
                        },
                    },
                    create: {
                        convenioId: options.convenioId,
                        codigo: row.codigo,
                        descripcion: row.descripcion,
                    },
                    update: {
                        descripcion: row.descripcion,
                    },
                })
            )
        )

        upsertsPractica += validForPractica.length
    }

    console.log('Importacion finalizada:')
    console.log(`NomPrestacion actualizados/insertados: ${upsertsPrestacion}`)
    console.log(`NPractica actualizados/insertados: ${upsertsPractica}`)
    console.log(`NPractica omitidos (codigo > 8): ${skippedPracticaByCodeLength}`)

    await prisma.$disconnect()
}

main().catch(async (error) => {
    console.error('Error en importacion XLS:', error)
    process.exitCode = 1
})
