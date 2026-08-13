'use client'

import { useController, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { ActualizarPacienteSchema, CrearPacienteSchema } from '@/modules/pacientes/schemas'
import { ProfesionalSelect } from '@/components/ui/profesional-select'
import { requiereCoseguroParaObraSocial } from '@/lib/utils/coseguros'

// Tipo flexible para valores iniciales del formulario.
// Las fechas llegan como strings YYYY-MM-DD desde el servidor,
// y Zod coerciona tipos en el submit.
type PacienteFormDefaults = {
  apellido?: string
  nombre?: string
  tipoDocumento?: string | null
  numeroDocumento?: number | null
  fechaNacimiento?: string | null
  sexo?: string | null
  profesionalCabeceraId?: number | null
  domicilio?: string | null
  telefonoFijo?: string | null
  telefonoLaboral?: string | null
  celular1?: string | null
  celular2?: string | null
  email?: string | null
  obraSocialId?: number | null
  planId?: number | null
  obraSocialCoseguroId?: number | null
  numeroAfiliado?: string | null
  nombreTutor?: string | null
  telefonoTutor?: string | null
  observaciones?: string | null
  [key: string]: unknown
}

interface PacienteFormProps {
  pacienteId?: number
  valoresIniciales?: PacienteFormDefaults
  obraSociales: ObraSocialOption[]
  coseguros: CoseguroOption[]
  profesionales: ProfesionalOption[]
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

interface ProfesionalOption {
  id: number
  nombre: string
  matricula: number | null
}

export function PacienteForm({
  pacienteId,
  valoresIniciales,
  obraSociales,
  coseguros,
  profesionales,
}: PacienteFormProps) {
  const esEdicion = Boolean(pacienteId)
  const router = useRouter()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pacienteCreadoId, setPacienteCreadoId] = useState<number | null>(null)
  const [latenciaCreacionMs, setLatenciaCreacionMs] = useState<number | null>(null)
  const [pacienteParticular, setPacienteParticular] = useState(() =>
    Boolean(valoresIniciales) && !valoresIniciales?.obraSocialId
  )

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    control,
    formState: { errors },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useForm<any>({
    resolver: zodResolver(esEdicion ? ActualizarPacienteSchema : CrearPacienteSchema),
    defaultValues: valoresIniciales ?? {},
  })

  const { field: profesionalCabeceraField } = useController({
    name: 'profesionalCabeceraId',
    control,
  })

  const obraSocialIdRaw = watch('obraSocialId') as number | string | undefined
  const obraSocialIdSeleccionada = pacienteParticular
    ? undefined
    : (obraSocialIdRaw ? Number(obraSocialIdRaw) : undefined)
  const obraSocialSeleccionada = obraSociales.find((os) => os.id === obraSocialIdSeleccionada)

  const esObraSocialConCoseguro =
    !pacienteParticular && requiereCoseguroParaObraSocial(obraSocialSeleccionada)
  const cosegurosDisponibles = coseguros

  const obraSocialRegister = register('obraSocialId', {
    setValueAs: (value) => (value === '' ? undefined : Number(value)),
  })
  const obraSocialCoseguroRegister = register('obraSocialCoseguroId', {
    setValueAs: (value) => (value === '' ? undefined : Number(value)),
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onSubmit = async (data: any) => {
    const inicioSubmit = performance.now()
    setGuardando(true)
    setError(null)
    if (!pacienteId) {
      setPacienteCreadoId(null)
      setLatenciaCreacionMs(null)
    }

    try {
      const payload = {
        ...data,
        obraSocialId: pacienteParticular ? null : (data.obraSocialId ?? null),
        planId: null,
        numeroAfiliado: pacienteParticular ? null : (data.numeroAfiliado ?? null),
        obraSocialCoseguroId:
          pacienteParticular
            ? null
            : (data.obraSocialCoseguroId ?? null),
      }

      const url = pacienteId ? `/api/pacientes/${pacienteId}` : '/api/pacientes'
      const method = pacienteId ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload, (_key, value) =>
          typeof value === 'bigint' ? value.toString() : value
        ),
      })

      const pacienteIdHeader = res.headers.get('x-paciente-id')
      if (!pacienteId && res.ok && pacienteIdHeader) {
        const pacienteIdCreado = Number.parseInt(pacienteIdHeader, 10)
        if (!Number.isNaN(pacienteIdCreado) && pacienteIdCreado > 0) {
          const latenciaMs = Math.round(performance.now() - inicioSubmit)
          if (typeof window !== 'undefined') {
            sessionStorage.setItem(
              'his.pacientes.creacion.submitMs',
              String(latenciaMs)
            )
          }

          setLatenciaCreacionMs(latenciaMs)
          setPacienteCreadoId(pacienteIdCreado)
          reset({})
          return
        }
      }

      const json = await res.json()

      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? 'Error al guardar el paciente')
      }

      if (!pacienteId && typeof window !== 'undefined') {
        const latenciaMs = Math.round(performance.now() - inicioSubmit)
        sessionStorage.setItem('his.pacientes.creacion.submitMs', String(latenciaMs))
        setLatenciaCreacionMs(latenciaMs)
        setPacienteCreadoId(Number(json.data.id))
        reset({})
        return
      }

      router.replace(`/dashboard/pacientes/${json.data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!esEdicion && pacienteCreadoId && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 space-y-3">
          <p className="font-medium">
            Paciente creado correctamente.
            {latenciaCreacionMs != null ? ` Tiempo de guardado: ${latenciaCreacionMs} ms.` : ''}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/dashboard/pacientes/${pacienteCreadoId}`}
              className="inline-flex items-center rounded-md bg-emerald-700 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-800"
            >
              Ver ficha
            </Link>
            <Link
              href={`/dashboard/admision/nuevo?pacienteId=${pacienteCreadoId}`}
              className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
            >
              Nueva admisión
            </Link>
            <button
              type="button"
              onClick={() => {
                setPacienteCreadoId(null)
                setLatenciaCreacionMs(null)
              }}
              className="inline-flex items-center rounded-md border border-emerald-300 bg-white px-3 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
            >
              Cargar otro paciente
            </button>
          </div>
        </div>
      )}

      {!esEdicion && (
        <p className="text-xs text-gray-500">
          Los campos marcados con <span className="text-red-500">*</span> son obligatorios.
        </p>
      )}

      {/* Identificación */}
      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
          Identificación
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Apellido <span className="text-red-500">*</span>
            </label>
            <input
              {...register('apellido')}
              required={!esEdicion}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
              placeholder="GARCIA"
            />
            {errors.apellido && (
              <p className="text-xs text-red-500 mt-1">{String(errors.apellido.message)}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              {...register('nombre')}
              required={!esEdicion}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Juan Manuel"
            />
            {errors.nombre && (
              <p className="text-xs text-red-500 mt-1">{String(errors.nombre.message)}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Tipo de Documento <span className="text-red-500">*</span>
            </label>
            <select
              {...register('tipoDocumento')}
              required={!esEdicion}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">-- Seleccionar --</option>
              <option value="DNI">DNI</option>
              <option value="LC ">LC</option>
              <option value="LE ">LE</option>
              <option value="PAS">Pasaporte</option>
              <option value="CUI">CUI</option>
            </select>
            {errors.tipoDocumento && (
              <p className="text-xs text-red-500 mt-1">{String(errors.tipoDocumento.message)}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Numero de Documento <span className="text-red-500">*</span>
            </label>
            <input
              {...register('numeroDocumento', { valueAsNumber: true })}
              type="number"
              min={1}
              required={!esEdicion}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="30123456"
            />
            {errors.numeroDocumento && (
              <p className="text-xs text-red-500 mt-1">{String(errors.numeroDocumento.message)}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Fecha de Nacimiento <span className="text-red-500">*</span>
            </label>
            <input
              {...register('fechaNacimiento')}
              type="date"
              required={!esEdicion}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.fechaNacimiento && (
              <p className="text-xs text-red-500 mt-1">{String(errors.fechaNacimiento.message)}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Sexo <span className="text-red-500">*</span>
            </label>
            <select
              {...register('sexo')}
              required={!esEdicion}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">-- Seleccionar --</option>
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
              <option value="I">Indeterminado</option>
            </select>
            {errors.sexo && (
              <p className="text-xs text-red-500 mt-1">{String(errors.sexo.message)}</p>
            )}
          </div>

        </div>
      </div>

      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
          Médico de cabecera
          <span className="ml-2 text-xs font-normal text-gray-400">(opcional)</span>
        </h3>
        <div className="max-w-md">
          <ProfesionalSelect
            profesionales={profesionales}
            value={profesionalCabeceraField.value ? String(profesionalCabeceraField.value) : ''}
            onChange={(value) => profesionalCabeceraField.onChange(value ? Number(value) : null)}
            placeholderOption="-- Sin médico de cabecera --"
          />
          {errors.profesionalCabeceraId && (
            <p className="text-xs text-red-500 mt-1">
              {String(errors.profesionalCabeceraId.message)}
            </p>
          )}
        </div>
      </div>

      {/* Contacto y Domicilio */}
      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
          Contacto y Domicilio
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Celular principal
            </label>
            <input
              {...register('celular1')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="3514123456"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Celular alternativo
            </label>
            <input
              {...register('celular2')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="3514654321"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Teléfono fijo
            </label>
            <input
              {...register('telefonoFijo')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="03514123456"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Email
            </label>
            <input
              {...register('email')}
              type="email"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="correo@ejemplo.com"
            />
            {errors.email && (
              <p className="text-xs text-red-500 mt-1">{String(errors.email.message)}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Domicilio</label>
            <input
              {...register('domicilio')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Av. Colón 1234, Piso 2"
            />
          </div>
        </div>
      </div>

      {/* Cobertura Médica */}
      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
          Cobertura Médica
        </h3>
        <div className="mb-3">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={pacienteParticular}
              onChange={(e) => {
                const checked = e.target.checked
                setPacienteParticular(checked)
                if (checked) {
                  setValue('obraSocialId', undefined)
                  setValue('planId', undefined)
                  setValue('obraSocialCoseguroId', undefined)
                  setValue('numeroAfiliado', '')
                }
              }}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Paciente particular
          </label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Obra Social</label>
            <select
              {...obraSocialRegister}
              disabled={pacienteParticular}
              onChange={(e) => {
                obraSocialRegister.onChange(e)
                setValue('planId', undefined)
                setValue('obraSocialCoseguroId', undefined)
              }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100"
            >
              <option value="">-- Seleccionar obra social --</option>
              {obraSociales.map((obraSocial) => (
                <option key={obraSocial.id} value={String(obraSocial.id)}>
                  {obraSocial.nombre}
                </option>
              ))}
            </select>
            {errors.obraSocialId && (
              <p className="text-xs text-red-500 mt-1">{String(errors.obraSocialId.message)}</p>
            )}
          </div>

          {obraSocialIdSeleccionada && esObraSocialConCoseguro && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Coseguro
              </label>
              <select
                {...obraSocialCoseguroRegister}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">-- Sin coseguro --</option>
                {cosegurosDisponibles.map((coseguro) => (
                  <option key={coseguro.id} value={String(coseguro.id)}>
                    {coseguro.nombre}
                  </option>
                ))}
              </select>
              {errors.obraSocialCoseguroId && (
                <p className="text-xs text-red-500 mt-1">
                  {String(errors.obraSocialCoseguroId.message)}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Número de Afiliado
            </label>
            <input
              {...register('numeroAfiliado')}
              disabled={pacienteParticular}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              placeholder={pacienteParticular ? 'No aplica para particular' : '123456789'}
            />
          </div>
        </div>
        {esObraSocialConCoseguro && (
          <p className="mt-3 text-xs text-amber-700">
            Seleccione coseguro solo si corresponde.
          </p>
        )}
      </div>

      {/* Tutor / Responsable */}
      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">
          Tutor / Responsable
          <span className="ml-2 text-xs font-normal text-gray-400">(completar solo si aplica)</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Nombre del tutor
            </label>
            <input
              {...register('nombreTutor')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="María García"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Teléfono del tutor
            </label>
            <input
              {...register('telefonoTutor')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="3514999888"
            />
          </div>
        </div>
      </div>

      {/* Observaciones */}
      <div className="his-card p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b">
          Observaciones
        </h3>
        <textarea
          {...register('observaciones')}
          rows={3}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder="Observaciones adicionales sobre el paciente..."
        />
        {errors.observaciones && (
          <p className="text-xs text-red-500 mt-1">{String(errors.observaciones.message)}</p>
        )}
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
          disabled={guardando}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {guardando
            ? 'Guardando...'
            : pacienteId
              ? 'Guardar Cambios'
              : 'Crear Paciente'}
        </button>
      </div>
    </form>
  )
}
