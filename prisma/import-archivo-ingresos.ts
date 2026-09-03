/**
 * Importa del sistema anterior los maestros de obra social/plan y los ingresos,
 * a las tablas ArchivoObraSocial, ArchivoPlanObraSocial y ArchivoIngreso.
 *
 * A diferencia de import-archivo-historico.ts (que lee un export de texto), este
 * script consulta directamente el SQL Server local donde esta restaurada la base
 * vieja, via sqlcmd. No agrega dependencias: sqlcmd viene con el Client SDK que
 * ya esta instalado, y las filas viajan como NDJSON (una linea por fila, con
 * FOR JSON PATH), asi que los saltos de linea de las observaciones vienen
 * escapados y no rompen el parseo.
 *
 * Las tablas son de solo lectura para la app y no tienen relaciones Prisma: los
 * nombres de obra social, plan, motivo de egreso y profesional se guardan
 * desnormalizados en cada fila.
 *
 * Requisitos:
 *   - SQL Server local con la base vieja restaurada (por defecto .\SQLEXPRESS / SanRafael)
 *   - Las tablas destino creadas: npx tsx prisma/aplicar-ddl-archivo.ts
 *
 * Uso:
 *   npx tsx prisma/import-archivo-ingresos.ts --dry-run
 *   npx tsx prisma/import-archivo-ingresos.ts --reemplazar
 *   npx tsx prisma/import-archivo-ingresos.ts --servidor=.\SQLEXPRESS --base=SanRafael
 */
import { PrismaClient } from '@prisma/client'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const prisma = new PrismaClient()
const ejecutar = promisify(execFile)

const SERVIDOR_POR_DEFECTO = '.\\SQLEXPRESS'
const BASE_POR_DEFECTO = 'SanRafael'

function opcion(flag: string, porDefecto: string): string {
    const prefijo = `--${flag}=`
    const encontrado = process.argv.find((arg) => arg.startsWith(prefijo))
    return encontrado ? encontrado.slice(prefijo.length) : porDefecto
}

/**
 * Corre una consulta en el SQL Server viejo y devuelve las filas.
 *
 * La consulta tiene que envolver sus columnas en `FOR JSON PATH,
 * WITHOUT_ARRAY_WRAPPER` para que cada fila salga como un objeto JSON en una
 * linea. La salida va a un archivo porque los ingresos no entran comodos en el
 * buffer de stdout.
 */
async function consultar<T>(servidor: string, base: string, sql: string): Promise<T[]> {
    const carpeta = await mkdtemp(path.join(tmpdir(), 'archivo-viejo-'))
    const salida = path.join(carpeta, 'filas.ndjson')

    try {
        await ejecutar(
            'SQLCMD',
            [
                '-S', servidor,
                '-E',
                '-C',
                '-y', '0',
                '-u', // salida Unicode: sin esto sqlcmd escribe en la codepage de
                //       la consola y las enies y tildes salen como "MU?OZ".
                '-d', base,
                '-Q', `SET NOCOUNT ON;\n${sql}`,
                '-o', salida,
            ],
            { maxBuffer: 64 * 1024 * 1024 }
        )

        // -u escribe UTF-16LE, no UTF-8.
        const texto = await readFile(salida, 'utf16le')
        const filas: T[] = []

        for (const linea of texto.split(/\r?\n/)) {
            const limpia = linea.trim()
            if (!limpia.startsWith('{')) continue
            filas.push(JSON.parse(limpia) as T)
        }

        return filas
    } finally {
        await rm(carpeta, { recursive: true, force: true })
    }
}

function texto(valor: unknown, largo: number): string | null {
    if (valor == null) return null
    const limpio = String(valor).trim()
    if (!limpio) return null
    return limpio.slice(0, largo)
}

function entero(valor: unknown): number | null {
    if (valor == null) return null
    const n = Number(valor)
    return Number.isInteger(n) ? n : null
}

/**
 * El JSON de SQL Server trae la hora sin zona ("2025-01-02T07:22:28.410").
 * Se le agrega la Z para que el timestamp guarde la misma hora de pared que
 * mostraba el sistema viejo: la app formatea estas fechas leyendo las partes
 * en UTC, asi que interpretarlas como locales las correria tres horas.
 */
