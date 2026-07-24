type PerfValue = number | string

function fmt(value: PerfValue): string {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? `${value}ms` : 'NaN'
    }
    return value
}

export function logServerPerf(scope: string, metrics: Record<string, PerfValue>): void {
    if (process.env.HIS_PERF_LOG !== '1') return

    const body = Object.entries(metrics)
        .map(([key, value]) => `${key}=${fmt(value)}`)
        .join(' ')

    console.info(`[perf] ${scope} ${body}`)
}
