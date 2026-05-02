import { prisma } from '../src/lib/db'

async function main() {
    const ahora = new Date()
    const usuario = 'SYSTEM'

    const subtiposActivos = [
        {
            codigo: 'GUA',
            descripcion: 'Atencion por guardia',
        },
        {
            codigo: 'TUR',
            descripcion: 'Por turno',
        },
        {
            codigo: 'RAY',
            descripcion: 'Radiografias',
        },
        {
            codigo: 'CUR',
            descripcion: 'Curaciones',
        },
        {
            codigo: 'SUT',
            descripcion: 'Suturas',
        },
        {
            codigo: 'ECG',
            descripcion: 'Electrocardiogramas',
        },
        {
            codigo: 'ECO',
            descripcion: 'Ecografias',
        },
        {
            codigo: 'DER',
            descripcion: 'Derivacion',
        },
    ]

    const subtiposInactivos = [
        // Legacy ambulatorio
        {
            codigo: 'PAM',
            descripcion: 'Practica Ambulatoria',
        },
        {
            codigo: 'IND',
            descripcion: 'Indicacion Medica',
        },
        // Internacion legacy
        {
            codigo: 'PRG',
            descripcion: 'Programada',
        },
        {
            codigo: 'URG',
            descripcion: 'Urgencia',
        },
        {
            codigo: 'EME',
            descripcion: 'Emergencia',
        },
        {
            codigo: 'TRA',
            descripcion: 'Traslado',
        },
    ]

    for (const subtipo of subtiposActivos) {
        await prisma.subtipoAdmision.upsert({
            where: { codigo: subtipo.codigo },
            update: {
                descripcion: subtipo.descripcion,
                estado: 'A',
                usuario,
                fechaEstado: ahora,
            },
            create: {
                codigo: subtipo.codigo,
                descripcion: subtipo.descripcion,
                estado: 'A',
                usuario,
                fechaEstado: ahora,
            },
        })
    }

    for (const subtipo of subtiposInactivos) {
        await prisma.subtipoAdmision.upsert({
            where: { codigo: subtipo.codigo },
            update: {
                descripcion: subtipo.descripcion,
                estado: 'I',
                usuario,
                fechaEstado: ahora,
            },
            create: {
                codigo: subtipo.codigo,
                descripcion: subtipo.descripcion,
                estado: 'I',
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
