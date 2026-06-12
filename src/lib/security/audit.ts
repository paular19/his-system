import { prisma } from '@/lib/db'

export type AccionAudit =
  | 'CREAR'
  | 'MODIFICAR'
  | 'ELIMINAR'
  | 'CONSULTAR'
  | 'LOGIN'
  | 'LOGOUT'
  | 'ACCESO_NEGADO'

interface RegistroAuditParams {
  usuario: string
  accion: AccionAudit
  entidad: string
  registroId?: string | number
  detalle?: string
  direccionIp?: string
  userAgent?: string
}

const AUDIT_LIMITS = {
  usuario: 100,
  accion: 50,
  entidad: 100,
  registroId: 50,
  direccionIp: 50,
  userAgent: 500,
} as const

function truncar(value: string | undefined, max: number): string | undefined {
  if (value == null) return undefined
  return value.length > max ? value.slice(0, max) : value
}

/**
 * Registra una acción de auditoría en la base de datos.
 * No lanza excepciones para no interrumpir el flujo principal.
 */
export async function registrarAudit(params: RegistroAuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        usuario: truncar(params.usuario, AUDIT_LIMITS.usuario) ?? 'SISTEMA',
        accion: truncar(params.accion, AUDIT_LIMITS.accion) as AccionAudit,
        entidad: truncar(params.entidad, AUDIT_LIMITS.entidad) ?? 'Desconocida',
        registroId: truncar(params.registroId?.toString(), AUDIT_LIMITS.registroId),
        detalle: params.detalle,
        direccionIp: truncar(params.direccionIp, AUDIT_LIMITS.direccionIp),
        userAgent: truncar(params.userAgent, AUDIT_LIMITS.userAgent),
      },
    })
  } catch (error) {
    // El fallo de auditoría no debe interrumpir la operación principal
    console.error('[AUDIT ERROR]', error)
  }
}

/**
 * Extrae la IP real del cliente considerando proxies y Vercel.
 */
export function extraerIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    // Tomar solo la primera IP (cliente original)
    const firstIp = forwarded.split(',')[0]?.trim()
    return firstIp ?? 'desconocida'
  }
  return request.headers.get('x-real-ip') ?? 'desconocida'
}
