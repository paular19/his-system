'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
import { ProfesionalSelect } from '@/components/ui/profesional-select'
import type { PacienteResumen } from '@/modules/admision/types'
import { formatearFechaCalendario } from '@/lib/utils'
import {
  esSubitemAnestesista,
  esSubitemEspecialista,
  obtenerSubitemsSeleccionados,
  valorUnitarioPorSubitem,
} from '@/lib/practicas-subitems'

interface ItemPractica {
  tempId: string
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
}

interface ItemDescartable {
  nombre: string
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

function normalizarBusqueda(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

const MATRICULA_AMBULATORIO_DEFAULT = 9110
const PRACTICAS_POR_PAGINA = 6

function crearTempId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function ahoraLocalDateTimeInput(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d}T${hh}:${mm}`
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
  const formRef = useRef<HTMLFormElement>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paciente, setPaciente] = useState<PacienteResumen | null>(pacienteInicial ?? null)

  // Tipo de ingreso por defecto para admisión general
  const tipoIngresoCodigo = 'AMB'
  const tipoIngresoDescripcion = 'Ambulatorio'

  // Estado general
  const [fechaIngreso, setFechaIngreso] = useState(ahoraLocalDateTimeInput())
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
  const [terminoFiltroPracticas, setTerminoFiltroPracticas] = useState('')
  const [paginaPracticas, setPaginaPracticas] = useState(1)
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
  const [nuevoDesNombre, setNuevoDesNombre] = useState('')
  const [opcionesInsumosUti, setOpcionesInsumosUti] = useState<Array<{ id: number; nombre: string }>>([])
  const [cargandoInsumosUti, setCargandoInsumosUti] = useState(false)

  const subtiposConPracticasMeds = ['GUA', 'DER', 'TUR', 'RAY', 'CUR', 'SUT', 'ECG', 'ECO', 'IND', 'PAM']
  const subtiposTurnoPractica = ['TUR', 'RAY', 'CUR', 'SUT', 'ECG', 'ECO', 'PAM']
  const mostrarPanelPracticasMeds = subtiposConPracticasMeds.includes(subtipoAdmisionCodigo)
  const mostrarPracticasAmbulatorias = subtiposTurnoPractica.includes(subtipoAdmisionCodigo)
  const mostrarMedicacion = mostrarPanelPracticasMeds && !['RAY', 'ECG', 'ECO'].includes(subtipoAdmisionCodigo)
  const mostrarDescartables = mostrarMedicacion
  const etiquetaBusquedaPractica = subtipoAdmisionCodigo === 'CUR' || subtipoAdmisionCodigo === 'SUT'
    ? 'Buscar código de práctica...'
    : 'Buscar práctica en nomenclador...'

  const practicasFiltradas = useMemo(() => {
    const termino = normalizarBusqueda(terminoFiltroPracticas)
    if (!termino) return practicas

    return practicas.filter((p) => {
      const codigo = normalizarBusqueda(p.codigo)
      const descripcion = normalizarBusqueda(p.descripcion)
      return codigo.includes(termino) || descripcion.includes(termino)
    })
  }, [practicas, terminoFiltroPracticas])

  const totalPaginasPracticas = Math.max(1, Math.ceil(practicasFiltradas.length / PRACTICAS_POR_PAGINA))
  const paginaPracticasActual = Math.min(paginaPracticas, totalPaginasPracticas)

  const practicasPaginadas = useMemo(() => {
    const desde = (paginaPracticasActual - 1) * PRACTICAS_POR_PAGINA
    return practicasFiltradas.slice(desde, desde + PRACTICAS_POR_PAGINA)
  }, [paginaPracticasActual, practicasFiltradas])

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

  useEffect(() => {
    setPaginaPracticas(1)
  }, [terminoFiltroPracticas])

  useEffect(() => {
    let activo = true

    const cargarInsumos = async () => {
      setCargandoInsumosUti(true)
      try {
        const res = await fetch('/api/catalogos/insumos-uti?limit=5000')
        const json = await res.json()
        if (!activo) return
        setOpcionesInsumosUti(Array.isArray(json.data) ? json.data : [])
      } catch {
        if (activo) setOpcionesInsumosUti([])
      } finally {
        if (activo) setCargandoInsumosUti(false)
      }
    }

    void cargarInsumos()
    return () => {
      activo = false
    }
  }, [])

  const agregarPractica = (practica: {
    convenioId: number
    codigo: string
    descripcion: string
    valorEspecialista?: number | null
    valorAyudante?: number | null
    valorAnestesista?: number | null
    valorGastos?: number | null
  }) => {
    const matriculaAmbulatoria = obtenerMatriculaAmbulatoria()

    setPracticas((prev) => [
      ...prev,
      {
        tempId: crearTempId(),
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

  const quitarPractica = (tempId: string) => {
    setPracticas((prev) => prev.filter((p) => p.tempId !== tempId))
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

  useEffect(() => {
    if (mostrarPracticasAmbulatorias) {
      setFechaEgresoPrevista('')
    }
  }, [mostrarPracticasAmbulatorias])

  const agregarMedicacion = () => {
    if (!nuevaMedNombre.trim()) return
    setMedicaciones((prev) => [
      ...prev,
      { nombre: nuevaMedNombre },
    ])
    setNuevaMedNombre('')
  }

  const quitarMedicacion = (idx: number) => {
    setMedicaciones((prev) => prev.filter((_, i) => i !== idx))
  }

  const agregarDescartable = () => {
    if (!nuevoDesNombre.trim()) return
    setDescartables((prev) => [
      ...prev,
      { nombre: nuevoDesNombre },
    ])
    setNuevoDesNombre('')
  }

  const quitarDescartable = (idx: number) => {
    setDescartables((prev) => prev.filter((_, i) => i !== idx))
  }

  const planesDisponibles = obraSocialId
    ? planes.filter((plan) => String(plan.obraSocialId ?? '') === obraSocialId)
    : planes
  const obraSocialSeleccionada = obraSociales.find((os) => String(os.id) === obraSocialId)
  const nombreObraSocial = obraSocialSeleccionada?.nombre ?? ''
  const esIPSS = esNombreIPSS(nombreObraSocial)
  const esCoberturaConCoseguro = esIPSS
  const cosegurosDisponibles = esIPSS ? coseguros : []

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

    const practicasExpandida = practicasNormalizadas.flatMap((p) => {
      const cantidadNormalizada = Number.isFinite(p.cantidad) && p.cantidad > 0 ? Math.floor(p.cantidad) : 1
      const subitems = obtenerSubitemsSeleccionados(
        {
          valorEspecialista: p.desglose.valorEspecialista,
          valorAyudante: p.desglose.valorAyudante,
          valorAnestesista: p.desglose.valorAnestesista,
          valorGastos: p.desglose.valorGastos,
        },
        p.seleccionComponentes
      )

      if (subitems.length === 0) {
        return [{
          convenioId: p.convenioId,
          codigo: p.codigo,
          descripcion: p.descripcion,
          cantidad: cantidadNormalizada,
          grupoOrden: null,
          importeTotal: Number((
            calcularTotalSeleccionado(p.desglose, p.seleccionComponentes)
            * cantidadNormalizada
          ).toFixed(2)),
          matriculaEspecialista: p.seleccionComponentes.especialista > 0 ? p.matriculaEspecialista : null,
          matriculaAnestesista: p.seleccionComponentes.anestesista > 0 ? p.matriculaAnestesista : null,
        }]
      }

      return subitems.map((subitem) => {
        const valorUnitario = valorUnitarioPorSubitem(subitem, {
          valorEspecialista: p.desglose.valorEspecialista,
          valorAyudante: p.desglose.valorAyudante,
          valorAnestesista: p.desglose.valorAnestesista,
          valorGastos: p.desglose.valorGastos,
        })

        return {
          convenioId: p.convenioId,
          codigo: p.codigo,
          descripcion: p.descripcion,
          cantidad: cantidadNormalizada,
          grupoOrden: null,
          importeTotal: Number(((valorUnitario ?? 0) * cantidadNormalizada).toFixed(2)),
          matriculaEspecialista: esSubitemEspecialista(subitem) ? p.matriculaEspecialista : null,
          matriculaAnestesista: esSubitemAnestesista(subitem) ? p.matriculaAnestesista : null,
        }
      })
    })

    setPracticas(practicasNormalizadas)

    setGuardando(true)
    setError(null)

    try {
      const body: any = {
        pacienteId: paciente.id,
        tipoIngresoCodigo,
        subtipoAdmisionCodigo,
        fechaIngreso,
        fechaEgresoPrevista: mostrarPracticasAmbulatorias ? null : (fechaEgresoPrevista || null),
        profesionalGuardiaId: profesionalGuardiaId ? parseInt(profesionalGuardiaId, 10) : null,
        profesionalTratanteId: profesionalTratanteId ? parseInt(profesionalTratanteId, 10) : null,
        obraSocialId: obraSocialId ? parseInt(obraSocialId, 10) : null,
        planId: planId ? parseInt(planId, 10) : null,
        obraSocialCoseguroId:
          esCoberturaConCoseguro && obraSocialCoseguroId
            ? parseInt(obraSocialCoseguroId, 10)
            : null,
        numeroAfiliado: numeroAfiliado || null,
        descripcionPatologia: descripcionPatologia || null,
        observaciones: observaciones || null,
        practicas: practicasExpandida.length > 0 ? practicasExpandida : undefined,
        medicaciones: mostrarMedicacion && medicaciones.length > 0
          ? medicaciones.map((m) => ({
            nombre: m.nombre,
            dosis: null,
            viaAdministracion: null,
            frecuencia: null,
            observaciones: null,
          }))
          : undefined,
        descartables: mostrarDescartables && descartables.length > 0
          ? descartables.map((d) => ({ nombre: d.nombre, cantidad: 1, observaciones: null }))
          : undefined,
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
      if ('error' in result) {
        setError(result.error)
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }

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
                <span className="text-gray-400">Fecha nac.:</span> {formatearFechaCalendario(paciente.fechaNacimiento)}
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
          Tipo de Ingreso
        </h3>
        <div className="max-w-md space-y-1">
          <input
            value={`${tipoIngresoCodigo} - ${tipoIngresoDescripcion}`}
            readOnly
            className="w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700"
          />
          <p className="text-xs text-gray-500">
            En esta pantalla el ingreso es ambulatorio. Para internación usar el módulo Internación.
          </p>
        </div>
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha y Hora de Ingreso</label>
            <input
              type="datetime-local"
              value={fechaIngreso}
              onChange={(e) => setFechaIngreso(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {!mostrarPracticasAmbulatorias && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Egreso Previsto</label>
              <input
                type="date"
                value={fechaEgresoPrevista}
                onChange={(e) => setFechaEgresoPrevista(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
          {!mostrarPracticasAmbulatorias && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Profesional Guardia</label>
                <ProfesionalSelect
                  profesionales={profesionales}
                  value={profesionalGuardiaId}
                  onChange={setProfesionalGuardiaId}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Profesional Tratante</label>
                <ProfesionalSelect
                  profesionales={profesionales}
                  value={profesionalTratanteId}
                  onChange={setProfesionalTratanteId}
                />
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
              <ProfesionalSelect
                profesionales={profesionales}
                value={profesionalGuardiaId}
                onChange={setProfesionalGuardiaId}
              />
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
              <ProfesionalSelect
                profesionales={profesionales}
                value={profesionalIdTurno}
                onChange={setProfesionalIdTurno}
              />
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
          {esCoberturaConCoseguro && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Coseguro</label>
              <select
                value={obraSocialCoseguroId}
                onChange={(e) => setObraSocialCoseguroId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">-- Sin coseguro --</option>
                {cosegurosDisponibles.map((coseguro) => (
                  <option key={coseguro.id} value={String(coseguro.id)}>
                    {coseguro.nombre}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-amber-700">
                Si corresponde, seleccione el coseguro para la cobertura elegida.
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
                <div className="flex items-center justify-between gap-2">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <input
                      type="text"
                      value={terminoFiltroPracticas}
                      onChange={(e) => setTerminoFiltroPracticas(e.target.value)}
                      placeholder="Filtrar prácticas agregadas..."
                      className="w-full rounded-md border border-gray-300 pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    {practicasFiltradas.length} de {practicas.length}
                  </p>
                </div>
                <div className="divide-y border rounded-md">
                  {practicasPaginadas.map((p) => (
                    <div key={p.tempId} className="px-3 py-3 space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-gray-500 w-20 shrink-0">{p.codigo}</span>
                        <span className="flex-1 text-sm text-gray-800">{p.descripcion}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <label className="text-xs text-gray-500">Cant.</label>
                          <input
                            type="number"
                            min={1}
                            value={p.cantidad}
                            onChange={(e) => {
                              const raw = Number.parseInt(e.target.value, 10)
                              const cantidad = Number.isFinite(raw) && raw > 0 ? raw : 1
                              setPracticas((prev) => prev.map((x) =>
                                x.tempId === p.tempId
                                  ? { ...x, cantidad }
                                  : x
                              ))
                            }}
                            className="w-16 rounded border border-gray-300 px-2 py-1 text-xs"
                            placeholder="Cant."
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
                                  x.tempId === p.tempId
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
                                  x.tempId === p.tempId
                                    ? { ...x, matriculaAnestesista: value ? parseInt(value, 10) || null : null }
                                    : x
                                ))
                              }}
                              className="w-24 rounded border border-gray-300 px-2 py-1 text-xs"
                              placeholder="Matrícula"
                            />
                          </div>
                        )}
                        <button type="button" onClick={() => quitarPractica(p.tempId)} className="text-red-400 hover:text-red-600 transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <ComponenteSelector
                        valores={p.desglose}
                        seleccion={p.seleccionComponentes}
                        onChange={(nuevaSeleccion) => {
                          setPracticas((prev) => prev.map((x) =>
                            x.tempId === p.tempId
                              ? { ...x, seleccionComponentes: nuevaSeleccion }
                              : x
                          ))
                        }}
                      />
                    </div>
                  ))}
                </div>
                {practicasFiltradas.length > PRACTICAS_POR_PAGINA && (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-500">
                      Página {paginaPracticasActual} de {totalPaginasPracticas}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setPaginaPracticas((prev) => Math.max(1, prev - 1))}
                        disabled={paginaPracticasActual <= 1}
                        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaginaPracticas((prev) => Math.min(totalPaginasPracticas, prev + 1))}
                        disabled={paginaPracticasActual >= totalPaginasPracticas}
                        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No se han agregado prácticas.</p>
            )}
          </div>

          {mostrarMedicacion && (
            <div className="his-card p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">Medicamentos administrados</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 p-3 rounded-md bg-gray-50 border">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Insumo (opcional)</label>
                  <select
                    value={nuevaMedNombre}
                    onChange={(e) => setNuevaMedNombre(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">-- Seleccionar de lista unificada --</option>
                    {opcionesInsumosUti.map((item) => (
                      <option key={item.id} value={item.nombre}>{item.nombre}</option>
                    ))}
                  </select>
                  {cargandoInsumosUti && <p className="mt-1 text-xs text-gray-400">Cargando listado...</p>}
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
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Insumo (opcional)</label>
                  <select
                    value={nuevoDesNombre}
                    onChange={(e) => setNuevoDesNombre(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">-- Seleccionar de lista unificada --</option>
                    {opcionesInsumosUti.map((item) => (
                      <option key={item.id} value={item.nombre}>{item.nombre}</option>
                    ))}
                  </select>
                  {cargandoInsumosUti && <p className="mt-1 text-xs text-gray-400">Cargando listado...</p>}
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
                        <p className="text-sm font-medium text-gray-800">{d.nombre}</p>
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
