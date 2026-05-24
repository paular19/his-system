import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type {
    ActualizarAutorizacionInput,
    ActualizarContextoFacturacionInput,
    ActualizarDiferencialesCirugiaFacturacionInput,
    ActualizarLoteFacturacionInput,
    ActualizarPrestacionFacturacionInput,
    BusquedaFacturacionInput,
    BusquedaLotesInput,
    CargarOrdenesFacturacionInput,
    CrearLoteFacturacionInput,
    CrearLoteIPSTxtInput,
    CrearDescartableFacturacionInput,
    CrearMedicacionFacturacionInput,
    CrearPracticaFacturacionInput,
} from './schemas'
import type {
    AdmisionFacturacionListItem,
    EstadoLote,
    FacturacionContexto,
    LoteFacturacionDetalle,
    LoteFacturacionItemDetalle,
    LoteFacturacionListItem,
    LotePracticaFacturadaProfesionalItem,
    LoteIPSTxtItemDetalle,
    OrdenAutorizadaLote,
    OrdenFacturacionResultado,
    PrestacionFacturableItem,
} from './types'
import { calcularImporteFacturable, resolverReglaFacturacion } from './cobertura'
import { aplicarDiferencialesAValores, tieneDiferencialesActivos } from './diferenciales'

const MATRICULA_AMBULATORIO_DEFAULT = 9110
const NOMBRE_MATRICULA_9110_DEFAULT = 'CLINICA SAN RAFAEL'
const MATRICULA_ANESTESISTA_INT_DEFAULT = 6
const MATRICULA_AYUDANTE_INT_DEFAULT = 995
const NOMBRE_MATRICULA_6_DEFAULT = 'ASOSIACION ANESTESISTA'
const NOMBRE_MATRICULA_995_DEFAULT = 'PROFESIONAL AYUDANTE'
const CODIGOS_HA_OBLIGATORIO = new Set(['169006'])
const CODIGOS_HE_CON_OPCION_HA = new Set(['420303'])

function normalizarCodigoPractica(codigoPractica: string): string {
    return codigoPractica.trim().slice(0, 8).toUpperCase()
}

