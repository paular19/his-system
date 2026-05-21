import React from 'react'

export function Skeleton({ className = '' }: { className?: string }) {
    return (
        <div className={`bg-gray-100 animate-pulse rounded ${className}`} />
    )
}

export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
    return (
        <div className={className}>
            {Array.from({ length: lines }).map((_, i) => (
                <div key={i} className="h-4 bg-gray-100 rounded mb-2 animate-pulse w-full" />
            ))}
        </div>
    )
}
