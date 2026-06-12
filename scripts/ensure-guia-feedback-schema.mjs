import { neon } from '@neondatabase/serverless'

function validarIdentificadorSchema(schema) {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)
}

function qIdent(identifier) {
    return `"${identifier.replace(/"/g, '""')}"`
}

async function main() {
    const databaseUrl = process.env.DATABASE_URL

    if (!databaseUrl) {
        throw new Error('DATABASE_URL no esta definido en el entorno actual')
    }

    const sql = neon(databaseUrl)

    const schemaRows = await sql`SELECT current_schema() AS schema_name`
    const defaultSchema = String(schemaRows[0]?.schema_name ?? 'public')
    const requestedSchema = process.env.TARGET_SCHEMA?.trim()

    if (requestedSchema && !validarIdentificadorSchema(requestedSchema)) {
        throw new Error(`TARGET_SCHEMA invalido: ${requestedSchema}`)
    }

    const schemaName = requestedSchema || defaultSchema
    const schemaSql = qIdent(schemaName)
    const tableSql = `${schemaSql}."GuiaFeedback"`
    const moduloIdxSql = `"GuiaFeedback_modulo_idx"`
    const createdAtIdxSql = `"GuiaFeedback_createdAt_idx"`

    console.log(`[guia-feedback] Esquema activo: ${schemaName}`)

    await sql.query(`CREATE SCHEMA IF NOT EXISTS ${schemaSql}`)

    await sql.query(`
    CREATE TABLE IF NOT EXISTS ${tableSql} (
      "id" SERIAL NOT NULL,
      "modulo" VARCHAR(30) NOT NULL,
      "tipo" VARCHAR(20) NOT NULL,
      "prioridad" VARCHAR(10) NOT NULL,
      "titulo" VARCHAR(140) NOT NULL,
      "comentario" TEXT NOT NULL,
      "respuesta" TEXT,
      "respuestaAt" TIMESTAMP(6),
      "respuestaUsuarioCodigo" CHAR(10),
      "respuestaUsuarioNombre" VARCHAR(120),
      "respuestaUsuarioEmail" VARCHAR(120),
      "pantalla" VARCHAR(120),
      "pasos" TEXT,
      "resultadoEsperado" TEXT,
      "usuarioClerkId" VARCHAR(50) NOT NULL,
      "usuarioCodigo" CHAR(10) NOT NULL,
      "usuarioNombre" VARCHAR(120) NOT NULL,
      "usuarioEmail" VARCHAR(120) NOT NULL,
      "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "GuiaFeedback_pkey" PRIMARY KEY ("id")
    )
  `)

    await sql.query(`CREATE INDEX IF NOT EXISTS ${moduloIdxSql} ON ${tableSql}("modulo")`)
    await sql.query(`CREATE INDEX IF NOT EXISTS ${createdAtIdxSql} ON ${tableSql}("createdAt")`)

    await sql.query(`ALTER TABLE ${tableSql} ADD COLUMN IF NOT EXISTS "respuesta" TEXT`)
    await sql.query(`ALTER TABLE ${tableSql} ADD COLUMN IF NOT EXISTS "respuestaAt" TIMESTAMP(6)`)
    await sql.query(`ALTER TABLE ${tableSql} ADD COLUMN IF NOT EXISTS "respuestaUsuarioCodigo" CHAR(10)`)
    await sql.query(`ALTER TABLE ${tableSql} ADD COLUMN IF NOT EXISTS "respuestaUsuarioNombre" VARCHAR(120)`)
    await sql.query(`ALTER TABLE ${tableSql} ADD COLUMN IF NOT EXISTS "respuestaUsuarioEmail" VARCHAR(120)`)

    const columns = await sql.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = '${schemaName}'
      AND table_name = 'GuiaFeedback'
    ORDER BY ordinal_position
  `)

    const names = columns.map((row) => String(row.column_name))
    console.log(`[guia-feedback] Columnas detectadas (${names.length}): ${names.join(', ')}`)
    console.log('[guia-feedback] OK')
}

main().catch((error) => {
    console.error('[guia-feedback] ERROR', error)
    process.exit(1)
})
