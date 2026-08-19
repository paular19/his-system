import test from 'node:test'
import assert from 'node:assert/strict'

import { aplicaPromediIPS, calcularImportePromediPorCodigo } from './promedi-rules'

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
