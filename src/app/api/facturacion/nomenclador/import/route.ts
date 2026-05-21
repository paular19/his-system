import { Prisma } from '@prisma/client'
import { type NextRequest } from 'next/server'
import * as XLSX from 'xlsx'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { prisma } from '@/lib/db'
import { apiOk, apiError, apiForbidden, manejarErrorApi } from '@/lib/utils/response'

export const runtime = 'nodejs'
export const maxDuration = 900
const IMPORT_BATCH_SIZE = 100

type ParsedRow = {
    codigo: string
    descripcion: string
    valor: Prisma.Decimal
    nivel: string | null
    esp: Prisma.Decimal | null
    ayu: Prisma.Decimal | null
    ane: Prisma.Decimal | null
    gto: Prisma.Decimal | null
}

const AUDIT_ENTIDAD_NOMENCLADOR = 'FACTURACION_NOMENCLADOR'

type NomencladorVigenteMeta = {
    nombre: string
    fecha: string
    usuario: string
}

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim()
}

function normalizeCode(value: unknown): string {
    const asString = String(value ?? '').trim()
    if (!asString) return ''
    return asString.replace(/[.,]0+$/, '').trim()
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
        normalized = commaLast > dotLast
            ? compact.replace(/\./g, '').replace(',', '.')
            : compact.replace(/,/g, '')
    } else if (hasComma) {
        normalized = /,\d{1,4}$/.test(compact)
            ? compact.replace(',', '.')
            : compact.replace(/,/g, '')
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

function detectHeaderRow(rows: unknown[][]): {
    headerRowIndex: number
    codeIdx: number
    descIdx: number
    totalIdx: number
    nivelIdx: number
    espIdx: number
    ayuIdx: number
    aneIdx: number
    gtoIdx: number
} {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex] ?? []
        const headers = row.map((col) => normalizeHeader(col))

        const codeIdx = headers.findIndex((h) => h === 'codigo' || h.includes('codigo'))
        const descIdx = headers.findIndex((h) => h === 'descripcion' || h.includes('descripcion'))
        const totalIdx = headers.findIndex((h) => h.includes('total'))
        const nivelIdx = headers.findIndex((h) => h.includes('nivel'))
        const espIdx = headers.findIndex((h) => h.includes('especialista') || h === 'esp')
        const ayuIdx = headers.findIndex((h) => h.includes('ayudante') || h === 'ayu')
        const aneIdx = headers.findIndex((h) => h.includes('anestesista') || h === 'ane')
        const gtoIdx = headers.findIndex((h) => h.includes('gasto') || h === 'gto')

        if (codeIdx >= 0 && descIdx >= 0 && totalIdx >= 0) {
            return { headerRowIndex: rowIndex, codeIdx, descIdx, totalIdx, nivelIdx, espIdx, ayuIdx, aneIdx, gtoIdx }
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

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = []
    for (let i = 0; i < items.length; i += size) {
        out.push(items.slice(i, i + size))
    }
    return out
}

function normalizarNombreArchivo(nombre: string): string {
    return normalizeWhitespace(nombre).slice(0, 180)
}

function serializarDetalle(meta: NomencladorVigenteMeta): string {
    return JSON.stringify(meta)
}

function parsearDetalleAudit(detalle: string | null): NomencladorVigenteMeta | null {
    if (!detalle) return null
    try {
        const parsed = JSON.parse(detalle) as Partial<NomencladorVigenteMeta>
        if (!parsed.nombre || !parsed.fecha || !parsed.usuario) return null
        return {
            nombre: String(parsed.nombre),
            fecha: String(parsed.fecha),
            usuario: String(parsed.usuario),
        }
    } catch {
        return null
    }
}

async function obtenerNomencladorVigente(): Promise<NomencladorVigenteMeta | null> {
    const last = await prisma.auditLog.findFirst({
        where: { entidad: AUDIT_ENTIDAD_NOMENCLADOR, accion: 'MODIFICAR' },
        orderBy: { fecha: 'desc' },
        select: { detalle: true },
    })

    return parsearDetalleAudit(last?.detalle ?? null)
}

export async function GET() {
    try {
        const usuario = await getUsuarioSesion()
        if (!tienePermiso(usuario.rol, 'FACTURACION', 'LEER')) return apiForbidden()

        const vigente = await obtenerNomencladorVigente()
        return apiOk({ vigente })
    } catch (err) {
        return manejarErrorApi(err)
    }
}

function parseDecimalOrNull(value: unknown): Prisma.Decimal | null {
    const raw = String(value ?? '').trim()
    if (!raw) return null
    try {
        const result = parseDecimal(value)
        return result.isZero() ? null : result
    } catch {
        return null
    }
}

function parseWorkbookRows(fileBuffer: Buffer, requestedSheet?: string): ParsedRow[] {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', raw: false, cellDates: false })
    const sheetName = requestedSheet ?? workbook.SheetNames[0]
    if (!sheetName) throw new Error('El archivo XLS no contiene hojas para importar.')

    const sheet = workbook.Sheets[sheetName]
    if (!sheet) throw new Error(`No existe la hoja "${sheetName}" en el archivo XLS.`)

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: false,
        defval: '',
        blankrows: false,
    })

    const { headerRowIndex, codeIdx, descIdx, totalIdx, nivelIdx, espIdx, ayuIdx, aneIdx, gtoIdx } = detectHeaderRow(rows)

    const parsed = new Map<string, ParsedRow>()

    for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
        const row = rows[i] ?? []

        const codigo = normalizeCode(row[codeIdx])
        if (!codigo || /^total\b/i.test(codigo)) continue

        const descripcion = normalizeWhitespace(String(row[descIdx] ?? ''))
        if (!descripcion) continue

        const valor = parseDecimal(row[totalIdx])
        const nivelRaw = nivelIdx >= 0 ? String(row[nivelIdx] ?? '').trim() : ''
        const nivel = nivelRaw || null
        const esp = espIdx >= 0 ? parseDecimalOrNull(row[espIdx]) : null
        const ayu = ayuIdx >= 0 ? parseDecimalOrNull(row[ayuIdx]) : null
        const ane = aneIdx >= 0 ? parseDecimalOrNull(row[aneIdx]) : null
        const gto = gtoIdx >= 0 ? parseDecimalOrNull(row[gtoIdx]) : null

        const existing = parsed.get(codigo)
        if (!existing || descripcion.length >= existing.descripcion.length) {
            parsed.set(codigo, { codigo, descripcion, valor, nivel, esp, ayu, ane, gto })
        }
    }

    return [...parsed.values()]
}