function normalizarTextoComparacion(value: string | null | undefined): string {
    return (value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
}

function normalizarTextoSoloAlfanumerico(value: string | null | undefined): string {
    return normalizarTextoComparacion(value).replace(/[^A-Z0-9]/g, '')
}

function esObraSocialOsecac(nombre: string | null | undefined): boolean {
    const limpio = normalizarTextoSoloAlfanumerico(nombre)
    return limpio.includes('OSECAC') || limpio.includes('OBRASOCIALEMPLEADOSDECOMERCIO')
}

function descripcionEsAnestesista(descripcion: string | null | undefined): boolean {
    const text = normalizarTextoComparacion(descripcion)
    return text.includes('ANEST') || text.includes('[ANE')
}

function descripcionEsAyudante(descripcion: string | null | undefined): boolean {
    const text = normalizarTextoComparacion(descripcion)
    return text.includes('AYUD') || text.includes('×AYU') || text.includes(' AYU')
}

function descripcionEsGasto(descripcion: string | null | undefined): boolean {
    const text = normalizarTextoComparacion(descripcion)
    return text.includes('GTO') || text.includes('GASTO') || text.includes('GASTOS')
}

function esCodigoHaObligatorio(codigoPractica: string | null | undefined): boolean {
    if (!codigoPractica) return false
    return CODIGOS_HA_OBLIGATORIO.has(normalizarCodigoPractica(codigoPractica))
}

function esCodigoHeConOpcionHa(codigoPractica: string | null | undefined): boolean {
    if (!codigoPractica) return false
    return CODIGOS_HE_CON_OPCION_HA.has(normalizarCodigoPractica(codigoPractica))
}

type DesgloseValores = {
    valorEspecialista: number | null
    valorAyudante: number | null
    valorAnestesista: number | null
    valorGastos: number | null
}

type IncluyeCodigoSeleccion = {
    especialista: boolean
    anestesista: boolean
    gastos: boolean
    ayudantes: number
}

function aplicarOverrideEspecialAnestesistaPorCodigo(
    codigoPractica: string | null | undefined,
    desglose: DesgloseValores
): DesgloseValores {
    if (esCodigoHaObligatorio(codigoPractica)) {
        return {
            ...desglose,
            valorEspecialista: null,
            valorAnestesista: desglose.valorAnestesista ?? desglose.valorEspecialista,
        }
    }

    if (esCodigoHeConOpcionHa(codigoPractica)) {
        return {
            ...desglose,
            valorAnestesista: desglose.valorAnestesista ?? desglose.valorEspecialista,
        }
    }

    return desglose
}

function normalizarIncluyeCodigo(incluyeCodigo: string | null | undefined): string | null {
    const normalized = (incluyeCodigo ?? '').trim().toUpperCase()
    if (!normalized || normalized === 'COMPLETA') return null

    const parts = normalized
        .split('+')
        .map((part) => part.trim())
        .filter((part) => /^(GA|HE|HA|A[1-3])$/.test(part))

    if (parts.length === 0) return null
    return Array.from(new Set(parts)).join('+')
}

function combinarIncluyeCodigos(
    actual: string | null | undefined,
    siguiente: string | null | undefined
): string | null {
    const a = desglosarIncluyeCodigo(actual)
    const b = desglosarIncluyeCodigo(siguiente)
    if (!a && !b) return null

    const especialista = Boolean(a?.especialista || b?.especialista)
    const anestesista = Boolean(a?.anestesista || b?.anestesista)
    const gastos = Boolean(a?.gastos || b?.gastos)
    const ayudantes = Math.min(3, (a?.ayudantes ?? 0) + (b?.ayudantes ?? 0))

    const tokens: string[] = []
    if (gastos) tokens.push('GA')
    if (especialista) tokens.push('HE')
    if (anestesista) tokens.push('HA')
    for (let i = 1; i <= ayudantes; i += 1) {
        tokens.push(`A${i}`)
    }

    return tokens.length > 0 ? tokens.join('+') : null
}

function combinarMatricula(
    actual: number | null | undefined,
    siguiente: number | null | undefined
): number | null {
    const a = actual ?? null
    const b = siguiente ?? null
    if (a == null) return b
    if (b == null) return a

    // Prefer real interviniente matriculas over known fallback defaults.
    const defaults = new Set([
        MATRICULA_AMBULATORIO_DEFAULT,
        MATRICULA_AYUDANTE_INT_DEFAULT,
        MATRICULA_ANESTESISTA_INT_DEFAULT,
    ])
    if (defaults.has(a) && !defaults.has(b)) return b
    return a
}

function desglosarIncluyeCodigo(incluyeCodigo: string | null | undefined): IncluyeCodigoSeleccion | null {
    const normalized = normalizarIncluyeCodigo(incluyeCodigo)
    if (!normalized) return null

    const parts = normalized.split('+')
    return {
        especialista: parts.includes('HE'),
        anestesista: parts.includes('HA'),
        gastos: parts.includes('GA'),
        ayudantes: parts.filter((part) => /^A[1-3]$/.test(part)).length,
    }
}

function esSeleccionSoloGastos(seleccion: IncluyeCodigoSeleccion | null | undefined): boolean {
    if (!seleccion) return false
    return seleccion.gastos && !seleccion.especialista && !seleccion.anestesista && seleccion.ayudantes === 0
}

function esTituloAnestesista(titularModular: string | null | undefined): boolean {
    return normalizarTextoComparacion(titularModular).includes('ANEST')
}

function esTituloPatologia(titularModular: string | null | undefined): boolean {
    return normalizarTextoComparacion(titularModular).includes('PATOLOG')
}

function resolverNombreEfectorFallback(params: {
    titularModular: string | null | undefined
    descripcionPatologia: string | null | undefined
    matricula: number
}): string {
    if (params.matricula === MATRICULA_AMBULATORIO_DEFAULT) return NOMBRE_MATRICULA_9110_DEFAULT
    if (esTituloAnestesista(params.titularModular)) return 'ASOSIACION ANESTESISTA'
    if (esTituloPatologia(params.titularModular) && (params.descripcionPatologia ?? '').trim().length > 0) {
        return (params.descripcionPatologia ?? '').trim()
    }
    return `PROFESIONAL MAT ${params.matricula}`
}

function aplicarIncluyeCodigoADesglose(
    desglose: DesgloseValores,
    incluyeCodigo: string | null | undefined,
    codigoPractica?: string | null
): DesgloseValores {
    const seleccion = desglosarIncluyeCodigo(incluyeCodigo)
    if (!seleccion) return desglose

    const valorEspecialistaCompatible =
        desglose.valorEspecialista ??
        ((esCodigoHaObligatorio(codigoPractica) || esCodigoHeConOpcionHa(codigoPractica))
            ? desglose.valorAnestesista
            : null)

    return {
        valorEspecialista: seleccion.especialista ? valorEspecialistaCompatible : null,
        valorAyudante: seleccion.ayudantes > 0 ? desglose.valorAyudante : null,
        valorAnestesista: seleccion.anestesista ? desglose.valorAnestesista : null,
        valorGastos: seleccion.gastos ? desglose.valorGastos : null,
    }
}

function calcularTotalUnitarioDesglose(
    desglose: DesgloseValores,
    incluyeCodigo: string | null | undefined
): number {
    const seleccion = desglosarIncluyeCodigo(incluyeCodigo)
    if (!seleccion) {
        return (
            (desglose.valorEspecialista ?? 0) +
            (desglose.valorAyudante ?? 0) +
            (desglose.valorAnestesista ?? 0) +
            (desglose.valorGastos ?? 0)
        )
    }

    return (
        (seleccion.especialista ? (desglose.valorEspecialista ?? 0) : 0) +
        (seleccion.ayudantes > 0 ? (desglose.valorAyudante ?? 0) * seleccion.ayudantes : 0) +
        (seleccion.anestesista ? (desglose.valorAnestesista ?? 0) : 0) +
        (seleccion.gastos ? (desglose.valorGastos ?? 0) : 0)
    )
}

async function obtenerValoresPracticas(codigosPractica: string[]): Promise<Map<string, number>> {
    const codigos = Array.from(
        new Set(codigosPractica.map(normalizarCodigoPractica).filter(Boolean))
    )

    if (codigos.length === 0) return new Map()

    const prestaciones = await prisma.nomencladorPrestacion.findMany({
        where: { codigo: { in: codigos } },
        select: { codigo: true, valor: true },
    })

    const result = new Map(
        prestaciones.map((prestacion) => [normalizarCodigoPractica(prestacion.codigo), Number(prestacion.valor ?? 0)])
    )

    // Fallback: para códigos sin precio en el nomenclador, buscar el último precio
    // unitario conocido en prácticas ya facturadas con el mismo código.
    const sinPrecio = codigos.filter((c) => !result.has(c) || result.get(c) === 0)
    if (sinPrecio.length > 0) {
        const codigosConEspacio = sinPrecio.map((c) => c.padEnd(8, ' '))
        const historicos = await prisma.practica.findMany({
            where: {
                codigoPractica: { in: codigosConEspacio },
                importeTotal: { not: null, gt: 0 },
                cantidad: { gt: 0 },
            },
            orderBy: { id: 'desc' },
            select: { codigoPractica: true, importeTotal: true, cantidad: true },
            take: sinPrecio.length * 10,
        })

        for (const h of historicos) {
            const clave = normalizarCodigoPractica(h.codigoPractica)
            if (!result.has(clave) || result.get(clave) === 0) {
                const precioUnitario = Number(h.importeTotal) / Number(h.cantidad)
                if (precioUnitario > 0) result.set(clave, precioUnitario)
            }
        }
    }

    return result
}

async function obtenerFallbackDesglosePorCodigo(codigosPractica: string[]): Promise<Map<string, DesgloseValores>> {
    const codigos = Array.from(
        new Set(codigosPractica.map(normalizarCodigoPractica).filter(Boolean))
    )
    if (codigos.length === 0) return new Map()

    const rows = await prisma.nomencladorPractica.findMany({
        where: {
            AND: [
                {
                    OR: codigos.map((codigo) => ({ codigo: { startsWith: codigo } })),
                },
                {
                    OR: [
                        { valorEspecialista: { not: null } },
                        { valorAyudante: { not: null } },
                        { valorAnestesista: { not: null } },
                        { valorGastos: { not: null } },
                    ],
                },
            ],
        },
        select: {
            codigo: true,
            valorEspecialista: true,
            valorAyudante: true,
            valorAnestesista: true,
            valorGastos: true,
            convenioId: true,
        },
        orderBy: [{ codigo: 'asc' }, { convenioId: 'asc' }],
    })

    const map = new Map<string, DesgloseValores>()
    for (const row of rows) {
        const codigo = normalizarCodigoPractica(row.codigo)
        if (map.has(codigo)) continue
        map.set(codigo, {
            valorEspecialista: row.valorEspecialista != null ? Number(row.valorEspecialista) : null,
            valorAyudante: row.valorAyudante != null ? Number(row.valorAyudante) : null,
            valorAnestesista: row.valorAnestesista != null ? Number(row.valorAnestesista) : null,
            valorGastos: row.valorGastos != null ? Number(row.valorGastos) : null,
        })
    }
    return map
}

export async function obtenerValorPractica(codigoPractica: string): Promise<number> {
    const valores = await obtenerValoresPracticas([codigoPractica])
    return valores.get(normalizarCodigoPractica(codigoPractica)) ?? 0
}

function precioFicticioMedicacion(nombre: string): number {
    const base = nombre.trim().length || 1
    return 3500 + (base % 15) * 180
}

function precioFicticioDescartable(nombre: string): number {
    const base = nombre.trim().length || 1
    return 1200 + (base % 12) * 90
}

function tieneNumeroAutorizacionValido(numeroAutorizacion: string | null | undefined): boolean {
    return typeof numeroAutorizacion === 'string' && numeroAutorizacion.trim().length > 0
}

function resolverNumeroAutorizacion(
    numeroAutorizacionItem: string | null | undefined,
    numeroAutorizacionOrden: string | null | undefined
): string | null {
    if (tieneNumeroAutorizacionValido(numeroAutorizacionItem)) return numeroAutorizacionItem!.trim()
    if (tieneNumeroAutorizacionValido(numeroAutorizacionOrden)) return numeroAutorizacionOrden!.trim()
    return null
}

function generarCodigoBarrasOrdenItem(puestoNumero: number, ordenNumero: number, item: number): string {
    return `${puestoNumero.toString().padStart(4, '0')}${ordenNumero.toString().padStart(8, '0')}${item.toString().padStart(3, '0')}`
}

function resolverNumeroAutorizacionOrdenItem(
    numeroAutorizacionItem: string | null | undefined,
    numeroAutorizacionOrden: string | null | undefined,
    puestoNumero: number,
    ordenNumero: number,
    item: number
): string | null {
    const authItem = numeroAutorizacionItem?.trim() ?? null
    const authOrden = numeroAutorizacionOrden?.trim() ?? null
    const codigoBarrasGenerado = generarCodigoBarrasOrdenItem(puestoNumero, ordenNumero, item)

    // If the item auth is only the autogenerated barcode, prefer the real order auth.
    if (authItem && authItem === codigoBarrasGenerado && tieneNumeroAutorizacionValido(authOrden)) {
        return authOrden
    }

    return resolverNumeroAutorizacion(authItem, authOrden)
}

type PrestacionPreparadaFacturacion = {
    practicaId: number | null
    convenioId: number
    codigoPractica: string
    cantidad: number
    incluyeCodigo?: string | null
    numeroAutorizacion?: string | null
    ordenIndice: number
}

type VinculoOrdenExistenteFacturacion = {
    puestoNumero: number
    ordenNumero: number
    item: number
}

type EstadoOrdenFacturacion = 'A' | 'X' | string

function incluyeCodigoCompatibleParaVinculo(
    incluyePrestacion: string | null | undefined,
    incluyeOrdenItem: string | null | undefined,
    codigoPractica: string
): boolean {
    const p = normalizarIncluyeCodigo(incluyePrestacion)
    const o = normalizarIncluyeCodigo(incluyeOrdenItem)
    if (p === o) return true

    // Legacy compatibility: when either side has no explicit subitem,
    // do not block the authorization link by include-code mismatch.
    if (!p || !o) return true

    const pTokens = p.split('+').filter(Boolean)
    const oTokens = o.split('+').filter(Boolean)
    const pSet = new Set(pTokens)
    const oSet = new Set(oTokens)

    // Modular compatibility: allow a combined include (GA+HE+HA+A1)
    // to match any authorized component item (GA / HE / HA / A1), and vice versa.
    const pIncluyeO = oTokens.every((token) => pSet.has(token))
    const oIncluyeP = pTokens.every((token) => oSet.has(token))
    if (pIncluyeO || oIncluyeP) return true

    // Compatibilidad histórica HE/HA para códigos especiales.
    if (esCodigoHaObligatorio(codigoPractica) || esCodigoHeConOpcionHa(codigoPractica)) {
        const normalizarHistorico = (token: string) => (token === 'HE' || token === 'HA' ? 'HX' : token)
        const pHist = new Set(pTokens.map(normalizarHistorico))
        const oHist = new Set(oTokens.map(normalizarHistorico))

        const pHistIncluyeO = Array.from(oHist).every((token) => pHist.has(token))
        const oHistIncluyeP = Array.from(pHist).every((token) => oHist.has(token))
        return pHistIncluyeO || oHistIncluyeP
    }

    return false
}

async function resolverVinculosOrdenExistenteFacturacion(
    ingresoId: number,
    prestaciones: PrestacionPreparadaFacturacion[]
): Promise<Map<number, VinculoOrdenExistenteFacturacion>> {
    const prestacionesConPractica = prestaciones.filter((p) => Boolean(p.practicaId))
    if (prestacionesConPractica.length === 0) return new Map()

    const practicaIds = Array.from(
        new Set(prestacionesConPractica.map((p) => p.practicaId).filter((id): id is number => Boolean(id)))
    )
    if (practicaIds.length === 0) return new Map()

    const [practicasSeleccionadas, ordenesIngreso, practicasYaVinculadas] = await Promise.all([
        prisma.practica.findMany({
            where: { id: { in: practicaIds } },
            select: { id: true, fecha: true },
        }),
        prisma.orden.findMany({
            where: {
                ingresoId,
                estado: { in: ['A', 'X'] },
            },
            select: {
                puestoNumero: true,
                numero: true,
                estado: true,
                numeroAutorizacion: true,
                items: {
                    select: {
                        item: true,
                        practicaId: true,
                        convenioId: true,
                        codigoPractica: true,
                        cantidad: true,
                        modulo: true,
                        fecha: true,
                        numeroAutorizacion: true,
                    },
                },
            },
        }),
        prisma.practica.findMany({
            where: {
                ingresoId,
                id: { notIn: practicaIds },
                ordenNumero: { not: null },
                ordenItem: { not: null },
                puestoNumero: { not: null },
            },
            select: {
                puestoNumero: true,
                ordenNumero: true,
                ordenItem: true,
            },
        }),
    ])

    const fechaPorPractica = new Map(practicasSeleccionadas.map((p) => [p.id, p.fecha]))

    type CandidatoOrdenItem = {
        key: string
        puestoNumero: number
        ordenNumero: number
        item: number
        practicaId: number | null
        convenioId: number
        codigoPractica: string
        cantidad: number
        incluyeCodigo: string | null
        fecha: Date
        numeroAutorizacion: string | null
        estadoOrden: EstadoOrdenFacturacion
    }

    const candidatos: CandidatoOrdenItem[] = []
    for (const orden of ordenesIngreso) {
        for (const it of orden.items) {
            const numeroAutorizacion = resolverNumeroAutorizacionOrdenItem(
                it.numeroAutorizacion,
                orden.numeroAutorizacion,
                orden.puestoNumero,
                orden.numero,
                it.item
            )
            if (!tieneNumeroAutorizacionValido(numeroAutorizacion)) continue

            candidatos.push({
                key: `${orden.puestoNumero}:${orden.numero}:${it.item}`,
                puestoNumero: orden.puestoNumero,
                ordenNumero: orden.numero,
                item: it.item,
                practicaId: it.practicaId,
                convenioId: it.convenioId,
                codigoPractica: normalizarCodigoPractica(it.codigoPractica),
                cantidad: Number(it.cantidad),
                incluyeCodigo: normalizarIncluyeCodigo(it.modulo),
                fecha: it.fecha,
                numeroAutorizacion,
                estadoOrden: orden.estado,
            })
        }
    }

    const usados = new Set<string>(
        practicasYaVinculadas
            .filter((p) => Boolean(p.puestoNumero && p.ordenNumero && p.ordenItem))
            .map((p) => `${p.puestoNumero}:${p.ordenNumero}:${p.ordenItem}`)
    )

    const resultado = new Map<number, VinculoOrdenExistenteFacturacion>()

    const candidatoHabilitado = (
        candidato: CandidatoOrdenItem,
        practicaId: number | null
    ): boolean => {
        if (candidato.estadoOrden !== 'X') return true
        return Boolean(practicaId && candidato.practicaId === practicaId)
    }

    const coberturaSubitemsPorOrden = (
        prestacion: PrestacionPreparadaFacturacion,
        candidato: CandidatoOrdenItem
    ): number => {
        const incluyePrestacion = normalizarIncluyeCodigo(prestacion.incluyeCodigo)
        if (!incluyePrestacion) return 0

        const requeridos = incluyePrestacion.split('+').filter(Boolean)
        if (requeridos.length === 0) return 0

        const codigoPrestacion = normalizarCodigoPractica(prestacion.codigoPractica)
        const auth = prestacion.numeroAutorizacion?.trim() ?? null
        const presentes = new Set<string>()

        for (const c of candidatos) {
            if (c.puestoNumero !== candidato.puestoNumero || c.ordenNumero !== candidato.ordenNumero) continue
            if (c.convenioId !== prestacion.convenioId) continue
            if (c.codigoPractica !== codigoPrestacion) continue
            if (tieneNumeroAutorizacionValido(auth) && c.numeroAutorizacion !== auth) continue

            const incluyeCandidato = normalizarIncluyeCodigo(c.incluyeCodigo)
            if (!incluyeCandidato) continue
            for (const token of incluyeCandidato.split('+')) {
                if (token) presentes.add(token)
            }
        }

        return requeridos.filter((token) => presentes.has(token)).length
    }

    // 1) Priorizar vínculo explícito por PraID en OrdenPrac
    for (const prestacion of prestacionesConPractica) {
        const practicaId = prestacion.practicaId
        if (!practicaId || resultado.has(practicaId)) continue

        const exactos = candidatos.filter(
            (c) =>
                c.practicaId === practicaId &&
                candidatoHabilitado(c, practicaId) &&
                !usados.has(c.key) &&
                incluyeCodigoCompatibleParaVinculo(
                    prestacion.incluyeCodigo,
                    c.incluyeCodigo,
                    prestacion.codigoPractica
                )
        )
        const fechaPractica = fechaPorPractica.get(practicaId)?.getTime() ?? Number.POSITIVE_INFINITY
        const exacto = [...exactos].sort((a, b) => {
            const penalidadEstadoA = a.estadoOrden === 'X' ? 1 : 0
            const penalidadEstadoB = b.estadoOrden === 'X' ? 1 : 0
            if (penalidadEstadoA !== penalidadEstadoB) return penalidadEstadoA - penalidadEstadoB

            const penalidadCantidadA = a.cantidad === Number(prestacion.cantidad) ? 0 : 1
            const penalidadCantidadB = b.cantidad === Number(prestacion.cantidad) ? 0 : 1
            if (penalidadCantidadA !== penalidadCantidadB) return penalidadCantidadA - penalidadCantidadB

            const coberturaA = coberturaSubitemsPorOrden(prestacion, a)
            const coberturaB = coberturaSubitemsPorOrden(prestacion, b)
            if (coberturaA !== coberturaB) return coberturaB - coberturaA

            const diffA = Math.abs(a.fecha.getTime() - fechaPractica)
            const diffB = Math.abs(b.fecha.getTime() - fechaPractica)
            return diffA - diffB
        })[0]
        if (!exacto) continue

        usados.add(exacto.key)
        resultado.set(practicaId, {
            puestoNumero: exacto.puestoNumero,
            ordenNumero: exacto.ordenNumero,
            item: exacto.item,
        })
    }

    // 2) Fallback legacy por convenio + código (+ subitem) + cercanía de cantidad/fecha
    for (const prestacion of prestacionesConPractica) {
        const practicaId = prestacion.practicaId
        if (!practicaId || resultado.has(practicaId)) continue

        const codigoPractica = normalizarCodigoPractica(prestacion.codigoPractica)
        const auth = prestacion.numeroAutorizacion?.trim() ?? null

        const compatibles = candidatos.filter(
            (c) =>
                candidatoHabilitado(c, practicaId) &&
                !usados.has(c.key) &&
                c.convenioId === prestacion.convenioId &&
                c.codigoPractica === codigoPractica &&
                incluyeCodigoCompatibleParaVinculo(
                    prestacion.incluyeCodigo,
                    c.incluyeCodigo,
                    prestacion.codigoPractica
                )
        )
        if (compatibles.length === 0) continue

        const compatiblesPorAuth =
            tieneNumeroAutorizacionValido(auth)
                ? compatibles.filter((c) => c.numeroAutorizacion === auth)
                : compatibles
        const pool = compatiblesPorAuth.length > 0 ? compatiblesPorAuth : compatibles
        const fechaPractica = fechaPorPractica.get(practicaId)?.getTime() ?? Number.POSITIVE_INFINITY

        const elegido = [...pool].sort((a, b) => {
            const penalidadEstadoA = a.estadoOrden === 'X' ? 1 : 0
            const penalidadEstadoB = b.estadoOrden === 'X' ? 1 : 0
            if (penalidadEstadoA !== penalidadEstadoB) return penalidadEstadoA - penalidadEstadoB

            const penalidadCantidadA = a.cantidad === Number(prestacion.cantidad) ? 0 : 1
            const penalidadCantidadB = b.cantidad === Number(prestacion.cantidad) ? 0 : 1
            if (penalidadCantidadA !== penalidadCantidadB) return penalidadCantidadA - penalidadCantidadB

            const coberturaA = coberturaSubitemsPorOrden(prestacion, a)
            const coberturaB = coberturaSubitemsPorOrden(prestacion, b)
            if (coberturaA !== coberturaB) return coberturaB - coberturaA

            const diffA = Math.abs(a.fecha.getTime() - fechaPractica)
            const diffB = Math.abs(b.fecha.getTime() - fechaPractica)
            return diffA - diffB
        })[0]

        if (!elegido) continue

        usados.add(elegido.key)
        resultado.set(practicaId, {
            puestoNumero: elegido.puestoNumero,
            ordenNumero: elegido.ordenNumero,
            item: elegido.item,
        })
    }

    return resultado
}

function buildEspecialistaOrdenWhere(params: {
    medico?: string
    matricula?: number
}): Prisma.OrdenWhereInput {
    const andFilters: Prisma.OrdenWhereInput[] = []

    if (params.matricula) {
        andFilters.push({
            OR: [
                { profesional: { matricula: params.matricula } },
                { items: { some: { efectorMatricula: params.matricula } } },
            ],
        })
    }

    const medico = params.medico?.trim()
    if (medico) {
        andFilters.push({
            profesional: {
                nombre: {
                    contains: medico,
                    mode: 'insensitive',
                },
            },
        })
    }

    if (andFilters.length === 0) return {}
    return { AND: andFilters }
}

function buildOrdenAutorizadaWhere(): Prisma.OrdenWhereInput {
    return {
        OR: [
            {
                AND: [
                    { numeroAutorizacion: { not: null } },
                    { numeroAutorizacion: { not: '' } },
                ],
            },
            {
                items: {
                    some: {
                        AND: [
                            { numeroAutorizacion: { not: null } },
                            { numeroAutorizacion: { not: '' } },
                        ],
                    },
                },
            },
        ],
    }
}

function periodoToDateRange(periodo: string): { desde: Date; hasta: Date } {
    const [yearStr, monthStr] = periodo.split('-')
    const year = Number(yearStr)
    const month = Number(monthStr)
    const desde = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
    const hasta = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
    return { desde, hasta }
}

function fechaClave(value: Date): string {
    return value.toISOString().slice(0, 10)
}

function normalizarCodigoPracticaFacturacion(codigo: string): string {
    return codigo.trim().slice(0, 8).toUpperCase()
}

export async function buscarAdmisionesFacturacion(
    params: BusquedaFacturacionInput
): Promise<{ items: AdmisionFacturacionListItem[]; total: number }> {
    const { q, tipoIngresoCodigo, codigoPractica, pagina, porPagina } = params
    const skip = (pagina - 1) * porPagina

    const where: Prisma.IngresoWhereInput = {
        estado: { in: ['A', 'E'] },
    }

    if (tipoIngresoCodigo) where.tipoIngresoCodigo = tipoIngresoCodigo

    if (q) {
        const esNumerico = /^\d+$/.test(q)
        if (esNumerico) {
            const n = parseInt(q, 10)
            where.OR = [
                { numeroIngreso: n },
                { paciente: { numeroDocumento: n } },
                { nombre: { contains: q, mode: 'insensitive' } },
            ]
        } else {
            where.OR = [
                { nombre: { contains: q, mode: 'insensitive' } },
                { paciente: { nombreCompleto: { contains: q, mode: 'insensitive' } } },
            ]
        }
    }

    if (codigoPractica) {
        where.AND = [
            {
                OR: [
                    { practicas: { some: { codigoPractica: { contains: codigoPractica, mode: 'insensitive' } } } },
                    {
                        ordenes: {
                            some: {
                                items: { some: { codigoPractica: { contains: codigoPractica, mode: 'insensitive' } } },
                            },
                        },
                    },
                ],
            },
        ]
    }

    const [total, items] = await Promise.all([
        prisma.ingreso.count({ where }),
        prisma.ingreso.findMany({
            where,
            skip,
            take: porPagina,
            orderBy: [{ fechaIngreso: 'desc' }, { id: 'desc' }],
            select: {
                id: true,
                tipoIngresoCodigo: true,
                numeroIngreso: true,
                estado: true,
                fechaIngreso: true,
                fechaEgreso: true,
                paciente: {
                    select: {
                        id: true,
                        nombreCompleto: true,
                        numeroDocumento: true,
                    },
                },
                obraSocial: { select: { id: true, nombre: true } },
                plan: { select: { id: true, descripcion: true } },
            },
        }),
    ])

    return { items: items as AdmisionFacturacionListItem[], total }
}

export async function obtenerContextoFacturacion(ingresoId: number): Promise<FacturacionContexto | null> {
    const ingreso = await prisma.ingreso.findUnique({
        where: { id: ingresoId },
        select: {
            id: true,
            camaId: true,
            tipoIngresoCodigo: true,
            numeroIngreso: true,
            estado: true,
            fechaIngreso: true,
            fechaEgreso: true,
            nombre: true,
            descripcionPatologia: true,
            numeroAfiliado: true,
            observaciones: true,
            obraSocialId: true,
            planId: true,
            obraSocialCoseguroId: true,
            planCoseguroId: true,
            paciente: {
                select: {
                    id: true,
                    apellido: true,
                    nombre: true,
                    nombreCompleto: true,
                    numeroDocumento: true,
                    celular1: true,
                    email: true,
                    domicilio: true,
                },
            },
            obraSocial: { select: { id: true, nombre: true } },
            plan: { select: { id: true, descripcion: true } },
            practicas: {
                where: { OR: [{ estado: 'A' }, { estado: null }] },
                orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
                select: {
                    id: true,
                    fecha: true,
                    codigoPractica: true,
                    cantidad: true,
                    convenioId: true,
                    numeroAutorizacion: true,
                    matriculaEspecialista: true,
                    matriculaAnestesista: true,
                    importeTotal: true,
                    puestoNumero: true,
                    ordenNumero: true,
                    ordenItem: true,
                    nomencladorPractica: { select: { descripcion: true, valorEspecialista: true, valorAyudante: true, valorAnestesista: true, valorGastos: true } },
                },
            },
            medicaciones: {
                orderBy: [{ fechaInicio: 'desc' }, { id: 'desc' }],
                select: {
                    id: true,
                    fechaInicio: true,
                    nombre: true,
                    dosis: true,
                    viaAdministracion: true,
                    frecuencia: true,
                },
            },
            descartables: {
                orderBy: [{ fechaInicio: 'desc' }, { id: 'desc' }],
                select: {
                    id: true,
                    fechaInicio: true,
                    nombre: true,
                    cantidad: true,
                    observaciones: true,
                },
            },
            ordenes: {
                orderBy: [{ fechaEmision: 'desc' }, { numero: 'desc' }],
                select: {
                    puestoNumero: true,
                    numero: true,
                    estado: true,
                    numeroAutorizacion: true,
                    descripcionPatologia: true,
                    fechaEmision: true,
                    profesional: { select: { matricula: true } },
                    items: {
                        orderBy: { item: 'asc' },
                        select: {
                            item: true,
                            practicaId: true,
                            efectorMatricula: true,
                            titularModular: true,
                            fecha: true,
                            convenioId: true,
                            codigoPractica: true,
                            modulo: true,
                            cantidad: true,
                            numeroAutorizacion: true,
                            importeTotal: true,
                            practica: { select: { matriculaEspecialista: true, matriculaAnestesista: true } },
                            nomencladorPractica: {
                                select: {
                                    descripcion: true,
                                    valorEspecialista: true,
                                    valorAyudante: true,
                                    valorAnestesista: true,
                                },
                            },
                        },
                    },
                },
            },
            cirugiasProgramadas: {
                orderBy: [{ fechaCirugia: 'desc' }, { id: 'desc' }],
                select: {
                    id: true,
                    fechaCirugia: true,
                    diferenciales: {
                        select: {
                            esFeriado: true,
                            esNocturna: true,
                            mismaViaPatologia: true,
                            diferentesViasPatologia: true,
                            diferentesViasDiferentesPatologia: true,
                            dobleCirugia: true,
                            practicaBaseId: true,
                        },
                    },
                    practicas: {
                        select: {
                            id: true,
                            codigo: true,
                            cantidad: true,
                        },
                    },
                },
            },
        },
    })

    if (!ingreso) return null

    const profesionalesBase = await prisma.profesional.findMany({
        where: { estado: 'A' },
        select: { id: true, nombre: true, matricula: true },
        orderBy: { nombre: 'asc' },
    })

    const matriculasProfesionales = new Set(
        profesionalesBase
            .map((profesional) => profesional.matricula)
            .filter((matricula): matricula is number => typeof matricula === 'number' && matricula > 0)
    )
    const profesionalesExtra: Array<{ id: number; nombre: string; matricula: number | null }> = []
    let profesionalExtraId = -1

    for (const orden of ingreso.ordenes) {
        for (const item of orden.items) {
            const matriculaEfector = item.efectorMatricula
            if (!matriculaEfector || matriculaEfector <= 0) continue
            if (matriculasProfesionales.has(matriculaEfector)) continue

            profesionalesExtra.push({
                id: profesionalExtraId,
                nombre: resolverNombreEfectorFallback({
                    titularModular: item.titularModular,
                    descripcionPatologia: orden.descripcionPatologia,
                    matricula: matriculaEfector,
                }),
                matricula: matriculaEfector,
            })
            profesionalExtraId -= 1
            matriculasProfesionales.add(matriculaEfector)
        }
    }

    if (!matriculasProfesionales.has(MATRICULA_AMBULATORIO_DEFAULT)) {
        profesionalesExtra.push({
            id: profesionalExtraId,
            nombre: NOMBRE_MATRICULA_9110_DEFAULT,
            matricula: MATRICULA_AMBULATORIO_DEFAULT,
        })
        profesionalExtraId -= 1
        matriculasProfesionales.add(MATRICULA_AMBULATORIO_DEFAULT)
    }

    if (!matriculasProfesionales.has(MATRICULA_ANESTESISTA_INT_DEFAULT)) {
        profesionalesExtra.push({
            id: profesionalExtraId,
            nombre: NOMBRE_MATRICULA_6_DEFAULT,
            matricula: MATRICULA_ANESTESISTA_INT_DEFAULT,
        })
        profesionalExtraId -= 1
        matriculasProfesionales.add(MATRICULA_ANESTESISTA_INT_DEFAULT)
    }

    if (!matriculasProfesionales.has(MATRICULA_AYUDANTE_INT_DEFAULT)) {
        profesionalesExtra.push({
            id: profesionalExtraId,
            nombre: NOMBRE_MATRICULA_995_DEFAULT,
            matricula: MATRICULA_AYUDANTE_INT_DEFAULT,
        })
        profesionalExtraId -= 1
        matriculasProfesionales.add(MATRICULA_AYUDANTE_INT_DEFAULT)
    }

    const profesionales = [...profesionalesBase, ...profesionalesExtra]
        .map((profesional) => (
            profesional.matricula === MATRICULA_AMBULATORIO_DEFAULT
                ? { ...profesional, nombre: NOMBRE_MATRICULA_9110_DEFAULT }
                : profesional.matricula === MATRICULA_ANESTESISTA_INT_DEFAULT
                    ? { ...profesional, nombre: NOMBRE_MATRICULA_6_DEFAULT }
                    : profesional.matricula === MATRICULA_AYUDANTE_INT_DEFAULT
                        ? { ...profesional, nombre: NOMBRE_MATRICULA_995_DEFAULT }
                        : profesional
        ))
        .sort((a, b) =>
            a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
        )

    const reglaFacturacion = resolverReglaFacturacion(
        ingreso?.obraSocial?.nombre ?? '',
        Boolean(ingreso?.obraSocialCoseguroId)
    )

    const obraSocialCoseguro = ingreso.obraSocialCoseguroId
        ? await prisma.obraSocial.findUnique({
            where: { id: ingreso.obraSocialCoseguroId },
            select: { id: true, nombre: true },
        })
        : null

    const prestaciones: PrestacionFacturableItem[] = []
    const matriculaPorOrden = new Map<string, number | null>()
    const autorizacionPorOrden = new Map<string, string | null>()
    const autorizacionPorOrdenItem = new Map<string, string | null>()
    const incluyeCodigoPorOrdenItem = new Map<string, string | null>()
    const puestoPorNumeroOrden = new Map<number, number>()
    const ordenVinculadaPorPractica = new Map<
        number,
        {
            puestoNumero: number
            numero: number
            item: number
            incluyeCodigo: string | null
            numeroAutorizacion: string | null
            estado: string | null
            matriculaEspecialista: number | null
            matriculaAnestesista: number | null
        }
    >()
    const practicasPendientesPorClave = new Map<
        string,
        Array<{ id: number; cantidad: number; fecha: Date }>
    >()
    const valoresPractica = await obtenerValoresPracticas(
        ingreso.practicas.map((p) => p.codigoPractica)
    )
    const desgloseFallbackPorCodigo = await obtenerFallbackDesglosePorCodigo(
        ingreso.practicas.map((p) => p.codigoPractica)
    )
    const cirugiaPracticas = new Map<string, { cirugiaId: number; diferenciales: NonNullable<PrestacionFacturableItem['diferenciales']> }>()
    const diferencialesPorPracticaId = new Map<number, NonNullable<PrestacionFacturableItem['diferenciales']>>()

    for (const cirugia of ingreso.cirugiasProgramadas) {
        const practicaBaseId =
            cirugia.diferenciales.find((d) => d.practicaBaseId != null)?.practicaBaseId ?? null
        const diferenciales = cirugia.diferenciales.length > 0
            ? {
                esFeriado: cirugia.diferenciales.some((d) => d.esFeriado),
                esNocturna: cirugia.diferenciales.some((d) => d.esNocturna),
                mismaViaPatologia: cirugia.diferenciales.some((d) => d.mismaViaPatologia),
                diferentesViasPatologia: cirugia.diferenciales.some((d) => d.diferentesViasPatologia),
                diferentesViasDiferentesPatologia: cirugia.diferenciales.some((d) => d.diferentesViasDiferentesPatologia),
                dobleCirugia: cirugia.diferenciales.some((d) => d.dobleCirugia),
                practicaBaseId,
            }
            : null
        if (!diferenciales || !tieneDiferencialesActivos(diferenciales)) continue

        for (const practica of cirugia.practicas) {
            const clave = `${normalizarCodigoPracticaFacturacion(practica.codigo)}:${Number(practica.cantidad)}:${fechaClave(cirugia.fechaCirugia)}`
            cirugiaPracticas.set(clave, {
                cirugiaId: cirugia.id,
                diferenciales: diferenciales as NonNullable<PrestacionFacturableItem['diferenciales']>,
            })
        }
    }

    for (const p of ingreso.practicas) {
        if (p.ordenNumero) continue
        const clave = `${p.convenioId}:${normalizarCodigoPractica(p.codigoPractica)}:${Number(p.cantidad)}`
        const actuales = practicasPendientesPorClave.get(clave) ?? []
        actuales.push({ id: p.id, cantidad: Number(p.cantidad), fecha: p.fecha })
        practicasPendientesPorClave.set(clave, actuales)

        const claveCodigo = `${p.convenioId}:${normalizarCodigoPractica(p.codigoPractica)}:*`
        const actualesCodigo = practicasPendientesPorClave.get(claveCodigo) ?? []
        actualesCodigo.push({ id: p.id, cantidad: Number(p.cantidad), fecha: p.fecha })
        practicasPendientesPorClave.set(claveCodigo, actualesCodigo)
    }

    for (const o of ingreso.ordenes) {
        const claveOrden = `${o.puestoNumero}:${o.numero}`
        matriculaPorOrden.set(claveOrden, o.profesional?.matricula ?? null)
        autorizacionPorOrden.set(claveOrden, resolverNumeroAutorizacion(null, o.numeroAutorizacion))
        if (!puestoPorNumeroOrden.has(o.numero)) {
            puestoPorNumeroOrden.set(o.numero, o.puestoNumero)
        }
        for (const it of o.items) {
            autorizacionPorOrdenItem.set(
                `${o.puestoNumero}:${o.numero}:${it.item}`,
                resolverNumeroAutorizacionOrdenItem(
                    it.numeroAutorizacion,
                    o.numeroAutorizacion,
                    o.puestoNumero,
                    o.numero,
                    it.item
                )
            )
            incluyeCodigoPorOrdenItem.set(
                `${o.puestoNumero}:${o.numero}:${it.item}`,
                normalizarIncluyeCodigo(it.modulo)
            )

            let practicaIdAsociada = it.practicaId

            // Fallback legacy: when the order item is not linked via PraID,
            // try to pair with a single pending practice with same convenio/codigo/cantidad.
            if (!practicaIdAsociada) {
                const clave = `${it.convenioId}:${normalizarCodigoPractica(it.codigoPractica)}:${Number(it.cantidad)}`
                const claveCodigo = `${it.convenioId}:${normalizarCodigoPractica(it.codigoPractica)}:*`
                const candidatasExactas = practicasPendientesPorClave.get(clave) ?? []
                const candidatasCodigo = practicasPendientesPorClave.get(claveCodigo) ?? []

                const candidatas =
                    candidatasExactas.length > 0 ? candidatasExactas : candidatasCodigo

                if (candidatas.length > 0) {
                    const ordenadas = [...candidatas].sort((a, b) => {
                        const penalidadCantidadA = a.cantidad === Number(it.cantidad) ? 0 : 1
                        const penalidadCantidadB = b.cantidad === Number(it.cantidad) ? 0 : 1
                        if (penalidadCantidadA !== penalidadCantidadB) {
                            return penalidadCantidadA - penalidadCantidadB
                        }
                        const diffA = Math.abs(a.fecha.getTime() - it.fecha.getTime())
                        const diffB = Math.abs(b.fecha.getTime() - it.fecha.getTime())
                        return diffA - diffB
                    })
                    const mejor = ordenadas[0]
                    practicaIdAsociada = mejor?.id ?? null

                    if (mejor) {
                        practicasPendientesPorClave.set(
                            clave,
                            (practicasPendientesPorClave.get(clave) ?? []).filter((c) => c.id !== mejor.id)
                        )
                        practicasPendientesPorClave.set(
                            claveCodigo,
                            (practicasPendientesPorClave.get(claveCodigo) ?? []).filter((c) => c.id !== mejor.id)
                        )
                    }
                }
            }

            if (!practicaIdAsociada) continue

            const nuevoVinculo = {
                puestoNumero: o.puestoNumero,
                numero: o.numero,
                item: it.item,
                incluyeCodigo: normalizarIncluyeCodigo(it.modulo),
                numeroAutorizacion: resolverNumeroAutorizacionOrdenItem(
                    it.numeroAutorizacion,
                    o.numeroAutorizacion,
                    o.puestoNumero,
                    o.numero,
                    it.item
                ),
                estado: o.estado,
                matriculaEspecialista: (() => {
                    const incluye = desglosarIncluyeCodigo(it.modulo)
                    const esGasto = esSeleccionSoloGastos(incluye) || (!incluye && descripcionEsGasto(it.nomencladorPractica?.descripcion ?? null))
                    if (esGasto) return MATRICULA_AMBULATORIO_DEFAULT
                    const incluyeSoloAyudante = Boolean(
                        incluye &&
                        incluye.ayudantes > 0 &&
                        !incluye.especialista &&
                        !incluye.anestesista &&
                        !incluye.gastos
                    )
                    if (incluyeSoloAyudante) {
                        return MATRICULA_AYUDANTE_INT_DEFAULT
                    }
                    const tieneHE = Boolean(incluye?.especialista)
                    const tituloPatologia = esTituloPatologia(it.titularModular)
                    const desdeEfector = it.efectorMatricula && (
                        tituloPatologia ||
                        tieneHE ||
                        (!incluye && (
                            it.nomencladorPractica?.valorEspecialista != null ||
                            it.nomencladorPractica?.valorAyudante != null
                        ))
                    )
                        ? it.efectorMatricula
                        : null
                    const desdePractica = it.practica?.matriculaEspecialista ?? null
                    return combinarMatricula(desdePractica, desdeEfector)
                })(),
                matriculaAnestesista: (() => {
                    const incluye = desglosarIncluyeCodigo(it.modulo)
                    const esGasto = esSeleccionSoloGastos(incluye) || (!incluye && descripcionEsGasto(it.nomencladorPractica?.descripcion ?? null))
                    if (esGasto) return MATRICULA_AMBULATORIO_DEFAULT
                    const tieneHA = Boolean(incluye?.anestesista)
                    const tituloAnestesista = esTituloAnestesista(it.titularModular)
                    const matriculaDesdeEfector =
                        it.efectorMatricula && (
                            tituloAnestesista ||
                            tieneHA ||
                            (!incluye && it.nomencladorPractica?.valorAnestesista != null) ||
                            esCodigoHaObligatorio(it.codigoPractica)
                        )
                            ? it.efectorMatricula
                            : null

                    const desdePractica = it.practica?.matriculaAnestesista ?? null
                    return combinarMatricula(
                        combinarMatricula(desdePractica, matriculaDesdeEfector),
                        tituloAnestesista ? MATRICULA_ANESTESISTA_INT_DEFAULT : null
                    )
                })(),
            }

            const vinculoExistente = ordenVinculadaPorPractica.get(practicaIdAsociada)
            if (!vinculoExistente) {
                ordenVinculadaPorPractica.set(practicaIdAsociada, nuevoVinculo)
                continue
            }

            const incluyeExistente = desglosarIncluyeCodigo(vinculoExistente.incluyeCodigo)
            const incluyeNuevo = desglosarIncluyeCodigo(nuevoVinculo.incluyeCodigo)
            const priorizarNuevoEspecialista = Boolean(incluyeNuevo?.especialista && !incluyeExistente?.especialista)
            const priorizarNuevoAnestesista = Boolean(incluyeNuevo?.anestesista && !incluyeExistente?.anestesista)

            ordenVinculadaPorPractica.set(practicaIdAsociada, {
                ...vinculoExistente,
                incluyeCodigo: combinarIncluyeCodigos(vinculoExistente.incluyeCodigo, nuevoVinculo.incluyeCodigo),
                numeroAutorizacion:
                    resolverNumeroAutorizacion(vinculoExistente.numeroAutorizacion, nuevoVinculo.numeroAutorizacion),
                matriculaEspecialista: priorizarNuevoEspecialista
                    ? combinarMatricula(nuevoVinculo.matriculaEspecialista, vinculoExistente.matriculaEspecialista)
                    : combinarMatricula(vinculoExistente.matriculaEspecialista, nuevoVinculo.matriculaEspecialista),
                matriculaAnestesista: priorizarNuevoAnestesista
                    ? combinarMatricula(nuevoVinculo.matriculaAnestesista, vinculoExistente.matriculaAnestesista)
                    : combinarMatricula(vinculoExistente.matriculaAnestesista, nuevoVinculo.matriculaAnestesista),
            })
        }
    }

    for (const p of ingreso.practicas) {
        const vinculoPorItem = ordenVinculadaPorPractica.get(p.id)
        const tieneVinculoExplicitoEnDB = Boolean(p.ordenNumero || p.puestoNumero)
        // Importante: una orden autorizada no implica "facturada".
        // Solo tomamos vínculo de orden cuando está persistido explícitamente en Practica.
        const ordenPuestoNumero =
            p.puestoNumero ??
            (p.ordenNumero ? (puestoPorNumeroOrden.get(p.ordenNumero) ?? null) : null)
        const ordenNumero = p.ordenNumero ?? null
        const ordenItem = p.ordenItem ?? null
        const claveOrden =
            ordenPuestoNumero && ordenNumero ? `${ordenPuestoNumero}:${ordenNumero}` : null
        const claveOrdenItem =
            ordenPuestoNumero && ordenNumero && ordenItem
                ? `${ordenPuestoNumero}:${ordenNumero}:${ordenItem}`
                : null
        const matriculaProfesional =
            ordenPuestoNumero && ordenNumero
                ? (matriculaPorOrden.get(`${ordenPuestoNumero}:${ordenNumero}`) ?? null)
                : null
        const esInternacion = ingreso.tipoIngresoCodigo === 'INT'
        const incluyeCodigoPractica = normalizarIncluyeCodigo(
            vinculoPorItem?.incluyeCodigo ??
            (claveOrdenItem ? incluyeCodigoPorOrdenItem.get(claveOrdenItem) : null)
        )

        // Buscar si esta práctica pertenece a una cirugía programada
        const clavePractica = `${normalizarCodigoPracticaFacturacion(p.codigoPractica)}:${Number(p.cantidad)}:${fechaClave(p.fecha)}`
        const diferencialCirugia = cirugiaPracticas.get(clavePractica) ?? null
        const esPracticaBaseDobleCirugia = Boolean(
            diferencialCirugia?.diferenciales?.dobleCirugia &&
            diferencialCirugia.diferenciales.practicaBaseId != null &&
            diferencialCirugia.diferenciales.practicaBaseId === p.id
        )
        const aplicarDiferencialesCirugia = Boolean(diferencialCirugia) && !esPracticaBaseDobleCirugia
        const esCodigoAnestesista = esCodigoHaObligatorio(p.codigoPractica)
        const incluyeSeleccionPractica = desglosarIncluyeCodigo(incluyeCodigoPractica)
        const incluyeSoloAyudantePractica = Boolean(
            incluyeSeleccionPractica &&
            incluyeSeleccionPractica.ayudantes > 0 &&
            !incluyeSeleccionPractica.especialista &&
            !incluyeSeleccionPractica.anestesista &&
            !incluyeSeleccionPractica.gastos
        )
        const permiteFallbackAyudante = !incluyeSeleccionPractica || incluyeSoloAyudantePractica
        const permiteFallbackAnestesista =
            !incluyeSeleccionPractica ||
            Boolean(incluyeSeleccionPractica.anestesista) ||
            esCodigoAnestesista
        const matriculaEspecialista =
            esCodigoAnestesista
                ? null
                : (vinculoPorItem?.matriculaEspecialista ??
                    p.matriculaEspecialista ??
                    (esInternacion && p.nomencladorPractica?.valorAyudante != null
                        && permiteFallbackAyudante
                        ? MATRICULA_AYUDANTE_INT_DEFAULT
                        : null))
        const matriculaAnestesista =
            vinculoPorItem?.matriculaAnestesista ??
            p.matriculaAnestesista ??
            (esInternacion && (p.nomencladorPractica?.valorAnestesista != null || esCodigoAnestesista)
                && permiteFallbackAnestesista
                ? MATRICULA_ANESTESISTA_INT_DEFAULT
                : null)

        const precioNomenclador = valoresPractica.get(normalizarCodigoPractica(p.codigoPractica)) ?? 0
        const coberturaBase = calcularImporteFacturable(
            precioNomenclador,
            Number(p.cantidad),
            reglaFacturacion
        )
        const desgloseNomenclador: DesgloseValores | null = p.nomencladorPractica
            ? {
                valorEspecialista: p.nomencladorPractica.valorEspecialista != null ? Number(p.nomencladorPractica.valorEspecialista) : null,
                valorAyudante: p.nomencladorPractica.valorAyudante != null ? Number(p.nomencladorPractica.valorAyudante) : null,
                valorAnestesista: p.nomencladorPractica.valorAnestesista != null ? Number(p.nomencladorPractica.valorAnestesista) : null,
                valorGastos: p.nomencladorPractica.valorGastos != null ? Number(p.nomencladorPractica.valorGastos) : null,
            }
            : (desgloseFallbackPorCodigo.get(normalizarCodigoPractica(p.codigoPractica)) ?? null)

        const desgloseBase = desgloseNomenclador
            ? aplicarOverrideEspecialAnestesistaPorCodigo(p.codigoPractica, desgloseNomenclador)
            : null
        const desgloseConDiferencial = desgloseBase
            ? aplicarDiferencialesAValores(
                desgloseBase,
                aplicarDiferencialesCirugia ? (diferencialCirugia?.diferenciales ?? null) : null
            )
            : null
        const desgloseFiltradoPorIncluye = desgloseConDiferencial
            ? aplicarIncluyeCodigoADesglose(desgloseConDiferencial, incluyeCodigoPractica, p.codigoPractica)
            : null
        const totalUnitarioDesglose = desgloseFiltradoPorIncluye
            ? calcularTotalUnitarioDesglose(desgloseFiltradoPorIncluye, incluyeCodigoPractica)
            : null
        const importeFromDb = p.importeTotal != null ? Number(String(p.importeTotal)) : null
        const cant = Number(p.cantidad)
        const precioUnitarioDesdeDb = importeFromDb !== null && cant > 0 ? Number((importeFromDb / cant).toFixed(2)) : null
        const precioUnitario = totalUnitarioDesglose !== null
            ? totalUnitarioDesglose
            : (incluyeCodigoPractica && precioUnitarioDesdeDb !== null
                ? precioUnitarioDesdeDb
                : (coberturaBase.precioUnitarioFacturable > 0
                    ? coberturaBase.precioUnitarioFacturable
                    : (precioUnitarioDesdeDb ?? coberturaBase.precioUnitarioFacturable)))
        const importeTotalCalculado = totalUnitarioDesglose !== null
            ? Number((totalUnitarioDesglose * cant).toFixed(2))
            : coberturaBase.importeTotalFacturable
        const importeTotalFacturacion = diferencialCirugia
            ? importeTotalCalculado
            : (incluyeCodigoPractica && totalUnitarioDesglose !== null
                ? importeTotalCalculado
                : (importeFromDb ?? coberturaBase.importeTotalFacturable))
        const descripcionBase = p.nomencladorPractica?.descripcion ?? p.codigoPractica.trim()
        const incluyeSeleccion = incluyeSeleccionPractica
        const esGastoPractica = esSeleccionSoloGastos(incluyeSeleccion) || (!incluyeSeleccion && descripcionEsGasto(descripcionBase))
        const matriculaEspecialistaFinal = esGastoPractica ? MATRICULA_AMBULATORIO_DEFAULT : matriculaEspecialista
        const matriculaAnestesistaFinal = esGastoPractica ? MATRICULA_AMBULATORIO_DEFAULT : matriculaAnestesista
        const diferencialesPractica = diferencialCirugia
            ? {
                ...diferencialCirugia.diferenciales,
                esPracticaBase: esPracticaBaseDobleCirugia,
                aplicaDiferencial: aplicarDiferencialesCirugia,
            }
            : null
        if (diferencialesPractica) {
            diferencialesPorPracticaId.set(p.id, diferencialesPractica)
        }
        prestaciones.push({
            uid: `PRACTICA:${p.id}`,
            tipo: 'PRACTICA',
            referencia: `PRA-${p.id}`,
            fecha: p.fecha,
            descripcion: incluyeCodigoPractica
                ? `${descripcionBase} [${incluyeCodigoPractica}]`
                : descripcionBase,
            cantidad: cant,
            precioUnitario,
            importeTotal: importeTotalFacturacion,
            importeTotalOriginal: importeFromDb,
            // Una práctica queda facturada solo con vínculo explícito a orden en la propia tabla.
            facturada: Boolean(p.ordenNumero),
            matriculaProfesional: null,
            matriculaEspecialista: matriculaEspecialistaFinal,
            matriculaAnestesista: matriculaAnestesistaFinal,
            ordenPuestoNumero,
            ordenNumero,
            convenioId: p.convenioId,
            codigoPractica: p.codigoPractica.trim(),
            incluyeCodigo: incluyeCodigoPractica,
            esPracticaCirugia: Boolean(diferencialCirugia),
            diferenciales: diferencialesPractica,
            numeroAutorizacion: tieneVinculoExplicitoEnDB
                ? resolverNumeroAutorizacion(
                    p.numeroAutorizacion,
                    resolverNumeroAutorizacion(
                        vinculoPorItem?.numeroAutorizacion,
                        resolverNumeroAutorizacion(
                            claveOrdenItem ? autorizacionPorOrdenItem.get(claveOrdenItem) : null,
                            claveOrden ? autorizacionPorOrden.get(claveOrden) : null
                        )
                    )
                )
                : (p.numeroAutorizacion?.trim() || null),
            origen: {
                ingresoId: ingreso.id,
                practicaId: p.id,
                ordenPuestoNumero: ordenPuestoNumero ?? undefined,
                ordenNumero: ordenNumero ?? undefined,
                ordenItem: ordenItem ?? undefined,
                cirugiaProgramadaId: diferencialCirugia?.cirugiaId,
            },
            desglose: desgloseFiltradoPorIncluye ? {
                valorEspecialista: desgloseFiltradoPorIncluye.valorEspecialista,
                valorAyudante: desgloseFiltradoPorIncluye.valorAyudante,
                valorAnestesista: desgloseFiltradoPorIncluye.valorAnestesista,
                valorGastos: desgloseFiltradoPorIncluye.valorGastos,
                valorTotal: precioUnitario,
            } : desgloseNomenclador ? {
                ...aplicarIncluyeCodigoADesglose(
                    aplicarOverrideEspecialAnestesistaPorCodigo(p.codigoPractica, desgloseNomenclador),
                    incluyeCodigoPractica,
                    p.codigoPractica
                ),
                valorTotal: precioUnitario,
            } : undefined,
        })
    }

    // Solo considerar como "ítem facturado" lo que esté enlazado explícitamente
    // desde Practica (evita duplicar con órdenes solo autorizadas).
    const itemsOrdenFacturados = new Set<string>()
    const practicasFacturadasIds = new Set<number>()
    for (const p of ingreso.practicas) {
        if (p.ordenNumero) {
            practicasFacturadasIds.add(p.id)
        }
        if (!p.ordenNumero || !p.ordenItem) continue
        const puesto = p.puestoNumero ?? (puestoPorNumeroOrden.get(p.ordenNumero) ?? null)
        if (!puesto) continue
        itemsOrdenFacturados.add(`${puesto}:${p.ordenNumero}:${p.ordenItem}`)
    }

    for (const o of ingreso.ordenes) {
        if (o.estado === 'X') continue
        for (const it of o.items) {
            if (!it.practicaId || !practicasFacturadasIds.has(it.practicaId)) continue
            itemsOrdenFacturados.add(`${o.puestoNumero}:${o.numero}:${it.item}`)
        }
    }

    for (const o of ingreso.ordenes) {
        if (o.estado === 'X') continue
        for (const it of o.items) {
            const claveItem = `${o.puestoNumero}:${o.numero}:${it.item}`
            if (!itemsOrdenFacturados.has(claveItem)) continue
            const incluyeCodigoItem = normalizarIncluyeCodigo(it.modulo)

            const numeroAutorizacion = resolverNumeroAutorizacionOrdenItem(
                it.numeroAutorizacion,
                o.numeroAutorizacion,
                o.puestoNumero,
                o.numero,
                it.item
            )
            if (!tieneNumeroAutorizacionValido(numeroAutorizacion)) continue

            const incluye = desglosarIncluyeCodigo(it.modulo)
            const esGastoItem = esSeleccionSoloGastos(incluye) || (!incluye && descripcionEsGasto(it.nomencladorPractica?.descripcion ?? null))
            const tieneHE = Boolean(incluye?.especialista)
            const tieneHA = Boolean(incluye?.anestesista)
            const incluyeSoloAyudante = Boolean(
                incluye &&
                incluye.ayudantes > 0 &&
                !incluye.especialista &&
                !incluye.anestesista &&
                !incluye.gastos
            )
            const tituloPatologia = esTituloPatologia(it.titularModular)
            const tituloAnestesista = esTituloAnestesista(it.titularModular)

            const matriculaEspecialistaEfector =
                it.efectorMatricula && (
                    tituloPatologia ||
                    tieneHE ||
                    (!incluye && (
                        it.nomencladorPractica?.valorEspecialista != null ||
                        it.nomencladorPractica?.valorAyudante != null
                    ))
                )
                    ? it.efectorMatricula
                    : null
            const fallbackAyudanteDefault =
                incluyeSoloAyudante
                    ? MATRICULA_AYUDANTE_INT_DEFAULT
                    : (
                        ingreso.tipoIngresoCodigo === 'INT' &&
                        it.nomencladorPractica?.valorAyudante != null &&
                        (!incluye || (incluye.ayudantes > 0 && !incluye.especialista && !incluye.anestesista))
                    )
                        ? MATRICULA_AYUDANTE_INT_DEFAULT
                        : null
            const matriculaEspecialistaItem = esGastoItem
                ? MATRICULA_AMBULATORIO_DEFAULT
                : (incluyeSoloAyudante
                    ? MATRICULA_AYUDANTE_INT_DEFAULT
                    : (matriculaEspecialistaEfector ?? it.practica?.matriculaEspecialista ?? fallbackAyudanteDefault))

            const matriculaAnestesistaEfector =
                it.efectorMatricula && (
                    tituloAnestesista ||
                    tieneHA ||
                    (!incluye && it.nomencladorPractica?.valorAnestesista != null) ||
                    esCodigoHaObligatorio(it.codigoPractica)
                )
                    ? it.efectorMatricula
                    : null
            const fallbackAnestesistaDefault =
                ingreso.tipoIngresoCodigo === 'INT' &&
                    (
                        it.nomencladorPractica?.valorAnestesista != null ||
                        esCodigoHaObligatorio(it.codigoPractica)
                    ) &&
                    (!incluye || incluye.anestesista || esCodigoHaObligatorio(it.codigoPractica))
                    ? MATRICULA_ANESTESISTA_INT_DEFAULT
                    : (tituloAnestesista ? MATRICULA_ANESTESISTA_INT_DEFAULT : null)
            const matriculaAnestesistaItem = esGastoItem
                ? MATRICULA_AMBULATORIO_DEFAULT
                : (matriculaAnestesistaEfector ?? it.practica?.matriculaAnestesista ?? fallbackAnestesistaDefault)
            const diferencialesOrdenItem =
                it.practicaId != null ? (diferencialesPorPracticaId.get(it.practicaId) ?? null) : null

            prestaciones.push({
                uid: `ORDEN_ITEM:${o.puestoNumero}:${o.numero}:${it.item}`,
                tipo: 'ORDEN_ITEM',
                referencia: `${o.puestoNumero.toString().padStart(4, '0')}-${o.numero.toString().padStart(8, '0')}-${it.item.toString().padStart(2, '0')}`,
                fecha: it.fecha,
                descripcion: incluyeCodigoItem
                    ? `${it.nomencladorPractica?.descripcion ?? it.codigoPractica.trim()} [${incluyeCodigoItem}]`
                    : (it.nomencladorPractica?.descripcion ?? it.codigoPractica.trim()),
                cantidad: Number(it.cantidad),
                precioUnitario:
                    Number(it.cantidad) > 0
                        ? Number(String(it.importeTotal ?? 0)) / Number(it.cantidad)
                        : Number(String(it.importeTotal ?? 0)),
                importeTotal: Number(String(it.importeTotal ?? 0)),
                facturada: true,
                matriculaProfesional: null,
                matriculaEspecialista: matriculaEspecialistaItem,
                matriculaAnestesista: matriculaAnestesistaItem,
                ordenPuestoNumero: o.puestoNumero,
                ordenNumero: o.numero,
                convenioId: it.convenioId,
                codigoPractica: it.codigoPractica.trim(),
                incluyeCodigo: incluyeCodigoItem,
                numeroAutorizacion,
                esPracticaCirugia: Boolean(diferencialesOrdenItem),
                diferenciales: diferencialesOrdenItem,
                origen: {
                    ingresoId: ingreso.id,
                    ordenPuestoNumero: o.puestoNumero,
                    ordenNumero: o.numero,
                    ordenItem: it.item,
                },
            })
        }
    }

    for (const m of ingreso.medicaciones) {
        const detalle = [m.dosis, m.viaAdministracion, m.frecuencia].filter(Boolean).join(' · ')
        prestaciones.push({
            uid: `MEDICACION:${m.id}`,
            tipo: 'MEDICACION',
            referencia: `MED-${m.id}`,
            fecha: m.fechaInicio,
            descripcion: detalle ? `${m.nombre} (${detalle})` : m.nombre,
            cantidad: 1,
            precioUnitario: precioFicticioMedicacion(m.nombre),
            importeTotal: precioFicticioMedicacion(m.nombre),
            facturada: false,
            matriculaProfesional: null,
            matriculaEspecialista: null,
            matriculaAnestesista: null,
            ordenPuestoNumero: null,
            ordenNumero: null,
            convenioId: null,
            codigoPractica: null,
            numeroAutorizacion: null,
            origen: { ingresoId: ingreso.id, medicacionId: m.id },
        })
    }

    for (const d of ingreso.descartables) {
        const detalle = d.observaciones ? `${d.nombre} (${d.observaciones})` : d.nombre
        const precioUnitario = precioFicticioDescartable(d.nombre)
        const cantidad = Number(d.cantidad)
        prestaciones.push({
            uid: `DESCARTABLE:${d.id}`,
            tipo: 'DESCARTABLE',
            referencia: `DES-${d.id}`,
            fecha: d.fechaInicio,
            descripcion: detalle,
            cantidad,
            precioUnitario,
            importeTotal: Number((precioUnitario * cantidad).toFixed(2)),
            facturada: false,
            matriculaProfesional: null,
            matriculaEspecialista: null,
            matriculaAnestesista: null,
            ordenPuestoNumero: null,
            ordenNumero: null,
            convenioId: null,
            codigoPractica: null,
            numeroAutorizacion: null,
            origen: { ingresoId: ingreso.id, descartableId: d.id },
        })
    }

    prestaciones.sort((a, b) => b.fecha.getTime() - a.fecha.getTime())

    return {
        ingreso: {
            id: ingreso.id,
            tipoIngresoCodigo: ingreso.tipoIngresoCodigo,
            numeroIngreso: ingreso.numeroIngreso,
            estado: ingreso.estado,
            fechaIngreso: ingreso.fechaIngreso,
            fechaEgreso: ingreso.fechaEgreso,
            nombre: ingreso.nombre,
            descripcionPatologia: ingreso.descripcionPatologia,
            numeroAfiliado: ingreso.numeroAfiliado,
            observaciones: ingreso.observaciones,
            obraSocialId: ingreso.obraSocialId,
            planId: ingreso.planId,
            obraSocialCoseguroId: ingreso.obraSocialCoseguroId,
        },
        paciente: ingreso.paciente,
        obraSocial: ingreso.obraSocial,
        obraSocialCoseguro,
        plan: ingreso.plan,
        reglaFacturacion,
        profesionales,
        prestaciones,
    }
}

export async function crearPracticaFacturacion(
    data: CrearPracticaFacturacionInput,
    usuario: string
): Promise<{ id: number }> {
    const codigo = data.codigoPractica.trim().slice(0, 8)
    const cantidad = Number(data.cantidad)
    const ingreso = await prisma.ingreso.findUnique({
        where: { id: data.ingresoId },
        select: {
            obraSocialId: true,
            planId: true,
            obraSocialCoseguroId: true,
            obraSocial: { select: { nombre: true } },
        },
    })

    if (!ingreso) throw new Error('Ingreso no encontrado')

    const regla = resolverReglaFacturacion(
        ingreso.obraSocial?.nombre,
        Boolean(ingreso.obraSocialCoseguroId)
    )

    let importeTotal: number
    if (data.importeBaseUnitario != null && data.importeBaseUnitario > 0) {
        const cobertura = calcularImporteFacturable(data.importeBaseUnitario, cantidad, regla)
        importeTotal = cobertura.importeTotalFacturable
    } else {
        const valorPractica = await obtenerValorPractica(codigo)
        const cobertura = calcularImporteFacturable(valorPractica, cantidad, regla)
        importeTotal = cobertura.importeTotalFacturable
    }

    const practica = await prisma.practica.create({
        data: {
            ingresoId: data.ingresoId,
            convenioId: data.convenioId,
            codigoPractica: codigo.toUpperCase().padEnd(8, ' '),
            convenioValorId: 0,
            fecha: data.fecha,
            cantidad,
            numeroAutorizacion: data.numeroAutorizacion ?? null,
            obraSocialId: ingreso.obraSocialId ?? null,
            planId: ingreso.planId ?? null,
            facturable: true,
            importeTotal,
            usuarioRegistro: usuario.trim().slice(0, 10) || 'SISTEMA',
        },
        select: { id: true },
    })

    return practica
}

export async function crearMedicacionFacturacion(
    data: CrearMedicacionFacturacionInput,
    usuario: string
): Promise<{ id: number }> {
    const medicacion = await prisma.medicacionIngreso.create({
        data: {
            ingresoId: data.ingresoId,
            nombre: data.nombre,
            dosis: data.dosis ?? null,
            viaAdministracion: data.viaAdministracion ?? null,
            frecuencia: data.frecuencia ?? null,
            fechaInicio: data.fechaInicio,
            fechaFin: data.fechaFin ?? null,
            observaciones: data.observaciones ?? null,
            profesionalId: data.profesionalId ?? null,
            estado: 'A',
            usuario: usuario.trim().slice(0, 10) || 'SISTEMA',
            fechaEstado: new Date(),
        },
        select: { id: true },
    })

    return medicacion
}

export async function crearDescartableFacturacion(
    data: CrearDescartableFacturacionInput,
    usuario: string
): Promise<{ id: number }> {
    const descartable = await prisma.descartableIngreso.create({
        data: {
            ingresoId: data.ingresoId,
            nombre: data.nombre,
            cantidad: data.cantidad,
            observaciones: data.observaciones ?? null,
            fechaInicio: new Date(),
            profesionalId: data.profesionalId ?? null,
            estado: 'A',
            usuario: usuario.trim().slice(0, 10) || 'SISTEMA',
            fechaEstado: new Date(),
        },
        select: { id: true },
    })

    return descartable
}

export async function actualizarContextoFacturacion(
    ingresoId: number,
    data: ActualizarContextoFacturacionInput,
    usuario: string
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        if (data.ingreso) {
            await tx.ingreso.update({
                where: { id: ingresoId },
                data: {
                    nombre: data.ingreso.nombre,
                    descripcionPatologia: data.ingreso.descripcionPatologia,
                    numeroAfiliado: data.ingreso.numeroAfiliado,
                    observaciones: data.ingreso.observaciones,
                    obraSocialId: data.ingreso.obraSocialId,
                    planId: data.ingreso.planId,
                    fechaEstado: new Date(),
                    usuario: usuario.trim().slice(0, 10) || 'SISTEMA',
                },
            })
        }

        if (data.paciente) {
            const ingreso = await tx.ingreso.findUnique({
                where: { id: ingresoId },
                select: { pacienteId: true },
            })

            if (ingreso?.pacienteId) {
                await tx.paciente.update({
                    where: { id: ingreso.pacienteId },
                    data: {
                        apellido: data.paciente.apellido,
                        nombre: data.paciente.nombre,
                        nombreCompleto: data.paciente.nombreCompleto,
                        numeroDocumento: data.paciente.numeroDocumento,
                        celular1: data.paciente.celular1,
                        email: data.paciente.email,
                        domicilio: data.paciente.domicilio,
                        fechaModificacion: new Date(),
                    },
                })
            }
        }
    })
}

