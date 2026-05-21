import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const last = await p.auditLog.findFirst({
    where: { entidad: 'FACTURACION_NOMENCLADOR', accion: 'MODIFICAR' },
    orderBy: { fecha: 'desc' },
    select: { fecha: true, detalle: true, usuario: true }
})
console.log('Ultimo import nomenclador:', JSON.stringify(last, null, 2))
await p.$disconnect()
