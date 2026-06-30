"use client"
import { useDataSource } from "@/lib/use-patient-data"
import { Wifi, WifiOff } from "lucide-react"

export function DataSourceBanner() {
  const source = useDataSource()

  if (source === "firebase") {
    return (
      <div className="flex items-center gap-2 rounded-full border border-green-300 bg-green-50 px-3 py-1 text-xs font-medium text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400">
        <Wifi className="h-3 w-3" />
        Live — ML model scoring via Firebase
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-full border border-yellow-300 bg-yellow-50 px-3 py-1 text-xs font-medium text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-400">
      <WifiOff className="h-3 w-3" />
      Offline — run <code className="mx-1 font-mono text-[10px]">python start_recoverpath.py</code> to connect
    </div>
  )
}
