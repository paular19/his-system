export default function NuevaInternacionLoading() {
    return (
        <div className="p-6 max-w-4xl space-y-4 animate-pulse">
            {/* Breadcrumb */}
            <div className="h-4 w-48 bg-gray-200 rounded" />

            {/* Card: Paciente */}
            <div className="his-card p-5 space-y-4">
                <div className="h-4 w-32 bg-gray-200 rounded" />
                <div className="h-9 bg-gray-100 rounded-lg" />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="h-8 bg-gray-100 rounded" />
                    <div className="h-8 bg-gray-100 rounded" />
                    <div className="h-8 bg-gray-100 rounded" />
                </div>
            </div>

            {/* Card: Admisión */}
            <div className="his-card p-5 space-y-4">
                <div className="h-4 w-40 bg-gray-200 rounded" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <div className="h-3 w-24 bg-gray-200 rounded" />
                        <div className="h-9 bg-gray-100 rounded-lg" />
                    </div>
                    <div className="space-y-1.5">
                        <div className="h-3 w-24 bg-gray-200 rounded" />
                        <div className="h-9 bg-gray-100 rounded-lg" />
                    </div>
                    <div className="space-y-1.5">
                        <div className="h-3 w-24 bg-gray-200 rounded" />
                        <div className="h-9 bg-gray-100 rounded-lg" />
                    </div>
                    <div className="space-y-1.5">
                        <div className="h-3 w-24 bg-gray-200 rounded" />
                        <div className="h-9 bg-gray-100 rounded-lg" />
                    </div>
                </div>
            </div>

            {/* Card: Cobertura */}
            <div className="his-card p-5 space-y-4">
                <div className="h-4 w-36 bg-gray-200 rounded" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <div className="h-3 w-20 bg-gray-200 rounded" />
                        <div className="h-9 bg-gray-100 rounded-lg" />
                    </div>
                    <div className="space-y-1.5">
                        <div className="h-3 w-16 bg-gray-200 rounded" />
                        <div className="h-9 bg-gray-100 rounded-lg" />
                    </div>
                    <div className="space-y-1.5">
                        <div className="h-3 w-28 bg-gray-200 rounded" />
                        <div className="h-9 bg-gray-100 rounded-lg" />
                    </div>
                </div>
            </div>

            {/* Card: Observaciones */}
            <div className="his-card p-5 space-y-3">
                <div className="h-4 w-28 bg-gray-200 rounded" />
                <div className="h-20 bg-gray-100 rounded-lg" />
            </div>

            {/* Botón */}
            <div className="flex justify-end">
                <div className="h-9 w-40 bg-gray-200 rounded-lg" />
            </div>
        </div>
    )
}
