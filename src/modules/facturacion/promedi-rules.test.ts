import test from 'node:test'
import assert from 'node:assert/strict'

import {
  aplicaPromediIPS,
  aplicaPromediOsecac,
  calcularImportePromediPorCodigo,
  esMatriculaClinica,
  esProfesionalClinica,
  resolverSubitemPromedi,
  subitemEntraEnPromedi,
} from './promedi-rules'
import { categoriaPractica } from './categorias-practica'

test('aplica el porcentaje como fracción del importe y no como multiplicador directo', () => {
  assert.equal(
    calcularImportePromediPorCodigo('720508', 644743.43, 20, 'OSECAC', 'GA'),
    128948.69
  )

  assert.equal(
    calcularImportePromediPorCodigo('720329', 113537.07, 20, 'OSECAC', 'GA'),
    22707.41
  )
})

test('reconoce que codigos entran al resumen de la planilla IPS', () => {
  // Cama acompanante, oxigeno, radiografias, ecografias y 431101: fuera del resumen.
  for (const codigo of ['430106', '430701', '340301', '180116', '431101']) {
    assert.equal(aplicaPromediIPS(codigo), false)
  }

  // Codigos alcanzados: 36% sobre el bruto del subitem de gastos.
  assert.equal(calcularImportePromediPorCodigo('430101', 4435692.52, 36, 'IPS', 'GA'), 1596849.31)
  assert.equal(calcularImportePromediPorCodigo('080304', 332082.01, 36, 'IPS', 'GA'), 119549.52)
})

test('lo que queda fuera de la regla no se factura', () => {
  // IPS: oxigeno, radiografia, ecografia, guardia, cama acompanante y 431101.
  for (const codigo of ['430701', '340301', '180116', '420101', '430106', '431101']) {
    assert.equal(calcularImportePromediPorCodigo(codigo, 100000, 36, 'IPS', 'GA'), 0)
  }

  // OSECAC: ademas 70116 y 70607 quedan excluidos aunque caigan en rango.
  assert.equal(aplicaPromediOsecac('070116'), false)
  assert.equal(aplicaPromediOsecac('070607'), false)
  assert.equal(calcularImportePromediPorCodigo('070116', 112278.31, 20, 'OSECAC', 'GA'), 0)
  assert.equal(calcularImportePromediPorCodigo('070607', 50000, 20, 'OSECAC', 'GA'), 0)
  assert.equal(calcularImportePromediPorCodigo('169006', 2943320.04, 20, 'OSECAC', 'GA'), 0)
})

test('el promedi solo golpea gastos, salvo el 400101 que impacta todos los subitems', () => {
  // Un codigo alcanzado por la regla: solo su subitem de gastos entra al resumen.
  assert.equal(calcularImportePromediPorCodigo('720329', 100000, 20, 'OSECAC', 'GA'), 20000)
  for (const subitem of ['HE', 'HA', 'A1', 'A2', 'A3'] as const) {
    assert.equal(calcularImportePromediPorCodigo('720329', 100000, 20, 'OSECAC', subitem), 0)
    assert.equal(subitemEntraEnPromedi('720329', subitem), false)
  }

  // El 400101 es la excepcion: impacta todos los subitems.
  for (const subitem of ['GA', 'HE', 'HA', 'A1', 'A2', 'A3'] as const) {
    assert.equal(subitemEntraEnPromedi('400101', subitem), true)
    assert.equal(calcularImportePromediPorCodigo('400101', 100000, 36, 'IPS', subitem), 36000)
  }

  // El padding del codigo no debe romper la excepcion.
  assert.equal(subitemEntraEnPromedi('400101  ', 'HE'), true)
})

test('el modulo explicito manda sobre la matricula', () => {
  assert.equal(resolverSubitemPromedi({ codigoPractica: '720329', modulo: 'GA      ', efectorMatricula: 2032 }), 'GA')
  assert.equal(resolverSubitemPromedi({ codigoPractica: '720329', modulo: 'HE      ', efectorMatricula: 9995 }), 'HE')
  assert.equal(resolverSubitemPromedi({ codigoPractica: '720329', modulo: 'A1      ', efectorMatricula: 995 }), 'A1')
  assert.equal(resolverSubitemPromedi({ codigoPractica: '720329', modulo: 'HA      ', efectorMatricula: 6 }), 'HA')
})

