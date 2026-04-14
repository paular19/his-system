import { Prisma, PrismaClient } from '@prisma/client'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

type ParsedCsv = {
    headers: string[]
    rows: string[][]
}

type PacienteRow = {
    id: number
    historiaClinica: number | null
    apellido: string
    nombre: string
    nombreCompleto: string
    tipoDocumento: string | null
    numeroDocumento: number | null
    cuil: Prisma.Decimal | null
    fechaNacimiento: Date | null
    sexo: string | null
    estadoCivil: string | null
    paisId: number | null
    profesionId: number | null
    domicilio: string | null
    provinciaId: number | null
    localidadId: number | null
    barrioId: number | null
    telefonoFijo: string | null
    telefonoLaboral: string | null
    celular1: string | null
    celular2: string | null
    email: string | null
    obraSocialId: number | null
    planId: number | null
    numeroAfiliado: string | null
    obraSocialCoseguroId: number | null
    nombreTutor: string | null
    telefonoTutor: string | null
    empleoTutor: string | null
    observaciones: string | null
    usuarioAlta: string
    fechaAlta: Date
    fechaModificacion: Date
    gravidadId: number | null
}

type PacienteHistRow = {
    id: number
    pacienteId: number
    tipoCambio: string
    usuarioCambio: string
    fechaCambio: Date
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

    if (/^[0-9]+$/.test(raw)) {
        const num = Number.parseInt(raw, 10)
        return Number.isFinite(num) && num > 0 ? num : null
    }

    if (/^[0-9]+(\.[0-9]+)?E[+-]?[0-9]+$/i.test(raw)) {
        const fromScientific = Number(raw)
        if (!Number.isFinite(fromScientific)) return null
        const asInt = Math.trunc(fromScientific)
        return asInt > 0 ? asInt : null
    }

    return null
}

function parseDocInt(value: string | undefined): number | null {
    const parsed = parsePositiveInt(value)
    if (parsed == null) return null
    if (parsed > 2147483647) return null
    return parsed
}

function normalizeCuil(value: string | undefined): Prisma.Decimal | null {
    const raw = normalizeText(value)
    if (!raw) return null

    if (/^[0-9]+(\.[0-9]+)?E[+-]?[0-9]+$/i.test(raw)) {
        const n = Number(raw)
        if (!Number.isFinite(n)) return null
        const s = Math.trunc(n).toString()
        if (s.length > 11) return null
        return new Prisma.Decimal(s)
    }

    const digits = raw.replace(/\D+/g, '')
    if (!digits) return null
    if (digits.length > 11) return null
    return new Prisma.Decimal(digits)
}

function parseDate(value: string | undefined, fallbackNow = false): Date | null {
    const raw = normalizeText(value)
    if (!raw) return fallbackNow ? new Date() : null

    const d = new Date(raw)
    if (!Number.isNaN(d.getTime())) return d

    return fallbackNow ? new Date() : null
}

function normalizeChar(value: string | undefined, length: number): string | null {
    const raw = normalizeText(value)
    if (!raw) return null
    return raw.toUpperCase().slice(0, length)
}

function normalizeUsuario(value: string | undefined): string {
    return (normalizeText(value) ?? 'SUPERVISOR').slice(0, 10)
}

function chunk<T>(items: T[], size: number): T[][] {
    if (size <= 0) throw new Error('chunk size debe ser > 0')
    const out: T[][] = []
    for (let i = 0; i < items.length; i += size) {
        out.push(items.slice(i, i + size))
    }
    return out
}

