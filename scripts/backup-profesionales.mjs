import { PrismaClient } from '@prisma/client'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

const prisma = new PrismaClient()
const outputArgument = process.argv.find((argument) => argument.startsWith('--output='))
const output = path.resolve(
    process.cwd(),
    outputArgument?.slice('--output='.length) ?? `profesionales-backup-${Date.now()}.json`
)

try {
    const profesionales = await prisma.profesional.findMany({ orderBy: { id: 'asc' } })
    await writeFile(output, JSON.stringify(profesionales, null, 2), 'utf8')
    console.log(`Profesionales respaldados: ${profesionales.length}`)
    console.log(`Archivo: ${output}`)
} finally {
    await prisma.$disconnect()
}