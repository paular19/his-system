'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { cn } from '@/lib/utils'
import { ROLES, type RolHIS } from '@/lib/auth/rbac'
import {
  Users,
  ClipboardList,
  BedDouble,
  Stethoscope,
  Receipt,
  LayoutDashboard,
  CalendarClock,
  FilePlus,
  Loader2,
} from 'lucide-react'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  badge?: string
}

const NAV_ITEMS_DEFAULT: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Pacientes', href: '/dashboard/pacientes', icon: Users },
  { label: 'Admisión', href: '/dashboard/admision', icon: ClipboardList },
  { label: 'Internación', href: '/dashboard/internacion', icon: BedDouble },
  { label: 'Cirugía', href: '/dashboard/cirugia', icon: Stethoscope },
  { label: 'Turnos', href: '/dashboard/turnos', icon: CalendarClock },
  { label: 'Autorizaciones', href: '/dashboard/ambulatorio', icon: FilePlus },
  { label: 'Facturación', href: '/dashboard/facturacion', icon: Receipt },
]

const NAV_ITEMS_ADMISION: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Pacientes', href: '/dashboard/pacientes', icon: Users },
  { label: 'Admisión', href: '/dashboard/admision', icon: ClipboardList },
  { label: 'Internación', href: '/dashboard/internacion', icon: BedDouble },
  { label: 'Autorizaciones', href: '/dashboard/ambulatorio', icon: FilePlus },
  { label: 'Presupuesto', href: '/dashboard/cotizador', icon: Receipt },
]

const NAV_ITEMS_ORDENES: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Pacientes', href: '/dashboard/pacientes', icon: Users },
  { label: 'Admisión', href: '/dashboard/admision', icon: ClipboardList },
  { label: 'Internación', href: '/dashboard/internacion', icon: BedDouble },
  { label: 'Autorizaciones', href: '/dashboard/ambulatorio', icon: FilePlus },
]

interface SidebarProps {
  rol: RolHIS
}

export function Sidebar({ rol }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const navItems =
    rol === ROLES.ADMISION
      ? NAV_ITEMS_ADMISION
      : rol === ROLES.ORDENES
        ? NAV_ITEMS_ORDENES
        : NAV_ITEMS_DEFAULT
  const [hrefEnCurso, setHrefEnCurso] = useState<string | null>(null)
  const desbloqueoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const estaActivo = (href: string) => {
    return href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)
  }

  useEffect(() => {
    // Prefetch temprano para reducir latencia al navegar desde el menú.
    navItems.forEach((item) => {
      router.prefetch(item.href)
    })
  }, [navItems, router])

  useEffect(() => {
    if (!hrefEnCurso) return

    setHrefEnCurso(null)
    if (desbloqueoTimeoutRef.current) {
      clearTimeout(desbloqueoTimeoutRef.current)
      desbloqueoTimeoutRef.current = null
    }
  }, [pathname, hrefEnCurso])

  useEffect(() => {
    return () => {
      if (desbloqueoTimeoutRef.current) {
        clearTimeout(desbloqueoTimeoutRef.current)
      }
    }
  }, [])

  const onClickNav = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }

    // Si ya estamos exactamente en el destino, no hacer nada.
    // Si estamos en una subruta del modulo (ej: /dashboard/admision/91),
    // este click debe llevar al listado base del modulo.
    if (pathname === href) {
      event.preventDefault()
      return
    }

    event.preventDefault()

    setHrefEnCurso(href)

    if (typeof window !== 'undefined') {
      window.location.assign(href)
    }

    if (desbloqueoTimeoutRef.current) {
      clearTimeout(desbloqueoTimeoutRef.current)
    }

    desbloqueoTimeoutRef.current = setTimeout(() => {
      setHrefEnCurso((actual) => (actual === href ? null : actual))
      desbloqueoTimeoutRef.current = null
    }, 7000)
  }

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-gray-900 text-white flex flex-col z-30 print:hidden">
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
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = estaActivo(item.href)
          const estaCargandoItem = hrefEnCurso === item.href

          return (
            <a
              key={item.href}
              href={item.href}
              onMouseEnter={() => router.prefetch(item.href)}
              onClick={(event) => onClickNav(event, item.href)}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              )}
            >
              {estaCargandoItem ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <Icon className="h-4 w-4 shrink-0" />
              )}
              <span className="flex-1 truncate">{item.label}</span>
              {estaCargandoItem && (
                <span className="text-[10px] uppercase tracking-wide text-blue-100">Cargando</span>
              )}
              {item.badge && (
                <span className="ml-auto text-xs bg-blue-500 rounded-full px-1.5 py-0.5">
                  {item.badge}
                </span>
              )}
            </a>
          )
        })}
      </nav>

      {/* Pie del sidebar */}
      <div className="border-t border-gray-700 p-3">
        {hrefEnCurso && (
          <p className="text-[11px] text-blue-200 text-center mb-1">Navegando a nuevo módulo...</p>
        )}
        <p className="text-xs text-gray-500 text-center">v0.1.0 - Etapa 1</p>
      </div>
    </aside>
  )
}
