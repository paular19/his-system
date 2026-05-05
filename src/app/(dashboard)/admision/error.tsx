'use client'

interface ErrorPageProps {
    error: Error & { digest?: string }
    reset: () => void
}

export default function ErrorAdmisionPage({ error, reset }: ErrorPageProps) {
    return (
        <div className="p-6">
            <div className="his-card p-5 space-y-3" role="alert" aria-live="assertive">
                <h2 className="text-base font-semibold text-red-700">No pudimos cargar la admisión</h2>
                <p className="text-sm text-gray-700">{error.message || 'Ocurrió un error inesperado.'}</p>
                <button
                    type="button"
                    onClick={reset}
                    className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                    Reintentar
                </button>
            </div>
        </div>
    )
}
