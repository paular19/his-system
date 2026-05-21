'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Search, Loader2 } from 'lucide-react'
import { BuscarPaciente } from './buscar-paciente'
import { createIngresoAction } from '@/modules/admision/actions'
import {
  ComponenteSelector,
  calcularTotalSeleccionado,
  seleccionPorDefecto,
  type ComponenteSeleccion,
  type ComponenteValores,
} from '@/components/ui/componente-selector'
import type { PacienteResumen } from '@/modules/admision/types'

interface ItemPractica {
  convenioId: number | null
  codigo: string
  descripcion: string
  cantidad: number
  desglose: ComponenteValores
  seleccionComponentes: ComponenteSeleccion
  requiereMatriculaEspecialista?: boolean
  requiereMatriculaAnestesista?: boolean
  matriculaEspecialista?: number | null
  matriculaAnestesista?: number | null
}

interface ItemMedicacion {
  nombre: string
  dosis: string
  viaAdministracion: string
  frecuencia: string
  observaciones: string
}

interface ItemDescartable {
  nombre: string
  cantidad: number
  observaciones: string
}

interface ProfesionalOption {
  id: number
  nombre: string
  matricula?: number | null
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

const MATRICULA_AMBULATORIO_DEFAULT = 9110

export function AdmisionForm({
  profesionales,
  obraSociales,
  planes,
  coseguros,
  subtipos,
  pacienteInicial,
}: AdmisionFormProps) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
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
  const [descartables, setDescartables] = useState<ItemDescartable[]>([])

  // Búsqueda de prácticas
  const [buscandoPractica, setBuscandoPractica] = useState(false)
  const [terminoBusquedaPractica, setTerminoBusquedaPractica] = useState('')
  const [resultadosPractica, setResultadosPractica] = useState<Array<{
    convenioId: number
    codigo: string
    descripcion: string
    valorEspecialista?: number | null
    valorAyudante?: number | null
    valorAnestesista?: number | null
    valorGastos?: number | null
  }>>([])

  // Nueva medicación
  const [nuevaMedNombre, setNuevaMedNombre] = useState('')
  const [nuevaMedDosis, setNuevaMedDosis] = useState('')
  const [nuevaMedVia, setNuevaMedVia] = useState('')
  const [nuevaMedFrecuencia, setNuevaMedFrecuencia] = useState('')
  const [nuevaMedObs, setNuevaMedObs] = useState('')
  const [buscandoMedicamentoCatalogo, setBuscandoMedicamentoCatalogo] = useState(false)
  const [resultadosMedicamentoCatalogo, setResultadosMedicamentoCatalogo] = useState<Array<{ id: number; nombre: string }>>([])
  const medicamentoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [nuevoDesNombre, setNuevoDesNombre] = useState('')
  const [nuevoDesCantidad, setNuevoDesCantidad] = useState('1')
  const [nuevoDesObs, setNuevoDesObs] = useState('')
  const [buscandoDescartableCatalogo, setBuscandoDescartableCatalogo] = useState(false)
  const [resultadosDescartableCatalogo, setResultadosDescartableCatalogo] = useState<Array<{ id: number; nombre: string }>>([])
  const descartableDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const subtiposConPracticasMeds = ['GUA', 'DER', 'TUR', 'RAY', 'CUR', 'SUT', 'ECG', 'ECO', 'IND', 'PAM']
  const subtiposTurnoPractica = ['TUR', 'RAY', 'CUR', 'SUT', 'ECG', 'ECO', 'PAM']
  const mostrarPanelPracticasMeds = subtiposConPracticasMeds.includes(subtipoAdmisionCodigo)
  const mostrarPracticasAmbulatorias = subtiposTurnoPractica.includes(subtipoAdmisionCodigo)
  const mostrarMedicacion = mostrarPanelPracticasMeds && !['RAY', 'ECG', 'ECO'].includes(subtipoAdmisionCodigo)
  const mostrarDescartables = mostrarMedicacion
  const etiquetaBusquedaPractica = subtipoAdmisionCodigo === 'CUR' || subtipoAdmisionCodigo === 'SUT'
    ? 'Buscar código de práctica...'
    : 'Buscar práctica en nomenclador...'

