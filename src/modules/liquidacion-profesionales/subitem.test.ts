import test from 'node:test'
import assert from 'node:assert/strict'

import { resolverSubitemLiquidacion } from './subitem'

// Los casos vienen de filas reales de OrdenPractica medidas contra la base.
test('la asociacion de anestesistas no se liquida como honorario especialista', () => {
    // 170 filas de la matricula 6 traen modulo "HE" con titular "HONORARIO ANESTESISTA".
    assert.equal(
        resolverSubitemLiquidacion({
            codigoPractica: '420303',
            modulo: 'HE      ',
            titularModular: 'HONORARIO ANESTESISTA',
            efectorMatricula: 6,
            importeTotal: 17000.11,
            valoresNomenclador: { valorEspecialista: 17000.11 },
        }),
        'HA'
    )
})

test('la matricula colectiva de anestesia manda aunque no venga titular', () => {
    assert.equal(
        resolverSubitemLiquidacion({
            codigoPractica: '80502',
            modulo: 'HE      ',
            titularModular: null,
            efectorMatricula: 6,
            importeTotal: 249905.69,
            valoresNomenclador: { valorEspecialista: 249905.69, valorAnestesista: 482471.4 },
        }),
        'HA'
    )
})

test('el modulo HP no cae al default HE', () => {
    assert.equal(
        resolverSubitemLiquidacion({
            codigoPractica: '150102',
            modulo: 'HP      ',
            titularModular: 'HONORARIO PATOLOGO',
            clasificacionAgrupacion: 'HP',
            efectorMatricula: 2675,
            importeTotal: 14071.09,
        }),
        'HP'
    )
})

test('patologia se detecta por el titular aunque el modulo venga vacio', () => {
    assert.equal(
        resolverSubitemLiquidacion({
            codigoPractica: '150102',
            modulo: null,
            titularModular: 'HONORARIO PATOLOGO',
            clasificacionAgrupacion: 'HP',
            efectorMatricula: 2675,
            importeTotal: 14071.09,
        }),
        'HP'
    )
})

test('el ayudante sigue resolviendo A1', () => {
    assert.equal(
        resolverSubitemLiquidacion({
            codigoPractica: '80720',
            modulo: 'A1      ',
            titularModular: 'HONORARIOS AYUDANTE',
            efectorMatricula: 995,
            importeTotal: 81409.95,
        }),
        'A1'
    )
})

test('un titular de especialista no se confunde con anestesia', () => {
    assert.equal(
        resolverSubitemLiquidacion({
            codigoPractica: '721746',
            modulo: 'A1      ',
            titularModular: 'HONORARIO ESPECIALISTA',
            efectorMatricula: 995,
            importeTotal: 13227.71,
        }),
        'A1'
    )
})

test('los gastos de la clinica siguen siendo GA', () => {
    // Fila real: el importe desempata contra el desglose del nomenclador.
    assert.equal(
        resolverSubitemLiquidacion({
            codigoPractica: '340301',
            modulo: null,
            efectorMatricula: 9110,
            importeTotal: 4432.97,
            valoresNomenclador: { valorEspecialista: 1592.64, valorGastos: 4432.97 },
        }),
        'GA'
    )
})

test('el honorario del especialista de la misma practica queda como HE', () => {
    assert.equal(
        resolverSubitemLiquidacion({
            codigoPractica: '340301',
            modulo: null,
            efectorMatricula: 9110,
            importeTotal: 1592.64,
            valoresNomenclador: { valorEspecialista: 1592.64, valorGastos: 4432.97 },
        }),
        'HE'
    )
})