export async function cargarOrdenesDesdePrestaciones(
    data: CargarOrdenesFacturacionInput,
    usuario: string
): Promise<OrdenFacturacionResultado> {
    void usuario
    const ingreso = await prisma.ingreso.findUnique({
        where: { id: data.ingresoId },
        select: {
            id: true,
            pacienteId: true,
            tipoIngresoCodigo: true,
            nombre: true,
            numeroAfiliado: true,
            obraSocialId: true,
            planId: true,
            obraSocialCoseguroId: true,
            planCoseguroId: true,
            descripcionPatologia: true,
            profesionalTratanteId: true,
            profesionalGuardiaId: true,
            obraSocial: { select: { nombre: true } },
        },
    })

    if (!ingreso) throw new Error('Ingreso no encontrado')
    if (!ingreso.obraSocialId) {
        throw new Error('El ingreso no tiene obra social cargada')
    }

    let prestacionesOrigen = data.prestaciones

    if (data.facturarTodo || prestacionesOrigen.length === 0) {
        const practicasPendientes = await prisma.practica.findMany({
            where: {
                ingresoId: data.ingresoId,
                facturable: true,
                ordenNumero: null,
                AND: [
                    { numeroAutorizacion: { not: null } },
                    { numeroAutorizacion: { not: '' } },
                ],
            },
            orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
            select: {
                id: true,
                convenioId: true,
                codigoPractica: true,
                cantidad: true,
                ordenItem: true,
                numeroAutorizacion: true,
                matriculaEspecialista: true,
                matriculaAnestesista: true,
                nomencladorPractica: { select: { descripcion: true } },
            },
        })

        prestacionesOrigen = practicasPendientes.map((p) => ({
            practicaId: p.id,
            convenioId: p.convenioId,
            codigoPractica: p.codigoPractica.trim(),
            descripcionPractica: p.nomencladorPractica?.descripcion ?? p.codigoPractica.trim(),
            cantidad: Number(p.cantidad),
            incluyeCodigo: null,
            numeroAutorizacion: p.numeroAutorizacion,
            matriculaEspecialista: p.matriculaEspecialista,
            matriculaAnestesista: p.matriculaAnestesista,
            grupoOrden: p.ordenItem && p.ordenItem > 0 ? p.ordenItem : 1,
            titularModular: data.titularModular ?? null,
        }))
    }

    const prestacionesPreparadas = prestacionesOrigen.map((p, idx) => ({
        ...p,
        practicaId: p.practicaId ?? null,
        grupoOrden: Number.isFinite(Number(p.grupoOrden)) && Number(p.grupoOrden) > 0
            ? Math.floor(Number(p.grupoOrden))
            : 1,
        ordenIndice: idx,
        numeroAutorizacion:
            typeof p.numeroAutorizacion === 'string' ? p.numeroAutorizacion.trim() : p.numeroAutorizacion,
    }))

    const prestacionesSinAutorizacion = prestacionesPreparadas.filter(
        (p) => !tieneNumeroAutorizacionValido(p.numeroAutorizacion)
    )
    if (prestacionesSinAutorizacion.length > 0) {
        throw new Error('No se puede facturar sin número de autorización. Confirmá la orden primero.')
    }

    if (prestacionesPreparadas.length === 0) {
        throw new Error('No hay practicas pendientes para facturar en este ingreso')
    }

    const vinculosOrdenExistente = await resolverVinculosOrdenExistenteFacturacion(
        data.ingresoId,
        prestacionesPreparadas.map((p) => ({
            practicaId: p.practicaId,
            convenioId: p.convenioId,
            codigoPractica: p.codigoPractica,
            cantidad: Number(p.cantidad),
            incluyeCodigo: p.incluyeCodigo,
            numeroAutorizacion: p.numeroAutorizacion,
            ordenIndice: p.ordenIndice,
        }))
    )

    const prestacionesConOrdenExistente = prestacionesPreparadas.filter(
        (p) => Boolean(p.practicaId && vinculosOrdenExistente.has(p.practicaId))
    )
    const prestacionesParaGenerarOrden = prestacionesPreparadas.filter(
        (p) => !(p.practicaId && vinculosOrdenExistente.has(p.practicaId))
    )

    if (prestacionesConOrdenExistente.length > 0) {
        const practicaIdsConOrdenExistente = Array.from(
            new Set(
                prestacionesConOrdenExistente
                    .map((prestacion) => prestacion.practicaId)
                    .filter((id): id is number => Boolean(id))
            )
        )

        if (practicaIdsConOrdenExistente.length > 0) {
            await prisma.orden.updateMany({
                where: {
                    ingresoId: data.ingresoId,
                    estado: 'X',
                    items: {
                        some: {
                            practicaId: { in: practicaIdsConOrdenExistente },
                        },
                    },
                },
                data: {
                    estado: 'A',
                    fechaEstado: new Date(),
                },
            })
        }

        const updatesPractica = prestacionesConOrdenExistente.flatMap((prestacion) => {
            const practicaId = prestacion.practicaId as number
            const vinculo = vinculosOrdenExistente.get(practicaId)
            if (!vinculo) return []

            return [
                prisma.practica.update({
                    where: { id: practicaId },
                    data: {
                        puestoNumero: vinculo.puestoNumero,
                        ordenNumero: vinculo.ordenNumero,
                        ordenItem: vinculo.item,
                    },
                }),
            ]
        })
        if (updatesPractica.length > 0) {
            await prisma.$transaction(updatesPractica)
        }

        const updatesOrdenPractica = prestacionesConOrdenExistente.flatMap((prestacion) => {
            const practicaId = prestacion.practicaId as number
            const vinculo = vinculosOrdenExistente.get(practicaId)
            if (!vinculo) return []

            const incluyeNormalizado = normalizarIncluyeCodigo(prestacion.incluyeCodigo)
            const modulosCompatibles = incluyeNormalizado
                ? Array.from(new Set([incluyeNormalizado, ...incluyeNormalizado.split('+')]))
                : []
            const codigoNormalizado = normalizarCodigoPractica(prestacion.codigoPractica)

            if (modulosCompatibles.length > 1) {
                return [
                    prisma.ordenPractica.updateMany({
                        where: {
                            puestoNumero: vinculo.puestoNumero,
                            ordenNumero: vinculo.ordenNumero,
                            convenioId: prestacion.convenioId,
                            codigoPractica: { startsWith: codigoNormalizado },
                            modulo: { in: modulosCompatibles },
                            OR: [
                                { practicaId: null },
                                { practicaId },
                            ],
                        },
                        data: { practicaId },
                    }),
                ]
            }

            return [
                prisma.ordenPractica.updateMany({
                    where: {
                        puestoNumero: vinculo.puestoNumero,
                        ordenNumero: vinculo.ordenNumero,
                        item: vinculo.item,
                        OR: [
                            { practicaId: null },
                            { practicaId },
                        ],
                    },
                    data: { practicaId },
                }),
            ]
        })
        if (updatesOrdenPractica.length > 0) {
            await prisma.$transaction(updatesOrdenPractica)
        }

        await prisma.$transaction(async (tx) => {
            const ordenesARecalcular = new Set<string>()
            const redondear2 = (value: number) => Number(value.toFixed(2))

            for (const prestacion of prestacionesConOrdenExistente) {
                const practicaId = prestacion.practicaId as number
                const vinculo = vinculosOrdenExistente.get(practicaId)
                if (!vinculo) continue

                const totalObjetivo = Number(prestacion.importeTotal ?? 0)
                if (!Number.isFinite(totalObjetivo) || totalObjetivo <= 0) continue

                ordenesARecalcular.add(`${vinculo.puestoNumero}:${vinculo.ordenNumero}`)

                const incluyeNormalizado = normalizarIncluyeCodigo(prestacion.incluyeCodigo)
                const modulosCompatibles = incluyeNormalizado
                    ? Array.from(new Set([incluyeNormalizado, ...incluyeNormalizado.split('+')]))
                    : []
                const codigoNormalizado = normalizarCodigoPractica(prestacion.codigoPractica)

                if (modulosCompatibles.length > 1) {
                    const itemsCompatibles = await tx.ordenPractica.findMany({
                        where: {
                            puestoNumero: vinculo.puestoNumero,
                            ordenNumero: vinculo.ordenNumero,
                            convenioId: prestacion.convenioId,
                            codigoPractica: { startsWith: codigoNormalizado },
                            modulo: { in: modulosCompatibles },
                            practicaId,
                        },
                        select: {
                            item: true,
                            importeTotal: true,
                        },
                        orderBy: { item: 'asc' },
                    })

                    if (itemsCompatibles.length === 0) continue

                    const sumaActual = itemsCompatibles.reduce(
                        (sum, it) => sum + Number(it.importeTotal ?? 0),
                        0
                    )

                    if (sumaActual > 0) {
                        let acumulado = 0
                        for (let i = 0; i < itemsCompatibles.length; i += 1) {
                            const it = itemsCompatibles[i]
                            const esUltimo = i === itemsCompatibles.length - 1
                            const nuevoImporte = esUltimo
                                ? redondear2(totalObjetivo - acumulado)
                                : redondear2((Number(it.importeTotal ?? 0) / sumaActual) * totalObjetivo)
                            acumulado += nuevoImporte

                            await tx.ordenPractica.updateMany({
                                where: {
                                    puestoNumero: vinculo.puestoNumero,
                                    ordenNumero: vinculo.ordenNumero,
                                    item: it.item,
                                    practicaId,
                                },
                                data: { importeTotal: nuevoImporte },
                            })
                        }
                    } else {
                        const cantidadItems = itemsCompatibles.length
                        let acumulado = 0
                        for (let i = 0; i < itemsCompatibles.length; i += 1) {
                            const it = itemsCompatibles[i]
                            const esUltimo = i === itemsCompatibles.length - 1
                            const nuevoImporte = esUltimo
                                ? redondear2(totalObjetivo - acumulado)
                                : redondear2(totalObjetivo / cantidadItems)
                            acumulado += nuevoImporte

                            await tx.ordenPractica.updateMany({
                                where: {
                                    puestoNumero: vinculo.puestoNumero,
                                    ordenNumero: vinculo.ordenNumero,
                                    item: it.item,
                                    practicaId,
                                },
                                data: { importeTotal: nuevoImporte },
                            })
                        }
                    }

                    continue
                }

                await tx.ordenPractica.updateMany({
                    where: {
                        puestoNumero: vinculo.puestoNumero,
                        ordenNumero: vinculo.ordenNumero,
                        item: vinculo.item,
                        practicaId,
                    },
                    data: { importeTotal: totalObjetivo },
                })
            }

            for (const key of ordenesARecalcular) {
                const [puestoStr, numeroStr] = key.split(':')
                const puestoNumero = Number(puestoStr)
                const ordenNumero = Number(numeroStr)
                if (!Number.isFinite(puestoNumero) || !Number.isFinite(ordenNumero)) continue

                const orden = await tx.orden.findUnique({
                    where: { puestoNumero_numero: { puestoNumero, numero: ordenNumero } },
                    select: { items: { select: { importeTotal: true } } },
                })
                if (!orden) continue

                const total = orden.items.reduce((sum, it) => sum + Number(it.importeTotal ?? 0), 0)
                await tx.orden.update({
                    where: { puestoNumero_numero: { puestoNumero, numero: ordenNumero } },
                    data: { importeTotal: total },
                })
            }
        })
    }

    const entradasOrdenesVinculadas: Array<[string, { puestoNumero: number; numero: number }]> = []
    for (const prestacion of prestacionesConOrdenExistente) {
        const practicaId = prestacion.practicaId as number
        const vinculo = vinculosOrdenExistente.get(practicaId)
        if (!vinculo) continue
        entradasOrdenesVinculadas.push([
            `${vinculo.puestoNumero}:${vinculo.ordenNumero}`,
            { puestoNumero: vinculo.puestoNumero, numero: vinculo.ordenNumero },
        ])
    }

    const ordenesVinculadas = Array.from(
        new Map(entradasOrdenesVinculadas).values()
    )

    if (prestacionesParaGenerarOrden.length > 0) {
        const pendientes = Array.from(
            new Set(
                prestacionesParaGenerarOrden.map((p) => {
                    const codigo = p.codigoPractica.trim()
                    const incluye = normalizarIncluyeCodigo(p.incluyeCodigo)
                    return incluye ? `${codigo} [${incluye}]` : codigo
                })
            )
        )
        throw new Error(
            `No se puede facturar sin orden autorizada vinculada para: ${pendientes.join(', ')}.`
        )
    }

    return {
        modo: data.modo,
        ordenes: ordenesVinculadas,
    }
}

