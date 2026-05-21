import { Header } from '@/components/layout/header'

export default function FichaPacienteLoading() {
    return (
        <>
            <Header titulo="Cargando paciente..." />
            <div className="p-6 max-w-4xl space-y-5 animate-pulse">
                <div className="h-4 w-40 rounded bg-gray-200" />

                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                        <div className="h-7 w-64 rounded bg-gray-200" />
                        <div className="h-4 w-48 rounded bg-gray-100" />
                    </div>
                    <div className="h-10 w-32 rounded-md bg-gray-200" />
                </div>

                <div className="his-card p-5 space-y-4">
                    <div className="h-4 w-40 rounded bg-gray-200" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="h-14 rounded bg-gray-100" />
                        <div className="h-14 rounded bg-gray-100" />
                        <div className="h-14 rounded bg-gray-100" />
                        <div className="h-14 rounded bg-gray-100" />
                        <div className="h-14 rounded bg-gray-100" />
                        <div className="h-14 rounded bg-gray-100" />
                    </div>
                </div>

                <div className="his-card p-5 space-y-4">
                    <div className="h-4 w-32 rounded bg-gray-200" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="h-14 rounded bg-gray-100" />
                        <div className="h-14 rounded bg-gray-100" />
                        <div className="h-14 rounded bg-gray-100" />
                    </div>
                </div>

                <div className="his-card p-5 space-y-4">
                    <div className="h-4 w-40 rounded bg-gray-200" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="h-14 rounded bg-gray-100" />
                        <div className="h-14 rounded bg-gray-100" />
                    </div>
                </div>
            </div>
        </>
    )
}
