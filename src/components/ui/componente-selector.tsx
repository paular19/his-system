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

// Each field: 0 = not selected, 1 = selected once, 2+ = multiple (only ayudante supports >1)
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
    if (seleccion.especialista > 0) parts.push('Esp')
    if (seleccion.ayudante === 1) parts.push('Ayu')
    else if (seleccion.ayudante > 1) parts.push(`${seleccion.ayudante}×Ayu`)
    if (seleccion.anestesista > 0) parts.push('Ane')
    if (seleccion.gastos > 0) parts.push('Gto')
    if (parts.length === 0) return ''
    return ` [${parts.join(' + ')}]`
}

interface ComponenteSelectorProps {
    valores: ComponenteValores
    seleccion: ComponenteSeleccion
    onChange: (seleccion: ComponenteSeleccion) => void
    disabled?: boolean
}

export function ComponenteSelector({
    valores,
    seleccion,
    onChange,
    disabled = false,
}: ComponenteSelectorProps) {
    const tieneDesglose =
        valores.valorEspecialista != null ||
        valores.valorAyudante != null ||
        valores.valorAnestesista != null ||
        valores.valorGastos != null

    // Siempre mostrar el selector, aunque sea para selection manual sin valores
    const total = calcularTotalSeleccionado(valores, seleccion)

    const toggleBool = (key: 'especialista' | 'anestesista' | 'gastos') => {
        if (disabled) return
        onChange({ ...seleccion, [key]: seleccion[key] > 0 ? 0 : 1 })
    }

    return (
        <div className="rounded-lg border border-blue-100 bg-blue-50/30 px-3 py-2 space-y-1.5">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                Componentes a facturar {!tieneDesglose && <span className="text-amber-600">(sin valores del nomenclador)</span>}
            </p>
            {!tieneDesglose && (
                <p className="text-[10px] text-amber-700 italic">
                    Seleccionar los componentes que se facturarán. Sin valores definidos en nomenclador.
                </p>
            )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {/* Especialista */}
                <label className={`flex items-center justify-between gap-2 cursor-pointer select-none ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
                    <span className="flex items-center gap-1.5 min-w-0">
                        <input
                            type="checkbox"
                            checked={seleccion.especialista > 0}
                            onChange={() => toggleBool('especialista')}
                            disabled={disabled}
                            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className={`text-xs truncate ${seleccion.especialista > 0 ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                            Especialista
                        </span>
                    </span>
                    {valores.valorEspecialista != null && (
                        <span className={`text-xs font-mono shrink-0 ${seleccion.especialista > 0 ? 'text-gray-700' : 'text-gray-400'}`}>
                            {fmt.format(valores.valorEspecialista)}
                        </span>
                    )}
                </label>

                {/* Ayudante — con contador */}
                <div className={`flex items-center justify-between gap-2 ${disabled ? 'opacity-60' : ''}`}>
                    <span className="flex items-center gap-1.5 min-w-0">
                        <input
                            type="checkbox"
                            checked={seleccion.ayudante > 0}
                            onChange={() => onChange({ ...seleccion, ayudante: seleccion.ayudante > 0 ? 0 : 1 })}
                            disabled={disabled}
                            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className={`text-xs ${seleccion.ayudante > 0 ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                            Ayudante
                        </span>
                        {seleccion.ayudante > 0 && (
                            <span className="flex items-center gap-0.5 ml-1">
                                <button
                                    type="button"
                                    onClick={() => !disabled && onChange({ ...seleccion, ayudante: Math.max(1, seleccion.ayudante - 1) })}
                                    className="w-4 h-4 rounded text-[10px] bg-gray-200 hover:bg-gray-300 flex items-center justify-center leading-none"
                                    disabled={disabled}
                                >−</button>
                                <span className="text-xs font-semibold w-4 text-center">{seleccion.ayudante}</span>
                                <button
                                    type="button"
                                    onClick={() => !disabled && onChange({ ...seleccion, ayudante: seleccion.ayudante + 1 })}
                                    className="w-4 h-4 rounded text-[10px] bg-gray-200 hover:bg-gray-300 flex items-center justify-center leading-none"
                                    disabled={disabled}
                                >+</button>
                            </span>
                        )}
                    </span>
                    {valores.valorAyudante != null && (
                        <span className={`text-xs font-mono shrink-0 ${seleccion.ayudante > 0 ? 'text-gray-700' : 'text-gray-400'}`}>
                            {seleccion.ayudante > 1
                                ? fmt.format(valores.valorAyudante * seleccion.ayudante)
                                : fmt.format(valores.valorAyudante)}
                        </span>
                    )}
                </div>

                {/* Anestesista */}
                <label className={`flex items-center justify-between gap-2 cursor-pointer select-none ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
                    <span className="flex items-center gap-1.5 min-w-0">
                        <input
                            type="checkbox"
                            checked={seleccion.anestesista > 0}
                            onChange={() => toggleBool('anestesista')}
                            disabled={disabled}
                            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className={`text-xs truncate ${seleccion.anestesista > 0 ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                            Anestesista
                        </span>
                    </span>
                    {valores.valorAnestesista != null && (
                        <span className={`text-xs font-mono shrink-0 ${seleccion.anestesista > 0 ? 'text-gray-700' : 'text-gray-400'}`}>
                            {fmt.format(valores.valorAnestesista)}
                        </span>
                    )}
                </label>

                {/* Gastos */}
                <label className={`flex items-center justify-between gap-2 cursor-pointer select-none ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
                    <span className="flex items-center gap-1.5 min-w-0">
                        <input
                            type="checkbox"
                            checked={seleccion.gastos > 0}
                            onChange={() => toggleBool('gastos')}
                            disabled={disabled}
                            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className={`text-xs truncate ${seleccion.gastos > 0 ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                            Gastos
                        </span>
                    </span>
                    {valores.valorGastos != null && (
                        <span className={`text-xs font-mono shrink-0 ${seleccion.gastos > 0 ? 'text-gray-700' : 'text-gray-400'}`}>
                            {fmt.format(valores.valorGastos)}
                        </span>
                    )}
                </label>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-blue-100">
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Total seleccionado</span>
                <span className="text-xs font-semibold text-blue-700 font-mono">{fmt.format(total)}</span>
            </div>
        </div>
    )
}
