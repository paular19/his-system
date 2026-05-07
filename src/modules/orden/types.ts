// ============================================
// TIPOS — MÓDULO ORDEN / AUTORIZACIÓN
// ============================================

export type OrdenPracticaItem = {
  puestoNumero: number
  ordenNumero: number
  item: number
  convenioId: number
  codigoPractica: string
  descripcionPractica: string
  cantidad: number
  tipoFacturacion: string
  numeroAutorizacion: string | null
  importeTotal: number | null
  porcentajeCargoPac: number | null
  fecha: Date
}

export type OrdenConItems = {
  puestoNumero: number
  numero: number
  ingresoId: number | null
  ingresoNumero: number | null
  ingresoTipoCodigo: string | null
  pacienteId: number | null
  nombrePaciente: string
  numeroAfiliado: string
  obraSocialId: number
  planId: number
  obraSocialCoseguroId: number | null
  planCoseguroId: number | null
  profesionalId: number
  tipoOrdenCodigo: string
  descripcion: string | null
  descripcionPatologia: string | null
  fechaEmision: Date
  fechaPedido: Date
  importeTotal: number | null
  estado: string
  usuarioRegistro: string
  items: OrdenPracticaItem[]
  obraSocial: { id: number; nombre: string } | null
  plan: { id: number; descripcion: string } | null
  profesional: { id: number; nombre: string; matricula: number | null } | null
  tipoOrden: { codigo: string; descripcion: string } | null
}

export type OrdenListItem = {
  puestoNumero: number
  numero: number
  ingresoId: number | null
  nombrePaciente: string
  obraSocialNombre: string
  planDescripcion: string
  fechaEmision: Date
  estado: string
  cantidadItems: number
  numeroAutorizacion: string | null
}

export type NomencladorPracticaItem = {
  convenioId: number
  codigo: string
  descripcion: string
  valor: number | null
}

export type AdmisionActivaItem = {
  id: number
  tipoIngresoCodigo: string
  numeroIngreso: number
  fechaIngreso: Date | null
  estado: string | null
  nombre: string | null
  paciente: {
    id: number
    nombreCompleto: string
    numeroDocumento: number | null
    obraSocialId: number | null
    numeroAfiliado: string | null
  } | null
  obraSocial: { id: number; nombre: string } | null
  plan: { id: number; descripcion: string } | null
}

export type AdmisionOrdenContexto = {
  id: number
  tipoIngresoCodigo: string
  numeroIngreso: number
  fechaIngreso: Date | null
  descripcionPatologia: string | null
  paciente: {
    id: number
    apellido: string
    nombre: string
    nombreCompleto: string
    tipoDocumento: string | null
    numeroDocumento: number | null
    fechaNacimiento: Date | null
    sexo: string | null
    domicilio: string | null
    telefonoFijo: string | null
    celular1: string | null
    email: string | null
    obraSocialId: number | null
    planId: number | null
    numeroAfiliado: string | null
  } | null
  obraSocialId: number | null
  planId: number | null
  numeroAfiliado: string | null
  obraSocial: { id: number; nombre: string } | null
  plan: { id: number; descripcion: string } | null
  practicas: Array<{
    id: number
    convenioId: number
    codigoPractica: string
    descripcionPractica: string
    cantidad: number
    fecha: Date
    numeroAutorizacion: string | null
    importeTotal: number | null
  }>
  medicaciones: Array<{
    id: number
    nombre: string
    dosis: string | null
    viaAdministracion: string | null
    frecuencia: string | null
    fechaInicio: Date
    estado: string
  }>
}

// Formato de número de orden para mostrar en pantalla
export function formatearNumeroOrden(puestoNumero: number, numero: number, item?: number): string {
  const base = `${puestoNumero.toString().padStart(4, '0')}-${numero.toString().padStart(8, '0')}`
  if (item !== undefined) return `${base}-${item.toString().padStart(2, '0')}`
  return base
}

// Número de autorización (15 dígitos): puesto(4) + numero(8) + item(3)
export function generarCodigoBarras(puestoNumero: number, numero: number, item: number): string {
  return (
    puestoNumero.toString().padStart(4, '0') +
    numero.toString().padStart(8, '0') +
    item.toString().padStart(3, '0')
  )
}
