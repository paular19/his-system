import { AsyncLocalStorage } from 'node:async_hooks'

interface AuditContextData {
    usuario?: string
    direccionIp?: string
    userAgent?: string
}

const auditContextStorage = new AsyncLocalStorage<AuditContextData>()

function limpiarContexto(input: AuditContextData): AuditContextData {
    return {
        usuario: input.usuario?.trim() || undefined,
        direccionIp: input.direccionIp?.trim() || undefined,
        userAgent: input.userAgent?.trim() || undefined,
    }
}

/**
 * Mezcla datos de contexto de auditoría para el flujo async actual.
 */
export function setAuditContext(data: AuditContextData): void {
    const previo = auditContextStorage.getStore() ?? {}
    auditContextStorage.enterWith({
        ...previo,
        ...limpiarContexto(data),
    })
}

/**
 * Obtiene el contexto activo de auditoría para la ejecución actual.
 */
export function getAuditContext(): AuditContextData {
    return auditContextStorage.getStore() ?? {}
}
