"use server";

import { createIngresoAction } from '@/modules/admision/actions'
import { tienePermiso } from '@/lib/auth/rbac'
import { getUsuarioSesion } from '@/lib/auth'
import { CrearCirugiaProgramadaSchema } from './schemas'
import * as service from './service'
import type { CrearCirugiaProgramadaInput } from './types'
import type { ActualizacionAutorizacionCirugia } from './repository'

function construirObservacionesStructured(data: CrearCirugiaProgramadaInput) {
    const bloques = [
        data.diagnostico?.trim() ? `Diagnostico: ${data.diagnostico.trim()}` : null,
        data.observaciones?.trim() ? `Observaciones: ${data.observaciones.trim()}` : null,
        data.obraSocialId ? `ObraSocialID: ${data.obraSocialId}` : null,
        data.planId ? `PlanID: ${data.planId}` : null,
        data.obraSocialCoseguroId ? `CoseguroID: ${data.obraSocialCoseguroId}` : null,
        data.numeroAfiliado?.trim() ? `Afiliado: ${data.numeroAfiliado.trim()}` : null,
    ].filter(Boolean)

    return bloques.join(' | ').slice(0, 500)
}

export async function crearCirugiaProgramadaAction(data: CrearCirugiaProgramadaInput) {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'ADMISION', 'CREAR')) {
        throw new Error('Sin permisos para crear cirugias programadas')
    }

    const validado = CrearCirugiaProgramadaSchema.parse(data)

    const ingreso = await createIngresoAction({
        pacienteId: validado.pacienteId,
        tipoIngresoCodigo: 'INT',
        subtipoAdmisionCodigo: 'SUT',
        obraSocialId: validado.obraSocialId ?? null,
        planId: validado.planId ?? null,
        obraSocialCoseguroId: validado.obraSocialCoseguroId ?? null,
        numeroAfiliado: validado.numeroAfiliado ?? null,
        descripcionPatologia: validado.diagnostico ?? null,
        observaciones: validado.observaciones ?? null,
        practicas: validado.practicas.map((p) => ({
            convenioId: p.convenioId ?? validado.obraSocialId ?? null,
            codigo: p.codigo,
            descripcion: p.descripcion,
            cantidad: p.cantidad,
            grupoOrden: null,
            importeTotal: p.importeTotal ?? null,
            matriculaEspecialista: p.matriculaEspecialista ?? null,
            matriculaAnestesista: p.matriculaAnestesista ?? null,
        })),
        medicaciones: validado.medicaciones?.map((m) => ({
            nombre: m.nombre,
            dosis: m.dosis ?? null,
            viaAdministracion: m.viaAdministracion ?? null,
            frecuencia: m.frecuencia ?? null,
            observaciones: m.observaciones ?? null,
        })),
        descartables: validado.descartables?.map((d) => ({
            nombre: d.nombre,
            cantidad: d.cantidad,
            observaciones: d.observaciones ?? null,
        })),
    })

    const cirugia = await service.crearCirugiaProgramada({
        pacienteId: validado.pacienteId,
        fechaCirugia: validado.fechaCirugia,
        horaCirugia: validado.horaCirugia ?? null,
        camaId: validado.camaId ?? null,
        internacionId: ingreso.id,
        observaciones: construirObservacionesStructured(validado),
        practicas: validado.practicas,
        diferenciales: validado.diferenciales,
    })

    return { cirugiaId: cirugia.id, ingresoId: ingreso.id }
}

export async function actualizarNumerosAutorizacionAction(
    cirugiaId: number,
    actualizaciones: ActualizacionAutorizacionCirugia[]
) {
    const usuario = await getUsuarioSesion()
    if (!tienePermiso(usuario.rol, 'AMBULATORIO', 'MODIFICAR')) {
        throw new Error('Sin permisos para actualizar autorizaciones')
    }

    return service.actualizarNumerosAutorizacionPracticas(cirugiaId, actualizaciones)
}
