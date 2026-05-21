import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const conComp = await p.nomencladorPractica.count({ where: { NOT: { valorEspecialista: null } } })
const total = await p.nomencladorPractica.count()
console.log('Total:', total, '| Con valorEspecialista:', conComp)
if (conComp > 0) {
    const sample = await p.nomencladorPractica.findFirst({ where: { NOT: { valorEspecialista: null } }, select: { codigo: true, descripcion: true, valorEspecialista: true, valorAyudante: true, valorAnestesista: true, valorGastos: true } })
    console.log('Ejemplo:', JSON.stringify(sample))
}
await p.$disconnect()
