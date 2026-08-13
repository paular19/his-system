export function puedeEditarPrestacionEnLote(estadoLote?: string | null): boolean {
    return (estadoLote ?? '').trim().toUpperCase() === 'PEN'
}
