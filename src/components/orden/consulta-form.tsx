'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Plus, X, Loader2, Check } from 'lucide-react'
import { BuscarPaciente } from '@/components/admision/buscar-paciente'
import type { PacienteResumen } from '@/modules/admision/types'
import { crearOrdenesDesdeAdmisionAction } from '@/modules/orden/actions'
import type { OrdenPracticaItemInput } from '@/modules/orden/schemas'
import type { AdmisionOrdenContexto, NomencladorPracticaItem } from '@/modules/orden/types'
import {
  ComponenteSelector,
  type ComponenteValores,
  type ComponenteSeleccion,
  calcularTotalSeleccionado,
  seleccionPorDefecto,
} from '@/components/ui/componente-selector'

interface ObraSocialItem {
  id: number
  nombre: string
}

interface ProfesionalItem {
  id: number
  nombre: string
  matricula?: number | null
}

interface ConsultaFormProps {
  obraSociales: ObraSocialItem[]
  profesionales: ProfesionalItem[]
  pacienteInicial?: PacienteResumen | null
  admisionInicial?: AdmisionOrdenContexto | null
  usuario: string
  modoInicial?: 'MASIVA' | 'INDIVIDUAL' | 'AGRUPADA'
}

type ItemPractica = OrdenPracticaItemInput & {
  practicaId?: number | null
  descripcionPractica: string
  _key: string
  grupoOrden: number
  valorUnitario: number | null
  desglose?: {
    valorEspecialista: number | null
    valorAyudante: number | null
    valorAnestesista: number | null
    valorGastos: number | null
  }
  seleccionComponentes?: ComponenteSeleccion
  matriculaEspecialista?: number | null
  matriculaAnestesista?: number | null
}

type EstrategiaOrden = 'ESTANDAR' | 'MODULARIDAD' | 'GRUPALIDAD'

const formatoMoneda = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
})
const MATRICULA_AMBULATORIO_DEFAULT = 9110
const MATRICULA_ANESTESISTA_INT_DEFAULT = 6
const MATRICULA_AYUDANTE_DEFAULT = 995

function resolverMatriculasDefault(
  tipoIngresoCodigo: string | null | undefined,
  matriculaEspecialista: number | null | undefined,
  matriculaAnestesista: number | null | undefined,
  matriculaEspecialistaInternacionDefault: number | null | undefined
): { matriculaEspecialista: number | null; matriculaAnestesista: number | null } {
  const esInternacion = (tipoIngresoCodigo ?? '').trim().toUpperCase() === 'INT'

  if (!esInternacion) {
    return {
      matriculaEspecialista: MATRICULA_AMBULATORIO_DEFAULT,
      matriculaAnestesista: MATRICULA_AMBULATORIO_DEFAULT,
    }
  }

  return {
    matriculaEspecialista: matriculaEspecialista ?? matriculaEspecialistaInternacionDefault ?? null,
    matriculaAnestesista: matriculaAnestesista ?? MATRICULA_ANESTESISTA_INT_DEFAULT,
  }
}

function siguienteGrupoOrden(items: Array<{ grupoOrden: number }>): number {
  const maxGrupo = items.reduce((max, item) => {
    const grupo = Number.isFinite(item.grupoOrden) && item.grupoOrden > 0 ? item.grupoOrden : 0
    return Math.max(max, grupo)
  }, 0)
  return maxGrupo + 1
}

function inferirSeleccionDesdeImporte(
  desglose: {
    valorEspecialista: number | null
    valorAyudante: number | null
    valorAnestesista: number | null
    valorGastos: number | null
  },
  cantidad: number,
  importeTotal: number | null | undefined,
  pistas?: { matriculaEspecialista?: number | null; matriculaAnestesista?: number | null }
): ComponenteSeleccion {
  const porDefecto: ComponenteSeleccion = {
    especialista: desglose.valorEspecialista != null ? 1 : 0,
    ayudante: desglose.valorAyudante != null ? 1 : 0,
    anestesista: desglose.valorAnestesista != null ? 1 : 0,
    gastos: desglose.valorGastos != null ? 1 : 0,
  }

  if (importeTotal == null || !Number.isFinite(importeTotal) || importeTotal <= 0 || cantidad <= 0) {
    return porDefecto
  }

  const vEsp = desglose.valorEspecialista != null ? Number(desglose.valorEspecialista) * cantidad : null
  const vAyu = desglose.valorAyudante != null ? Number(desglose.valorAyudante) * cantidad : null
  const vAne = desglose.valorAnestesista != null ? Number(desglose.valorAnestesista) * cantidad : null
  const vGas = desglose.valorGastos != null ? Number(desglose.valorGastos) * cantidad : null

  let mejor: ComponenteSeleccion | null = null
  let mejorScore = Number.POSITIVE_INFINITY
  const objetivo = Number(importeTotal)

  for (let esp = 0; esp <= (vEsp != null ? 1 : 0); esp += 1) {
    for (let ane = 0; ane <= (vAne != null ? 1 : 0); ane += 1) {
      for (let gas = 0; gas <= (vGas != null ? 1 : 0); gas += 1) {
        for (let ayu = 0; ayu <= (vAyu != null ? 3 : 0); ayu += 1) {
          const total =
            (esp ? vEsp ?? 0 : 0) +
            (ane ? vAne ?? 0 : 0) +
            (gas ? vGas ?? 0 : 0) +
            (ayu > 0 ? (vAyu ?? 0) * ayu : 0)

          if (total <= 0) continue
          if (Math.abs(total - objetivo) > 0.01) continue

          const score = esp + ane + gas + ayu
          if (score < mejorScore) {
            mejorScore = score
            mejor = {
              especialista: esp,
              ayudante: ayu,
              anestesista: ane,
              gastos: gas,
            }
          }
        }
      }
    }
  }

  if (mejor) return mejor

  // Fallback guiado por pistas de efector para conservar lo que vino desde cirugía.
  if ((pistas?.matriculaAnestesista ?? null) && !((pistas?.matriculaEspecialista ?? null))) {
    return {
      especialista: 0,
      ayudante: 0,
      anestesista: desglose.valorAnestesista != null ? 1 : 0,
      gastos: 0,
    }
  }

  if ((pistas?.matriculaEspecialista ?? null) && !((pistas?.matriculaAnestesista ?? null))) {
    return {
      especialista: desglose.valorEspecialista != null ? 1 : 0,
      ayudante: 0,
      anestesista: 0,
      gastos: 0,
    }
  }

  // Si no se puede inferir por importe, conservar los componentes disponibles.
  return porDefecto
}

