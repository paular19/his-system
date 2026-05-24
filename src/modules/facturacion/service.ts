import { registrarAudit } from '@/lib/security/audit'
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
    CrearDescartableFacturacionInput,
    CrearMedicacionFacturacionInput,
    CrearPracticaFacturacionInput,
} from './schemas'
import * as repo from './repository'

export async function buscarAdmisionesFacturacion(params: BusquedaFacturacionInput) {
    return repo.buscarAdmisionesFacturacion(params)
}

export async function obtenerContextoFacturacion(ingresoId: number) {
    return repo.obtenerContextoFacturacion(ingresoId)
}

export async function crearPracticaFacturacion(
    data: CrearPracticaFacturacionInput,
    usuario: string,
    ip?: string
) {
    const practica = await repo.crearPracticaFacturacion(data, usuario)

    await registrarAudit({
        usuario,
        accion: 'CREAR',
        entidad: 'Practica',
        registroId: practica.id,
        detalle: `Alta de practica en facturacion para ingreso ${data.ingresoId}`,
        direccionIp: ip,
    })

    return practica
}

export async function crearMedicacionFacturacion(
    data: CrearMedicacionFacturacionInput,
    usuario: string,
    ip?: string
) {
    const medicacion = await repo.crearMedicacionFacturacion(data, usuario)

    await registrarAudit({
        usuario,
        accion: 'CREAR',
        entidad: 'MedicacionIngreso',
        registroId: medicacion.id,
        detalle: `Alta de medicacion en facturacion para ingreso ${data.ingresoId}`,
        direccionIp: ip,
    })

    return medicacion
}

export async function crearDescartableFacturacion(
    data: CrearDescartableFacturacionInput,
    usuario: string,
    ip?: string
) {
    const descartable = await repo.crearDescartableFacturacion(data, usuario)

    await registrarAudit({
        usuario,
        accion: 'CREAR',
        entidad: 'DescartableIngreso',
        registroId: descartable.id,
        detalle: `Alta de descartable en facturacion para ingreso ${data.ingresoId}`,
        direccionIp: ip,
    })

    return descartable
}

export async function actualizarContextoFacturacion(
    ingresoId: number,
    data: ActualizarContextoFacturacionInput,
    usuario: string,
    ip?: string
) {
    await repo.actualizarContextoFacturacion(ingresoId, data, usuario)

    await registrarAudit({
        usuario,
        accion: 'MODIFICAR',
        entidad: 'Ingreso',
        registroId: ingresoId,
        detalle: 'Edicion de datos en modulo facturacion',
        direccionIp: ip,
    })
}

export async function cargarOrdenesDesdePrestaciones(
    data: CargarOrdenesFacturacionInput,
    usuario: string,
    ip?: string
) {
    const resultado = await repo.cargarOrdenesDesdePrestaciones(data, usuario)

    await registrarAudit({
        usuario,
        accion: 'CREAR',
        entidad: 'Orden',
        registroId: data.ingresoId,
        detalle: `Facturacion ${resultado.modo} desde modulo facturacion`,
        direccionIp: ip,
    })

    return resultado
}

export async function actualizarNumeroAutorizacion(
    data: ActualizarAutorizacionInput,
    usuario: string,
    ip?: string
) {
    await repo.actualizarNumeroAutorizacion(data)

    await registrarAudit({
        usuario,
        accion: 'MODIFICAR',
        entidad: data.tipo === 'PRACTICA' ? 'Practica' : 'OrdenPrac',
        detalle: 'Actualizacion de numero de autorizacion',
        direccionIp: ip,
    })
}

export async function actualizarPrestacionFacturacion(
    data: ActualizarPrestacionFacturacionInput,
    usuario: string,
    ip?: string
) {
    await repo.actualizarPrestacionFacturacion(data)

    await registrarAudit({
        usuario,
        accion: 'MODIFICAR',
        entidad: data.tipo === 'PRACTICA' ? 'Practica' : 'OrdenPrac',
        detalle: 'Actualizacion integral de prestacion en facturacion',
        direccionIp: ip,
    })
}

