import { registrarAudit } from '@/lib/security/audit'
import { cambiarProfesionalOrden, crearOrdenInterna } from './repository'
import type { CrearOrdenInput } from './schemas'

export async function crearOrdenAmbulatorio(
  data: CrearOrdenInput,
  usuario: string,
  options?: {
    modoLigero?: boolean
  }
) {
  const orden = await crearOrdenInterna(data, usuario, options)

  void registrarAudit({
    usuario,
    accion: 'CREAR',
    entidad: 'Orden',
    registroId: `${orden.puestoNumero}-${orden.numero}`,
    detalle: `Nueva orden ambulatoria para paciente: ${data.nombrePaciente}`,
  }).catch(() => undefined)

  return orden
}

export async function crearOrdenesAmbulatoriasPorPractica(data: CrearOrdenInput, usuario: string) {
  const ordenes = [] as Array<{ puestoNumero: number; numero: number }>

  for (const item of data.items) {
    const orden = await crearOrdenAmbulatorio(
      {
        ...data,
        items: [item],
      },
      usuario
    )
    ordenes.push({ puestoNumero: orden.puestoNumero, numero: orden.numero })
  }

  await registrarAudit({
    usuario,
    accion: 'CREAR',
    entidad: 'Orden',
    registroId: data.ingresoId ?? data.pacienteId ?? 'N/A',
    detalle: `Generación individual de ${ordenes.length} órdenes desde admisión`,
  })

  return ordenes
}

export async function cambiarProfesionalOrdenAmbulatorio(
  params: {
    puestoNumero: number
    numero: number
    profesionalId: number
    actualizarEfectorEspecialista?: boolean
  },
  usuario: string,
  ip?: string
) {
  const resultado = await cambiarProfesionalOrden(params)

  const anterior = resultado.profesionalAnterior
    ? `${resultado.profesionalAnterior.nombre} (MP ${resultado.profesionalAnterior.matricula ?? '-'})`
    : 'sin profesional'
  const nuevo = `${resultado.profesionalNuevo.nombre} (MP ${resultado.profesionalNuevo.matricula ?? '-'})`

  await registrarAudit({
    usuario,
    accion: 'MODIFICAR',
    entidad: 'Orden',
    registroId: `${params.puestoNumero}-${params.numero}`,
    detalle:
      `Cambio de profesional que suscribe la orden ${params.puestoNumero}-${params.numero}: ` +
      `${anterior} -> ${nuevo}. ` +
      `Items con efector actualizado: ${resultado.itemsEfectorActualizados}. ` +
      `Practicas con especialista actualizado: ${resultado.practicasEspecialistaActualizadas}.`,
    direccionIp: ip,
  })

  return resultado
}
