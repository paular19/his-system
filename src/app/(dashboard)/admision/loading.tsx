import { Header } from '@/components/layout/header'

export default function LoadingAdmisionPage() {
    return (
        <>
            <Header titulo="Admisión" />
            <div className="p-6 space-y-4" aria-live="polite" aria-busy="true">
                <div className="h-10 w-full max-w-xl rounded-md bg-gray-100 animate-pulse" />
                <div className="his-card overflow-hidden">
                    <div className="h-14 w-full border-b bg-gray-50" />
                    <div className="space-y-2 p-4">
                        <div className="h-10 w-full rounded bg-gray-100 animate-pulse" />
                        <div className="h-10 w-full rounded bg-gray-100 animate-pulse" />
                        <div className="h-10 w-full rounded bg-gray-100 animate-pulse" />
                    </div>
                </div>
            </div>
        </>
    )
}
