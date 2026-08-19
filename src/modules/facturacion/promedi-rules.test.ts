import test from 'node:test'
import assert from 'node:assert/strict'

import { aplicaPromediIPS, aplicaPromediOsecac, calcularImportePromediPorCodigo } from './promedi-rules'
import { categoriaPractica } from './categorias-practica'

test('aplica el porcentaje como fracción del importe y no como multiplicador directo', () => {
  assert.equal(
    calcularImportePromediPorCodigo('720508', 644743.43, 20, 'OSECAC'),
    128948.69
  )

  assert.equal(
    calcularImportePromediPorCodigo('720329', 113537.07, 20, 'OSECAC'),
    22707.41
  )
})

test('reconoce que codigos entran al resumen de la planilla IPS', () => {
  // Cama acompanante, oxigeno, radiografias, ecografias y 431101: fuera del resumen.
  for (const codigo of ['430106', '430701', '340301', '180116', '431101']) {
    assert.equal(aplicaPromediIPS(codigo), false)
  }

  // Codigos alcanzados: 36% sobre el bruto.
  assert.equal(calcularImportePromediPorCodigo('430101', 4435692.52, 36, 'IPS'), 1596849.31)
  assert.equal(calcularImportePromediPorCodigo('080304', 332082.01, 36, 'IPS'), 119549.52)
})

test('lo que queda fuera de la regla no se factura', () => {
  // IPS: oxigeno, radiografia, ecografia, guardia, cama acompanante y 431101.
  for (const codigo of ['430701', '340301', '180116', '420101', '430106', '431101']) {
    assert.equal(calcularImportePromediPorCodigo(codigo, 100000, 36, 'IPS'), 0)
  }

  // OSECAC: ademas 70116 y 70607 quedan excluidos aunque caigan en rango.
  assert.equal(aplicaPromediOsecac('070116'), false)
  assert.equal(aplicaPromediOsecac('070607'), false)
  assert.equal(calcularImportePromediPorCodigo('070116', 112278.31, 20, 'OSECAC'), 0)
  assert.equal(calcularImportePromediPorCodigo('070607', 50000, 20, 'OSECAC'), 0)
  assert.equal(calcularImportePromediPorCodigo('169006', 2943320.04, 20, 'OSECAC'), 0)
})

test('las categorias de filtro reconocen los codigos de los lotes reales', () => {
  assert.equal(categoriaPractica('430701'), 'OXIGENO')
  assert.equal(categoriaPractica('420101'), 'GUARDIA')
  for (const codigo of ['340301', '340302', '340905', '340421', '340209', '340211', '340907']) {
    assert.equal(categoriaPractica(codigo), 'RADIOGRAFIA')
  }
  for (const codigo of ['180112', '180114', '180116', '180120', '180126', '180130']) {
    assert.equal(categoriaPractica(codigo), 'ECOGRAFIA')
  }
  // La T.A.C. no es radiografia; los codigos de promedi no tienen categoria.
  assert.equal(categoriaPractica('341012'), null)
  assert.equal(categoriaPractica('430101'), null)
})
