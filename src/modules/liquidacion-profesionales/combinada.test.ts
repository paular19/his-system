import test from 'node:test'
import assert from 'node:assert/strict'

import { resolverImportesLiquidacion, porcionGastosDeLineaCombinada } from './subitem'

// Los casos vienen de filas reales de OrdenPractica medidas contra la base.
// El electrocardiograma (170101) desglosa HE 15149.63 + GA 3550.32 = 18699.95.
const ELECTRO = { valorEspecialista: 15149.63, valorGastos: 3550.32 }

test('la linea HE+GA reparte honorario y gastos en vez de mandar todo a HE', () => {
    // Lote 43, orden 848 (DIP): el electro completo con la matricula del medico.
    // Antes del arreglo los 18699.95 iban enteros a honorarios.
    const r = resolverImportesLiquidacion({
        codigoPractica: '170101',
        modulo: null,
        clasificacionAgrupacion: 'HE+GA',
        titularModular: 'HONORARIO ESPECIALISTA + DERECHOS',
        efectorMatricula: 1767,
        importeTotal: 18699.95,
        cantidad: 1,
        valoresNomenclador: ELECTRO,
    })

    assert.equal(r.importeHonorarios, 15149.63)
    assert.equal(r.importeGastos, 3550.32)
    assert.equal(r.importeHonorarios + r.importeGastos, 18699.95)
})

test('la linea sin etiqueta cuyo importe es la suma tambien se reparte', () => {
    // Lote 43, orden 1376 (TARTALOS): 18699.95 sin modulo ni clasificacion.
    const r = resolverImportesLiquidacion({
        codigoPractica: '170101',
        modulo: null,
        clasificacionAgrupacion: null,
        efectorMatricula: 5071,
        importeTotal: 18699.95,
        cantidad: 1,
        valoresNomenclador: ELECTRO,
    })

    assert.equal(r.importeHonorarios, 15149.63)
    assert.equal(r.importeGastos, 3550.32)
})

test('la cantidad no rompe el reparto', () => {
    const r = resolverImportesLiquidacion({
        codigoPractica: '170101',
        modulo: null,
        clasificacionAgrupacion: 'HE+GA',
        efectorMatricula: 1767,
        importeTotal: 37399.90,
        cantidad: 2,
        valoresNomenclador: ELECTRO,
    })

    assert.equal(r.importeHonorarios, 30299.26)
    assert.equal(r.importeGastos, 7100.64)
})

test('una linea de un solo componente sigue yendo entera a su lado', () => {
    // Orden 1843: el HE suelto del par. No se toca.
    const soloHe = resolverImportesLiquidacion({
        codigoPractica: '170101',
        modulo: null,
        clasificacionAgrupacion: 'HE',
        efectorMatricula: 5071,
        importeTotal: 15149.63,
        cantidad: 1,
        valoresNomenclador: ELECTRO,
    })
    assert.equal(soloHe.importeHonorarios, 15149.63)
    assert.equal(soloHe.importeGastos, 0)

    // Orden 1844: el GA del mismo par, con la matricula de la clinica.
    const soloGa = resolverImportesLiquidacion({
        codigoPractica: '170101',
        modulo: null,
        clasificacionAgrupacion: 'GA',
        efectorMatricula: 9995,
        importeTotal: 3550.32,
        cantidad: 1,
        valoresNomenclador: ELECTRO,
    })
    assert.equal(soloGa.subitem, 'GA')
    assert.equal(soloGa.importeHonorarios, 0)
    assert.equal(soloGa.importeGastos, 3550.32)
})

test('la etiqueta de un componente manda aunque el importe diga otra cosa', () => {
    // Una fila marcada GA pero con el importe completo no se reparte sola: la
    // etiqueta explicita es una decision de quien facturo, no se adivina.
    assert.equal(
        porcionGastosDeLineaCombinada({
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

test('la cirugia con cuatro componentes reparte solo la parte de gastos', () => {
    // Etiqueta 'HE+HA+GA+A1' (4 filas en la base).
    const valores = {
        valorEspecialista: 500,
        valorAnestesista: 300,
        valorAyudante: 100,
        valorGastos: 100,
    }
    const r = resolverImportesLiquidacion({
        codigoPractica: '80720',
        modulo: null,
        clasificacionAgrupacion: 'HE+HA+GA+A1',
        efectorMatricula: 2032,
        importeTotal: 1000,
        cantidad: 1,
        valoresNomenclador: valores,
    })

    assert.equal(r.importeGastos, 100)
    assert.equal(r.importeHonorarios, 900)
})

test('sin desglose de gastos no se inventa un reparto', () => {
    assert.equal(
        porcionGastosDeLineaCombinada({
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

test('anestesia y patologia siguen saliendo por su circuito', () => {
    // El reparto no debe pisar la deteccion de HA/HP: esas ni entran a la liquidacion.
    const anestesia = resolverImportesLiquidacion({
        codigoPractica: '420303',
        modulo: 'HE      ',
        titularModular: 'HONORARIO ANESTESISTA',
        efectorMatricula: 6,
        importeTotal: 17000.11,
        cantidad: 1,
        valoresNomenclador: { valorEspecialista: 17000.11 },
    })
    assert.equal(anestesia.subitem, 'HA')

    const patologia = resolverImportesLiquidacion({
        codigoPractica: '150102',
        modulo: 'HP      ',
        titularModular: 'HONORARIO PATOLOGO',
        clasificacionAgrupacion: 'HP',
        efectorMatricula: 2675,
        importeTotal: 14071.09,
        cantidad: 1,
    })
    assert.equal(patologia.subitem, 'HP')
})

test('honorarios mas gastos siempre da el importe de la linea', () => {
    // Importe editado a mano en facturacion: el reparto va por proporcion, asi que
    // las dos mitades tienen que cerrar igual contra el total.
    const r = resolverImportesLiquidacion({
        codigoPractica: '170101',
        modulo: null,
        clasificacionAgrupacion: 'HE+GA',
        efectorMatricula: 1767,
        importeTotal: 20000,
        cantidad: 1,
        valoresNomenclador: ELECTRO,
    })

    assert.equal(r.importeHonorarios + r.importeGastos, 20000)
})
