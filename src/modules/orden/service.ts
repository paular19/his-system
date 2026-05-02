import { registrarAudit } from '@/lib/security/audit'
import { crearOrden as crearOrdenRepo } from './repository'
import type { CrearOrdenInput } from './schemas'

export async function crearOrdenAmbulatorio(data: CrearOrdenInput, usuario: string) {
  const orden = await crearOrdenRepo(data, usuario)

  await registrarAudit({
    usuario,
    accion: 'CREAR',
    entidad: 'Orden',
    registroId: `${orden.puestoNumero}-${orden.numero}`,
    detalle: `Nueva orden ambulatoria para paciente: ${orden.nombrePaciente}`,
  })

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
