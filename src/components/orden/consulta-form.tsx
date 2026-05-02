'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Plus, X, Loader2 } from 'lucide-react'
import { BuscarPaciente } from '@/components/admision/buscar-paciente'
import type { PacienteResumen } from '@/modules/admision/types'
import { crearOrdenesDesdeAdmisionAction } from '@/modules/orden/actions'
import type { OrdenPracticaItemInput } from '@/modules/orden/schemas'
import type { AdmisionOrdenContexto, NomencladorPracticaItem } from '@/modules/orden/types'

interface ObraSocialItem {
  id: number
  nombre: string
}

interface PlanItem {
  id: number
  descripcion: string
  obraSocialId: number
}

interface ProfesionalItem {
  id: number
  nombre: string
  matricula?: number | null
}

interface ConsultaFormProps {
  obraSociales: ObraSocialItem[]
  planes: PlanItem[]
  profesionales: ProfesionalItem[]
  pacienteInicial?: PacienteResumen | null
  admisionInicial?: AdmisionOrdenContexto | null
  usuario: string
}

type ItemPractica = OrdenPracticaItemInput & {
  descripcionPractica: string
  _key: string
  valorUnitario: number | null
}

const formatoMoneda = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
})

export function ConsultaForm({
  obraSociales,
  planes,
  profesionales,
  pacienteInicial,
  admisionInicial,
}: ConsultaFormProps) {
  const router = useRouter()
  const esFlujoAdmision = Boolean(admisionInicial)

  const [paciente, setPaciente] = useState<PacienteResumen | null>(pacienteInicial ?? null)
  const [obraSocialId, setObraSocialId] = useState<string>(
    admisionInicial?.obraSocialId?.toString() ?? pacienteInicial?.obraSocialId?.toString() ?? ''
  )
  const [planId, setPlanId] = useState<string>(admisionInicial?.planId?.toString() ?? '')
  const [profesionalId, setProfesionalId] = useState<string>('')
  const [diagnostico, setDiagnostico] = useState(admisionInicial?.descripcionPatologia ?? '')
  const [modoGeneracion, setModoGeneracion] = useState<'MASIVA' | 'INDIVIDUAL'>('MASIVA')
  const [practicas, setPracticas] = useState<ItemPractica[]>(
    (admisionInicial?.practicas ?? []).map((p, idx) => ({
      _key: `ingreso-${p.id}-${idx}`,
      convenioId: p.convenioId,
      codigoPractica: p.codigoPractica.trim().slice(0, 8),
      descripcionPractica: p.descripcionPractica,
      cantidad: p.cantidad,
      tipoFacturacion: 'H',
      importeTotal: p.importeTotal ?? undefined,
      valorUnitario:
        p.importeTotal != null && Number(p.cantidad) > 0 ? Number(p.importeTotal) / Number(p.cantidad) : null,
    }))
  )

  // Búsqueda de prácticas
  const [busquedaPractica, setBusquedaPractica] = useState('')
  const [resultadosPractica, setResultadosPractica] = useState<NomencladorPracticaItem[]>([])
  const [buscandoPractica, setBuscandoPractica] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const convenioDefecto =
    obraSocialId && Number.isFinite(parseInt(obraSocialId, 10))
      ? parseInt(obraSocialId, 10)
      : practicas[0]?.convenioId

  const planesDisponibles = obraSocialId
    ? planes.filter((p) => String(p.obraSocialId) === obraSocialId)
    : []
  const requierePlan = Boolean(obraSocialId) && planesDisponibles.length > 0

  const handlePacienteSeleccionado = useCallback(
    (p: PacienteResumen | null) => {
      setPaciente(p)
      if (p?.obraSocialId) {
        setObraSocialId(String(p.obraSocialId))
        setPlanId('')
      }
    },
    []
  )

  const buscarPractica = async () => {
    if (busquedaPractica.trim().length < 2) return
    if (!convenioDefecto) {
      setError('Seleccioná una obra social antes de buscar prácticas')
      return
    }

    setError(null)
    setBuscandoPractica(true)
    try {
      const qs = new URLSearchParams({
        q: busquedaPractica.trim(),
        convenioId: String(convenioDefecto),
      })
      const res = await fetch(`/api/practicas-nomenclador?${qs.toString()}`)
      const json = await res.json()
      setResultadosPractica(Array.isArray(json.data) ? json.data : [])
    } catch {
      setResultadosPractica([])
    } finally {
      setBuscandoPractica(false)
    }
  }

  const agregarPractica = (practica: NomencladorPracticaItem) => {
    const nueva: ItemPractica = {
      _key: `${practica.convenioId}-${practica.codigo}-${Date.now()}`,
      convenioId: practica.convenioId,
      codigoPractica: practica.codigo,
      descripcionPractica: practica.descripcion,
      cantidad: 1,
      tipoFacturacion: 'H',
      importeTotal: practica.valor ?? undefined,
      valorUnitario: practica.valor,
    }
    setPracticas((prev) => [...prev, nueva])
    setResultadosPractica([])
    setBusquedaPractica('')
  }

  const agregarPracticaManual = () => {
    if (!busquedaPractica.trim()) return
    if (!convenioDefecto) {
      setError('Seleccioná una obra social antes de agregar una práctica')
      return
    }

    setError(null)
    const nueva: ItemPractica = {
      _key: `manual-${Date.now()}`,
      convenioId: convenioDefecto,
      codigoPractica: busquedaPractica.trim().slice(0, 8).toUpperCase(),
      descripcionPractica: busquedaPractica.trim(),
      cantidad: 1,
      tipoFacturacion: 'H',
      valorUnitario: null,
    }
    setPracticas((prev) => [...prev, nueva])
    setResultadosPractica([])
    setBusquedaPractica('')
  }

  const quitarPractica = (key: string) => {
    setPracticas((prev) => prev.filter((p) => p._key !== key))
  }

  const actualizarCantidad = (key: string, cantidad: number) => {
    setPracticas((prev) =>
      prev.map((p) =>
        p._key === key
          ? {
              ...p,
              cantidad,
              importeTotal: p.valorUnitario != null ? p.valorUnitario * cantidad : p.importeTotal,
            }
          : p
      )
    )
  }

  const agregarMedicacionComoPractica = (med: NonNullable<AdmisionOrdenContexto['medicaciones']>[number]) => {
    if (!convenioDefecto) {
      setError('Seleccioná una obra social para incorporar medicaciones a la orden')
      return
    }

    const key = `med-${med.id}`
    setPracticas((prev) => {
      if (prev.some((p) => p._key === key)) return prev
      return [
        {
          _key: key,
          convenioId: convenioDefecto,
          codigoPractica: `MED${med.id}`.slice(0, 8).toUpperCase(),
          descripcionPractica: `MEDICACION: ${med.nombre}`,
          cantidad: 1,
          tipoFacturacion: 'H',
          valorUnitario: null,
        },
        ...prev,
      ]
    })
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!paciente) return setError('Seleccioná un paciente')
    if (!obraSocialId) return setError('Seleccioná una obra social')
    if (requierePlan && !planId) return setError('Seleccioná un plan')
    if (!profesionalId) return setError('Seleccioná un profesional')
    if (practicas.length === 0) return setError('Agregá al menos una práctica')

    setSubmitting(true)
    try {
      const result = await crearOrdenesDesdeAdmisionAction({
        ingresoId: admisionInicial?.id,
        pacienteId: admisionInicial?.paciente?.id ?? paciente.id,
        nombrePaciente: paciente.nombreCompleto.slice(0, 50),
        numeroAfiliado: admisionInicial?.numeroAfiliado ?? paciente.numeroAfiliado ?? '',
        obraSocialId: parseInt(obraSocialId, 10),
        planId: planId ? parseInt(planId, 10) : undefined,
        profesionalId: parseInt(profesionalId, 10),
        tipoOrdenCodigo: 'PRA',
        descripcionPatologia: diagnostico || undefined,
        modoGeneracion,
        items: practicas.map((p) => ({
          convenioId: p.convenioId,
          codigoPractica: p.codigoPractica,
          descripcionPractica: p.descripcionPractica,
          cantidad: p.cantidad,
          tipoFacturacion: p.tipoFacturacion,
          importeTotal: p.valorUnitario != null ? p.valorUnitario * p.cantidad : p.importeTotal,
        })),
      })

      if ('error' in result && result.error) {
        setError(result.error)
      } else if ('ordenes' in result && Array.isArray(result.ordenes) && result.ordenes.length > 0) {
        if (result.ordenes.length === 1) {
          const orden = result.ordenes[0]!
          router.push(`/dashboard/ambulatorio/${orden.puestoNumero}/${orden.numero}`)
        } else {
          router.push('/dashboard/ambulatorio')
        }
      }
    } catch {
      setError('Error inesperado al generar la autorización')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">

      {/* Paciente */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Paciente</h3>
        {esFlujoAdmision && admisionInicial?.paciente ? (
          <div className="space-y-1">
            <p className="text-base font-semibold text-gray-900">
              {admisionInicial.paciente.nombreCompleto}
            </p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm text-gray-600">
              <span>
                <span className="text-gray-400 mr-1">Doc:</span>
                {admisionInicial.paciente.tipoDocumento ?? 'DNI'}{' '}
                {admisionInicial.paciente.numeroDocumento ?? '-'}
              </span>
              {admisionInicial.paciente.fechaNacimiento && (
                <span>
                  <span className="text-gray-400 mr-1">Nac.:</span>
                  {new Date(admisionInicial.paciente.fechaNacimiento).toLocaleDateString('es-AR')}
                </span>
              )}
              {admisionInicial.paciente.sexo && (
                <span>
                  <span className="text-gray-400 mr-1">Sexo:</span>
                  {admisionInicial.paciente.sexo === 'M' ? 'Masculino' : admisionInicial.paciente.sexo === 'F' ? 'Femenino' : admisionInicial.paciente.sexo}
                </span>
              )}
              {admisionInicial.paciente.domicilio && (
                <span>
                  <span className="text-gray-400 mr-1">Dom.:</span>
                  {admisionInicial.paciente.domicilio}
                </span>
              )}
              {admisionInicial.paciente.telefonoFijo && (
                <span>
                  <span className="text-gray-400 mr-1">Tel.:</span>
                  {admisionInicial.paciente.telefonoFijo}
                </span>
              )}
              {admisionInicial.paciente.celular1 && (
                <span>
                  <span className="text-gray-400 mr-1">Cel.:</span>
                  {admisionInicial.paciente.celular1}
                </span>
              )}
              {admisionInicial.paciente.email && (
                <span className="col-span-2">
                  <span className="text-gray-400 mr-1">Email:</span>
                  {admisionInicial.paciente.email}
                </span>
              )}
            </div>
            <p className="text-xs text-blue-700 mt-1">
              Admisión {admisionInicial.tipoIngresoCodigo}-{admisionInicial.numeroIngreso}
              {admisionInicial.fechaIngreso &&
                ` · ${new Date(admisionInicial.fechaIngreso).toLocaleDateString('es-AR')}`}
            </p>
          </div>
        ) : (
          <BuscarPaciente
            onSeleccionar={handlePacienteSeleccionado}
            pacienteSeleccionado={paciente}
          />
        )}
      </div>

      {/* Cobertura */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cobertura</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Obra Social</label>
            <select
              value={obraSocialId}
              onChange={(e) => {
                setObraSocialId(e.target.value)
                setPlanId('')
                setResultadosPractica([])
                setPracticas([])
              }}
              disabled={esFlujoAdmision}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-600"
            >
              <option value="">-- Seleccionar --</option>
              {obraSociales.map((os) => (
                <option key={os.id} value={String(os.id)}>
                  {os.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Plan</label>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              disabled={esFlujoAdmision || !obraSocialId || planesDisponibles.length === 0}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-600"
            >
              <option value="">
                {!obraSocialId
                  ? '-- Seleccione OS primero --'
                  : planesDisponibles.length === 0
                    ? '-- Sin planes --'
                    : '-- Seleccionar --'}
              </option>
              {planesDisponibles.map((plan) => (
                <option key={plan.id} value={String(plan.id)}>
                  {plan.descripcion}
                </option>
              ))}
            </select>
            {obraSocialId && planesDisponibles.length === 0 && (
              <p className="text-xs text-amber-700">
                Esta obra social no tiene planes cargados. La autorización se guardará con un plan técnico "SIN PLAN".
              </p>
            )}
          </div>
        </div>
        {esFlujoAdmision && admisionInicial?.numeroAfiliado && (
          <p className="text-xs text-gray-500">
            N° afiliado: <span className="font-medium text-gray-700">{admisionInicial.numeroAfiliado}</span>
          </p>
        )}
      </div>

      {/* Profesional */}
      <div className="space-y-1">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Profesional prescriptor
        </label>
        <select
          value={profesionalId}
          onChange={(e) => setProfesionalId(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">-- Seleccionar profesional --</option>
          {profesionales.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.nombre}
              {p.matricula ? ` (M.P. ${p.matricula})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Medicaciones de la admisión */}
      {admisionInicial && admisionInicial.medicaciones.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Medicaciones en admisión
          </h3>
          <div className="divide-y border rounded-md max-h-48 overflow-y-auto">
            {admisionInicial.medicaciones.map((m) => (
              <div key={m.id} className="px-3 py-2 text-sm bg-white">
                <p className="font-medium text-gray-900">{m.nombre}</p>
                <p className="text-xs text-gray-500">
                  {[m.dosis, m.viaAdministracion, m.frecuencia].filter(Boolean).join(' · ') || 'Sin detalle'}
                  {' · '}
                  {new Date(m.fechaInicio).toLocaleDateString('es-AR')}
                </p>
                <button
                  type="button"
                  onClick={() => agregarMedicacionComoPractica(m)}
                  className="mt-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  Agregar a la orden
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Diagnóstico */}
      <div className="space-y-1">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Diagnóstico <span className="font-normal normal-case">(opcional)</span>
        </label>
        <input
          type="text"
          value={diagnostico}
          onChange={(e) => setDiagnostico(e.target.value)}
          placeholder="Descripción del diagnóstico..."
          maxLength={300}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Prácticas */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Prácticas</h3>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={busquedaPractica}
              onChange={(e) => setBusquedaPractica(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); void buscarPractica() }
              }}
              placeholder="Buscar práctica por código o descripción..."
              className="w-full rounded-md border border-gray-300 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={() => void buscarPractica()}
            disabled={buscandoPractica || busquedaPractica.trim().length < 2}
            className="rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
          >
            {buscandoPractica ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
          </button>
          <button
            type="button"
            onClick={agregarPracticaManual}
            disabled={!busquedaPractica.trim()}
            title="Agregar práctica manual"
            className="rounded-md bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {resultadosPractica.length > 0 && (
          <div className="rounded-md border bg-white shadow-sm max-h-48 overflow-y-auto divide-y">
            {resultadosPractica.map((p) => (
              <button
                key={`${p.convenioId}-${p.codigo}`}
                type="button"
                onClick={() => agregarPractica(p)}
                className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors"
              >
                <p className="text-sm font-medium text-gray-900">{p.descripcion}</p>
                <p className="text-xs text-gray-500">
                  Código: {p.codigo.trim()}
                  {p.valor != null ? ` · ${formatoMoneda.format(p.valor)}` : ''}
                </p>
              </button>
            ))}
          </div>
        )}

        {practicas.length > 0 ? (
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Código</th>
                  <th className="px-3 py-2 text-left">Práctica</th>
                  <th className="px-3 py-2 text-right w-28">Precio</th>
                  <th className="px-3 py-2 text-center w-20">Cant.</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {practicas.map((p) => (
                  <tr key={p._key} className="bg-white">
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">
                      {p.codigoPractica.trim()}
                    </td>
                    <td className="px-3 py-2 text-gray-900">{p.descripcionPractica}</td>
                    <td className="px-3 py-2 text-right text-gray-600">
                      {p.valorUnitario != null ? formatoMoneda.format(p.valorUnitario) : '-'}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={p.cantidad}
                        onChange={(e) =>
                          actualizarCantidad(p._key, parseInt(e.target.value, 10) || 1)
                        }
                        className="w-full text-center rounded border border-gray-200 px-1 py-0.5 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => quitarPractica(p._key)}
                        className="text-red-400 hover:text-red-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4 border border-dashed rounded-md">
            Sin prácticas. Buscá una o agregala manualmente.
          </p>
        )}
      </div>

      {/* Modo de generación */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Generación</h3>
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="modo"
              checked={modoGeneracion === 'MASIVA'}
              onChange={() => setModoGeneracion('MASIVA')}
            />
            Una orden con todas las prácticas
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="modo"
              checked={modoGeneracion === 'INDIVIDUAL'}
              onChange={() => setModoGeneracion('INDIVIDUAL')}
            />
            Una orden por cada práctica
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? 'Generando...' : 'Generar autorización'}
        </button>
      </div>
    </form>
  )
}
