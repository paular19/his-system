import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
    return (
        <div className="p-6 space-y-4" aria-busy="true" aria-live="polite">
            <Skeleton className="h-10 w-full max-w-xl mb-4" />
            <div className="his-card p-6">
                <Skeleton className="h-8 w-1/2 mb-4" />
                <Skeleton className="h-6 w-full mb-2" />
                <Skeleton className="h-6 w-full mb-2" />
                <Skeleton className="h-6 w-2/3" />
            </div>
        </div>
    )
}
