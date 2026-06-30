"use client"
import { Bell, Sun, Moon } from "lucide-react"
import { useState } from "react"
import { format } from "date-fns"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface TopbarProps {
  alertCount?: number
}

export function Topbar({ alertCount = 0 }: TopbarProps) {
  const [dark, setDark] = useState(false)

  const toggleDark = () => {
    setDark(d => !d)
    document.documentElement.classList.toggle("dark")
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6 dark:border-gray-800 dark:bg-gray-950">
      <div>
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Apollo Hospitals — Remote Monitoring Unit
        </p>
        <p className="text-xs text-gray-500">
          {format(new Date(), "EEEE, d MMMM yyyy")}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Link href="/dashboard/alerts" className="relative">
          <Bell className={cn("h-5 w-5", alertCount > 0 ? "text-red-500" : "text-gray-500 hover:text-gray-700")} />
          {alertCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
              {alertCount > 9 ? "9+" : alertCount}
            </span>
          )}
        </Link>
        <button
          onClick={toggleDark}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <div className="h-4 w-px bg-gray-200" />
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0F4C81] text-[10px] font-bold text-white">
          CC
        </div>
      </div>
    </header>
  )
}
