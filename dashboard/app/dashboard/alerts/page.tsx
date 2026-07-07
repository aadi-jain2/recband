"use client"
import { useState } from "react"
import Link from "next/link"
import {
  CheckCheck, ExternalLink, Clock, ChevronRight,
  AlertOctagon, AlertTriangle, Info, BellOff,
} from "lucide-react"
import { useAlerts } from "@/lib/use-patient-data"
import { formatRelativeTime, formatDateTime } from "@/lib/time-utils"
import { cn } from "@/lib/utils"
import { useLiveMinute } from "@/lib/use-live-time"
import type { Alert, RiskTier } from "@/lib/types"

// ── Per-tier visual config ────────────────────────────────────────────────────
const TIER_CONFIG: Record<RiskTier, {
  label: string; border: string; bg: string; text: string; headerBg: string; Icon: React.ElementType
}> = {
  CRITICAL: {
    label: "Critical",
    border: "border-red-200",
    bg:     "bg-red-50",
    text:   "text-red-700",
    headerBg: "bg-red-600",
    Icon:   AlertOctagon,
  },
  HIGH: {
    label: "High",
    border: "border-amber-200",
    bg:     "bg-amber-50",
    text:   "text-amber-700",
    headerBg: "bg-amber-500",
    Icon:   AlertTriangle,
  },
  MEDIUM: {
    label: "Medium",
    border: "border-yellow-200",
    bg:     "bg-yellow-50",
    text:   "text-yellow-700",
    headerBg: "bg-yellow-500",
    Icon:   Info,
  },
  LOW: {
    label: "Low",
    border: "border-green-200",
    bg:     "bg-green-50",
    text:   "text-green-700",
    headerBg: "bg-green-600",
    Icon:   Info,
  },
}

