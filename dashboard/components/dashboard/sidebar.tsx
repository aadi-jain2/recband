"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  BellRing,
  BarChart3,
  LogOut,
  Activity,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/dashboard",           icon: LayoutDashboard, label: "Patient Overview" },
  { href: "/dashboard/alerts",    icon: BellRing,        label: "Active Alerts" },
  { href: "/dashboard/analytics", icon: BarChart3,       label: "Population Analytics" },
]

interface SidebarProps {
  alertCount?: number
}

export function Sidebar({ alertCount = 0 }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-gray-200 bg-[#0F4C81] dark:border-gray-800">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-[#1a5c93]">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#00B4A6]">
          <Activity className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-white leading-none">RecoverPath</p>
          <p className="text-xs text-blue-200 mt-0.5">Clinical Dashboard</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-white/15 text-white"
                  : "text-blue-100 hover:bg-white/10 hover:text-white",
              )}
            >
              <span className="flex items-center gap-3">
                <Icon className="h-4 w-4 flex-shrink-0" />
                {label}
              </span>
              {label === "Active Alerts" && alertCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                  {alertCount}
                </span>
              )}
              {active && <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-[#1a5c93] p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#00B4A6] text-xs font-bold text-white">
            CC
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-xs font-semibold text-white">Care Coordinator</p>
            <p className="truncate text-[10px] text-blue-200">Apollo Hospitals, Chennai</p>
          </div>
        </div>
        <button
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-blue-200 hover:bg-white/10 hover:text-white transition-colors"
          onClick={() => { window.location.href = "/login" }}
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
