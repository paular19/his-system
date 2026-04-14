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

/**
 * Registra una acción de auditoría en la base de datos.
 * No lanza excepciones para no interrumpir el flujo principal.
 */
export async function registrarAudit(params: RegistroAuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        usuario: params.usuario,
        accion: params.accion,
        entidad: params.entidad,
        registroId: params.registroId?.toString(),
        detalle: params.detalle,
        direccionIp: params.direccionIp,
        userAgent: params.userAgent,
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