  const obtenerProfesionalSeleccionadoId = () => {
    if (subtiposTurnoPractica.includes(subtipoAdmisionCodigo)) {
      return profesionalIdTurno
    }

    if (subtipoAdmisionCodigo === 'GUA') {
      return profesionalGuardiaId || profesionalTratanteId
    }

    return profesionalTratanteId || profesionalGuardiaId || profesionalIdTurno
  }

  const obtenerMatriculaAmbulatoria = () => {
    const profesionalId = Number.parseInt(obtenerProfesionalSeleccionadoId(), 10)
    if (Number.isFinite(profesionalId)) {
      const profesional = profesionales.find((p) => p.id === profesionalId)
      if (profesional?.matricula) return profesional.matricula
    }
    return MATRICULA_AMBULATORIO_DEFAULT
  }

  const buscarPracticaNomenclador = async (termino: string) => {
    if (termino.trim().length < 2) {
      setResultadosPractica([])
      return
    }

    setBuscandoPractica(true)
    setResultadosPractica([])
    try {
      const params = new URLSearchParams({ q: termino.trim() })
      const convenioId = Number.parseInt(obraSocialId, 10)
      if (Number.isFinite(convenioId)) {
        params.set('convenioId', String(convenioId))
      }

      const res = await fetch(`/api/practicas-nomenclador?${params.toString()}`)
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

  useEffect(() => {
    const termino = terminoBusquedaPractica.trim()
    if (termino.length < 2) {
      setResultadosPractica([])
      return
    }

    const timer = setTimeout(() => {
      void buscarPracticaNomenclador(termino)
    }, 350)

    return () => clearTimeout(timer)
  }, [terminoBusquedaPractica, obraSocialId])

  const buscarMedicamentoCatalogo = (value: string) => {
    setNuevaMedNombre(value)
    if (medicamentoDebounceRef.current) clearTimeout(medicamentoDebounceRef.current)

    const query = value.trim()
    if (query.length < 2) {
      setResultadosMedicamentoCatalogo([])
      return
    }

    medicamentoDebounceRef.current = setTimeout(async () => {
      setBuscandoMedicamentoCatalogo(true)
      try {
        const res = await fetch(`/api/catalogos/medicamentos-uti?q=${encodeURIComponent(query)}&limit=12`)
        const json = await res.json()
        setResultadosMedicamentoCatalogo(Array.isArray(json.data) ? json.data : [])
      } catch {
        setResultadosMedicamentoCatalogo([])
      } finally {
        setBuscandoMedicamentoCatalogo(false)
      }
    }, 300)
  }

  const buscarDescartableCatalogo = (value: string) => {
    setNuevoDesNombre(value)
    if (descartableDebounceRef.current) clearTimeout(descartableDebounceRef.current)

    const query = value.trim()
    if (query.length < 2) {
      setResultadosDescartableCatalogo([])
      return
    }

    descartableDebounceRef.current = setTimeout(async () => {
      setBuscandoDescartableCatalogo(true)
      try {
        const res = await fetch(`/api/catalogos/descartables-uti?q=${encodeURIComponent(query)}&limit=12`)
        const json = await res.json()
        setResultadosDescartableCatalogo(Array.isArray(json.data) ? json.data : [])
      } catch {
        setResultadosDescartableCatalogo([])
      } finally {
        setBuscandoDescartableCatalogo(false)
      }
    }, 300)
  }

  const agregarPractica = (practica: {
    convenioId: number
    codigo: string
    descripcion: string
    valorEspecialista?: number | null
    valorAyudante?: number | null
    valorAnestesista?: number | null
    valorGastos?: number | null
  }) => {
    if (practicas.some((p) => p.codigo === practica.codigo)) return

    const matriculaAmbulatoria = obtenerMatriculaAmbulatoria()

    setPracticas((prev) => [
      ...prev,
      {
        convenioId: practica.convenioId,
        codigo: practica.codigo,
        descripcion: practica.descripcion,
        cantidad: 1,
        desglose: {
          valorEspecialista: practica.valorEspecialista ?? null,
          valorAyudante: practica.valorAyudante ?? null,
          valorAnestesista: practica.valorAnestesista ?? null,
          valorGastos: practica.valorGastos ?? null,
          valorTotal: null,
        },
        seleccionComponentes: seleccionPorDefecto({
          valorEspecialista: practica.valorEspecialista ?? null,
          valorAyudante: practica.valorAyudante ?? null,
          valorAnestesista: practica.valorAnestesista ?? null,
          valorGastos: practica.valorGastos ?? null,
          valorTotal: null,
        }),
        requiereMatriculaEspecialista: practica.valorEspecialista != null,
        requiereMatriculaAnestesista: practica.valorAnestesista != null,
        matriculaEspecialista: practica.valorEspecialista != null ? matriculaAmbulatoria : null,
        matriculaAnestesista: practica.valorAnestesista != null ? matriculaAmbulatoria : null,
      },
    ])
    setResultadosPractica([])
    setTerminoBusquedaPractica('')
  }

  const quitarPractica = (codigo: string) => {
    setPracticas((prev) => prev.filter((p) => p.codigo !== codigo))
  }

  useEffect(() => {
    if (!mostrarPanelPracticasMeds || practicas.length === 0) return

    const matriculaAmbulatoria = obtenerMatriculaAmbulatoria()
    setPracticas((prev) =>
      prev.map((p) => ({
        ...p,
        matriculaEspecialista:
          p.requiereMatriculaEspecialista && (!p.matriculaEspecialista || p.matriculaEspecialista === MATRICULA_AMBULATORIO_DEFAULT)
            ? matriculaAmbulatoria
            : p.matriculaEspecialista,
        matriculaAnestesista:
          p.requiereMatriculaAnestesista && (!p.matriculaAnestesista || p.matriculaAnestesista === MATRICULA_AMBULATORIO_DEFAULT)
            ? matriculaAmbulatoria
            : p.matriculaAnestesista,
      }))
    )
  }, [mostrarPanelPracticasMeds, subtipoAdmisionCodigo, profesionalIdTurno, profesionalGuardiaId, profesionalTratanteId, practicas.length])

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
    setResultadosMedicamentoCatalogo([])
  }

  const quitarMedicacion = (idx: number) => {
    setMedicaciones((prev) => prev.filter((_, i) => i !== idx))
  }

  const agregarDescartable = () => {
    if (!nuevoDesNombre.trim()) return
    setDescartables((prev) => [
      ...prev,
      {
        nombre: nuevoDesNombre,
        cantidad: Math.max(1, Number.parseInt(nuevoDesCantidad, 10) || 1),
        observaciones: nuevoDesObs,
      },
    ])
    setNuevoDesNombre('')
    setNuevoDesCantidad('1')
    setNuevoDesObs('')
    setResultadosDescartableCatalogo([])
  }

  const quitarDescartable = (idx: number) => {
    setDescartables((prev) => prev.filter((_, i) => i !== idx))
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
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    if (!subtipoAdmisionCodigo) {
      setError('Debe seleccionar un tipo de admisión')
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    const matriculaAmbulatoria = obtenerMatriculaAmbulatoria()

    const practicasNormalizadas = practicas.map((p) => ({
      ...p,
      matriculaEspecialista:
        p.requiereMatriculaEspecialista && (!p.matriculaEspecialista || p.matriculaEspecialista === MATRICULA_AMBULATORIO_DEFAULT)
          ? matriculaAmbulatoria
          : p.matriculaEspecialista,
      matriculaAnestesista:
        p.requiereMatriculaAnestesista && (!p.matriculaAnestesista || p.matriculaAnestesista === MATRICULA_AMBULATORIO_DEFAULT)
          ? matriculaAmbulatoria
          : p.matriculaAnestesista,
    }))

    const practicaSinMatricula = practicasNormalizadas.find((p) =>
      (p.requiereMatriculaEspecialista && p.seleccionComponentes.especialista > 0 && !p.matriculaEspecialista) ||
      (p.requiereMatriculaAnestesista && p.seleccionComponentes.anestesista > 0 && !p.matriculaAnestesista)
    )
    if (practicaSinMatricula) {
      setError('Complete matrícula en prácticas con HE/HA antes de registrar la admisión')
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    setPracticas(practicasNormalizadas)

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
        practicas: practicasNormalizadas.length > 0 ? practicasNormalizadas.map((p) => ({
          ...p,
          grupoOrden: null,
          importeTotal: Number((calcularTotalSeleccionado(p.desglose, p.seleccionComponentes) * p.cantidad).toFixed(2)),
          matriculaEspecialista: p.seleccionComponentes.especialista > 0 ? p.matriculaEspecialista : null,
          matriculaAnestesista: p.seleccionComponentes.anestesista > 0 ? p.matriculaAnestesista : null,
        })) : undefined,
        medicaciones: mostrarMedicacion && medicaciones.length > 0 ? medicaciones : undefined,
        descartables: mostrarDescartables && descartables.length > 0 ? descartables : undefined,
      }

      // Agregar campos específicos según el subtipo
      if (subtipoAdmisionCodigo === 'GUA') {
        body.profesionalGuardiaId = profesionalGuardiaId ? parseInt(profesionalGuardiaId, 10) : null
      } else if (subtiposTurnoPractica.includes(subtipoAdmisionCodigo)) {
        body.profesionalGuardiaId = null
        body.profesionalTratanteId = profesionalIdTurno ? parseInt(profesionalIdTurno, 10) : null
        body.profesionalIdTurno = profesionalIdTurno ? parseInt(profesionalIdTurno, 10) : null
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
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      {guardando && (
        <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-700 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Registrando admisión, espere por favor...
        </div>
      )}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
          Paciente <span className="text-red-500">*</span>
        </h3>
        <BuscarPaciente onSeleccionar={handleSeleccionarPaciente} pacienteSeleccionado={paciente} />
        {paciente && (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1.5 text-xs text-gray-600">
            {paciente.fechaNacimiento && (
              <div>
                <span className="text-gray-400">Fecha nac.:</span> {new Date(paciente.fechaNacimiento).toLocaleDateString('es-AR')}
              </div>
            )}
            {paciente.sexo && (
              <div>
                <span className="text-gray-400">Sexo:</span> {paciente.sexo === 'M' ? 'Masculino' : paciente.sexo === 'F' ? 'Femenino' : paciente.sexo}
              </div>
            )}
            {paciente.domicilio && (
              <div className="col-span-2 md:col-span-1">
                <span className="text-gray-400">Domicilio:</span> {paciente.domicilio}
              </div>
            )}
            {paciente.telefonoFijo && (
              <div>
                <span className="text-gray-400">Tel.:</span> {paciente.telefonoFijo}
              </div>
            )}
            {paciente.celular1 && (
              <div>
                <span className="text-gray-400">Cel.:</span> {paciente.celular1}
              </div>
            )}
            {paciente.email && (
              <div className="col-span-2 md:col-span-1">
                <span className="text-gray-400">Email:</span> {paciente.email}
              </div>
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

      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
          Tipo de Admisión <span className="text-red-500">*</span>
        </h3>
        <div className="max-w-md">
          <select
            value={subtipoAdmisionCodigo}
            onChange={(e) => setSubtipoAdmisionCodigo(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100"
          >
            <option value="">-- Seleccionar tipo de admisión --</option>
            {subtipos.map((subtipo) => (
              <option key={subtipo.codigo} value={subtipo.codigo}>
                {subtipo.descripcion}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">Datos de Admisión</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de Ingreso</label>
            <input
              type="date"
              value={fechaIngreso}
              onChange={(e) => setFechaIngreso(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Egreso Previsto</label>
            <input
              type="date"
              value={fechaEgresoPrevista}
              onChange={(e) => setFechaEgresoPrevista(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {!mostrarPracticasAmbulatorias && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Profesional Guardia</label>
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
                <label className="block text-xs font-medium text-gray-600 mb-1">Profesional Tratante</label>
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
            </>
          )}
        </div>
      </div>

      {subtipoAdmisionCodigo === 'GUA' && (
        <div className="his-card p-5 border-l-4 border-blue-500">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">Ingreso por Guardia</h3>
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

      {mostrarPracticasAmbulatorias && (
        <div className="his-card p-5 border-l-4 border-green-500">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
            Ingreso por Turno/Práctica Ambulatoria
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Profesional que indica la práctica</label>
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
          </div>
        </div>
      )}

      {subtipoAdmisionCodigo === 'DER' && (
        <div className="his-card p-5 border-l-4 border-yellow-500">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">Información de Derivación</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Centro Derivante</label>
                <input
                  type="text"
                  value={centroDerivante}
                  onChange={(e) => setCentroDerivante(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nombre del centro o institución derivante"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Profesional Derivante</label>
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
              <label className="block text-xs font-medium text-gray-600 mb-1">Motivo de Derivación</label>
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
              <label className="block text-xs font-medium text-gray-600 mb-1">Diagnóstico de Derivación</label>
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

      {subtipoAdmisionCodigo === 'IND' && (
        <div className="his-card p-5 border-l-4 border-purple-500">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">Información de Indicación Médica</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Profesional Indicador</label>
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
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de Indicación</label>
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
              <label className="block text-xs font-medium text-gray-600 mb-1">Descripción de la Indicación Médica</label>
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

      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">Cobertura Médica</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Obra Social</label>
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Número de Afiliado</label>
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
              <label className="block text-xs font-medium text-gray-600 mb-1">Coseguro (solo IPSS)</label>
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

      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b">Diagnóstico / Motivo de Consulta</h3>
        <textarea
          value={descripcionPatologia}
          onChange={(e) => setDescripcionPatologia(e.target.value)}
          rows={3}
          maxLength={500}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder="Descripción del motivo de ingreso o diagnóstico presuntivo..."
        />
      </div>

      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b">Observaciones</h3>
        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          rows={2}
          maxLength={2000}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder="Observaciones adicionales del ingreso..."
        />
      </div>

      {mostrarPanelPracticasMeds && (
        <>
          <div className="his-card p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">Prácticas realizadas</h3>
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={terminoBusquedaPractica}
                  onChange={(e) => setTerminoBusquedaPractica(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void buscarPracticaNomenclador(terminoBusquedaPractica)
                    }
                  }}
                  placeholder={etiquetaBusquedaPractica}
                  className="w-full rounded-md border border-gray-300 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="button"
                onClick={() => void buscarPracticaNomenclador(terminoBusquedaPractica)}
                disabled={buscandoPractica || terminoBusquedaPractica.trim().length < 2}
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
              <div className="space-y-2">
                <div className="divide-y border rounded-md">
                  {practicas.map((p) => (
                    <div key={p.codigo} className="px-3 py-3 space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-gray-500 w-20 shrink-0">{p.codigo}</span>
                        <span className="flex-1 text-sm text-gray-800">{p.descripcion}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <label className="text-xs text-gray-500">Cant.</label>
                          <input
                            type="number"
                            min={1}
                            value={p.cantidad}
                            onChange={(e) =>
                              setPracticas((prev) =>
                                prev.map((x) =>
                                  x.codigo === p.codigo ? { ...x, cantidad: Math.max(1, parseInt(e.target.value) || 1) } : x
                                )
                              )
                            }
                            className="w-14 rounded border border-gray-300 px-2 py-1 text-xs text-center"
                          />
                        </div>
                        {p.requiereMatriculaEspecialista && (
                          <div className="flex items-center gap-1 shrink-0">
                            <label className="text-xs text-gray-500">Mat. HE</label>
                            <input
                              type="number"
                              min={1}
                              value={p.matriculaEspecialista ?? ''}
                              onChange={(e) => {
                                const value = e.target.value.trim()
                                setPracticas((prev) => prev.map((x) =>
                                  x.codigo === p.codigo
                                    ? { ...x, matriculaEspecialista: value ? parseInt(value, 10) || null : null }
                                    : x
                                ))
                              }}
                              className="w-24 rounded border border-gray-300 px-2 py-1 text-xs"
                              placeholder="Matrícula"
                            />
                          </div>
                        )}
                        {p.requiereMatriculaAnestesista && (
                          <div className="flex items-center gap-1 shrink-0">
                            <label className="text-xs text-gray-500">Mat. HA</label>
                            <input
                              type="number"
                              min={1}
                              value={p.matriculaAnestesista ?? ''}
                              onChange={(e) => {
                                const value = e.target.value.trim()
                                setPracticas((prev) => prev.map((x) =>
                                  x.codigo === p.codigo
                                    ? { ...x, matriculaAnestesista: value ? parseInt(value, 10) || null : null }
                                    : x
                                ))
                              }}
                              className="w-24 rounded border border-gray-300 px-2 py-1 text-xs"
                              placeholder="Matrícula"
                            />
                          </div>
                        )}
                        <button type="button" onClick={() => quitarPractica(p.codigo)} className="text-red-400 hover:text-red-600 transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <ComponenteSelector
                        valores={p.desglose}
                        seleccion={p.seleccionComponentes}
                        onChange={(nuevaSeleccion) => {
                          setPracticas((prev) => prev.map((x) =>
                            x.codigo === p.codigo
                              ? { ...x, seleccionComponentes: nuevaSeleccion }
                              : x
                          ))
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400">No se han agregado prácticas.</p>
            )}
          </div>

          {mostrarMedicacion && (
            <div className="his-card p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">Medicamentos administrados</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 p-3 rounded-md bg-gray-50 border">
                <div className="relative">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Medicamento <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={nuevaMedNombre}
                    onChange={(e) => buscarMedicamentoCatalogo(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ej: Ibuprofeno"
                  />
                  {resultadosMedicamentoCatalogo.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow-sm max-h-40 overflow-y-auto divide-y">
                      {resultadosMedicamentoCatalogo.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setNuevaMedNombre(m.nombre)
                            setResultadosMedicamentoCatalogo([])
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                        >
                          {m.nombre}
                        </button>
                      ))}
                    </div>
                  )}
                  {buscandoMedicamentoCatalogo && (
                    <p className="mt-1 text-xs text-gray-400">Buscando en catálogo UTI...</p>
                  )}
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
          )}

          {mostrarDescartables && (
            <div className="his-card p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">Descartables utilizados</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 p-3 rounded-md bg-gray-50 border">
                <div className="relative">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Descartable <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={nuevoDesNombre}
                    onChange={(e) => buscarDescartableCatalogo(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ej: Abocath 20"
                  />
                  {resultadosDescartableCatalogo.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow-sm max-h-40 overflow-y-auto divide-y">
                      {resultadosDescartableCatalogo.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setNuevoDesNombre(d.nombre)
                            setResultadosDescartableCatalogo([])
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                        >
                          {d.nombre}
                        </button>
                      ))}
                    </div>
                  )}
                  {buscandoDescartableCatalogo && (
                    <p className="mt-1 text-xs text-gray-400">Buscando en catálogo UTI...</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad</label>
                  <input
                    type="number"
                    min={1}
                    value={nuevoDesCantidad}
                    onChange={(e) => setNuevoDesCantidad(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Observaciones</label>
                  <input
                    type="text"
                    value={nuevoDesObs}
                    onChange={(e) => setNuevoDesObs(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Notas adicionales"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={agregarDescartable}
                    disabled={!nuevoDesNombre.trim()}
                    className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    <Plus className="h-4 w-4" /> Agregar
                  </button>
                </div>
              </div>
              {descartables.length > 0 ? (
                <div className="divide-y border rounded-md">
                  {descartables.map((d, idx) => (
                    <div key={idx} className="flex items-center gap-3 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">{d.nombre} <span className="text-xs text-gray-500">x{d.cantidad}</span></p>
                        {d.observaciones && <p className="text-xs text-gray-500">{d.observaciones}</p>}
                      </div>
                      <button type="button" onClick={() => quitarDescartable(idx)} className="text-red-400 hover:text-red-600 transition-colors shrink-0">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">No se han agregado descartables.</p>
              )}
            </div>
          )}
        </>
      )}

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
