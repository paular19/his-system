export const CODIGOS_PROMEDI_BASE = [430101, 431001, 400101, 431002, 431103, 430130] as const
export const CODIGOS_PROMEDI_BASE_SET = new Set<number>(CODIGOS_PROMEDI_BASE)

export const CODIGOS_PROMEDI_RANGOS = [
    { desde: 10101, hasta: 130304 },
    { desde: 720201, hasta: 722238 },
] as const

export const CODIGOS_EXCLUIDOS_PROMEDI_OSECAC = [70116, 70607] as const
const CODIGOS_EXCLUIDOS_PROMEDI_OSECAC_SET = new Set<number>(CODIGOS_EXCLUIDOS_PROMEDI_OSECAC)

export type ObraSocialPromedi = 'IPS' | 'OSECAC'

// El PROMEDI solo golpea los gastos (GA). Los honorarios (HE/HA) y los ayudantes
// (A1/A2/A3) quedan afuera, salvo para el 400101 que impacta todos los subitems.
export const CODIGO_PROMEDI_TODOS_LOS_SUBITEMS = 400101

export type SubitemPromedi = 'HE' | 'HA' | 'GA' | 'A1' | 'A2' | 'A3'

function normalizarTextoPromedi(value: string | null | undefined): string {
    return (value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
}

// La clinica se factura a si misma los gastos con dos matriculas propias: 9995
// ("CLINICA SAN RAFAEL", internacion) y 9110 ("SAN RAFAEL S.A. MP CMS", ambulatorio).
// Es la misma columna "Mat." que imprime el resumen del sistema anterior.
export const MATRICULAS_CLINICA = [9995, 9110] as const
const MATRICULAS_CLINICA_SET = new Set<number>(MATRICULAS_CLINICA)

// La clinica tambien aparece por nombre cuando la linea no trae matricula. Se compara
// sin espacios ni puntuacion porque conviven "SAN RAFAEL S.A." y "SAN RAFAEL SA".
const MARCADORES_PROFESIONAL_CLINICA = ['CLINICASANRAFAEL', 'SANRAFAELSA'] as const

export function esMatriculaClinica(matricula: number | null | undefined): boolean {
    return matricula != null && MATRICULAS_CLINICA_SET.has(matricula)
}

export function esProfesionalClinica(profesional: string | null | undefined): boolean {
    const limpio = normalizarTextoPromedi(profesional).replace(/[^A-Z0-9]/g, '')
    if (!limpio) return false
    return MARCADORES_PROFESIONAL_CLINICA.some((marcador) => limpio.includes(marcador))
}

// Valores por componente del nomenclador (NPractica). Sirven para desempatar cuando
// una practica se partio en varias filas y ninguna quedo con el modulo cargado: el
// importe de cada fila es una copia del valor del componente que representa.
export type ValoresNomencladorSubitem = {
    valorEspecialista?: number | null
    valorAnestesista?: number | null
    valorAyudante?: number | null
    valorGastos?: number | null
}

export type LineaSubitemPromedi = {
    codigoPractica?: string | null
    modulo?: string | null
    // Matricula del efector de la linea (OrdenPractica.efectorMatricula). Es la senal
    // mas confiable: el modulo viene vacio en la mayoria de las filas.
    efectorMatricula?: number | null
    // Profesional de la orden (el prescriptor). Solo sirve de respaldo: no identifica
    // al efector de cada linea, asi que nunca debe pisar a la matricula.
    profesional?: string | null
    // Importe de la linea y desglose del nomenclador. Juntos identifican el componente
    // cuando el modulo esta vacio; sueltos no sirven de nada.
    importeTotal?: number | null
    valoresNomenclador?: ValoresNomencladorSubitem | null
}

// Tolerancia de centavo: los importes se guardan con 2 decimales en Decimal(12,2) y
// el valor del nomenclador en Decimal(18,2), asi que la comparacion es exacta salvo
// por el redondeo del binario al pasar por Number.
const TOLERANCIA_IMPORTE_SUBITEM = 0.005

// Compara el importe de la linea contra cada componente del nomenclador. Solo resuelve
// si matchea UNO solo: si dos componentes valen lo mismo el importe no desempata y hay
// que seguir con las senales de abajo.
function resolverSubitemPorImporte(linea: LineaSubitemPromedi): SubitemPromedi | null {
    const importe = linea.importeTotal
    const valores = linea.valoresNomenclador
    if (importe == null || !Number.isFinite(importe) || valores == null) return null

    const candidatos: Array<[SubitemPromedi, number | null | undefined]> = [
        ['GA', valores.valorGastos],
        ['HE', valores.valorEspecialista],
        ['HA', valores.valorAnestesista],
        ['A1', valores.valorAyudante],
    ]

    const matches = candidatos.filter(
        ([, valor]) =>
            valor != null &&
            Number.isFinite(valor) &&
            Math.abs(valor - importe) < TOLERANCIA_IMPORTE_SUBITEM
    )

    return matches.length === 1 ? matches[0]![0] : null
}

// El subitem no viene en una columna propia. Se resuelve por prioridad: modulo
// explicito, despues el importe contra el desglose del nomenclador, despues la
// matricula del efector, y recien al final el nombre del profesional o el codigo.
export function resolverSubitemPromedi(linea: LineaSubitemPromedi): SubitemPromedi {
    const codigoNorm = normalizarTextoPromedi(linea.codigoPractica)
    const moduloNorm = normalizarTextoPromedi(linea.modulo)

    if (moduloNorm.includes('A1')) return 'A1'
    if (moduloNorm.includes('A2')) return 'A2'
    if (moduloNorm.includes('A3')) return 'A3'
    if (moduloNorm.includes('HE')) return 'HE'
    if (moduloNorm.includes('HA')) return 'HA'
    if (moduloNorm.includes('GA')) return 'GA'

    // Sin modulo: si el importe coincide con un unico componente del nomenclador, ese
    // es el subitem. Es la unica senal que distingue dos filas de la misma practica
    // emitidas con la misma matricula (gastos + honorario de una radiografia, por ej).
    const porImporte = resolverSubitemPorImporte(linea)
    if (porImporte) return porImporte

    // Sin modulo ni desempate por importe: la linea es un gasto si la factura la
    // clinica, y un honorario si la factura un medico con matricula propia.
    if (linea.efectorMatricula != null) {
        return esMatriculaClinica(linea.efectorMatricula) ? 'GA' : 'HE'
    }

    const profesionalNorm = normalizarTextoPromedi(linea.profesional)
    if (profesionalNorm.includes('ANEST')) return 'HA'
    if (esProfesionalClinica(linea.profesional)) return 'GA'

    if (codigoNorm.includes('A1')) return 'A1'
    if (codigoNorm.includes('A2')) return 'A2'
    if (codigoNorm.includes('A3')) return 'A3'
    if (codigoNorm.includes('HA')) return 'HA'
    if (codigoNorm.includes('GA')) return 'GA'

    return 'HE'
}

export function codigoImpactaTodosLosSubitems(codigoPractica: string | null | undefined): boolean {
    return parseCodigoPromedi(codigoPractica) === CODIGO_PROMEDI_TODOS_LOS_SUBITEMS
}

export function subitemEntraEnPromedi(
    codigoPractica: string | null | undefined,
    subitem: SubitemPromedi
): boolean {
    if (codigoImpactaTodosLosSubitems(codigoPractica)) return true
    return subitem === 'GA'
}

function redondear2(valor: number): number {
    return Math.round((valor + Number.EPSILON) * 100) / 100
}

export function parseCodigoPromedi(codigo: string | null | undefined): number | null {
    const soloDigitos = (codigo ?? '').replace(/[^0-9]/g, '')
    if (!soloDigitos) return null
    const parsed = Number.parseInt(soloDigitos, 10)
    return Number.isNaN(parsed) ? null : parsed
}

export function codigoEnRangoPromedi(codigo: number): boolean {
    return CODIGOS_PROMEDI_RANGOS.some(({ desde, hasta }) => codigo >= desde && codigo <= hasta)
}

export function aplicaPromediIPS(codigoPractica: string | null | undefined): boolean {
    const codigo = parseCodigoPromedi(codigoPractica)
    if (codigo === null) return false
    return CODIGOS_PROMEDI_BASE_SET.has(codigo) || codigoEnRangoPromedi(codigo)
}

export function aplicaPromediOsecac(codigoPractica: string | null | undefined): boolean {
    const codigo = parseCodigoPromedi(codigoPractica)
    if (codigo === null) return false
    if (CODIGOS_EXCLUIDOS_PROMEDI_OSECAC_SET.has(codigo)) return false
    return CODIGOS_PROMEDI_BASE_SET.has(codigo) || codigoEnRangoPromedi(codigo)
}

export function aplicaPromediPorObra(
    codigoPractica: string | null | undefined,
    obraSocial: ObraSocialPromedi
): boolean {
    return obraSocial === 'IPS' ? aplicaPromediIPS(codigoPractica) : aplicaPromediOsecac(codigoPractica)
}

// Una linea entra al resumen si su codigo esta alcanzado por la regla Y ademas es un
// gasto (GA). El 400101 es la excepcion: impacta todos los subitems.
export function aplicaPromediPorObraYSubitem(
    codigoPractica: string | null | undefined,
    obraSocial: ObraSocialPromedi,
    subitem: SubitemPromedi
): boolean {
    if (!aplicaPromediPorObra(codigoPractica, obraSocial)) return false
    return subitemEntraEnPromedi(codigoPractica, subitem)
}

export function calcularImportePromediPorCodigo(
    codigoPractica: string | null | undefined,
    importeTotal: number,
    porcentajePromedi: number,
    obraSocial: ObraSocialPromedi,
    subitem: SubitemPromedi
): number {
    const importeBase = Number.isFinite(importeTotal) ? redondear2(importeTotal) : 0
    // Lo que no esta alcanzado por la regla no entra al resumen: no se factura.
    if (!aplicaPromediPorObraYSubitem(codigoPractica, obraSocial, subitem)) {
        return 0
    }

    const porcentajeNormalizado = Math.abs(porcentajePromedi) > 1 ? porcentajePromedi / 100 : porcentajePromedi
    return redondear2(importeBase * porcentajeNormalizado)
}