export async function actualizarNumeroAutorizacion(
    data: ActualizarAutorizacionInput
): Promise<void> {
    if (data.tipo === 'PRACTICA') {
        await prisma.practica.update({
            where: { id: data.practicaId },
            data: { numeroAutorizacion: data.numeroAutorizacion ?? null },
        })
        return
    }

    await prisma.ordenPractica.update({
        where: {
            puestoNumero_ordenNumero_item: {
                puestoNumero: data.puestoNumero,
                ordenNumero: data.ordenNumero,
                item: data.item,
            },
        },
        data: { numeroAutorizacion: data.numeroAutorizacion ?? null },
    })
}

async function resolverPracticaDesdeInput(
    codigoPractica: string,
    descripcionPractica: string | null | undefined,
    convenioIdActual: number
): Promise<{ convenioId: number; codigoPractica: string }> {
    const codigo = codigoPractica.trim().slice(0, 8)
    const exacto = await prisma.nomencladorPractica.findFirst({
        where: {
            convenioId: convenioIdActual,
            codigo: { startsWith: codigo },
        },
        select: { convenioId: true, codigo: true },
    })
    if (exacto) return { convenioId: exacto.convenioId, codigoPractica: exacto.codigo.trim() }

    if (descripcionPractica?.trim()) {
        const porDescripcion = await prisma.nomencladorPractica.findFirst({
            where: { descripcion: { contains: descripcionPractica.trim(), mode: 'insensitive' } },
            select: { convenioId: true, codigo: true },
            orderBy: [{ convenioId: 'asc' }, { codigo: 'asc' }],
        })
        if (porDescripcion) {
            return { convenioId: porDescripcion.convenioId, codigoPractica: porDescripcion.codigo.trim() }
        }
    }

    return { convenioId: convenioIdActual, codigoPractica: codigo }
}

