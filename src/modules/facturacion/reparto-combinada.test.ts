import test from 'node:test'
import assert from 'node:assert/strict'

import { repartirLineaCombinada } from './promedi-rules'

// Casos medidos contra la base.
// Electro 170101: HE 15149.63 + GA 3550.32 = 18699.95
const ELECTRO = { valorEspecialista: 15149.63, valorGastos: 3550.32 }
// T.A.C. cerebral 341001: HE 2902.67 + GA 53709.01 = 56611.68 (el 95% es el equipo)
const TAC = { valorEspecialista: 2902.67, valorGastos: 53709.01 }

test('la fila HE+GA se reparte entre especialista y gastos', () => {
    // Lote 43 despues de la correccion: el electro completo.
    const r = repartirLineaCombinada({
        codigoPractica: '170101',
        modulo: null,
        clasificacionAgrupacion: 'HE+GA',
        efectorMatricula: 1767,
        importeTotal: 18699.95,
        cantidad: 1,
        valoresNomenclador: ELECTRO,
    })

    assert.deepEqual(r, { especialista: 15149.63, ayudante: 0, anestesista: 0, gastos: 3550.32 })
})

test('la fila sin etiqueta cuyo importe es la suma tambien se reparte', () => {
    // Lote 43, orden 1376 (TARTALOS): sin modulo ni clasificacion.
    const r = repartirLineaCombinada({
        codigoPractica: '170101',
        modulo: null,
        clasificacionAgrupacion: null,
        efectorMatricula: 5071,
        importeTotal: 18699.95,
        cantidad: 1,
        valoresNomenclador: ELECTRO,
    })

    assert.equal(r?.especialista, 15149.63)
    assert.equal(r?.gastos, 3550.32)
})

test('en la tomografia casi todo el importe cae en gastos', () => {
    const r = repartirLineaCombinada({
        codigoPractica: '341001',
        modulo: null,
        clasificacionAgrupacion: 'HE+GA',
        efectorMatricula: 5449,
        importeTotal: 56611.68,
        cantidad: 1,
        valoresNomenclador: TAC,
    })

    assert.equal(r?.especialista, 2902.67)
    assert.equal(r?.gastos, 53709.01)
})

test('la cirugia con cuatro componentes reparte en las cuatro columnas', () => {
    // Etiqueta 'HE+HA+GA+A1'.
    const r = repartirLineaCombinada({
        codigoPractica: '80720',
        modulo: null,
        clasificacionAgrupacion: 'HE+HA+GA+A1',
        efectorMatricula: 2032,
        importeTotal: 1000,
        cantidad: 1,
        valoresNomenclador: {
            valorEspecialista: 500,
            valorAnestesista: 300,
            valorAyudante: 100,
            valorGastos: 100,
        },
    })

    assert.deepEqual(r, { especialista: 500, ayudante: 100, anestesista: 300, gastos: 100 })
})

test('una fila de un solo componente no se reparte', () => {
    for (const clas of ['HE', 'GA', 'A1', 'HA']) {
        assert.equal(
            repartirLineaCombinada({
                codigoPractica: '170101',
                modulo: null,
                clasificacionAgrupacion: clas,
                efectorMatricula: 5071,
                importeTotal: 15149.63,
                cantidad: 1,
                valoresNomenclador: ELECTRO,
            }),
            null,
            `la etiqueta ${clas} no deberia repartirse`
        )
    }
})

test('la etiqueta de un componente manda aunque el importe sea el total', () => {
    // Una fila marcada GA con el importe completo no se reparte sola: la etiqueta
    // explicita es una decision de quien facturo, no se adivina.
    assert.equal(
        repartirLineaCombinada({
            codigoPractica: '170101',
            modulo: null,
            clasificacionAgrupacion: 'GA',
            efectorMatricula: 5071,
            importeTotal: 18699.95,
            cantidad: 1,
            valoresNomenclador: ELECTRO,
        }),
        null
    )
})

test('el modulo tambien sirve de etiqueta cuando la clasificacion viene vacia', () => {
    const r = repartirLineaCombinada({
        codigoPractica: '170101',
        modulo: 'GA+HE   ',
        clasificacionAgrupacion: null,
        efectorMatricula: 1767,
        importeTotal: 18699.95,
        cantidad: 1,
        valoresNomenclador: ELECTRO,
    })
    assert.equal(r?.especialista, 15149.63)
    assert.equal(r?.gastos, 3550.32)
})

test('la cantidad no rompe la deteccion de la fila sin etiqueta', () => {
    const r = repartirLineaCombinada({
        codigoPractica: '170101',
        modulo: null,
        clasificacionAgrupacion: null,
        efectorMatricula: 1767,
        importeTotal: 37399.90,
        cantidad: 2,
        valoresNomenclador: ELECTRO,
    })
    assert.equal(r?.especialista, 30299.26)
    assert.equal(r?.gastos, 7100.64)
})

test('sin desglose de gastos no se inventa un reparto', () => {
    assert.equal(
        repartirLineaCombinada({
            codigoPractica: '420303',
            modulo: null,
            clasificacionAgrupacion: 'HE+GA',
            efectorMatricula: 1767,
            importeTotal: 17000.11,
            cantidad: 1,
            valoresNomenclador: { valorEspecialista: 17000.11, valorGastos: null },
        }),
        null
    )
})

test('las partes siempre suman el importe de la fila', () => {
    // Importe editado a mano en facturacion, y un desglose que no divide exacto:
    // el sobrante del redondeo tiene que quedar en el componente mas grande.
    for (const importe of [20000, 18699.94, 1, 33333.33]) {
        const r = repartirLineaCombinada({
            codigoPractica: '170101',
            modulo: null,
            clasificacionAgrupacion: 'HE+GA',
            efectorMatricula: 1767,
            importeTotal: importe,
            cantidad: 1,
            valoresNomenclador: ELECTRO,
        })!
        const suma = r.especialista + r.ayudante + r.anestesista + r.gastos
        assert.equal(Math.round(suma * 100) / 100, importe, `no cierra con importe ${importe}`)
    }
})
