import { PrismaClient } from '@prisma/client'

const loteId = Number(process.argv[2] ?? 12)
const prisma = new PrismaClient()

const CODIGOS_PROMEDI_BASE = new Set([430101, 431001, 400101, 431002, 431103, 430130])
const CODIGOS_PROMEDI_RANGOS = [
  { desde: 10101, hasta: 130304 },
  { desde: 720201, hasta: 722238 },
]
const CODIGOS_EXCLUIDOS_PROMEDI_OSECAC = new Set([70116, 70607])

function round2(value) {
  return Math.round((Number(value ?? 0) + Number.EPSILON) * 100) / 100
}

function parseCodigoPromedi(codigo) {
  const parsed = Number.parseInt(String(codigo ?? '').trim(), 10)
  return Number.isFinite(parsed) ? parsed : null
}

function codigoEnRangoPromedi(codigo) {
  return CODIGOS_PROMEDI_RANGOS.some(({ desde, hasta }) => codigo >= desde && codigo <= hasta)
}

function aplicaPromediIPS(codigoPractica) {
  const codigo = parseCodigoPromedi(codigoPractica)
  if (codigo === null) return false
  return CODIGOS_PROMEDI_BASE.has(codigo) || codigoEnRangoPromedi(codigo)
}

function aplicaPromediOsecac(codigoPractica) {
  const codigo = parseCodigoPromedi(codigoPractica)
  if (codigo === null) return false
  if (CODIGOS_EXCLUIDOS_PROMEDI_OSECAC.has(codigo)) return false
  return CODIGOS_PROMEDI_BASE.has(codigo) || codigoEnRangoPromedi(codigo)
}

function tieneNumeroAutorizacionValido(valor) {
  return typeof valor === 'string' ? valor.trim().length > 0 : Boolean(valor)
}

function periodoToDateRange(periodo) {
  const [anio, mes] = String(periodo ?? '').split('-').map((v) => Number(v))
  const desde = new Date(Date.UTC(anio, mes - 1, 1, 0, 0, 0, 0))
  const hasta = new Date(Date.UTC(anio, mes, 1, 0, 0, 0, 0))
  return { desde, hasta }
}

function esObraSocialIps(nombre) {
  const limpio = String(nombre ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return limpio.includes('IPS') || limpio.includes('IPSS')
}

function esObraSocialOsecac(nombre) {
  const limpio = String(nombre ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return limpio.includes('OSECAC') || limpio.includes('OBRASOCIALEMPLEADOSDECOMERCIO')
}

async function main() {
  const lote = await prisma.loteFacturacion.findUnique({
    where: { id: loteId },
    select: {
      id: true,
      estado: true,
      tipo: true,
      periodo: true,
      obraSocial: { select: { nombre: true } },
    },
  })

  if (!lote) {
    throw new Error(`Lote ${loteId} no encontrado`)
  }

  const esIps = esObraSocialIps(lote.obraSocial?.nombre)
  const esOsecac = esObraSocialOsecac(lote.obraSocial?.nombre)
  if (!((esIps || esOsecac) && lote.tipo === 'PRACTICAS')) {
    throw new Error(`El lote ${loteId} no aplica a regla de PROMEDI`)
  }

  const { desde, hasta } = periodoToDateRange(lote.periodo)
  const loteItems = await prisma.loteFacturacionItem.findMany({
    where: { loteId },
    select: { id: true, ingresoId: true, incluido: true },
  })

  if (!loteItems.length) {
    console.log(`El lote ${loteId} no tiene items para recalcular`)
    return
  }

  const ingresoIds = [...new Set(loteItems.map((it) => it.ingresoId))]
  const ordenes = await prisma.orden.findMany({
    where: {
      ingresoId: { in: ingresoIds },
      estado: { not: 'X' },
      fechaEmision: { gte: desde, lt: hasta },
      OR: [
        { AND: [{ numeroAutorizacion: { not: null } }, { numeroAutorizacion: { not: '' } }] },
        { items: { some: { AND: [{ numeroAutorizacion: { not: null } }, { numeroAutorizacion: { not: '' } }] } } },
      ],
    },
    select: {
      ingresoId: true,
      numeroAutorizacion: true,
      items: {
        select: {
          codigoPractica: true,
          importeTotal: true,
          numeroAutorizacion: true,
        },
      },
    },
  })

  const importePorIngreso = new Map()
  const porcentajePromedi = esIps ? 0.36 : 0.20

  for (const orden of ordenes) {
    const ordenConAutorizacion = tieneNumeroAutorizacionValido(orden.numeroAutorizacion)
    for (const item of orden.items) {
      if (!ordenConAutorizacion && !tieneNumeroAutorizacionValido(item.numeroAutorizacion)) continue
      if (!orden.ingresoId) continue
      const importeBase = Number(item.importeTotal ?? 0)
      const aplica = (esIps ? aplicaPromediIPS : aplicaPromediOsecac)(item.codigoPractica)
      const importeFacturable = aplica ? round2(importeBase * porcentajePromedi) : round2(importeBase)
      const actual = importePorIngreso.get(orden.ingresoId) ?? 0
      importePorIngreso.set(orden.ingresoId, round2(actual + importeFacturable))
    }
  }

  const updates = await Promise.all(
    loteItems.map(async (it) => {
      const nuevoImporte = round2(importePorIngreso.get(it.ingresoId) ?? 0)
      const updated = await prisma.loteFacturacionItem.update({
        where: { id: it.id },
        data: { importePromedi: nuevoImporte },
        select: { id: true, ingresoId: true, importePromedi: true },
      })
      return updated
    })
  )

  const total = updates.reduce((sum, it) => sum + Number(it.importePromedi ?? 0), 0)
  console.log(JSON.stringify({ loteId, total, itemsActualizados: updates.length, detalle: updates.slice(0, 10) }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
