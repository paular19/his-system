'use client'

import { useEffect } from 'react'
import { formatearFecha, formatearFechaHora, formatearFechaCalendario, calcularEdad } from '@/lib/utils'
import type { IngresoDetalle } from '@/modules/admision/types'
import { limpiarObservacionesAdmision } from '@/modules/admision/utils'

interface FichaAdmisionPrintProps {
    ingreso: IngresoDetalle
}

/** Seccion con barra de titulo y marco, pensada para no cortarse entre paginas. */
function Seccion({
    titulo,
    children,
    columnas = 2,
}: {
    titulo: string
    children: React.ReactNode
    columnas?: 1 | 2 | 3
}) {
    return (
        <section className="pf-seccion">
            <h3 className="pf-seccion-titulo">{titulo}</h3>
            <div className={`pf-seccion-cuerpo pf-cols-${columnas}`}>{children}</div>
        </section>
    )
}

/** Renglon etiqueta/valor con linea de guia, para leer en diagonal. */
function Fila({
    label,
    valor,
    ancho = false,
}: {
    label: string
    valor?: string | number | null
    ancho?: boolean
}) {
    // formatearFecha devuelve '-' cuando no hay dato: se unifica con el guion largo.
    const texto = valor == null || valor === '' || valor === '-' ? '—' : String(valor)

    return (
        <div className={`pf-fila${ancho ? ' pf-fila-ancho' : ''}`}>
            <span className="pf-fila-label">{label}</span>
            <span className="pf-fila-guia" aria-hidden="true" />
            <span className="pf-fila-valor">{texto}</span>
        </div>
    )
}

/** Bloque de texto largo (diagnosticos, observaciones) sobre renglon. */
function Bloque({ label, texto }: { label: string; texto: string }) {
    return (
        <div className="pf-bloque">
            <p className="pf-bloque-label">{label}</p>
            <p className="pf-bloque-texto">{texto}</p>
        </div>
    )
}

