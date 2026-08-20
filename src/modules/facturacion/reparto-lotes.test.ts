import test from 'node:test'
import assert from 'node:assert/strict'

import type { CategoriaPractica } from './categorias-practica'
import { claveOrdenLote, repartirOrdenesDeIngreso, type OrdenParaReparto } from './reparto-lotes'

const guardia: OrdenParaReparto = {
    puestoNumero: 1,
    ordenNumero: 100,
    categorias: ['GUARDIA'],
    importe: 17000,
}
const radiografia: OrdenParaReparto = {
    puestoNumero: 1,
    ordenNumero: 101,
    categorias: ['RADIOGRAFIA'],
    importe: 2900,
}
const sinCategoria: OrdenParaReparto = {
    puestoNumero: 1,
    ordenNumero: 102,
    categorias: [],
    importe: 5000,
}

const cats = (...ids: CategoriaPractica[]) => new Set<CategoriaPractica>(ids)
const tomadas = (...claves: string[]) => new Set<string>(claves)

test('sin categorias seleccionadas entra todo lo que este libre', () => {
    const r = repartirOrdenesDeIngreso([guardia, radiografia], cats(), tomadas())

    assert.equal(r.entra, true)
    assert.equal(r.importe, 19900)
    assert.deepEqual(r.ordenesExcluidas, [])
})

test('con una categoria entra solo esa y el resto queda excluido', () => {
    const r = repartirOrdenesDeIngreso([guardia, radiografia], cats('GUARDIA'), tomadas())

    assert.equal(r.entra, true)
    assert.equal(r.importe, 17000)
    assert.deepEqual(r.ordenesExcluidas, [{ puestoNumero: 1, ordenNumero: 101 }])
})

test('dos lotes por categoria reparten las ordenes sin superponerse', () => {
    const loteGuardia = repartirOrdenesDeIngreso(
        [guardia, radiografia],
        cats('GUARDIA'),
        tomadas()
    )
    // El segundo lote se crea cuando el primero ya tomo la orden de guardia.
    const loteRadio = repartirOrdenesDeIngreso(
        [guardia, radiografia],
        cats('RADIOGRAFIA'),
        tomadas(claveOrdenLote(1, 100))
    )

    assert.equal(loteGuardia.importe, 17000)
    assert.equal(loteRadio.importe, 2900)
    // Ninguna orden quedo facturada dos veces.
    assert.equal(loteGuardia.importe + loteRadio.importe, 19900)
})

test('una orden ya tomada por otro lote se excluye aunque coincida la categoria', () => {
    const r = repartirOrdenesDeIngreso(
        [guardia, radiografia],
        cats('GUARDIA', 'RADIOGRAFIA'),
        tomadas(claveOrdenLote(1, 100))
    )

    assert.equal(r.entra, true)
    assert.equal(r.importe, 2900)
    assert.deepEqual(r.ordenesExcluidas, [{ puestoNumero: 1, ordenNumero: 100 }])
})

test('si no queda ninguna orden libre el ingreso no entra al lote', () => {
    const r = repartirOrdenesDeIngreso(
        [guardia, radiografia],
        cats('GUARDIA', 'RADIOGRAFIA'),
        tomadas(claveOrdenLote(1, 100), claveOrdenLote(1, 101))
    )

    assert.equal(r.entra, false)
    assert.equal(r.importe, 0)
    // Sin ingreso no hay exclusiones que guardar.
    assert.deepEqual(r.ordenesExcluidas, [])
})

test('una orden sin categoria conocida no entra en un lote de categoria puntual', () => {
    const r = repartirOrdenesDeIngreso([sinCategoria], cats('GUARDIA'), tomadas())

    assert.equal(r.entra, false)
})

test('una orden sin categoria conocida entra en un lote sin filtro', () => {
    const r = repartirOrdenesDeIngreso([sinCategoria], cats(), tomadas())

    assert.equal(r.entra, true)
    assert.equal(r.importe, 5000)
})

test('la orden no se parte: si mezcla categorias va entera al lote que la reclame', () => {
    const mixta: OrdenParaReparto = {
        puestoNumero: 1,
        ordenNumero: 103,
        categorias: ['GUARDIA', 'RADIOGRAFIA'],
        importe: 8000,
    }

    const r = repartirOrdenesDeIngreso([mixta], cats('GUARDIA'), tomadas())

    assert.equal(r.entra, true)
    assert.equal(r.importe, 8000, 'entra el importe completo, no solo la parte de guardia')
    assert.deepEqual(r.ordenesExcluidas, [])
})
