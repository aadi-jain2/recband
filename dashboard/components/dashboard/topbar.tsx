"use client"

import { Bell } from "lucide-react"

import Link from "next/link"

import { useState, useEffect } from "react"

import { format } from "date-fns"

import { useStats } from "@/lib/use-patient-data"



export function Topbar({ alertCount = 0 }: { alertCount?: number }) {

  const stats = useStats()

  const liveAlerts = stats.unacknowledgedAlerts ?? alertCount



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

  const shortClock = mounted && now ? format(now, "HH:mm") : "——:——"



  return (

    <header className="flex h-[var(--topbar-h)] shrink-0 items-center justify-between gap-2 border-b border-[#E5E7EB] bg-white content-pad">

      {/* Left: brand + hospital */}

      <div className="flex min-w-0 items-center gap-2 sm:gap-3">

        <span className="text-sm font-bold text-[#111827] sm:hidden">Korazia</span>

        <span className="hidden text-sm font-semibold text-[#111827] sm:inline">

          Apollo Hospitals — Remote Monitoring

        </span>

        {dateStr && (

          <span className="hidden text-xs text-[#9CA3AF] md:block">{dateStr}</span>

        )}

      </div>



      {/* Center: live clock */}

      <span

        className="font-mono text-xs tabular-nums text-[#6B7280] sm:text-sm"

        suppressHydrationWarning

      >

        <span className="sm:hidden">{shortClock}</span>

        <span className="hidden sm:inline">{clockStr}</span>

      </span>



      {/* Right: alerts + avatar */}

      <div className="flex shrink-0 items-center gap-2 sm:gap-4">

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

              <span className="hidden font-medium text-red-600 sm:inline">

                {liveAlerts} alert{liveAlerts > 1 ? "s" : ""}

              </span>

            </>

          ) : (

            <span className="hidden sm:inline">Alerts</span>

          )}

        </Link>



        <div className="hidden h-4 w-px bg-[#E5E7EB] sm:block" />



        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#111827] text-[10px] font-bold text-white">

          CC

        </div>

      </div>

    </header>

  )

}