test('sin modulo, el subitem sale de la matricula del efector', () => {
  // 9995 y 9110 son las dos matriculas propias de la clinica: son gastos.
  assert.equal(resolverSubitemPromedi({ codigoPractica: '720329', modulo: null, efectorMatricula: 9995 }), 'GA')
  assert.equal(resolverSubitemPromedi({ codigoPractica: '720329', modulo: null, efectorMatricula: 9110 }), 'GA')
  assert.equal(esMatriculaClinica(9995), true)
  assert.equal(esMatriculaClinica(9110), true)
  assert.equal(esMatriculaClinica(2032), false)
  assert.equal(esMatriculaClinica(null), false)

  // Una matricula de medico es honorario y queda fuera del promedi.
  assert.equal(resolverSubitemPromedi({ codigoPractica: '720329', modulo: null, efectorMatricula: 2032 }), 'HE')
  assert.equal(
    subitemEntraEnPromedi('720329', resolverSubitemPromedi({ codigoPractica: '720329', efectorMatricula: 2032 })),
    false
  )

  // El prescriptor de la orden no debe pisar a la matricula de la linea.
  assert.equal(
    resolverSubitemPromedi({ codigoPractica: '720329', efectorMatricula: 9995, profesional: 'ALBORNOZ JUAN JOSE' }),
    'GA'
  )
  assert.equal(
    resolverSubitemPromedi({ codigoPractica: '720329', efectorMatricula: 2032, profesional: 'CLINICA SAN RAFAEL' }),
    'HE'
  )
})

test('sin modulo ni matricula, se cae al nombre del profesional', () => {
  assert.equal(resolverSubitemPromedi({ codigoPractica: '720329', profesional: 'CLINICA SAN RAFAEL' }), 'GA')
  assert.equal(resolverSubitemPromedi({ codigoPractica: '720329', profesional: 'CLÍNICA SAN RAFAEL' }), 'GA')
  assert.equal(resolverSubitemPromedi({ codigoPractica: '720329', profesional: 'SAN RAFAEL S.A. MP CMS' }), 'GA')
  assert.equal(resolverSubitemPromedi({ codigoPractica: '720329', profesional: 'ANESTESISTA GUARDIA' }), 'HA')
  assert.equal(esProfesionalClinica('SAN RAFAEL S.A. MP CMS'), true)
  assert.equal(esProfesionalClinica('ALBORNOZ JUAN JOSE'), false)
  assert.equal(esProfesionalClinica(null), false)

  // Sin ninguna senal, la linea es honorario de especialista.
  assert.equal(resolverSubitemPromedi({ codigoPractica: '720329', profesional: 'ALBORNOZ JUAN JOSE' }), 'HE')
})

// Lineas copiadas del resumen 769 (OSECAC, julio 2026) del sistema anterior.
test('reproduce los importes del resumen 769 del sistema anterior', () => {
  const linea = (codigo: string, bruto: number, matricula: number) =>
    calcularImportePromediPorCodigo(
      codigo,
      bruto,
      20,
      'OSECAC',
      resolverSubitemPromedi({ codigoPractica: codigo, efectorMatricula: matricula })
    )

  // AGUERO: 430101 x5 y 431001 x5, ambos GA 9995.
  assert.equal(linea('430101', 792087.95, 9995), 158417.59)
  assert.equal(linea('431001', 53422.35, 9995), 10684.47)

  // CATALANO: cirugias facturadas por la clinica, no por el cirujano.
  assert.equal(linea('720606', 406787.18, 9995), 81357.44)
  assert.equal(linea('721213', 335615.52, 9995), 67123.10)

  // GUINART: el 400101 impacta GA y HE, y suma 405.551,32.
  assert.equal(linea('400101', 1890403.85, 9995), 378080.77)
  assert.equal(linea('400101', 137352.75, 3865), 27470.55)
  assert.equal(linea('400101', 1890403.85, 9995) + linea('400101', 137352.75, 3865), 405551.32)

  // ARGUELLO: mismo 400101 con cantidad 1.
  assert.equal(linea('400101', 378080.77, 9995) + linea('400101', 27470.55, 3865), 81110.26)
})

test('las categorias de filtro reconocen los codigos de los lotes reales', () => {
  assert.equal(categoriaPractica('430701'), 'OXIGENO')
  assert.equal(categoriaPractica('420101'), 'GUARDIA')
  for (const codigo of ['340301', '340302', '340905', '340421', '340209', '340211', '340907']) {
    assert.equal(categoriaPractica(codigo), 'RADIOGRAFIA')
  }
  for (const codigo of ['180112', '180114', '180116', '180120', '180126', '180130']) {
    assert.equal(categoriaPractica(codigo), 'ECOGRAFIA')
  }
  // La T.A.C. no es radiografia; los codigos de promedi no tienen categoria.
  assert.equal(categoriaPractica('341012'), null)
  assert.equal(categoriaPractica('430101'), null)
})