export async function POST(req: NextRequest) {
    try {
        console.log(`[POST /nomenclador/import] Iniciando importación`)
        const usuario = await getUsuarioSesion()
        console.log(`[POST /nomenclador/import] Usuario: ${usuario.codigoUsuario}`)
        if (!tienePermiso(usuario.rol, 'FACTURACION', 'MODIFICAR')) return apiForbidden()

        const form = await req.formData()
        console.log(`[POST /nomenclador/import] FormData recibido`)
        const file = form.get('file')

        if (!(file instanceof File)) {
            console.error(`[POST /nomenclador/import] File no es un File válido`)
            return apiError('Archivo requerido', 400)
        }

        console.log(`[POST /nomenclador/import] Archivo recibido: ${file.name}, ${file.size} bytes`)
        const nombreArchivo = normalizarNombreArchivo(file.name || 'nomenclador-sin-nombre.xls')
        const vigente = await obtenerNomencladorVigente()
        if (vigente && vigente.nombre.toUpperCase() === nombreArchivo.toUpperCase()) {
            console.warn(`[POST /nomenclador/import] El nomenclador "${nombreArchivo}" ya está vigente`)
            return apiError(`El nomenclador "${nombreArchivo}" ya está vigente.`, 409)
        }

        // El convenio se mantiene fijo en 1 y la hoja se detecta automáticamente (primera hoja)
        const convenioId = 1

        const fileBuffer = Buffer.from(await file.arrayBuffer())
        console.log(`[POST /nomenclador/import] Buffer creado: ${fileBuffer.length} bytes`)
        const rows = parseWorkbookRows(fileBuffer)
        console.log(`[POST /nomenclador/import] Rows parseadas: ${rows.length} filas`)

        if (rows.length === 0) {
            console.error(`[POST /nomenclador/import] No hay filas válidas para importar`)
            return apiError('No se encontraron filas validas para importar.', 400)
        }

        const now = new Date()
        const usuarioCod = (usuario.codigoUsuario || 'IMPORTXLS').slice(0, 10)

        let upsertsPrestacion = 0
            console.log(`[POST /nomenclador/import] Iniciando upserts de NomencladorPrestacion`)
        for (const batch of chunk(rows, IMPORT_BATCH_SIZE)) {
            // Limitar concurrencia a 4 (tamaño de la pool) para evitar "Timed out fetching connection"
            for (const row of batch) {
                await prisma.nomencladorPrestacion.upsert({
                    where: { codigo: row.codigo },
                    create: {
                        codigo: row.codigo,
                        descripcion: row.descripcion,
                        categoria: categoriaFromNivel(row.nivel),
                        valor: row.valor,
                        estado: 'A',
                        fechaEstado: now,
                        usuario: usuarioCod,
                    },
                    update: {
                        descripcion: row.descripcion,
                        categoria: categoriaFromNivel(row.nivel),
                        valor: row.valor,
                        estado: 'A',
                        fechaEstado: now,
                        usuario: usuarioCod,
                    },
                })
            }
            upsertsPrestacion += batch.length
        }

        let upsertsPractica = 0
            console.log(`[POST /nomenclador/import] Completados ${upsertsPrestacion} upserts de NomencladorPrestacion, iniciando NomencladorPractica`)
        let skippedByCodeLength = 0

        for (const batch of chunk(rows, IMPORT_BATCH_SIZE)) {
            const validForPractica = batch.filter((row) => row.codigo.length <= 8)
            skippedByCodeLength += batch.length - validForPractica.length

            // Limitar concurrencia a 4 (tamaño de la pool) para evitar "Timed out fetching connection"
            for (const row of validForPractica) {
                await prisma.nomencladorPractica.upsert({
                    where: {
                        convenioId_codigo: {
                            convenioId,
                            codigo: row.codigo,
                        },
                    },
                    create: {
                        convenioId,
                        codigo: row.codigo,
                        descripcion: row.descripcion,
                        valorEspecialista: row.esp,
                        valorAyudante: row.ayu,
                        valorAnestesista: row.ane,
                        valorGastos: row.gto,
                    },
                    update: {
                        descripcion: row.descripcion,
                        valorEspecialista: row.esp,
                        valorAyudante: row.ayu,
                        valorAnestesista: row.ane,
                        valorGastos: row.gto,
                    },
                })
            }

            upsertsPractica += validForPractica.length
        }

        console.log(
            `[POST /nomenclador/import] Completados ${upsertsPractica} upserts de NomencladorPractica, guardando auditLog`
        )
        const metaVigente: NomencladorVigenteMeta = {
            nombre: nombreArchivo,
            fecha: now.toISOString(),
            usuario: usuarioCod,
        }

        await prisma.auditLog.create({
            data: {
                usuario: usuarioCod,
                accion: 'MODIFICAR',
                entidad: AUDIT_ENTIDAD_NOMENCLADOR,
                detalle: serializarDetalle(metaVigente),
                direccionIp: req.headers.get('x-forwarded-for') ?? null,
                userAgent: req.headers.get('user-agent') ?? null,
            },
        })

        console.log(`[POST /nomenclador/import] Importación exitosa, retornando respuesta`)
        return apiOk({
            totalLeidos: rows.length,
            nomencladorPrestacionActualizados: upsertsPrestacion,
            nomencladorPracticaActualizados: upsertsPractica,
            omitidosCodigoLargo: skippedByCodeLength,
            nombreVigente: nombreArchivo,
        })
    } catch (err) {
        return manejarErrorApi(err)
    }
}
