import type { PracticaItem } from '@/modules/internacion/types'

export type GrupoPracticasAutorizadas = {
    key: string
    tipo: 'orden' | 'autorizacion'
    puestoNumero: number | null
    ordenNumero: number | null
    numeroAutorizacion: string | null
    fechaReferencia: Date | string
    totalCantidad: number
    matriculasFirmantes: number[]
    practicas: PracticaItem[]
}

type GrupoInterno = {
    key: string
    tipo: 'orden' | 'autorizacion'
    puestoNumero: number | null
    ordenNumero: number | null
    numeroAutorizacion: string | null
    fechaReferenciaMs: number
    totalCantidad: number
    matriculasFirmantes: Set<number>
    practicas: PracticaItem[]
    practicaIds: Set<number>
    coincideFiltro: boolean
}

function normalizarNumeroAutorizacion(value: string | null | undefined): string | null {
    const normalizado = value?.trim() ?? ''
    return normalizado.length > 0 ? normalizado : null
}

function toDateMs(value: Date | string | null | undefined): number {
    if (!value) return 0
    const ms = new Date(value).getTime()
    return Number.isFinite(ms) ? ms : 0
}

function obtenerMatriculasFirmantes(practica: PracticaItem): number[] {
    const matriculas = [practica.matriculaEspecialista, practica.matriculaAnestesista]
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)
    return Array.from(new Set(matriculas))
}

function asegurarGrupo(
    grupos: Map<string, GrupoInterno>,
    key: string,
    base: Pick<GrupoInterno, 'tipo' | 'puestoNumero' | 'ordenNumero'>
): GrupoInterno {
    const existente = grupos.get(key)
    if (existente) return existente

    const creado: GrupoInterno = {
        key,
        tipo: base.tipo,
        puestoNumero: base.puestoNumero,
        ordenNumero: base.ordenNumero,
        numeroAutorizacion: null,
        fechaReferenciaMs: 0,
        totalCantidad: 0,
        matriculasFirmantes: new Set<number>(),
        practicas: [],
        practicaIds: new Set<number>(),
        coincideFiltro: false,
    }

    grupos.set(key, creado)
    return creado
}

function actualizarGrupoConPractica(grupo: GrupoInterno, practica: PracticaItem, coincideFiltro: boolean) {
    grupo.coincideFiltro ||= coincideFiltro

    if (!grupo.practicaIds.has(practica.id)) {
        grupo.practicaIds.add(practica.id)
        grupo.practicas.push(practica)
        grupo.totalCantidad += Number.isFinite(practica.cantidad) ? practica.cantidad : 0

        const fechaMs = toDateMs(practica.fecha)
        if (fechaMs > grupo.fechaReferenciaMs) {
            grupo.fechaReferenciaMs = fechaMs
        }

        for (const matricula of obtenerMatriculasFirmantes(practica)) {
            grupo.matriculasFirmantes.add(matricula)
        }
    }
}

function actualizarGrupoConPracticaConFechaOrden(
    grupo: GrupoInterno,
    practica: PracticaItem,
    coincideFiltro: boolean,
    fechaOrden: Date | string | null | undefined
) {
    actualizarGrupoConPractica(grupo, practica, coincideFiltro)

    const fechaOrdenMs = toDateMs(fechaOrden)
    if (fechaOrdenMs > grupo.fechaReferenciaMs) {
        grupo.fechaReferenciaMs = fechaOrdenMs
    }
}

export function agruparPracticasAutorizadasPorOrden(
    practicasAutorizadas: PracticaItem[],
    practicaIdsFiltradas?: Set<number>
): GrupoPracticasAutorizadas[] {
    const grupos = new Map<string, GrupoInterno>()

    for (const practica of practicasAutorizadas) {
        const coincideFiltro = practicaIdsFiltradas ? practicaIdsFiltradas.has(practica.id) : true
        const numeroAutorizacionPractica = normalizarNumeroAutorizacion(practica.numeroAutorizacion)
        const ordenes = practica.ordenPractica ?? []

        if (ordenes.length > 0) {
            for (const orden of ordenes) {
                const key = `ORD-${orden.puestoNumero}-${orden.ordenNumero}`
                const grupo = asegurarGrupo(grupos, key, {
                    tipo: 'orden',
                    puestoNumero: orden.puestoNumero,
                    ordenNumero: orden.ordenNumero,
                })

                if (!grupo.numeroAutorizacion) {
                    grupo.numeroAutorizacion =
                        normalizarNumeroAutorizacion(orden.numeroAutorizacion) ?? numeroAutorizacionPractica
                }

                actualizarGrupoConPracticaConFechaOrden(
                    grupo,
                    practica,
                    coincideFiltro,
                    orden.fechaEmision
                )
            }
            continue
        }

        if (!numeroAutorizacionPractica) continue

        const key = `AUT-${numeroAutorizacionPractica}`
        const grupo = asegurarGrupo(grupos, key, {
            tipo: 'autorizacion',
            puestoNumero: null,
            ordenNumero: null,
        })

        if (!grupo.numeroAutorizacion) {
            grupo.numeroAutorizacion = numeroAutorizacionPractica
        }

        actualizarGrupoConPractica(grupo, practica, coincideFiltro)
    }

    const lista = Array.from(grupos.values())
    const filtrada = practicaIdsFiltradas ? lista.filter((grupo) => grupo.coincideFiltro) : lista

    return filtrada
        .map((grupo) => ({
            key: grupo.key,
            tipo: grupo.tipo,
            puestoNumero: grupo.puestoNumero,
            ordenNumero: grupo.ordenNumero,
            numeroAutorizacion: grupo.numeroAutorizacion,
            fechaReferencia: grupo.fechaReferenciaMs > 0 ? new Date(grupo.fechaReferenciaMs) : grupo.practicas[0]?.fecha ?? new Date(),
            totalCantidad: grupo.totalCantidad,
            matriculasFirmantes: Array.from(grupo.matriculasFirmantes).sort((a, b) => a - b),
            practicas: [...grupo.practicas].sort((a, b) => {
                const fechaDiff = toDateMs(b.fecha) - toDateMs(a.fecha)
                if (fechaDiff !== 0) return fechaDiff
                return a.codigoPractica.localeCompare(b.codigoPractica)
            }),
        }))
        .sort((a, b) => {
            const fechaDiff = toDateMs(b.fechaReferencia) - toDateMs(a.fechaReferencia)
            if (fechaDiff !== 0) return fechaDiff

            if (a.tipo !== b.tipo) return a.tipo === 'orden' ? -1 : 1

            if (a.puestoNumero !== b.puestoNumero) {
                return (b.puestoNumero ?? 0) - (a.puestoNumero ?? 0)
            }

            if (a.ordenNumero !== b.ordenNumero) {
                return (b.ordenNumero ?? 0) - (a.ordenNumero ?? 0)
            }

            return a.key.localeCompare(b.key)
        })
}

export function obtenerDestinoGrupoPracticasAutorizadas(grupo: GrupoPracticasAutorizadas): string | null {
    if (grupo.tipo === 'orden' && grupo.puestoNumero && grupo.ordenNumero) {
        return `/dashboard/ambulatorio/${grupo.puestoNumero}/${grupo.ordenNumero}`
    }

    const numero = normalizarNumeroAutorizacion(grupo.numeroAutorizacion)
    if (!numero) return null

    return `/dashboard/ambulatorio?tab=confirmadas&q=${encodeURIComponent(numero)}`
}
