import test from 'node:test'
import assert from 'node:assert/strict'

import { esEstadoPracticaCirugiaVisible } from './practicas-cirugia-state'

test('muestra prácticas facturadas y activas pero no anuladas', () => {
  assert.equal(esEstadoPracticaCirugiaVisible('A'), true)
  assert.equal(esEstadoPracticaCirugiaVisible('F'), true)
  assert.equal(esEstadoPracticaCirugiaVisible(null), true)
  assert.equal(esEstadoPracticaCirugiaVisible('X'), false)
})
