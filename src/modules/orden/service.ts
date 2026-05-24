import { registrarAudit } from '@/lib/security/audit'
import { crearOrdenInterna } from './repository'
import type { CrearOrdenInput } from './schemas'

type CrearOrdenAmbulatorioOpciones = {
  permitirCombinacionesYaAutorizadas?: boolean
}

export async function crearOrdenAmbulatorio(
  data: CrearOrdenInput,
  usuario: string,
  opciones: CrearOrdenAmbulatorioOpciones = {}
) {
  const orden = await crearOrdenInterna(data, usuario, opciones)

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
  return crearOrdenesAmbulatoriasPorPracticaConOpciones(data, usuario, {})
}

export async function crearOrdenesAmbulatoriasPorPracticaConOpciones(
  data: CrearOrdenInput,
  usuario: string,
  opciones: CrearOrdenAmbulatorioOpciones = {}
) {
  const ordenes = [] as Array<{ puestoNumero: number; numero: number }>

  for (const item of data.items) {
    const orden = await crearOrdenAmbulatorio(
      {
        ...data,
        items: [item],
      },
      usuario,
      opciones
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
