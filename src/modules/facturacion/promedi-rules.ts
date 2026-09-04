export const CODIGOS_PROMEDI_BASE = [430101, 431001, 400101, 431002, 431103, 430130] as const
export const CODIGOS_PROMEDI_BASE_SET = new Set<number>(CODIGOS_PROMEDI_BASE)

export const CODIGOS_PROMEDI_RANGOS = [
    { desde: 10101, hasta: 130304 },
    { desde: 720201, hasta: 722238 },
] as const

export const CODIGOS_EXCLUIDOS_PROMEDI_OSECAC = [70116, 70607] as const
const CODIGOS_EXCLUIDOS_PROMEDI_OSECAC_SET = new Set<number>(CODIGOS_EXCLUIDOS_PROMEDI_OSECAC)

// ACIDSAL usa los mismos codigos alcanzados que IPS pero otro porcentaje, asi que es
// una regla propia y no un alias de 'IPS'.
export type ObraSocialPromedi = 'IPS' | 'OSECAC' | 'ACIDSAL'

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

function normalizarNombreObraSocial(nombre: string | null | undefined): string {
    return normalizarTextoPromedi(nombre).replace(/[^A-Z0-9]/g, '')
}

// Porcentaje del importe que se factura en el resumen, por regla.
export const PORCENTAJE_PROMEDI: Record<ObraSocialPromedi, number> = {
    IPS: 0.36,
    OSECAC: 0.20,
    ACIDSAL: 0.13,
}

export function esObraSocialIps(nombre: string | null | undefined): boolean {
    const limpio = normalizarNombreObraSocial(nombre)
    return limpio.includes('IPS') || limpio.includes('IPSS')
}

export function esObraSocialOsecac(nombre: string | null | undefined): boolean {
    const limpio = normalizarNombreObraSocial(nombre)
    return limpio.includes('OSECAC') || limpio.includes('OBRASOCIALEMPLEADOSDECOMERCIO')
}

export function esObraSocialAcidsal(nombre: string | null | undefined): boolean {
    return normalizarNombreObraSocial(nombre).includes('ACIDSAL')
}

// La regla nombra el tratamiento, no la obra social: ACIDSAL alcanza los mismos codigos
// que IPS (sin las exclusiones de OSECAC) pero se factura al 13% en vez del 36%, asi que
// tiene regla propia. Devuelve null cuando la obra social no tiene regla de promedi.
export function resolverReglaPromedi(nombre: string | null | undefined): ObraSocialPromedi | null {
    if (esObraSocialOsecac(nombre)) return 'OSECAC'
    if (esObraSocialAcidsal(nombre)) return 'ACIDSAL'
    if (esObraSocialIps(nombre)) return 'IPS'
    return null
}

export function porcentajePromediPorObra(obraSocial: ObraSocialPromedi): number {
    return PORCENTAJE_PROMEDI[obraSocial]
}

