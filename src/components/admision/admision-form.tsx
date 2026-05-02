'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Search } from 'lucide-react'
import { BuscarPaciente } from './buscar-paciente'
import { createIngresoAction } from '@/modules/admision/actions'
import type { PacienteResumen } from '@/modules/admision/types'

interface ItemPractica {
  convenioId: number | null
  codigo: string
  descripcion: string
  cantidad: number
}

interface ItemMedicacion {
  nombre: string
  dosis: string
  viaAdministracion: string
  frecuencia: string
  observaciones: string
}

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

interface CoseguroOption {
  id: number
  nombre: string
}

interface SubtipoAdmisionOption {
  codigo: string
  descripcion: string
}

interface AdmisionFormProps {
  profesionales: ProfesionalOption[]
  obraSociales: ObraSocialOption[]
  planes: PlanOption[]
  coseguros: CoseguroOption[]
  subtipos: SubtipoAdmisionOption[]
  pacienteInicial?: PacienteResumen | null
}

function normalizarTexto(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function esNombreIPSS(nombre: string): boolean {
  const tokens = normalizarTexto(nombre).split(' ')
  return tokens.includes('IPSS') || tokens.includes('IPS')
}

export function AdmisionForm({
  profesionales,
  obraSociales,
  planes,
  coseguros,
  subtipos,
  pacienteInicial,
}: AdmisionFormProps) {
  const router = useRouter()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paciente, setPaciente] = useState<PacienteResumen | null>(pacienteInicial ?? null)

  // Tipo de ingreso por defecto para admisión general
  const tipoIngresoCodigo = 'AMB'

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
  const [planId, setPlanId] = useState(
    pacienteInicial?.planId?.toString() ?? ''
  )
  const [obraSocialCoseguroId, setObraSocialCoseguroId] = useState(
    pacienteInicial?.obraSocialCoseguroId?.toString() ?? ''
  )
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
  const [profesionalIndicadorNombre, setProfesionalIndicadorNombre] = useState('')
  const [tipoIndicacion, setTipoIndicacion] = useState('')
  const [descripcionIndicacion, setDescripcionIndicacion] = useState('')

  // Prácticas y medicamentos (para GUA/DER/IND)
  const [practicas, setPracticas] = useState<ItemPractica[]>([])
  const [medicaciones, setMedicaciones] = useState<ItemMedicacion[]>([])

  // Búsqueda de prácticas
  const [buscandoPractica, setBuscandoPractica] = useState(false)
  const [terminoBusquedaPractica, setTerminoBusquedaPractica] = useState('')
  const [resultadosPractica, setResultadosPractica] = useState<{ convenioId: number; codigo: string; descripcion: string }[]>([])

  // Nueva medicación
  const [nuevaMedNombre, setNuevaMedNombre] = useState('')
  const [nuevaMedDosis, setNuevaMedDosis] = useState('')
  const [nuevaMedVia, setNuevaMedVia] = useState('')
  const [nuevaMedFrecuencia, setNuevaMedFrecuencia] = useState('')
  const [nuevaMedObs, setNuevaMedObs] = useState('')

  const subtiposConPracticasMeds = ['GUA', 'DER', 'TUR', 'RAY', 'CUR', 'SUT', 'ECG', 'ECO', 'IND', 'PAM']
  const subtiposTurnoPractica = ['TUR', 'RAY', 'CUR', 'SUT', 'ECG', 'ECO', 'PAM']
  const mostrarPanelPracticasMeds = subtiposConPracticasMeds.includes(subtipoAdmisionCodigo)

  const buscarPracticaNomenclador = async () => {
    if (!terminoBusquedaPractica.trim()) return
    setBuscandoPractica(true)
    setResultadosPractica([])
    try {
      const res = await fetch(
        `/api/practicas-nomenclador?q=${encodeURIComponent(terminoBusquedaPractica.trim())}&porPagina=10`
      )
      const json = await res.json()
      if (json.ok) {
        const raw = json.data
        setResultadosPractica(Array.isArray(raw) ? raw : (raw?.items ?? []))
      }
    } catch {
      // ignorar error silencioso
    } finally {
      setBuscandoPractica(false)
    }
  }

  const agregarPractica = (practica: { convenioId: number; codigo: string; descripcion: string }) => {
    if (practicas.some((p) => p.codigo === practica.codigo)) return
    setPracticas((prev) => [
      ...prev,
      {
        convenioId: practica.convenioId,
        codigo: practica.codigo,
        descripcion: practica.descripcion,
        cantidad: 1,
      },
    ])
    setResultadosPractica([])
    setTerminoBusquedaPractica('')
  }

  const quitarPractica = (codigo: string) => {
    setPracticas((prev) => prev.filter((p) => p.codigo !== codigo))
  }

  const agregarMedicacion = () => {
    if (!nuevaMedNombre.trim()) return
    setMedicaciones((prev) => [
      ...prev,
      { nombre: nuevaMedNombre, dosis: nuevaMedDosis, viaAdministracion: nuevaMedVia, frecuencia: nuevaMedFrecuencia, observaciones: nuevaMedObs },
    ])
    setNuevaMedNombre('')
    setNuevaMedDosis('')
    setNuevaMedVia('')
    setNuevaMedFrecuencia('')
    setNuevaMedObs('')
  }

  const quitarMedicacion = (idx: number) => {
    setMedicaciones((prev) => prev.filter((_, i) => i !== idx))
  }

  const planesDisponibles = obraSocialId
    ? planes.filter((plan) => String(plan.obraSocialId ?? '') === obraSocialId)
    : planes
  const obraSocialSeleccionada = obraSociales.find((os) => String(os.id) === obraSocialId)
  const esIPSS = esNombreIPSS(obraSocialSeleccionada?.nombre ?? '')

  // Sincronizar cobertura cuando cambia el paciente
  const handleSeleccionarPaciente = (p: PacienteResumen | null) => {
    setPaciente(p)
    if (p) {
      setObraSocialId(p.obraSocialId ? p.obraSocialId.toString() : '')
      setPlanId(p.planId ? p.planId.toString() : '')
      setObraSocialCoseguroId(p.obraSocialCoseguroId ? p.obraSocialCoseguroId.toString() : '')
      setNumeroAfiliado(p.numeroAfiliado ?? '')
    } else {
      setObraSocialId('')
      setPlanId('')
      setObraSocialCoseguroId('')
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
        obraSocialCoseguroId: obraSocialCoseguroId ? parseInt(obraSocialCoseguroId, 10) : null,
        numeroAfiliado: numeroAfiliado || null,
        descripcionPatologia: descripcionPatologia || null,
        observaciones: observaciones || null,
        practicas: practicas.length > 0 ? practicas : undefined,
        medicaciones: medicaciones.length > 0 ? medicaciones : undefined,
      }

      // Agregar campos específicos según el subtipo
      if (subtipoAdmisionCodigo === 'GUA') {
        body.profesionalGuardiaId = profesionalGuardiaId ? parseInt(profesionalGuardiaId, 10) : null
      } else if (subtiposTurnoPractica.includes(subtipoAdmisionCodigo)) {
        body.profesionalIdTurno = profesionalIdTurno ? parseInt(profesionalIdTurno, 10) : null
        body.practicaCodigo = practicaCodigo || null
      } else if (subtipoAdmisionCodigo === 'DER') {
        body.centroDerivante = centroDerivante || null
        body.profesionalDerivanteNombre = profesionalDerivanteNombre || null
        body.motivoDerivacion = motivoDerivacion || null
        body.diagnosticoDerivacion = diagnosticoDerivacion || null
      } else if (subtipoAdmisionCodigo === 'IND') {
        body.profesionalIndicadorNombre = profesionalIndicadorNombre || null
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
        {paciente && (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1.5 text-xs text-gray-600">
            {paciente.fechaNacimiento && (
              <div><span className="text-gray-400">Fecha nac.:</span> {new Date(paciente.fechaNacimiento).toLocaleDateString('es-AR')}</div>
            )}
            {paciente.sexo && (
              <div><span className="text-gray-400">Sexo:</span> {paciente.sexo === 'M' ? 'Masculino' : paciente.sexo === 'F' ? 'Femenino' : paciente.sexo}</div>
            )}
            {paciente.domicilio && (
              <div className="col-span-2 md:col-span-1"><span className="text-gray-400">Domicilio:</span> {paciente.domicilio}</div>
            )}
            {paciente.telefonoFijo && (
              <div><span className="text-gray-400">Tel.:</span> {paciente.telefonoFijo}</div>
            )}
            {paciente.celular1 && (
              <div><span className="text-gray-400">Cel.:</span> {paciente.celular1}</div>
            )}
            {paciente.email && (
              <div className="col-span-2 md:col-span-1"><span className="text-gray-400">Email:</span> {paciente.email}</div>
            )}
          </div>
        )}
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
        subtipoAdmisionCodigo === 'CUR' ||
        subtipoAdmisionCodigo === 'SUT' ||
        subtipoAdmisionCodigo === 'ECG' ||
        subtipoAdmisionCodigo === 'ECO' ||
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
                <input
                  type="text"
                  value={profesionalIndicadorNombre}
                  onChange={(e) => setProfesionalIndicadorNombre(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej: Dr. Juan Pérez, Enfermero, Kinésiologo, etc."
                  maxLength={200}
                />
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
                setObraSocialCoseguroId('')
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

          {esIPSS && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Coseguro (solo IPSS)
              </label>
              <select
                value={obraSocialCoseguroId}
                onChange={(e) => setObraSocialCoseguroId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">-- Sin coseguro --</option>
                {coseguros.map((coseguro) => (
                  <option key={coseguro.id} value={String(coseguro.id)}>
                    {coseguro.nombre}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-amber-700">
                Si el paciente tiene IPSS con coseguro, seleccione uno. Si no, deje "Sin coseguro".
              </p>
            </div>
          )}
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

      {/* Prácticas y medicamentos (Guardia / Derivación / Indicación médica) */}
      {mostrarPanelPracticasMeds && (
        <>
          {/* Panel de prácticas */}
          <div className="his-card p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
              Prácticas realizadas
            </h3>
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={terminoBusquedaPractica}
                  onChange={(e) => setTerminoBusquedaPractica(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void buscarPracticaNomenclador() } }}
                  placeholder="Buscar práctica en nomenclador..."
                  className="w-full rounded-md border border-gray-300 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="button"
                onClick={() => void buscarPracticaNomenclador()}
                disabled={buscandoPractica || !terminoBusquedaPractica.trim()}
                className="rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                {buscandoPractica ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
            {resultadosPractica.length > 0 && (
              <div className="mb-3 rounded-md border bg-white shadow-sm max-h-48 overflow-y-auto divide-y">
                {resultadosPractica.map((p) => (
                  <button
                    key={p.codigo}
                    type="button"
                    onClick={() => agregarPractica(p)}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors text-sm"
                  >
                    <span className="font-mono text-xs text-gray-500 mr-2">{p.codigo}</span>
                    {p.descripcion}
                  </button>
                ))}
              </div>
            )}
            {practicas.length > 0 ? (
              <div className="divide-y border rounded-md">
                {practicas.map((p) => (
                  <div key={p.codigo} className="flex items-center gap-3 px-3 py-2">
                    <span className="font-mono text-xs text-gray-500 w-20 shrink-0">{p.codigo}</span>
                    <span className="flex-1 text-sm text-gray-800">{p.descripcion}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <label className="text-xs text-gray-500">Cant.</label>
                      <input
                        type="number"
                        min={1}
                        value={p.cantidad}
                        onChange={(e) => setPracticas((prev) => prev.map((x) => x.codigo === p.codigo ? { ...x, cantidad: Math.max(1, parseInt(e.target.value) || 1) } : x))}
                        className="w-14 rounded border border-gray-300 px-2 py-1 text-xs text-center"
                      />
                    </div>
                    <button type="button" onClick={() => quitarPractica(p.codigo)} className="text-red-400 hover:text-red-600 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No se han agregado prácticas.</p>
            )}
          </div>

          {/* Panel de medicamentos */}
          <div className="his-card p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
              Medicamentos administrados
            </h3>
            {/* Formulario para agregar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 p-3 rounded-md bg-gray-50 border">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Medicamento <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={nuevaMedNombre}
                  onChange={(e) => setNuevaMedNombre(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej: Ibuprofeno"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Dosis</label>
                <input
                  type="text"
                  value={nuevaMedDosis}
                  onChange={(e) => setNuevaMedDosis(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej: 400mg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Vía de administración</label>
                <input
                  type="text"
                  value={nuevaMedVia}
                  onChange={(e) => setNuevaMedVia(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej: Oral, EV, IM"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Frecuencia</label>
                <input
                  type="text"
                  value={nuevaMedFrecuencia}
                  onChange={(e) => setNuevaMedFrecuencia(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej: Cada 8 hs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Observaciones</label>
                <input
                  type="text"
                  value={nuevaMedObs}
                  onChange={(e) => setNuevaMedObs(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Notas adicionales"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={agregarMedicacion}
                  disabled={!nuevaMedNombre.trim()}
                  className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <Plus className="h-4 w-4" /> Agregar
                </button>
              </div>
            </div>
            {medicaciones.length > 0 ? (
              <div className="divide-y border rounded-md">
                {medicaciones.map((m, idx) => (
                  <div key={idx} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{m.nombre}</p>
                      <p className="text-xs text-gray-500">
                        {[m.dosis, m.viaAdministracion, m.frecuencia].filter(Boolean).join(' · ')}
                        {m.observaciones && <> — {m.observaciones}</>}
                      </p>
                    </div>
                    <button type="button" onClick={() => quitarMedicacion(idx)} className="text-red-400 hover:text-red-600 transition-colors shrink-0">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No se han agregado medicamentos.</p>
            )}
          </div>
        </>
      )}

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
