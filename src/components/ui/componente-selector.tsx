'use client'

const fmt = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
})

export interface ComponenteValores {
    valorEspecialista: number | null
    valorAyudante: number | null
    valorAnestesista: number | null
    valorGastos: number | null
    /** Valor total del nomenclador (suma de todos los componentes) */
    valorTotal: number | null
}

// Each field: 0 = not selected, 1 = selected once, 2+ = selected multiple times
export interface ComponenteSeleccion {
    especialista: number
    ayudante: number
    anestesista: number
    gastos: number
}

export function calcularTotalSeleccionado(
    valores: ComponenteValores,
    seleccion: ComponenteSeleccion
): number {
    const tieneDesglose =
        valores.valorEspecialista != null ||
        valores.valorAyudante != null ||
        valores.valorAnestesista != null ||
        valores.valorGastos != null

    if (!tieneDesglose) return valores.valorTotal ?? 0

    let total = 0
    if (seleccion.especialista > 0 && valores.valorEspecialista != null) total += valores.valorEspecialista * seleccion.especialista
    if (seleccion.ayudante > 0 && valores.valorAyudante != null) total += valores.valorAyudante * seleccion.ayudante
    if (seleccion.anestesista > 0 && valores.valorAnestesista != null) total += valores.valorAnestesista * seleccion.anestesista
    if (seleccion.gastos > 0 && valores.valorGastos != null) total += valores.valorGastos * seleccion.gastos
    return total
}

export function seleccionPorDefecto(valores: ComponenteValores): ComponenteSeleccion {
    return {
        especialista: valores.valorEspecialista != null ? 1 : 0,
        ayudante: valores.valorAyudante != null ? 1 : 0,
        anestesista: valores.valorAnestesista != null ? 1 : 0,
        gastos: valores.valorGastos != null ? 1 : 0,
    }
}

/** Build a short description suffix like " [Esp + 2×Ayu + Gto]" */
export function descripcionComponentes(seleccion: ComponenteSeleccion): string {
    const parts: string[] = []
    if (seleccion.especialista === 1) parts.push('Esp')
    else if (seleccion.especialista > 1) parts.push(`${seleccion.especialista}×Esp`)
    if (seleccion.ayudante === 1) parts.push('Ayu')
    else if (seleccion.ayudante > 1) parts.push(`${seleccion.ayudante}×Ayu`)
    if (seleccion.anestesista === 1) parts.push('Ane')
    else if (seleccion.anestesista > 1) parts.push(`${seleccion.anestesista}×Ane`)
    if (seleccion.gastos === 1) parts.push('Gto')
    else if (seleccion.gastos > 1) parts.push(`${seleccion.gastos}×Gto`)
    if (parts.length === 0) return ''
    return ` [${parts.join(' + ')}]`
}

interface ComponenteSelectorProps {
    valores: ComponenteValores
    seleccion: ComponenteSeleccion
    onChange: (seleccion: ComponenteSeleccion) => void
    disabled?: boolean
    /** Cantidad de la practica: multiplica los importes mostrados (no la seleccion). */
    cantidadPractica?: number
    clasificacionesPorComponente?: Partial<Record<keyof ComponenteSeleccion, Array<{
        index: number
        label: string
        value: string
    }>>>
    onClasificacionChange?: (index: number, value: string) => void
    clasificacionListId?: string
}