export async function actualizarPrestacionFacturacion(
    data: ActualizarPrestacionFacturacionInput
): Promise<void> {
    if (data.tipo === 'PRACTICA') {
        const actual = await prisma.practica.findUnique({
            where: { id: data.practicaId },
            select: { convenioId: true },
        })
        if (!actual) throw new Error('Práctica no encontrada')

        const resolved = await resolverPracticaDesdeInput(
            data.codigoPractica,
            data.descripcionPractica,
            actual.convenioId
        )

        await prisma.practica.update({
            where: { id: data.practicaId },
            data: {
                fecha: data.fecha,
                convenioId: resolved.convenioId,
                codigoPractica: resolved.codigoPractica.trim(),
                cantidad: data.cantidad,
                numeroAutorizacion: data.numeroAutorizacion ?? null,
                importeTotal: data.importeTotal,
                matriculaEspecialista: data.matriculaEspecialista ?? null,
                matriculaAnestesista: data.matriculaAnestesista ?? null,
                // Unlink from any existing order so it's treated as pending again
                puestoNumero: null,
                ordenNumero: null,
                ordenItem: null,
            },
        })
        return
    }

    const actualItem = await prisma.ordenPractica.findUnique({
        where: {
            puestoNumero_ordenNumero_item: {
                puestoNumero: data.puestoNumero,
                ordenNumero: data.ordenNumero,
                item: data.item,
            },
        },
        select: { convenioId: true },
    })
    if (!actualItem) throw new Error('Ítem de orden no encontrado')

    const resolved = await resolverPracticaDesdeInput(
        data.codigoPractica,
        data.descripcionPractica,
        actualItem.convenioId
    )

    await prisma.ordenPractica.update({
        where: {
            puestoNumero_ordenNumero_item: {
                puestoNumero: data.puestoNumero,
                ordenNumero: data.ordenNumero,
                item: data.item,
            },
        },
        data: {
            fecha: data.fecha,
            convenioId: resolved.convenioId,
            codigoPractica: resolved.codigoPractica.trim(),
            cantidad: data.cantidad,
            numeroAutorizacion: data.numeroAutorizacion ?? null,
            importeTotal: data.importeTotal,
        },
    })

    if (data.matriculaProfesional) {
        const profesional = await prisma.profesional.findFirst({
            where: { matricula: data.matriculaProfesional },
            select: { id: true },
        })
        if (profesional) {
            await prisma.orden.update({
                where: {
                    puestoNumero_numero: {
                        puestoNumero: data.puestoNumero,
                        numero: data.ordenNumero,
                    },
                },
                data: { profesionalId: profesional.id },
            })
        }
    }

    const orden = await prisma.orden.findUnique({
        where: { puestoNumero_numero: { puestoNumero: data.puestoNumero, numero: data.ordenNumero } },
        select: { ingresoId: true, items: { select: { importeTotal: true } } },
    })
    if (orden) {
        const total = orden.items.reduce((sum, it) => sum + Number(it.importeTotal ?? 0), 0)
        await prisma.orden.update({
            where: { puestoNumero_numero: { puestoNumero: data.puestoNumero, numero: data.ordenNumero } },
            data: { importeTotal: total },
        })

        if (orden.ingresoId) {
            await recalcularTotalesLotesPendientesPracticasPorIngreso(orden.ingresoId)
        }
    }
}