function fecha(valor: unknown): Date | null {
    const limpio = texto(valor, 40)
    if (!limpio) return null
    const conZona = /[Zz]|[+-]\d{2}:?\d{2}$/.test(limpio) ? limpio : `${limpio}Z`
    const d = new Date(conZona)
    if (Number.isNaN(d.getTime())) return null
    // El sistema viejo usaba 1900-01-01 como fecha vacia.
    if (d.getUTCFullYear() < 1901) return null
    return d
}

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = []
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
    return out
}

const SQL_OBRAS_SOCIALES = `
SELECT (
  SELECT o.OSID AS obraSocialIdViejo, RTRIM(o.OSNom) AS nombre,
         RTRIM(o.OSSigla) AS sigla, RTRIM(o.OSEstad) AS estado
  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
) AS j
FROM ObraSocial o
ORDER BY o.OSID;`

const SQL_PLANES = `
SELECT (
  SELECT p.OSID AS obraSocialIdViejo, p.PosID AS planIdViejo,
         RTRIM(p.PosDescrip) AS descripcion, RTRIM(p.PosEstado) AS estado
  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
) AS j
FROM PlanOSoc p
ORDER BY p.OSID, p.PosID;`

// SerID viene siempre nulo en la base vieja, por eso no se joinea Servicio.
const SQL_INGRESOS = `
SELECT (
  SELECT i.IngID AS ingresoIdViejo, i.PacID AS pacienteIdViejo, i.IngNro AS numeroIngreso,
         RTRIM(i.TigCodig) AS tipoIngresoCodigo, RTRIM(t.TigDecrip) AS tipoIngresoDescripcion,
         i.IngFchIngreso AS fechaIngreso, i.IngFchEgreso AS fechaEgreso,
         i.IngFchEgresoPrevista AS fechaEgresoPrevista, i.IngFchObito AS fechaObito,
         RTRIM(i.TinCodig) AS tipoInternacionCodigo, RTRIM(ti.TinDescrip) AS tipoInternacionDescripcion,
         RTRIM(i.MegCodig) AS motivoEgresoCodigo, RTRIM(m.MegDescrip) AS motivoEgresoDescripcion,
         i.OSID AS obraSocialIdViejo, RTRIM(o.OSNom) AS obraSocialNombre,
         i.PosID AS planIdViejo, RTRIM(pl.PosDescrip) AS planDescripcion,
         RTRIM(i.IngOSNroAf) AS numeroAfiliado,
         i.PatID AS patologiaId, RTRIM(pat.PatDescrip) AS patologiaDescripcion,
         RTRIM(i.IngPatDescrip) AS descripcionPatologia,
         RTRIM(i.IngPatDefDescrip) AS descripcionPatologiaDefinitiva,
         i.PrfIDTratante AS profesionalTratanteId, RTRIM(prt.PrfNombre) AS profesionalTratanteNombre,
         i.PrfIDGuardia AS profesionalGuardiaId, RTRIM(prg.PrfNombre) AS profesionalGuardiaNombre,
         i.IngEdad AS edad, RTRIM(i.IngEstad) AS estado,
         i.IngObser AS observaciones, RTRIM(i.UsuCodig) AS usuario
  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
) AS j
FROM Ingreso i
LEFT JOIN TipoIngreso t ON t.TigCodig = i.TigCodig
LEFT JOIN TipoInternacion ti ON ti.TinCodig = i.TinCodig
LEFT JOIN MotivoEgreso m ON m.MegCodig = i.MegCodig
LEFT JOIN ObraSocial o ON o.OSID = i.OSID
LEFT JOIN PlanOSoc pl ON pl.OSID = i.OSID AND pl.PosID = i.PosID
LEFT JOIN Patologia pat ON pat.PatID = i.PatID
LEFT JOIN Profesional prt ON prt.PrfID = i.PrfIDTratante
LEFT JOIN Profesional prg ON prg.PrfID = i.PrfIDGuardia
WHERE i.PacID IS NOT NULL
ORDER BY i.IngID;`

