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