async function recalcularTotalesLotesPendientesPracticasPorIngreso(ingresoId: number): Promise<void> {
    const itemsPendientes = await prisma.loteFacturacionItem.findMany({
        where: {
            ingresoId,
            lote: {
                estado: 'PEN',
                tipo: 'PRACTICAS',
            },
        },
        select: {
            id: true,
            loteId: true,
            lote: {
                select: {
                    periodo: true,
                },
            },
        },
    })

    if (itemsPendientes.length === 0) return

    await prisma.$transaction(async (tx) => {
        for (const item of itemsPendientes) {
            const { desde, hasta } = periodoToDateRange(item.lote.periodo)

            const ordenes = await tx.orden.findMany({
                where: {
                    ingresoId,
                    estado: { not: 'X' },
                    fechaEmision: { gte: desde, lt: hasta },
                    OR: [
                        {
                            AND: [
                                { numeroAutorizacion: { not: null } },
                                { numeroAutorizacion: { not: '' } },
                            ],
                        },
                        {
                            items: {
                                some: {
                                    AND: [
                                        { numeroAutorizacion: { not: null } },
                                        { numeroAutorizacion: { not: '' } },
                                    ],
                                },
                            },
                        },
                    ],
                },
                select: {
                    numeroAutorizacion: true,
                    items: {
                        select: {
                            importeTotal: true,
                            numeroAutorizacion: true,
                        },
                    },
                },
            })

            const totalIngreso = ordenes
                .flatMap((o) => {
                    const ordenConAutorizacion = tieneNumeroAutorizacionValido(o.numeroAutorizacion)
                    return o.items.filter((it) =>
                        ordenConAutorizacion || tieneNumeroAutorizacionValido(it.numeroAutorizacion)
                    )
                })
                .reduce((sum, it) => sum + Number(it.importeTotal ?? 0), 0)

            await tx.loteFacturacionItem.update({
                where: { id: item.id },
                data: { importeTotal: totalIngreso },
            })
        }

        const loteIds = Array.from(new Set(itemsPendientes.map((it) => it.loteId)))
        for (const loteId of loteIds) {
            const incluidos = await tx.loteFacturacionItem.findMany({
                where: { loteId, incluido: true },
                select: { importeTotal: true },
            })
            const total = incluidos.reduce((sum, it) => sum + Number(it.importeTotal ?? 0), 0)
            await tx.loteFacturacion.update({
                where: { id: loteId },
                data: { importeTotal: total },
            })
        }
    })
}

export async function actualizarDiferencialesCirugiaFacturacion(
    data: ActualizarDiferencialesCirugiaFacturacionInput
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const cirugia = await tx.cirugiaProgramada.findFirst({
            where: {
                id: data.cirugiaProgramadaId,
                internacionId: data.ingresoId,
            },
            select: {
                id: true,
                fechaCirugia: true,
                practicas: {
                    select: {
                        codigo: true,
                        cantidad: true,
                    },
                },
            },
        })

        if (!cirugia) {
            throw new Error('Cirugía no encontrada para el ingreso indicado')
        }

        if (data.dobleCirugia && cirugia.practicas.length < 2) {
            throw new Error('Doble cirugía requiere al menos 2 prácticas quirúrgicas en la cirugía')
        }

        if (data.dobleCirugia && !data.practicaBaseId) {
            throw new Error('Debe seleccionar la cirugía base al 100% para usar doble cirugía')
        }

        if (data.practicaBaseId) {
            const practicaBase = await tx.practica.findFirst({
                where: {
                    id: data.practicaBaseId,
                    ingresoId: data.ingresoId,
                },
                select: {
                    id: true,
                    codigoPractica: true,
                    cantidad: true,
                    fecha: true,
                },
            })

            if (!practicaBase) {
                throw new Error('La práctica base seleccionada no pertenece al ingreso')
            }

            const clavePracticaBase = `${normalizarCodigoPracticaFacturacion(practicaBase.codigoPractica)}:${Number(practicaBase.cantidad)}:${fechaClave(practicaBase.fecha)}`
            const clavesCirugia = new Set(
                cirugia.practicas.map(
                    (p) => `${normalizarCodigoPracticaFacturacion(p.codigo)}:${Number(p.cantidad)}:${fechaClave(cirugia.fechaCirugia)}`
                )
            )

            if (!clavesCirugia.has(clavePracticaBase)) {
                throw new Error('La práctica base seleccionada no corresponde a la cirugía indicada')
            }
        }

        const payload = {
            esFeriado: data.esFeriado,
            esNocturna: data.esNocturna,
            mismaViaPatologia: data.mismaViaPatologia,
            diferentesViasPatologia: data.diferentesViasPatologia,
            diferentesViasDiferentesPatologia: data.diferentesViasDiferentesPatologia,
            dobleCirugia: data.dobleCirugia,
            practicaBaseId: data.dobleCirugia ? (data.practicaBaseId ?? null) : null,
        }

        const existentes = await tx.cirugiaDiferencial.count({
            where: { cirugiaId: cirugia.id },
        })

        if (existentes === 0) {
            await tx.cirugiaDiferencial.create({
                data: {
                    cirugiaId: cirugia.id,
                    tipo: 'QUIRURGICA',
                    descripcion: 'Diferenciales de cirugía configurados en facturación',
                    ...payload,
                },
            })
            return
        }

        await tx.cirugiaDiferencial.updateMany({
            where: { cirugiaId: cirugia.id },
            data: payload,
        })
    })
}

