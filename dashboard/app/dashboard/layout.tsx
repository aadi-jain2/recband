import { Sidebar } from "@/components/dashboard/sidebar"
import { Topbar } from "@/components/dashboard/topbar"
import { DataSourceBanner } from "@/components/dashboard/data-source-banner"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      <Sidebar alertCount={0} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar alertCount={0} />
        <div className="flex items-center justify-end gap-3 border-b border-gray-100 bg-white px-6 py-1.5 dark:border-gray-800 dark:bg-gray-950">
          <DataSourceBanner />
        </div>
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