// Los ingresos sin PacID no se pueden colgar de ningun paciente del archivo, asi
// que quedan afuera. Se cuentan para poder informarlo.
const SQL_SIN_PACIENTE = `
SELECT (
  SELECT COUNT(*) AS sinPaciente,
         SUM(CASE WHEN i.TigCodig = 'I' THEN 1 ELSE 0 END) AS sinPacienteInternados
  FROM Ingreso i WHERE i.PacID IS NULL
  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
) AS j;`

async function main() {
    const servidor = opcion('servidor', SERVIDOR_POR_DEFECTO)
    const base = opcion('base', BASE_POR_DEFECTO)
    const dryRun = process.argv.includes('--dry-run')
    const reemplazar = process.argv.includes('--reemplazar')

    console.log(`Origen: ${servidor} / ${base}`)

    const [obrasCrudas, planesCrudos, ingresosCrudos, sinPacienteCrudo] = await Promise.all([
        consultar<Record<string, unknown>>(servidor, base, SQL_OBRAS_SOCIALES),
        consultar<Record<string, unknown>>(servidor, base, SQL_PLANES),
        consultar<Record<string, unknown>>(servidor, base, SQL_INGRESOS),
        consultar<Record<string, unknown>>(servidor, base, SQL_SIN_PACIENTE),
    ])

    const obras = obrasCrudas.flatMap((o) => {
        const id = entero(o.obraSocialIdViejo)
        const nombre = texto(o.nombre, 200)
        if (id == null || !nombre) return []
        return [
            {
                obraSocialIdViejo: id,
                nombre,
                sigla: texto(o.sigla, 50),
                estado: texto(o.estado, 1),
            },
        ]
    })

    const planes = planesCrudos.flatMap((p) => {
        const osId = entero(p.obraSocialIdViejo)
        const planId = entero(p.planIdViejo)
        if (osId == null || planId == null) return []
        return [
            {
                obraSocialIdViejo: osId,
                planIdViejo: planId,
                descripcion: texto(p.descripcion, 200),
                estado: texto(p.estado, 1),
            },
        ]
    })

    const ingresos = ingresosCrudos.flatMap((i) => {
        const id = entero(i.ingresoIdViejo)
        const pacienteId = entero(i.pacienteIdViejo)
        if (id == null || pacienteId == null) return []

        const tipoIngresoCodigo = texto(i.tipoIngresoCodigo, 3)

        return [
            {
                ingresoIdViejo: id,
                pacienteIdViejo: pacienteId,
                numeroIngreso: entero(i.numeroIngreso),
                tipoIngresoCodigo,
                tipoIngresoDescripcion: texto(i.tipoIngresoDescripcion, 100),
                esInternacion: tipoIngresoCodigo === 'I',
                fechaIngreso: fecha(i.fechaIngreso),
                fechaEgreso: fecha(i.fechaEgreso),
                fechaEgresoPrevista: fecha(i.fechaEgresoPrevista),
                fechaObito: fecha(i.fechaObito),
                tipoInternacionCodigo: texto(i.tipoInternacionCodigo, 3),
                tipoInternacionDescripcion: texto(i.tipoInternacionDescripcion, 100),
                motivoEgresoCodigo: texto(i.motivoEgresoCodigo, 3),
                motivoEgresoDescripcion: texto(i.motivoEgresoDescripcion, 100),
                obraSocialIdViejo: entero(i.obraSocialIdViejo),
                obraSocialNombre: texto(i.obraSocialNombre, 200),
                planIdViejo: entero(i.planIdViejo),
                planDescripcion: texto(i.planDescripcion, 200),
                numeroAfiliado: texto(i.numeroAfiliado, 50),
                patologiaId: entero(i.patologiaId),
                patologiaDescripcion: texto(i.patologiaDescripcion, 500),
                descripcionPatologia: texto(i.descripcionPatologia, 500),
                descripcionPatologiaDefinitiva: texto(i.descripcionPatologiaDefinitiva, 500),
                profesionalTratanteId: entero(i.profesionalTratanteId),
                profesionalTratanteNombre: texto(i.profesionalTratanteNombre, 200),
                profesionalGuardiaId: entero(i.profesionalGuardiaId),
                profesionalGuardiaNombre: texto(i.profesionalGuardiaNombre, 200),
                edad: entero(i.edad),
                estado: texto(i.estado, 1),
                observaciones: texto(i.observaciones, 4000),
                usuario: texto(i.usuario, 10),
            },
        ]
    })

    // Los ingresos cuyo PacID no existe en el archivo no se van a poder mostrar
    // nunca, pero se importan igual: la tabla es una copia de la base vieja.
    const pacientesArchivo = new Set(
        (await prisma.archivoPaciente.findMany({ select: { pacienteIdViejo: true } })).map(
            (p) => p.pacienteIdViejo
        )
    )
    const huerfanos = ingresos.filter((i) => !pacientesArchivo.has(i.pacienteIdViejo)).length
    const internaciones = ingresos.filter((i) => i.esInternacion).length
    const conEgreso = ingresos.filter((i) => i.fechaEgreso != null).length
    const conMotivo = ingresos.filter((i) => i.motivoEgresoCodigo != null).length
    const sinObraSocial = ingresos.filter((i) => i.obraSocialNombre == null).length
    const pacientesConIngreso = new Set(ingresos.map((i) => i.pacienteIdViejo)).size

    console.log(`\nObras sociales: ${obras.length}`)
    console.log(`Planes: ${planes.length}`)
    console.log(
        `Ingresos: ${ingresos.length} (internaciones: ${internaciones}, ambulatorios: ${ingresos.length - internaciones})`
    )
    console.log(`Pacientes distintos con ingreso: ${pacientesConIngreso}`)
    console.log(`Con fecha de egreso: ${conEgreso}`)
    console.log(`Con motivo de egreso: ${conMotivo}`)
    console.log(`Sin nombre de obra social: ${sinObraSocial}`)
    console.log(`Ingresos huerfanos (PacID que no esta en ArchivoPaciente): ${huerfanos}`)

    const sinPaciente = entero(sinPacienteCrudo[0]?.sinPaciente) ?? 0
    const sinPacienteInternados = entero(sinPacienteCrudo[0]?.sinPacienteInternados) ?? 0
    console.log(
        `Excluidos del origen por no tener PacID: ${sinPaciente} (de los cuales internaciones: ${sinPacienteInternados})`
    )

    if (dryRun) {
        console.log('\nDry-run: no se escribio nada en la base.')
        console.log('Muestra:', JSON.stringify(ingresos.slice(0, 1), null, 2))
        await prisma.$disconnect()
        return
    }

    if (reemplazar) {
        const borradosIngresos = await prisma.archivoIngreso.deleteMany({})
        const borradosPlanes = await prisma.archivoPlanObraSocial.deleteMany({})
        const borradasObras = await prisma.archivoObraSocial.deleteMany({})
        console.log(
            `\nBorradas antes de recargar: ${borradosIngresos.count} ingresos, ${borradosPlanes.count} planes, ${borradasObras.count} obras sociales`
        )
    }

    let obrasOk = 0
    for (const lote of chunk(obras, 500)) {
        const r = await prisma.archivoObraSocial.createMany({ data: lote, skipDuplicates: true })
        obrasOk += r.count
    }

    let planesOk = 0
    for (const lote of chunk(planes, 500)) {
        const r = await prisma.archivoPlanObraSocial.createMany({
            data: lote,
            skipDuplicates: true,
        })
        planesOk += r.count
    }

    let ingresosOk = 0
    for (const lote of chunk(ingresos, 500)) {
        const r = await prisma.archivoIngreso.createMany({ data: lote, skipDuplicates: true })
        ingresosOk += r.count
    }

    const [totalObras, totalPlanes, totalIngresos] = await Promise.all([
        prisma.archivoObraSocial.count(),
        prisma.archivoPlanObraSocial.count(),
        prisma.archivoIngreso.count(),
    ])

    console.log('\nImportacion finalizada:')
    console.log(`Obras sociales insertadas: ${obrasOk} (total en tabla: ${totalObras})`)
    console.log(`Planes insertados: ${planesOk} (total en tabla: ${totalPlanes})`)
    console.log(`Ingresos insertados: ${ingresosOk} (total en tabla: ${totalIngresos})`)

    await prisma.$disconnect()
}

main().catch(async (error) => {
    console.error('Error importando los ingresos del archivo historico:', error)
    await prisma.$disconnect()
    process.exit(1)
})
