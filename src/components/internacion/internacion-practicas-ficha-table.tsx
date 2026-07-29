'use client'

import { useEffect, useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import type { PracticaItem } from '@/modules/internacion/types'
import { formatearNumeroOrden } from '@/modules/orden/types'
import { formatearFechaArgentina } from '@/lib/utils/argentina-date'

type InternacionPracticasFichaTableProps = {
    practicas: PracticaItem[]
    obraSocialNombre: string | null
    pacienteNombre: string | null
    pacienteDni: number | string | null
}

type OrdenFila = {
    key: string
    puestoNumero: number
    numeroOrden: number
    fechaCarga: Date
    numeroAutorizacion: string | null
    codigos: string[]
    usuarios: string[]
    regOrden: number
}

function toDateInputValue(value: Date): string {
    const date = new Date(value)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')
}

export function InternacionPracticasFichaTable({
    practicas,
    obraSocialNombre,
    pacienteNombre,
    pacienteDni,
}: InternacionPracticasFichaTableProps) {
    const [tablaExpandida, setTablaExpandida] = useState(false)
    const [desde, setDesde] = useState('')
    const [hasta, setHasta] = useState('')
    const [usuarioFiltro, setUsuarioFiltro] = useState('')
    const [seleccionPorOrden, setSeleccionPorOrden] = useState<Record<string, boolean>>({})
    const [error, setError] = useState<string | null>(null)
    const hayFiltrosActivos = Boolean(desde || hasta || usuarioFiltro)

    useEffect(() => {
        if (hayFiltrosActivos) {
            setTablaExpandida(true)
        }
    }, [hayFiltrosActivos])

    const filas = useMemo<OrdenFila[]>(() => {
        const mapa = new Map<string, {
            puestoNumero: number
            numeroOrden: number
            fechaCarga: Date
            numeroAutorizacion: string | null
            codigos: Set<string>
            usuarios: Set<string>
        }>()

        for (const practica of practicas) {
            const estado = (practica.estado ?? 'A').trim().toUpperCase()
            if (estado === 'X') continue
            if ((practica.ordenPractica?.length ?? 0) === 0) continue

            const fechaPractica = new Date(practica.fecha)
            const codigo = practica.codigoPractica.trim()
            const usuario = (practica.usuario ?? '').trim()

            for (const orden of practica.ordenPractica) {
                if (!Number.isFinite(orden.puestoNumero) || !Number.isFinite(orden.ordenNumero)) continue

                const key = `${orden.puestoNumero}-${orden.ordenNumero}`
                const existente = mapa.get(key)
                const numeroAutorizacion = orden.numeroAutorizacion ?? practica.numeroAutorizacion ?? null

                if (!existente) {
                    mapa.set(key, {
                        puestoNumero: orden.puestoNumero,
                        numeroOrden: orden.ordenNumero,
                        fechaCarga: fechaPractica,
                        numeroAutorizacion,
                        codigos: new Set(codigo ? [codigo] : []),
                        usuarios: new Set(usuario ? [usuario] : []),
                    })
                    continue
                }

                if (fechaPractica.getTime() > existente.fechaCarga.getTime()) {
                    existente.fechaCarga = fechaPractica
                }
                if (!existente.numeroAutorizacion && numeroAutorizacion) {
                    existente.numeroAutorizacion = numeroAutorizacion
                }
                if (codigo) existente.codigos.add(codigo)
                if (usuario) existente.usuarios.add(usuario)
            }
        }

        const ordenadas = Array.from(mapa.entries())
            .map(([key, item]) => ({
                key,
                puestoNumero: item.puestoNumero,
                numeroOrden: item.numeroOrden,
                fechaCarga: item.fechaCarga,
                numeroAutorizacion: item.numeroAutorizacion,
                codigos: Array.from(item.codigos),
                usuarios: Array.from(item.usuarios).sort((a, b) => a.localeCompare(b, 'es')),
            }))
            .sort((a, b) => {
                const porFecha = b.fechaCarga.getTime() - a.fechaCarga.getTime()
                if (porFecha !== 0) return porFecha
                if (a.puestoNumero !== b.puestoNumero) return b.puestoNumero - a.puestoNumero
                return b.numeroOrden - a.numeroOrden
            })

        return ordenadas.map((item, index) => ({
            ...item,
            regOrden: index + 1,
        }))
    }, [practicas])

    const usuariosDisponibles = useMemo(() => {
        return Array.from(
            new Set(
                filas.flatMap((fila) => fila.usuarios)
            )
        ).sort((a, b) => a.localeCompare(b, 'es'))
    }, [filas])

    const filasFiltradas = useMemo(() => {
        return filas.filter((fila) => {
            const fechaFila = toDateInputValue(fila.fechaCarga)
            if (desde && fechaFila < desde) return false
            if (hasta && fechaFila > hasta) return false
            if (usuarioFiltro && !fila.usuarios.includes(usuarioFiltro)) return false
            return true
        })
    }, [filas, desde, hasta, usuarioFiltro])

    const todasFiltradasSeleccionadas =
        filasFiltradas.length > 0 && filasFiltradas.every((fila) => Boolean(seleccionPorOrden[fila.key]))

    const cantidadSeleccionadas = useMemo(() => {
        const seleccion = new Set(
            Object.entries(seleccionPorOrden)
                .filter(([, checked]) => checked)
                .map(([key]) => key)
        )
        return filas.filter((fila) => seleccion.has(fila.key)).length
    }, [seleccionPorOrden, filas])

    const toggleSeleccionFila = (key: string, checked: boolean) => {
        setSeleccionPorOrden((prev) => ({
            ...prev,
            [key]: checked,
        }))
    }

    const toggleSeleccionFiltradas = (checked: boolean) => {
        setSeleccionPorOrden((prev) => {
            const next = { ...prev }
            for (const fila of filasFiltradas) {
                next[fila.key] = checked
            }
            return next
        })
    }

    const limpiarFiltros = () => {
        setDesde('')
        setHasta('')
        setUsuarioFiltro('')
    }

    const imprimirSeleccionadas = () => {
        const seleccion = new Set(
            Object.entries(seleccionPorOrden)
                .filter(([, checked]) => checked)
                .map(([key]) => key)
        )
        const filasSeleccionadas = filas.filter((fila) => seleccion.has(fila.key))

        if (filasSeleccionadas.length === 0) {
            setError('Selecciona al menos una orden para imprimir')
            return
        }

        const ventana = window.open('', '_blank', 'width=1100,height=800')
        if (!ventana) {
            setError('No se pudo abrir la ventana de impresión')
            return
        }

        const obraSocial = escapeHtml((obraSocialNombre ?? 'SIN OBRA SOCIAL').trim() || 'SIN OBRA SOCIAL')
        const nombre = escapeHtml((pacienteNombre ?? 'SIN NOMBRE').trim() || 'SIN NOMBRE')
        const dni = escapeHtml(String(pacienteDni ?? '-'))

        const filasHtml = filasSeleccionadas
            .map((fila) => {
                const fecha = escapeHtml(formatearFechaArgentina(fila.fechaCarga, {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                }))
                const numeroAut = escapeHtml(fila.numeroAutorizacion?.trim() || '-')
                const codigos = escapeHtml(fila.codigos.join(', ') || '-')
                const regSistema = escapeHtml(formatearNumeroOrden(fila.puestoNumero, fila.numeroOrden))
                const regOrden = escapeHtml(String(fila.regOrden))

                return `
                    <tr>
                        <td>${fecha}</td>
                        <td>${numeroAut}</td>
                        <td>${codigos}</td>
                        <td>${regSistema}</td>
                        <td>${regOrden}</td>
                    </tr>
                `
            })
            .join('')

        const html = `
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="utf-8" />
                <title>Ficha de Practicas</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; color: #111827; }
                    .header { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 12px; font-size: 13px; }
                    .header div { border: 1px solid #9ca3af; padding: 6px 8px; min-height: 22px; }
                    table { width: 100%; border-collapse: collapse; font-size: 12px; }
                    th, td { border: 1px solid #4b5563; padding: 6px 8px; vertical-align: top; }
                    th { background: #f3f4f6; text-align: left; font-weight: 700; }
                    @page { size: A4 portrait; margin: 10mm; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div><strong>O.S:</strong> ${obraSocial}</div>
                    <div><strong>NOMBRE Y APELLIDO:</strong> ${nombre}</div>
                    <div><strong>DNI:</strong> ${dni}</div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>FECHA</th>
                            <th>N° ORDEN</th>
                            <th>CODIGOS AUTORIZADOS POR O.S o RESPONSABLE</th>
                            <th>REG. SISTEMA</th>
                            <th>REG. ORDEN</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filasHtml}
                    </tbody>
                </table>
            </body>
            </html>
        `

        ventana.document.open()
        ventana.document.write(html)
        ventana.document.close()

        let impresionDisparada = false
        const ejecutarImpresion = () => {
            if (impresionDisparada) return
            impresionDisparada = true
            try {
                ventana.focus()
                ventana.print()
            } catch {
                setError('No se pudo iniciar la impresión automáticamente. Verifica el bloqueador de ventanas emergentes.')
            }
        }

        ventana.onload = ejecutarImpresion
        // Fallback para navegadores que no disparan onload tras document.write.
        window.setTimeout(ejecutarImpresion, 500)

        setError(null)
    }

    return (
        <section className="his-card p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-semibold text-gray-900">Ficha de practicas</h3>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setTablaExpandida((prev) => !prev)}
                        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                        {tablaExpandida ? 'Ocultar tabla' : 'Mostrar tabla'}
                    </button>
                    <button
                        type="button"
                        onClick={imprimirSeleccionadas}
                        disabled={cantidadSeleccionadas === 0}
                        className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <Printer className="h-3.5 w-3.5" />
                        Imprimir seleccionadas ({cantidadSeleccionadas})
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-2 rounded-md border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700 md:grid-cols-3">
                <div>
                    <span className="font-semibold text-gray-800">O.S:</span> {obraSocialNombre ?? '-'}
                </div>
                <div>
                    <span className="font-semibold text-gray-800">Nombre:</span> {pacienteNombre ?? '-'}
                </div>
                <div>
                    <span className="font-semibold text-gray-800">DNI:</span> {pacienteDni ?? '-'}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-[180px_180px_minmax(180px,260px)_auto_auto] md:items-end">
                <label className="block text-xs text-gray-700">
                    Desde
                    <input
                        type="date"
                        value={desde}
                        onChange={(e) => setDesde(e.target.value)}
                        className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800"
                    />
                </label>

                <label className="block text-xs text-gray-700">
                    Hasta
                    <input
                        type="date"
                        value={hasta}
                        onChange={(e) => setHasta(e.target.value)}
                        className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800"
                    />
                </label>

                <label className="block text-xs text-gray-700">
                    Usuario
                    <select
                        value={usuarioFiltro}
                        onChange={(e) => setUsuarioFiltro(e.target.value)}
                        className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800"
                    >
                        <option value="">Todos</option>
                        {usuariosDisponibles.map((usuario) => (
                            <option key={usuario} value={usuario}>{usuario}</option>
                        ))}
                    </select>
                </label>

                <button
                    type="button"
                    onClick={limpiarFiltros}
                    className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                    Limpiar filtros
                </button>

                <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                    <input
                        type="checkbox"
                        checked={todasFiltradasSeleccionadas}
                        onChange={(e) => toggleSeleccionFiltradas(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Seleccionar filtradas
                </label>
            </div>

            {tablaExpandida ? (
                <div className="overflow-x-auto rounded-md border border-gray-200">
                    <table className="min-w-full text-xs">
                        <thead className="bg-gray-100 text-gray-700">
                            <tr>
                                <th className="px-2 py-1 text-left">
                                    <span className="sr-only">Seleccion</span>
                                </th>
                                <th className="px-2 py-1 text-left">Fecha</th>
                                <th className="px-2 py-1 text-left">N° orden (autorizacion)</th>
                                <th className="px-2 py-1 text-left">Codigos autorizados</th>
                                <th className="px-2 py-1 text-left">Reg. sistema</th>
                                <th className="px-2 py-1 text-left">Reg. orden</th>
                                <th className="px-2 py-1 text-left">Usuario</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filasFiltradas.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-3 py-3 text-center text-gray-500">
                                        No hay ordenes para los filtros seleccionados.
                                    </td>
                                </tr>
                            ) : (
                                filasFiltradas.map((fila) => (
                                    <tr key={fila.key} className="border-t border-gray-200 text-gray-800">
                                        <td className="px-2 py-1.5">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(seleccionPorOrden[fila.key])}
                                                onChange={(e) => toggleSeleccionFila(fila.key, e.target.checked)}
                                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                        </td>
                                        <td className="px-2 py-1.5">
                                            {formatearFechaArgentina(fila.fechaCarga, {
                                                day: '2-digit',
                                                month: '2-digit',
                                                year: 'numeric',
                                            })}
                                        </td>
                                        <td className="px-2 py-1.5">{fila.numeroAutorizacion?.trim() || '-'}</td>
                                        <td className="px-2 py-1.5">{fila.codigos.join(', ') || '-'}</td>
                                        <td className="px-2 py-1.5">{formatearNumeroOrden(fila.puestoNumero, fila.numeroOrden)}</td>
                                        <td className="px-2 py-1.5">{fila.regOrden}</td>
                                        <td className="px-2 py-1.5">{fila.usuarios.join(', ') || '-'}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            ) : (
                <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                    Tabla plegada. Se abre automáticamente al aplicar filtros o con “Mostrar tabla”.
                </p>
            )}

            {error && (
                <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                    {error}
                </p>
            )}
        </section>
    )
}
