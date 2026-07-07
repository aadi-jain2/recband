"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, BellRing, BarChart3, LogOut, Activity } from "lucide-react"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/dashboard",           icon: LayoutDashboard, label: "Patients"   },
  { href: "/dashboard/alerts",    icon: BellRing,        label: "Alerts"     },
  { href: "/dashboard/analytics", icon: BarChart3,       label: "Analytics"  },
]

export function Sidebar({ alertCount = 0 }: { alertCount?: number }) {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-52 shrink-0 flex-col border-r border-[#E5E7EB] bg-white">
      {/* Brand */}
      <div className="flex items-center gap-2 border-b border-[#E5E7EB] px-4 py-3.5">
        <Activity className="h-4 w-4 text-[#2563EB]" />
        <div>
          <p className="text-sm font-bold text-[#111827] leading-none">Korazia</p>
          <p className="text-[10px] text-[#9CA3AF] mt-0.5 uppercase tracking-wide">Clinical Monitor</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-2 py-3">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center justify-between rounded-[3px] px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-[#EFF6FF] text-[#2563EB] font-semibold"
                  : "text-[#6B7280] hover:bg-[#F9FAFB] hover:text-[#111827]"
              )}
            >
              <span className="flex items-center gap-2.5">
                <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                {label}
              </span>
              {label === "Alerts" && alertCount > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {alertCount > 9 ? "9+" : alertCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-[#E5E7EB] px-2 py-3">
        <button
          onClick={() => { window.location.href = "/login" }}
          className="flex w-full items-center gap-2 rounded-[3px] px-3 py-2 text-xs text-[#6B7280] hover:bg-[#F9FAFB] hover:text-[#111827] transition-colors"
        >
          <LogOut className="h-3 w-3" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
