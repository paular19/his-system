import type { PrismaClient } from '@prisma/client'

const TIPOS_INGRESO = [
    { codigo: 'AMB', descripcion: 'Ambulatorio', proximoNumero: 1 },
    { codigo: 'INT', descripcion: 'Internacion', proximoNumero: 1 },
] as const

const TIPOS_INTERNACION = [
    { codigo: 'GEN', descripcion: 'General', esAmbulatorio: false },
    { codigo: 'UTI', descripcion: 'Terapia Intensiva', esAmbulatorio: false },
    { codigo: 'CIR', descripcion: 'Cirugia Programada', esAmbulatorio: false },
    { codigo: 'OBS', descripcion: 'Observacion', esAmbulatorio: true },
    { codigo: 'CON', descripcion: 'Consulta / Indicacion', esAmbulatorio: true },
] as const

const SUBTIPOS_ADMISION_ACTIVOS = [
    { codigo: 'GUA', descripcion: 'Atencion por guardia' },
    { codigo: 'TUR', descripcion: 'Por turno' },
    { codigo: 'RAY', descripcion: 'Radiografias' },
    { codigo: 'CUR', descripcion: 'Curaciones' },
    { codigo: 'SUT', descripcion: 'Suturas' },
    { codigo: 'ECG', descripcion: 'Electrocardiogramas' },
    { codigo: 'ECO', descripcion: 'Ecografias' },
    { codigo: 'DER', descripcion: 'Derivacion' },
] as const

const SUBTIPOS_ADMISION_INACTIVOS = [
    { codigo: 'PAM', descripcion: 'Practica Ambulatoria' },
    { codigo: 'IND', descripcion: 'Indicacion Medica' },
    { codigo: 'PRG', descripcion: 'Programada' },
    { codigo: 'URG', descripcion: 'Urgencia' },
    { codigo: 'EME', descripcion: 'Emergencia' },
    { codigo: 'TRA', descripcion: 'Traslado' },
] as const

export async function seedTiposIngreso(prisma: PrismaClient) {
    for (const tipo of TIPOS_INGRESO) {
        await prisma.tipoIngreso.upsert({
            where: { codigo: tipo.codigo },
            update: { descripcion: tipo.descripcion },
            create: tipo,
        })
        console.log(`  ✓ TipoIngreso: ${tipo.codigo} - ${tipo.descripcion}`)
    }
}

export async function seedTiposInternacion(prisma: PrismaClient) {
    for (const tipo of TIPOS_INTERNACION) {
        await prisma.tipoInternacion.upsert({
            where: { codigo: tipo.codigo },
            update: { descripcion: tipo.descripcion, esAmbulatorio: tipo.esAmbulatorio },
            create: tipo,
        })
        console.log(`  ✓ TipoInternacion: ${tipo.codigo} - ${tipo.descripcion}`)
    }
}

export async function seedSubtiposAdmision(prisma: PrismaClient) {
    const ahora = new Date()
    const usuario = 'SYSTEM'

    for (const subtipo of SUBTIPOS_ADMISION_ACTIVOS) {
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
        console.log(`  ✓ SubtipoAdmision: ${subtipo.codigo} - ${subtipo.descripcion} [A]`)
    }

    for (const subtipo of SUBTIPOS_ADMISION_INACTIVOS) {
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
        console.log(`  ✓ SubtipoAdmision: ${subtipo.codigo} - ${subtipo.descripcion} [I]`)
    }
}

export async function seedAdmisionMaestros(prisma: PrismaClient) {
    await seedTiposIngreso(prisma)
    await seedTiposInternacion(prisma)
    await seedSubtiposAdmision(prisma)
}