export async function anularOrdenFacturacion(puestoNumero: number, numero: number): Promise<void> {
    await prisma.$transaction(async (tx) => {
        // Unlink Practica records that were source of this order
        await tx.practica.updateMany({
            where: { puestoNumero, ordenNumero: numero },
            data: { puestoNumero: null, ordenNumero: null, ordenItem: null },
        })
        // Cancel the order
        await tx.orden.update({
            where: { puestoNumero_numero: { puestoNumero, numero } },
            data: { estado: 'X', fechaEstado: new Date() },
        })
    })
}

// ============================================
// LOTES DE FACTURACIÓN
// ============================================

const LOTE_SELECT = {
    id: true,
    numero: true,
    fecha: true,
    periodo: true,
    tipo: true,
    estado: true,
    origen: true,
    sedeId: true,
    descripcion: true,
    concepto: true,
    importeTotal: true,
    tipoIngresoCodigo: true,
    rangoDesde: true,
    rangoHasta: true,
    obraSocial: { select: { id: true, nombre: true } },
    plan: { select: { id: true, descripcion: true } },
} satisfies Prisma.LoteFacturacionSelect

function mapLoteRow(row: Prisma.LoteFacturacionGetPayload<{ select: typeof LOTE_SELECT }>): LoteFacturacionListItem {
    return {
        ...row,
        tipo: row.tipo as LoteFacturacionListItem['tipo'],
        estado: row.estado as EstadoLote,
        importeTotal: Number(row.importeTotal),
    }
}

export async function buscarLotes(
    params: BusquedaLotesInput
): Promise<{ items: LoteFacturacionListItem[]; total: number }> {
    const { periodo, estado, obraSocialId, tipo, medico, matricula, pagina, porPagina } = params
    const skip = (pagina - 1) * porPagina

    const where: Prisma.LoteFacturacionWhereInput = {}
    if (periodo) where.periodo = periodo
    if (estado) where.estado = estado
    if (obraSocialId) where.obraSocialId = obraSocialId
    if (tipo) where.tipo = tipo
    if (medico || matricula) {
        const especialistaWhere = buildEspecialistaOrdenWhere({ medico, matricula })
        const periodoOrdenWhere: Prisma.OrdenWhereInput = periodo
            ? (() => {
                const { desde, hasta } = periodoToDateRange(periodo)
                return { fechaEmision: { gte: desde, lt: hasta } }
            })()
            : {}
        where.items = {
            some: {
                ingreso: {
                    ordenes: {
                        some: {
                            AND: [buildOrdenAutorizadaWhere(), especialistaWhere, periodoOrdenWhere],
                        },
                    },
                },
            },
        }
    }

    const [total, rows] = await Promise.all([
        prisma.loteFacturacion.count({ where }),
        prisma.loteFacturacion.findMany({
            where,
            skip,
            take: porPagina,
            orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
            select: LOTE_SELECT,
        }),
    ])

    return { items: rows.map(mapLoteRow), total }
}

export async function buscarPracticasFacturadasProfesionalEnLotes(
    params: BusquedaLotesInput
): Promise<{ items: LotePracticaFacturadaProfesionalItem[]; total: number }> {
    const { periodo, estado, obraSocialId, tipo, medico, matricula, pagina, porPagina } = params

    if (!medico && !matricula) {
        return { items: [], total: 0 }
    }

    if (tipo && tipo !== 'PRACTICAS') {
        return { items: [], total: 0 }
    }

    const whereLote: Prisma.LoteFacturacionWhereInput = {
        tipo: 'PRACTICAS',
    }
    if (periodo) whereLote.periodo = periodo
    if (estado) whereLote.estado = estado
    if (obraSocialId) whereLote.obraSocialId = obraSocialId

    const lotes = await prisma.loteFacturacion.findMany({
        where: whereLote,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        select: {
            id: true,
            numero: true,
            estado: true,
            periodo: true,
            fecha: true,
            obraSocial: { select: { id: true, nombre: true } },
            plan: { select: { id: true, descripcion: true } },
            items: {
                where: { incluido: true },
                select: {
                    ingresoId: true,
                    ingreso: {
                        select: {
                            id: true,
                            tipoIngresoCodigo: true,
                            numeroIngreso: true,
                            paciente: { select: { id: true, nombreCompleto: true, numeroDocumento: true } },
                        },
                    },
                },
            },
        },
    })

    if (lotes.length === 0) {
        return { items: [], total: 0 }
    }

    const ingresoIds = Array.from(
        new Set(
            lotes
                .flatMap((lote) => lote.items.map((item) => item.ingresoId))
                .filter((id): id is number => Number.isFinite(id))
        )
    )

    if (ingresoIds.length === 0) {
        return { items: [], total: 0 }
    }

    const especialistaWhere = buildEspecialistaOrdenWhere({ medico, matricula })
    const ordenes = await prisma.orden.findMany({
        where: {
            ingresoId: { in: ingresoIds },
            estado: { not: 'X' },
            AND: [buildOrdenAutorizadaWhere(), especialistaWhere],
        },
        select: {
            ingresoId: true,
            puestoNumero: true,
            numero: true,
            fechaEmision: true,
            numeroAutorizacion: true,
            profesional: {
                select: {
                    id: true,
                    nombre: true,
                    matricula: true,
                },
            },
            items: {
                select: {
                    item: true,
                    codigoPractica: true,
                    cantidad: true,
                    numeroAutorizacion: true,
                    importeTotal: true,
                    nomencladorPractica: { select: { descripcion: true } },
                },
            },
        },
    })

    const ordenesPorIngreso = new Map<number, typeof ordenes>()
    for (const orden of ordenes) {
        const ingresoId = orden.ingresoId
        if (!ingresoId) continue
        const existentes = ordenesPorIngreso.get(ingresoId) ?? []
        existentes.push(orden)
        ordenesPorIngreso.set(ingresoId, existentes)
    }

    const filas: LotePracticaFacturadaProfesionalItem[] = []

    for (const lote of lotes) {
        const { desde, hasta } = periodoToDateRange(lote.periodo)

        for (const itemLote of lote.items) {
            const ingreso = itemLote.ingreso
            const ordenesIngreso = (ordenesPorIngreso.get(ingreso.id) ?? []).filter(
                (orden) => orden.fechaEmision >= desde && orden.fechaEmision < hasta
            )

            for (const orden of ordenesIngreso) {
                const ordenConAutorizacion = tieneNumeroAutorizacionValido(orden.numeroAutorizacion)
                for (const it of orden.items) {
                    const numeroAutorizacion = resolverNumeroAutorizacion(it.numeroAutorizacion, orden.numeroAutorizacion)
                    if (!ordenConAutorizacion && !tieneNumeroAutorizacionValido(numeroAutorizacion)) continue

                    filas.push({
                        loteId: lote.id,
                        loteNumero: lote.numero,
                        loteEstado: lote.estado as EstadoLote,
                        lotePeriodo: lote.periodo,
                        loteFecha: lote.fecha,
                        loteObraSocial: lote.obraSocial,
                        lotePlan: lote.plan,
                        ingresoId: ingreso.id,
                        tipoIngresoCodigo: ingreso.tipoIngresoCodigo,
                        numeroIngreso: ingreso.numeroIngreso,
                        paciente: ingreso.paciente,
                        profesional: orden.profesional,
                        ordenPuestoNumero: orden.puestoNumero,
                        ordenNumero: orden.numero,
                        ordenFechaEmision: orden.fechaEmision,
                        item: it.item,
                        codigoPractica: it.codigoPractica.trim(),
                        descripcionPractica: it.nomencladorPractica?.descripcion ?? null,
                        cantidad: Number(it.cantidad),
                        numeroAutorizacion,
                        importeTotal: Number(it.importeTotal ?? 0),
                    })
                }
            }
        }
    }

    filas.sort((a, b) => {
        const byLoteFecha = b.loteFecha.getTime() - a.loteFecha.getTime()
        if (byLoteFecha !== 0) return byLoteFecha

        const byIngreso = a.numeroIngreso - b.numeroIngreso
        if (byIngreso !== 0) return byIngreso

        const byOrdenFecha = b.ordenFechaEmision.getTime() - a.ordenFechaEmision.getTime()
        if (byOrdenFecha !== 0) return byOrdenFecha

        return a.item - b.item
    })

    const total = filas.length
    const skip = (pagina - 1) * porPagina
    const items = filas.slice(skip, skip + porPagina)

    return { items, total }
}

export async function obtenerLote(
    id: number,
    filtros?: { medico?: string; matricula?: number }
): Promise<LoteFacturacionDetalle | null> {
    const lote = await prisma.loteFacturacion.findUnique({
        where: { id },
        select: {
            ...LOTE_SELECT,
            itemsIPSTxt: {
                orderBy: [{ afiliadoNom: 'asc' }, { id: 'asc' }],
            },
        },
    })

    if (!lote) return null

    const especialistaWhere = buildEspecialistaOrdenWhere({
        medico: filtros?.medico,
        matricula: filtros?.matricula,
    })

    const [desde, hasta] = [periodoToDateRange(lote.periodo).desde, periodoToDateRange(lote.periodo).hasta]
    const whereIngresoFiltro: Prisma.IngresoWhereInput =
        filtros?.medico || filtros?.matricula
            ? {
                ordenes: {
                    some: {
                        AND: [
                            { estado: { not: 'X' } },
                            { fechaEmision: { gte: desde, lt: hasta } },
                            buildOrdenAutorizadaWhere(),
                            especialistaWhere,
                        ],
                    },
                },
            }
            : {}

    const itemsLote = await prisma.loteFacturacionItem.findMany({
        where: {
            loteId: id,
            ...(filtros?.medico || filtros?.matricula ? { ingreso: whereIngresoFiltro } : {}),
        },
        orderBy: [{ ingreso: { fechaIngreso: 'asc' } }, { id: 'asc' }],
        select: {
            id: true,
            loteId: true,
            ingresoId: true,
            incluido: true,
            importeTotal: true,
            ingreso: {
                select: {
                    id: true,
                    tipoIngresoCodigo: true,
                    numeroIngreso: true,
                    estado: true,
                    fechaIngreso: true,
                    fechaEgreso: true,
                    nombre: true,
                    numeroAfiliado: true,
                    descripcionPatologia: true,
                    paciente: { select: { id: true, nombreCompleto: true, numeroDocumento: true } },
                },
            },
        },
    })

    return {
        ...mapLoteRow(lote),
        items: itemsLote.map((item) => ({
            ...item,
            importeTotal: Number(item.importeTotal),
            paciente: item.ingreso.paciente,
        })) as LoteFacturacionItemDetalle[],
        itemsIPSTxt: lote.itemsIPSTxt.map((it) => ({
            ...it,
            impEsp: Number(it.impEsp),
            impAyu: Number(it.impAyu),
            impAne: Number(it.impAne),
            impGto: Number(it.impGto),
            impTotal: Number(it.impTotal),
            importePromedi: it.importePromedi !== null ? Number(it.importePromedi) : null,
        })) as LoteIPSTxtItemDetalle[],
    }
}

export async function crearLote(
    data: CrearLoteFacturacionInput,
    usuario: string
): Promise<{ id: number; numero: number }> {
    const now = new Date()
    const usuarioCod = usuario.trim().slice(0, 10) || 'SISTEMA'

    // Determine next numero
    const ultimo = await prisma.loteFacturacion.findFirst({
        orderBy: { numero: 'desc' },
        select: { numero: true },
    })
    const numero = (ultimo?.numero ?? 0) + 1
    const { desde, hasta } = periodoToDateRange(data.periodo)

    // Build where for ingreso resolution
    const whereIngreso: Prisma.IngresoWhereInput = {
        estado: { in: ['A', 'E'] },
        lotesItems: {
            none: {
                lote: {
                    estado: { in: ['PEN', 'CON'] },
                    tipo: data.tipo,
                },
            },
        },
    }
    if (data.tipoIngresoCodigo) whereIngreso.tipoIngresoCodigo = data.tipoIngresoCodigo
    if (data.clienteTipo === 'PARTICULAR') {
        whereIngreso.obraSocialId = null
    } else {
        if (!data.obraSocialId) {
            throw new Error('Debe seleccionar una obra social cuando el cliente es obra social')
        }
        whereIngreso.obraSocialId = data.obraSocialId
    }
    if (data.rangoDesde || data.rangoHasta) {
        whereIngreso.numeroIngreso = {
            ...(data.rangoDesde ? { gte: data.rangoDesde } : {}),
            ...(data.rangoHasta ? { lte: data.rangoHasta } : {}),
        }
    }
    // If no obraSocialId, could be particular (no OS). If obraSocialId is set, filter by it.

    // Filter ingresos that have at least one authorized prestacion of the right type
    if (data.tipo === 'PRACTICAS') {
        whereIngreso.ordenes = {
            some: {
                estado: { not: 'X' },
                fechaEmision: { gte: desde, lt: hasta },
                OR: [
                    {
                        AND: [
                            { numeroAutorizacion: { not: null } },
                            { numeroAutorizacion: { not: '' } },
                        ],
                    },
                    {
                        items: {
                            some: {
                                AND: [
                                    { numeroAutorizacion: { not: null } },
                                    { numeroAutorizacion: { not: '' } },
                                ],
                            },
                        },
                    },
                ],
            },
        }
    } else {
        whereIngreso.medicaciones = {
            some: {
                estado: { not: 'S' },
                fechaInicio: { gte: desde, lt: hasta },
            },
        }
    }

    const ingresos = await prisma.ingreso.findMany({
        where: whereIngreso,
        select: {
            id: true,
            ordenes: data.tipo === 'PRACTICAS'
                ? {
                    where: { estado: { not: 'X' }, fechaEmision: { gte: desde, lt: hasta } },
                    select: {
                        numeroAutorizacion: true,
                        items: {
                            select: { importeTotal: true, numeroAutorizacion: true },
                        },
                    },
                }
                : false,
            medicaciones: data.tipo === 'MEDICAMENTOS'
                ? {
                    where: { estado: { not: 'S' }, fechaInicio: { gte: desde, lt: hasta } },
                    select: { nombre: true },
                }
                : false,
        },
    })

    // Compute importe per ingreso
    const itemsData = ingresos.map((ing) => {
        let importe = 0
        if (data.tipo === 'PRACTICAS' && ing.ordenes) {
            const ordenes = ing.ordenes as unknown as Array<{
                numeroAutorizacion: string | null
                items: Array<{ importeTotal: unknown; numeroAutorizacion: string | null }>
            }>

            const itemsAutorizados = ordenes.flatMap((o) => {
                const ordenConAutorizacion = tieneNumeroAutorizacionValido(o.numeroAutorizacion)
                return o.items.filter((it) =>
                    ordenConAutorizacion || tieneNumeroAutorizacionValido(it.numeroAutorizacion)
                )
            })

            importe += itemsAutorizados
                .reduce((s: number, i) => s + Number(i.importeTotal ?? 0), 0)
        }
        if (data.tipo === 'MEDICAMENTOS' && ing.medicaciones) {
            importe += (ing.medicaciones as Array<{ nombre: string }>).reduce(
                (s, m) => s + precioFicticioMedicacion(m.nombre),
                0
            )
        }
        return { ingresoId: ing.id, importeTotal: importe, incluido: true }
    })

    const totalLote = itemsData.reduce((s, it) => s + it.importeTotal, 0)

    const lote = await prisma.loteFacturacion.create({
        data: {
            numero,
            fecha: data.fecha,
            periodo: data.periodo,
            tipo: data.tipo,
            obraSocialId: data.obraSocialId ?? null,
            planId: data.planId ?? null,
            tipoIngresoCodigo: data.tipoIngresoCodigo ?? null,
            rangoDesde: data.rangoDesde ?? null,
            rangoHasta: data.rangoHasta ?? null,
            sedeId: data.sedeId ?? null,
            descripcion: data.descripcion ?? null,
            concepto: data.concepto ?? null,
            importeTotal: totalLote,
            estado: 'PEN',
            fechaEstado: now,
            usuario: usuarioCod,
            items: { create: itemsData },
        },
        select: { id: true, numero: true },
    })

    return lote
}

