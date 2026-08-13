import test from 'node:test'
import assert from 'node:assert/strict'

import { puedeEditarPrestacionEnLote } from './editability'

test('permite editar mientras el lote esté pendiente', () => {
  assert.equal(puedeEditarPrestacionEnLote('PEN'), true)
  assert.equal(puedeEditarPrestacionEnLote('CON'), false)
  assert.equal(puedeEditarPrestacionEnLote('ANU'), false)
})
