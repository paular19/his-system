/**
 * Aplica prisma/sql/archivo-ingresos.sql sobre la base.
 *
 * Existe porque `prisma db push` es destructivo en esta base: hay objetos que
 * no estan en schema.prisma (la secuencia Paciente_HC_seq y 11 indices creados
 * a mano) y el push los borra. Este script corre solo los CREATE ... IF NOT
 * EXISTS y despues verifica que esos objetos sigan vivos.
 *
 * Uso:
 *   npx tsx prisma/aplicar-ddl-archivo.ts --dry-run
 *   npx tsx prisma/aplicar-ddl-archivo.ts
 */
import { PrismaClient } from '@prisma/client'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const prisma = new PrismaClient()

const TABLAS_NUEVAS = ['ArchivoObraSocial', 'ArchivoPlanObraSocial', 'ArchivoIngreso']

/** Parte el archivo en sentencias, ignorando comentarios de linea. */
function sentencias(sql: string): string[] {
    return sql
        .split('\n')
        .filter((linea) => !linea.trimStart().startsWith('--'))
        .join('\n')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)
}

async function main() {
    const dryRun = process.argv.includes('--dry-run')
    const sqlPath = path.resolve(process.cwd(), 'prisma/sql/archivo-ingresos.sql')
    const sql = await readFile(sqlPath, 'utf8')
    const partes = sentencias(sql)

    // Ninguna sentencia destructiva puede colarse en este archivo.
    const peligrosas = partes.filter((s) => /^\s*(DROP|ALTER|TRUNCATE|DELETE)\b/i.test(s))
    if (peligrosas.length > 0) {
        console.error('El archivo SQL tiene sentencias destructivas, abortando:')
        for (const s of peligrosas) console.error(`  ${s.slice(0, 120)}`)
        process.exit(1)
    }

    console.log(`Sentencias a aplicar: ${partes.length}`)
    if (dryRun) {
        for (const s of partes) console.log(`  ${s.split('\n')[0]!.slice(0, 100)}`)
        console.log('\nDry-run: no se ejecuto nada.')
        await prisma.$disconnect()
        return
    }

    for (const s of partes) {
        await prisma.$executeRawUnsafe(s)
        console.log(`  ok  ${s.split('\n')[0]!.slice(0, 100)}`)
    }

    // Verificacion posterior: las tablas nuevas existen y lo que db push habria
    // borrado sigue en su lugar.
    const tablas = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
        TABLAS_NUEVAS
    )
    const secuencia = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT COUNT(*)::bigint AS n FROM pg_class WHERE relkind = 'S' AND relname = 'Paciente_HC_seq'`
    )
    const indices = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT COUNT(*)::bigint AS n FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'idx_%'`
    )

    console.log('\nVerificacion:')
    console.log(`  Tablas creadas: ${tablas.length}/${TABLAS_NUEVAS.length}`)
    console.log(`  Secuencia Paciente_HC_seq viva: ${Number(secuencia[0]!.n) === 1 ? 'si' : 'NO'}`)
    console.log(`  Indices idx_* presentes: ${Number(indices[0]!.n)}`)

    await prisma.$disconnect()
}

main().catch(async (error) => {
    console.error('Error aplicando el DDL:', error)
    await prisma.$disconnect()
    process.exit(1)
})
