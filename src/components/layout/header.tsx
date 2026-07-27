'use client'

import { UserButton } from '@clerk/nextjs'
import { Bell, BookOpenText } from 'lucide-react'
import type { MouseEvent } from 'react'

interface HeaderProps {
  titulo: string
}

export function Header({ titulo }: HeaderProps) {
  const onClickGuia = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }

    event.preventDefault()
    window.location.assign('/dashboard/guia')
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-white px-6 shadow-sm print:hidden">
      <h1 className="text-base font-semibold text-gray-900 truncate">{titulo}</h1>

      <div className="flex items-center gap-3">
        <a
          href="/dashboard/guia"
          onClick={onClickGuia}
          className="relative rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          aria-label="Guia del sistema"
          title="Guia del sistema"
        >
          <BookOpenText className="h-5 w-5" />
        </a>
        <button
          type="button"
          className="relative rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          aria-label="Notificaciones"
        >
          <Bell className="h-5 w-5" />
        </button>
        <UserButton afterSignOutUrl="/sign-in" />
      </div>
    </header>
  )
}