function buildPacienteData(payload: PacienteRow): Prisma.PacienteUncheckedCreateInput {
    return {
        id: payload.id,
        historiaClinica: payload.historiaClinica,
        apellido: payload.apellido,
        nombre: payload.nombre,
        nombreCompleto: payload.nombreCompleto,
        tipoDocumento: payload.tipoDocumento,
        numeroDocumento: payload.numeroDocumento,
        cuil: payload.cuil,
        fechaNacimiento: payload.fechaNacimiento,
        sexo: payload.sexo,
        estadoCivil: payload.estadoCivil,
        paisId: payload.paisId,
        profesionId: payload.profesionId,
        domicilio: payload.domicilio,
        provinciaId: payload.provinciaId,
        localidadId: payload.localidadId,
        barrioId: payload.barrioId,
        telefonoFijo: payload.telefonoFijo,
        telefonoLaboral: payload.telefonoLaboral,
        celular1: payload.celular1,
        celular2: payload.celular2,
        email: payload.email,
        obraSocialId: payload.obraSocialId,
        planId: payload.planId,
        numeroAfiliado: payload.numeroAfiliado,
        obraSocialCoseguroId: payload.obraSocialCoseguroId,
        nombreTutor: payload.nombreTutor,
        telefonoTutor: payload.telefonoTutor,
        empleoTutor: payload.empleoTutor,
        observaciones: payload.observaciones,
        usuarioAlta: payload.usuarioAlta,
        fechaAlta: payload.fechaAlta,
        fechaModificacion: payload.fechaModificacion,
        gravidadId: payload.gravidadId,
    }
}

