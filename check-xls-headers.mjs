import * as XLSX from 'xlsx'
import { readFileSync } from 'fs'

const buf = readFileSync('C:\\Users\\ramos\\his-system\\Nomenclador_2026-02(3).xls')
const wb = XLSX.read(buf, { type: 'buffer', raw: false, cellDates: false })
const sheetName = wb.SheetNames[0]
console.log('Sheet:', sheetName)
const sheet = wb.Sheets[sheetName]
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: false })

// Find header row and show first 5 rows
for (let i = 0; i < Math.min(5, rows.length); i++) {
    console.log(`Row ${i}:`, JSON.stringify(rows[i]))
}
