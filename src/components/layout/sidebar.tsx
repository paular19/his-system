'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Users,
  ClipboardList,
  BedDouble,
  Stethoscope,
  Receipt,
  Calculator,
  LayoutDashboard,
  FileText,
  ShieldCheck,
  Activity,
  CalendarClock,
  FilePlus,
} from 'lucide-react'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  badge?: string
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Pacientes', href: '/dashboard/pacientes', icon: Users },
  { label: 'Admisión', href: '/dashboard/admision', icon: ClipboardList },
  { label: 'Internación', href: '/dashboard/internacion', icon: BedDouble },
  { label: 'Turnos', href: '/dashboard/turnos', icon: CalendarClock },
  { label: 'Autorizaciones', href: '/dashboard/ambulatorio', icon: FilePlus },
  { label: 'Historia Clínica', href: '/dashboard/historia-clinica', icon: FileText },
  { label: 'Facturación', href: '/dashboard/facturacion', icon: Receipt },
  { label: 'Caja', href: '/dashboard/caja', icon: Calculator },
  { label: 'Cotizador', href: '/dashboard/cotizador', icon: Activity },
  { label: 'Auditoría', href: '/dashboard/auditoria', icon: ShieldCheck },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-gray-900 text-white flex flex-col z-30">
      {/* Logo / Cabecera */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-700">
        <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-sm">HIS</span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">Sistema HIS</p>
          <p className="text-xs text-gray-400 truncate">Gestión Hospitalaria</p>
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href as any}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.badge && (
                <span className="ml-auto text-xs bg-blue-500 rounded-full px-1.5 py-0.5">
                  {item.badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Pie del sidebar */}
      <div className="border-t border-gray-700 p-3">
        <p className="text-xs text-gray-500 text-center">v0.1.0 - Etapa 1</p>
      </div>
    </aside>
  )
}