export function ConsultaForm({
  obraSociales,
  profesionales,
  pacienteInicial,
  admisionInicial,
  modoInicial = 'MASIVA',
}: ConsultaFormProps) {
  const router = useRouter()
  const esFlujoAdmision = Boolean(admisionInicial)
  const profesionalTratanteAdmision = admisionInicial?.profesionalTratante ?? null
  const profesionalTratanteDisponible =
    profesionalTratanteAdmision &&
      profesionales.some((profesional) => profesional.id === profesionalTratanteAdmision.id)
      ? profesionalTratanteAdmision
      : null
  const matriculaEspecialistaInternacionDefault =
    profesionalTratanteDisponible?.matricula ?? profesionales.find((profesional) => profesional.matricula)?.matricula ?? null

  const [paciente, setPaciente] = useState<PacienteResumen | null>(pacienteInicial ?? null)
  const [obraSocialId, setObraSocialId] = useState<string>(
    admisionInicial?.obraSocialId?.toString() ?? pacienteInicial?.obraSocialId?.toString() ?? ''
  )
  const [profesionalId, setProfesionalId] = useState<string>(
    profesionalTratanteDisponible
      ? String(profesionalTratanteDisponible.id)
      : (profesionales[0] ? String(profesionales[0].id) : '')
  )
  const [diagnostico, setDiagnostico] = useState(admisionInicial?.descripcionPatologia ?? '')
  const [modoGeneracion, setModoGeneracion] = useState<'MASIVA' | 'INDIVIDUAL' | 'AGRUPADA'>(modoInicial)
  const [tituloOrden, setTituloOrden] = useState('')
  const [estrategiaOrden, setEstrategiaOrden] = useState<EstrategiaOrden>('ESTANDAR')
  const practicasPendientesIniciales = admisionInicial?.practicas ?? []
  const [practicas, setPracticas] = useState<ItemPractica[]>(
    practicasPendientesIniciales.map((p, idx) => {
      const matriculasDefault = resolverMatriculasDefault(
        admisionInicial?.tipoIngresoCodigo,
        p.matriculaEspecialista,
        p.matriculaAnestesista,
        matriculaEspecialistaInternacionDefault
      )

      return {
        _key: `ingreso-${p.id}-${idx}`,
        practicaId: p.id,
        convenioId: p.convenioId,
        codigoPractica: p.codigoPractica.trim().slice(0, 8),
        descripcionPractica: p.descripcionPractica,
        grupoOrden: p.grupoOrden ?? 1,
        cantidad: p.cantidad,
        tipoFacturacion: 'H',
        importeTotal: p.importeTotal ?? undefined,
        valorUnitario:
          p.importeTotal != null && Number(p.cantidad) > 0 ? Number(p.importeTotal) / Number(p.cantidad) : null,
        desglose: {
          valorEspecialista: p.valorEspecialista,
          valorAyudante: p.valorAyudante,
          valorAnestesista: p.valorAnestesista,
          valorGastos: p.valorGastos,
        },
        seleccionComponentes: inferirSeleccionDesdeImporte(
          {
            valorEspecialista: p.valorEspecialista,
            valorAyudante: p.valorAyudante,
            valorAnestesista: p.valorAnestesista,
            valorGastos: p.valorGastos,
          },
          Number(p.cantidad),
          p.importeTotal,
          {
            matriculaEspecialista: p.matriculaEspecialista,
            matriculaAnestesista: p.matriculaAnestesista,
          }
        ),
        matriculaEspecialista: matriculasDefault.matriculaEspecialista,
        matriculaAnestesista: matriculasDefault.matriculaAnestesista,
      }
    })
  )
  // Búsqueda de prácticas
  const [busquedaPractica, setBusquedaPractica] = useState('')
  const [resultadosPractica, setResultadosPractica] = useState<NomencladorPracticaItem[]>([])
  const [buscandoPractica, setBuscandoPractica] = useState(false)

  // Selector de componentes (práctica pendiente de confirmar)
  const [practicaPendiente, setPracticaPendiente] = useState<NomencladorPracticaItem | null>(null)
  const [pendienteSeleccion, setPendienteSeleccion] = useState<ComponenteSeleccion>({
    especialista: 0, ayudante: 0, anestesista: 0, gastos: 0,
  })

  // Estado para modo modular por práctica
  const [componentGroupings, setComponentGroupings] = useState<Record<string, Set<string>>>({})
  const [titularPorPractica, setTitularPorPractica] = useState<Record<string, string>>({})
  const [titularPorGrupo, setTitularPorGrupo] = useState<Record<number, string>>({})
  const [nombrePatologiaPorGrupo, setNombrePatologiaPorGrupo] = useState<Record<number, string>>({})
  const [matriculaPatologiaPorGrupo, setMatriculaPatologiaPorGrupo] = useState<Record<number, number | null>>({})
  const [duplicadoPorPractica, setDuplicadoPorPractica] = useState<Record<string, boolean>>({})
  const [imprimirDuplicadoEstandar, setImprimirDuplicadoEstandar] = useState(false)
  const [duplicadoPorGrupo, setDuplicadoPorGrupo] = useState<Record<number, boolean>>({})

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const esEstrategiaModular = estrategiaOrden === 'MODULARIDAD'
  const esEstrategiaEstandar = estrategiaOrden === 'ESTANDAR'
  const esEstrategiaGrupal = estrategiaOrden === 'GRUPALIDAD'

  const obtenerSubitemsSeleccionados = (p: ItemPractica): string[] => {
    const sel = p.seleccionComponentes
    const d = p.desglose
    if (!sel || !d) return ['COMPLETA']

    const subitems: string[] = []
    if (sel.gastos > 0 && d.valorGastos != null) subitems.push('GA')
    if (sel.especialista > 0 && d.valorEspecialista != null) subitems.push('HE')
    if (sel.anestesista > 0 && d.valorAnestesista != null) subitems.push('HA')
    if (sel.ayudante > 0 && d.valorAyudante != null) {
      const cantidadAyudantes = Math.min(sel.ayudante, 3)
      for (let i = 1; i <= cantidadAyudantes; i += 1) {
        subitems.push(`A${i}`)
      }
    }

    return subitems.length > 0 ? subitems : ['COMPLETA']
  }

  const practicasPorGrupo = practicas.reduce<Record<number, ItemPractica[]>>((acc, p) => {
    const grupo = Number.isFinite(p.grupoOrden) && p.grupoOrden > 0 ? p.grupoOrden : 1
    if (!acc[grupo]) acc[grupo] = []
    acc[grupo]!.push(p)
    return acc
  }, {})

  const convenioDefecto =
    obraSocialId && Number.isFinite(parseInt(obraSocialId, 10))
      ? parseInt(obraSocialId, 10)
      : practicas[0]?.convenioId

  const handlePacienteSeleccionado = useCallback(
    (p: PacienteResumen | null) => {
      setPaciente(p)
      if (p?.obraSocialId) {
        setObraSocialId(String(p.obraSocialId))
      }
    },
    []
  )

  const buscarPractica = async (termino: string, convenioId: number | undefined) => {
    if (termino.trim().length < 2) {
      setResultadosPractica([])
      return
    }
    if (!convenioId) {
      setResultadosPractica([])
      return
    }

    setError(null)
    setBuscandoPractica(true)
    try {
      const qs = new URLSearchParams({
        q: termino.trim(),
        convenioId: String(convenioId),
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

  useEffect(() => {
    const termino = busquedaPractica.trim()
    if (termino.length < 2 || !convenioDefecto) {
      setResultadosPractica([])
      return
    }

    const timer = setTimeout(() => {
      void buscarPractica(termino, convenioDefecto)
    }, 350)

    return () => clearTimeout(timer)
  }, [busquedaPractica, convenioDefecto])

  useEffect(() => {
    if (esEstrategiaGrupal && modoGeneracion !== 'AGRUPADA') {
      setModoGeneracion('AGRUPADA')
      return
    }

    if (esEstrategiaEstandar && modoGeneracion !== 'INDIVIDUAL') {
      setModoGeneracion('INDIVIDUAL')
    }
  }, [esEstrategiaEstandar, esEstrategiaGrupal, modoGeneracion])

  useEffect(() => {
    if (!esEstrategiaGrupal) return
    setPracticas((prev) => {
      if (prev.length <= 1) return prev
      const grupos = new Set(prev.map((p) => p.grupoOrden))
      if (grupos.size > 1) return prev
      return prev.map((p, idx) => ({ ...p, grupoOrden: idx + 1 }))
    })
  }, [esEstrategiaGrupal])

  const agregarPractica = (practica: NomencladorPracticaItem) => {
    const vals: ComponenteValores = {
      valorEspecialista: practica.valorEspecialista,
      valorAyudante: practica.valorAyudante,
      valorAnestesista: practica.valorAnestesista,
      valorGastos: practica.valorGastos,
      valorTotal: practica.valor,
    }
    const tieneDesglose =
      practica.valorEspecialista != null ||
      practica.valorAyudante != null ||
      practica.valorAnestesista != null ||
      practica.valorGastos != null

    if (tieneDesglose) {
      setPracticaPendiente(practica)
      setPendienteSeleccion(seleccionPorDefecto(vals))
      setResultadosPractica([])
      return
    }

    // Sin desglose: agregar directamente
    const matriculasDefault = resolverMatriculasDefault(
      admisionInicial?.tipoIngresoCodigo,
      null,
      null,
      matriculaEspecialistaInternacionDefault
    )
    setPracticas((prev) => {
      const nueva: ItemPractica = {
        _key: `${practica.convenioId}-${practica.codigo}-${Date.now()}`,
        convenioId: practica.convenioId,
        codigoPractica: practica.codigo,
        descripcionPractica: practica.descripcion,
        grupoOrden: esEstrategiaGrupal ? siguienteGrupoOrden(prev) : 1,
        cantidad: 1,
        tipoFacturacion: 'H',
        importeTotal: practica.valor ?? undefined,
        valorUnitario: practica.valor,
        matriculaEspecialista: matriculasDefault.matriculaEspecialista,
        matriculaAnestesista: matriculasDefault.matriculaAnestesista,
      }
      return [...prev, nueva]
    })
    setResultadosPractica([])
    setBusquedaPractica('')
  }

  const confirmarPracticaPendiente = () => {
    if (!practicaPendiente) return
    const vals: ComponenteValores = {
      valorEspecialista: practicaPendiente.valorEspecialista,
      valorAyudante: practicaPendiente.valorAyudante,
      valorAnestesista: practicaPendiente.valorAnestesista,
      valorGastos: practicaPendiente.valorGastos,
      valorTotal: practicaPendiente.valor,
    }
    const valorSeleccionado = calcularTotalSeleccionado(vals, pendienteSeleccion)
    const matriculasDefault = resolverMatriculasDefault(
      admisionInicial?.tipoIngresoCodigo,
      null,
      null,
      matriculaEspecialistaInternacionDefault
    )
    setPracticas((prev) => {
      const nueva: ItemPractica = {
        _key: `${practicaPendiente.convenioId}-${practicaPendiente.codigo}-${Date.now()}`,
        convenioId: practicaPendiente.convenioId,
        codigoPractica: practicaPendiente.codigo,
        descripcionPractica: practicaPendiente.descripcion,
        grupoOrden: esEstrategiaGrupal ? siguienteGrupoOrden(prev) : 1,
        cantidad: 1,
        tipoFacturacion: 'H',
        importeTotal: valorSeleccionado > 0 ? valorSeleccionado : undefined,
        valorUnitario: valorSeleccionado > 0 ? valorSeleccionado : null,
        desglose: {
          valorEspecialista: practicaPendiente.valorEspecialista,
          valorAyudante: practicaPendiente.valorAyudante,
          valorAnestesista: practicaPendiente.valorAnestesista,
          valorGastos: practicaPendiente.valorGastos,
        },
        seleccionComponentes: pendienteSeleccion,
        matriculaEspecialista: matriculasDefault.matriculaEspecialista,
        matriculaAnestesista: matriculasDefault.matriculaAnestesista,
      }
      return [...prev, nueva]
    })
    setPracticaPendiente(null)
    setBusquedaPractica('')
  }

  const agregarPracticaManual = () => {
    if (!busquedaPractica.trim()) return
    if (!convenioDefecto) {
      setError('Seleccioná una obra social antes de agregar una práctica')
      return
    }

    setError(null)
    const matriculasDefault = resolverMatriculasDefault(
      admisionInicial?.tipoIngresoCodigo,
      null,
      null,
      matriculaEspecialistaInternacionDefault
    )
    setPracticas((prev) => {
      const nueva: ItemPractica = {
        _key: `manual-${Date.now()}`,
        convenioId: convenioDefecto,
        codigoPractica: busquedaPractica.trim().slice(0, 8).toUpperCase(),
        descripcionPractica: busquedaPractica.trim(),
        grupoOrden: esEstrategiaGrupal ? siguienteGrupoOrden(prev) : 1,
        cantidad: 1,
        tipoFacturacion: 'H',
        valorUnitario: null,
        matriculaEspecialista: matriculasDefault.matriculaEspecialista,
        matriculaAnestesista: matriculasDefault.matriculaAnestesista,
      }
      return [...prev, nueva]
    })
    setResultadosPractica([])
    setBusquedaPractica('')
  }

  const quitarPractica = (key: string) => {
    setPracticas((prev) => prev.filter((p) => p._key !== key))
    setComponentGroupings((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setTitularPorPractica((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setDuplicadoPorPractica((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
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
          grupoOrden: esEstrategiaGrupal ? siguienteGrupoOrden(prev) : 1,
          cantidad: 1,
          tipoFacturacion: 'H',
          valorUnitario: null,
        },
        ...prev,
      ]
    })
    setError(null)
  }

  // Manejar cambios en checkboxes de agrupación
  const toggleComponentGrouping = (practiceKey: string, componentType: string) => {
    setComponentGroupings((prev) => {
      const newGroupings = { ...prev }
      const grouped = new Set(prev[practiceKey] || [])

      if (grouped.has(componentType)) {
        grouped.delete(componentType)
      } else {
        grouped.add(componentType)
      }

      if (grouped.size > 0) {
        newGroupings[practiceKey] = grouped
      } else {
        delete newGroupings[practiceKey]
      }

      return newGroupings
    })
  }

  // Obtener componentes agrupados para una práctica
  const getGroupedComponents = (practiceKey: string): Set<string> => {
    return componentGroupings[practiceKey] || new Set()
  }

  const getTitularPractica = (practiceKey: string): string => {
    return titularPorPractica[practiceKey] ?? 'HONORARIO ESPECIALISTA'
  }

  const getTitularGrupo = (grupo: number): string => {
    return titularPorGrupo[grupo] ?? 'HONORARIO ESPECIALISTA'
  }

  const getTituloAplicadoPractica = (practiceKey: string): string | undefined => {
    if (esEstrategiaGrupal) {
      const grupoPractica = practicas.find((p) => p._key === practiceKey)?.grupoOrden
      if (typeof grupoPractica === 'number' && grupoPractica > 0) {
        const tituloGrupo = titularPorGrupo[grupoPractica]?.trim()
        if (tituloGrupo) return tituloGrupo
      }
    }

    const tituloPorItem = titularPorPractica[practiceKey]?.trim()
    if (tituloPorItem) return tituloPorItem

    const tituloGlobal = tituloOrden.trim()
    return tituloGlobal || undefined
  }

  const esTituloAnestesista = (titulo: string | undefined): boolean => {
    return (titulo ?? '').toUpperCase().includes('ANESTESISTA')
  }

  const esTituloPatologia = (titulo: string | undefined): boolean => {
    return (titulo ?? '').toUpperCase().includes('PATOLOG')
  }

  const resolverEfectorMatricula = (
    p: ItemPractica,
    tipo: 'HE' | 'HA' | 'AGRUPADO',
    opciones?: { incluyeEspecialista?: boolean; incluyeAnestesista?: boolean; incluyeAyudante?: boolean }
  ): number | undefined => {
    const tituloAplicado = getTituloAplicadoPractica(p._key)

    if (esTituloAnestesista(tituloAplicado)) {
      return MATRICULA_ANESTESISTA_INT_DEFAULT
    }

    if (esTituloPatologia(tituloAplicado)) {
      const matriculaPatologia = matriculaPatologiaPorGrupo[p.grupoOrden]
      return matriculaPatologia != null && matriculaPatologia > 0 ? matriculaPatologia : undefined
    }

    if (tipo === 'HE') return p.matriculaEspecialista ?? undefined
    if (tipo === 'HA') return p.matriculaAnestesista ?? undefined

    if (opciones?.incluyeEspecialista) return p.matriculaEspecialista ?? undefined
    if (opciones?.incluyeAnestesista) return p.matriculaAnestesista ?? undefined
    if (opciones?.incluyeAyudante) return MATRICULA_AYUDANTE_DEFAULT
    return undefined
  }

  const getDatosPatologiaPractica = (practiceKey: string): { nombrePatologia?: string; matriculaPatologia?: number } => {
    const practica = practicas.find((p) => p._key === practiceKey)
    if (!practica) return {}

    const titulo = getTituloAplicadoPractica(practiceKey)
    if (!esTituloPatologia(titulo)) return {}

    const nombrePatologia = (nombrePatologiaPorGrupo[practica.grupoOrden] ?? '').trim()
    const matriculaPatologia = matriculaPatologiaPorGrupo[practica.grupoOrden]

    return {
      nombrePatologia: nombrePatologia.length > 0 ? nombrePatologia : undefined,
      matriculaPatologia:
        typeof matriculaPatologia === 'number' && Number.isFinite(matriculaPatologia) && matriculaPatologia > 0
          ? matriculaPatologia
          : undefined,
    }
  }

  const getDuplicadoPractica = (practiceKey: string): boolean => {
    return duplicadoPorPractica[practiceKey] ?? false
  }

  const getDuplicadoGrupo = (grupo: number): boolean => {
    return duplicadoPorGrupo[grupo] ?? false
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!paciente) return setError('Seleccioná un paciente')
    if (!obraSocialId) return setError('Seleccioná una obra social')
    if (!profesionalId) return setError('No hay profesionales disponibles para generar la autorización')
    if (practicas.length === 0) return setError('Agregá al menos una práctica')
    if (!esEstrategiaModular) {
      const faltaMatricula = practicas.find((p) => (
        ((p.seleccionComponentes?.especialista ?? 0) > 0 && !p.matriculaEspecialista) ||
        ((p.seleccionComponentes?.anestesista ?? 0) > 0 && !p.matriculaAnestesista)
      ))
      if (faltaMatricula) {
        return setError('Completá matrícula para HE/HA en todas las prácticas con esos componentes.')
      }
    }

    setSubmitting(true)
    try {
      const itemsOrdenBase: Array<OrdenPracticaItemInput & {
        grupoOrden: number
        titularModular?: string | null
        nombrePatologia?: string | null
        matriculaPatologia?: number | null
      }> = practicas.flatMap((p) => {
        const hasDesglose = Boolean(
          p.desglose && (
            p.desglose.valorEspecialista != null ||
            p.desglose.valorAyudante != null ||
            p.desglose.valorAnestesista != null ||
            p.desglose.valorGastos != null
          )
        )

        // Modo modular CON agrupaciones personalizadas
        if (esEstrategiaModular && hasDesglose && p.seleccionComponentes) {
          const componentes: OrdenPracticaItemInput[] = []
          const sel = p.seleccionComponentes
          const d = p.desglose
          const baseCantidad = Number(p.cantidad) > 0 ? Number(p.cantidad) : 1
          const grouped = getGroupedComponents(p._key)

          // Crear mapeo de componentes disponibles
          const componentesDisponibles: Record<string, { codigo: 'GA' | 'HE' | 'HA' | 'A1' | 'A2' | 'A3'; valor: number; count: number }> = {}

          if (sel.gastos > 0 && d?.valorGastos != null) {
            componentesDisponibles['gastos'] = { codigo: 'GA', valor: Number(d.valorGastos) * baseCantidad, count: 1 }
          }
          if (sel.especialista > 0 && d?.valorEspecialista != null) {
            componentesDisponibles['especialista'] = { codigo: 'HE', valor: Number(d.valorEspecialista) * baseCantidad, count: 1 }
          }
          if (sel.anestesista > 0 && d?.valorAnestesista != null) {
            componentesDisponibles['anestesista'] = { codigo: 'HA', valor: Number(d.valorAnestesista) * baseCantidad, count: 1 }
          }
          if (sel.ayudante > 0 && d?.valorAyudante != null) {
            const cantidadAyudantes = Math.min(sel.ayudante, 3)
            componentesDisponibles['ayudante'] = { codigo: 'A1', valor: Number(d.valorAyudante) * baseCantidad, count: cantidadAyudantes }
          }

          // Separar componentes en agrupados y no agrupados
          const agrupados: string[] = []
          const noAgrupados: string[] = []

          Object.keys(componentesDisponibles).forEach((comp) => {
            if (grouped.has(comp)) {
              agrupados.push(comp)
            } else {
              noAgrupados.push(comp)
            }
          })

          // Si hay componentes agrupados, crear una orden con ellos
          if (agrupados.length > 0) {
            const incluyCodigos: string[] = []
            let importeAgrupado = 0
            const titularModular = getTitularPractica(p._key)
            const imprimirPorDuplicado = getDuplicadoPractica(p._key)

            agrupados.forEach((comp) => {
              const compData = componentesDisponibles[comp]!
              incluyCodigos.push(compData.codigo)
              importeAgrupado += compData.valor
            })

            componentes.push({
              convenioId: p.convenioId,
              codigoPractica: p.codigoPractica,
              descripcionPractica: p.descripcionPractica,
              cantidad: baseCantidad,
              tipoFacturacion: 'H',
              incluyeCodigo: incluyCodigos.join('+') as any, // Múltiples códigos separados por +
              titularModular,
              imprimirPorDuplicado,
              efectorMatricula: resolverEfectorMatricula(p, 'AGRUPADO', {
                incluyeEspecialista: agrupados.includes('especialista'),
                incluyeAnestesista: agrupados.includes('anestesista'),
                incluyeAyudante: agrupados.includes('ayudante'),
              }),
              importeTotal: importeAgrupado,
            })
          }

          // Crear órdenes separadas para componentes no agrupados (comportamiento por defecto)
          if (sel.gastos > 0 && d?.valorGastos != null && noAgrupados.includes('gastos')) {
            componentes.push({
              convenioId: p.convenioId,
              codigoPractica: p.codigoPractica,
              descripcionPractica: p.descripcionPractica,
              cantidad: baseCantidad,
              tipoFacturacion: 'D',
              incluyeCodigo: 'GA',
              efectorMatricula: resolverEfectorMatricula(p, 'AGRUPADO'),
              importeTotal: Number(d.valorGastos) * baseCantidad,
            })
          }

          if (sel.especialista > 0 && d?.valorEspecialista != null && noAgrupados.includes('especialista')) {
            componentes.push({
              convenioId: p.convenioId,
              codigoPractica: p.codigoPractica,
              descripcionPractica: p.descripcionPractica,
              cantidad: baseCantidad,
              tipoFacturacion: 'H',
              incluyeCodigo: 'HE',
              efectorMatricula: resolverEfectorMatricula(p, 'HE'),
              importeTotal: Number(d.valorEspecialista) * baseCantidad,
            })
          }

          if (sel.anestesista > 0 && d?.valorAnestesista != null && noAgrupados.includes('anestesista')) {
            componentes.push({
              convenioId: p.convenioId,
              codigoPractica: p.codigoPractica,
              descripcionPractica: p.descripcionPractica,
              cantidad: baseCantidad,
              tipoFacturacion: 'H',
              incluyeCodigo: 'HA',
              efectorMatricula: resolverEfectorMatricula(p, 'HA'),
              importeTotal: Number(d.valorAnestesista) * baseCantidad,
            })
          }

          if (sel.ayudante > 0 && d?.valorAyudante != null && noAgrupados.includes('ayudante')) {
            const cantidadAyudantes = Math.min(sel.ayudante, 3)
            for (let i = 1; i <= cantidadAyudantes; i += 1) {
              const incluyeCodigo = (`A${i}`) as 'A1' | 'A2' | 'A3'
              componentes.push({
                convenioId: p.convenioId,
                codigoPractica: p.codigoPractica,
                descripcionPractica: p.descripcionPractica,
                cantidad: baseCantidad,
                tipoFacturacion: 'H',
                incluyeCodigo,
                efectorMatricula: MATRICULA_AYUDANTE_DEFAULT,
                importeTotal: Number(d.valorAyudante) * baseCantidad,
              })
            }
          }

          return (componentes.length > 0 ? componentes : [{
            convenioId: p.convenioId,
            codigoPractica: p.codigoPractica,
            descripcionPractica: p.descripcionPractica,
            cantidad: p.cantidad,
            tipoFacturacion: p.tipoFacturacion,
            importeTotal: p.valorUnitario != null ? p.valorUnitario * p.cantidad : p.importeTotal,
          }]).map((it) => ({
            ...it,
            practicaId: p.practicaId,
            grupoOrden: p.grupoOrden,
            titularModular: getTituloAplicadoPractica(p._key),
            ...getDatosPatologiaPractica(p._key),
          }))
        }

        // Modo modular SIN agrupaciones personalizadas (comportamiento original)
        if (!hasDesglose || !p.seleccionComponentes) {
          return [{
            convenioId: p.convenioId,
            codigoPractica: p.codigoPractica,
            descripcionPractica: p.descripcionPractica,
            cantidad: p.cantidad,
            tipoFacturacion: p.tipoFacturacion,
            importeTotal: p.valorUnitario != null ? p.valorUnitario * p.cantidad : p.importeTotal,
          }].map((it) => ({
            ...it,
            practicaId: p.practicaId,
            grupoOrden: p.grupoOrden,
            titularModular: getTituloAplicadoPractica(p._key),
            ...getDatosPatologiaPractica(p._key),
          }))
        }

        // Modo INDIVIDUAL: generar componentes separados (no modular)
        const componentes: OrdenPracticaItemInput[] = []
        const sel = p.seleccionComponentes
        const d = p.desglose
        const baseCantidad = Number(p.cantidad) > 0 ? Number(p.cantidad) : 1

        if (sel.gastos > 0 && d?.valorGastos != null) {
          componentes.push({
            convenioId: p.convenioId,
            codigoPractica: p.codigoPractica,
            descripcionPractica: p.descripcionPractica,
            cantidad: baseCantidad,
            tipoFacturacion: 'D',
            incluyeCodigo: 'GA',
            efectorMatricula: resolverEfectorMatricula(p, 'AGRUPADO'),
            importeTotal: Number(d.valorGastos) * baseCantidad,
          })
        }

        if (sel.especialista > 0 && d?.valorEspecialista != null) {
          componentes.push({
            convenioId: p.convenioId,
            codigoPractica: p.codigoPractica,
            descripcionPractica: p.descripcionPractica,
            cantidad: baseCantidad,
            tipoFacturacion: 'H',
            incluyeCodigo: 'HE',
            efectorMatricula: resolverEfectorMatricula(p, 'HE'),
            importeTotal: Number(d.valorEspecialista) * baseCantidad,
          })
        }

        if (sel.anestesista > 0 && d?.valorAnestesista != null) {
          componentes.push({
            convenioId: p.convenioId,
            codigoPractica: p.codigoPractica,
            descripcionPractica: p.descripcionPractica,
            cantidad: baseCantidad,
            tipoFacturacion: 'H',
            incluyeCodigo: 'HA',
            efectorMatricula: resolverEfectorMatricula(p, 'HA'),
            importeTotal: Number(d.valorAnestesista) * baseCantidad,
          })
        }

        if (sel.ayudante > 0 && d?.valorAyudante != null) {
          const cantidadAyudantes = Math.min(sel.ayudante, 3)
          for (let i = 1; i <= cantidadAyudantes; i += 1) {
            const incluyeCodigo = (`A${i}`) as 'A1' | 'A2' | 'A3'
            componentes.push({
              convenioId: p.convenioId,
              codigoPractica: p.codigoPractica,
              descripcionPractica: p.descripcionPractica,
              cantidad: baseCantidad,
              tipoFacturacion: 'H',
              incluyeCodigo,
              efectorMatricula: MATRICULA_AYUDANTE_DEFAULT,
              importeTotal: Number(d.valorAyudante) * baseCantidad,
            })
          }
        }

        if (componentes.length === 0) {
          return [{
            convenioId: p.convenioId,
            codigoPractica: p.codigoPractica,
            descripcionPractica: p.descripcionPractica,
            cantidad: p.cantidad,
            tipoFacturacion: p.tipoFacturacion,
            importeTotal: p.valorUnitario != null ? p.valorUnitario * p.cantidad : p.importeTotal,
          }].map((it) => ({
            ...it,
            practicaId: p.practicaId,
            grupoOrden: p.grupoOrden,
            titularModular: getTituloAplicadoPractica(p._key),
            ...getDatosPatologiaPractica(p._key),
          }))
        }

        return componentes.map((it) => ({
          ...it,
          practicaId: p.practicaId,
          grupoOrden: p.grupoOrden,
          titularModular: getTituloAplicadoPractica(p._key),
          ...getDatosPatologiaPractica(p._key),
        }))
      })

      const itemsOrden = itemsOrdenBase.map((item) => {
        if (esEstrategiaEstandar) {
          return {
            ...item,
            imprimirPorDuplicado: imprimirDuplicadoEstandar,
          }
        }

        if (esEstrategiaGrupal) {
          const grupo = Number.isFinite(Number(item.grupoOrden)) && Number(item.grupoOrden) > 0
            ? Math.floor(Number(item.grupoOrden))
            : 1
          return {
            ...item,
            imprimirPorDuplicado: getDuplicadoGrupo(grupo),
          }
        }

        return item
      })

      const result = await crearOrdenesDesdeAdmisionAction({
        ingresoId: admisionInicial?.id,
        pacienteId: admisionInicial?.paciente?.id ?? paciente.id,
        nombrePaciente: paciente.nombreCompleto.slice(0, 50),
        numeroAfiliado: admisionInicial?.numeroAfiliado ?? paciente.numeroAfiliado ?? '',
        obraSocialId: parseInt(obraSocialId, 10),
        profesionalId: parseInt(profesionalId, 10),
        tipoOrdenCodigo: 'PRA',
        descripcionPatologia: diagnostico || undefined,
        modoGeneracion: esEstrategiaGrupal ? 'AGRUPADA' : modoGeneracion,
        items: itemsOrden,
      })

      if ('error' in result && result.error) {
        setError(result.error)
      } else if ('ordenes' in result && Array.isArray(result.ordenes) && result.ordenes.length > 0) {
        if (result.ordenes.length === 1) {
          const primeraOrden = result.ordenes[0]!
          router.push(`/dashboard/ambulatorio/${primeraOrden.puestoNumero}/${primeraOrden.numero}`)
        } else {
          const ordenesParam = result.ordenes
            .map((o) => `${o.puestoNumero}-${o.numero}`)
            .join(',')
          router.push(`/dashboard/ambulatorio/imprimir?ordenes=${encodeURIComponent(ordenesParam)}`)
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

      {submitting && (
        <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando... generando las órdenes, espere por favor.
        </div>
      )}

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
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Médico para firma</h3>
        {esFlujoAdmision && (
          <p className="text-xs text-gray-600">
            Tratante en admisión:{' '}
            <span className="font-medium text-gray-900">
              {profesionalTratanteAdmision
                ? `${profesionalTratanteAdmision.nombre}${profesionalTratanteAdmision.matricula ? ` · MP ${profesionalTratanteAdmision.matricula}` : ''}`
                : 'Sin médico tratante cargado'}
            </span>
          </p>
        )}
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Profesional de la orden (opcional modificar)</label>
          <select
            value={profesionalId}
            onChange={(e) => setProfesionalId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- Seleccionar --</option>
            {profesionales.map((profesional) => (
              <option key={profesional.id} value={String(profesional.id)}>
                {profesional.nombre}{profesional.matricula ? ` · MP ${profesional.matricula}` : ''}
              </option>
            ))}
          </select>
        </div>
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
                if (e.key === 'Enter') { e.preventDefault(); void buscarPractica(busquedaPractica, convenioDefecto) }
              }}
              placeholder="Buscar práctica por código o descripción..."
              className="w-full rounded-md border border-gray-300 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              if (!convenioDefecto) {
                setError('Seleccioná una obra social antes de buscar prácticas')
                return
              }
              void buscarPractica(busquedaPractica, convenioDefecto)
            }}
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

        {practicaPendiente && (
          <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-700">
              <span className="font-mono text-gray-400 mr-1">{practicaPendiente.codigo.trim()}</span>
              {practicaPendiente.descripcion}
            </p>
            <ComponenteSelector
              valores={{
                valorEspecialista: practicaPendiente.valorEspecialista,
                valorAyudante: practicaPendiente.valorAyudante,
                valorAnestesista: practicaPendiente.valorAnestesista,
                valorGastos: practicaPendiente.valorGastos,
                valorTotal: practicaPendiente.valor,
              }}
              seleccion={pendienteSeleccion}
              onChange={setPendienteSeleccion}
            />
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={confirmarPracticaPendiente}
                className="flex items-center gap-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700"
              >
                <Check className="h-3.5 w-3.5" />
                Confirmar
              </button>
              <button
                type="button"
                onClick={() => { setPracticaPendiente(null); setBusquedaPractica('') }}
                className="text-xs text-gray-500 hover:text-gray-700 border rounded-lg px-3 py-1.5 hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {practicas.length > 0 ? (
          <div className="space-y-2">
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Código</th>
                    <th className="px-3 py-2 text-left">Práctica</th>
                    <th className="px-3 py-2 text-left">Subitem</th>
                    <th className="px-3 py-2 text-center w-20">Grupo</th>
                    <th className="px-3 py-2 text-right w-28">Precio</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {practicas.map((p) => (
                    <tr key={p._key} className="bg-white">
                      <td className="px-3 py-2 font-mono text-xs text-gray-600">
                        {p.codigoPractica.trim()}
                      </td>
                      <td className="px-3 py-2 text-gray-900">
                        {p.descripcionPractica}
                        {(p.seleccionComponentes?.especialista ?? 0) > 0 && (
                          <div className="mt-1 flex items-center gap-2 text-xs">
                            <span className="text-gray-500">Mat. HE</span>
                            <input
                              type="number"
                              min={1}
                              value={p.matriculaEspecialista ?? ''}
                              onChange={(e) => {
                                const value = e.target.value.trim()
                                setPracticas((prev) => prev.map((x) =>
                                  x._key === p._key
                                    ? { ...x, matriculaEspecialista: value ? parseInt(value, 10) || null : null }
                                    : x
                                ))
                              }}
                              className="w-24 rounded border border-gray-200 px-1 py-0.5 text-xs"
                              placeholder="Matrícula"
                            />
                          </div>
                        )}
                        {(p.seleccionComponentes?.anestesista ?? 0) > 0 && (
                          <div className="mt-1 flex items-center gap-2 text-xs">
                            <span className="text-gray-500">Mat. HA</span>
                            <input
                              type="number"
                              min={1}
                              value={p.matriculaAnestesista ?? ''}
                              onChange={(e) => {
                                const value = e.target.value.trim()
                                setPracticas((prev) => prev.map((x) =>
                                  x._key === p._key
                                    ? { ...x, matriculaAnestesista: value ? parseInt(value, 10) || null : null }
                                    : x
                                ))
                              }}
                              className="w-24 rounded border border-gray-200 px-1 py-0.5 text-xs"
                              placeholder="Matrícula"
                            />
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-700">
                        {obtenerSubitemsSeleccionados(p).join(' + ')}
                      </td>
                      <td className="px-3 py-2 text-center text-gray-600">
                        <input
                          type="number"
                          min={1}
                          value={p.grupoOrden}
                          onChange={(e) => {
                            const grupo = Math.max(1, Number.parseInt(e.target.value, 10) || 1)
                            setPracticas((prev) => prev.map((x) =>
                              x._key === p._key
                                ? { ...x, grupoOrden: grupo }
                                : x
                            ))
                          }}
                          className="w-16 rounded border border-gray-200 px-2 py-1 text-xs text-center"
                          title="Número de grupo"
                        />
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">
                        {p.valorUnitario != null ? formatoMoneda.format(p.valorUnitario) : '-'}
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
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4 border border-dashed rounded-md">
            Sin prácticas. Buscá una o agregala manualmente.
          </p>
        )}
      </div>

      {/* Estrategia de carga */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Estrategia</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEstrategiaOrden((prev) => (prev === 'MODULARIDAD' ? 'ESTANDAR' : 'MODULARIDAD'))}
            className={`rounded-md border px-3 py-2 text-sm ${esEstrategiaModular ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            Modularidad
          </button>
          <button
            type="button"
            onClick={() => setEstrategiaOrden((prev) => (prev === 'GRUPALIDAD' ? 'ESTANDAR' : 'GRUPALIDAD'))}
            className={`rounded-md border px-3 py-2 text-sm ${esEstrategiaGrupal ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            Grupalidad
          </button>
        </div>
        <p className="text-xs text-gray-500">Si no activás ninguna estrategia, queda el comportamiento estándar por defecto: una práctica/subitem por orden.</p>

        {esEstrategiaEstandar && (
          <label className="mt-1 inline-flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={imprimirDuplicadoEstandar}
              onChange={(e) => setImprimirDuplicadoEstandar(e.target.checked)}
              className="rounded"
            />
            Imprimir por duplicado todas las órdenes estándar
          </label>
        )}

        {esEstrategiaGrupal && practicas.length > 0 && (
          <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3 space-y-2">
            <p className="text-xs font-semibold text-blue-900 uppercase tracking-wide">Vista de grupos</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {Object.entries(practicasPorGrupo)
                .sort((a, b) => Number(a[0]) - Number(b[0]))
                .map(([grupo, items]) => (
                  <div key={grupo} className="rounded border border-blue-200 bg-white p-2">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-xs font-semibold text-blue-800">Grupo {grupo}</p>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <select
                          value={getTitularGrupo(Number(grupo))}
                          onChange={(e) => {
                            const grupoNumero = Number(grupo)
                            const nuevoTitulo = e.target.value
                            setTitularPorGrupo((prev) => ({ ...prev, [grupoNumero]: nuevoTitulo }))
                            if (esTituloAnestesista(nuevoTitulo)) {
                              setPracticas((prev) => prev.map((x) =>
                                x.grupoOrden === grupoNumero
                                  ? {
                                    ...x,
                                    matriculaEspecialista: MATRICULA_ANESTESISTA_INT_DEFAULT,
                                    matriculaAnestesista: MATRICULA_ANESTESISTA_INT_DEFAULT,
                                  }
                                  : x
                              ))
                            }
                          }}
                          className="rounded border px-2 py-1 text-xs font-bold uppercase"
                        >
                          <option value="HONORARIO ESPECIALISTA">HONORARIO ESPECIALISTA</option>
                          <option value="HONORARIO ANESTESISTA">HONORARIO ANESTESISTA</option>
                          <option value="PATOLOGÍA">PATOLOGÍA</option>
                          <option value="DERECHOS">DERECHOS</option>
                          <option value="HONORARIOS AYUDANTE">HONORARIOS AYUDANTE</option>
                        </select>
                        <label className="inline-flex items-center gap-1 text-[11px] text-blue-900">
                          <input
                            type="checkbox"
                            checked={getDuplicadoGrupo(Number(grupo))}
                            onChange={(e) => {
                              const grupoNumero = Number(grupo)
                              setDuplicadoPorGrupo((prev) => ({ ...prev, [grupoNumero]: e.target.checked }))
                            }}
                            className="rounded"
                          />
                          Imprimir por duplicado
                        </label>
                      </div>
                    </div>
                    {esTituloPatologia(getTitularGrupo(Number(grupo))) && (
                      <div className="mb-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={nombrePatologiaPorGrupo[Number(grupo)] ?? ''}
                          onChange={(e) => setNombrePatologiaPorGrupo((prev) => ({
                            ...prev,
                            [Number(grupo)]: e.target.value,
                          }))}
                          placeholder="Nombre del profesional"
                          className="rounded border border-gray-300 px-2 py-1 text-xs"
                        />
                        <input
                          type="number"
                          min={1}
                          value={matriculaPatologiaPorGrupo[Number(grupo)] ?? ''}
                          onChange={(e) => {
                            const raw = e.target.value.trim()
                            setMatriculaPatologiaPorGrupo((prev) => ({
                              ...prev,
                              [Number(grupo)]: raw ? Number.parseInt(raw, 10) || null : null,
                            }))
                          }}
                          placeholder="Matrícula profesional"
                          className="rounded border border-gray-300 px-2 py-1 text-xs"
                        />
                      </div>
                    )}
                    <div className="space-y-1">
                      {items.map((p) => (
                        <div key={p._key} className="rounded border border-gray-200 p-2 text-xs text-gray-700 space-y-1">
                          <div>
                            <span className="font-mono text-gray-500 mr-1">{p.codigoPractica.trim()}</span>
                            <span className="mr-1">{p.descripcionPractica}</span>
                            <span className="text-blue-700 font-medium">[{obtenerSubitemsSeleccionados(p).join(' + ')}]</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {esEstrategiaModular && (
          <div className="border rounded-md p-3 bg-blue-50/40 mt-2">
            <div className="mb-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">Opciones de agrupación</div>
            <div className="space-y-2">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-gray-700">Agrupar componentes seleccionados en la misma orden:</span>
                <div className="space-y-2 mt-1">
                  {practicas.map((p) => {
                    const componentesConCodigo: Array<{ label: string; key: string; tipoFacturacion: 'H' | 'D' }> = [
                      p.desglose?.valorEspecialista != null ? { label: 'HONORARIO ESPECIALISTA', key: 'especialista', tipoFacturacion: 'H' } : null,
                      p.desglose?.valorAnestesista != null ? { label: 'HONORARIO ANESTESISTA', key: 'anestesista', tipoFacturacion: 'H' } : null,
                      p.desglose?.valorAyudante != null ? { label: 'HONORARIOS AYUDANTE', key: 'ayudante', tipoFacturacion: 'H' } : null,
                      p.desglose?.valorGastos != null ? { label: 'DERECHOS', key: 'gastos', tipoFacturacion: 'D' } : null,
                    ].filter(Boolean) as Array<{ label: string; key: string; tipoFacturacion: 'H' | 'D' }>

                    const grouped = getGroupedComponents(p._key)

                    return (
                      <div key={p._key} className="border rounded px-2 py-1 bg-white/80">
                        <div className="font-mono text-xs text-blue-900 font-semibold mb-1">{p.codigoPractica.trim()} <span className="text-gray-500 font-normal">{p.descripcionPractica}</span></div>
                        {componentesConCodigo.length > 1 ? (
                          <div className="flex flex-wrap gap-2">
                            {componentesConCodigo.map((comp) => (
                              <label key={comp.key} className="flex items-center gap-1">
                                <input
                                  type="checkbox"
                                  checked={grouped.has(comp.key)}
                                  onChange={() => toggleComponentGrouping(p._key, comp.key)}
                                />
                                <span className="text-xs font-bold uppercase">{comp.label}</span>
                              </label>
                            ))}
                          </div>
                        ) : componentesConCodigo.length === 1 ? (
                          <span className="text-xs italic text-gray-500">{componentesConCodigo[0]!.label}</span>
                        ) : (
                          <span className="text-xs italic text-gray-400">Sin componentes agrupables</span>
                        )}

                        <label className="mt-2 flex items-center gap-2 text-xs text-gray-700">
                          <input
                            type="checkbox"
                            checked={getDuplicadoPractica(p._key)}
                            onChange={(e) => setDuplicadoPorPractica((prev) => ({ ...prev, [p._key]: e.target.checked }))}
                            className="rounded"
                          />
                          Imprimir esta práctica modular por duplicado
                        </label>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
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
          {submitting ? 'Cargando...' : 'Generar autorización'}
        </button>
      </div>
    </form>
  )
}