export function FichaAdmisionPrint({ ingreso }: FichaAdmisionPrintProps) {
    const fechaNacimientoPaciente = ingreso.paciente?.fechaNacimiento ?? ingreso.fechaNacimiento
    const edad = fechaNacimientoPaciente ? calcularEdad(fechaNacimientoPaciente) : null
    const observacionesLimpias = limpiarObservacionesAdmision(ingreso.observaciones)
    const profesionalTratanteNombre = ingreso.profesionalTratante?.nombre
        ?? ingreso.evoluciones?.[0]?.profesional?.nombre
        ?? ingreso.profesionalTratanteFallback?.nombre
        ?? null
    const profesionalTratanteMatricula = ingreso.profesionalTratante?.matricula
        ?? ingreso.evoluciones?.[0]?.profesional?.matricula
        ?? ingreso.profesionalTratanteFallback?.matricula
        ?? null
    const esIngresoAmbulatorio = ingreso.tipoIngresoCodigo === 'AMB'
    const esGuardia = ingreso.ingresoSubtipo?.subtipoAdmisionCodigo === 'GUA'
    const esPracticaAmbulatoria =
        ingreso.tipoIngresoCodigo === 'AMB' &&
        ['TUR', 'RAY', 'CUR', 'SUT', 'ECG', 'ECO', 'QAM', 'PAM'].includes(
            ingreso.ingresoSubtipo?.subtipoAdmisionCodigo ?? ''
        )
    const ocultarEgresoPrevisto =
        esPracticaAmbulatoria ||
        ['GUA', 'DER', 'IND'].includes(ingreso.ingresoSubtipo?.subtipoAdmisionCodigo ?? '')
    const coberturaSecundariaValor = ingreso.obraSocialCoseguroNombre
        ?? (ingreso.obraSocialCoseguroId ? `ID ${ingreso.obraSocialCoseguroId}` : null)
    const esAlta = ingreso.estado === 'E'
    // El alta se imprime siempre que exista fecha de egreso, no solo con estado 'E'.
    const tieneAlta = Boolean(ingreso.fechaEgreso)
    const responsableNombre = ingreso.nombreTutor ?? ingreso.paciente?.nombreTutor ?? null
    const responsableTelefono = ingreso.telefonoTutor ?? ingreso.paciente?.telefonoTutor ?? null
    const domicilioPaciente = ingreso.paciente?.domicilio ?? null
    const telefonoPaciente = ingreso.paciente?.celular1 ?? ingreso.paciente?.telefonoFijo ?? null
    const hayDatosResponsable = Boolean(
        responsableNombre || responsableTelefono || domicilioPaciente || telefonoPaciente
    )

    useEffect(() => {
        const originalTitle = document.title
        const handleBeforePrint = () => {
            // Prevent browser print headers from showing the page title text.
            document.title = ' '
        }
        const handleAfterPrint = () => {
            document.title = originalTitle
        }

        window.addEventListener('beforeprint', handleBeforePrint)
        window.addEventListener('afterprint', handleAfterPrint)

        return () => {
            window.removeEventListener('beforeprint', handleBeforePrint)
            window.removeEventListener('afterprint', handleAfterPrint)
            document.title = originalTitle
        }
    }, [])

    const LABEL_ESTADO: Record<string, string> = {
        A: 'Activo',
        E: 'Egresado',
        P: 'Pendiente',
        X: 'Anulado',
    }

    const sub = ingreso.ingresoSubtipo
    const codigoSubtipo = sub?.subtipoAdmisionCodigo ?? ''

    return (
        <>
            <style>{`
                @media print {
                    html, body {
                        width: 100%;
                        margin: 0 !important;
                        padding: 0 !important;
                        background: white;
                    }

                    /* Ocultar navegación y elementos de UI no imprimibles */
                    nav, aside, [role="navigation"], .sidebar, button,
                    header, .no-print, .navbar { display: none !important; }
                    .print-hidden { display: none !important; }

                    /* Evitar corrimiento por el layout del dashboard */
                    .flex-1.pl-60 { padding-left: 0 !important; }
                    main { padding: 0 !important; margin: 0 !important; }

                    .print-ficha {
                        display: block !important;
                        visibility: visible !important;
                        width: 100%;
                        max-width: 100%;
                        margin: 0;
                        padding: 3mm 4mm;
                        box-sizing: border-box;
                        font-family: Arial, Helvetica, sans-serif;
                        font-size: 9pt;
                        line-height: 1.25;
                        color: #000;
                    }

                    @page { size: A4; margin: 5mm; }
                }

                /* --- Encabezado --- */
                .print-header { border-bottom: 2.5px solid #000; padding-bottom: 5px; margin-bottom: 7px; }
                .print-header-row { display: flex; gap: 10px; align-items: center; }
                .print-header-clinica {
                    min-width: 128px; display: flex; flex-direction: column;
                    align-items: center; text-align: center;
                    border-right: 1px solid #bbb; padding-right: 10px;
                }
                .print-header-clinica img { max-width: 110px; margin-bottom: 4px; }
                .print-header-sub { font-size: 7pt; color: #333; line-height: 1.2; }
                .print-header-info { flex: 1; }
                .print-doc-titulo {
                    font-size: 12pt; font-weight: bold; letter-spacing: 1.4px;
                    text-transform: uppercase; margin-bottom: 3px;
                    border-bottom: 1px solid #000; padding-bottom: 2px;
                }
                .print-header-table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
                .print-header-table td { padding: 2px 4px 2px 0; vertical-align: baseline; }
                .print-header-table tr + tr td { border-top: 1px dotted #bbb; }
                .print-label {
                    font-weight: bold; color: #333; white-space: nowrap;
                    font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.3px;
                    width: 1%;
                }
                .print-value { color: #000; }
                .print-paciente-nombre { font-size: 11pt; font-weight: bold; letter-spacing: 0.3px; }
                .print-nro-ingreso { font-weight: bold; font-size: 10pt; font-family: 'Courier New', monospace; }

                /* --- Secciones --- */
                .pf-seccion {
                    border: 1px solid #000;
                    margin-bottom: 5px;
                    page-break-inside: avoid;
                    break-inside: avoid;
                }
                .pf-seccion-titulo {
                    background: #e6e6e6;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                    font-size: 8pt; font-weight: bold;
                    text-transform: uppercase; letter-spacing: 0.8px;
                    padding: 2.5px 6px;
                    border-bottom: 1px solid #000;
                    margin: 0;
                }
                .pf-seccion-cuerpo { padding: 3px 6px 4px; display: grid; column-gap: 14px; }
                .pf-cols-1 { grid-template-columns: 1fr; }
                .pf-cols-2 { grid-template-columns: 1fr 1fr; }
                .pf-cols-3 { grid-template-columns: 1fr 1fr 1fr; }

                /* --- Renglones --- */
                .pf-fila {
                    display: flex; align-items: baseline; gap: 4px;
                    padding: 2px 0 1.5px;
                    border-bottom: 1px dotted #b0b0b0;
                    min-height: 13px;
                }
                .pf-fila-ancho { grid-column: 1 / -1; }
                .pf-fila-label {
                    font-size: 7.3pt; color: #444; text-transform: uppercase;
                    letter-spacing: 0.3px; white-space: nowrap;
                }
                .pf-fila-guia { flex: 1 1 auto; min-width: 6px; }
                .pf-fila-valor { font-size: 8.6pt; font-weight: bold; text-align: right; }

                /* --- Bloques de texto largo --- */
                .pf-bloque { grid-column: 1 / -1; padding: 2px 0 3px; }
                .pf-bloque + .pf-bloque { border-top: 1px dotted #b0b0b0; }
                .pf-bloque-label {
                    font-size: 7.3pt; color: #444; text-transform: uppercase;
                    letter-spacing: 0.3px; margin: 0 0 1px;
                }
                .pf-bloque-texto {
                    font-size: 8.6pt; margin: 0; white-space: pre-line;
                    border-bottom: 1px solid #ddd; padding-bottom: 2px;
                }

                /* --- Listas y tablas --- */
                .pf-lista { grid-column: 1 / -1; }
                .pf-lista-item { padding: 2px 0; border-bottom: 1px dotted #b0b0b0; }
                .pf-lista-item p { margin: 0; }
                .pf-lista-texto { font-size: 8.6pt; }
                .pf-lista-meta { font-size: 7.3pt; color: #555; }

                .pf-tabla { grid-column: 1 / -1; width: 100%; border-collapse: collapse; }
                .pf-tabla th {
                    background: #e6e6e6;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                    font-size: 7.3pt; text-transform: uppercase; letter-spacing: 0.3px;
                    text-align: left; padding: 2px 4px; border: 1px solid #999;
                }
                .pf-tabla td { font-size: 8.2pt; padding: 2px 4px; border: 1px solid #ccc; }
                .pf-tabla tbody tr:nth-child(even) td {
                    background: #f4f4f4;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                .pf-num { text-align: right; font-family: 'Courier New', monospace; }

                /* --- Pie de firmas --- */
                .pf-firmas {
                    display: grid; grid-template-columns: 1fr 1fr; gap: 28px;
                    margin-top: 14px; page-break-inside: avoid; break-inside: avoid;
                }
                .pf-firma { border-top: 1px solid #000; padding-top: 2px; text-align: center; }
                .pf-firma span {
                    font-size: 7.3pt; text-transform: uppercase; letter-spacing: 0.4px; color: #333;
                }

                @media screen { .print-ficha { display: none !important; } }
            `}</style>

            <div className="print-ficha">
                <div className="print-header">
                    <div className="print-header-row">
                        <div className="print-header-clinica">
                            <img src="/logo-clinica.png" alt="Logo Clínica" />
                            <div className="print-header-sub">Av. Sarmiento 566, Salta Capital</div>
                            <div className="print-header-sub">Tel: 3872537289</div>
                        </div>
                        <div className="print-header-info">
                            <div className="print-doc-titulo">Ficha de Admisión</div>
                            <table className="print-header-table">
                                <tbody>
                                    <tr>
                                        <td className="print-label">Paciente</td>
                                        <td className="print-value print-paciente-nombre" colSpan={3}>
                                            {(ingreso.nombre ?? ingreso.paciente?.nombreCompleto ?? '—').toUpperCase()}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="print-label">N° ingreso</td>
                                        <td className="print-value print-nro-ingreso">
                                            {ingreso.tipoIngresoCodigo}-{ingreso.numeroIngreso}
                                        </td>
                                        <td className="print-label">Historia clínica</td>
                                        <td className="print-value print-nro-ingreso">
                                            {ingreso.paciente?.historiaClinica ?? '—'}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="print-label">Fecha ingreso</td>
                                        <td className="print-value">{formatearFechaHora(ingreso.fechaIngreso)}</td>
                                        <td className="print-label">Estado</td>
                                        <td className="print-value">
                                            {LABEL_ESTADO[ingreso.estado ?? ''] ?? ingreso.estado ?? '—'}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="print-label">Cobertura</td>
                                        <td className="print-value" colSpan={3}>
                                            {ingreso.obraSocial?.nombre ?? 'Particular'}
                                            {coberturaSecundariaValor ? ` · ${coberturaSecundariaValor}` : ''}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <Seccion titulo="Información del paciente">
                    <Fila label="Nombre" valor={ingreso.nombre ?? ingreso.paciente?.nombreCompleto} />
                    <Fila
                        label="Documento"
                        valor={
                            ingreso.paciente?.numeroDocumento
                                ? `${ingreso.paciente?.tipoDocumento ?? ''} ${ingreso.paciente.numeroDocumento}`.trim()
                                : null
                        }
                    />
                    <Fila
                        label="Fecha de nacimiento"
                        valor={fechaNacimientoPaciente ? formatearFechaCalendario(fechaNacimientoPaciente) : null}
                    />
                    <Fila
                        label="Edad"
                        valor={edad ? `${edad} años` : ingreso.edad ? `${ingreso.edad} años` : null}
                    />
                    <Fila label="Historia clínica" valor={ingreso.paciente?.historiaClinica} />
                    <Fila label="Domicilio" valor={domicilioPaciente} />
                </Seccion>

                <Seccion titulo="Datos de la admisión">
                    <Fila
                        label="Tipo de ingreso"
                        valor={
                            ingreso.ingresoSubtipo?.subtipoAdmision?.descripcion
                            ?? ingreso.tipoIngreso?.descripcion
                            ?? ingreso.tipoIngresoCodigo
                        }
                    />
                    <Fila label="Fecha de ingreso" valor={formatearFechaHora(ingreso.fechaIngreso)} />
                    {tieneAlta && (
                        <Fila
                            label={esAlta ? 'Fecha y hora de alta' : 'Fecha y hora de egreso'}
                            valor={formatearFechaHora(ingreso.fechaEgreso)}
                        />
                    )}
                    {!esIngresoAmbulatorio && !tieneAlta && <Fila label="Fecha de egreso" valor={null} />}
                    {ingreso.motivoEgresoCodigo && (
                        <Fila
                            label="Motivo de egreso"
                            valor={ingreso.motivoEgreso?.descripcion ?? ingreso.motivoEgresoCodigo}
                        />
                    )}
                    {!ocultarEgresoPrevisto && (
                        <Fila label="Egreso previsto" valor={formatearFecha(ingreso.fechaEgresoPrevista)} />
                    )}
                    <Fila label="Estado" valor={LABEL_ESTADO[ingreso.estado ?? ''] ?? ingreso.estado} />
                    <Fila label="Profesional guardia" valor={ingreso.profesionalGuardia?.nombre} />
                    {!esGuardia && <Fila label="Profesional tratante" valor={profesionalTratanteNombre} />}
                    {!esGuardia && <Fila label="Matrícula tratante" valor={profesionalTratanteMatricula} />}
                    <Fila label="Profesional interviniente" valor={ingreso.profesionalInterviniente?.nombre} />
                    {ingreso.cama && (
                        <Fila
                            label="Cama"
                            valor={`${ingreso.cama.identificador} · ${ingreso.cama.sector}${ingreso.cama.habitacion ? ` · ${ingreso.cama.habitacion}` : ''}`}
                        />
                    )}
                </Seccion>

                <Seccion titulo="Cobertura médica" columnas={3}>
                    <Fila label="Obra social" valor={ingreso.obraSocial?.nombre ?? 'Particular'} />
                    <Fila label="N° afiliado" valor={ingreso.numeroAfiliado} />
                    <Fila label="Coseguro" valor={coberturaSecundariaValor} />
                </Seccion>

                {hayDatosResponsable && (
                    <Seccion titulo="Responsable del paciente">
                        <Fila label="Familiar / responsable" valor={responsableNombre} />
                        <Fila label="Teléfono del responsable" valor={responsableTelefono} />
                        <Fila label="Domicilio" valor={domicilioPaciente} />
                        <Fila label="Teléfono del paciente" valor={telefonoPaciente} />
                    </Seccion>
                )}

                {sub && codigoSubtipo === 'DER' && (
                    <Seccion titulo="Información de derivación">
                        <Fila label="Centro derivante" valor={sub.centroDerivante} />
                        <Fila label="Profesional derivante" valor={sub.profesionalDerivanteNombre} />
                        {sub.motivoDerivacion && <Bloque label="Motivo" texto={sub.motivoDerivacion} />}
                        {sub.diagnosticoDerivacion && (
                            <Bloque label="Diagnóstico de derivación" texto={sub.diagnosticoDerivacion} />
                        )}
                    </Seccion>
                )}

                {sub && ['TUR', 'RAY', 'PAM'].includes(codigoSubtipo) && (
                    <Seccion titulo="Turno / práctica">
                        <Fila label="Práctica" valor={sub.practicaCodigo} />
                        <Fila label="Fecha de turno" valor={sub.fechaTurno ? formatearFechaHora(sub.fechaTurno) : null} />
                    </Seccion>
                )}

                {sub && codigoSubtipo === 'IND' && (
                    <Seccion titulo="Indicación médica">
                        <Fila
                            label="Profesional interviniente"
                            valor={ingreso.profesionalInterviniente?.nombre ?? sub.profesionalIndicadorNombre}
                        />
                        <Fila label="Tipo de indicación" valor={sub.tipoIndicacion} />
                        {sub.descripcionIndicacion && (
                            <Bloque label="Descripción" texto={sub.descripcionIndicacion} />
                        )}
                    </Seccion>
                )}

                {(ingreso.descripcionPatologia || ingreso.descripcionPatologiaDefinitiva) && (
                    <Seccion titulo="Diagnóstico" columnas={1}>
                        {ingreso.descripcionPatologia && (
                            <Bloque label="Presuntivo" texto={ingreso.descripcionPatologia} />
                        )}
                        {ingreso.descripcionPatologiaDefinitiva && (
                            <Bloque label="Definitivo" texto={ingreso.descripcionPatologiaDefinitiva} />
                        )}
                    </Seccion>
                )}

                {observacionesLimpias && (
                    <Seccion titulo="Observaciones" columnas={1}>
                        <Bloque label="Registradas en la admisión" texto={observacionesLimpias} />
                    </Seccion>
                )}

                {ingreso.ingresoPatologias.length > 0 && (
                    <Seccion titulo="Diagnósticos registrados" columnas={1}>
                        <div className="pf-lista">
                            {ingreso.ingresoPatologias.map((d) => (
                                <div key={d.id} className="pf-lista-item">
                                    <p className="pf-lista-texto">{d.descripcion}</p>
                                    <p className="pf-lista-meta">
                                        {formatearFechaHora(d.fecha)}
                                        {d.observaciones && ` · ${d.observaciones}`}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </Seccion>
                )}

                {ingreso.movimientosIngreso.length > 0 && (
                    <Seccion titulo="Movimientos del ingreso" columnas={1}>
                        <table className="pf-tabla">
                            <thead>
                                <tr>
                                    <th>Tipo</th>
                                    <th>Fecha</th>
                                    <th>Concepto</th>
                                    <th className="pf-num">Importe</th>
                                    <th className="pf-num">Saldo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ingreso.movimientosIngreso.map((m) => (
                                    <tr key={m.id}>
                                        <td>{m.tipoMovimiento.descripcion}</td>
                                        <td>{formatearFecha(m.fecha)}</td>
                                        <td>{m.concepto ?? '—'}</td>
                                        <td className="pf-num">
                                            {m.signo >= 0 ? '+' : ''}{Number(m.importe).toFixed(2)}
                                        </td>
                                        <td className="pf-num">{Number(m.saldo).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </Seccion>
                )}

                <div className="pf-firmas">
                    <div className="pf-firma">
                        <span>Firma del paciente / responsable</span>
                    </div>
                    <div className="pf-firma">
                        <span>Firma y sello — Admisión</span>
                    </div>
                </div>
            </div>
        </>
    )
}
