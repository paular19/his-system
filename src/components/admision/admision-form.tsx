'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BuscarPaciente } from './buscar-paciente'
import { createIngresoAction } from '@/modules/admision/actions'
import type { PacienteResumen } from '@/modules/admision/types'

interface ProfesionalOption {
  id: number
  nombre: string
}

interface ObraSocialOption {
  id: number
  nombre: string
  requiereCoseguro: boolean
}

interface PlanOption {
  id: number
  nombre: string
  obraSocialId: number | null
}

interface SubtipoAdmisionOption {
  codigo: string
  descripcion: string
}

interface AdmisionFormProps {
  profesionales: ProfesionalOption[]
  obraSociales: ObraSocialOption[]
  planes: PlanOption[]
  subtipos: SubtipoAdmisionOption[]
  pacienteInicial?: PacienteResumen | null
}

export function AdmisionForm({
  profesionales,
  obraSociales,
  planes,
  subtipos,
  pacienteInicial,
}: AdmisionFormProps) {
  const router = useRouter()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paciente, setPaciente] = useState<PacienteResumen | null>(pacienteInicial ?? null)

  // Tipo de ingreso: ambulatorio
  const tipoIngresoCodigo = 'A'

  // Estado general
  const [fechaIngreso, setFechaIngreso] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [fechaEgresoPrevista, setFechaEgresoPrevista] = useState('')
  const [subtipoAdmisionCodigo, setSubtipoAdmisionCodigo] = useState('')
  const [profesionalGuardiaId, setProfesionalGuardiaId] = useState('')
  const [profesionalTratanteId, setProfesionalTratanteId] = useState('')
  const [obraSocialId, setObraSocialId] = useState(
    pacienteInicial?.obraSocialId?.toString() ?? ''
  )
  const [planId, setPlanId] = useState('')
  const [numeroAfiliado, setNumeroAfiliado] = useState(
    pacienteInicial?.numeroAfiliado ?? ''
  )
  const [descripcionPatologia, setDescripcionPatologia] = useState('')
  const [observaciones, setObservaciones] = useState('')

  // Campos específicos por subtipo
  const [profesionalIdTurno, setProfesionalIdTurno] = useState('')
  const [practicaCodigo, setPracticaCodigo] = useState('')
  const [centroDerivante, setCentroDerivante] = useState('')
  const [profesionalDerivanteNombre, setProfesionalDerivanteNombre] = useState('')
  const [motivoDerivacion, setMotivoDerivacion] = useState('')
  const [diagnosticoDerivacion, setDiagnosticoDerivacion] = useState('')
  const [profesionalIndicadorId, setProfesionalIndicadorId] = useState('')
  const [tipoIndicacion, setTipoIndicacion] = useState('')
  const [descripcionIndicacion, setDescripcionIndicacion] = useState('')

  const planesDisponibles = obraSocialId
    ? planes.filter((plan) => String(plan.obraSocialId ?? '') === obraSocialId)
    : planes

  // Sincronizar cobertura cuando cambia el paciente
  const handleSeleccionarPaciente = (p: PacienteResumen | null) => {
    setPaciente(p)
    if (p) {
      setObraSocialId(p.obraSocialId ? p.obraSocialId.toString() : '')
      setPlanId('')
      setNumeroAfiliado(p.numeroAfiliado ?? '')
    } else {
      setObraSocialId('')
      setPlanId('')
      setNumeroAfiliado('')
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!paciente) {
      setError('Debe seleccionar un paciente')
      return
    }

    if (!subtipoAdmisionCodigo) {
      setError('Debe seleccionar un tipo de admisión')
      return
    }

    setGuardando(true)
    setError(null)

    try {
      const body: any = {
        pacienteId: paciente.id,
        tipoIngresoCodigo,
        subtipoAdmisionCodigo,
        fechaIngreso,
        fechaEgresoPrevista: fechaEgresoPrevista || null,
        profesionalGuardiaId: profesionalGuardiaId ? parseInt(profesionalGuardiaId, 10) : null,
        profesionalTratanteId: profesionalTratanteId ? parseInt(profesionalTratanteId, 10) : null,
        obraSocialId: obraSocialId ? parseInt(obraSocialId, 10) : null,
        planId: planId ? parseInt(planId, 10) : null,
        numeroAfiliado: numeroAfiliado || null,
        descripcionPatologia: descripcionPatologia || null,
        observaciones: observaciones || null,
      }

      // Agregar campos específicos según el subtipo
      if (subtipoAdmisionCodigo === 'GUA') {
        body.profesionalGuardiaId = profesionalGuardiaId ? parseInt(profesionalGuardiaId, 10) : null
      } else if (subtipoAdmisionCodigo === 'TUR' || subtipoAdmisionCodigo === 'RAY' || subtipoAdmisionCodigo === 'PAM') {
        body.profesionalIdTurno = profesionalIdTurno ? parseInt(profesionalIdTurno, 10) : null
        body.practicaCodigo = practicaCodigo || null
      } else if (subtipoAdmisionCodigo === 'DER') {
        body.centroDerivante = centroDerivante || null
        body.profesionalDerivanteNombre = profesionalDerivanteNombre || null
        body.motivoDerivacion = motivoDerivacion || null
        body.diagnosticoDerivacion = diagnosticoDerivacion || null
      } else if (subtipoAdmisionCodigo === 'IND') {
        body.profesionalIndicadorId = profesionalIndicadorId ? parseInt(profesionalIndicadorId, 10) : null
        body.tipoIndicacion = tipoIndicacion || null
        body.descripcionIndicacion = descripcionIndicacion || null
      }

      const result = await createIngresoAction(body)

      router.push(`/dashboard/admision/${result.id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Selección de paciente */}
      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
          Paciente <span className="text-red-500">*</span>
        </h3>
        <BuscarPaciente
          onSeleccionar={handleSeleccionarPaciente}
          pacienteSeleccionado={paciente}
        />
        {!paciente && (
          <p className="mt-2 text-xs text-gray-400">
            Busque el paciente por nombre, apellido o DNI. Si no existe,{' '}
            <a href="/dashboard/pacientes/nuevo" className="text-blue-600 hover:underline">
              regístrelo primero
            </a>
            .
          </p>
        )}
      </div>

      {/* Tipo de admisión */}
      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
          Tipo de Admisión <span className="text-red-500">*</span>
        </h3>
        <div className="max-w-md">
          <select
            value={subtipoAdmisionCodigo}
            onChange={(e) => setSubtipoAdmisionCodigo(e.target.value)}
            disabled={false}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100"
          >
            <option value="">
              -- Seleccionar tipo de admisión --
            </option>
            {subtipos.map((subtipo) => (
              <option key={subtipo.codigo} value={subtipo.codigo}>
                {subtipo.descripcion}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Datos de admisión - Comunes */}
      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
          Datos de Admisión
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Fecha de Ingreso
            </label>
            <input
              type="date"
              value={fechaIngreso}
              onChange={(e) => setFechaIngreso(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Egreso Previsto
            </label>
            <input
              type="date"
              value={fechaEgresoPrevista}
              onChange={(e) => setFechaEgresoPrevista(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Profesional Guardia
            </label>
            <select
              value={profesionalGuardiaId}
              onChange={(e) => setProfesionalGuardiaId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Seleccionar profesional --</option>
              {profesionales.map((prof) => (
                <option key={prof.id} value={String(prof.id)}>
                  {prof.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Profesional Tratante
            </label>
            <select
              value={profesionalTratanteId}
              onChange={(e) => setProfesionalTratanteId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Seleccionar profesional --</option>
              {profesionales.map((prof) => (
                <option key={prof.id} value={String(prof.id)}>
                  {prof.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Campos específicos - GUARDIA */}
      {subtipoAdmisionCodigo === 'GUA' && (
        <div className="his-card p-5 border-l-4 border-blue-500">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
            Ingreso por Guardia
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Profesional de Guardia <span className="text-red-500">*</span>
              </label>
              <select
                value={profesionalGuardiaId}
                onChange={(e) => setProfesionalGuardiaId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Seleccionar profesional --</option>
                {profesionales.map((prof) => (
                  <option key={prof.id} value={String(prof.id)}>
                    {prof.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Campos específicos - TURNO/RAYOS/PRÁCTICA */}
      {(subtipoAdmisionCodigo === 'TUR' ||
        subtipoAdmisionCodigo === 'RAY' ||
        subtipoAdmisionCodigo === 'PAM') && (
          <div className="his-card p-5 border-l-4 border-green-500">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
              Ingreso por Turno/Práctica Ambulatoria
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Profesional
                </label>
                <select
                  value={profesionalIdTurno}
                  onChange={(e) => setProfesionalIdTurno(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Seleccionar profesional --</option>
                  {profesionales.map((prof) => (
                    <option key={prof.id} value={String(prof.id)}>
                      {prof.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Código de Práctica
                </label>
                <input
                  type="text"
                  value={practicaCodigo}
                  onChange={(e) => setPracticaCodigo(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej: RADIOLOGIA, ECOGRAFIA"
                />
              </div>
            </div>
          </div>
        )}

      {/* Campos específicos - DERIVACIÓN */}
      {subtipoAdmisionCodigo === 'DER' && (
        <div className="his-card p-5 border-l-4 border-yellow-500">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
            Información de Derivación
          </h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Centro Derivante
                </label>
                <input
                  type="text"
                  value={centroDerivante}
                  onChange={(e) => setCentroDerivante(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nombre del centro o institución derivante"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Profesional Derivante
                </label>
                <input
                  type="text"
                  value={profesionalDerivanteNombre}
                  onChange={(e) => setProfesionalDerivanteNombre(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nombre del profesional que derivó"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Motivo de Derivación
              </label>
              <textarea
                value={motivoDerivacion}
                onChange={(e) => setMotivoDerivacion(e.target.value)}
                maxLength={500}
                rows={2}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Razón por la cual se derivó al paciente..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Diagnóstico de Derivación
              </label>
              <textarea
                value={diagnosticoDerivacion}
                onChange={(e) => setDiagnosticoDerivacion(e.target.value)}
                maxLength={500}
                rows={2}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Diagnóstico presuntivo o información clínica relevante..."
              />
            </div>
          </div>
        </div>
      )}

      {/* Campos específicos - INDICACIÓN MÉDICA */}
      {subtipoAdmisionCodigo === 'IND' && (
        <div className="his-card p-5 border-l-4 border-purple-500">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
            Información de Indicación Médica
          </h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Profesional Indicador
                </label>
                <select
                  value={profesionalIndicadorId}
                  onChange={(e) => setProfesionalIndicadorId(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Seleccionar profesional --</option>
                  {profesionales.map((prof) => (
                    <option key={prof.id} value={String(prof.id)}>
                      {prof.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Tipo de Indicación
                </label>
                <input
                  type="text"
                  value={tipoIndicacion}
                  onChange={(e) => setTipoIndicacion(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej: Inyección, Nebulización, Hidratación"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Descripción de la Indicación Médica
              </label>
              <textarea
                value={descripcionIndicacion}
                onChange={(e) => setDescripcionIndicacion(e.target.value)}
                maxLength={500}
                rows={3}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Detalle de la indicación médica, procedimiento a realizar, etc..."
              />
            </div>
          </div>
        </div>
      )}

      {/* Cobertura médica */}
      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
          Cobertura Médica
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Obra Social
            </label>
            <select
              value={obraSocialId}
              onChange={(e) => {
                setObraSocialId(e.target.value)
                setPlanId('')
              }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">-- Seleccionar obra social --</option>
              {obraSociales.map((obraSocial) => (
                <option key={obraSocial.id} value={String(obraSocial.id)}>
                  {obraSocial.nombre}
                  {obraSocial.requiereCoseguro ? ' (requiere coseguro)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Plan</label>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              disabled={!obraSocialId || planesDisponibles.length === 0}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100 disabled:text-gray-500"
            >
              <option value="">
                {!obraSocialId
                  ? '-- Seleccione obra social primero --'
                  : '-- Seleccionar plan --'}
              </option>
              {planesDisponibles.map((plan) => (
                <option key={plan.id} value={String(plan.id)}>
                  {plan.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Número de Afiliado
            </label>
            <input
              type="text"
              value={numeroAfiliado}
              onChange={(e) => setNumeroAfiliado(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="123456789"
            />
          </div>
        </div>
      </div>

      {/* Diagnóstico inicial */}
      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b">
          Diagnóstico / Motivo de Consulta
        </h3>
        <textarea
          value={descripcionPatologia}
          onChange={(e) => setDescripcionPatologia(e.target.value)}
          rows={3}
          maxLength={500}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder="Descripción del motivo de ingreso o diagnóstico presuntivo..."
        />
      </div>

      {/* Observaciones */}
      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b">
          Observaciones
        </h3>
        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          rows={2}
          maxLength={2000}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder="Observaciones adicionales del ingreso..."
        />
      </div>

      {/* Acciones */}
      <div className="flex items-center justify-end gap-3 pb-4">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={guardando}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={guardando || !paciente || !subtipoAdmisionCodigo}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {guardando ? 'Registrando...' : 'Registrar Admisión'}
        </button>
      </div>
    </form>
  )
}
