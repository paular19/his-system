'use client'

import { Printer } from 'lucide-react'

interface PrintButtonProps {
    label?: string
    className?: string
}

export function PrintButton({ label = 'Imprimir', className = '' }: PrintButtonProps) {
    return (
        <button
            type="button"
            onClick={() => window.print()}
            className={className}
        >
            <Printer className="h-4 w-4" />
            {label}
        </button>
    )
}