/**
 * Skeleton loaders — match the actual card/chart layouts.
 * Used while Firebase data is loading.
 */

export function PatientRowSkeleton() {
  return (
    <tr>
      <td className="text-[#9CA3AF] tabular-nums text-xs">—</td>
      <td>
        <div className="skeleton-shimmer h-3 w-32 rounded mb-1" />
        <div className="skeleton-shimmer h-2 w-20 rounded" />
      </td>
      <td><div className="skeleton-shimmer h-3 w-16 rounded" /></td>
      <td>
        <div className="flex items-center gap-2">
          <div className="skeleton-shimmer h-2.5 w-2.5 rounded-full" />
          <div className="skeleton-shimmer h-3 w-10 rounded" />
        </div>
      </td>
      <td><div className="skeleton-shimmer h-3 w-12 rounded" /></td>
      <td><div className="skeleton-shimmer h-3 w-8 rounded" /></td>
      <td><div className="skeleton-shimmer h-3 w-48 rounded" /></td>
      <td><div className="skeleton-shimmer h-3 w-20 rounded" /></td>
      <td />
    </tr>
  )
}

export function PatientTableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <PatientRowSkeleton key={i} />
      ))}
    </>
  )
}

export function VitalChartSkeleton() {
  return (
    <div className="panel" style={{ height: 120 }}>
      <div className="skeleton-shimmer h-2.5 w-20 rounded mb-3" />
      <div className="skeleton-shimmer w-full rounded" style={{ height: 80 }} />
    </div>
  )
}

export function KpiSkeleton() {
  return (
    <div className="flex items-center gap-8 border-b border-[#F3F4F6] px-6 py-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1">
          <div className="skeleton-shimmer h-5 w-10 rounded" />
          <div className="skeleton-shimmer h-2.5 w-16 rounded" />
        </div>
      ))}
    </div>
  )
}

export function EmptyReadings() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <div className="relative flex h-8 w-8">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#9CA3AF] opacity-30" />
        <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#F3F4F6]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        </span>
      </div>
      <p className="text-sm font-medium text-[#374151]">Waiting for first reading…</p>
      <p className="text-xs text-[#9CA3AF]">
        Connect your ESP32-C6 device or start the simulator to see live data.
      </p>
    </div>
  )
}
