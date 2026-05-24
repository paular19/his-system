import * as repo from './repository'
import type { PracticaCirugiaInput } from './types'
import type { ActualizacionAutorizacionCirugia } from './repository'

interface CrearCirugiaPersistidaInput {
    pacienteId: number
    fechaCirugia: string
    horaCirugia?: string | null
    camaId?: number | null
    internacionId?: number | null
    numeroAutorizacion?: string | null
    observaciones?: string | null
    practicas: PracticaCirugiaInput[]
    diferenciales?: {
        esFeriado: boolean
        esNocturna: boolean
        mismaViaPatologia: boolean
        diferentesViasPatologia: boolean
        diferentesViasDiferentesPatologia: boolean
        dobleCirugia: boolean
    }
}

export async function crearCirugiaProgramada(data: CrearCirugiaPersistidaInput) {
    return repo.guardarCirugiaProgramada(data)
}

export async function listarCirugiasProgramadas(params: {
    historico?: boolean
    q?: string
    pagina: number
    porPagina: number
}) {
    return repo.listarCirugiasProgramadas(params)
}

export async function obtenerCirugiaProgramadaConPracticas(id: number) {
    return repo.obtenerCirugiaProgramadaConPracticas(id)
}

export async function actualizarNumerosAutorizacionPracticas(
    cirugiaId: number,
    actualizaciones: ActualizacionAutorizacionCirugia[]
) {
    return repo.actualizarNumerosAutorizacionPracticas(cirugiaId, actualizaciones)
}

export async function obtenerCamasDisponibles(fechaCirugia: string, sector?: string) {
    return repo.obtenerCamasDisponibles(fechaCirugia, sector)
}
