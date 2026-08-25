'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BedDouble, Loader2, Plus, Trash2, Wallet } from 'lucide-react'
import { BuscarPaciente } from '@/components/admision/buscar-paciente'
import { ProfesionalSelect } from '@/components/ui/profesional-select'
import { calcularTotalSeleccionado } from '@/components/ui/componente-selector'
import type { PacienteResumen } from '@/modules/admision/types'
import type { CamaConOcupante } from '@/modules/internacion/types'
import { SECTOR_LABEL } from '@/modules/internacion/types'
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
} from '@/components/admision/practicas-admision-card'
import { generarOrdenesPendientesAdmision } from '@/components/admision/ordenes-auto'
import {
  REQUISITOS_DOCUMENTALES,
  serializarObservacionesInternacion,
  type ChecklistDocumental,
} from '@/modules/internacion/observaciones-meta'
import {
  abrirVentanaImpresionPendiente,
  cerrarVentanaImpresion,
  navegarVentanaImpresion,
} from '@/lib/utils/print-window'

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

interface InternacionFormProps {
  profesionales: ProfesionalOption[]
  obraSociales: ObraSocialOption[]
  planes: PlanOption[]
  coseguros: CoseguroOption[]
  camasDisponibles: CamaConOcupante[]
  pacienteInicial?: PacienteResumen | null
  camaInicial?: number | null
}

interface DepositoRegistroEditable {
  id: string
  fecha: string
  importe: string
  cubreCoseguro: boolean
  observaciones: string
}

const MATRICULA_AMBULATORIO_DEFAULT = 9110

