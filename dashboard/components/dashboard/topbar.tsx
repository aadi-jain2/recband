"use client"
import { Bell } from "lucide-react"
import Link from "next/link"
import { useState, useEffect } from "react"
import { format } from "date-fns"
import { useStats } from "@/lib/use-patient-data"

export function Topbar({ alertCount = 0 }: { alertCount?: number }) {
  const stats = useStats()
  const liveAlerts = stats.unacknowledgedAlerts ?? alertCount

  // Mount-only clock — avoids SSR/client hydration mismatch
  const [mounted, setMounted] = useState(false)
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setMounted(true)
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const dateStr  = mounted && now ? format(now, "EEEE, d MMMM yyyy") : ""
  const clockStr = mounted && now ? format(now, "HH:mm:ss") : "——:——:——"

  return (
    <header className="flex h-11 shrink-0 items-center justify-between border-b border-[#E5E7EB] bg-white px-6">
      {/* Left: hospital name + date */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-[#111827]">
          Apollo Hospitals — Remote Monitoring
        </span>
        {dateStr && (
          <span className="hidden text-xs text-[#9CA3AF] sm:block">{dateStr}</span>
        )}
      </div>

      {/* Center: live clock — suppressHydrationWarning so React skips the mismatch */}
      <span
        className="hidden font-mono text-sm tabular-nums text-[#6B7280] sm:block"
        suppressHydrationWarning
      >
        {clockStr}
      </span>

      {/* Right: alerts + avatar */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/alerts"
          className="relative flex items-center gap-1.5 text-xs text-[#6B7280] hover:text-[#111827]"
        >
          <Bell className="h-4 w-4" />
          {liveAlerts > 0 ? (
            <>
              <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white leading-none">
                {liveAlerts > 9 ? "9+" : liveAlerts}
              </span>
              <span className="text-red-600 font-medium">
                {liveAlerts} alert{liveAlerts > 1 ? "s" : ""}
              </span>
            </>
          ) : (
            <span>Alerts</span>
          )}
        </Link>

        <div className="h-4 w-px bg-[#E5E7EB]" />

        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#111827] text-[10px] font-bold text-white">
          CC
        </div>
      </div>
    </header>
  )
}
