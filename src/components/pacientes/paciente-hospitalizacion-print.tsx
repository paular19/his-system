'use client'

import { useMemo, useState } from 'react'
import { Printer } from 'lucide-react'

type PacientePrintData = {
    id: number
    nombreCompleto: string
    apellido: string | null
    nombre: string | null
    historiaClinica: number | null
    tipoDocumento: string | null
    numeroDocumento: number | null
    fechaNacimiento: Date | string | null
    sexo: string | null
    estadoCivil: string | null
    cuil: string | null
    domicilio: string | null
    celular1: string | null
    telefonoFijo: string | null
    email: string | null
    obraSocialId: number | null
    planId: number | null
    numeroAfiliado: string | null
    observaciones: string | null
}

type IngresoPrintData = {
    id: number
    tipoIngresoCodigo: string
    numeroIngreso: number
    estado: string | null
    fechaIngreso: Date | string | null
    fechaEgreso: Date | string | null
    fechaEgresoPrevista: Date | string | null
    descripcionPatologia: string | null
    descripcionPatologiaDefinitiva: string | null
    observaciones: string | null
    tipoIngreso: { descripcion: string | null } | null
    ingresoSubtipo: { subtipoAdmision: { descripcion: string | null } | null } | null
    profesionalGuardia: { nombre: string } | null
    profesionalTratante: { nombre: string } | null
    obraSocial: { nombre: string } | null
    cama: { identificador: string; sector: string | null; habitacion: string | null } | null
    ingresoPatologias: Array<{ id: number; descripcion: string | null; fecha: Date | string | null }>
    practicas: Array<{
        id: number
        codigoPractica: string
        cantidad: number
        fecha: Date | string | null
        numeroAutorizacion: string | null
        nomencladorPractica: { descripcion: string } | null
    }>
}

interface PacienteHospitalizacionPrintProps {
    paciente: PacientePrintData
    ingresos: IngresoPrintData[]
}

function fmtFecha(v: Date | string | null | undefined) {
    if (!v) return '-'
    return new Date(v).toLocaleDateString('es-AR')
}

function fmtFechaHora(v: Date | string | null | undefined) {
    if (!v) return '-'
    return new Date(v).toLocaleString('es-AR')
}

function labelSexo(sexo: string | null | undefined) {
    if (sexo === 'M') return 'Masculino'
    if (sexo === 'F') return 'Femenino'
    return '-'
}

function labelEstadoCivil(ec: string | null | undefined) {
    const map: Record<string, string> = {
        S: 'Soltero/a',
        C: 'Casado/a',
        D: 'Divorciado/a',
        V: 'Viudo/a',
        U: 'Unión convivencial',
    }
    return ec ? (map[ec] ?? ec) : '-'
}

function labelEstadoIngreso(estado: string | null | undefined) {
    const map: Record<string, string> = {
        A: 'Activo',
        E: 'Egresado',
        P: 'Pendiente',
        X: 'Anulado',
    }
    return estado ? (map[estado] ?? estado) : '-'
}

