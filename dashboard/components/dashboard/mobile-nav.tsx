"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Users, Bell, BarChart2 } from "lucide-react"
import { cn } from "@/lib/utils"

export function MobileNav() {
  const path = usePathname()

  const links = [
    { href: "/dashboard",           label: "Patients",  Icon: Users     },
    { href: "/dashboard/alerts",    label: "Alerts",    Icon: Bell      },
    { href: "/dashboard/analytics", label: "Analytics", Icon: BarChart2 },
  ]

  return (
    <nav className="mobile-nav sm:hidden">
      {links.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium text-[#9CA3AF]",
            path === href && "text-[#2563EB]"
          )}
        >
          <Icon className="h-5 w-5" />
          {label}
        </Link>
      ))}
    </nav>
  )
}
