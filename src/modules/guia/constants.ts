export const GUIA_MODULOS_IDS = [
  'DASHBOARD',
  'PACIENTES',
  'ADMISION',
  'INTERNACION',
  'CIRUGIA',
  'TURNOS',
  'AUTORIZACIONES',
  'FACTURACION',
] as const

export type GuiaModuloId = (typeof GUIA_MODULOS_IDS)[number]

export const GUIA_MODULOS: Array<{
  id: GuiaModuloId
  nombre: string
  descripcion: string
  ruta: string
}> = [
    {
      id: 'DASHBOARD',
      nombre: 'Dashboard',
      descripcion: 'Vista general con metricas y accesos rapidos del sistema.',
      ruta: '/dashboard',
    },
    {
      id: 'PACIENTES',
      nombre: 'Pacientes',
      descripcion: 'Alta, busqueda y actualizacion de datos del paciente.',
      ruta: '/dashboard/pacientes',
    },
    {
      id: 'ADMISION',
      nombre: 'Admision',
      descripcion: 'Registro de ingresos, evoluciones administrativas y estado.',
      ruta: '/dashboard/admision',
    },
    {
      id: 'INTERNACION',
      nombre: 'Internacion',
      descripcion: 'Gestion de camas, movimientos y seguimiento clinico.',
      ruta: '/dashboard/internacion',
    },
    {
      id: 'CIRUGIA',
      nombre: 'Cirugia',
      descripcion: 'Carga de cirugias programadas y urgencias vinculadas.',
      ruta: '/dashboard/cirugia',
    },
    {
      id: 'TURNOS',
      nombre: 'Turnos',
      descripcion: 'Agenda de profesionales y administracion de turnos.',
      ruta: '/dashboard/turnos',
    },
    {
      id: 'AUTORIZACIONES',
      nombre: 'Autorizaciones',
      descripcion: 'Flujo de ordenes y autorizaciones ambulatorias.',
      ruta: '/dashboard/ambulatorio',
    },
    {
      id: 'FACTURACION',
      nombre: 'Facturacion',
      descripcion: 'Lotes, prestaciones y control de importes facturables.',
      ruta: '/dashboard/facturacion',
    },
  ]

export interface GuiaVideoItem {
  titulo: string
  url: string
}

export const GUIA_VIDEOS_POR_MODULO: Partial<Record<GuiaModuloId, GuiaVideoItem[]>> = {
  PACIENTES: [
    {
      titulo: 'Pacientes - Tutorial 1',
      url: 'https://www.youtube.com/watch?v=CvGK41onUwA',
    },
    {
      titulo: 'Pacientes - Tutorial 2',
      url: 'https://www.youtube.com/watch?v=YmdCoC5LJfA',
    },
  ],
  ADMISION: [
    {
      titulo: 'Admision - Tutorial 1',
      url: 'https://www.youtube.com/watch?v=gdXWOE6ipp4',
    },
    {
      titulo: 'Admision - Tutorial 2',
      url: 'https://www.youtube.com/watch?v=dqVDbYNGdiY',
    },
  ],
  AUTORIZACIONES: [
    {
      titulo: 'Autorizaciones - Tutorial 1',
      url: 'https://www.youtube.com/watch?v=LU28DCSYbFs',
    },
  ],
  CIRUGIA: [
    {
      titulo: 'Cirugia - Tutorial 1',
      url: 'https://www.youtube.com/watch?v=jiRB9IpkoAQ',
    },
    {
      titulo: 'Cirugia - Tutorial 2',
      url: 'https://www.youtube.com/watch?v=zjYY25fI470',
    },
    {
      titulo: 'Cirugia - Tutorial 3',
      url: 'https://www.youtube.com/watch?v=tgmF5CwxjXk',
    },
  ],
  FACTURACION: [
    {
      titulo: 'Facturacion - Tutorial 1',
      url: 'https://www.youtube.com/watch?v=yYGS7NR-Z9U',
    },
    {
      titulo: 'Facturacion - Tutorial 2',
      url: 'https://www.youtube.com/watch?v=VgBvAH7dlQc',
    },
    {
      titulo: 'Facturacion - Tutorial 3',
      url: 'https://www.youtube.com/watch?v=k0k2BYleVRk',
    },
  ],
  INTERNACION: [
    {
      titulo: 'Internacion - Tutorial 1',
      url: 'https://www.youtube.com/watch?v=lIFKonyUg2c',
    },
    {
      titulo: 'Internacion - Tutorial 2',
      url: 'https://youtube.com/watch?v=b21dg9sK4OY',
    },
  ],
}

export const GUIA_VIDEO_USABILIDAD: GuiaVideoItem = {
  titulo: 'Usabilidad general del sistema',
  url: 'https://www.youtube.com/watch?v=1daXFaGUYY8',
}

export const GUIA_TIPOS_FEEDBACK = [
  'BUG',
  'MEJORA',
  'DUDA',
  'USABILIDAD',
] as const

export type GuiaTipoFeedback = (typeof GUIA_TIPOS_FEEDBACK)[number]

export const GUIA_TIPO_LABELS: Record<GuiaTipoFeedback, string> = {
  BUG: 'Bug',
  MEJORA: 'Mejora',
  DUDA: 'Duda',
  USABILIDAD: 'Usabilidad',
}

export const GUIA_PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA'] as const

export type GuiaPrioridadFeedback = (typeof GUIA_PRIORIDADES)[number]

export function esGuiaModuloId(value: string): value is GuiaModuloId {
  return (GUIA_MODULOS_IDS as readonly string[]).includes(value)
}

export function esGuiaTipoFeedback(value: string): value is GuiaTipoFeedback {
  return (GUIA_TIPOS_FEEDBACK as readonly string[]).includes(value)
}

export function esGuiaPrioridadFeedback(value: string): value is GuiaPrioridadFeedback {
  return (GUIA_PRIORIDADES as readonly string[]).includes(value)
}
