'use client'

export function PrintActions({
  imprimirLabel = 'Imprimir',
  volverLabel = 'Volver',
  volverHref = '/dashboard/admision',
}: {
  imprimirLabel?: string
  volverLabel?: string
  volverHref?: string
}) {
  return (
    <div className="no-print flex gap-3">
      <button
        onClick={() => window.print()}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        {imprimirLabel}
      </button>
      <button
        onClick={() => {
          window.location.assign(volverHref)
        }}
        className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        {volverLabel}
      </button>
    </div>
  )
}