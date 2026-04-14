import { prisma } from '../src/lib/db'

async function main() {
    const ahora = new Date()
    const usuario = 'SYSTEM'

    const subtipos = [
        {
            codigo: 'GUA',
            descripcion: 'Por Guardia',
        },
        {
            codigo: 'TUR',
            descripcion: 'Por Turno Asignado',
        },
        {
            codigo: 'RAY',
            descripcion: 'Por Rayos/Radiología',
        },
        {
            codigo: 'PAM',
            descripcion: 'Práctica Ambulatoria',
        },
        {
            codigo: 'DER',
            descripcion: 'Derivación',
        },
        {
            codigo: 'IND',
            descripcion: 'Indicación Médica',
        },
    ]

    for (const subtipo of subtipos) {
        await prisma.subtipoAdmision.upsert({
            where: { codigo: subtipo.codigo },
            update: {},
            create: {
                codigo: subtipo.codigo,
                descripcion: subtipo.descripcion,
                estado: 'A',
                usuario,
                fechaEstado: ahora,
            },
        })
    }

    console.log('Subtipos de admisión creados exitosamente')
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
