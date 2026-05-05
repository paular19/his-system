import { PrismaClient } from './node_modules/@prisma/client/index.js'
const p = new PrismaClient()
const [ingresos, pacientes] = await Promise.all([p.ingreso.count(), p.paciente.count()])
console.log('Ingresos:', ingresos, '| Pacientes:', pacientes)
await p.$disconnect()
