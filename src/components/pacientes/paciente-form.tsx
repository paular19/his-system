'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CrearPacienteSchema } from '@/modules/pacientes/schemas'

// Tipo flexible para valores iniciales del formulario.
// Las fechas llegan como strings YYYY-MM-DD desde el servidor,
// cuil como string numérico. Zod coerciona en el submit.
type PacienteFormDefaults = {
  apellido?: string
  nombre?: string
  tipoDocumento?: string | null
  numeroDocumento?: number | null
  cuil?: string | null
  fechaNacimiento?: string | null
  sexo?: string | null
  estadoCivil?: string | null
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
  empleoTutor?: string | null
  observaciones?: string | null
  [key: string]: unknown
}

interface PacienteFormProps {
  pacienteId?: number
  valoresIniciales?: PacienteFormDefaults
  obraSociales: ObraSocialOption[]
  planes: PlanOption[]
  coseguros: CoseguroOption[]
}

interface ObraSocialOption {
  id: number
  nombre: string
  requiereCoseguro: boolean
}

interface PlanOption {
  id: number
  descripcion: string
  obraSocialId: number
}

interface CoseguroOption {
  id: number
  nombre: string
}

export function PacienteForm({
  pacienteId,
  valoresIniciales,
  obraSociales,
  planes,
  coseguros,
}: PacienteFormProps) {
  const router = useRouter()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState(false)
  const [tieneCoseguro, setTieneCoseguro] = useState<'SI' | 'NO'>(
    valoresIniciales?.obraSocialCoseguroId ? 'SI' : 'NO'
  )

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useForm<any>({
    resolver: zodResolver(CrearPacienteSchema),
    defaultValues: valoresIniciales ?? {},
  })

  const obraSocialIdRaw = watch('obraSocialId') as number | string | undefined
  const obraSocialIdSeleccionada = obraSocialIdRaw ? Number(obraSocialIdRaw) : undefined
  const obraSocialSeleccionada = obraSociales.find((os) => os.id === obraSocialIdSeleccionada)
  const requiereCoseguro = Boolean(obraSocialSeleccionada?.requiereCoseguro)
  const planesDisponibles = obraSocialIdSeleccionada
    ? planes.filter((plan) => plan.obraSocialId === obraSocialIdSeleccionada)
    : []
  const cosegurosDisponibles = obraSocialIdSeleccionada
    ? coseguros.filter((coseguro) => coseguro.id === obraSocialIdSeleccionada)
    : []

  const obraSocialRegister = register('obraSocialId', {
    setValueAs: (value) => (value === '' ? undefined : Number(value)),
  })
  const planRegister = register('planId', {
    setValueAs: (value) => (value === '' ? undefined : Number(value)),
  })
  const obraSocialCoseguroRegister = register('obraSocialCoseguroId', {
    setValueAs: (value) => (value === '' ? undefined : Number(value)),
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onSubmit = async (data: any) => {
    setGuardando(true)
    setError(null)
    setExito(false)

    try {
      const obraSocialData = obraSociales.find((os) => os.id === Number(data.obraSocialId))
      if (tieneCoseguro === 'SI' && !data.obraSocialCoseguroId) {
        throw new Error('Debe seleccionar el coseguro correspondiente')
      }

      if (obraSocialData?.requiereCoseguro && tieneCoseguro !== 'SI') {
        throw new Error('La obra social seleccionada requiere que indique un coseguro')
      }

      const payload = {
        ...data,
        obraSocialCoseguroId:
          tieneCoseguro === 'SI'
            ? (data.obraSocialCoseguroId ?? obraSocialIdSeleccionada ?? null)
            : null,
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

      const json = await res.json()

      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? 'Error al guardar el paciente')
      }

      setExito(true)
      router.push(`/dashboard/pacientes/${json.data.id}`)
      router.refresh()
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

      {exito && (
        <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700">
          Paciente guardado correctamente. Redirigiendo...
        </div>
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
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Juan Manuel"
            />
            {errors.nombre && (
              <p className="text-xs text-red-500 mt-1">{String(errors.nombre.message)}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Tipo de Documento
            </label>
            <select
              {...register('tipoDocumento')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">-- Seleccionar --</option>
              <option value="DNI">DNI</option>
              <option value="LC ">LC</option>
              <option value="LE ">LE</option>
              <option value="PAS">Pasaporte</option>
              <option value="CUI">CUI</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Número de Documento
            </label>
            <input
              {...register('numeroDocumento', { valueAsNumber: true })}
              type="number"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="30123456"
            />
            {errors.numeroDocumento && (
              <p className="text-xs text-red-500 mt-1">{String(errors.numeroDocumento.message)}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Fecha de Nacimiento
            </label>
            <input
              {...register('fechaNacimiento')}
              type="date"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.fechaNacimiento && (
              <p className="text-xs text-red-500 mt-1">{String(errors.fechaNacimiento.message)}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sexo</label>
            <select
              {...register('sexo')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">-- Seleccionar --</option>
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
              <option value="I">Indeterminado</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Estado Civil</label>
            <select
              {...register('estadoCivil')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">-- Seleccionar --</option>
              <option value="S">Soltero/a</option>
              <option value="C">Casado/a</option>
              <option value="D">Divorciado/a</option>
              <option value="V">Viudo/a</option>
              <option value="U">Unión convivencial</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">CUIL</label>
            <input
              {...register('cuil')}
              type="text"
              inputMode="numeric"
              maxLength={11}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="20301234567"
            />
            {errors.cuil && (
              <p className="text-xs text-red-500 mt-1">{String(errors.cuil.message)}</p>
            )}
          </div>
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
              Teléfono laboral
            </label>
            <input
              {...register('telefonoLaboral')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="03514789012"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Obra Social</label>
            <select
              {...obraSocialRegister}
              onChange={(e) => {
                obraSocialRegister.onChange(e)
                setValue('planId', undefined)
                setValue('obraSocialCoseguroId', undefined)
                setTieneCoseguro('NO')
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
            {errors.obraSocialId && (
              <p className="text-xs text-red-500 mt-1">{String(errors.obraSocialId.message)}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Plan</label>
            <select
              {...planRegister}
              disabled={!obraSocialIdSeleccionada || planesDisponibles.length === 0}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100 disabled:text-gray-500"
            >
              <option value="">
                {!obraSocialIdSeleccionada
                  ? '-- Seleccione obra social primero --'
                  : planesDisponibles.length === 0
                    ? '-- Sin planes cargados --'
                    : '-- Seleccionar plan --'}
              </option>
              {planesDisponibles.map((plan) => (
                <option key={plan.id} value={String(plan.id)}>
                  {plan.descripcion}
                </option>
              ))}
            </select>
            {errors.planId && (
              <p className="text-xs text-red-500 mt-1">{String(errors.planId.message)}</p>
            )}
          </div>

          {obraSocialIdSeleccionada && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">¿Tiene coseguro?</label>
              <select
                value={tieneCoseguro}
                onChange={(e) => {
                  const value = e.target.value === 'SI' ? 'SI' : 'NO'
                  setTieneCoseguro(value)
                  if (value === 'NO') {
                    setValue('obraSocialCoseguroId', undefined)
                  } else if (cosegurosDisponibles.length === 1) {
                    setValue('obraSocialCoseguroId', cosegurosDisponibles[0]?.id)
                  }
                }}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="NO">No</option>
                <option value="SI">Sí</option>
              </select>
            </div>
          )}

          {obraSocialIdSeleccionada && tieneCoseguro === 'SI' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Coseguro <span className="text-red-500">*</span>
              </label>
              <select
                {...obraSocialCoseguroRegister}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">-- Seleccionar coseguro --</option>
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
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="123456789"
            />
          </div>
        </div>
        {(requiereCoseguro || tieneCoseguro === 'SI') && (
          <p className="mt-3 text-xs text-amber-700">
            Si el paciente tiene coseguro, seleccione una opción correspondiente a su obra social.
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

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Empleo del tutor
            </label>
            <input
              {...register('empleoTutor')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Docente"
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