export async function actualizarLote(
    id: number,
    data: ActualizarLoteFacturacionInput,
    usuario: string
): Promise<void> {
    const usuarioCod = usuario.trim().slice(0, 10) || 'SISTEMA'
    const result = await prisma.loteFacturacion.updateMany({
        where: { id, estado: 'PEN' },
        data: {
            fecha: data.fecha,
            periodo: data.periodo,
            tipoIngresoCodigo: data.tipoIngresoCodigo,
            descripcion: data.descripcion,
            concepto: data.concepto,
            sedeId: data.sedeId,
            rangoDesde: data.rangoDesde,
            rangoHasta: data.rangoHasta,
            fechaEstado: new Date(),
            usuario: usuarioCod,
        },
    })

    if (result.count === 0) {
        throw new Error('Solo se puede editar un lote pendiente')
    }
}

export async function cambiarEstadoLote(
    id: number,
    estado: 'CON' | 'ANU',
    usuario: string
): Promise<void> {
    const usuarioCod = usuario.trim().slice(0, 10) || 'SISTEMA'
    await prisma.loteFacturacion.update({
        where: { id },
        data: { estado, fechaEstado: new Date(), usuario: usuarioCod },
    })
}

export async function toggleItemLote(
    loteId: number,
    itemId: number,
    incluido: boolean
): Promise<void> {
    // Only allow toggle when lote is PEN
    const lote = await prisma.loteFacturacion.findUnique({ where: { id: loteId }, select: { estado: true } })
    if (!lote || lote.estado !== 'PEN') throw new Error('Solo se puede editar un lote pendiente')

    const updated = await prisma.loteFacturacionItem.updateMany({
        where: { id: itemId, loteId },
        data: { incluido },
    })

    if (updated.count === 0) throw new Error('Item de lote no encontrado')

    // Recompute importeTotal of the lote
    const items = await prisma.loteFacturacionItem.findMany({
        where: { loteId, incluido: true },
        select: { importeTotal: true },
    })
    const total = items.reduce((s, it) => s + Number(it.importeTotal), 0)
    await prisma.loteFacturacion.update({ where: { id: loteId }, data: { importeTotal: total } })
}

export async function obtenerOrdenesAutorizadasIngreso(
    ingresoId: number,
    filtros?: { medico?: string; matricula?: number; periodo?: string }
): Promise<OrdenAutorizadaLote[]> {
    const especialistaWhere = buildEspecialistaOrdenWhere({
        medico: filtros?.medico,
        matricula: filtros?.matricula,
    })

    const periodoWhere: Prisma.OrdenWhereInput = filtros?.periodo
        ? (() => {
            const { desde, hasta } = periodoToDateRange(filtros.periodo)
            return { fechaEmision: { gte: desde, lt: hasta } }
        })()
        : {}

    const ordenes = await prisma.orden.findMany({
        where: {
            ingresoId,
            estado: { not: 'X' },
            AND: [
                buildOrdenAutorizadaWhere(),
                especialistaWhere,
                periodoWhere,
            ],
        },
        orderBy: { fechaEmision: 'asc' },
        select: {
            puestoNumero: true,
            numero: true,
            fechaEmision: true,
            descripcion: true,
            numeroAutorizacion: true,
            importeTotal: true,
            items: {
                select: {
                    item: true,
                    fecha: true,
                    codigoPractica: true,
                    cantidad: true,
                    numeroAutorizacion: true,
                    importeTotal: true,
                    nomencladorPractica: { select: { descripcion: true } },
                },
            },
        },
    })

    return ordenes
        .map((o) => {
            const items = o.items
                .filter(
                    (it) =>
                        tieneNumeroAutorizacionValido(
                            resolverNumeroAutorizacion(it.numeroAutorizacion, o.numeroAutorizacion)
                        )
                )
                .map((it) => ({
                    item: it.item,
                    fecha: it.fecha,
                    codigoPractica: it.codigoPractica,
                    descripcion: it.nomencladorPractica?.descripcion ?? null,
                    cantidad: Number(it.cantidad),
                    numeroAutorizacion: resolverNumeroAutorizacion(it.numeroAutorizacion, o.numeroAutorizacion),
                    importeTotal: Number(it.importeTotal ?? 0),
                }))

            return {
                puestoNumero: o.puestoNumero,
                numero: o.numero,
                fechaEmision: o.fechaEmision,
                descripcion: o.descripcion,
                numeroAutorizacion: o.numeroAutorizacion,
                importeTotal: Number(o.importeTotal ?? 0),
                items,
            }
        })
        .filter((orden) => orden.items.length > 0)
}

// ============================================
// IPS TXT — PLANILLA DE PRESTACIONES
// ============================================

function redondear2Repo(valor: number): number {
    return Math.round((valor + Number.EPSILON) * 100) / 100
}

export async function crearLoteIPSTxt(
    data: CrearLoteIPSTxtInput,
    usuario: string
): Promise<{ id: number; numero: number }> {
    const now = new Date()
    const usuarioCod = usuario.trim().slice(0, 10) || 'SISTEMA'

    const ultimo = await prisma.loteFacturacion.findFirst({
        orderBy: { numero: 'desc' },
        select: { numero: true },
    })
    const numero = (ultimo?.numero ?? 0) + 1

    const totalBruto = data.items.reduce((s, it) => s + it.impTotal, 0)

    const obraSocialId = data.obraSocialId ?? (
        await prisma.obraSocial.findFirst({
            where: { nombre: { contains: 'IPS', mode: 'insensitive' } },
            select: { id: true },
            orderBy: { id: 'asc' },
        })
    )?.id

    if (!obraSocialId) {
        throw new Error('No se encontró la obra social IPS configurada para importar la planilla.')
    }

    const lote = await prisma.loteFacturacion.create({
        data: {
            numero,
            fecha: data.fecha,
            periodo: data.periodo,
            tipo: 'PRACTICAS',
            origen: 'IPS_TXT',
            obraSocialId,
            planId: data.planId ?? null,
            descripcion: data.descripcion ?? `Planilla IPS - ${data.periodo}`,
            concepto: 'PROMEDI IPS',
            importeTotal: totalBruto,
            estado: 'PEN',
            fechaEstado: now,
            usuario: usuarioCod,
            itemsIPSTxt: {
                create: data.items.map((it) => ({
                    afiliadoDoc: it.afiliadoDoc,
                    afiliadoNom: it.afiliadoNom,
                    nroOrden: it.nroOrden,
                    fechaRealiz: it.fechaRealiz ? new Date(it.fechaRealiz) : null,
                    servicioCodigo: it.servicioCodigo,
                    servicioNombre: it.servicioNombre,
                    cantidad: it.cantidad,
                    impEsp: it.impEsp,
                    impAyu: it.impAyu,
                    impAne: it.impAne,
                    impGto: it.impGto,
                    impTotal: it.impTotal,
                })),
            },
        },
        select: { id: true, numero: true },
    })

    return lote
}

const CODIGOS_PROMEDI_BASE = new Set([430101, 431001, 400101, 431002, 431103, 430130])
const CODIGOS_PROMEDI_BASE_ARRAY = Array.from(CODIGOS_PROMEDI_BASE)
const CODIGOS_EXCLUIDOS_PROMEDI_OSECAC = new Set([70116, 70607])

function parseCodigoPromedi(codigo: string | null | undefined): number | null {
    const parsed = parseInt((codigo ?? '').trim(), 10)
    if (isNaN(parsed)) return null
    return parsed
}

function codigoEnRangoBasePromedi(codigo: number): boolean {
    if (codigo >= 10101 && codigo <= 130304) return true
    if (codigo >= 720201 && codigo <= 722238) return true
    return false
}

function aplicaPromediIPS(codigoPractica: string | null | undefined): boolean {
    const codigo = parseCodigoPromedi(codigoPractica)
    if (codigo === null) return false
    return CODIGOS_PROMEDI_BASE.has(codigo) || codigoEnRangoBasePromedi(codigo)
}

function aplicaPromediOsecac(codigoPractica: string | null | undefined): boolean {
    const codigo = parseCodigoPromedi(codigoPractica)
    if (codigo === null) return false
    if (CODIGOS_EXCLUIDOS_PROMEDI_OSECAC.has(codigo)) return false
    return CODIGOS_PROMEDI_BASE.has(codigo) || codigoEnRangoBasePromedi(codigo)
}

export async function aplicarPromediLote(
    loteId: number,
    usuario: string
): Promise<{ importeTotal: number; cantidadItems: number }> {
    const lote = await prisma.loteFacturacion.findUnique({
        where: { id: loteId },
        select: {
            id: true,
            estado: true,
            origen: true,
            tipo: true,
            periodo: true,
            obraSocial: { select: { nombre: true } },
        },
    })

    if (!lote) throw new Error('Lote no encontrado')
    if (lote.estado !== 'PEN') throw new Error('Solo se puede aplicar PROMEDI a un lote pendiente')

    const usuarioCod = usuario.trim().slice(0, 10) || 'SISTEMA'

    if (lote.origen === 'IPS_TXT') {
        const PORCENTAJE_PROMEDI_IPS = 0.40

        const { totalPromedi, cantidadItems } = await prisma.$transaction(async (tx) => {
            const servicioCodigoNumericoSql = Prisma.sql`
                COALESCE(NULLIF(regexp_replace(trim("LipServCod"), '[^0-9]', '', 'g'), ''), '0')::integer
            `

            // Base 100% para todos los items del lote.
            await tx.$executeRaw`
                UPDATE "LoteIPSTxtItem"
                SET "LipImpPromedi" = ROUND("LipImpTotal", 2)
                WHERE "LotID" = ${loteId}
            `

            // Sobrescribe al 40% solo los codigos alcanzados por regla IPS.
            await tx.$executeRaw`
                UPDATE "LoteIPSTxtItem"
                SET "LipImpPromedi" = ROUND("LipImpTotal" * ${PORCENTAJE_PROMEDI_IPS}, 2)
                WHERE "LotID" = ${loteId}
                  AND (
                    ${servicioCodigoNumericoSql} IN (${Prisma.join(CODIGOS_PROMEDI_BASE_ARRAY)})
                    OR ${servicioCodigoNumericoSql} BETWEEN 10101 AND 130304
                    OR ${servicioCodigoNumericoSql} BETWEEN 720201 AND 722238
                  )
            `

            const [sumResult, itemsCount] = await Promise.all([
                tx.loteIPSTxtItem.aggregate({
                    where: { loteId },
                    _sum: { importePromedi: true },
                }),
                tx.loteIPSTxtItem.count({ where: { loteId } }),
            ])

            const total = redondear2Repo(Number(sumResult._sum.importePromedi ?? 0))

            await tx.loteFacturacion.update({
                where: { id: loteId },
                data: {
                    importeTotal: total,
                    estado: 'CON',
                    fechaEstado: new Date(),
                    usuario: usuarioCod,
                },
            })

            return { totalPromedi: total, cantidadItems: itemsCount }
        })

        return { importeTotal: totalPromedi, cantidadItems }
    }

    const esOsecac = esObraSocialOsecac(lote.obraSocial?.nombre)
    if (!esOsecac || lote.tipo !== 'PRACTICAS') {
        throw new Error('PROMEDI solo aplica a lotes IPS TXT o lotes de practicas OSECAC')
    }

    const { desde, hasta } = periodoToDateRange(lote.periodo)

    const loteItems = await prisma.loteFacturacionItem.findMany({
        where: { loteId },
        select: { id: true, ingresoId: true, incluido: true },
    })

    if (loteItems.length === 0) {
        await prisma.loteFacturacion.update({
            where: { id: loteId },
            data: { importeTotal: 0, estado: 'CON', fechaEstado: new Date(), usuario: usuarioCod },
        })
        return { importeTotal: 0, cantidadItems: 0 }
    }

    const ingresoIds = Array.from(new Set(loteItems.map((it) => it.ingresoId)))
    const ordenes = await prisma.orden.findMany({
        where: {
            ingresoId: { in: ingresoIds },
            estado: { not: 'X' },
            fechaEmision: { gte: desde, lt: hasta },
            OR: [
                {
                    AND: [
                        { numeroAutorizacion: { not: null } },
                        { numeroAutorizacion: { not: '' } },
                    ],
                },
                {
                    items: {
                        some: {
                            AND: [
                                { numeroAutorizacion: { not: null } },
                                { numeroAutorizacion: { not: '' } },
                            ],
                        },
                    },
                },
            ],
        },
        select: {
            ingresoId: true,
            numeroAutorizacion: true,
            items: {
                select: {
                    codigoPractica: true,
                    importeTotal: true,
                    numeroAutorizacion: true,
                },
            },
        },
    })

    const importePorIngreso = new Map<number, number>()
    const PORCENTAJE_PROMEDI_OSECAC = 0.20

    for (const orden of ordenes) {
        const ordenConAutorizacion = tieneNumeroAutorizacionValido(orden.numeroAutorizacion)
        for (const item of orden.items) {
            if (!ordenConAutorizacion && !tieneNumeroAutorizacionValido(item.numeroAutorizacion)) continue
            if (!orden.ingresoId) continue

            const importeItem = Number(item.importeTotal ?? 0)
            const importeFacturable = aplicaPromediOsecac(item.codigoPractica)
                ? redondear2Repo(importeItem * PORCENTAJE_PROMEDI_OSECAC)
                : redondear2Repo(importeItem)

            const actual = importePorIngreso.get(orden.ingresoId) ?? 0
            importePorIngreso.set(orden.ingresoId, redondear2Repo(actual + importeFacturable))
        }
    }

    const updatesItems = loteItems.map((it) =>
        prisma.loteFacturacionItem.update({
            where: { id: it.id },
            data: { importeTotal: redondear2Repo(importePorIngreso.get(it.ingresoId) ?? 0) },
        })
    )

    const totalPromedi = redondear2Repo(
        loteItems.reduce((s, it) => {
            const importe = redondear2Repo(importePorIngreso.get(it.ingresoId) ?? 0)
            return it.incluido ? s + importe : s
        }, 0)
    )

    await prisma.$transaction([
        ...updatesItems,
        prisma.loteFacturacion.update({
            where: { id: loteId },
            data: {
                importeTotal: totalPromedi,
                estado: 'CON',
                fechaEstado: new Date(),
                usuario: usuarioCod,
            },
        }),
    ])

    return { importeTotal: totalPromedi, cantidadItems: loteItems.length }
}

export async function obtenerItemsIPSTxt(loteId: number): Promise<LoteIPSTxtItemDetalle[]> {
    const items = await prisma.loteIPSTxtItem.findMany({
        where: { loteId },
        orderBy: [{ afiliadoNom: 'asc' }, { id: 'asc' }],
    })

    return items.map((it) => ({
        id: it.id,
        loteId: it.loteId,
        afiliadoDoc: it.afiliadoDoc,
        afiliadoNom: it.afiliadoNom,
        nroOrden: it.nroOrden,
        fechaRealiz: it.fechaRealiz,
        servicioCodigo: it.servicioCodigo,
        servicioNombre: it.servicioNombre,
        cantidad: it.cantidad,
        impEsp: Number(it.impEsp),
        impAyu: Number(it.impAyu),
        impAne: Number(it.impAne),
        impGto: Number(it.impGto),
        impTotal: Number(it.impTotal),
        importePromedi: it.importePromedi !== null ? Number(it.importePromedi) : null,
    }))
}
