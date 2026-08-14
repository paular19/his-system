import test from 'node:test'
import assert from 'node:assert/strict'

import { calcularImportePromediPorCodigo } from './promedi-rules'

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
