'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, CheckCircle, FileSpreadsheet, Loader2, Pencil, Plus, Search, XCircle } from 'lucide-react'
import type { AdmisionFacturacionListItem, FacturacionContexto, PrestacionFacturableItem } from '@/modules/facturacion/types'

type ApiResponse<T> = {
    ok: boolean
    data?: T
    error?: string
}

type PrestacionOrdenInput = {
    convenioId: number
    codigoPractica: string
    descripcionPractica: string
    cantidad: number
    numeroAutorizacion?: string | null
}

function toDateInput(value: Date | string | null | undefined): string {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    return d.toISOString().slice(0, 16)
}

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        maximumFractionDigits: 2,
    }).format(value)
}

function formatOrderNumber(puestoNumero: number | null | undefined, ordenNumero: number | null | undefined): string {
    if (!puestoNumero || !ordenNumero) return '—'
    return `${puestoNumero.toString().padStart(4, '0')}-${ordenNumero.toString().padStart(8, '0')}`
}

function tieneNumeroAutorizacionValido(numeroAutorizacion: string | null | undefined): boolean {
    return typeof numeroAutorizacion === 'string' && numeroAutorizacion.trim().length > 0
}

type EditState = {
    fecha: string
    codigoPractica: string
    descripcion: string
    cantidad: string
    numeroAutorizacion: string
    importeTotal: string
    matricula: string
}

function buildEditState(p: PrestacionFacturableItem): EditState {
    return {
        fecha: toDateInput(p.fecha),
        codigoPractica: p.codigoPractica ?? '',
        descripcion: p.descripcion,
        cantidad: String(p.cantidad ?? 1),
        numeroAutorizacion: p.numeroAutorizacion ?? '',
        importeTotal: String(p.importeTotal ?? 0),
        matricula: p.matriculaProfesional ? String(p.matriculaProfesional) : '',
    }
}

