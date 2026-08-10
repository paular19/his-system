import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { utils, writeFile } from 'xlsx'

const SPECIALTIES = [
    'SIN ESPECIALIDAD ASIGNADA',
    'CIRUGIA CARDIOVASCULAR',
    'ORTOPEDIA Y TRAUMATOLOGIA',
    'CIRUGIA DE CABEZA Y CUELLO',
    'CIRUGIA PLASTICA O ESTETICA',
    'ANATOMIA PATOLOGICA',
    'GASTROENTEROLOGIA',
    'OTORRINOLARINGOLOGIA',
    'TERAPIA INTENSIVA',
    'MEDICINA FAMILIAR',
    'MEDICINA NUCLEAR',
    'OTRAS ESPECIALIDADES',
    'CIRUGIA VASCULAR',
    'CIRUGIA GENERAL',
    'CIRUGIA INFANTIL',
    'TOCOGINECOLOGIA',
    'CITODIAGNOSTICO',
    'ANESTESIOLOGIA',
    'ALERGOLOGIA',
    'ANGIOLOGIA',
    'CARDIOLOGIA',
    'CLINICA MEDICA',
    'DERMATOLOGIA',
    'DIABETOLOGIA',
    'ENDOCRINOLOGIA',
    'FISIATRIA',
    'GINECOLOGIA',
    'HEMATOLOGIA',
    'HEMOTERAPIA',
    'INFECTOLOGIA',
    'NEFROLOGIA',
    'NEUMONOLOGIA',
    'NEUROCIRUGIA',
    'NEUROLOGIA',
    'OFTALMOLOGIA',
    'ONCOLOGIA',
    'PEDIATRIA',
    'PROCTOLOGIA',
    'PSIQUIATRIA',
    'RADIOLOGIA',
    'REUMATOLOGIA',
    'TRAUAMATOLOGIA',
    'UROLOGIA',
].sort((left, right) => right.length - left.length)

function getOptionValue(flag) {
    const prefix = `--${flag}=`
    const found = process.argv.find((argument) => argument.startsWith(prefix))
    return found ? found.slice(prefix.length) : undefined
}

async function readSource() {
    const input = getOptionValue('input')
    if (input) return readFile(path.resolve(process.cwd(), input), 'utf8')

    return execFileSync(
        'powershell.exe',
        ['-NoProfile', '-Command', '[Console]::OutputEncoding = [Text.Encoding]::UTF8; Get-Clipboard -Raw'],
        { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    )
}

function normalizeName(rawValue) {
    let value = rawValue
        .replace(/Matricula Nombre Especialidad/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    const upperValue = value.toUpperCase()
    const specialtyIndex = SPECIALTIES.reduce((firstIndex, specialty) => {
        const index = upperValue.indexOf(specialty)
        if (index < 0) return firstIndex
        return firstIndex < 0 ? index : Math.min(firstIndex, index)
    }, -1)

    if (specialtyIndex >= 0) value = value.slice(0, specialtyIndex).trim()

    return value
        .replace(/^[.,;:]+|[.,;:]+$/g, '')
        .replace(/\s+[MKBNQ]$/i, '')
        .replace(/\s+/g, ' ')
        .trim()
}

function parseRegistry(source) {
    const normalized = `M ${source}`
        .replace(/\r?\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    const marker = /([MKBNQ])\s*(\d{1,6})\s*/g
    const matches = [...normalized.matchAll(marker)]

    return matches.flatMap((match, index) => {
        const start = match.index + match[0].length
        const end = matches[index + 1]?.index ?? normalized.length
        const row = {
            TIPO: match[1],
            MATRICULA: Number.parseInt(match[2], 10),
            MEDICO: normalizeName(normalized.slice(start, end)),
        }
        const embeddedLicense = row.MEDICO.match(/^(.*?\D)\s*(\d{2,6})\s+([^\d]+)$/)

        if (!embeddedLicense) return [row]

        return [
            { ...row, MEDICO: embeddedLicense[1].trim() },
            {
                TIPO: row.TIPO,
                MATRICULA: Number.parseInt(embeddedLicense[2], 10),
                MEDICO: embeddedLicense[3].trim(),
            },
        ]
    })
}

function reviewReason(row, duplicatedLicenses) {
    const reasons = []
    if (!Number.isInteger(row.MATRICULA) || row.MATRICULA <= 0) reasons.push('matricula invalida')
    if (!row.MEDICO || row.MEDICO.length < 4) reasons.push('nombre vacio o demasiado corto')
    if (/\d/.test(row.MEDICO)) reasons.push('nombre contiene numeros')
    if (/\b(?:ESPECIALIDAD|MATRICULA)\b/i.test(row.MEDICO)) reasons.push('texto de encabezado/especialidad')
    if (duplicatedLicenses.has(row.MATRICULA)) reasons.push('matricula repetida en el padron')
    return reasons.join('; ')
}

const source = await readSource()
const rows = parseRegistry(source)
const licenseCounts = new Map()

for (const row of rows) {
    licenseCounts.set(row.MATRICULA, (licenseCounts.get(row.MATRICULA) ?? 0) + 1)
}

const duplicatedLicenses = new Set(
    [...licenseCounts.entries()]
        .filter(([, count]) => count > 1)
        .map(([license]) => license)
)
const reviewedRows = rows.map((row) => ({ ...row, REVISAR: reviewReason(row, duplicatedLicenses) }))
const validRows = reviewedRows
    .filter((row) => !row.REVISAR)
    .map(({ MEDICO, MATRICULA }) => ({ MEDICO, MATRICULA }))
const rowsToReview = reviewedRows.filter((row) => row.REVISAR)
const output = path.resolve(process.cwd(), getOptionValue('output') ?? 'profesionales-extraidos.xlsx')
const workbook = utils.book_new()

utils.book_append_sheet(workbook, utils.json_to_sheet(validRows), 'PROFESIONALES')
utils.book_append_sheet(workbook, utils.json_to_sheet(rowsToReview), 'REVISAR')
writeFile(workbook, output)

console.log(`Registros detectados: ${rows.length}`)
console.log(`Listos para importar: ${validRows.length}`)
console.log(`Registros para revisar: ${rowsToReview.length}`)
console.log(`Matriculas repetidas: ${duplicatedLicenses.size}`)
console.log(`Archivo generado: ${output}`)