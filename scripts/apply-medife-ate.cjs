const fs = require('node:fs')
const path = require('node:path')

function readEnvValue(files, key) {
    for (const file of files) {
        if (!fs.existsSync(file)) continue
        const content = fs.readFileSync(file, 'utf8')
        const line = content
            .split(/\r?\n/)
            .find((l) => l.startsWith(`${key}=`))
        if (line) {
            return line.slice(key.length + 1).replace(/^"|"$/g, '')
        }
    }
    return null
}

async function sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
    let Client
    try {
        ; ({ Client } = require('pg'))
    } catch {
        throw new Error('El paquete pg no esta instalado. Ejecuta: npm install pg --no-save')
    }

    const envFiles = [
        path.resolve(process.cwd(), '.env.local'),
        path.resolve(process.cwd(), '.env'),
    ]

    const connectionString =
        readEnvValue(envFiles, 'DIRECT_URL') ||
        readEnvValue(envFiles, 'DATABASE_URL')

    if (!connectionString) {
        throw new Error('No se encontro DIRECT_URL ni DATABASE_URL en .env.local/.env')
    }

    const sql = `
DO $$
DECLARE v_ate_id integer;
BEGIN
  INSERT INTO "ObraSocial" ("OSID", "OSNom", "OSReqCoseg", "OSEstad", "OSFchEst")
    VALUES (235, 'MEDIFE', 'N', 'A', NOW())
  ON CONFLICT ("OSID") DO UPDATE
  SET "OSNom" = EXCLUDED."OSNom",
      "OSReqCoseg" = EXCLUDED."OSReqCoseg",
      "OSEstad" = 'A';

  SELECT "OSID" INTO v_ate_id
  FROM "ObraSocial"
  WHERE UPPER("OSNom") LIKE '%ATE%'
  ORDER BY "OSID"
  LIMIT 1;

  IF v_ate_id IS NULL THEN
    SELECT COALESCE(MAX("OSID"), 0) + 1 INTO v_ate_id
    FROM "ObraSocial";

    INSERT INTO "ObraSocial" ("OSID", "OSNom", "OSReqCoseg", "OSEstad", "OSFchEst")
    VALUES (v_ate_id, 'ATE', 'N', 'A', NOW());
  END IF;
END $$;
`

    const maxAttempts = 6
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const client = new Client({
            connectionString,
            connectionTimeoutMillis: 60000,
            statement_timeout: 120000,
            query_timeout: 120000,
            ssl: { rejectUnauthorized: false },
        })

        try {
            console.log(`Intento ${attempt}/${maxAttempts}...`)
            await client.connect()
            await client.query('SELECT 1')
            await client.query(sql)

            const { rows } = await client.query(`
        SELECT "OSID" AS id, "OSNom" AS nombre, "OSReqCoseg" AS requiere_coseguro
        FROM "ObraSocial"
        WHERE "OSID" = 235 OR UPPER("OSNom") LIKE '%ATE%'
        ORDER BY "OSID"
        LIMIT 10
      `)

            console.log('Aplicado correctamente. Resultado:')
            console.table(rows)
            await client.end()
            return
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            console.warn(`Fallo intento ${attempt}: ${message}`)
            try {
                await client.end()
            } catch {
                // ignore close errors
            }

            if (attempt === maxAttempts) {
                throw new Error(`No se pudo aplicar tras ${maxAttempts} intentos. Ultimo error: ${message}`)
            }

            await sleep(Math.min(6000, attempt * 1200))
        }
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
})