export function PacienteHospitalizacionPrint({ paciente, ingresos }: PacienteHospitalizacionPrintProps) {
    const [seleccionados, setSeleccionados] = useState<number[]>(ingresos.map((i) => i.id))

    const ingresosSeleccionados = useMemo(
        () => ingresos.filter((i) => seleccionados.includes(i.id)),
        [ingresos, seleccionados]
    )

    const toggleIngreso = (id: number) => {
        setSeleccionados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
    }

    const seleccionarTodos = () => setSeleccionados(ingresos.map((i) => i.id))
    const limpiarSeleccion = () => setSeleccionados([])

    return (
        <>
            <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .paciente-hosp-print-report,
          .paciente-hosp-print-report * {
            visibility: visible !important;
          }
          .paciente-hosp-print-report {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 8mm;
            font-family: Arial, sans-serif;
            color: #000;
            background: #fff;
          }
        }
      `}</style>

            <div className="his-card p-5 print:hidden">
                <div className="flex items-center justify-between mb-3 pb-2 border-b">
                    <h3 className="text-sm font-semibold text-gray-700">Informe de Hospitalización</h3>
                    <button
                        type="button"
                        onClick={() => window.print()}
                        disabled={seleccionados.length === 0}
                        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                        <Printer className="h-4 w-4" />
                        Imprimir informe
                    </button>
                </div>

                {ingresos.length === 0 ? (
                    <p className="text-sm text-gray-400">El paciente no tiene admisiones para imprimir.</p>
                ) : (
                    <>
                        <p className="text-sm text-gray-600 mb-3">
                            Seleccioná una o varias admisiones del paciente para incluirlas en el informe.
                        </p>
                        <div className="flex items-center gap-2 mb-3">
                            <button
                                type="button"
                                onClick={seleccionarTodos}
                                className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                                Seleccionar todas
                            </button>
                            <button
                                type="button"
                                onClick={limpiarSeleccion}
                                className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                                Limpiar
                            </button>
                            <span className="text-xs text-gray-500">{seleccionados.length} seleccionada(s)</span>
                        </div>

                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                            {ingresos.map((ing) => {
                                const codigo = `${ing.tipoIngresoCodigo}-${ing.numeroIngreso}`
                                const subtipo = ing.ingresoSubtipo?.subtipoAdmision?.descripcion
                                return (
                                    <label
                                        key={ing.id}
                                        className="flex items-start gap-3 rounded-md border border-gray-200 p-3 hover:bg-gray-50 cursor-pointer"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={seleccionados.includes(ing.id)}
                                            onChange={() => toggleIngreso(ing.id)}
                                            className="mt-1"
                                        />
                                        <div className="text-sm">
                                            <p className="font-medium text-gray-900">{codigo}</p>
                                            <p className="text-gray-600">
                                                {subtipo ?? ing.tipoIngreso?.descripcion ?? 'Sin subtipo'} · {labelEstadoIngreso(ing.estado)}
                                            </p>
                                            <p className="text-gray-500">Ingreso: {fmtFechaHora(ing.fechaIngreso)}</p>
                                        </div>
                                    </label>
                                )
                            })}
                        </div>
                    </>
                )}
            </div>

            <div className="paciente-hosp-print-report" aria-hidden>
                <div style={{ borderBottom: '2px solid #000', paddingBottom: 8, marginBottom: 10 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <img src="/logo-clinica.png" alt="Logo Clínica" style={{ maxWidth: 120, marginBottom: 4 }} />
                            <div style={{ fontSize: 12 }}>Av. Sarmiento 566, Salta Capital, Argentina</div>
                            <div style={{ fontSize: 12 }}>Tel: 3872537289</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 18, fontWeight: 700 }}>INFORME DE HOSPITALIZACIÓN</div>
                            <div style={{ fontSize: 12 }}>Fecha impresión: {fmtFechaHora(new Date())}</div>
                        </div>
                    </div>
                </div>

                <div style={{ border: '1px solid #bbb', padding: 8, marginBottom: 10 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Datos del Paciente</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12 }}>
                        <div><strong>Nombre:</strong> {paciente.nombreCompleto}</div>
                        <div><strong>HC:</strong> {paciente.historiaClinica ?? '-'}</div>
                        <div><strong>Documento:</strong> {(paciente.tipoDocumento ?? '-')} {paciente.numeroDocumento ?? ''}</div>
                        <div><strong>Fecha nacimiento:</strong> {fmtFecha(paciente.fechaNacimiento)}</div>
                        <div><strong>Sexo:</strong> {labelSexo(paciente.sexo)}</div>
                        <div><strong>Estado civil:</strong> {labelEstadoCivil(paciente.estadoCivil)}</div>
                        <div><strong>CUIL:</strong> {paciente.cuil ?? '-'}</div>
                        <div><strong>Domicilio:</strong> {paciente.domicilio ?? '-'}</div>
                        <div><strong>Celular:</strong> {paciente.celular1 ?? '-'}</div>
                        <div><strong>Tel. fijo:</strong> {paciente.telefonoFijo ?? '-'}</div>
                        <div><strong>Email:</strong> {paciente.email ?? '-'}</div>
                        <div><strong>N° Afiliado:</strong> {paciente.numeroAfiliado ?? '-'}</div>
                        {paciente.observaciones && (
                            <div style={{ gridColumn: '1 / -1' }}><strong>Observaciones:</strong> {paciente.observaciones}</div>
                        )}
                    </div>
                </div>

                {ingresosSeleccionados.map((ing) => {
                    const codigo = `${ing.tipoIngresoCodigo}-${ing.numeroIngreso}`
                    const subtipo = ing.ingresoSubtipo?.subtipoAdmision?.descripcion ?? ing.tipoIngreso?.descripcion ?? '-'
                    return (
                        <div key={ing.id} style={{ border: '1px solid #bbb', padding: 8, marginBottom: 10, pageBreakInside: 'avoid' }}>
                            <div style={{ fontWeight: 700, marginBottom: 6 }}>Admisión {codigo}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12, marginBottom: 8 }}>
                                <div><strong>Tipo/Subtipo:</strong> {subtipo}</div>
                                <div><strong>Estado:</strong> {labelEstadoIngreso(ing.estado)}</div>
                                <div><strong>Fecha ingreso:</strong> {fmtFechaHora(ing.fechaIngreso)}</div>
                                <div><strong>Fecha egreso:</strong> {fmtFechaHora(ing.fechaEgreso)}</div>
                                <div><strong>Egreso previsto:</strong> {fmtFecha(ing.fechaEgresoPrevista)}</div>
                                <div><strong>Cama:</strong> {ing.cama ? `${ing.cama.identificador} (${ing.cama.sector ?? '-'}${ing.cama.habitacion ? ` · ${ing.cama.habitacion}` : ''})` : '-'}</div>
                                <div><strong>Profesional guardia:</strong> {ing.profesionalGuardia?.nombre ?? '-'}</div>
                                <div><strong>Profesional tratante:</strong> {ing.profesionalTratante?.nombre ?? '-'}</div>
                                <div><strong>Obra social:</strong> {ing.obraSocial?.nombre ?? '-'}</div>
                                <div style={{ gridColumn: '1 / -1' }}><strong>Diagnóstico presuntivo:</strong> {ing.descripcionPatologia ?? '-'}</div>
                                <div style={{ gridColumn: '1 / -1' }}><strong>Diagnóstico definitivo:</strong> {ing.descripcionPatologiaDefinitiva ?? '-'}</div>
                                <div style={{ gridColumn: '1 / -1' }}><strong>Observaciones:</strong> {ing.observaciones ?? '-'}</div>
                            </div>

                            {ing.ingresoPatologias.length > 0 && (
                                <div style={{ marginBottom: 8 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Diagnósticos registrados</div>
                                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                                        {ing.ingresoPatologias.map((d) => (
                                            <li key={d.id}>{d.descripcion ?? '-'} ({fmtFechaHora(d.fecha)})</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {ing.practicas.length > 0 && (
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Prácticas</div>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                                        <thead>
                                            <tr>
                                                <th style={{ border: '1px solid #aaa', padding: 4, textAlign: 'left' }}>Código</th>
                                                <th style={{ border: '1px solid #aaa', padding: 4, textAlign: 'left' }}>Descripción</th>
                                                <th style={{ border: '1px solid #aaa', padding: 4, textAlign: 'right' }}>Cant.</th>
                                                <th style={{ border: '1px solid #aaa', padding: 4, textAlign: 'left' }}>Fecha</th>
                                                <th style={{ border: '1px solid #aaa', padding: 4, textAlign: 'left' }}>N° Aut.</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {ing.practicas.map((p) => (
                                                <tr key={p.id}>
                                                    <td style={{ border: '1px solid #aaa', padding: 4 }}>{p.codigoPractica.trim()}</td>
                                                    <td style={{ border: '1px solid #aaa', padding: 4 }}>{p.nomencladorPractica?.descripcion ?? '-'}</td>
                                                    <td style={{ border: '1px solid #aaa', padding: 4, textAlign: 'right' }}>{p.cantidad}</td>
                                                    <td style={{ border: '1px solid #aaa', padding: 4 }}>{fmtFechaHora(p.fecha)}</td>
                                                    <td style={{ border: '1px solid #aaa', padding: 4 }}>{p.numeroAutorizacion ?? '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </>
    )
}
