import { PrismaClient } from '@prisma/client'
import { seedSubtiposAdmision } from './seed-admision-maestros'

const prisma = new PrismaClient()

async function main() {
    await seedSubtiposAdmision(prisma)

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