function crearChecklistInicial(): ChecklistDocumental {
  return {
    DOCUMENTO: false,
    CARNET: false,
    RECIBO_DE_SUELDO: false,
    ORDEN_DE_CONSULTA: false,
    KIT_DE_CIRUGIA: false,
    CONSENTIMIENTO_QUIRURGICO: false,
    OBSERVACIONES: false,
    DEPOSITO_DE_INGRESO: false,
    AVISO_DE_INTERNACION: false,
  }
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

function crearIdTemporalDeposito(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `dep-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

export function InternacionForm({
  profesionales,
  obraSociales,
  coseguros,
  camasDisponibles,
  pacienteInicial,
  camaInicial,
}: InternacionFormProps) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const submitEnCursoRef = useRef(false)
  const [guardando, setGuardando] = useState(false)
  const [mensajeGuardado, setMensajeGuardado] = useState('Creando internacion...')
  const [error, setError] = useState<string | null>(null)
  const [paciente, setPaciente] = useState<PacienteResumen | null>(pacienteInicial ?? null)

  const [fechaIngreso, setFechaIngreso] = useState(ahoraLocalDateTimeInput())
  const [camaId, setCamaId] = useState(camaInicial?.toString() ?? '')
  const [profesionalGuardiaId, setProfesionalGuardiaId] = useState('')
  const [profesionalDerivanteId, setProfesionalDerivanteId] = useState('')
  const [profesionalTratanteId, setProfesionalTratanteId] = useState(
    pacienteInicial?.profesionalCabeceraId?.toString() ?? ''
  )
  const [clinicaDerivante, setClinicaDerivante] = useState('')
  const [esCirugiaProgramada, setEsCirugiaProgramada] = useState(false)
  const [bloquearHabitacionCompleta, setBloquearHabitacionCompleta] = useState(false)
  const [fechaCirugiaProgramada, setFechaCirugiaProgramada] = useState('')
  const [obraSocialId, setObraSocialId] = useState(pacienteInicial?.obraSocialId?.toString() ?? '')
  const [pacienteParticular, setPacienteParticular] = useState(!pacienteInicial?.obraSocialId)
  const [obraSocialCoseguroId, setObraSocialCoseguroId] = useState(
    pacienteInicial?.obraSocialCoseguroId?.toString() ?? ''
  )
  const [numeroAfiliado, setNumeroAfiliado] = useState(pacienteInicial?.numeroAfiliado ?? '')
  const [nombreTutor, setNombreTutor] = useState(pacienteInicial?.nombreTutor ?? '')
  const [telefonoTutor, setTelefonoTutor] = useState(pacienteInicial?.telefonoTutor ?? '')
  const [descripcionPatologia, setDescripcionPatologia] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [checklistDocumental, setChecklistDocumental] = useState<ChecklistDocumental>(
    crearChecklistInicial()
  )
  const [depositosRegistros, setDepositosRegistros] = useState<DepositoRegistroEditable[]>([])
  const [practicas, setPracticas] = useState<PracticaAdmisionItem[]>([])
  const [generarOrdenesSeparadasPorPractica, setGenerarOrdenesSeparadasPorPractica] = useState(false)
  const [busquedaPracticaPendiente, setBusquedaPracticaPendiente] = useState({
    termino: '',
    hayResultados: false,
  })
  const camaSeleccionada = useMemo(
    () => camasDisponibles.find((c) => c.id.toString() === camaId),
    [camasDisponibles, camaId]
  )

  const obraSocialSeleccionada = pacienteParticular
    ? null
    : obraSociales.find((os) => String(os.id) === obraSocialId)
  const esCoberturaConCoseguro =
    !pacienteParticular && requiereCoseguroParaObraSocial(obraSocialSeleccionada)
  const cosegurosDisponibles = coseguros

  const obtenerMatriculaDefault = () => {
    const profesionalTratante = Number.parseInt(profesionalTratanteId, 10)
    if (Number.isFinite(profesionalTratante)) {
      const match = profesionales.find((p) => p.id === profesionalTratante)
      if (match?.matricula) return match.matricula
    }

    const profesionalGuardia = Number.parseInt(profesionalGuardiaId, 10)
    if (Number.isFinite(profesionalGuardia)) {
      const match = profesionales.find((p) => p.id === profesionalGuardia)
      if (match?.matricula) return match.matricula
    }

    return MATRICULA_AMBULATORIO_DEFAULT
  }

  const handleSeleccionarPaciente = (p: PacienteResumen | null) => {
    setPaciente(p)
    if (p) {
      const esParticular = !p.obraSocialId
      const requiereCoseguroPaciente = !esParticular && p.obraSocialId
        ? requiereCoseguroParaObraSocial(obraSociales.find((os) => os.id === p.obraSocialId))
        : false
      setPacienteParticular(esParticular)
      setObraSocialId(!esParticular && p.obraSocialId ? p.obraSocialId.toString() : '')
      setObraSocialCoseguroId(
        !esParticular && requiereCoseguroPaciente && p.obraSocialCoseguroId
          ? p.obraSocialCoseguroId.toString()
          : ''
      )
      setNumeroAfiliado(!esParticular ? (p.numeroAfiliado ?? '') : '')
      setNombreTutor(p.nombreTutor ?? '')
      setTelefonoTutor(p.telefonoTutor ?? '')
      setProfesionalTratanteId(p.profesionalCabeceraId?.toString() ?? '')
    } else {
      setPacienteParticular(true)
      setObraSocialId('')
      setObraSocialCoseguroId('')
      setNumeroAfiliado('')
      setNombreTutor('')
      setTelefonoTutor('')
      setProfesionalTratanteId('')
    }
  }

  const toggleChecklist = (key: keyof ChecklistDocumental) => {
    setChecklistDocumental((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const agregarDeposito = () => {
    setDepositosRegistros((prev) => [
      ...prev,
      {
        id: crearIdTemporalDeposito(),
        fecha: '',
        importe: '',
        cubreCoseguro: false,
        observaciones: '',
      },
    ])
  }

  const actualizarDeposito = (
    id: string,
    field: keyof DepositoRegistroEditable,
    value: string | boolean
  ) => {
    setDepositosRegistros((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    )
  }

  const eliminarDeposito = (id: string) => {
    setDepositosRegistros((prev) => prev.filter((item) => item.id !== id))
  }

  const validarDepositos = (): string | null => {
    for (const item of depositosRegistros) {
      if (!item.fecha) return 'Todos los depositos deben tener fecha.'
      if (!item.importe.trim()) return 'Todos los depositos deben tener importe.'

      const importe = Number(item.importe)
      if (!Number.isFinite(importe) || importe < 0) {
        return 'Todos los importes de depositos deben ser validos.'
      }
    }

    return null
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (submitEnCursoRef.current || guardando) return

    if (!paciente) {
      setError('Seleccione un paciente')
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    if (bloquearHabitacionCompleta && !camaId) {
      setError('Para bloquear la habitacion completa debe seleccionar una cama')
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    if (bloquearHabitacionCompleta && !camaSeleccionada?.habitacion) {
      setError('La cama seleccionada no tiene habitacion asociada para poder bloquearla completa')
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    if (busquedaPracticaPendiente.termino.trim().length >= 2 && busquedaPracticaPendiente.hayResultados) {
      setError('Seleccione una practica del listado o limpie la busqueda antes de guardar')
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    if (!profesionalTratanteId) {
      setError('Seleccione un medico tratante para la internacion')
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    const errorDepositos = validarDepositos()
    if (errorDepositos) {
      setError(errorDepositos)
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    const matriculaDefault = obtenerMatriculaDefault()
    const practicasNormalizadas = practicas.map((p) => ({
      ...p,
      matriculaEspecialista:
        p.requiereMatriculaEspecialista &&
          (!p.matriculaEspecialista || p.matriculaEspecialista === MATRICULA_AMBULATORIO_DEFAULT)
          ? matriculaDefault
          : p.matriculaEspecialista,
      matriculaAnestesista:
        p.requiereMatriculaAnestesista &&
          (!p.matriculaAnestesista || p.matriculaAnestesista === MATRICULA_AMBULATORIO_DEFAULT)
          ? matriculaDefault
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

    submitEnCursoRef.current = true
    setGuardando(true)
    setMensajeGuardado(
      practicasExpandida.length > 0
        ? 'Creando internacion y preparando ordenes...'
        : 'Creando internacion...'
    )
    setError(null)

    const observacionesSerializadas = serializarObservacionesInternacion({
      observaciones: observaciones || null,
      clinicaDerivante: clinicaDerivante.trim() || null,
      checklistDocumental,
      depositosRegistros: depositosRegistros.map((item) => ({
        id: item.id,
        fecha: item.fecha,
        importe: Number(item.importe),
        cubreCoseguro: item.cubreCoseguro,
        observaciones: item.observaciones.trim() || null,
      })),
    })

    const requiereOrdenAutomatica = practicasExpandida.length > 0
    let ventanaImpresion: Window | null = requiereOrdenAutomatica
      ? abrirVentanaImpresionPendiente()
      : null

    try {
      const body = {
        tipoIngresoCodigo: 'INT',
        subtipoAdmisionCodigo: esCirugiaProgramada ? 'PRG' : null,
        pacienteId: paciente.id,
        fechaIngreso: fechaIngreso || undefined,
        fechaTurno: esCirugiaProgramada && fechaCirugiaProgramada ? fechaCirugiaProgramada : undefined,
        camaId: camaId ? parseInt(camaId, 10) : null,
        bloquearHabitacionCompleta,
        profesionalGuardiaId: profesionalGuardiaId ? parseInt(profesionalGuardiaId, 10) : null,
        profesionalDerivanteId: profesionalDerivanteId ? parseInt(profesionalDerivanteId, 10) : null,
        profesionalTratanteId: profesionalTratanteId ? parseInt(profesionalTratanteId, 10) : null,
        obraSocialId: pacienteParticular ? null : (obraSocialId ? parseInt(obraSocialId, 10) : null),
        planId: null,
        obraSocialCoseguroId:
          !pacienteParticular && obraSocialCoseguroId ? parseInt(obraSocialCoseguroId, 10) : null,
        numeroAfiliado: pacienteParticular ? null : (numeroAfiliado || null),
        nombreTutor: nombreTutor.trim() || null,
        telefonoTutor: telefonoTutor.trim() || null,
        descripcionPatologia: descripcionPatologia || null,
        observaciones: observacionesSerializadas ?? null,
        generarOrdenesSeparadasPorPractica,
        practicas: practicasExpandida.length > 0 ? practicasExpandida : undefined,
      }

      const res = await fetch('/api/admision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const json = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(json?.error ?? 'Error al crear la internacion')
      }

      const ingreso = json?.data
      if (!ingreso?.id) {
        throw new Error('No se recibio el ID de internacion creada')
      }

      const rutaFicha = `/dashboard/internacion/${ingreso.id}`

      if (requiereOrdenAutomatica) {
        void generarOrdenesPendientesAdmision(ingreso.id, {
          separarPorPractica: generarOrdenesSeparadasPorPractica,
        })
          .then((autoOrdenResult) => {
            if (autoOrdenResult.ok && autoOrdenResult.ordenes.length > 0) {
              const ordenesParam = autoOrdenResult.ordenes
                .map((orden) => `${orden.puestoNumero}-${orden.numero}`)
                .join(',')

              navegarVentanaImpresion(
                ventanaImpresion,
                `/dashboard/ambulatorio/imprimir?ordenes=${encodeURIComponent(ordenesParam)}`
              )
              return
            }

            cerrarVentanaImpresion(ventanaImpresion)
            ventanaImpresion = null
          })
          .catch(() => {
            cerrarVentanaImpresion(ventanaImpresion)
            ventanaImpresion = null
          })
      } else {
        cerrarVentanaImpresion(ventanaImpresion)
        ventanaImpresion = null
      }

      router.push(rutaFicha)
    } catch (err) {
      cerrarVentanaImpresion(ventanaImpresion)
      ventanaImpresion = null
      setError(err instanceof Error ? err.message : 'Error desconocido')
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      submitEnCursoRef.current = false
      setGuardando(false)
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="relative space-y-6" aria-busy={guardando}>
      {guardando && (
        <div className="fixed inset-0 z-80 bg-white/70 backdrop-blur-[1px] flex items-center justify-center px-4">
          <div className="rounded-lg border border-blue-200 bg-white shadow-sm px-4 py-3 text-sm text-blue-700 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {mensajeGuardado}
          </div>
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Paciente</h3>
        <BuscarPaciente
          pacienteSeleccionado={paciente}
          onSeleccionar={handleSeleccionarPaciente}
        />
      </div>

      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Datos de internacion</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Medico tratante <span className="text-red-500">*</span>
            </label>
            <p className="mb-1 text-[11px] text-gray-500">
              Medico asignado para la internacion.
            </p>
            <ProfesionalSelect
              profesionales={profesionales}
              value={profesionalTratanteId}
              onChange={setProfesionalTratanteId}
              placeholderOption="— Seleccionar —"
              selectClassName="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Médico de guardia
            </label>
            <p className="mb-1 text-[11px] text-gray-500">
              Opcional. Puede cargar el médico de guardia que participó del ingreso.
            </p>
            <ProfesionalSelect
              profesionales={profesionales}
              value={profesionalGuardiaId}
              onChange={setProfesionalGuardiaId}
              placeholderOption="— Sin médico de guardia —"
              selectClassName="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Medico derivante
            </label>
            <ProfesionalSelect
              profesionales={profesionales}
              value={profesionalDerivanteId}
              onChange={setProfesionalDerivanteId}
              placeholderOption="— Opcional —"
              selectClassName="w-full border rounded-lg px-3 py-2 text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Clinica derivante
            </label>
            <input
              type="text"
              value={clinicaDerivante}
              onChange={(e) => setClinicaDerivante(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="Opcional"
              maxLength={200}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Fecha y hora de ingreso <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              required
              value={fechaIngreso}
              onChange={(e) => setFechaIngreso(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Diagnostico / Motivo de internacion
            </label>
            <textarea
              value={descripcionPatologia}
              onChange={(e) => setDescripcionPatologia(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm resize-none h-20"
              placeholder="Describe el motivo de la internacion..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Familiar responsable
            </label>
            <input
              type="text"
              value={nombreTutor}
              onChange={(e) => setNombreTutor(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="Opcional"
              maxLength={100}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Telefono del familiar responsable
            </label>
            <input
              type="text"
              value={telefonoTutor}
              onChange={(e) => setTelefonoTutor(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="Opcional"
              maxLength={50}
            />
          </div>
        </div>
      </div>

      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Asignacion de cama</h3>

        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <label className="flex items-center gap-2 text-sm text-amber-900">
            <input
              type="checkbox"
              checked={esCirugiaProgramada}
              onChange={(e) => setEsCirugiaProgramada(e.target.checked)}
              className="h-4 w-4 rounded border-amber-300"
            />
            Internacion por cirugia programada (puede quedar sin cama inicial)
          </label>
          {esCirugiaProgramada && (
            <div className="mt-3 max-w-sm">
              <label className="block text-xs font-medium text-amber-900 mb-1">
                Fecha y hora de la cirugia
              </label>
              <input
                type="datetime-local"
                value={fechaCirugiaProgramada}
                onChange={(e) => setFechaCirugiaProgramada(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
              />
              <p className="mt-1 text-xs text-amber-800">
                Si no selecciona cama o fecha, el caso quedara pendiente en Internacion para asignarlo despues.
              </p>
            </div>
          )}
        </div>

        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <label className="flex items-center gap-2 text-sm text-red-900">
            <input
              type="checkbox"
              checked={bloquearHabitacionCompleta}
              onChange={(e) => setBloquearHabitacionCompleta(e.target.checked)}
              className="h-4 w-4 rounded border-red-300"
              disabled={!camaSeleccionada}
            />
            Bloquear habitacion completa
          </label>
          <p className="mt-1 text-xs text-red-800">
            {camaSeleccionada?.habitacion
              ? `Si se activa, se bloquearan las otras camas de la habitacion ${camaSeleccionada.habitacion}.`
              : 'Seleccione una cama con habitacion para habilitar esta opcion.'}
          </p>
        </div>

        {camasDisponibles.length === 0 ? (
          <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">
            No hay camas disponibles en este momento.
          </p>
        ) : (
          <>
            <select
              value={camaId}
              onChange={(e) => setCamaId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white mb-3"
            >
              <option value="">— Sin asignar —</option>
              {Object.entries(
                camasDisponibles.reduce<Record<string, CamaConOcupante[]>>((acc, cama) => {
                  const key = cama.sector
                  if (!acc[key]) acc[key] = []
                  acc[key].push(cama)
                  return acc
                }, {})
              ).map(([sector, camas]) => (
                <optgroup key={sector} label={SECTOR_LABEL[sector] ?? sector}>
                  {camas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.identificador}
                      {c.habitacion ? ` — Hab. ${c.habitacion}` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {camaSeleccionada && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <BedDouble className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-700 font-medium">
                  Cama {camaSeleccionada.identificador} seleccionada —{' '}
                  {SECTOR_LABEL[camaSeleccionada.sector] ?? camaSeleccionada.sector}
                  {esCirugiaProgramada ? ' (se reservara)' : ''}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Cobertura medica</h3>
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
              No se exigira obra social para cargar practicas ni registrar la internacion.
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Obra social</label>
            <select
              value={obraSocialId}
              onChange={(e) => {
                setObraSocialId(e.target.value)
                setObraSocialCoseguroId('')
              }}
              disabled={pacienteParticular}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white disabled:bg-gray-50"
            >
              <option value="">— Sin cobertura —</option>
              {obraSociales.map((os) => (
                <option key={os.id} value={os.id}>{os.nombre}</option>
              ))}
            </select>
          </div>
          {esCoberturaConCoseguro && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Coseguro</label>
              <select
                value={obraSocialCoseguroId}
                onChange={(e) => setObraSocialCoseguroId(e.target.value)}
                disabled={!obraSocialId}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white disabled:bg-gray-50"
              >
                <option value="">— Sin coseguro —</option>
                {cosegurosDisponibles.map((coseguro) => (
                  <option key={coseguro.id} value={coseguro.id}>{coseguro.nombre}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nro. afiliado</label>
            <input
              type="text"
              value={numeroAfiliado}
              onChange={(e) => setNumeroAfiliado(e.target.value)}
              disabled={pacienteParticular}
              className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
              placeholder={pacienteParticular ? 'No aplica para particular' : 'Numero de afiliado'}
            />
          </div>
        </div>
      </div>

      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Observaciones</h3>
        <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="mb-2 flex items-center gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
              Checklist documental
            </h4>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {REQUISITOS_DOCUMENTALES.map((item) => (
              <label key={item.key} className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={checklistDocumental[item.key]}
                  onChange={() => toggleChecklist(item.key)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-gray-500" />
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                Depositos
              </h4>
            </div>
            <button
              type="button"
              onClick={agregarDeposito}
              disabled={guardando}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Agregar deposito
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-2 py-2">Fecha</th>
                  <th className="px-2 py-2">Importe</th>
                  <th className="px-2 py-2 text-center">Cubre coseguro</th>
                  <th className="px-2 py-2">Observaciones</th>
                  <th className="px-2 py-2 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {depositosRegistros.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-3 text-xs text-gray-500">
                      Sin depositos registrados.
                    </td>
                  </tr>
                ) : (
                  depositosRegistros.map((item) => (
                    <tr key={item.id} className="text-gray-700">
                      <td className="px-2 py-2">
                        <input
                          type="date"
                          value={item.fecha}
                          onChange={(e) => actualizarDeposito(item.id, 'fecha', e.target.value)}
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs"
                          disabled={guardando}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.importe}
                          onChange={(e) => actualizarDeposito(item.id, 'importe', e.target.value)}
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs"
                          disabled={guardando}
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={item.cubreCoseguro}
                          onChange={(e) => actualizarDeposito(item.id, 'cubreCoseguro', e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          disabled={guardando}
                          aria-label="El deposito cubre coseguro"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="text"
                          value={item.observaciones}
                          onChange={(e) => actualizarDeposito(item.id, 'observaciones', e.target.value)}
                          maxLength={500}
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs"
                          placeholder="Opcional"
                          disabled={guardando}
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => eliminarDeposito(item.id)}
                          className="inline-flex items-center justify-center text-red-600 hover:text-red-700"
                          disabled={guardando}
                          aria-label="Eliminar deposito"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm resize-none h-20"
          placeholder="Observaciones adicionales..."
        />
      </div>

      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Practicas</h3>
        {!pacienteParticular && !obraSocialId && (
          <p className="text-xs text-amber-700 mb-3">
            Asignar obra social para buscar practicas en nomenclador.
          </p>
        )}
        {pacienteParticular && (
          <p className="text-xs text-amber-700 mb-3">
            Paciente particular: la busqueda de practicas se realiza sobre el nomenclador general.
          </p>
        )}

        <PracticasAdmisionCard
          obraSocialId={pacienteParticular ? null : obraSocialId}
          etiquetaBusqueda="Buscar practica en nomenclador..."
          practicas={practicas}
          setPracticas={setPracticas}
          obtenerMatriculaDefault={obtenerMatriculaDefault}
          disabled={guardando || (!pacienteParticular && !obraSocialId)}
          onPendingSearchChange={setBusquedaPracticaPendiente}
        />

        {practicas.length > 1 && (
          <div className="mt-3 rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2">
            <label className="inline-flex items-center gap-2 text-sm text-blue-900">
              <input
                type="checkbox"
                checked={generarOrdenesSeparadasPorPractica}
                onChange={(e) => setGenerarOrdenesSeparadasPorPractica(e.target.checked)}
                className="h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
              />
              Generar una orden separada por cada practica agregada
            </label>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={guardando}
          className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={guardando || !paciente}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {guardando ? 'Guardando...' : 'Crear internacion'}
        </button>
      </div>
    </form>
  )
}
