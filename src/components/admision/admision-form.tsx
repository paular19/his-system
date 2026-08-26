'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { BuscarPaciente } from './buscar-paciente'
import {
  calcularTotalSeleccionado,
} from '@/components/ui/componente-selector'
import { ProfesionalSelect } from '@/components/ui/profesional-select'
import type { PacienteResumen } from '@/modules/admision/types'
import { formatearFechaCalendario } from '@/lib/utils'
import {
  esSubitemAnestesista,
  esSubitemEspecialista,
  obtenerSubitemsAgrupados,
  valorUnitarioPorSubitem,
} from '@/lib/practicas-subitems'
import { requiereCoseguroParaObraSocial } from '@/lib/utils/coseguros'
import {
  PracticasAdmisionCard,
  type PracticaAdmisionItem,
} from './practicas-admision-card'
import { generarOrdenesPendientesAdmision } from './ordenes-auto'
import {
  abrirVentanaImpresionPendiente,
  cerrarVentanaImpresion,
  navegarVentanaImpresion,
} from '@/lib/utils/print-window'

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

const MATRICULA_AMBULATORIO_DEFAULT = 9110

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
  coseguros,
  subtipos,
  pacienteInicial,
}: AdmisionFormProps) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const submitEnCursoRef = useRef(false)
  const [guardando, setGuardando] = useState(false)
  const [redirigiendoFicha, setRedirigiendoFicha] = useState(false)
  const [generandoOrdenesAuto, setGenerandoOrdenesAuto] = useState(false)
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
  const [profesionalTratanteId, setProfesionalTratanteId] = useState(
    pacienteInicial?.profesionalCabeceraId?.toString() ?? ''
  )
  const [obraSocialId, setObraSocialId] = useState(
    pacienteInicial?.obraSocialId?.toString() ?? ''
  )
  const [pacienteParticular, setPacienteParticular] = useState(
    !pacienteInicial?.obraSocialId
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
  const [profesionalIdTurno, setProfesionalIdTurno] = useState(
    pacienteInicial?.profesionalCabeceraId?.toString() ?? ''
  )
  const [centroDerivante, setCentroDerivante] = useState('')
  const [profesionalDerivanteNombre, setProfesionalDerivanteNombre] = useState('')
  const [motivoDerivacion, setMotivoDerivacion] = useState('')
  const [diagnosticoDerivacion, setDiagnosticoDerivacion] = useState('')
  const [profesionalIndicadorNombre, setProfesionalIndicadorNombre] = useState('')
  const [tipoIndicacion, setTipoIndicacion] = useState('')
  const [descripcionIndicacion, setDescripcionIndicacion] = useState('')

  // Prácticas y medicamentos (para GUA/DER/IND)
  const [practicas, setPracticas] = useState<PracticaAdmisionItem[]>([])
  const [generarOrdenesSeparadasPorPractica, setGenerarOrdenesSeparadasPorPractica] = useState(false)
  const [medicaciones, setMedicaciones] = useState<ItemMedicacion[]>([])
  const [descartables, setDescartables] = useState<ItemDescartable[]>([])
  const [busquedaPracticaPendiente, setBusquedaPracticaPendiente] = useState({
    termino: '',
    hayResultados: false,
  })

  // Búsqueda de prácticas
  // Nueva medicacion
  const [nuevaMedNombre, setNuevaMedNombre] = useState('')
  const [nuevoDesNombre, setNuevoDesNombre] = useState('')
  const [opcionesInsumosUti, setOpcionesInsumosUti] = useState<Array<{ id: number; nombre: string }>>([])
  const [cargandoInsumosUti, setCargandoInsumosUti] = useState(false)
  const insumosUtiCargadosRef = useRef(false)

  const subtiposConPracticasMeds = ['GUA', 'DER', 'TUR', 'RAY', 'CUR', 'SUT', 'ECG', 'ECO', 'QAM', 'IND', 'PAM']
  const subtiposTurnoPractica = ['TUR', 'RAY', 'CUR', 'SUT', 'ECG', 'ECO', 'QAM', 'PAM']
  const esIngresoGuardia = subtipoAdmisionCodigo === 'GUA'
  const esAtencionAmbulatoria = subtiposTurnoPractica.includes(subtipoAdmisionCodigo)
  const mostrarPanelPracticasMeds = subtiposConPracticasMeds.includes(subtipoAdmisionCodigo)
  const mostrarPracticasAmbulatorias = esAtencionAmbulatoria
  const mostrarMedicacion = mostrarPanelPracticasMeds && !esAtencionAmbulatoria && !esIngresoGuardia
  const mostrarDescartables = mostrarMedicacion
  const ocultarEgresoPrevisto = mostrarPracticasAmbulatorias || mostrarMedicacion || esIngresoGuardia
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

  useEffect(() => {
    if (!(mostrarMedicacion || mostrarDescartables) || insumosUtiCargadosRef.current) {
      return
    }

    let activo = true

    const cargarInsumos = async () => {
      setCargandoInsumosUti(true)
      try {
        const res = await fetch('/api/catalogos/insumos-uti?limit=5000')
        const json = await res.json()
        if (!activo) return
        setOpcionesInsumosUti(Array.isArray(json.data) ? json.data : [])
        insumosUtiCargadosRef.current = true
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
  }, [mostrarMedicacion, mostrarDescartables])

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
    if (ocultarEgresoPrevisto) {
      setFechaEgresoPrevista('')
    }
  }, [ocultarEgresoPrevisto])

  useEffect(() => {
    if (practicas.length < 2 && generarOrdenesSeparadasPorPractica) {
      setGenerarOrdenesSeparadasPorPractica(false)
    }
  }, [practicas.length, generarOrdenesSeparadasPorPractica])

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

  const obraSocialSeleccionada = pacienteParticular
    ? null
    : obraSociales.find((os) => String(os.id) === obraSocialId)
  const esCoberturaConCoseguro =
    !pacienteParticular && requiereCoseguroParaObraSocial(obraSocialSeleccionada)
  const cosegurosDisponibles = coseguros

  // Sincronizar cobertura cuando cambia el paciente
  const handleSeleccionarPaciente = (p: PacienteResumen | null) => {
    setPaciente(p)
    if (p) {
      const esParticular = !p.obraSocialId
      setPacienteParticular(esParticular)
      setObraSocialId(!esParticular && p.obraSocialId ? p.obraSocialId.toString() : '')
      setPlanId('')
      const requiereCoseguroPaciente = !esParticular && p.obraSocialId
        ? requiereCoseguroParaObraSocial(obraSociales.find((os) => os.id === p.obraSocialId))
        : false
      setObraSocialCoseguroId(
        !esParticular && requiereCoseguroPaciente && p.obraSocialCoseguroId
          ? p.obraSocialCoseguroId.toString()
          : ''
      )
      setNumeroAfiliado(!esParticular ? (p.numeroAfiliado ?? '') : '')
      setProfesionalTratanteId(p.profesionalCabeceraId?.toString() ?? '')
      setProfesionalIdTurno(p.profesionalCabeceraId?.toString() ?? '')
    } else {
      setPacienteParticular(true)
      setObraSocialId('')
      setPlanId('')
      setObraSocialCoseguroId('')
      setNumeroAfiliado('')
      setProfesionalTratanteId('')
      setProfesionalIdTurno('')
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (submitEnCursoRef.current || guardando) {
      return
    }

    setRedirigiendoFicha(false)

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

    if (busquedaPracticaPendiente.termino.trim().length >= 2 && busquedaPracticaPendiente.hayResultados) {
      setError('Seleccione una práctica del listado o limpie la búsqueda antes de registrar la admisión')
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
      const cantidadPractica = Math.max(1, Math.floor(p.cantidad ?? 1))
      const subitems = obtenerSubitemsAgrupados(
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
          numeroAutorizacion: p.numeroAutorizacion?.trim() || null,
          cantidad: cantidadPractica,
          grupoOrden: null,
          importeTotal: Number((
            calcularTotalSeleccionado(p.desglose, p.seleccionComponentes) * cantidadPractica
          ).toFixed(2)),
          matriculaEspecialista: p.seleccionComponentes.especialista > 0 ? p.matriculaEspecialista : null,
          matriculaAnestesista: p.seleccionComponentes.anestesista > 0 ? p.matriculaAnestesista : null,
        }]
      }

      return subitems.map(({ subitem, cantidad: cantidadSubitem }) => {
        const cantidad = cantidadSubitem * cantidadPractica
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
          numeroAutorizacion: p.numeroAutorizacion?.trim() || null,
          cantidad,
          grupoOrden: null,
          importeTotal: Number(((valorUnitario ?? 0) * cantidad).toFixed(2)),
          matriculaEspecialista: esSubitemEspecialista(subitem) ? p.matriculaEspecialista : null,
          matriculaAnestesista: esSubitemAnestesista(subitem) ? p.matriculaAnestesista : null,
        }
      })
    })

    setPracticas(practicasNormalizadas)

    submitEnCursoRef.current = true
    setGuardando(true)
    setError(null)

    let mantenerBloqueoHastaNavegacion = false
    const requiereOrdenAutomatica = practicasExpandida.length > 0
    setGenerandoOrdenesAuto(requiereOrdenAutomatica)
    const ventanaImpresion = requiereOrdenAutomatica ? abrirVentanaImpresionPendiente() : null
    const nombreVentanaImpresion = requiereOrdenAutomatica
      ? `his-auto-print-${Date.now()}`
      : null
    if (ventanaImpresion && nombreVentanaImpresion) {
      try {
        ventanaImpresion.name = nombreVentanaImpresion
      } catch {
        // Ignore popup naming restrictions.
      }
    }

    try {
      const body: any = {
        pacienteId: paciente.id,
        tipoIngresoCodigo,
        subtipoAdmisionCodigo,
        fechaIngreso,
        fechaEgresoPrevista: ocultarEgresoPrevisto ? null : (fechaEgresoPrevista || null),
        profesionalGuardiaId: profesionalGuardiaId ? parseInt(profesionalGuardiaId, 10) : null,
        profesionalTratanteId: profesionalTratanteId ? parseInt(profesionalTratanteId, 10) : null,
        obraSocialId: pacienteParticular ? null : (obraSocialId ? parseInt(obraSocialId, 10) : null),
        planId: null,
        obraSocialCoseguroId:
          !pacienteParticular && esCoberturaConCoseguro && obraSocialCoseguroId
            ? parseInt(obraSocialCoseguroId, 10)
            : null,
        numeroAfiliado: pacienteParticular ? null : (numeroAfiliado || null),
        nombreTutor: paciente?.nombreTutor?.trim() || null,
        telefonoTutor: paciente?.telefonoTutor?.trim() || null,
        descripcionPatologia: descripcionPatologia || null,
        observaciones: observaciones || null,
        generarOrdenesSeparadasPorPractica,
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
        body.profesionalTratanteId = profesionalTratanteId ? parseInt(profesionalTratanteId, 10) : null
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

      const response = await fetch('/api/admision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body, (_key, value) =>
          typeof value === 'bigint' ? value.toString() : value
        ),
      })

      const ingresoIdHeader = response.headers.get('x-ingreso-id')

      if (!response.ok) {
        const jsonError = await response.json().catch(() => null)
        setError(jsonError?.error ?? 'No se pudo crear la admisión')
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }

      let ingresoId = Number.parseInt(ingresoIdHeader ?? '', 10)
      if (!Number.isFinite(ingresoId) || ingresoId <= 0) {
        const json = await response.json().catch(() => null)
        ingresoId = Number.parseInt(String(json?.data?.id ?? ''), 10)
      }

      if (!Number.isFinite(ingresoId) || ingresoId <= 0) {
        setError('No se recibió el ID de admisión creada')
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }

      const prefetchParams = new URLSearchParams()
      if (paciente?.nombreCompleto) {
        prefetchParams.set('prefetchNombre', paciente.nombreCompleto)
      }
      if (paciente?.numeroDocumento != null) {
        prefetchParams.set('prefetchDocumento', String(paciente.numeroDocumento))
      }
      const obraSocialPrefetch = pacienteParticular
        ? 'Particular'
        : obraSocialSeleccionada?.nombre
      if (obraSocialPrefetch) {
        prefetchParams.set('prefetchObraSocial', obraSocialPrefetch)
      }
      if (requiereOrdenAutomatica) {
        prefetchParams.set('autoGen', '1')
        prefetchParams.set('autoPrint', '1')
        if (generarOrdenesSeparadasPorPractica) {
          prefetchParams.set('autoSep', '1')
        }
        if (nombreVentanaImpresion) {
          prefetchParams.set('printWin', nombreVentanaImpresion)
        }
      }

      const fichaPathBase = `/dashboard/admision/${ingresoId}`
      const fichaPath = prefetchParams.toString().length > 0
        ? `${fichaPathBase}?${prefetchParams.toString()}`
        : fichaPathBase

      void router.prefetch(fichaPath)

      setRedirigiendoFicha(true)
      mantenerBloqueoHastaNavegacion = true
      router.push(fichaPath)
      return
    } catch (err) {
      setRedirigiendoFicha(false)
      setError(err instanceof Error ? err.message : 'Error inesperado')
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } finally {
      if (!mantenerBloqueoHastaNavegacion) {
        cerrarVentanaImpresion(ventanaImpresion)
      }
      if (!mantenerBloqueoHastaNavegacion) {
        submitEnCursoRef.current = false
        setGuardando(false)
        setGenerandoOrdenesAuto(false)
      }
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="relative space-y-6" aria-busy={guardando}>
      {guardando && (
        <div className="absolute inset-0 z-20 bg-white/70 backdrop-blur-[1px] flex items-center justify-center px-4">
          <div className="rounded-lg border border-blue-200 bg-white shadow-sm px-4 py-3 text-sm text-blue-700 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {redirigiendoFicha
              ? 'Admisión registrada. Cargando ficha...'
              : generandoOrdenesAuto
                ? 'Generando admisión y órdenes para su impresión...'
                : 'Generando admisión... por favor espere.'}
          </div>
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
            {paciente.nombreTutor && (
              <div>
                <span className="text-gray-400">Familiar responsable:</span> {paciente.nombreTutor}
              </div>
            )}
            {paciente.telefonoTutor && (
              <div>
                <span className="text-gray-400">Tel. familiar:</span> {paciente.telefonoTutor}
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
          {subtipos.length === 0 && (
            <p className="mt-2 text-xs text-red-600">
              No se pudieron cargar los tipos de admisión. Recargá la página; si sigue igual,
              avisá a sistemas con la hora exacta.
            </p>
          )}
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
          {!ocultarEgresoPrevisto && (
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
          {!mostrarPracticasAmbulatorias && !esIngresoGuardia && (
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
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Médico de cabecera <span className="font-normal text-gray-400">(opcional)</span>
              </label>
              <ProfesionalSelect
                profesionales={profesionales}
                value={profesionalTratanteId}
                onChange={setProfesionalTratanteId}
                placeholderOption="-- Sin médico de cabecera --"
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
        <div className="mb-3">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={pacienteParticular}
              onChange={(e) => {
                const checked = e.target.checked
                setPacienteParticular(checked)
                if (checked) {
                  setObraSocialId('')
                  setPlanId('')
                  setObraSocialCoseguroId('')
                  setNumeroAfiliado('')
                }
              }}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Paciente particular
          </label>
          {pacienteParticular && (
            <p className="mt-1 text-xs text-gray-500">
              No se exigirá obra social para cargar prácticas ni para registrar la admisión.
            </p>
          )}
        </div>
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
              disabled={pacienteParticular}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100"
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
              disabled={pacienteParticular}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              placeholder={pacienteParticular ? 'No aplica para particular' : '123456789'}
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
          <PracticasAdmisionCard
            obraSocialId={pacienteParticular ? null : obraSocialId}
            etiquetaBusqueda={etiquetaBusquedaPractica}
            practicas={practicas}
            setPracticas={setPracticas}
            obtenerMatriculaDefault={obtenerMatriculaAmbulatoria}
            disabled={guardando}
            onPendingSearchChange={setBusquedaPracticaPendiente}
          />

          {practicas.length > 1 && (
            <div className="his-card p-4 border border-blue-100 bg-blue-50/60">
              <label className="inline-flex items-center gap-2 text-sm text-blue-900">
                <input
                  type="checkbox"
                  checked={generarOrdenesSeparadasPorPractica}
                  onChange={(e) => setGenerarOrdenesSeparadasPorPractica(e.target.checked)}
                  className="h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                />
                Generar una orden separada por cada práctica agregada
              </label>
            </div>
          )}

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
