import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { INSUMOS_UTI_FALLBACK } from './insumos-uti-fallback'

export interface CatalogoInsumoItem {
  id: number
  nombre: string
}

type CacheState = {
  key: string
  data: CatalogoInsumoItem[]
}

let cache: CacheState | null = null

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeKey(value: string): string {
  return normalizeWhitespace(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
}

function normalizeHeader(value: unknown): string {
  return normalizeKey(String(value ?? ''))
}

function resolveCatalogFile(fileName: string): string {
  return path.resolve(process.cwd(), fileName)
}

function buildCacheKey(paths: string[]): string {
  return paths
    .map((filePath) => {
      try {
        const stat = fs.statSync(filePath)
        return `${filePath}:${stat.mtimeMs}`
      } catch {
        return `${filePath}:missing`
      }
    })
    .join('|')
}

function parseExistencia(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return []

  const workbook = XLSX.readFile(filePath, { raw: false, cellDates: false })
  const values: string[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    })

    const headerRowIndex = rows.findIndex((row) => {
      const normalized = (row ?? []).map((cell) => normalizeHeader(cell))
      return normalized.includes('PRODUCTO') && normalized.includes('DETALLE')
    })

    if (headerRowIndex < 0) continue

    const header = (rows[headerRowIndex] ?? []).map((cell) => normalizeHeader(cell))
    const idxProducto = header.findIndex((cell) => cell === 'PRODUCTO')
    const idxDetalle = header.findIndex((cell) => cell === 'DETALLE')

    if (idxDetalle < 0) continue

    for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
      const row = rows[i] ?? []
      const producto = normalizeHeader(row[idxProducto] ?? '')
      const detalle = normalizeWhitespace(String(row[idxDetalle] ?? ''))

      if (!detalle) continue
      if (/^TOTAL\b/i.test(detalle)) continue

      if (
        !producto ||
        producto === 'DESCARTABLE' ||
        producto === 'DESCARTABLES' ||
        producto === 'MEDICACION' ||
        producto === 'MEDICAMENTO' ||
        producto === 'CONT'
      ) {
        values.push(detalle.slice(0, 200))
      }
    }
  }

  return values
}

function parseListadoMedicacion(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return []

  const workbook = XLSX.readFile(filePath, { raw: false, cellDates: false })
  const values: string[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    })

    if (rows.length === 0) continue

    const header = (rows[0] ?? []).map((cell) => normalizeHeader(cell))
    const idxDetalle = header.findIndex((cell) => cell.startsWith('DETALLE'))
    if (idxDetalle < 0) continue

    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i] ?? []
      const detalle = normalizeWhitespace(String(row[idxDetalle] ?? ''))
      if (!detalle) continue
      if (/^TOTAL\b/i.test(detalle)) continue
      values.push(detalle.slice(0, 200))
    }
  }

  return values
}

function buildCatalog(items: string[]): CatalogoInsumoItem[] {
  const uniq = new Map<string, string>()

  for (const raw of items) {
    const nombre = normalizeWhitespace(raw)
    if (!nombre) continue
    const key = normalizeKey(nombre)
    if (!uniq.has(key)) {
      uniq.set(key, nombre)
    }
  }

  return Array.from(uniq.values())
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
    .map((nombre, index) => ({ id: index + 1, nombre }))
}

export function obtenerCatalogoInsumosUti(): CatalogoInsumoItem[] {
  const existenciaPath = resolveCatalogFile('existencia.xlsx')
  const listadoMedicacionPath = resolveCatalogFile('LISTADO MEDICACION.xlsx')
  const cacheKey = buildCacheKey([existenciaPath, listadoMedicacionPath])

  if (cache && cache.key === cacheKey) {
    return cache.data
  }

  const items = [
    ...INSUMOS_UTI_FALLBACK,
    ...parseExistencia(existenciaPath),
    ...parseListadoMedicacion(listadoMedicacionPath),
  ]

  const data = buildCatalog(items)
  if (data.length === 0) {
    console.warn('[catalogo-insumos-uti] Catalogo vacio', {
      cwd: process.cwd(),
      existenciaPath,
      listadoMedicacionPath,
      existenciaExiste: fs.existsSync(existenciaPath),
      listadoExiste: fs.existsSync(listadoMedicacionPath),
      fallbackSize: INSUMOS_UTI_FALLBACK.length,
    })
  } else if (!fs.existsSync(existenciaPath) || !fs.existsSync(listadoMedicacionPath)) {
    console.info('[catalogo-insumos-uti] Usando fallback embebido', {
      cwd: process.cwd(),
      existenciaExiste: fs.existsSync(existenciaPath),
      listadoExiste: fs.existsSync(listadoMedicacionPath),
      fallbackSize: INSUMOS_UTI_FALLBACK.length,
    })
  }
  cache = { key: cacheKey, data }
  return data
}
