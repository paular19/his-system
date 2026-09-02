/**
 * Crea la tabla CatalogoMedicamentoFacturacion y la siembra con la lista que
 * hasta ahora vivia hardcodeada en `src/lib/catalogos/medicamentos-facturacion.ts`.
 *
 * NO se usa `prisma db push` a proposito: en esta base el push borra
 * `Paciente_HC_seq` y 11 indices creados a mano (ver CLAUDE.md, trampa 5). El
 * DDL de aca abajo es exactamente el bloque "CreateTable" que devuelve
 * `prisma migrate diff`, con IF NOT EXISTS para poder correrlo dos veces.
 *
 * Es idempotente: el seed omite los nombres que ya estan en la tabla, asi que
 * no pisa precios que hayan cargado desde el panel.
 *
 *   npm run db:seed-medicamentos-facturacion
 */
import { PrismaClient } from '@prisma/client'
import { MEDICAMENTOS_FACTURACION } from '../src/lib/catalogos/medicamentos-facturacion'

const prisma = new PrismaClient()

async function crearTabla() {
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "CatalogoMedicamentoFacturacion" (
            "CMFId" SERIAL NOT NULL,
            "CMFNombre" VARCHAR(200) NOT NULL,
            "CMFPrecio" DECIMAL(18,2),
            "CMFEstado" CHAR(1) NOT NULL DEFAULT 'A',
            "CMFFchEstado" TIMESTAMP(6) NOT NULL,
            "UsuCodig" CHAR(10) NOT NULL,
            CONSTRAINT "CatalogoMedicamentoFacturacion_pkey" PRIMARY KEY ("CMFId")
        )
    `)

    await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "CatalogoMedicamentoFacturacion_CMFNombre_key"
        ON "CatalogoMedicamentoFacturacion"("CMFNombre")
    `)

    await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "CatalogoMedicamentoFacturacion_CMFEstado_idx"
        ON "CatalogoMedicamentoFacturacion"("CMFEstado")
    `)
}

async function sembrar() {
    const existentes = await prisma.catalogoMedicamentoFacturacion.findMany({
        select: { nombre: true },
    })
    const yaEstan = new Set(existentes.map((m) => m.nombre.trim().toLowerCase()))

    let creados = 0
    for (const med of MEDICAMENTOS_FACTURACION) {
        if (yaEstan.has(med.nombre.trim().toLowerCase())) continue

        await prisma.catalogoMedicamentoFacturacion.create({
            data: {
                nombre: med.nombre,
                precio: med.precio,
                estado: 'A',
                usuario: 'SEED',
                fechaEstado: new Date(),
            },
        })
        creados++
    }

    return { creados, omitidos: MEDICAMENTOS_FACTURACION.length - creados }
}

async function main() {
    await crearTabla()
    console.log('Tabla e indices verificados.')

    const { creados, omitidos } = await sembrar()
    console.log(`Sembrados: ${creados} | ya existian: ${omitidos}`)

    // Chequeo de la trampa 5: el DDL de arriba no debe haber tocado nada mas.
    const secuencia = await prisma.$queryRawUnsafe<Array<{ existe: boolean }>>(
        `SELECT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'Paciente_HC_seq') AS existe`
    )
    console.log(`Paciente_HC_seq sigue viva: ${secuencia[0]?.existe}`)

    const indices = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT COUNT(*)::bigint AS n FROM pg_indexes WHERE indexname LIKE 'idx_%'`
    )
    console.log(`Indices manuales (idx_*) presentes: ${indices[0]?.n}`)

    const total = await prisma.catalogoMedicamentoFacturacion.count({ where: { estado: 'A' } })
    console.log(`Medicamentos activos en el catalogo: ${total}`)
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
