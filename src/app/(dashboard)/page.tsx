import { Header } from '@/components/layout/header'
import { Users, BedDouble, ClipboardList, Activity } from 'lucide-react'

const stats = [
  {
    label: 'Pacientes registrados',
    value: '-',
    icon: Users,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    label: 'Internados hoy',
    value: '-',
    icon: BedDouble,
    color: 'text-green-600',
    bg: 'bg-green-50',
  },
  {
    label: 'Admisiones hoy',
    value: '-',
    icon: ClipboardList,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
  },
  {
    label: 'Turnos pendientes',
    value: '-',
    icon: Activity,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
  },
]

export default function DashboardPage() {
  return (
    <>
      <Header titulo="Dashboard" />
      <div className="p-6 space-y-6">
        {/* Bienvenida */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            Bienvenido al Sistema HIS
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Sistema de Información Hospitalaria - Etapa 1
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => {
            const Icon = stat.icon
            return (
              <div
                key={stat.label}
                className="his-card p-5 flex items-center gap-4"
              >
                <div className={`rounded-lg p-3 ${stat.bg}`}>
                  <Icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Accesos rápidos */}
        <div className="his-card p-5">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Accesos rápidos</h3>
          <div className="flex flex-wrap gap-2">
            <a
              href="/dashboard/pacientes/nuevo"
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <Users className="h-4 w-4" />
              Nuevo Paciente
            </a>
            <a
              href="/dashboard/admision"
              className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
            >
              <ClipboardList className="h-4 w-4" />
              Nueva Admisión
            </a>
          </div>
        </div>
      </div>
    </>
  )
}
