import { Sidebar } from "@/components/dashboard/sidebar"
import { Topbar } from "@/components/dashboard/topbar"
import { DataSourceBanner } from "@/components/dashboard/data-source-banner"
import { MobileNav } from "@/components/dashboard/mobile-nav"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white sm:flex-row">
      {/* Sidebar — hidden below sm breakpoint */}
      <div className="hidden sm:block">
        <Sidebar alertCount={0} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar alertCount={0} />
        <DataSourceBanner />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] sm:pb-0">
          {children}
        </main>
      </div>
      {/* Mobile bottom nav — only on small screens */}
      <MobileNav />
    </div>
  )
}
