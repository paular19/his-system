import * as XLSX from 'xlsx'
import { readFileSync } from 'fs'
import { PrismaClient, Prisma } from '@prisma/client'

const p = new PrismaClient()
const buf = readFileSync('C:\\Users\\ramos\\his-system\\Nomenclador_2026-02(3).xls')
const wb = XLSX.read(buf, { type: 'buffer', raw: false, cellDates: false })
const sheet = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: false })

// Find header row
let headerIdx = -1, codeIdx = -1, espIdx = -1, ayuIdx = -1, aneIdx = -1, gtoIdx = -1

for (let i = 0; i < rows.length; i++) {
    const h = rows[i].map(v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim())
    const ci = h.findIndex(x => x === 'codigo' || x.includes('codigo'))
    const ei = h.findIndex(x => x.includes('especialista') || x === 'esp')
    const ai = h.findIndex(x => x.includes('ayudante') || x === 'ayu')
    const ni = h.findIndex(x => x.includes('anestesista') || x === 'ane')
    const gi = h.findIndex(x => x.includes('gasto') || x === 'gto')
    if (ci >= 0 && ei >= 0) {
        headerIdx = i; codeIdx = ci; espIdx = ei; ayuIdx = ai; aneIdx = ni; gtoIdx = gi
        console.log(`Headers en fila ${i}: codigo=${ci}, esp=${ei}, ayu=${ai}, ane=${ni}, gto=${gi}`)
        break
    }
}

if (headerIdx < 0) { console.error('No se encontró fila de headers'); process.exit(1) }

function parseOrNull(v) {
    const raw = String(v ?? '').trim()
    if (!raw || raw === '-') return null
    const compact = raw.replace(/\s+/g, '')
    const hasComma = compact.includes(',')
    const hasDot = compact.includes('.')
    let norm = compact
    if (hasComma && hasDot) {
        const cl = compact.lastIndexOf(','), dl = compact.lastIndexOf('.')
        norm = cl > dl ? compact.replace(/\./g, '').replace(',', '.') : compact.replace(/,/g, '')
    } else if (hasComma) {
        norm = /,\d{1,4}$/.test(compact) ? compact.replace(',', '.') : compact.replace(/,/g, '')
    }
    if (!/^[-+]?\d+(\.\d+)?$/.test(norm)) return null
    const d = new Prisma.Decimal(norm)
    return d.isZero() ? null : d
}

const convenioId = 1
const records = []

for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    const codigo = String(row[codeIdx] ?? '').trim().replace(/[.,]0+$/, '').trim()
    if (!codigo || /^total\b/i.test(codigo) || codigo.length > 8) continue

    const esp = parseOrNull(row[espIdx])
    const ayu = ayuIdx >= 0 ? parseOrNull(row[ayuIdx]) : null
    const ane = aneIdx >= 0 ? parseOrNull(row[aneIdx]) : null
    const gto = gtoIdx >= 0 ? parseOrNull(row[gtoIdx]) : null

    records.push({ codigo, esp, ayu, ane, gto })
}

console.log(`Filas leidas: ${records.length}`)

// Bulk update via single SQL statement using VALUES list
// Split in chunks of 500 to avoid parameter limits
function chunk(arr, size) {
    const out = []
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
    return out
}

let updated = 0
for (const batch of chunk(records, 500)) {
    // Build: UPDATE "NPractica" SET ... FROM (VALUES ...) AS v(codigo, esp, ayu, ane, gto)
    // WHERE "NPractica"."NConCodig" = <convenioId> AND "NPractica"."NPrCodig" = v.codigo
    const valuesList = batch.map((r, idx) => {
        const base = idx * 5
        return `($${base+1}::char(8), $${base+2}::decimal, $${base+3}::decimal, $${base+4}::decimal, $${base+5}::decimal)`
    }).join(', ')

    const params = []
    for (const r of batch) {
        params.push(r.codigo.padEnd(8).slice(0, 8))
        params.push(r.esp !== null ? r.esp.toString() : null)
        params.push(r.ayu !== null ? r.ayu.toString() : null)
        params.push(r.ane !== null ? r.ane.toString() : null)
        params.push(r.gto !== null ? r.gto.toString() : null)
    }

    const sql = `
        UPDATE "NPractica" AS t
        SET "NPrValEsp" = v.esp,
            "NPrValAyu" = v.ayu,
            "NPrValAne" = v.ane,
            "NPrValGto" = v.gto
        FROM (VALUES ${valuesList}) AS v(codigo, esp, ayu, ane, gto)
        WHERE t."NConCodig" = ${convenioId}
          AND t."NPrCodig" = v.codigo
    `
    const result = await p.$executeRawUnsafe(sql, ...params)
    updated += result
    process.stdout.write('.')
}

console.log(`\nActualizadas: ${updated} filas`)
await p.$disconnect()
