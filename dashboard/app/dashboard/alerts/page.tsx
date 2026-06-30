"use client"
import { useState } from "react"
import Link from "next/link"
import { BellRing, CheckCheck, ExternalLink, Clock, Filter } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { RiskBadge } from "@/components/dashboard/risk-badge"
import { useAlerts } from "@/lib/use-patient-data"
import { formatRelativeTime, cn } from "@/lib/utils"

export default function AlertsPage() {
  const { alerts, loading, acknowledge } = useAlerts()
  const [showAcknowledged, setShowAcknowledged] = useState(false)

  const visible = showAcknowledged ? alerts : alerts.filter(a => !a.acknowledged)
  const unreadCount = alerts.filter(a => !a.acknowledged).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <BellRing className="h-6 w-6 text-red-500" />
            Active Alerts
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {unreadCount} unacknowledged alerts across all patients
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAcknowledged(v => !v)}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              showAcknowledged
                ? "border-gray-400 bg-gray-100 text-gray-700"
                : "border-gray-300 text-gray-500 hover:border-gray-400",
            )}
          >
            <Filter className="h-3 w-3" />
            {showAcknowledged ? "Hiding acknowledged" : "Show acknowledged"}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex gap-4">
        {[
          { label: "CRITICAL", count: alerts.filter(a => a.riskTier === "CRITICAL" && !a.acknowledged).length, color: "bg-red-500" },
          { label: "HIGH",     count: alerts.filter(a => a.riskTier === "HIGH"     && !a.acknowledged).length, color: "bg-orange-500" },
          { label: "Acknowledged (24hr)", count: alerts.filter(a => a.acknowledged).length, color: "bg-gray-400" },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-2">
            <div className={`h-2.5 w-2.5 rounded-full ${s.color}`} />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{s.count}</span>
            <span className="text-xs text-gray-400">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Alert feed */}
      <div className="space-y-3">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))
          : visible.length === 0
          ? (
            <Card>
              <CardContent className="flex flex-col items-center py-16 text-gray-400">
                <CheckCheck className="mb-3 h-10 w-10 text-green-400" />
                <p className="text-base font-medium">All caught up</p>
                <p className="text-sm">No unacknowledged alerts</p>
              </CardContent>
            </Card>
          )
          : visible.map(alert => (
            <div
              key={alert.id}
              className={cn(
                "rounded-xl border p-4 transition-all",
                alert.acknowledged
                  ? "border-gray-200 bg-gray-50 opacity-60 dark:border-gray-800 dark:bg-gray-900"
                  : alert.riskTier === "CRITICAL"
                    ? "border-red-300 bg-red-50/60 dark:border-red-800 dark:bg-red-950/20 shadow-sm"
                    : "border-orange-200 bg-orange-50/50 dark:border-orange-800 dark:bg-orange-950/20",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {/* Pulse indicator */}
                  {!alert.acknowledged && (
                    <div className="relative mt-0.5 flex-shrink-0">
                      <div className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        alert.riskTier === "CRITICAL" ? "bg-red-500" : "bg-orange-500",
                      )} />
                      {alert.riskTier === "CRITICAL" && (
                        <div className="absolute inset-0 h-2.5 w-2.5 animate-ping rounded-full bg-red-400 opacity-75" />
                      )}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                        {alert.patientName}
                      </span>
                      <span className="text-xs text-gray-400">{alert.patientId}</span>
                      <RiskBadge tier={alert.riskTier} />
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{alert.message}</p>
                    <div className="mt-1.5 flex items-center gap-1 text-xs text-gray-400">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(alert.timestamp)}
                      {alert.acknowledgedAt && (
                        <span className="ml-2 text-green-600">
                          · Acknowledged {formatRelativeTime(alert.acknowledgedAt)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-shrink-0 gap-2">
                  <Link href={`/dashboard/patient/${alert.patientId}`}>
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7">
                      <ExternalLink className="h-3 w-3" /> View Patient
                    </Button>
                  </Link>
                  {!alert.acknowledged && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="gap-1.5 text-xs h-7"
                      onClick={() => acknowledge(alert.id)}
                    >
                      <CheckCheck className="h-3 w-3" /> Acknowledge
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  )
}
