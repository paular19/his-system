export default function LoadingAdmisionDetalle() {
  return (
    <div className="p-6 max-w-4xl space-y-5 animate-pulse">
      <div className="h-4 w-40 rounded bg-gray-200" />

      <div className="space-y-2">
        <div className="h-8 w-72 rounded bg-gray-200" />
        <div className="h-4 w-56 rounded bg-gray-100" />
      </div>

      <div className="his-card p-5 space-y-3">
        <div className="h-4 w-40 rounded bg-gray-200" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="h-12 rounded bg-gray-100" />
          <div className="h-12 rounded bg-gray-100" />
          <div className="h-12 rounded bg-gray-100" />
        </div>
      </div>

      <div className="his-card p-5 space-y-3">
        <div className="h-4 w-44 rounded bg-gray-200" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="h-12 rounded bg-gray-100" />
          <div className="h-12 rounded bg-gray-100" />
          <div className="h-12 rounded bg-gray-100" />
        </div>
      </div>

      <div className="his-card p-5 space-y-3">
        <div className="h-4 w-36 rounded bg-gray-200" />
        <div className="h-32 rounded bg-gray-100" />
      </div>
    </div>
  )
}