export function ComponenteSelector({
    valores,
    seleccion,
    onChange,
    disabled = false,
    cantidadPractica = 1,
    clasificacionesPorComponente,
    onClasificacionChange,
    clasificacionListId,
}: ComponenteSelectorProps) {
    const tieneDesglose =
        valores.valorEspecialista != null ||
        valores.valorAyudante != null ||
        valores.valorAnestesista != null ||
        valores.valorGastos != null
    const tieneValoresNomenclador = tieneDesglose || valores.valorTotal != null

    // Siempre mostrar el selector, aunque sea para selection manual sin valores
    const multiplicador = Number.isFinite(cantidadPractica) && cantidadPractica > 0
        ? Math.floor(cantidadPractica)
        : 1
    const total = calcularTotalSeleccionado(valores, seleccion) * multiplicador

    const normalizarCantidad = (cantidad: number, maximo: number): number => {
        if (!Number.isFinite(cantidad) || cantidad <= 0) return 0
        return Math.min(maximo, Math.floor(cantidad))
    }

    const cambiarCantidad = (key: keyof ComponenteSeleccion, maximo: number, cantidad: number) => {
        if (disabled) return
        onChange({ ...seleccion, [key]: normalizarCantidad(cantidad, maximo) })
    }

    const toggleCantidad = (key: keyof ComponenteSeleccion, maximo: number) => {
        const actual = normalizarCantidad(seleccion[key], maximo)
        cambiarCantidad(key, maximo, actual > 0 ? 0 : 1)
    }

    const renderFilaComponente = (
        key: keyof ComponenteSeleccion,
        label: string,
        valor: number | null,
        maximo: number
    ) => {
        const cantidad = normalizarCantidad(seleccion[key], maximo)
        const activo = cantidad > 0
        const puedeSumar = cantidad < maximo
        const importe = valor != null ? valor * cantidad * multiplicador : null
        const clasificacionesFila = clasificacionesPorComponente?.[key] ?? []

        return (
            <div className={`flex items-start justify-between gap-2 ${disabled ? 'opacity-60' : ''}`}>
                <div className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 min-w-0">
                        <input
                            type="checkbox"
                            checked={activo}
                            onChange={() => toggleCantidad(key, maximo)}
                            disabled={disabled}
                            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className={`text-xs truncate ${activo ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                            {label}
                        </span>
                        {activo && (
                            <span className="flex items-center gap-0.5 ml-1">
                                <button
                                    type="button"
                                    onClick={() => cambiarCantidad(key, maximo, cantidad - 1)}
                                    className="w-4 h-4 rounded text-[10px] bg-gray-200 hover:bg-gray-300 flex items-center justify-center leading-none"
                                    disabled={disabled}
                                >−</button>
                                <span className="text-xs font-semibold w-4 text-center">{cantidad}</span>
                                <button
                                    type="button"
                                    onClick={() => cambiarCantidad(key, maximo, cantidad + 1)}
                                    className="w-4 h-4 rounded text-[10px] bg-gray-200 hover:bg-gray-300 flex items-center justify-center leading-none"
                                    disabled={disabled || !puedeSumar}
                                >+</button>
                            </span>
                        )}
                    </span>
                    {activo && clasificacionesFila.length > 0 && onClasificacionChange && (
                        <div className="mt-1 ml-5 flex flex-wrap items-center gap-2">
                            {clasificacionesFila.map((clas) => (
                                <label key={`${key}-${clas.index}`} className="inline-flex items-center gap-1">
                                    <span className="text-[10px] text-gray-500">{clas.label}</span>
                                    <input
                                        type="text"
                                        value={clas.value}
                                        onChange={(e) => onClasificacionChange(clas.index, e.target.value)}
                                        list={clasificacionListId}
                                        placeholder="HE"
                                        className="w-16 rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-700"
                                    />
                                </label>
                            ))}
                        </div>
                    )}
                </div>
                {importe != null && (
                    <span className={`text-xs font-mono shrink-0 ${activo ? 'text-gray-700' : 'text-gray-400'}`}>
                        {fmt.format(importe)}
                    </span>
                )}
            </div>
        )
    }

    return (
        <div className="rounded-lg border border-blue-100 bg-blue-50/30 px-3 py-2 space-y-1.5">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                Componentes a facturar {!tieneValoresNomenclador && <span className="text-amber-600">(sin valores del nomenclador)</span>}
                {multiplicador > 1 && (
                    <span className="ml-1 text-blue-700 normal-case">
                        — importes ×{multiplicador} (cantidad de la práctica)
                    </span>
                )}
            </p>
            {!tieneValoresNomenclador && (
                <p className="text-[10px] text-amber-700 italic">
                    Seleccionar los componentes que se facturarán. Sin valores definidos en nomenclador.
                </p>
            )}
            {!tieneDesglose && valores.valorTotal != null && (
                <p className="text-[10px] text-blue-700 italic">
                    Sin desglose por componente. Se usa el valor total del nomenclador.
                </p>
            )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {renderFilaComponente('especialista', 'Especialista', valores.valorEspecialista, 99)}
                {renderFilaComponente('ayudante', 'Ayudante', valores.valorAyudante, 3)}
                {renderFilaComponente('anestesista', 'Anestesista', valores.valorAnestesista, 99)}
                {renderFilaComponente('gastos', 'Gastos', valores.valorGastos, 99)}
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-blue-100">
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Total seleccionado</span>
                <span className="text-xs font-semibold text-blue-700 font-mono">{fmt.format(total)}</span>
            </div>
        </div>
    )
}