export async function actualizarDiferencialesCirugiaFacturacion(
    data: ActualizarDiferencialesCirugiaFacturacionInput,
    usuario: string,
    ip?: string
) {
    await repo.actualizarDiferencialesCirugiaFacturacion(data)

    await registrarAudit({
        usuario,
        accion: 'MODIFICAR',
        entidad: 'CirugiaDiferencial',
        registroId: data.cirugiaProgramadaId,
        detalle: 'Actualizacion de diferenciales de cirugía desde facturacion',
        direccionIp: ip,
    })
}

export async function anularOrdenFacturacion(
    puestoNumero: number,
    numero: number,
    usuario: string,
    ip?: string
) {
    await repo.anularOrdenFacturacion(puestoNumero, numero)

    await registrarAudit({
        usuario,
        accion: 'MODIFICAR',
        entidad: 'Orden',
        registroId: `${puestoNumero}-${numero}`,
        detalle: `Anulacion de facturacion de orden ${puestoNumero}-${numero}`,
        direccionIp: ip,
    })
}

// ============================================
// LOTES DE FACTURACIÓN
// ============================================

export async function buscarLotes(params: BusquedaLotesInput) {
    return repo.buscarLotes(params)
}

export async function buscarPracticasFacturadasProfesionalEnLotes(params: BusquedaLotesInput) {
    return repo.buscarPracticasFacturadasProfesionalEnLotes(params)
}

export async function obtenerLote(id: number, filtros?: { medico?: string; matricula?: number }) {
    return repo.obtenerLote(id, filtros)
}

export async function crearLote(data: CrearLoteFacturacionInput, usuario: string, ip?: string) {
    const lote = await repo.crearLote(data, usuario)

    await registrarAudit({
        usuario,
        accion: 'CREAR',
        entidad: 'LoteFacturacion',
        registroId: lote.id,
        detalle: `Lote ${lote.numero} creado para periodo ${data.periodo}`,
        direccionIp: ip,
    })

    return lote
}

export async function actualizarLote(
    id: number,
    data: ActualizarLoteFacturacionInput,
    usuario: string,
    ip?: string
) {
    await repo.actualizarLote(id, data, usuario)

    await registrarAudit({
        usuario,
        accion: 'MODIFICAR',
        entidad: 'LoteFacturacion',
        registroId: id,
        detalle: 'Actualizacion de lote de facturacion',
        direccionIp: ip,
    })
}

export async function confirmarLote(id: number, usuario: string, ip?: string) {
    await repo.cambiarEstadoLote(id, 'CON', usuario)

    await registrarAudit({
        usuario,
        accion: 'MODIFICAR',
        entidad: 'LoteFacturacion',
        registroId: id,
        detalle: 'Lote confirmado',
        direccionIp: ip,
    })
}

export async function anularLote(id: number, usuario: string, ip?: string) {
    await repo.cambiarEstadoLote(id, 'ANU', usuario)

    await registrarAudit({
        usuario,
        accion: 'MODIFICAR',
        entidad: 'LoteFacturacion',
        registroId: id,
        detalle: 'Lote anulado',
        direccionIp: ip,
    })
}

export async function toggleItemLote(loteId: number, itemId: number, incluido: boolean) {
    return repo.toggleItemLote(loteId, itemId, incluido)
}

export async function obtenerOrdenesAutorizadasIngreso(
    ingresoId: number,
    filtros?: { medico?: string; matricula?: number; periodo?: string }
) {
    return repo.obtenerOrdenesAutorizadasIngreso(ingresoId, filtros)
}

export async function crearLoteIPSTxt(
    data: import('./schemas').CrearLoteIPSTxtInput,
    usuario: string,
    ip?: string
) {
    const lote = await repo.crearLoteIPSTxt(data, usuario)

    await registrarAudit({
        usuario,
        accion: 'CREAR',
        entidad: 'LoteFacturacion',
        registroId: lote.id,
        detalle: `Lote IPS TXT creado desde planilla - periodo ${data.periodo}`,
        direccionIp: ip,
    })

    return lote
}

export async function aplicarPromediLote(id: number, usuario: string, ip?: string) {
    const resultado = await repo.aplicarPromediLote(id, usuario)

    await registrarAudit({
        usuario,
        accion: 'MODIFICAR',
        entidad: 'LoteFacturacion',
        registroId: id,
        detalle: `PROMEDI aplicado - importe total: ${resultado.importeTotal}`,
        direccionIp: ip,
    })

    return resultado
}

export async function obtenerItemsIPSTxt(loteId: number) {
    return repo.obtenerItemsIPSTxt(loteId)
}