async function main() {
    const pacienteFileArg = getOptionValue('paciente') ?? 'paciente(Hoja1).csv'
    const historialFileArg = getOptionValue('historial') ?? 'pacientehis(Hoja1).csv'
    const dryRun = process.argv.includes('--dry-run')

    const pacientePath = path.resolve(process.cwd(), pacienteFileArg)
    const historialPath = path.resolve(process.cwd(), historialFileArg)

    const [pacienteCsv, historialCsv] = await Promise.all([readCsv(pacientePath), readCsv(historialPath)])

    const pIdx = {
        id: requireHeader(pacienteCsv.headers, 'PacID'),
        hc: requireHeader(pacienteCsv.headers, 'PacHC'),
        apellido: requireHeader(pacienteCsv.headers, 'PacApell'),
        nombre: requireHeader(pacienteCsv.headers, 'PacNom'),
        nombreCompleto: requireHeader(pacienteCsv.headers, 'PacNomCom'),
        tipoDocumento: requireHeader(pacienteCsv.headers, 'PacTipDoc'),
        numeroDocumento: requireHeader(pacienteCsv.headers, 'PacNroDoc'),
        cuil: requireHeader(pacienteCsv.headers, 'PacCUIL'),
        fechaNacimiento: requireHeader(pacienteCsv.headers, 'PacFchNac'),
        sexo: requireHeader(pacienteCsv.headers, 'PacSexo'),
        estadoCivil: requireHeader(pacienteCsv.headers, 'PacEstCiv'),
        paisId: requireHeader(pacienteCsv.headers, 'PaiID'),
        profesionId: requireHeader(pacienteCsv.headers, 'PfeID'),
        domicilio: requireHeader(pacienteCsv.headers, 'PacDomic'),
        provinciaId: requireHeader(pacienteCsv.headers, 'PrvID'),
        localidadId: requireHeader(pacienteCsv.headers, 'LodID'),
        barrioId: requireHeader(pacienteCsv.headers, 'BarID'),
        telefonoFijo: requireHeader(pacienteCsv.headers, 'PacTelef'),
        telefonoLaboral: requireHeader(pacienteCsv.headers, 'PacTelLab'),
        celular1: requireHeader(pacienteCsv.headers, 'PacTelCel1'),
        celular2: requireHeader(pacienteCsv.headers, 'PacTelCel2'),
        email: requireHeader(pacienteCsv.headers, 'PacEmail'),
        obraSocialId: requireHeader(pacienteCsv.headers, 'OSID'),
        planId: requireHeader(pacienteCsv.headers, 'PosID'),
        numeroAfiliado: requireHeader(pacienteCsv.headers, 'PacOSNroAf'),
        obraSocialCoseguroId: requireHeader(pacienteCsv.headers, 'OSIDCoseguro'),
        nombreTutor: requireHeader(pacienteCsv.headers, 'PacTutor'),
        telefonoTutor: requireHeader(pacienteCsv.headers, 'PacTutTelef'),
        empleoTutor: requireHeader(pacienteCsv.headers, 'PacTutEmpleo'),
        observaciones: requireHeader(pacienteCsv.headers, 'PacObser'),
        usuarioAlta: requireHeader(pacienteCsv.headers, 'UsuCodig'),
        fechaAlta: requireHeader(pacienteCsv.headers, 'PacFchIni'),
        fechaModificacion: requireHeader(pacienteCsv.headers, 'PacFchEst'),
        gravedadId: requireHeader(pacienteCsv.headers, 'GraID'),
    }

    const hIdx = {
        id: requireHeader(historialCsv.headers, 'PacHisID'),
        pacienteId: requireHeader(historialCsv.headers, 'PacID'),
        tipoCambio: requireHeader(historialCsv.headers, 'PacHisTipoCambio'),
        usuarioCambio: requireHeader(historialCsv.headers, 'PacHisUsuCambio'),
        fechaCambio: requireHeader(historialCsv.headers, 'PacHisFchCambio'),
    }

    const [
        paises,
        profesiones,
        provincias,
        localidades,
        barrios,
        obrasSociales,
        planes,
    ] = await Promise.all([
        prisma.pais.findMany({ select: { id: true } }),
        prisma.profesion.findMany({ select: { id: true } }),
        prisma.provincia.findMany({ select: { id: true } }),
        prisma.localidad.findMany({ select: { provinciaId: true, id: true } }),
        prisma.barrio.findMany({ select: { provinciaId: true, localidadId: true, id: true } }),
        prisma.obraSocial.findMany({ select: { id: true } }),
        prisma.planObraSocial.findMany({ select: { obraSocialId: true, id: true } }),
    ])

    const paisIds = new Set(paises.map((row) => row.id))
    const profesionIds = new Set(profesiones.map((row) => row.id))
    const provinciaIds = new Set(provincias.map((row) => row.id))
    const localidadKeys = new Set(localidades.map((row) => `${row.provinciaId}|${row.id}`))
    const barrioKeys = new Set(barrios.map((row) => `${row.provinciaId}|${row.localidadId}|${row.id}`))
    const obraSocialIds = new Set(obrasSociales.map((row) => row.id))
    const planKeys = new Set(planes.map((row) => `${row.obraSocialId}|${row.id}`))

    const pacientesParsed: PacienteRow[] = []
    let pacientesInvalidos = 0

    for (let i = 0; i < pacienteCsv.rows.length; i += 1) {
        const cols = pacienteCsv.rows[i]!
        try {
            const id = parsePositiveInt(cols[pIdx.id])
            const apellido = normalizeText(cols[pIdx.apellido])
            const nombre = normalizeText(cols[pIdx.nombre])
            const nombreCompleto = normalizeText(cols[pIdx.nombreCompleto])
            if (!id) throw new Error('PacID invalido')
            if (!apellido) throw new Error('PacApell vacio')
            if (!nombre) throw new Error('PacNom vacio')
            if (!nombreCompleto) throw new Error('PacNomCom vacio')

            const provinciaIdRaw = parsePositiveInt(cols[pIdx.provinciaId])
            const provinciaId = provinciaIdRaw && provinciaIds.has(provinciaIdRaw) ? provinciaIdRaw : null

            const localidadIdRaw = parsePositiveInt(cols[pIdx.localidadId])
            const localidadKey = provinciaId && localidadIdRaw ? `${provinciaId}|${localidadIdRaw}` : ''
            const localidadId = localidadKey && localidadKeys.has(localidadKey) ? localidadIdRaw : null

            const barrioIdRaw = parsePositiveInt(cols[pIdx.barrioId])
            const barrioKey = provinciaId && localidadId && barrioIdRaw ? `${provinciaId}|${localidadId}|${barrioIdRaw}` : ''
            const barrioId = barrioKey && barrioKeys.has(barrioKey) ? barrioIdRaw : null

            const obraSocialIdRaw = parsePositiveInt(cols[pIdx.obraSocialId])
            const obraSocialId = obraSocialIdRaw && obraSocialIds.has(obraSocialIdRaw) ? obraSocialIdRaw : null

            const planIdRaw = parsePositiveInt(cols[pIdx.planId])
            const planKey = obraSocialId && planIdRaw ? `${obraSocialId}|${planIdRaw}` : ''
            const planId = planKey && planKeys.has(planKey) ? planIdRaw : null

            pacientesParsed.push({
                id,
                historiaClinica: parsePositiveInt(cols[pIdx.hc]),
                apellido: apellido.slice(0, 100),
                nombre: nombre.slice(0, 100),
                nombreCompleto: nombreCompleto.slice(0, 200),
                tipoDocumento: normalizeChar(cols[pIdx.tipoDocumento], 3),
                numeroDocumento: parseDocInt(cols[pIdx.numeroDocumento]),
                cuil: normalizeCuil(cols[pIdx.cuil]),
                fechaNacimiento: parseDate(cols[pIdx.fechaNacimiento], false),
                sexo: normalizeChar(cols[pIdx.sexo], 1),
                estadoCivil: normalizeChar(cols[pIdx.estadoCivil], 1),
                paisId: (() => {
                    const v = parsePositiveInt(cols[pIdx.paisId])
                    return v && paisIds.has(v) ? v : null
                })(),
                profesionId: (() => {
                    const v = parsePositiveInt(cols[pIdx.profesionId])
                    return v && profesionIds.has(v) ? v : null
                })(),
                domicilio: normalizeText(cols[pIdx.domicilio])?.slice(0, 200) ?? null,
                provinciaId,
                localidadId,
                barrioId,
                telefonoFijo: normalizeText(cols[pIdx.telefonoFijo])?.slice(0, 50) ?? null,
                telefonoLaboral: normalizeText(cols[pIdx.telefonoLaboral])?.slice(0, 50) ?? null,
                celular1: normalizeText(cols[pIdx.celular1])?.slice(0, 50) ?? null,
                celular2: normalizeText(cols[pIdx.celular2])?.slice(0, 50) ?? null,
                email: normalizeText(cols[pIdx.email])?.slice(0, 100) ?? null,
                obraSocialId,
                planId,
                numeroAfiliado: normalizeText(cols[pIdx.numeroAfiliado])?.slice(0, 50) ?? null,
                obraSocialCoseguroId: (() => {
                    const v = parsePositiveInt(cols[pIdx.obraSocialCoseguroId])
                    return v && obraSocialIds.has(v) ? v : null
                })(),
                nombreTutor: normalizeText(cols[pIdx.nombreTutor])?.slice(0, 100) ?? null,
                telefonoTutor: normalizeText(cols[pIdx.telefonoTutor])?.slice(0, 50) ?? null,
                empleoTutor: normalizeText(cols[pIdx.empleoTutor])?.slice(0, 100) ?? null,
                observaciones: normalizeText(cols[pIdx.observaciones]),
                usuarioAlta: normalizeUsuario(cols[pIdx.usuarioAlta]),
                fechaAlta: parseDate(cols[pIdx.fechaAlta], true) ?? new Date(),
                fechaModificacion: parseDate(cols[pIdx.fechaModificacion], true) ?? new Date(),
                gravidadId: parsePositiveInt(cols[pIdx.gravedadId]),
            })
        } catch {
            pacientesInvalidos += 1
        }
    }

    const hcCount = new Map<number, number>()
    const docCount = new Map<number, number>()
    for (const row of pacientesParsed) {
        if (row.historiaClinica != null) {
            hcCount.set(row.historiaClinica, (hcCount.get(row.historiaClinica) ?? 0) + 1)
        }
        if (row.numeroDocumento != null) {
            docCount.set(row.numeroDocumento, (docCount.get(row.numeroDocumento) ?? 0) + 1)
        }
    }
    for (const row of pacientesParsed) {
        if (row.historiaClinica != null && (hcCount.get(row.historiaClinica) ?? 0) > 1) {
            row.historiaClinica = null
        }
        if (row.numeroDocumento != null && (docCount.get(row.numeroDocumento) ?? 0) > 1) {
            row.numeroDocumento = null
        }
    }

    const historialParsed: PacienteHistRow[] = []
    let historialInvalido = 0

    for (let i = 0; i < historialCsv.rows.length; i += 1) {
        const cols = historialCsv.rows[i]!
        try {
            const id = parsePositiveInt(cols[hIdx.id])
            const pacienteId = parsePositiveInt(cols[hIdx.pacienteId])
            const tipoCambio = normalizeChar(cols[hIdx.tipoCambio], 1)
            if (!id) throw new Error('PacHisID invalido')
            if (!pacienteId) throw new Error('PacID invalido')
            if (!tipoCambio) throw new Error('PacHisTipoCambio invalido')

            historialParsed.push({
                id,
                pacienteId,
                tipoCambio,
                usuarioCambio: normalizeUsuario(cols[hIdx.usuarioCambio]),
                fechaCambio: parseDate(cols[hIdx.fechaCambio], true) ?? new Date(),
            })
        } catch {
            historialInvalido += 1
        }
    }

    console.log(`Archivo Pacientes: ${pacientePath}`)
    console.log(`Filas Pacientes: ${pacienteCsv.rows.length}`)
    console.log(`Filas Pacientes invalidas: ${pacientesInvalidos}`)
    console.log(`Pacientes validos: ${pacientesParsed.length}`)
    console.log('')
    console.log(`Archivo PacienteHis: ${historialPath}`)
    console.log(`Filas PacienteHis: ${historialCsv.rows.length}`)
    console.log(`Filas PacienteHis invalidas: ${historialInvalido}`)
    console.log(`PacienteHis validos: ${historialParsed.length}`)

    if (dryRun) {
        console.log('\nDry-run: no se realizaron cambios en base de datos.')
        await prisma.$disconnect()
        return
    }

    let pacientesInsertados = 0
    let pacientesRechazados = 0

    for (const batch of chunk(pacientesParsed, 1000)) {
        try {
            const result = await prisma.paciente.createMany({
                data: batch.map((row) => buildPacienteData(row)),
                skipDuplicates: true,
            })
            pacientesInsertados += result.count
        } catch {
            // Si un lote falla, reintento fila a fila para no frenar toda la importación.
            for (const row of batch) {
                try {
                    const result = await prisma.paciente.createMany({
                        data: [buildPacienteData(row)],
                        skipDuplicates: true,
                    })
                    pacientesInsertados += result.count
                } catch {
                    pacientesRechazados += 1
                }
            }
        }
    }

    const pacientesActualizados = 0
    const pacientesOmitidos = pacientesParsed.length - pacientesInsertados - pacientesRechazados

    const pacienteIdsDb = new Set((await prisma.paciente.findMany({ select: { id: true } })).map((row) => row.id))

    let historialInsertado = 0
    let historialRechazado = 0
    let historialSinPaciente = 0

    const historialConPaciente = historialParsed.filter((row) => {
        if (!pacienteIdsDb.has(row.pacienteId)) {
            historialSinPaciente += 1
            return false
        }
        return true
    })

    for (const batch of chunk(historialConPaciente, 2000)) {
        try {
            const result = await prisma.pacienteHistorial.createMany({
                data: batch.map((row) => ({
                    id: row.id,
                    pacienteId: row.pacienteId,
                    tipoCambio: row.tipoCambio,
                    usuarioCambio: row.usuarioCambio,
                    fechaCambio: row.fechaCambio,
                })),
                skipDuplicates: true,
            })
            historialInsertado += result.count
        } catch {
            for (const row of batch) {
                try {
                    const result = await prisma.pacienteHistorial.createMany({
                        data: [{
                            id: row.id,
                            pacienteId: row.pacienteId,
                            tipoCambio: row.tipoCambio,
                            usuarioCambio: row.usuarioCambio,
                            fechaCambio: row.fechaCambio,
                        }],
                        skipDuplicates: true,
                    })
                    historialInsertado += result.count
                } catch {
                    historialRechazado += 1
                }
            }
        }
    }

    const historialActualizado = 0
    const historialOmitido = historialConPaciente.length - historialInsertado - historialRechazado

    console.log('\nImportacion finalizada:')
    console.log(`Pacientes insertados: ${pacientesInsertados}`)
    console.log(`Pacientes actualizados: ${pacientesActualizados}`)
    console.log(`Pacientes omitidos (duplicados): ${pacientesOmitidos}`)
    console.log(`Pacientes rechazados: ${pacientesRechazados}`)
    console.log(`PacienteHis insertados: ${historialInsertado}`)
    console.log(`PacienteHis actualizados: ${historialActualizado}`)
    console.log(`PacienteHis omitidos (duplicados): ${historialOmitido}`)
    console.log(`PacienteHis sin paciente: ${historialSinPaciente}`)
    console.log(`PacienteHis rechazados: ${historialRechazado}`)

    await prisma.$disconnect()
}

main().catch(async (error) => {
    console.error('Error en importacion de Paciente/PacienteHis:', error)
    await prisma.$disconnect()
    process.exit(1)
})
