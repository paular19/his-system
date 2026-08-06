'use client'

import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import { formatearNumeroOrden, generarCodigoBarras } from '@/modules/orden/types'
import type { OrdenConItems } from '@/modules/orden/types'
import {
  clasificacionDesdeIncluyeCodigo,
  contieneClasificacion,
  normalizarClasificacionAgrupacion,
  tituloDesdeClasificacion,
} from '@/modules/orden/clasificacion'
import { ARG_TIME_ZONE, formatearFechaArgentina } from '@/lib/utils/argentina-date'

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
  const MATRICULA_PATOLOGIA_DEFAULT = 2675
  const NOMBRE_PATOLOGIA_DEFAULT = 'ANA MARIA VEGA'
  const MATRICULA_GUARDIA_PRINT = 9110
  const esOrdenGuardiaAmbulatoria =
    (orden.ingresoTipoCodigo ?? '').trim().toUpperCase() === 'AMB' &&
    (orden.ingresoSubtipoCodigo ?? '').trim().toUpperCase() === 'GUA'
  const barcodeRefs = useRef<(SVGSVGElement | null)[]>([])
  const limpiarEspecialidadEntreParentesis = (nombre: string): string => {
    return nombre.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim()
  }

  const esItemModularAgrupado = (incluye: string | null): boolean => {
    if (!incluye) return false
    return incluye.includes('+')
  }

  const esTituloPatologia = (item: OrdenConItems['items'][number]): boolean => {
    if (contieneClasificacion(item.clasificacionAgrupacion, 'HP')) return true
    if (item.codigoPractica.trim().startsWith('15')) return true
    return (item.titularModular ?? '').toUpperCase().includes('PATOLOG')
  }

  const tituloPorIncluye = (item: OrdenConItems['items'][number]): string => {
    if (item.codigoPractica.trim() === '66') {
      return 'PROTOCOLO BIOQUIMICO'
    }

    const incluye = item.incluyeCodigo

    if (item.titularModular) {
      return item.titularModular
    }

    if (item.clasificacionAgrupacion) {
      return tituloDesdeClasificacion(item.clasificacionAgrupacion)
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

  const diferencialTexto = (item: OrdenConItems['items'][number]): string => {
    if (item.codigoPractica.trim() === '66') return '-'
    if (item.porcentajeCargoPac !== null) return `${item.porcentajeCargoPac}%`
    return '100.00%'
  }

  const profesionalTexto = (item: OrdenConItems['items'][number]): string => {
    const nombreFallbackPorMatricula = (matricula: number): string => {
      if (matricula === 6) return 'ASOSIACION ANESTESISTA'
      if (matricula === 2675) return 'ANA MARIA VEGA'
      if (matricula === 9110) return 'CLINICA SAN RAFAEL'
      if (matricula === 9995) return 'GASTOS INTERNACION'
      if (matricula === 995) return 'PROFESIONAL AYUDANTE'
      return 'PROFESIONAL'
    }

    if (esTituloPatologia(item)) {
      const nombrePatologia = NOMBRE_PATOLOGIA_DEFAULT
      const matriculaPatologia = MATRICULA_PATOLOGIA_DEFAULT
      return `${nombrePatologia} · MP ${matriculaPatologia ?? '-'}`
    }

    if (esOrdenGuardiaAmbulatoria) {
      return 'CLINICA SAN RAFAEL · MP 9110'
    }

    // Verificar si es HE o HA (incluso en combinaciones como HE+GA)
    const incluyeCodigo = item.incluyeCodigo || ''
    const esGastos = contieneClasificacion(item.clasificacionAgrupacion, 'GA') || incluyeCodigo.includes('GA')
    const matriculaEfector = item.efectorMatricula ?? item.efectorProfesional?.matricula ?? null

    if (esGastos && matriculaEfector === 9995) {
      return 'GASTOS INTERNACION · MP 9995'
    }

    if (contieneClasificacion(item.clasificacionAgrupacion, 'HA') || incluyeCodigo.includes('HA')) {
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
    const esGastos = contieneClasificacion(item.clasificacionAgrupacion, 'GA') || incluyeCodigo.includes('GA')
    const matriculaEfector = item.efectorMatricula ?? item.efectorProfesional?.matricula ?? null
    const firmanteDesdeOrden = orden.profesional?.nombre
      ? {
          nombre: orden.profesional.nombre,
          matricula: orden.profesional.matricula ?? null,
        }
      : null

    if (esTituloPatologia(item) && !firmanteDesdeOrden) {
      return {
        nombre: NOMBRE_PATOLOGIA_DEFAULT,
        matricula: MATRICULA_PATOLOGIA_DEFAULT,
      }
    }

    if (esOrdenGuardiaAmbulatoria) {
      return { nombre: 'CLINICA SAN RAFAEL', matricula: MATRICULA_GUARDIA_PRINT }
    }

    if (esInternacion && firmanteDesdeOrden) {
      return firmanteDesdeOrden
    }

    if (!esInternacion && firmanteDesdeOrden) {
      return firmanteDesdeOrden
    }

    if (contieneClasificacion(item.clasificacionAgrupacion, 'HA') || incluyeCodigo.includes('HA')) {
      return { nombre: 'ASOSIACION ANESTESISTA', matricula: 6 }
    }

    if (esGastos && matriculaEfector === 9995) {
      return { nombre: 'GASTOS INTERNACION', matricula: 9995 }
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
        : item.efectorMatricula === 2675
          ? 'ANA MARIA VEGA'
        : item.efectorMatricula === 9110
          ? 'CLINICA SAN RAFAEL'
          : item.efectorMatricula === 9995
            ? 'GASTOS INTERNACION'
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

    if (items.some((it) => it.codigoPractica.trim() === '66')) {
      return 'PROTOCOLO BIOQUIMICO'
    }

    const codigos = new Set<string>()
    for (const item of items) {
      const clasificacionNormalizada =
        normalizarClasificacionAgrupacion(item.clasificacionAgrupacion) ??
        clasificacionDesdeIncluyeCodigo(item.incluyeCodigo)

      if (!clasificacionNormalizada) continue
      for (const token of clasificacionNormalizada.split('+')) {
        codigos.add(token)
      }
    }

    if (codigos.size > 0) {
      const clasificacionCombinada = normalizarClasificacionAgrupacion(
        Array.from(codigos).join('+')
      )
      if (clasificacionCombinada) {
        return tituloDesdeClasificacion(clasificacionCombinada)
      }
    }

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
          width: 1.8,
          height: 44,
          displayValue: true,
          fontSize: 11,
          margin: 4,
        })
      } catch {
        // barcode generation failed silently
      }
    })
  }, [paginas])

  const fechaEmision = new Date(orden.fechaEmision)
  const fechaFormateada = formatearFechaArgentina(fechaEmision, {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
  const horaFormateada = fechaEmision.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: ARG_TIME_ZONE,
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
                            {orden.obraSocial?.nombre ?? 'Particular'}
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
                  <span className="aut-valor">{orden.descripcion ?? ''}</span>
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
                        <td className="text-center">{diferencialTexto(item)}</td>
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
          @page {
            size: A4 portrait;
            margin: 6mm;
          }

          .no-print { display: none !important; }
          body > * { display: none !important; }
          .print-doc {
            display: block !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          nav, header, aside { display: none !important; }

          .aut-tabla-info,
          .aut-tabla-practicas {
            font-size: 9px !important;
          }

          .aut-clinica img {
            max-width: 68px !important;
            margin-bottom: 2px !important;
          }

          .autorizacion-pagina {
            height: 128mm;
            margin-bottom: 4mm !important;
            box-sizing: border-box;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid;
            break-inside: avoid-page;
            overflow: hidden;
          }

          .autorizacion-pagina:last-child {
            margin-bottom: 0 !important;
          }

          .aut-emisor {
            display: none !important;
          }
        }

        .print-doc {
          font-family: Arial, sans-serif;
          font-size: 11px;
          color: #000;
        }

        .autorizacion-pagina {
          border: 1px solid #ccc;
          margin-bottom: 8px;
          page-break-after: auto;
          break-after: auto;
        }

        .autorizacion-frente {
          padding: 6px 10px;
          border-bottom: 2px solid #000;
        }

        .aut-header {
          display: flex;
          gap: 10px;
          margin-bottom: 6px;
          border-bottom: 1px solid #ccc;
          padding-bottom: 6px;
        }

        .aut-clinica {
          min-width: 110px;
          font-size: 8.5px;
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
          font-size: 9.5px;
          border-collapse: collapse;
        }

        .aut-tabla-info td {
          padding: 1px 4px 1px 0;
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
          font-size: 11px;
        }

        .aut-orden-por {
          padding: 2px 0;
          display: flex;
          align-items: center;
          gap: 6px;
          border-bottom: 1px solid #eee;
        }

        .aut-tipo-right {
          margin-left: auto;
          font-weight: bold;
          font-size: 11px;
          letter-spacing: 1px;
        }

        .aut-diagnostico {
          padding: 2px 0;
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
          margin-top: 4px;
          font-size: 9.5px;
        }

        .aut-tabla-practicas th {
          border: 1px solid #999;
          padding: 2px 4px;
          background: #f5f5f5;
          font-weight: bold;
          text-align: left;
        }

        .aut-tabla-practicas td {
          border: 1px solid #ccc;
          padding: 2px 4px;
        }

        .autorizacion-dorso {
          padding: 6px 10px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 4px;
          background: #fff;
        }

        .aut-barcode {
          max-width: 240px;
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
          gap: 24px;
          margin-top: 12px;
        }

        .aut-firma-linea {
          flex: 1;
          border-top: 1px solid #000;
          padding-top: 4px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          font-size: 9px;
        }

        .aut-firma-label {
          text-align: center;
          font-style: italic;
          color: #333;
          line-height: 1.4;
        }

        .aut-firma-fecha {
          font-size: 8px;
          color: #555;
          white-space: nowrap;
        }

        .aut-nro-barcode {
          font-size: 9px;
          color: #666;
          letter-spacing: 1px;
        }
      `}</style>
    </>
  )
}
