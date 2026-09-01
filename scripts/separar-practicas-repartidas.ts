/**
 * Separa las practicas facturadas que quedaron compartidas entre varias ordenes.
 *
 * El estado de facturado vive en la practica: `estado='F'` mas un unico puntero
 * puesto/orden/item. Una cirugia se cobra repartida por rol — honorario especialista,
 * anestesista, ayudante, derechos — con una orden por rol y UN item de la misma
 * practica en cada una. Marcar esa practica daba por facturadas a las cuatro, aunque
 * solo una se hubiera facturado, y las otras tres desaparecian del panel: de
 * pendientes por estar facturadas, y de facturadas por no tener autorizacion propia.
 *
 * Desde `separarItemEnPracticaPropia` facturar una orden le da al item su practica
 * propia, asi que el caso no se repite. Este script arregla los que quedaron de antes:
 * a cada item que NO es el apuntado le da su propia Practica en estado 'A', con el
 * importe de ese item, y le reapunta el OrdenPrac. La original se queda con el item
 * apuntado y su importe.
 *
 * Uso:
 *   npx tsx scripts/separar-practicas-repartidas.ts                  # dry-run, todo
 *   npx tsx scripts/separar-practicas-repartidas.ts --ingreso=506    # dry-run, un ingreso
 *   npx tsx scripts/separar-practicas-repartidas.ts --ingreso=506 --aplicar
 */
import { prisma } from '@/lib/db'

type ItemOrden = {
    puestoNumero: number
    ordenNumero: number
    item: number
    importeTotal: unknown
}

function parseArgs() {
    const args = process.argv.slice(2)
    const aplicar = args.includes('--aplicar')
    const ingresoArg = args.find((a) => a.startsWith('--ingreso='))
    const ingresoId = ingresoArg ? Number(ingresoArg.split('=')[1]) : null
    if (ingresoArg && (!ingresoId || !Number.isFinite(ingresoId))) {
        throw new Error('--ingreso debe ser un numero')
    }
    return { aplicar, ingresoId }
}

function importe(valor: unknown): number {
    return Number(String(valor ?? 0))
}

async function main() {
    const { aplicar, ingresoId } = parseArgs()

    // Practicas facturadas con items en mas de una orden.
    const items = await prisma.ordenPractica.findMany({
        where: { practicaId: { not: null } },
        select: { practicaId: true, puestoNumero: true, ordenNumero: true, item: true, importeTotal: true },
        orderBy: [{ ordenNumero: 'asc' }, { item: 'asc' }],
    })

    // Una practica tambien queda referenciada por varias ordenes cuando una se
    // renumero o se regenero: la vieja queda anulada y la nueva la reemplaza. Eso NO
    // es un reparto por rol y separarlo resucitaria la orden anulada como pendiente,
    // lista para cobrarse dos veces. Solo cuentan las ordenes vivas.
    const ordenes = await prisma.orden.findMany({
        select: { puestoNumero: true, numero: true, estado: true },
    })
    const ordenesAnuladas = new Set(
        ordenes
            .filter((o) => (o.estado ?? '').trim().toUpperCase().startsWith('X'))
            .map((o) => `${o.puestoNumero}:${o.numero}`)
    )

    const itemsPorPractica = new Map<number, ItemOrden[]>()
    for (const it of items) {
        if (ordenesAnuladas.has(`${it.puestoNumero}:${it.ordenNumero}`)) continue
        const arr = itemsPorPractica.get(it.practicaId!) ?? []
        arr.push(it)
        itemsPorPractica.set(it.practicaId!, arr)
    }

    const repartidas = [...itemsPorPractica.entries()]
        .filter(([, arr]) => new Set(arr.map((a) => `${a.puestoNumero}:${a.ordenNumero}`)).size > 1)
        .map(([id]) => id)

    const practicas = await prisma.practica.findMany({
        where: {
            id: { in: repartidas },
            estado: 'F',
            ...(ingresoId ? { ingresoId } : {}),
        },
        orderBy: { id: 'asc' },
    })

    if (practicas.length === 0) {
        console.log('No hay practicas facturadas repartidas entre varias ordenes.')
        return
    }

    console.log(`${aplicar ? 'APLICANDO' : 'DRY-RUN'} — practicas facturadas repartidas: ${practicas.length}\n`)

    const sinPuntero: number[] = []
    let clonesPrevistos = 0

    for (const p of practicas) {
        const arr = itemsPorPractica.get(p.id) ?? []
        const apuntado = arr.find(
            (a) =>
                a.puestoNumero === p.puestoNumero &&
                a.ordenNumero === p.ordenNumero &&
                a.item === p.ordenItem
        )

        console.log(
            `practica ${p.id} | ingreso ${p.ingresoId} | cod ${p.codigoPractica.trim()} | ` +
            `importe ${importe(p.importeTotal).toFixed(2)} | puntero ${p.puestoNumero ?? '-'}/${p.ordenNumero ?? '-'}#${p.ordenItem ?? '-'}`
        )

        if (!apuntado) {
            // Sin puntero resoluble no se sabe cual orden se facturo. Separar a ciegas
            // elegiria por nosotros cual queda cobrada: se deja para revisar a mano.
            sinPuntero.push(p.id)
            console.log('   !! el puntero no coincide con ningun item: SE SALTEA, revisar a mano\n')
            continue
        }

        for (const a of arr) {
            const esApuntado = a === apuntado
            const marca = esApuntado ? 'queda facturada (F)' : 'nueva practica pendiente (A)'
            console.log(
                `   orden ${a.puestoNumero}/${a.ordenNumero}#${a.item} | importe ${importe(a.importeTotal).toFixed(2)} -> ${marca}`
            )
            if (!esApuntado) clonesPrevistos++
        }

        const sumaItems = arr.reduce((s, a) => s + importe(a.importeTotal), 0)
        console.log(
            `   suma items ${sumaItems.toFixed(2)} | la original queda en ${importe(apuntado.importeTotal).toFixed(2)}\n`
        )

        if (!aplicar) continue

        await prisma.$transaction(async (tx) => {
            for (const a of arr) {
                if (a === apuntado) continue

                const { id: _id, ...campos } = p
                const nueva = await tx.practica.create({
                    data: {
                        ...campos,
                        importeTotal: a.importeTotal as never,
                        // Vuelve a pendiente: nadie facturo esta orden.
                        estado: 'A',
                        puestoNumero: null,
                        ordenNumero: null,
                        ordenItem: null,
                    },
                })

                await tx.ordenPractica.update({
                    where: {
                        puestoNumero_ordenNumero_item: {
                            puestoNumero: a.puestoNumero,
                            ordenNumero: a.ordenNumero,
                            item: a.item,
                        },
                    },
                    data: { practicaId: nueva.id },
                })
            }

            // La original se queda con un solo item: su importe es el de ese item.
            await tx.practica.update({
                where: { id: p.id },
                data: { importeTotal: apuntado.importeTotal as never },
            })
        })
    }

    console.log('---')
    console.log(`practicas procesadas: ${practicas.length - sinPuntero.length}`)
    console.log(`practicas nuevas ${aplicar ? 'creadas' : 'a crear'}: ${clonesPrevistos}`)
    if (sinPuntero.length > 0) {
        console.log(`salteadas por puntero irresoluble: ${sinPuntero.join(', ')}`)
    }
    if (!aplicar) console.log('\nNada se escribio. Volver a correr con --aplicar para escribir.')
}

main()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : e)
        process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
