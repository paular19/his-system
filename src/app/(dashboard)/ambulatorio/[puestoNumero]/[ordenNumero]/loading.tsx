import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
    return (
        <div className="p-8 max-w-2xl mx-auto">
            <Skeleton className="h-8 w-1/2 mb-4" />
            <Skeleton className="h-6 w-full mb-2" />
            <Skeleton className="h-6 w-full mb-2" />
            <Skeleton className="h-6 w-2/3" />
        </div>
    )
}