export function FacturacionPanel() {
    const [q, setQ] = useState('')
    const [tipoIngresoCodigo, setTipoIngresoCodigo] = useState('')
    const [codigoPractica, setCodigoPractica] = useState('')

    const [buscando, setBuscando] = useState(false)
    const [admisiones, setAdmisiones] = useState<AdmisionFacturacionListItem[]>([])
    const [totalAdmisiones, setTotalAdmisiones] = useState(0)
    const [selectedIngresoId, setSelectedIngresoId] = useState<number | null>(null)

    const [cargandoContexto, setCargandoContexto] = useState(false)
    const [contexto, setContexto] = useState<FacturacionContexto | null>(null)

    const [editandoFicha, setEditandoFicha] = useState(false)
    const [guardandoFicha, setGuardandoFicha] = useState(false)

    const [guardandoPractica, setGuardandoPractica] = useState(false)
    const [guardandoMedicacion, setGuardandoMedicacion] = useState(false)
    const [cargandoOrdenes, setCargandoOrdenes] = useState(false)

    const [mensaje, setMensaje] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const [seleccion, setSeleccion] = useState<Record<string, boolean>>({})

    const [formIngresoNombre, setFormIngresoNombre] = useState('')
    const [formDescripcionPatologia, setFormDescripcionPatologia] = useState('')
    const [formNumeroAfiliado, setFormNumeroAfiliado] = useState('')
    const [formObservaciones, setFormObservaciones] = useState('')
    const [formPacienteNombreCompleto, setFormPacienteNombreCompleto] = useState('')
    const [formPacienteCelular, setFormPacienteCelular] = useState('')
    const [formPacienteEmail, setFormPacienteEmail] = useState('')
    const [formPacienteDomicilio, setFormPacienteDomicilio] = useState('')

    const [expandNuevaPractica, setExpandNuevaPractica] = useState(false)
    const [expandNuevaMedicacion, setExpandNuevaMedicacion] = useState(false)

    const [nuevaPracticaCodigo, setNuevaPracticaCodigo] = useState('')
    const [nuevaPracticaDescripcion, setNuevaPracticaDescripcion] = useState('')
    const [nuevaPracticaCantidad, setNuevaPracticaCantidad] = useState('1')
    const [nuevaPracticaFecha, setNuevaPracticaFecha] = useState(() => toDateInput(new Date()))
    const [nuevaPracticaAutorizacion, setNuevaPracticaAutorizacion] = useState('')

    const [nuevaMedicacionNombre, setNuevaMedicacionNombre] = useState('')
    const [nuevaMedicacionDosis, setNuevaMedicacionDosis] = useState('')
    const [nuevaMedicacionVia, setNuevaMedicacionVia] = useState('')
    const [nuevaMedicacionFrecuencia, setNuevaMedicacionFrecuencia] = useState('')
    const [nuevaMedicacionFecha, setNuevaMedicacionFecha] = useState(() => toDateInput(new Date()))

    const [editRows, setEditRows] = useState<Record<string, EditState>>({})
    const [guardandoRowUid, setGuardandoRowUid] = useState<string | null>(null)
    const [ordenesExpand, setOrdenesExpand] = useState<Record<string, boolean>>({})
    const [anulando, setAnulando] = useState<string | null>(null)

    // Auto-dismiss success toast after 3.5 s
    useEffect(() => {
        if (!mensaje) return
        const t = setTimeout(() => setMensaje(null), 3500)
        return () => clearTimeout(t)
    }, [mensaje])

    const prestacionesSeleccionables = useMemo(() => {
        if (!contexto) return []
        return contexto.prestaciones.filter(
            (p) =>
                p.tipo === 'PRACTICA' &&
                p.codigoPractica &&
                p.convenioId !== null &&
                !p.facturada &&
                tieneNumeroAutorizacionValido(p.numeroAutorizacion)
        )
    }, [contexto])

    const prestacionesSeleccionadas = useMemo(() => {
        if (!contexto) return []
        return contexto.prestaciones.filter((p) => seleccion[p.uid])
    }, [contexto, seleccion])

    const totalPacienteFacturado = useMemo(() => {
        if (!contexto) return 0
        return contexto.prestaciones
            .filter((p) => p.tipo === 'ORDEN_ITEM')
            .reduce((sum, p) => sum + Number(p.importeTotal ?? 0), 0)
    }, [contexto])

    const totalPacientePendiente = useMemo(() => {
        if (!contexto) return 0
        return contexto.prestaciones
            .filter((p) => p.tipo === 'PRACTICA' && !p.facturada)
            .reduce((sum, p) => sum + Number(p.importeTotal ?? 0), 0)
    }, [contexto])

    const ordenesConItems = useMemo(() => {
        if (!contexto) return []
        const rows = contexto.prestaciones.filter((p) => p.tipo === 'ORDEN_ITEM')
        const map = new Map<string, PrestacionFacturableItem[]>()
        for (const row of rows) {
            const key = `${row.ordenPuestoNumero ?? 0}:${row.ordenNumero ?? 0}`
            if (!map.has(key)) map.set(key, [])
            map.get(key)?.push(row)
        }
        return Array.from(map.entries()).map(([key, items]) => {
            const [puestoStr, numeroStr] = key.split(':')
            const puesto = Number(puestoStr ?? 0)
            const numero = Number(numeroStr ?? 0)
            const total = items.reduce((sum, i) => sum + Number(i.importeTotal ?? 0), 0)
            return {
                key,
                puesto,
                numero,
                matricula: items[0]?.matriculaProfesional ?? null,
                total,
                items: items.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()),
            }
        })
    }, [contexto])

    const prestacionesNoOrdenadas = useMemo(() => {
        if (!contexto) return []
        return contexto.prestaciones.filter((p) => {
            if (p.tipo === 'ORDEN_ITEM') return false
            if (p.tipo === 'PRACTICA') return !p.facturada
            return true
        })
    }, [contexto])

    function cargarFormDesdeContexto(data: FacturacionContexto) {
        setFormIngresoNombre(data.ingreso.nombre ?? '')
        setFormDescripcionPatologia(data.ingreso.descripcionPatologia ?? '')
        setFormNumeroAfiliado(data.ingreso.numeroAfiliado ?? '')
        setFormObservaciones(data.ingreso.observaciones ?? '')
        setFormPacienteNombreCompleto(data.paciente?.nombreCompleto ?? '')
        setFormPacienteCelular(data.paciente?.celular1 ?? '')
        setFormPacienteEmail(data.paciente?.email ?? '')
        setFormPacienteDomicilio(data.paciente?.domicilio ?? '')
    }

    function initEditRows(data: FacturacionContexto) {
        const state: Record<string, EditState> = {}
        for (const p of data.prestaciones) state[p.uid] = buildEditState(p)
        setEditRows(state)
    }

    async function buscarAdmisiones() {
        setError(null)
        setMensaje(null)
        setBuscando(true)
        try {
            const params = new URLSearchParams()
            if (q.trim()) params.set('q', q.trim())
            if (tipoIngresoCodigo.trim()) params.set('tipoIngresoCodigo', tipoIngresoCodigo.trim().toUpperCase())
            if (codigoPractica.trim()) params.set('codigoPractica', codigoPractica.trim().toUpperCase())
            params.set('porPagina', '30')

            const res = await fetch(`/api/facturacion/busqueda?${params.toString()}`)
            const json = (await res.json()) as ApiResponse<{ items: AdmisionFacturacionListItem[]; total: number }>
            if (!res.ok || !json.ok || !json.data) throw new Error(json.error ?? 'No se pudo buscar')

            setAdmisiones(json.data.items)
            setTotalAdmisiones(json.data.total)

            if (json.data.items.length > 0 && json.data.items[0]) {
                setSelectedIngresoId(json.data.items[0].id)
            } else {
                setSelectedIngresoId(null)
                setContexto(null)
                setSeleccion({})
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error de busqueda')
        } finally {
            setBuscando(false)
        }
    }

    async function cargarContexto(ingresoId: number) {
        setError(null)
        setCargandoContexto(true)
        try {
            const res = await fetch(`/api/facturacion/contexto?ingresoId=${ingresoId}`)
            const json = (await res.json()) as ApiResponse<FacturacionContexto>
            if (!res.ok || !json.ok || !json.data) throw new Error(json.error ?? 'No se pudo cargar el contexto')

            setContexto(json.data)
            cargarFormDesdeContexto(json.data)
            initEditRows(json.data)
            setSeleccion({})
            setOrdenesExpand({})
            setEditandoFicha(false)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al cargar contexto')
            setContexto(null)
        } finally {
            setCargandoContexto(false)
        }
    }

    async function guardarFicha() {
        if (!contexto) return
        setGuardandoFicha(true)
        setMensaje(null)
        setError(null)
        try {
            const payload = {
                ingreso: {
                    nombre: formIngresoNombre || null,
                    descripcionPatologia: formDescripcionPatologia || null,
                    numeroAfiliado: formNumeroAfiliado || null,
                    observaciones: formObservaciones || null,
                },
                paciente: {
                    nombreCompleto: formPacienteNombreCompleto || '',
                    celular1: formPacienteCelular || null,
                    email: formPacienteEmail || null,
                    domicilio: formPacienteDomicilio || null,
                },
            }

            const res = await fetch(`/api/facturacion/admision/${contexto.ingreso.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })

            const json = (await res.json()) as ApiResponse<{ ingresoId: number }>
            if (!res.ok || !json.ok) throw new Error(json.error ?? 'No se pudieron guardar los cambios')

            setMensaje('Ficha de facturación actualizada')
            setEditandoFicha(false)
            await cargarContexto(contexto.ingreso.id)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al guardar')
        } finally {
            setGuardandoFicha(false)
        }
    }

    async function crearPractica() {
        if (!contexto) return
        setGuardandoPractica(true)
        setError(null)
        setMensaje(null)
        try {
            const res = await fetch('/api/facturacion/prestaciones/practicas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ingresoId: contexto.ingreso.id,
                    convenioId: contexto.ingreso.obraSocialId ?? 0,
                    codigoPractica: nuevaPracticaCodigo.trim().toUpperCase(),
                    descripcionPractica: nuevaPracticaDescripcion.trim() || null,
                    cantidad: Number(nuevaPracticaCantidad || 1),
                    fecha: new Date(nuevaPracticaFecha).toISOString(),
                    numeroAutorizacion: nuevaPracticaAutorizacion.trim() || null,
                }),
            })
            const json = (await res.json()) as ApiResponse<{ id: number }>
            if (!res.ok || !json.ok) throw new Error(json.error ?? 'No se pudo crear la practica')

            setNuevaPracticaCodigo('')
            setNuevaPracticaDescripcion('')
            setNuevaPracticaCantidad('1')
            setNuevaPracticaAutorizacion('')
            setExpandNuevaPractica(false)
            setMensaje('Práctica agregada')
            await cargarContexto(contexto.ingreso.id)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al crear practica')
        } finally {
            setGuardandoPractica(false)
        }
    }

    async function crearMedicacion() {
        if (!contexto) return
        setGuardandoMedicacion(true)
        setError(null)
        setMensaje(null)
        try {
            const res = await fetch('/api/facturacion/prestaciones/medicaciones', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ingresoId: contexto.ingreso.id,
                    nombre: nuevaMedicacionNombre.trim(),
                    dosis: nuevaMedicacionDosis.trim() || null,
                    viaAdministracion: nuevaMedicacionVia.trim() || null,
                    frecuencia: nuevaMedicacionFrecuencia.trim() || null,
                    fechaInicio: new Date(nuevaMedicacionFecha).toISOString(),
                }),
            })

            const json = (await res.json()) as ApiResponse<{ id: number }>
            if (!res.ok || !json.ok) throw new Error(json.error ?? 'No se pudo crear la medicacion')

            setNuevaMedicacionNombre('')
            setNuevaMedicacionDosis('')
            setNuevaMedicacionVia('')
            setNuevaMedicacionFrecuencia('')
            setExpandNuevaMedicacion(false)
            setMensaje('Medicación agregada')
            await cargarContexto(contexto.ingreso.id)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al crear medicacion')
        } finally {
            setGuardandoMedicacion(false)
        }
    }

    async function facturarPaciente() {
        if (!contexto) return
        setCargandoOrdenes(true)
        setError(null)
        setMensaje(null)
        try {
            const prestaciones: PrestacionOrdenInput[] = prestacionesSeleccionadas
                .filter(
                    (p) =>
                        p.tipo === 'PRACTICA' &&
                        p.codigoPractica &&
                        p.convenioId !== null &&
                        !p.facturada &&
                        tieneNumeroAutorizacionValido(p.numeroAutorizacion)
                )
                .map((p) => ({
                    convenioId: p.convenioId as number,
                    codigoPractica: (p.codigoPractica as string).trim(),
                    descripcionPractica: p.descripcion,
                    cantidad: p.cantidad,
                    numeroAutorizacion: p.numeroAutorizacion?.trim() ?? null,
                }))

            const res = await fetch('/api/facturacion/ordenes/cargar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ingresoId: contexto.ingreso.id,
                    facturarTodo: prestaciones.length === 0,
                    prestaciones,
                }),
            })
            const json = (await res.json()) as ApiResponse<{ ordenes: Array<{ puestoNumero: number; numero: number }> }>
            if (!res.ok || !json.ok || !json.data) throw new Error(json.error ?? 'No se pudieron generar ordenes')

            setMensaje(`Facturación registrada para paciente. Órdenes generadas: ${json.data.ordenes.length}`)
            setSeleccion({})
            await cargarContexto(contexto.ingreso.id)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al facturar paciente')
        } finally {
            setCargandoOrdenes(false)
        }
    }

    async function guardarPrestacion(p: PrestacionFacturableItem) {
        const draft = editRows[p.uid]
        if (!draft) return
        if (p.tipo !== 'PRACTICA' && p.tipo !== 'ORDEN_ITEM') return

        if (p.tipo === 'PRACTICA' && p.facturada) {
            const ok = window.confirm(
                `Esta práctica ya fue facturada (Ord. ${p.ordenPuestoNumero}-${p.ordenNumero}).\nAl guardar los cambios se desvinculará de esa orden y quedará como pendiente.\n¿Continuar?`
            )
            if (!ok) return
        }

        setGuardandoRowUid(p.uid)
        setError(null)
        try {
            const common = {
                fecha: new Date(draft.fecha || p.fecha).toISOString(),
                codigoPractica: (draft.codigoPractica || p.codigoPractica || '').trim(),
                descripcionPractica: draft.descripcion,
                cantidad: Number(draft.cantidad || 1),
                numeroAutorizacion: draft.numeroAutorizacion || null,
                importeTotal: Number(draft.importeTotal || 0),
                matriculaProfesional: draft.matricula ? Number(draft.matricula) : null,
            }

            if (!common.codigoPractica) throw new Error('Código de práctica requerido')

            const payload =
                p.tipo === 'PRACTICA' && p.origen.practicaId
                    ? {
                        tipo: 'PRACTICA' as const,
                        practicaId: p.origen.practicaId,
                        ...common,
                    }
                    : {
                        tipo: 'ORDEN_ITEM' as const,
                        puestoNumero: p.origen.ordenPuestoNumero,
                        ordenNumero: p.origen.ordenNumero,
                        item: p.origen.ordenItem,
                        ...common,
                    }

            const res = await fetch('/api/facturacion/prestaciones/editar', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })

            const json = (await res.json()) as ApiResponse<{ ok: boolean }>
            if (!res.ok || !json.ok) throw new Error(json.error ?? 'No se pudo guardar prestación')

            if (contexto) await cargarContexto(contexto.ingreso.id)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al guardar prestación')
        } finally {
            setGuardandoRowUid(null)
        }
    }

    async function anularOrden(puestoNumero: number, numero: number) {
        if (!contexto) return
        const ok = window.confirm(
            `¿Anular la facturación de la Orden ${puestoNumero}-${numero}?\nLas prácticas vinculadas volverán a estado pendiente.`
        )
        if (!ok) return

        const key = `${puestoNumero}:${numero}`
        setAnulando(key)
        setError(null)
        try {
            const res = await fetch('/api/facturacion/ordenes/anular', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ puestoNumero, numero }),
            })
            const json = (await res.json()) as ApiResponse<{ ok: boolean }>
            if (!res.ok || !json.ok) throw new Error(json.error ?? 'No se pudo anular la orden')

            setMensaje(`Orden ${puestoNumero}-${numero} anulada. Las prácticas quedaron como pendientes.`)
            await cargarContexto(contexto.ingreso.id)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al anular orden')
        } finally {
            setAnulando(null)
        }
    }

    useEffect(() => {
        buscarAdmisiones()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (selectedIngresoId) {
            cargarContexto(selectedIngresoId)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedIngresoId])

    return (
        <div className="p-6 space-y-4">
            <div className="his-card p-4 md:p-5">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                            <Search className="h-3.5 w-3.5" /> Cargar órdenes
                        </div>
                        <p className="mt-2 text-sm text-gray-600">Buscá admisiones por paciente, documento, tipo de ingreso o código de práctica.</p>
                    </div>
                    <Link
                        href="/facturacion/lotes"
                        className="inline-flex h-10 items-center justify-center rounded-md bg-indigo-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
                    >
                        Generar lote
                    </Link>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12">
                    <label className="space-y-1 xl:col-span-4">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Búsqueda</span>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Paciente, nro ingreso o documento"
                                className="h-10 w-full rounded-md border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                            />
                        </div>
                    </label>

                    <label className="space-y-1 xl:col-span-3">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Tipo de ingreso</span>
                        <input
                            value={tipoIngresoCodigo}
                            onChange={(e) => setTipoIngresoCodigo(e.target.value)}
                            placeholder="INT / GUA / AMB"
                            className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                    </label>

                    <label className="space-y-1 xl:col-span-3">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Código práctica</span>
                        <input
                            value={codigoPractica}
                            onChange={(e) => setCodigoPractica(e.target.value)}
                            placeholder="Filtrar por práctica"
                            className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                    </label>

                    <div className="flex items-end gap-2 xl:col-span-2">
                        <button
                            onClick={buscarAdmisiones}
                            className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={buscando}
                        >
                            {buscando ? 'Buscando...' : 'Buscar'}
                        </button>
                    </div>

                    <div className="xl:col-span-12">
                        <div className="inline-flex items-center rounded-md bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-600">
                            {totalAdmisiones} admisiones encontradas
                        </div>
                    </div>
                </div>
            </div>

            {mensaje && (
                <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl bg-green-700 px-4 py-3 text-sm text-white shadow-2xl">
                    <CheckCircle className="h-5 w-5 shrink-0" />
                    <span>{mensaje}</span>
                    <button onClick={() => setMensaje(null)} className="ml-1 rounded p-0.5 hover:bg-green-600"><XCircle className="h-4 w-4" /></button>
                </div>
            )}
            {error && <div className="his-card border-red-200 bg-red-50 text-red-700 p-3 text-sm">{error}</div>}

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                <div className="xl:col-span-3">
                    <div className="his-card overflow-hidden">
                        <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold text-gray-700">Pacientes / Admisiones</div>
                        <div className="max-h-[700px] overflow-y-auto divide-y">
                            {admisiones.length === 0 && <div className="p-4 text-sm text-gray-500">Sin resultados</div>}
                            {admisiones.map((a) => (
                                <button key={a.id} onClick={() => setSelectedIngresoId(a.id)} className={`w-full text-left p-3 hover:bg-gray-50 ${selectedIngresoId === a.id ? 'bg-blue-50' : ''}`}>
                                    <div className="text-xs text-gray-500">{a.tipoIngresoCodigo}-{a.numeroIngreso}</div>
                                    <div className="text-sm font-medium text-gray-900 truncate">{a.paciente?.nombreCompleto ?? 'Sin nombre'}</div>
                                    <div className="text-xs text-gray-500">DNI {a.paciente?.numeroDocumento ?? '—'}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="xl:col-span-9 space-y-4">
                    {cargandoContexto && <div className="his-card p-6 flex items-center gap-2 text-sm text-gray-600"><Loader2 className="h-4 w-4 animate-spin" /> Cargando contexto de facturación...</div>}

                    {!cargandoContexto && !contexto && (
                        <div className="his-card p-10 text-center text-gray-500">
                            <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                            Selecciona una admisión para comenzar
                        </div>
                    )}

                    {!cargandoContexto && contexto && (
                        <>
                            <div className="his-card p-4 space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-base font-semibold text-gray-900">Ficha de facturación</h3>
                                        <p className="text-xs text-gray-500 mt-1">Pendiente: <span className="font-semibold text-orange-700">{formatCurrency(totalPacientePendiente)}</span> {' · '}Facturado: <span className="font-semibold text-green-700">{formatCurrency(totalPacienteFacturado)}</span></p>
                                    </div>
                                    {!editandoFicha ? (
                                        <button onClick={() => setEditandoFicha(true)} className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-xs font-medium hover:bg-gray-50"><Pencil className="h-3.5 w-3.5" /> Editar datos</button>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <button onClick={guardarFicha} disabled={guardandoFicha} className="rounded-md bg-blue-600 text-white px-3 py-2 text-xs font-medium hover:bg-blue-700 disabled:opacity-60">{guardandoFicha ? 'Guardando...' : 'Guardar cambios'}</button>
                                            <button onClick={() => { cargarFormDesdeContexto(contexto); setEditandoFicha(false) }} className="rounded-md border px-3 py-2 text-xs font-medium hover:bg-gray-50">Cancelar</button>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                    <div className="rounded-md border border-gray-200 px-3 py-2 bg-gray-50"><span className="text-gray-500 text-xs">Tipo de ingreso</span><div className="font-medium text-gray-900">{contexto.ingreso.tipoIngresoCodigo}</div></div>
                                    <div className="rounded-md border border-gray-200 px-3 py-2 bg-gray-50"><span className="text-gray-500 text-xs">Número de ingreso</span><div className="font-medium text-gray-900">{contexto.ingreso.numeroIngreso}</div></div>
                                    <div className="rounded-md border border-gray-200 px-3 py-2 bg-gray-50"><span className="text-gray-500 text-xs">Nombre</span>{editandoFicha ? (<input value={formPacienteNombreCompleto} onChange={(e) => setFormPacienteNombreCompleto(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1" />) : (<div className="font-medium text-gray-900">{formPacienteNombreCompleto || '—'}</div>)}</div>
                                    <div className="rounded-md border border-gray-200 px-3 py-2 bg-gray-50"><span className="text-gray-500 text-xs">DNI</span><div className="font-medium text-gray-900">{contexto.paciente?.numeroDocumento ?? '—'}</div></div>
                                    <div className="rounded-md border border-gray-200 px-3 py-2 bg-gray-50"><span className="text-gray-500 text-xs">Obra social</span><div className="font-medium text-gray-900">{contexto.obraSocial?.nombre ?? 'Particular'}</div></div>
                                    <div className="rounded-md border border-gray-200 px-3 py-2 bg-gray-50"><span className="text-gray-500 text-xs">Convenio / Plan</span><div className="font-medium text-gray-900">{contexto.plan?.descripcion ?? '—'}</div></div>
                                    <div className="rounded-md border border-gray-200 px-3 py-2 bg-gray-50"><span className="text-gray-500 text-xs">Coseguro</span><div className="font-medium text-gray-900">{contexto.obraSocialCoseguro?.nombre ?? 'Sin coseguro'}</div></div>
                                    <div className="rounded-md border border-gray-200 px-3 py-2 bg-gray-50"><span className="text-gray-500 text-xs">Número afiliado</span>{editandoFicha ? (<input value={formNumeroAfiliado} onChange={(e) => setFormNumeroAfiliado(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1" />) : (<div className="font-medium text-gray-900">{formNumeroAfiliado || '—'}</div>)}</div>
                                    <div className="rounded-md border border-gray-200 px-3 py-2 bg-gray-50"><span className="text-gray-500 text-xs">Ficha de ingreso</span><div className="font-medium text-gray-900">{contexto.ingreso.fechaIngreso ? new Date(contexto.ingreso.fechaIngreso).toLocaleString('es-AR') : '—'}</div></div>
                                    <div className="rounded-md border border-gray-200 px-3 py-2 bg-gray-50 md:col-span-2"><span className="text-gray-500 text-xs">Ficha de egreso</span><div className="font-medium text-gray-900">{contexto.ingreso.fechaEgreso ? new Date(contexto.ingreso.fechaEgreso).toLocaleString('es-AR') : '—'}</div></div>
                                    <div className="rounded-md border border-gray-200 px-3 py-2 bg-gray-50 md:col-span-2"><span className="text-gray-500 text-xs">Regla de facturación aplicada</span><div className="font-medium text-gray-900">{contexto.reglaFacturacion.descripcion}</div></div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="his-card p-4 space-y-3">
                                    <button onClick={() => setExpandNuevaPractica((v) => !v)} className="w-full flex items-center justify-between rounded-md border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50"><span className="inline-flex items-center gap-2"><Plus className="h-4 w-4" /> Agregar nueva práctica</span>{expandNuevaPractica ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>
                                    {expandNuevaPractica && (
                                        <>
                                            <div className="grid grid-cols-2 gap-2">
                                                <input value={nuevaPracticaCodigo} onChange={(e) => setNuevaPracticaCodigo(e.target.value)} className="rounded-md border border-gray-300 px-2 py-2 text-sm" placeholder="Código" />
                                                <input value={nuevaPracticaCantidad} onChange={(e) => setNuevaPracticaCantidad(e.target.value)} className="rounded-md border border-gray-300 px-2 py-2 text-sm" placeholder="Cantidad" />
                                                <input value={nuevaPracticaDescripcion} onChange={(e) => setNuevaPracticaDescripcion(e.target.value)} className="rounded-md border border-gray-300 px-2 py-2 text-sm col-span-2" placeholder="Descripción" />
                                                <input type="datetime-local" value={nuevaPracticaFecha} onChange={(e) => setNuevaPracticaFecha(e.target.value)} className="rounded-md border border-gray-300 px-2 py-2 text-sm" />
                                                <input value={nuevaPracticaAutorizacion} onChange={(e) => setNuevaPracticaAutorizacion(e.target.value)} className="rounded-md border border-gray-300 px-2 py-2 text-sm" placeholder="Nro autorización" />
                                            </div>
                                            <button onClick={crearPractica} disabled={guardandoPractica} className="rounded-md border px-3 py-2 text-xs font-medium hover:bg-gray-50 disabled:opacity-60">{guardandoPractica ? 'Guardando...' : 'Guardar práctica'}</button>
                                        </>
                                    )}
                                </div>

                                <div className="his-card p-4 space-y-3">
                                    <button onClick={() => setExpandNuevaMedicacion((v) => !v)} className="w-full flex items-center justify-between rounded-md border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50"><span className="inline-flex items-center gap-2"><Plus className="h-4 w-4" /> Agregar nueva medicación</span>{expandNuevaMedicacion ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>
                                    {expandNuevaMedicacion && (
                                        <>
                                            <div className="grid grid-cols-2 gap-2">
                                                <input value={nuevaMedicacionNombre} onChange={(e) => setNuevaMedicacionNombre(e.target.value)} className="rounded-md border border-gray-300 px-2 py-2 text-sm col-span-2" placeholder="Nombre" />
                                                <input value={nuevaMedicacionDosis} onChange={(e) => setNuevaMedicacionDosis(e.target.value)} className="rounded-md border border-gray-300 px-2 py-2 text-sm" placeholder="Dosis" />
                                                <input value={nuevaMedicacionVia} onChange={(e) => setNuevaMedicacionVia(e.target.value)} className="rounded-md border border-gray-300 px-2 py-2 text-sm" placeholder="Vía" />
                                                <input value={nuevaMedicacionFrecuencia} onChange={(e) => setNuevaMedicacionFrecuencia(e.target.value)} className="rounded-md border border-gray-300 px-2 py-2 text-sm" placeholder="Frecuencia" />
                                                <input type="datetime-local" value={nuevaMedicacionFecha} onChange={(e) => setNuevaMedicacionFecha(e.target.value)} className="rounded-md border border-gray-300 px-2 py-2 text-sm" />
                                            </div>
                                            <button onClick={crearMedicacion} disabled={guardandoMedicacion} className="rounded-md border px-3 py-2 text-xs font-medium hover:bg-gray-50 disabled:opacity-60">{guardandoMedicacion ? 'Guardando...' : 'Guardar medicación'}</button>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="his-card overflow-hidden">
                                <div className="p-4 border-b bg-gray-50 flex items-center justify-between gap-3">
                                    <div>
                                        <h4 className="text-sm font-semibold text-gray-900">Prestaciones</h4>
                                        <p className="text-xs text-gray-500">Editar y validar antes del armado de lotes.</p>
                                    </div>
                                    <button onClick={facturarPaciente} disabled={cargandoOrdenes} className="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60">{cargandoOrdenes ? 'Facturando...' : 'Facturar paciente'}</button>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b bg-white text-left">
                                                <th className="px-3 py-2 text-xs font-medium text-gray-500">Sel / #</th>
                                                <th className="px-3 py-2 text-xs font-medium text-gray-500">Fecha</th>
                                                <th className="px-3 py-2 text-xs font-medium text-gray-500">Código</th>
                                                <th className="px-3 py-2 text-xs font-medium text-gray-500">Descripción</th>
                                                <th className="px-3 py-2 text-xs font-medium text-gray-500">Cantidad</th>
                                                <th className="px-3 py-2 text-xs font-medium text-gray-500">Nro orden</th>
                                                <th className="px-3 py-2 text-xs font-medium text-gray-500">Nro autorización</th>
                                                <th className="px-3 py-2 text-xs font-medium text-gray-500">Monto</th>
                                                <th className="px-3 py-2 text-xs font-medium text-gray-500">Matrícula médico</th>
                                                <th className="px-3 py-2 text-xs font-medium text-gray-500">Importe total</th>
                                                <th className="px-3 py-2 text-xs font-medium text-gray-500">Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {prestacionesNoOrdenadas.map((p) => {
                                                const draft = editRows[p.uid] ?? buildEditState(p)
                                                const seleccionable =
                                                    p.tipo === 'PRACTICA' &&
                                                    !p.facturada &&
                                                    Boolean(p.codigoPractica && p.convenioId !== null) &&
                                                    tieneNumeroAutorizacionValido(p.numeroAutorizacion)
                                                const yaFacturada = p.tipo === 'PRACTICA' && p.facturada
                                                return (
                                                    <tr key={p.uid} className={yaFacturada ? 'bg-green-50' : 'hover:bg-gray-50'}>
                                                        <td className="px-3 py-2">
                                                            {yaFacturada ? (
                                                                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700" title={`Ord. ${p.ordenPuestoNumero}-${p.ordenNumero}`}>✓ Facturada</span>
                                                            ) : seleccionable ? (
                                                                <input type="checkbox" checked={Boolean(seleccion[p.uid])} onChange={(e) => setSeleccion((prev) => ({ ...prev, [p.uid]: e.target.checked }))} />
                                                            ) : (
                                                                <span className="text-[11px] font-medium text-amber-700">Sin autorización</span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2"><input type="datetime-local" value={draft.fecha} onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, fecha: e.target.value } }))} className="rounded border border-gray-300 px-2 py-1 text-xs w-44" /></td>
                                                        <td className="px-3 py-2"><input value={draft.codigoPractica} onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, codigoPractica: e.target.value } }))} className="rounded border border-gray-300 px-2 py-1 text-xs w-24" /></td>
                                                        <td className="px-3 py-2"><input value={draft.descripcion} onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, descripcion: e.target.value } }))} className="rounded border border-gray-300 px-2 py-1 text-xs w-72" /></td>
                                                        <td className="px-3 py-2"><input value={draft.cantidad} onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, cantidad: e.target.value } }))} className="rounded border border-gray-300 px-2 py-1 text-xs w-16" /></td>
                                                        <td className="px-3 py-2 text-xs text-gray-700 whitespace-nowrap">{formatOrderNumber(p.ordenPuestoNumero, p.ordenNumero)}</td>
                                                        <td className="px-3 py-2"><input value={draft.numeroAutorizacion} onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, numeroAutorizacion: e.target.value } }))} placeholder="Nro autorización" className="rounded border border-gray-300 px-2 py-1 text-xs w-32" /></td>
                                                        <td className="px-3 py-2 text-xs text-gray-600">{p.precioUnitario !== null ? formatCurrency(p.precioUnitario) : '—'}</td>
                                                        <td className="px-3 py-2"><input value={draft.matricula} onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, matricula: e.target.value } }))} className="rounded border border-gray-300 px-2 py-1 text-xs w-24" /></td>
                                                        <td className="px-3 py-2"><input value={draft.importeTotal} onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, importeTotal: e.target.value } }))} className="rounded border border-gray-300 px-2 py-1 text-xs w-24" /></td>
                                                        <td className="px-3 py-2">{p.tipo === 'PRACTICA' || p.tipo === 'ORDEN_ITEM' ? (<button onClick={() => guardarPrestacion(p)} disabled={guardandoRowUid === p.uid} className="rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-60">{guardandoRowUid === p.uid ? 'Guardando...' : 'Guardar'}</button>) : (<span className="text-xs text-gray-400">No aplica</span>)}</td>
                                                    </tr>
                                                )
                                            })}

                                            {ordenesConItems.map((orden) => {
                                                const expand = ordenesExpand[orden.key] ?? true
                                                return (
                                                    <Fragment key={orden.key}>
                                                        <tr key={`head-${orden.key}`} className="bg-green-50">
                                                            <td className="px-3 py-2" colSpan={7}><button onClick={() => setOrdenesExpand((prev) => ({ ...prev, [orden.key]: !expand }))} className="inline-flex items-center gap-2 text-xs font-semibold text-green-800">{expand ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}<span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">✓ Facturada</span>Orden {orden.puesto.toString().padStart(4, '0')}-{orden.numero.toString().padStart(8, '0')} ({orden.items.length} prácticas)</button></td>
                                                            <td className="px-3 py-2 text-xs">—</td>
                                                            <td className="px-3 py-2 text-xs">{orden.matricula ?? '—'}</td>
                                                            <td className="px-3 py-2 text-xs font-semibold">{formatCurrency(orden.total)}</td>
                                                            <td className="px-3 py-2"><button onClick={() => anularOrden(orden.puesto, orden.numero)} disabled={anulando === orden.key} className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"><XCircle className="h-3.5 w-3.5" />{anulando === orden.key ? 'Anulando...' : 'Anular'}</button></td>
                                                        </tr>
                                                        {expand && orden.items.map((p) => {
                                                            const draft = editRows[p.uid] ?? buildEditState(p)
                                                            return (
                                                                <tr key={p.uid} className="hover:bg-gray-50">
                                                                    <td className="px-3 py-2 text-xs text-gray-400">{p.origen.ordenItem}</td>
                                                                    <td className="px-3 py-2"><input type="datetime-local" value={draft.fecha} onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, fecha: e.target.value } }))} className="rounded border border-gray-300 px-2 py-1 text-xs w-44" /></td>
                                                                    <td className="px-3 py-2"><input value={draft.codigoPractica} onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, codigoPractica: e.target.value } }))} className="rounded border border-gray-300 px-2 py-1 text-xs w-24" /></td>
                                                                    <td className="px-3 py-2"><input value={draft.descripcion} onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, descripcion: e.target.value } }))} className="rounded border border-gray-300 px-2 py-1 text-xs w-72" /></td>
                                                                    <td className="px-3 py-2"><input value={draft.cantidad} onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, cantidad: e.target.value } }))} className="rounded border border-gray-300 px-2 py-1 text-xs w-16" /></td>
                                                                    <td className="px-3 py-2 text-xs text-gray-400">ítem {p.origen.ordenItem}</td>
                                                                    <td className="px-3 py-2"><input value={draft.numeroAutorizacion} onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, numeroAutorizacion: e.target.value } }))} placeholder="Nro autorización" className="rounded border border-gray-300 px-2 py-1 text-xs w-32" /></td>
                                                                    <td className="px-3 py-2 text-xs text-gray-600">{p.precioUnitario !== null ? formatCurrency(p.precioUnitario) : '—'}</td>
                                                                    <td className="px-3 py-2"><input value={draft.matricula} onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, matricula: e.target.value } }))} className="rounded border border-gray-300 px-2 py-1 text-xs w-24" /></td>
                                                                    <td className="px-3 py-2"><input value={draft.importeTotal} onChange={(e) => setEditRows((prev) => ({ ...prev, [p.uid]: { ...draft, importeTotal: e.target.value } }))} className="rounded border border-gray-300 px-2 py-1 text-xs w-24" /></td>
                                                                    <td className="px-3 py-2"><button onClick={() => guardarPrestacion(p)} disabled={guardandoRowUid === p.uid} className="rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-60">{guardandoRowUid === p.uid ? 'Guardando...' : 'Guardar'}</button></td>
                                                                </tr>
                                                            )
                                                        })}
                                                    </Fragment>
                                                )
                                            })}

                                            {contexto.prestaciones.length === 0 && <tr><td colSpan={10} className="px-3 py-6 text-center text-sm text-gray-500">Sin prestaciones registradas</td></tr>}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="px-4 py-2 border-t text-xs text-gray-500">Seleccionables para facturar: {prestacionesSeleccionables.length} · Seleccionadas: {prestacionesSeleccionadas.length}</div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
