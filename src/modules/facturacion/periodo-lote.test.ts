import test from 'node:test'
import assert from 'node:assert/strict'

import { fechaEntraEnPeriodo, periodoToDateRange, rangoPeriodoOpcional } from './periodo-lote'

test('el periodo arranca el dia 2 y cierra el dia 1 del mes siguiente', () => {
  const { desde, hasta } = periodoToDateRange('2026-09')
  assert.equal(desde.toISOString(), '2026-09-02T00:00:00.000Z')
  assert.equal(hasta.toISOString(), '2026-10-02T00:00:00.000Z')
})

test('septiembre incluye el 01/10 entero y no el 02/10', () => {
  const rango = rangoPeriodoOpcional('2026-09')
  assert.equal(fechaEntraEnPeriodo(new Date('2026-10-01T00:00:00.000Z'), rango), true)
  assert.equal(fechaEntraEnPeriodo(new Date('2026-10-01T15:00:00.000Z'), rango), true)
  assert.equal(fechaEntraEnPeriodo(new Date('2026-10-01T23:59:59.999Z'), rango), true)
  assert.equal(fechaEntraEnPeriodo(new Date('2026-10-02T00:00:00.000Z'), rango), false)
})

test('el 01 del propio mes no entra: pertenece al periodo anterior', () => {
  const septiembre = rangoPeriodoOpcional('2026-09')
  assert.equal(fechaEntraEnPeriodo(new Date('2026-09-01T15:00:00.000Z'), septiembre), false)
  assert.equal(fechaEntraEnPeriodo(new Date('2026-09-02T00:00:00.000Z'), septiembre), true)
})

test('dos periodos consecutivos no comparten ningun dia', () => {
  const septiembre = rangoPeriodoOpcional('2026-09')
  const octubre = rangoPeriodoOpcional('2026-10')
  for (const iso of ['2026-10-01T15:00:00.000Z', '2026-10-02T15:00:00.000Z']) {
    const fecha = new Date(iso)
    const enSeptiembre = fechaEntraEnPeriodo(fecha, septiembre)
    const enOctubre = fechaEntraEnPeriodo(fecha, octubre)
    assert.equal(enSeptiembre && enOctubre, false, `${iso} cae en los dos periodos`)
    assert.equal(enSeptiembre || enOctubre, true, `${iso} no cae en ninguno`)
  }
})

test('diciembre cierra el 01/01 del año siguiente', () => {
  const { desde, hasta } = periodoToDateRange('2026-12')
  assert.equal(desde.toISOString(), '2026-12-02T00:00:00.000Z')
  assert.equal(hasta.toISOString(), '2027-01-02T00:00:00.000Z')
})

// --- excepcion de transicion ---

test('2026-08 arranca el 01/08 por ser el primer periodo de la regla', () => {
  const { desde, hasta } = periodoToDateRange('2026-08')
  assert.equal(desde.toISOString(), '2026-08-01T00:00:00.000Z')
  assert.equal(hasta.toISOString(), '2026-09-02T00:00:00.000Z')
})

test('agosto incluye el 01/08 y tambien el 01/09 entero', () => {
  const agosto = rangoPeriodoOpcional('2026-08')
  assert.equal(fechaEntraEnPeriodo(new Date('2026-08-01T15:00:00.000Z'), agosto), true)
  assert.equal(fechaEntraEnPeriodo(new Date('2026-09-01T15:00:00.000Z'), agosto), true)
  assert.equal(fechaEntraEnPeriodo(new Date('2026-09-01T23:59:59.999Z'), agosto), true)
  assert.equal(fechaEntraEnPeriodo(new Date('2026-09-02T00:00:00.000Z'), agosto), false)
  assert.equal(fechaEntraEnPeriodo(new Date('2026-07-31T15:00:00.000Z'), agosto), false)
})

test('la excepcion no se contagia a septiembre, que sigue arrancando el dia 2', () => {
  const agosto = rangoPeriodoOpcional('2026-08')
  const septiembre = rangoPeriodoOpcional('2026-09')
  const primeroDeSeptiembre = new Date('2026-09-01T15:00:00.000Z')
  assert.equal(fechaEntraEnPeriodo(primeroDeSeptiembre, agosto), true)
  assert.equal(fechaEntraEnPeriodo(primeroDeSeptiembre, septiembre), false)
})

test('agosto de otro año no toma la excepcion', () => {
  assert.equal(periodoToDateRange('2027-08').desde.toISOString(), '2027-08-02T00:00:00.000Z')
})

test('sin periodo no hay filtro: entra cualquier fecha', () => {
  assert.equal(rangoPeriodoOpcional(null), null)
  assert.equal(rangoPeriodoOpcional(''), null)
  assert.equal(fechaEntraEnPeriodo(new Date('2001-01-01T00:00:00.000Z'), null), true)
})
