import { PrismaClient } from '@prisma/client'
import path from 'node:path'
import XLSX from 'xlsx'

type CliOptions = {
    filePath: string
    sheetName?: string
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

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim()
}

function normalizeHeader(value: unknown): string {
    return normalizeWhitespace(String(value ?? ''))
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
}

function normalizeUsuario(value: string): string {
    const clean = normalizeWhitespace(value)
    return clean ? clean.slice(0, 10) : 'IMPORTUTI'
}

function parseCliOptions(): CliOptions {
    const argv = process.argv.slice(2)
    const positional = argv.filter((arg) => !arg.startsWith('--'))

    const fileArg = getOptionValue(argv, 'file') ?? positional[0] ?? 'planilla uti.xlsx'
    const sheetName = getOptionValue(argv, 'sheet')
    const usuario = normalizeUsuario(getOptionValue(argv, 'usuario') ?? 'IMPORTUTI')
    const dryRun = argv.includes('--dry-run')

    return {
        filePath: path.resolve(process.cwd(), fileArg),
        sheetName,
        usuario,
        dryRun,
    }
}

function parseMedicamentos(filePath: string, requestedSheet?: string): string[] {
    const workbook = XLSX.readFile(filePath, { raw: false, cellDates: false })
    const sheetName = requestedSheet ?? workbook.SheetNames[0]
    if (!sheetName) throw new Error('El archivo no contiene hojas.')

    const sheet = workbook.Sheets[sheetName]
    if (!sheet) throw new Error(`No existe la hoja "${sheetName}".`)

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: false,
        defval: '',
        blankrows: false,
    })

    const headerRowIndex = rows.findIndex((row) =>
        (row ?? []).some((cell) => normalizeHeader(cell) === 'MEDICAMENTO')
    )
    if (headerRowIndex < 0) {
        throw new Error('No se encontró encabezado "MEDICAMENTO" en la planilla.')
    }

    const markerColumns = (rows[headerRowIndex] ?? [])
        .map((cell, idx) => (normalizeHeader(cell) === 'MEDICAMENTO' ? idx : -1))
        .filter((idx) => idx >= 0)

    const uniq = new Map<string, string>()

    for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex] ?? []

        for (const colIdx of markerColumns) {
            const rawName = normalizeWhitespace(String(row[colIdx] ?? ''))
            if (!rawName) continue
            if (/^TOTAL\b/i.test(rawName)) continue

            const key = rawName
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toUpperCase()
            if (!uniq.has(key)) {
                uniq.set(key, rawName.slice(0, 200))
            }
        }
    }

    return [...uniq.values()].sort((a, b) => a.localeCompare(b, 'es'))
}

async function main() {
    const prisma = new PrismaClient()
    const options = parseCliOptions()

    const medicamentos = parseMedicamentos(options.filePath, options.sheetName)

    console.log(`Archivo: ${options.filePath}`)
    console.log(`Medicamentos únicos detectados: ${medicamentos.length}`)

    if (options.dryRun) {
        console.log('Modo dry-run activado. No se realizaron cambios en base de datos.')
        await prisma.$disconnect()
        return
    }

    const now = new Date()

    for (const nombre of medicamentos) {
        await prisma.catalogoMedicamentoUti.upsert({
            where: { nombre },
            create: {
                nombre,
                estado: 'A',
                fechaEstado: now,
                usuario: options.usuario,
            },
            update: {
                estado: 'A',
                fechaEstado: now,
                usuario: options.usuario,
            },
        })
    }

    console.log('Importación de medicamentos UTI finalizada correctamente.')

    await prisma.$disconnect()
}

main().catch((error) => {
    console.error('Error en importación de medicamentos UTI:', error)
    process.exitCode = 1
})