// ── Single alert card ─────────────────────────────────────────────────────────
function AlertCard({
  alert, confirmId, setConfirmId, acknowledge,
}: {
  alert: Alert
  confirmId: string | null
  setConfirmId: (id: string | null) => void
  acknowledge: (id: string) => void
}) {
  const cfg = TIER_CONFIG[alert.riskTier]
  const ack = alert.acknowledged

  return (
    <div className={cn(
      "flex flex-col overflow-hidden rounded-[3px] border transition-opacity sm:flex-row sm:items-stretch",
      cfg.border,
      ack ? "opacity-40" : ""
    )}>
      {/* Severity left accent */}
      <div className={cn("hidden w-1 flex-shrink-0 sm:block", cfg.headerBg)} />
      <div className={cn("h-1 w-full flex-shrink-0 sm:hidden", cfg.headerBg)} />

      {/* Main content */}
      <div className="flex flex-1 flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-4">
        {/* Patient info */}
        <div className="min-w-0 sm:min-w-[160px]">
          <Link
            href={`/dashboard/patient/${alert.patientId}`}
            className="group flex items-center gap-1 font-semibold text-[#111827] hover:text-[#2563EB]"
          >
            {alert.patientName}
            <ExternalLink className="h-3 w-3 text-[#9CA3AF] opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
          <p className="text-[11px] text-[#9CA3AF] mt-0.5">{alert.patientId}</p>
          <span className={cn("mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold", cfg.bg, cfg.text)}>
            {cfg.label}
          </span>
        </div>

        {/* Alert message */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[#374151] leading-relaxed">{alert.message}</p>
          {ack && alert.acknowledgedAt && (
            <p className="mt-1 text-[11px] text-[#9CA3AF]">
              Acknowledged {formatRelativeTime(alert.acknowledgedAt)}
            </p>
          )}
        </div>

        {/* Time */}
        <div className="flex-shrink-0 sm:text-right">
          <p className="tabular text-xs font-semibold text-[#374151]">{formatRelativeTime(alert.timestamp)}</p>
          <p className="text-[10px] text-[#9CA3AF] mt-0.5">{formatDateTime(alert.timestamp).split(",")[1]?.trim() ?? ""}</p>
        </div>
      </div>

      {/* Action buttons */}
      {!ack && (
        <div className="flex flex-shrink-0 flex-row items-stretch divide-x divide-[#F3F4F6] border-t border-[#E5E7EB] sm:flex-col sm:divide-x-0 sm:divide-y sm:border-l sm:border-t-0">
          <Link
            href={`/dashboard/patient/${alert.patientId}`}
            className="flex items-center gap-1.5 px-4 py-3 text-xs font-medium text-[#2563EB] hover:bg-[#EFF6FF] transition-colors"
          >
            View Patient <ChevronRight className="h-3.5 w-3.5" />
          </Link>
          {confirmId === alert.id ? (
            <div className="flex">
              <button
                onClick={() => { acknowledge(alert.id); setConfirmId(null) }}
                className="flex-1 px-3 py-3 text-xs font-semibold text-green-700 hover:bg-green-50 transition-colors"
              >
                Confirm ✓
              </button>
              <button
                onClick={() => setConfirmId(null)}
                className="flex-1 px-3 py-3 text-xs text-[#6B7280] hover:bg-[#F9FAFB] transition-colors border-l border-[#F3F4F6]"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmId(alert.id)}
              className="flex items-center gap-1.5 px-4 py-3 text-xs text-[#6B7280] hover:bg-[#F9FAFB] transition-colors"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Resolve
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Severity section ──────────────────────────────────────────────────────────
function TierSection({
  tier, alerts, confirmId, setConfirmId, acknowledge,
}: {
  tier: RiskTier
  alerts: Alert[]
  confirmId: string | null
  setConfirmId: (id: string | null) => void
  acknowledge: (id: string) => void
}) {
  const cfg = TIER_CONFIG[tier]
  if (alerts.length === 0) return null

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-2 mb-2">
        <cfg.Icon className={cn("h-4 w-4", cfg.text)} />
        <h2 className={cn("text-sm font-bold", cfg.text)}>
          {cfg.label} — {alerts.length} alert{alerts.length !== 1 ? "s" : ""}
        </h2>
        <div className="flex-1 h-px bg-[#E5E7EB]" />
      </div>

      <div className="space-y-2">
        {alerts.map(a => (
          <AlertCard
            key={a.id}
            alert={a}
            confirmId={confirmId}
            setConfirmId={setConfirmId}
            acknowledge={acknowledge}
          />
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function AlertsPage() {
  const { alerts, loading, acknowledge } = useAlerts()
  const [showAck, setShowAck]       = useState(false)
  const [confirmId, setConfirmId]   = useState<string | null>(null)
  useLiveMinute()

  const active  = alerts.filter(a => !a.acknowledged)
  const acked   = alerts.filter(a =>  a.acknowledged)
  const visible = showAck ? alerts : active

  const critCount = visible.filter(a => a.riskTier === "CRITICAL").length
  const highCount = visible.filter(a => a.riskTier === "HIGH").length
  const medCount  = visible.filter(a => a.riskTier === "MEDIUM").length

  const tierGroups: RiskTier[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]

  return (
    <div className="flex h-full flex-col bg-[#F9FAFB]">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="border-b border-[#E5E7EB] bg-white content-pad py-3 sm:py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-base font-bold text-[#111827]">Clinical Alerts</h1>
            <div className="mt-1 flex items-center gap-3 text-xs">
              {active.length > 0 ? (
                <>
                  {critCount > 0 && <span className="font-semibold text-red-600">{critCount} CRITICAL</span>}
                  {highCount > 0 && <span className="font-semibold text-amber-600">{highCount} HIGH</span>}
                  {medCount  > 0 && <span className="font-semibold text-yellow-700">{medCount} MEDIUM</span>}
                  {active.length === 0 && <span className="text-[#9CA3AF]">All clear</span>}
                </>
              ) : (
                <span className="text-green-700 font-medium">All alerts resolved</span>
              )}
              <span className="text-[#D1D5DB]">·</span>
              <span className="text-[#9CA3AF]">{acked.length} acknowledged</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {active.length > 0 && (
              <button
                onClick={() => active.forEach(a => acknowledge(a.id))}
                className="flex items-center gap-1.5 rounded-[3px] border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Acknowledge all
              </button>
            )}
            <button
              onClick={() => setShowAck(p => !p)}
              className={cn(
                "flex items-center gap-1.5 rounded-[3px] border px-3 py-1.5 text-xs font-medium transition-colors",
                showAck
                  ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
                  : "border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F9FAFB]"
              )}
            >
              {showAck ? <><BellOff className="h-3.5 w-3.5" /> Hide acknowledged</> : "Show acknowledged"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Alert list ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto content-pad py-3 sm:py-5">
        {loading ? (
          <div className="space-y-3">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="h-20 rounded-[3px] border border-[#E5E7EB] bg-white animate-pulse" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <CheckCheck className="h-6 w-6 text-green-600" />
            </div>
            <p className="text-sm font-semibold text-[#374151]">No active alerts</p>
            <p className="text-xs text-[#9CA3AF]">All patients are within acceptable monitoring parameters.</p>
            {acked.length > 0 && !showAck && (
              <button
                onClick={() => setShowAck(true)}
                className="mt-2 text-xs text-[#2563EB] hover:underline"
              >
                Show {acked.length} acknowledged alert{acked.length !== 1 ? "s" : ""}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6 w-full">
            {tierGroups.map(tier => (
              <TierSection
                key={tier}
                tier={tier}
                alerts={visible.filter(a => a.riskTier === tier)}
                confirmId={confirmId}
                setConfirmId={setConfirmId}
                acknowledge={acknowledge}
              />
            ))}

            {/* Acknowledged section at the bottom */}
            {showAck && acked.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCheck className="h-4 w-4 text-[#9CA3AF]" />
                  <h2 className="text-sm font-bold text-[#9CA3AF]">
                    Acknowledged — {acked.length}
                  </h2>
                  <div className="flex-1 h-px bg-[#E5E7EB]" />
                </div>
                <div className="space-y-2">
                  {acked.map(a => (
                    <AlertCard
                      key={a.id}
                      alert={a}
                      confirmId={confirmId}
                      setConfirmId={setConfirmId}
                      acknowledge={acknowledge}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer summary ─────────────────────────────────────────────────── */}
      {!loading && alerts.length > 0 && (
        <div className="flex items-center justify-between border-t border-[#E5E7EB] bg-white px-3 py-2 text-[11px] text-[#9CA3AF] sm:px-6">
          <span>{active.length} active · {acked.length} acknowledged · {alerts.length} total</span>
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>Updates live</span>
          </div>
        </div>
      )}
    </div>
  )
}