// El resumen impreso tiene que dejar constancia de que los importes ya salieron
// ajustados: sin esto, un lote con promedi y uno sin promedi se imprimen iguales.
export function etiquetaPromediAplicado(regla: ObraSocialPromedi | null): string {
    if (!regla) return 'PROMEDI aplicado'
    return `PROMEDI aplicado (${regla} ${Math.round(porcentajePromediPorObra(regla) * 100)}%)`
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
    // Etiqueta de componentes de la fila ('HE+GA', 'GA', ...). Cuando trae varios
    // tokens la fila cobra la practica completa y hay que repartirla: ver
    // repartirLineaCombinada. `modulo` sirve para lo mismo pero muchas filas lo
    // tienen vacio, asi que se miran los dos.
    clasificacionAgrupacion?: string | null
    // Necesaria solo para detectar filas combinadas sin etiqueta: el importe viene
    // multiplicado por la cantidad y el desglose del nomenclador es unitario.
    cantidad?: number | null
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
//
// El desglose del nomenclador es unitario y el importe de la fila viene multiplicado
// por la cantidad, asi que la comparacion se hace contra el unitario. Sin esto una
// fila x2 no matchea ningun componente y cae al default por matricula: el honorario
// de una radiografia cargada x2 con la matricula de la clinica terminaba contado
// como gasto.
function resolverSubitemPorImporte(linea: LineaSubitemPromedi): SubitemPromedi | null {
    const importeLinea = linea.importeTotal
    const valores = linea.valoresNomenclador
    if (importeLinea == null || !Number.isFinite(importeLinea) || valores == null) return null

    const cantidad = Number(linea.cantidad ?? 1)
    const importe =
        Number.isFinite(cantidad) && cantidad > 0 ? importeLinea / cantidad : importeLinea

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
    // ACIDSAL comparte los codigos alcanzados con IPS: lo unico propio es el porcentaje.
    return obraSocial === 'OSECAC'
        ? aplicaPromediOsecac(codigoPractica)
        : aplicaPromediIPS(codigoPractica)
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
// ============================================
// FILAS COMBINADAS (varios componentes en la misma linea)
// ============================================

/**
 * Una fila que cobra la practica completa, no un componente suelto.
 *
 * `resolverSubitemPromedi` devuelve UN subitem por fila, y quien lo consume asumia
 * que el importe entero pertenecia a ese subitem. Eso vale cuando cada componente
 * es una fila propia, que es como carga la app al tildar los componentes por
 * separado. Pero hay filas que cobran todo junto: unas con etiqueta explicita
 * ('HE+GA', 'HE+HA+GA+A1') y otras sin ninguna, donde el importe es exactamente la
 * suma del desglose. En esas el resolver no encuentra el componente y cae al
 * default por matricula, asi que los gastos de la clinica terminan contados como
 * honorario del medico.
 *
 * Estas funciones reparten el importe entre los componentes que la fila cobra.
 */

const TOLERANCIA_IMPORTE_COMBINADA = 0.05

export type RepartoComponentes = {
    especialista: number
    ayudante: number
    anestesista: number
    gastos: number
}

type ValorPorToken = { token: string; valor: number | null | undefined }

function redondear2Promedi(valor: number): number {
    return Math.round(valor * 100) / 100
}

function valorDeToken(
    token: string,
    valores: ValoresNomencladorSubitem
): number | null | undefined {
    if (token === 'GA') return valores.valorGastos
    if (token === 'HE') return valores.valorEspecialista
    if (token === 'HA') return valores.valorAnestesista
    if (token === 'A1' || token === 'A2' || token === 'A3') return valores.valorAyudante
    return null
}

/** Tokens de la etiqueta ('HE+GA' -> ['HE','GA']). Vacio si no hay etiqueta compuesta. */
function tokensEtiqueta(linea: LineaSubitemPromedi): string[] {
    const etiqueta =
        normalizarTextoPromedi(linea.clasificacionAgrupacion) || normalizarTextoPromedi(linea.modulo)
    if (!etiqueta.includes('+')) return []
    return etiqueta
        .split('+')
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
}

/**
 * Componentes que cobra la fila, o null si cobra uno solo.
 *
 * Dos senales, en este orden:
 * 1. La etiqueta (`clasificacionAgrupacion` o `modulo`) trae varios tokens.
 * 2. Sin etiqueta: el importe unitario coincide con la suma de TODO el desglose.
 *    Es el caso de las filas que quedaron sin marcar.
 */
function componentesDeLinea(linea: LineaSubitemPromedi): ValorPorToken[] | null {
    const valores = linea.valoresNomenclador
    if (!valores) return null

    const tokens = tokensEtiqueta(linea)
    if (tokens.length > 1) {
        return tokens.map((token) => ({ token, valor: valorDeToken(token, valores) }))
    }

    // Solo se infiere cuando la fila no declara nada: si trae etiqueta de un
    // componente, esa manda aunque el importe diga otra cosa.
    if (tokens.length > 0) return null
    if (normalizarTextoPromedi(linea.clasificacionAgrupacion) || normalizarTextoPromedi(linea.modulo)) {
        return null
    }

    const importe = linea.importeTotal
    if (importe == null || !Number.isFinite(importe)) return null

    const todos: ValorPorToken[] = [
        { token: 'GA', valor: valores.valorGastos },
        { token: 'HE', valor: valores.valorEspecialista },
        { token: 'HA', valor: valores.valorAnestesista },
        { token: 'A1', valor: valores.valorAyudante },
    ].filter((c) => c.valor != null && Number.isFinite(c.valor) && c.valor !== 0)

    if (todos.length < 2) return null

    const cantidad = Number(linea.cantidad ?? 1) || 1
    const suma = todos.reduce((acc, c) => acc + Number(c.valor), 0)
    if (Math.abs(importe / cantidad - suma) >= TOLERANCIA_IMPORTE_COMBINADA) return null

    return todos
}

/**
 * Reparte el importe de una fila combinada entre sus componentes, o null si la fila
 * cobra uno solo y no hay nada que repartir.
 *
 * Va por proporcion del desglose y no por el valor absoluto del nomenclador: asi la
 * suma de las partes da exactamente el importe de la fila aunque la hayan editado a
 * mano en facturacion. El sobrante del redondeo queda en el componente mas grande.
 */
export function repartirLineaCombinada(linea: LineaSubitemPromedi): RepartoComponentes | null {
    const componentes = componentesDeLinea(linea)
    if (!componentes) return null

    const conValor = componentes.filter(
        (c) => c.valor != null && Number.isFinite(c.valor) && Number(c.valor) > 0
    )
    // Con un solo componente valorizado no hay reparto posible: queda como estaba.
    if (conValor.length < 2) return null

    const importe = linea.importeTotal
    if (importe == null || !Number.isFinite(importe) || importe <= 0) return null

    const totalValores = conValor.reduce((acc, c) => acc + Number(c.valor), 0)
    if (totalValores <= 0) return null

    const reparto: RepartoComponentes = { especialista: 0, ayudante: 0, anestesista: 0, gastos: 0 }
    const claveDe = (token: string): keyof RepartoComponentes =>
        token === 'GA' ? 'gastos'
            : token === 'HA' ? 'anestesista'
                : token === 'HE' ? 'especialista'
                    : 'ayudante'

    for (const c of conValor) {
        reparto[claveDe(c.token)] += redondear2Promedi(importe * (Number(c.valor) / totalValores))
    }

    // El redondeo de cada parte puede dejar uno o dos centavos sueltos. Van al
    // componente mas grande para que la suma cierre contra el importe de la fila.
    const sumado = reparto.especialista + reparto.ayudante + reparto.anestesista + reparto.gastos
    const resto = redondear2Promedi(importe - sumado)
    if (resto !== 0) {
        const mayor = conValor.reduce((a, b) => (Number(a.valor) >= Number(b.valor) ? a : b))
        reparto[claveDe(mayor.token)] = redondear2Promedi(reparto[claveDe(mayor.token)] + resto)
    }

    return reparto
}
