import test from 'node:test'
import assert from 'node:assert/strict'

import {
    agruparResumenPorPaciente,
    type BloqueResumenPaciente,
    type DetalleIngresoResumen,
    type LineaResumenLote,
} from './resumen-paciente'

function bloque(bloques: BloqueResumenPaciente[], indice = 0): BloqueResumenPaciente {
    const encontrado = bloques[indice]
    assert.ok(encontrado, `falta el bloque ${indice}`)
    return encontrado
}

function linea(overrides: Partial<LineaResumenLote> = {}): LineaResumenLote {
    return {
        subitem: 'HE',
        ordenNumero: 1,
        fecha: '2026-08-18T19:28:00.000Z',
        numeroAutorizacion: null,
        profesional: null,
        codigoPractica: '420101',
        cantidad: 1,
        importeEspecialista: 17000,
        importeAyudante: null,
        importeAnestesista: null,
        importeGastos: null,
        importeTotal: 17000,
        ...overrides,
    }
}

function ingreso(overrides: Partial<DetalleIngresoResumen> = {}): DetalleIngresoResumen {
    return {
        ingresoId: 404,
        pacienteId: 61917,
        numeroIngreso: 248,
        paciente: 'QUIPILDOR MARIA TERESA',
        numeroAfiliado: '6535157',
        total: 17000,
        lineas: [linea()],
        ...overrides,
    }
}

// El caso que se reporto en el lote 62: dos guardias del mismo mes, una por ingreso.
const quipildor18 = ingreso()
const quipildor28 = ingreso({
    ingresoId: 582,
    numeroIngreso: 365,
    lineas: [linea({ ordenNumero: 2892, fecha: '2026-08-28T16:36:00.000Z', numeroAutorizacion: '52297965' })],
})

test('los dos ingresos de un paciente van en un solo bloque', () => {
    const bloques = agruparResumenPorPaciente([quipildor18, quipildor28])

    assert.equal(bloques.length, 1)
    assert.deepEqual(bloque(bloques).numerosIngreso, [248, 365])
    assert.deepEqual(bloque(bloques).ingresoIds, [404, 582])
    assert.equal(bloque(bloques).total, 34000)
    assert.equal(bloque(bloques).lineas.length, 2)
})

test('las lineas del bloque salen por fecha de realizacion, no por ingreso', () => {
    // El ingreso mas nuevo entra primero: igual tiene que quedar segundo.
    const bloques = agruparResumenPorPaciente([quipildor28, quipildor18])

    assert.deepEqual(
        bloque(bloques).lineas.map((l) => l.ordenNumero),
        [1, 2892]
    )
    assert.deepEqual(bloque(bloques).numerosIngreso, [248, 365])
})

test('pacientes distintos no se mezclan y se respeta el orden de entrada', () => {
    const otro = ingreso({ ingresoId: 284, pacienteId: 64987, numeroIngreso: 168, paciente: 'PUNTANO SUAREZ ALDANA DEL VALLE' })
    const bloques = agruparResumenPorPaciente([otro, quipildor18, quipildor28])

    assert.equal(bloques.length, 2)
    assert.equal(bloque(bloques).paciente, 'PUNTANO SUAREZ ALDANA DEL VALLE')
    assert.equal(bloque(bloques, 1).paciente, 'QUIPILDOR MARIA TERESA')
})

test('sin pacienteId cada ingreso queda solo', () => {
    const bloques = agruparResumenPorPaciente([
        ingreso({ ingresoId: 900, pacienteId: null, numeroIngreso: 900 }),
        ingreso({ ingresoId: 901, pacienteId: null, numeroIngreso: 901 }),
    ])

    assert.equal(bloques.length, 2)
})

test('el afiliado se completa con el del otro ingreso si falta en el primero', () => {
    const bloques = agruparResumenPorPaciente([
        ingreso({ numeroAfiliado: null }),
        quipildor28,
    ])

    assert.equal(bloque(bloques).numeroAfiliado, '6535157')
})

test('un ingreso destildado no aporta al bloque: el padre filtra antes de agrupar', () => {
    // Se agrupa lo ya filtrado, asi que el bloque queda con un solo numero de ingreso.
    const bloques = agruparResumenPorPaciente([quipildor18])

    assert.deepEqual(bloque(bloques).numerosIngreso, [248])
    assert.equal(bloque(bloques).total, 17000)
})
