'use client'

import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import { formatearNumeroOrden, generarCodigoBarras } from '@/modules/orden/types'
import type { OrdenConItems } from '@/modules/orden/types'

interface AutorizacionPrintProps {
  orden: OrdenConItems
  nombreClinica?: string
  usuario: string
  mostrarAcciones?: boolean
}

export function AutorizacionPrint({
  orden,
  nombreClinica = 'SISTEMA HIS',
  usuario,
  mostrarAcciones = true,
}: AutorizacionPrintProps) {
  const barcodeRefs = useRef<(SVGSVGElement | null)[]>([])
  const limpiarEspecialidadEntreParentesis = (nombre: string): string => {
    return nombre.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim()
  }

  const esItemModularAgrupado = (incluye: string | null): boolean => {
    if (!incluye) return false
    return incluye.includes('+')
  }

  const esItemModular = (item: OrdenConItems['items'][number]): boolean => {
    return Boolean(item.titularModular) || item.imprimirPorDuplicado || esItemModularAgrupado(item.incluyeCodigo)
  }

  const esTituloPatologia = (item: OrdenConItems['items'][number]): boolean => {
    return (item.titularModular ?? '').toUpperCase().includes('PATOLOG')
  }

  const tituloPorIncluye = (item: OrdenConItems['items'][number]): string => {
    const incluye = item.incluyeCodigo

    if (item.titularModular) {
      return item.titularModular
    }

    if (!incluye) return 'HONORARIOS'
    // Manejar múltiples códigos: GA+HE, HE+GA, etc.
    if (incluye.includes('GA') && incluye.includes('HE')) return 'DERECHOS + HONORARIO ESPECIALISTA'
    if (incluye.includes('GA') && incluye.includes('HA')) return 'DERECHOS + HONORARIO ANESTESISTA'
    if (incluye.includes('HE') && incluye.includes('HA')) return 'HONORARIO ESPECIALISTA + ANESTESISTA'
    // Códigos individuales
    if (incluye === 'GA') return 'DERECHOS'
    if (incluye === 'HE') return 'HONORARIO ESPECIALISTA'
    if (incluye === 'HA') return 'HONORARIO ANESTESISTA'
    if (incluye.startsWith('A')) return 'HONORARIOS AYUDANTE'
    return 'HONORARIOS'
  }

  const profesionalTexto = (item: OrdenConItems['items'][number]): string => {
    const nombreFallbackPorMatricula = (matricula: number): string => {
      if (matricula === 6) return 'ASOSIACION ANESTESISTA'
      if (matricula === 9110) return 'CLINICA SAN RAFAEL'
      if (matricula === 995) return 'PROFESIONAL AYUDANTE'
      return 'PROFESIONAL'
    }

    if (esTituloPatologia(item)) {
      const nombrePatologia = (orden.descripcionPatologia ?? item.efectorProfesional?.nombre ?? 'PROFESIONAL').toUpperCase()
      const matriculaPatologia = item.efectorMatricula ?? item.efectorProfesional?.matricula ?? null
      return `${nombrePatologia} · MP ${matriculaPatologia ?? '-'}`
    }

    // Verificar si es HE o HA (incluso en combinaciones como HE+GA)
    const incluyeCodigo = item.incluyeCodigo || ''
    if (incluyeCodigo.includes('HA')) {
      return 'ASOSIACION ANESTESISTA · MP 6'
    }
    if (incluyeCodigo.includes('HE') || incluyeCodigo.includes('HA')) {
      if (item.efectorProfesional) {
        return `${item.efectorProfesional.nombre.toUpperCase()} · MP ${item.efectorProfesional.matricula}`
      }
      if (item.efectorMatricula) {
        return `${nombreFallbackPorMatricula(item.efectorMatricula)} · MP ${item.efectorMatricula}`
      }
      return 'PROFESIONAL · MP -'
    }
    if (item.efectorProfesional) {
      return `${item.efectorProfesional.nombre.toUpperCase()} · MP ${item.efectorProfesional.matricula}`
    }
    if (item.efectorMatricula) {
      return `${nombreFallbackPorMatricula(item.efectorMatricula)} · MP ${item.efectorMatricula}`
    }
    return `${nombreClinica.toUpperCase()} · MP 9110`
  }

  const profesionalFirma = (item: OrdenConItems['items'][number]): { nombre: string; matricula: number | null } => {
    const esInternacion = (orden.ingresoTipoCodigo ?? '').trim().toUpperCase() === 'INT'
    const incluyeCodigo = item.incluyeCodigo || ''

    if (esTituloPatologia(item)) {
      return {
        nombre: orden.descripcionPatologia ?? item.efectorProfesional?.nombre ?? 'PROFESIONAL',
        matricula: item.efectorMatricula ?? item.efectorProfesional?.matricula ?? null,
      }
    }

    if (incluyeCodigo.includes('HA')) {
      return { nombre: 'ASOSIACION ANESTESISTA', matricula: 6 }
    }

    if (!esInternacion && orden.profesional?.nombre) {
      return {
        nombre: orden.profesional.nombre,
        matricula: orden.profesional.matricula ?? null,
      }
    }

    if (item.efectorProfesional) {
      return {
        nombre: item.efectorProfesional.nombre,
        matricula: item.efectorProfesional.matricula,
      }
    }

    if (item.efectorMatricula) {
      const nombre = item.efectorMatricula === 6
        ? 'ASOSIACION ANESTESISTA'
        : item.efectorMatricula === 9110
          ? 'CLINICA SAN RAFAEL'
          : 'PROFESIONAL'
      return { nombre, matricula: item.efectorMatricula }
    }

    if (orden.profesional?.nombre) {
      return {
        nombre: orden.profesional.nombre,
        matricula: orden.profesional.matricula ?? null,
      }
    }

    return { nombre: 'Medico interviniente', matricula: null }
  }

  const tituloPagina = (items: OrdenConItems['items']): string => {
    const itemConTitulo = items.find((it) => Boolean(it.titularModular?.trim()))
    if (itemConTitulo?.titularModular) return itemConTitulo.titularModular
    return items[0] ? tituloPorIncluye(items[0]) : 'HONORARIOS'
  }

  const paginas = (() => {
    const copies = orden.items.some((it) => it.imprimirPorDuplicado) ? 2 : 1
    const itemsOrdenados = [...orden.items].sort((a, b) => a.item - b.item)
    return Array.from({ length: copies }, (_, copyIdx) => ({ items: itemsOrdenados, copyIdx }))
  })()

  useEffect(() => {
    paginas.forEach(({ items }, idx) => {
      const svg = barcodeRefs.current[idx]
      if (!svg) return
      const itemRef = items[0]
      if (!itemRef) return
      const codigo = generarCodigoBarras(itemRef.puestoNumero, itemRef.ordenNumero, itemRef.item)
      try {
        JsBarcode(svg, codigo, {
          format: 'CODE128',
          width: 2,
          height: 60,
          displayValue: true,
          fontSize: 12,
          margin: 8,
        })
      } catch {
        // barcode generation failed silently
      }
    })
  }, [paginas])

  const fechaEmision = new Date(orden.fechaEmision)
  const fechaFormateada = fechaEmision.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
  const horaFormateada = fechaEmision.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const ingresoTexto =
    orden.ingresoNumero !== null
      ? `${orden.ingresoTipoCodigo ? `${orden.ingresoTipoCodigo}-` : ''}${orden.ingresoNumero}`
      : '-'

  return (
    <>
      {/* Botón imprimir — oculto al imprimir */}
      {mostrarAcciones && (
        <div className="no-print mb-4 flex gap-3">
          <button
            onClick={() => window.print()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Imprimir Autorización
          </button>
          <button
            onClick={() => {
              window.location.assign('/dashboard/admision')
            }}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Volver
          </button>
        </div>
      )}

      {/* Documento imprimible */}
      <div className="print-doc space-y-0">
        {paginas.map(({ items, copyIdx }, idx) => {
          const itemRef = items[0]
          if (!itemRef) return null

          const nroOrden = formatearNumeroOrden(itemRef.puestoNumero, itemRef.ordenNumero, itemRef.item)
          const codigoBarras = generarCodigoBarras(itemRef.puestoNumero, itemRef.ordenNumero, itemRef.item)
          const medicoInterviniente = profesionalFirma(itemRef)
          const medicoIntervinienteNombre = limpiarEspecialidadEntreParentesis(medicoInterviniente.nombre)

          return (
            <div key={`${itemRef.puestoNumero}-${itemRef.ordenNumero}-${copyIdx}`} className="autorizacion-pagina">
              {/* ====== LADO FRONTAL ====== */}
              <div className="autorizacion-frente">
                {/* Header */}
                <div className="aut-header">
                  <div className="aut-clinica">
                    <img src="/logo-clinica.png" alt="Logo" style={{ maxWidth: 90, marginBottom: 4 }} />
                    <div className="aut-clinica-sub">Av. Sarmiento 566, Salta Capital, Argentina</div>
                    <div className="aut-clinica-sub">Tel: 3872537289</div>
                  </div>
                  <div className="aut-info-orden">
                    <table className="aut-tabla-info">
                      <tbody>
                        <tr>
                          <td className="aut-label">Orden N°:</td>
                          <td className="aut-valor aut-nro-orden">{nroOrden}</td>
                          <td className="aut-label">Fecha Emisión:</td>
                          <td className="aut-valor">{fechaFormateada}</td>
                        </tr>
                        <tr>
                          <td className="aut-label">Paciente:</td>
                          <td className="aut-valor" colSpan={3}>
                            {orden.nombrePaciente.toUpperCase()}
                          </td>
                        </tr>
                        <tr>
                          <td className="aut-label">N° Ingreso:</td>
                          <td className="aut-valor">{ingresoTexto}</td>
                          <td className="aut-label"></td>
                          <td className="aut-valor"></td>
                        </tr>
                        <tr>
                          <td className="aut-label">O.Soc:</td>
                          <td className="aut-valor" colSpan={3}>
                            {orden.obraSocial?.nombre ?? '—'}
                          </td>
                        </tr>
                        <tr>
                          <td className="aut-label">Coseguro:</td>
                          <td className="aut-valor" colSpan={3}>
                            {orden.obraSocialCoseguro?.nombre ?? '—'}
                          </td>
                        </tr>
                        <tr>
                          <td className="aut-label">N° Afil.:</td>
                          <td className="aut-valor" colSpan={3}>
                            {orden.numeroAfiliado}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Orden por */}
                <div className="aut-orden-por">
                  <span className="aut-label">Orden por:</span>{' '}
                  <span className="aut-valor">PRACTICA</span>
                  <span className="aut-tipo-right">
                    {tituloPagina(items)}
                  </span>
                </div>

                {/* Diagnóstico */}
                <div className="aut-diagnostico">
                  <span className="aut-label">Diagnóstico:</span>{' '}
                  <span className="aut-valor">{orden.descripcionPatologia ?? ''}</span>
                  <span className="aut-observ-label">Observ.:</span>
                </div>

                {/* Tabla de práctica */}
                <table className="aut-tabla-practicas">
                  <thead>
                    <tr>
                      <th>Códig</th>
                      <th>Cant.</th>
                      <th>Práctica</th>
                      <th>Diferencial</th>
                      <th>Incluye</th>
                      <th>Profesional</th>
                      <th>Fechas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={`${item.puestoNumero}-${item.ordenNumero}-${item.item}`}>
                        <td>{item.codigoPractica.trim()}</td>
                        <td className="text-center">{item.cantidad}</td>
                        <td>{item.descripcionPractica.toUpperCase()}</td>
                        <td className="text-center">
                          {item.porcentajeCargoPac !== null
                            ? `${item.porcentajeCargoPac}%`
                            : '100.00%'}
                        </td>
                        <td className="text-center">{item.incluyeCodigo ?? '-'}</td>
                        <td>{profesionalTexto(item)}</td>
                        <td>{fechaFormateada}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ====== LADO DORSO (barcode) ====== */}
              <div className="autorizacion-dorso">
                <svg
                  ref={(el) => { barcodeRefs.current[idx] = el }}
                  className="aut-barcode"
                />
                <div className="aut-original">{copyIdx === 0 ? 'ORIGINAL' : 'DUPLICADO'}</div>
                <div className="aut-emisor">
                  Emitido por {usuario.trim()} &mdash; {fechaFormateada} {horaFormateada}
                </div>
                <div className="aut-firmas">
                  <div className="aut-firma-linea">
                    <div className="aut-firma-label">Auditor Médico</div>
                  </div>
                  <div className="aut-firma-linea">
                    <div className="aut-firma-label">
                      {medicoIntervinienteNombre}
                      <br />
                      M.P.&nbsp;&nbsp;{medicoInterviniente.matricula ?? '-'}
                    </div>
                    <div className="aut-firma-fecha">
                      Fecha Pedido: {fechaFormateada}
                    </div>
                  </div>
                </div>
                <div className="aut-nro-barcode">{codigoBarras}</div>
              </div>
            </div>
          )
        })}
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body > * { display: none !important; }
          .print-doc { display: block !important; }
          nav, header, aside { display: none !important; }
        }

        .print-doc {
          font-family: Arial, sans-serif;
          font-size: 11px;
          color: #000;
        }

        .autorizacion-pagina {
          border: 1px solid #ccc;
          margin-bottom: 12px;
          page-break-after: always;
        }

        .autorizacion-frente {
          padding: 10px 14px;
          border-bottom: 2px solid #000;
        }

        .aut-header {
          display: flex;
          gap: 16px;
          margin-bottom: 8px;
          border-bottom: 1px solid #ccc;
          padding-bottom: 8px;
        }

        .aut-clinica {
          min-width: 140px;
          font-size: 10px;
          color: #333;
        }

        .aut-clinica-nombre {
          font-weight: bold;
          font-size: 13px;
          color: #000;
          margin-bottom: 4px;
        }

        .aut-info-orden {
          flex: 1;
        }

        .aut-tabla-info {
          width: 100%;
          font-size: 11px;
          border-collapse: collapse;
        }

        .aut-tabla-info td {
          padding: 1px 6px 1px 0;
          vertical-align: top;
        }

        .aut-label {
          font-weight: bold;
          white-space: nowrap;
          color: #555;
        }

        .aut-valor {
          color: #000;
        }

        .aut-nro-orden {
          font-weight: bold;
          font-size: 13px;
        }

        .aut-orden-por {
          padding: 4px 0;
          display: flex;
          align-items: center;
          gap: 6px;
          border-bottom: 1px solid #eee;
        }

        .aut-tipo-right {
          margin-left: auto;
          font-weight: bold;
          font-size: 13px;
          letter-spacing: 1px;
        }

        .aut-diagnostico {
          padding: 4px 0;
          display: flex;
          gap: 8px;
          border-bottom: 1px solid #eee;
        }

        .aut-observ-label {
          margin-left: auto;
          font-weight: bold;
          color: #555;
        }

        .aut-tabla-practicas {
          width: 100%;
          border-collapse: collapse;
          margin-top: 6px;
          font-size: 11px;
        }

        .aut-tabla-practicas th {
          border: 1px solid #999;
          padding: 3px 6px;
          background: #f5f5f5;
          font-weight: bold;
          text-align: left;
        }

        .aut-tabla-practicas td {
          border: 1px solid #ccc;
          padding: 4px 6px;
        }

        .autorizacion-dorso {
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 6px;
          background: #fff;
        }

        .aut-barcode {
          max-width: 280px;
        }

        .aut-original {
          font-weight: bold;
          font-size: 16px;
          letter-spacing: 2px;
        }

        .aut-emisor {
          font-size: 10px;
          color: #555;
        }

        .aut-firmas {
          width: 100%;
          display: flex;
          gap: 40px;
          margin-top: 24px;
        }

        .aut-firma-linea {
          flex: 1;
          border-top: 1px solid #000;
          padding-top: 6px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          font-size: 10px;
        }

        .aut-firma-label {
          text-align: center;
          font-style: italic;
          color: #333;
          line-height: 1.4;
        }

        .aut-firma-fecha {
          font-size: 9px;
          color: #555;
          white-space: nowrap;
        }

        .aut-nro-barcode {
          font-size: 10px;
          color: #666;
          letter-spacing: 1px;
        }
      `}</style>
    </>
  )
}
