"use client"
import { useState, useEffect } from "react"
import { use } from "react"
import Link from "next/link"
import {
  ArrowLeft, Heart, Wind, Droplets, Activity, Mic2,
  AlertTriangle, Calendar, Phone, CheckCircle2, XCircle,
  Clock, Pill, Home, Car, DollarSign, BookOpen, Utensils,
  FileText, Stethoscope, AlertCircle, TrendingUp, TrendingDown,
  Minus, Zap,
} from "lucide-react"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea,
} from "recharts"
import { ArcGauge } from "@/components/dashboard/arc-gauge"
import { EmptyReadings } from "@/components/dashboard/skeletons"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { usePatient } from "@/lib/use-patient-data"
import { cn } from "@/lib/utils"
import {
  formatRelativeTime, formatChartTime, formatDateTime, formatClockTime, sortByTimestampAsc,
} from "@/lib/time-utils"
import { useLiveMinute } from "@/lib/use-live-time"
import type { VitalReading } from "@/lib/types"
import { PATIENT_REGISTRY, buildFallbackPatients } from "@/lib/mock-data"
import { buildAdherenceState }  from "@/lib/adherence-simulator"
import { buildFollowUpState }   from "@/lib/followup-simulator"
import { SDOH_PROFILES }        from "@/lib/sdoh-types"

interface PageProps { params: Promise<{ id: string }> }
type Tab = "overview" | "vitals" | "adherence" | "social" | "notes"

const C = {
  spo2: "#2563EB", hr: "#DC2626", hrv: "#7C3AED",
  bioz: "#0891B2", rr: "#D97706", cough: "#CA8A04",
}

const TIER_COLOR: Record<string, string> = {
  CRITICAL: "#DC2626", HIGH: "#D97706", MEDIUM: "#CA8A04", LOW: "#16A34A",
}
const TIER_BG: Record<string, string> = {
  CRITICAL: "#FEF2F2", HIGH: "#FFFBEB", MEDIUM: "#FEFCE8", LOW: "#F0FDF4",
}

function prepareChartVitals(vitals: VitalReading[], every = 1) {
  const sorted = sortByTimestampAsc(vitals)
  // Adaptive decimation: show up to 120 points
  const step = Math.max(1, Math.floor(sorted.length / 120))
  return sorted.filter((_, i) => i % (every * step) === 0).map(v => ({
    ...v,
    t:       formatChartTime(v.timestamp),
    tooltip: formatDateTime(v.timestamp),
  }))
}

// ── Line chart with shaded normal range ──────────────────────────────────────
function VitalChart({
  data, dataKey, color, label, unit, refLo, refHi, normalLo, normalHi,
}: {
  data: ReturnType<typeof prepareChartVitals>
  dataKey: keyof VitalReading
  color: string; label: string; unit: string
  refLo?: number; refHi?: number
  normalLo?: number; normalHi?: number
}) {
  if (data.length === 0) {
    return (
      <div className="rounded-[3px] border border-[#E5E7EB] p-3">
        <p className="text-xs font-semibold text-[#111827] mb-2">{label}</p>
        <div className="flex h-full items-center justify-center chart-h-sm">
          <span className="text-xs text-[#9CA3AF]">No data</span>
        </div>
      </div>
    )
  }
  return (
    <div className="rounded-[3px] border border-[#E5E7EB] p-3">
      <p className="text-xs font-semibold text-[#111827] mb-2">{label}</p>
      <div className="chart-wrap chart-h-sm">
        <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="0" stroke="#F3F4F6" vertical={false} />
          <XAxis dataKey="t" tick={{ fontSize: 9, fill: "#9CA3AF" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 9, fill: "#9CA3AF" }} tickLine={false} axisLine={false} width={32} />
          <Tooltip
            contentStyle={{ fontSize: 11, border: "1px solid #E5E7EB", borderRadius: 3, padding: "4px 8px", background: "#fff" }}
            formatter={(v: unknown) => [`${Number(v).toFixed(1)} ${unit}`, label]}
            labelFormatter={(_l, pl) => pl?.[0]?.payload?.tooltip ?? ""}
          />
          {normalLo !== undefined && normalHi !== undefined && (
            <ReferenceArea y1={normalLo} y2={normalHi} fill="#16A34A" fillOpacity={0.07} strokeOpacity={0} />
          )}
          {refLo !== undefined && (
            <ReferenceLine y={refLo} stroke="#EF4444" strokeDasharray="3 2" strokeOpacity={0.5}
              label={{ value: `↓${refLo}`, fontSize: 8, fill: "#EF4444", position: "insideTopLeft" }} />
          )}
          {refHi !== undefined && (
            <ReferenceLine y={refHi} stroke="#EF4444" strokeDasharray="3 2" strokeOpacity={0.5}
              label={{ value: `↑${refHi}`, fontSize: 8, fill: "#EF4444", position: "insideTopLeft" }} />
          )}
          <Line type="monotone" dataKey={dataKey as string} stroke={color} strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: color }} />
        </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── Composite risk breakdown bars ─────────────────────────────────────────────
function ComponentBar({ clinical, behavioral, social }: { clinical: number; behavioral: number; social: number }) {
  const rows = [
    { label: "Clinical",    score: clinical,    color: "#2563EB", weight: "55%" },
    { label: "Behavioral",  score: behavioral,  color: "#D97706", weight: "30%" },
    { label: "Social",      score: social,      color: "#7C3AED", weight: "15%" },
  ]
  return (
    <div className="space-y-2.5">
      {rows.map(r => (
        <div key={r.label} className="flex items-center gap-2 text-xs">
          <span className="w-20 text-[#6B7280]">{r.label}</span>
          <div className="flex-1 h-1.5 rounded-full bg-[#F3F4F6] overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${r.score}%`, background: r.color }} />
          </div>
          <span className="tabular w-6 text-right text-[#111827] font-semibold">{Math.round(r.score)}</span>
          <span className="w-8 text-right text-[#9CA3AF] text-[10px]">{r.weight}</span>
        </div>
      ))}
    </div>
  )
}

// ── KPI tile used in the live stats strip ─────────────────────────────────────
function VitalKpi({
  icon: Icon, label, value, unit, ok, trend,
}: {
  icon: React.ElementType; label: string; value: string | number; unit: string; ok?: boolean; trend?: "up" | "down" | "flat"
}) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus
  return (
    <div className={cn(
      "flex min-w-[max(4.5rem,18vw)] flex-shrink-0 flex-col items-center justify-center gap-0.5 px-[clamp(0.5rem,2vw,0.75rem)] py-2.5 text-center sm:flex-1 sm:min-w-0",
      ok === false ? "bg-red-50" : "bg-white"
    )}>
      <div className="flex items-center gap-1">
        <Icon className={cn("h-3.5 w-3.5", ok === false ? "text-red-500" : "text-[#6B7280]")} />
        <span className="text-[10px] text-[#9CA3AF] font-medium tracking-wide uppercase">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={cn("tabular text-xl font-bold leading-none", ok === false ? "text-red-600" : "text-[#111827]")}>
          {value}
        </span>
        <span className="text-[10px] text-[#9CA3AF]">{unit}</span>
        {trend && <TrendIcon className={cn("h-3 w-3", trend === "up" ? "text-red-400" : trend === "down" ? "text-blue-400" : "text-[#D1D5DB]")} />}
      </div>
    </div>
  )
}

// ── Loading skeleton ───────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[#E5E7EB] px-6 py-3">
        <Skeleton className="h-5 w-48 mb-1.5" />
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="border-b border-[#E5E7EB] bg-[#F9FAFB] px-6 py-2">
        <div className="flex gap-6">
          {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-16" />)}
        </div>
      </div>
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function PatientDetailPage({ params }: PageProps) {
  const { id }  = use(params)
  const { patient, loading } = usePatient(id)
  const [tab, setTab]   = useState<Tab>("overview")
  const [notes, setNotes] = useState("")
  useLiveMinute()

  const reg       = PATIENT_REGISTRY[id]
  const adherence = reg ? buildAdherenceState(id, reg.diagnosis, reg.dischargeDate) : null
  const followup  = reg ? buildFollowUpState(id, reg.diagnosis, reg.dischargeDate)  : null
  const sdoh      = SDOH_PROFILES[id] ?? null

  useEffect(() => {
    if (patient?.careCoordinatorNotes) setNotes(patient.careCoordinatorNotes)
  }, [patient?.careCoordinatorNotes])

  if (loading) return <LoadingSkeleton />

  const p = patient ?? buildFallbackPatients().find(x => x.id === id)
  if (!p) return (
    <div className="flex h-64 items-center justify-center text-sm text-[#6B7280]">
      Patient {id} not found.{" "}
      <Link href="/dashboard" className="ml-2 text-[#2563EB] underline">← Back</Link>
    </div>
  )

  const allVitals      = sortByTimestampAsc(p.vitals)
  const latest         = allVitals[allVitals.length - 1]
  const prev           = allVitals[allVitals.length - 5]   // 5 readings back ≈ trend
  const vitalsData     = prepareChartVitals(p.vitals)

  const clinicalScore  = p.compositeRisk?.clinical_score   ?? p.riskScore
  const behavioralScore = p.compositeRisk?.behavioral_score ?? 0
  const socialScore    = p.compositeRisk?.social_score     ?? (sdoh ? Number(sdoh.social_risk_score) : 0)
  const explanation    = p.compositeRisk?.explanation      ?? ""
  const nonClinFlag    = p.compositeRisk?.flagged_by_nonclinical ?? false
  const isLiveDevice   = p.dataSource === "esp32_live" || p.dataSource === "hardware"
  const tierColor      = TIER_COLOR[p.riskTier] ?? "#9CA3AF"
  const tierBg         = TIER_BG[p.riskTier]   ?? "#F9FAFB"

  // Live vitals from the most recent reading
  const spo2  = latest?.spo2     ?? null
  const hr    = latest?.hrEcg    ?? null
  const rr    = latest?.rrImu    ?? null
  const bioz  = latest?.biozOhms ?? null
  const hrv   = latest?.hrvSdnn  ?? null
  const cough = latest?.coughCount ?? null

  // Trend direction — compare latest vs 5-readings-ago
  const spo2Trend  = !prev || !latest ? "flat" : latest.spo2  < prev.spo2  - 0.3 ? "down" : latest.spo2  > prev.spo2  + 0.3 ? "up" : "flat"
  const hrTrend    = !prev || !latest ? "flat" : latest.hrEcg > prev.hrEcg + 1   ? "up"  : latest.hrEcg < prev.hrEcg - 1   ? "down" : "flat"

  // Threshold alarms
  const spo2Low  = spo2  !== null && spo2  < 92
  const hrHigh   = hr    !== null && hr    > 100
  const rrHigh   = rr    !== null && rr    > 20
  const hrnLow   = hrv   !== null && hrv   < 20

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: "overview",   label: "Overview"    },
    { key: "vitals",     label: "Vitals",      badge: vitalsData.length },
    { key: "adherence",  label: "Adherence"   },
    { key: "social",     label: "Social Risk" },
    { key: "notes",      label: "Care Notes"  },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">

      {/* ── Identity header ────────────────────────────────────────────────── */}
      <div className="border-b border-[#E5E7EB] bg-white content-pad py-3">
        <div className="flex items-start gap-3">
          <Link href="/dashboard" className="mt-0.5 text-[#6B7280] hover:text-[#2563EB]">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-bold text-[#111827]">{p.name}</h1>
              <span className="text-xs text-[#9CA3AF]">{p.id}</span>
              <span className="text-[#D1D5DB]">·</span>
              <span className="text-sm text-[#374151]">{p.age}y</span>
              <span className="text-[#D1D5DB]">·</span>
              <span className="text-sm font-medium text-[#374151]">{p.diagnosis}</span>
              <span className="text-[#D1D5DB]">·</span>
              <span className="text-sm text-[#6B7280]">D+{p.daysSinceDischarge}</span>
              {/* Risk tier pill inline */}
              <span
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold"
                style={{ color: tierColor, background: tierBg, border: `1px solid ${tierColor}33` }}
              >
                {p.riskTier} · {Math.round(p.riskScore)}
              </span>
              {isLiveDevice ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
                  </span>
                  Live Device
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#E5E7EB] bg-[#F9FAFB] px-2 py-0.5 text-[10px] text-[#9CA3AF]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#D1D5DB]" />
                  Simulated
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-[#9CA3AF]" title={p.lastUpdated}>
              Last reading {formatClockTime(p.lastUpdated)} · {formatRelativeTime(p.lastUpdated)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Live vitals strip — always visible, updates every 60s ────────── */}
      <div className="border-b border-[#E5E7EB] bg-white">
        {latest ? (
          <div className="flex overflow-x-auto divide-x divide-[#F3F4F6]">
            <VitalKpi icon={Droplets}  label="SpO2"       value={spo2  !== null ? spo2.toFixed(1)  : "—"} unit="%"    ok={!spo2Low}  trend={spo2Trend as "up"|"down"|"flat"} />
            <VitalKpi icon={Heart}     label="Heart Rate" value={hr    !== null ? Math.round(hr)    : "—"} unit="bpm"  ok={!hrHigh}   trend={hrTrend as "up"|"down"|"flat"} />
            <VitalKpi icon={Wind}      label="Resp Rate"  value={rr    !== null ? rr.toFixed(1)     : "—"} unit="brpm" ok={!rrHigh} />
            <VitalKpi icon={Activity}  label="HRV SDNN"   value={hrv   !== null ? Math.round(hrv)   : "—"} unit="ms"   ok={!hrnLow} />
            <VitalKpi icon={Droplets}  label="BioZ (Ω)"   value={bioz  !== null ? bioz.toFixed(0)   : "—"} unit="Ω" />
            <VitalKpi icon={Mic2}      label="Cough"      value={cough !== null ? cough.toFixed(0)  : "—"} unit="" />
            {/* Reading age */}
            <div className="flex flex-shrink-0 flex-col items-center justify-center px-4 py-2 gap-0.5">
              <span className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Reading</span>
              <span className="text-xs font-semibold text-[#374151]" title={latest.timestamp}>
                {formatRelativeTime(latest.timestamp)}
              </span>
              {allVitals.length > 0 && (
                <span className="text-[9px] text-[#D1D5DB]">{allVitals.length} pts</span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-6 py-2.5 text-xs text-[#9CA3AF]">
            <div className="relative h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#D1D5DB] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#D1D5DB]" />
            </div>
            Waiting for first reading — start the simulator or connect ESP32-C6 device
          </div>
        )}
      </div>

      {/* ── Tab bar ────────────────────────────────────────────────────────── */}
      <div className="tab-scroll flex border-b border-[#E5E7EB] bg-white content-pad">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors sm:px-4",
              tab === t.key
                ? "border-[#2563EB] text-[#2563EB]"
                : "border-transparent text-[#6B7280] hover:text-[#374151] hover:border-[#E5E7EB]"
            )}
          >
            {t.label}
            {t.badge !== undefined && t.badge > 0 && (
              <span className="rounded-full bg-[#F3F4F6] px-1.5 text-[10px] text-[#6B7280]">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">

        {/* ═══════════ OVERVIEW ════════════════════════════════════════════ */}
        {tab === "overview" && (
          <div className="content-pad py-3 sm:py-5 w-full">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(10rem,1fr)_minmax(0,2fr)_minmax(0,2fr)]">

              {/* Col 1: Arc gauge */}
              <div className="flex flex-col gap-3">
                <div className="rounded-[3px] border border-[#E5E7EB] p-4 flex flex-col items-center">
                  <p className="text-xs font-semibold text-[#6B7280] mb-1 self-start">Composite Risk</p>
                  <ArcGauge score={p.riskScore} tier={p.riskTier} />
                </div>
                <div className="rounded-[3px] border border-[#E5E7EB] p-3">
                  <p className="text-[11px] font-semibold text-[#374151] mb-2">Components</p>
                  <ComponentBar clinical={clinicalScore} behavioral={behavioralScore} social={socialScore} />
                </div>
              </div>

              {/* Col 2: Alerts + explanation */}
              <div className="flex flex-col gap-3">
                {/* Active alerts */}
                <div className="rounded-[3px] border border-[#E5E7EB]">
                  <div className="flex items-center justify-between border-b border-[#F3F4F6] px-3 py-2">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-[#374151]">
                      <AlertCircle className="h-3.5 w-3.5 text-[#9CA3AF]" />
                      Active Alerts
                    </span>
                    <span className="rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[10px] font-semibold text-[#6B7280]">
                      {p.triggeredAlerts.length}
                    </span>
                  </div>
                  <div className="divide-y divide-[#F9FAFB]">
                    {p.triggeredAlerts.length === 0 ? (
                      <p className="px-3 py-4 text-xs text-[#9CA3AF]">No active alerts.</p>
                    ) : p.triggeredAlerts.map((alert, i) => (
                      <div key={i} className="flex items-start gap-2.5 px-3 py-2.5">
                        <div className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full"
                          style={{ background: i === 0 && p.riskTier === "CRITICAL" ? "#DC2626" : i === 0 ? "#D97706" : "#D1D5DB" }} />
                        <p className="text-xs text-[#374151] leading-relaxed">{alert}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recommended action */}
                <div className="rounded-[3px] border border-[#E5E7EB] p-3 flex items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#EFF6FF]">
                    <Phone className="h-3.5 w-3.5 text-[#2563EB]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[#374151]">Recommended Action</p>
                    <p className="text-xs text-[#6B7280] mt-0.5 leading-relaxed">{p.recommendedAction}</p>
                  </div>
                  <Button
                    size="sm"
                    className="flex-shrink-0 h-7 rounded-[3px] bg-[#2563EB] text-xs text-white hover:bg-[#1D4ED8]"
                  >
                    Call Now
                  </Button>
                </div>

                {/* Non-clinical flag */}
                {nonClinFlag && (
                  <div className="flex items-start gap-2.5 rounded-[3px] border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600 mt-0.5" />
                    <p className="text-xs text-amber-800 leading-relaxed">
                      <span className="font-semibold">Non-clinical risk flag.</span>{" "}
                      Vitals are within normal range. Risk is driven by behavioral/social factors.
                      Consider a care coordinator call today.
                    </p>
                  </div>
                )}
              </div>

              {/* Col 3: Risk explanation */}
              <div className="flex flex-col gap-3">
                <div className="rounded-[3px] border border-[#E5E7EB]">
                  <div className="flex items-center gap-1.5 border-b border-[#F3F4F6] px-3 py-2">
                    <Stethoscope className="h-3.5 w-3.5 text-[#9CA3AF]" />
                    <span className="text-xs font-semibold text-[#374151]">Clinical Assessment</span>
                  </div>
                  <div className="p-3">
                    {explanation ? (
                      <p className="font-mono text-[11px] text-[#374151] leading-relaxed whitespace-pre-wrap">{explanation}</p>
                    ) : (
                      // Auto-generate a brief note from current vitals when no ML explanation
                      <div className="space-y-1.5 text-xs text-[#374151] leading-relaxed">
                        {spo2Low    && <p>• <span className="font-semibold text-red-600">SpO2 {spo2?.toFixed(1)}%</span> — below threshold of 92%. Monitor respiratory status closely.</p>}
                        {hrHigh     && <p>• <span className="font-semibold text-red-600">Heart rate {hr ? Math.round(hr) : "—"} bpm</span> — elevated above 100. Review fluid status and medication.</p>}
                        {rrHigh     && <p>• <span className="font-semibold text-amber-600">Resp rate {rr?.toFixed(1)} brpm</span> — above normal (≤20). Check for respiratory distress.</p>}
                        {hrnLow     && <p>• <span className="font-semibold text-amber-600">HRV SDNN {hrv?.toFixed(1)} ms</span> — reduced cardiac variability. Possible autonomic stress.</p>}
                        {!spo2Low && !hrHigh && !rrHigh && !hrnLow && latest && (
                          <p className="text-[#6B7280]">All measured vitals within acceptable range. Continue routine monitoring.</p>
                        )}
                        {!latest && <p className="text-[#9CA3AF]">No readings available — connect a device or start the simulator.</p>}
                        {p.compositeRisk?.behavioral_score !== undefined && p.compositeRisk.behavioral_score > 40 && (
                          <p>• Behavioral score elevated ({Math.round(p.compositeRisk.behavioral_score)}) — review medication adherence.</p>
                        )}
                        {sdoh && Number(sdoh.social_risk_score) > 50 && (
                          <p>• Social risk score {sdoh.social_risk_score} — {sdoh.social_risk_factors.slice(0,2).join(", ")}. Consider social work referral.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Quick demo stats cards */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-[3px] border border-[#E5E7EB] p-2.5 text-center">
                    <p className="text-lg font-bold tabular text-[#111827]">{allVitals.length}</p>
                    <p className="text-[10px] text-[#9CA3AF]">Readings in window</p>
                  </div>
                  <div className="rounded-[3px] border border-[#E5E7EB] p-2.5 text-center">
                    <p className="text-lg font-bold tabular text-[#111827]">{p.daysSinceDischarge}d</p>
                    <p className="text-[10px] text-[#9CA3AF]">Post-discharge</p>
                  </div>
                  <div className="rounded-[3px] border border-[#E5E7EB] p-2.5 text-center">
                    <p className="text-lg font-bold tabular" style={{ color: tierColor }}>{Math.round(clinicalScore)}</p>
                    <p className="text-[10px] text-[#9CA3AF]">Clinical score</p>
                  </div>
                  <div className="rounded-[3px] border border-[#E5E7EB] p-2.5 text-center">
                    <p className="text-lg font-bold tabular text-[#7C3AED]">{Math.round(behavioralScore)}</p>
                    <p className="text-[10px] text-[#9CA3AF]">Behavioral score</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════ VITALS ══════════════════════════════════════════════ */}
        {tab === "vitals" && (
          <div className="content-pad py-3 sm:py-5 w-full">
            {vitalsData.length === 0 ? (
              <div className="rounded-[3px] border border-[#E5E7EB] p-8">
                <EmptyReadings />
              </div>
            ) : (
              <>
                {/* 6-up current values */}
                <div className="mb-4 grid grid-cols-3 divide-x divide-[#E5E7EB] rounded-[3px] border border-[#E5E7EB] overflow-hidden sm:grid-cols-6">
                  {[
                    { label: "SpO2",      val: spo2?.toFixed(1),  unit: "%",    warn: spo2Low  },
                    { label: "Heart Rate", val: hr ? Math.round(hr).toString() : null, unit: "bpm", warn: hrHigh },
                    { label: "HRV SDNN",  val: hrv ? Math.round(hrv).toString() : null, unit: "ms", warn: hrnLow },
                    { label: "BioZ",      val: bioz?.toFixed(0),  unit: "Ω",    warn: false    },
                    { label: "Resp Rate", val: rr?.toFixed(1),    unit: "brpm", warn: rrHigh   },
                    { label: "Cough",     val: cough?.toFixed(0), unit: "",     warn: false    },
                  ].map(k => (
                    <div key={k.label} className={cn("p-3 text-center", k.warn ? "bg-red-50" : "bg-white")}>
                      <p className={cn("tabular text-xl font-bold", k.warn ? "text-red-600" : "text-[#111827]")}>
                        {k.val ?? "—"}
                      </p>
                      <p className="text-[10px] text-[#9CA3AF]">{k.label}</p>
                      {k.warn && <p className="text-[9px] text-red-500 font-semibold mt-0.5">ALERT</p>}
                    </div>
                  ))}
                </div>

                <p className="mb-3 text-xs text-[#9CA3AF]">
                  {vitalsData.length} readings shown ·{" "}
                  {vitalsData[0]?.tooltip} → {vitalsData[vitalsData.length - 1]?.tooltip}
                </p>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <VitalChart data={vitalsData} dataKey="spo2"       color={C.spo2}  label="SpO2 (%)"           unit="%"    refLo={92}  normalLo={95}  normalHi={100} />
                  <VitalChart data={vitalsData} dataKey="hrEcg"      color={C.hr}    label="Heart Rate (bpm)"    unit="bpm"  refHi={100} normalLo={60}  normalHi={100} />
                  <VitalChart data={vitalsData} dataKey="hrvSdnn"    color={C.hrv}   label="HRV SDNN (ms)"       unit="ms"   refLo={20}  normalLo={25}  normalHi={80}  />
                  <VitalChart data={vitalsData} dataKey="biozOhms"   color={C.bioz}  label="Bioimpedance (Ω)"    unit="Ω"                normalLo={300} normalHi={500} />
                  <VitalChart data={vitalsData} dataKey="rrImu"      color={C.rr}    label="Resp Rate (brpm)"    unit="brpm" refHi={20}  normalLo={12}  normalHi={20}  />
                  <VitalChart data={vitalsData} dataKey="coughCount" color={C.cough} label="Cough Count"          unit="" />
                </div>

                {/* Anomaly scores */}
                <div className="mt-3 rounded-[3px] border border-[#E5E7EB] p-3">
                  <p className="text-xs font-semibold text-[#374151] mb-3">Isolation Forest Anomaly Scores</p>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {Object.entries(p.anomalyScores).map(([k, v]) => (
                      <div key={k}>
                        <div className="flex items-baseline justify-between mb-1">
                          <span className="text-[11px] capitalize text-[#6B7280]">{k}</span>
                          <span className="tabular text-sm font-bold text-[#111827]">{(v * 100).toFixed(0)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[#F3F4F6] overflow-hidden">
                          <div className="h-full rounded-full" style={{
                            width: `${v * 100}%`,
                            background: v > 0.75 ? "#DC2626" : v > 0.5 ? "#D97706" : "#16A34A",
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══════════ ADHERENCE ═══════════════════════════════════════════ */}
        {tab === "adherence" && (
          <div className="content-pad py-3 space-y-3 sm:py-5 w-full">
            {adherence ? (
              <>
                {/* Summary bar */}
                <div className="grid grid-cols-1 divide-y divide-[#E5E7EB] rounded-[3px] border border-[#E5E7EB] overflow-hidden sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                  {[
                    {
                      label: "7-day adherence",
                      value: `${Math.round(adherence.overall_pct_7d * 100)}%`,
                      warn: adherence.overall_pct_7d < 0.8,
                    },
                    {
                      label: "Consecutive misses",
                      value: String(adherence.critical_missed_streak),
                      warn: adherence.critical_missed_streak >= 2,
                    },
                    {
                      label: "Medications",
                      value: String(adherence.medications.length),
                      warn: false,
                    },
                  ].map(s => (
                    <div key={s.label} className={cn("p-3 text-center", s.warn ? "bg-red-50" : "bg-white")}>
                      <p className={cn("tabular text-2xl font-bold", s.warn ? "text-red-600" : "text-[#111827]")}>{s.value}</p>
                      <p className="text-[10px] text-[#9CA3AF] mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>

                {adherence.critical_missed_streak >= 2 && (
                  <div className="flex items-start gap-2.5 rounded-[3px] border border-red-200 bg-red-50 px-3 py-2.5">
                    <Zap className="h-4 w-4 flex-shrink-0 text-red-500 mt-0.5" />
                    <p className="text-xs text-red-800 font-medium">
                      {adherence.critical_missed_streak} consecutive missed critical medication doses — immediate follow-up required.
                    </p>
                  </div>
                )}

                {/* 7-day calendar heatmap */}
                <div className="rounded-[3px] border border-[#E5E7EB] p-3">
                  <p className="text-xs font-semibold text-[#374151] mb-2.5">7-Day Adherence Heatmap</p>
                  <div className="flex gap-2">
                    {adherence.daily_summary_7d.slice(-7).map((d, i) => {
                      const pct = d.pct
                      const bg  = pct >= 0.9 ? "#16A34A" : pct >= 0.7 ? "#CA8A04" : pct >= 0.5 ? "#D97706" : "#DC2626"
                      return (
                        <div key={i} title={`${d.date}: ${Math.round(pct * 100)}%`}
                          className="flex flex-1 flex-col items-center gap-1">
                          <div className="w-full aspect-square rounded-[3px] flex items-center justify-center text-white text-[11px] font-bold" style={{ background: bg }}>
                            {Math.round(pct * 100)}
                          </div>
                          <span className="text-[10px] text-[#9CA3AF]">
                            {new Date(d.date).toLocaleDateString("en", { weekday: "short" }).slice(0,2)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Medication table */}
                <div className="rounded-[3px] border border-[#E5E7EB] overflow-hidden">
                  <div className="border-b border-[#F3F4F6] px-3 py-2 flex items-center gap-1.5">
                    <Pill className="h-3.5 w-3.5 text-[#9CA3AF]" />
                    <span className="text-xs font-semibold text-[#374151]">Medication List</span>
                  </div>
                  <table className="w-full text-xs">
                    <thead className="bg-[#F9FAFB]">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-[#6B7280]">Medication</th>
                        <th className="px-3 py-2 text-left font-semibold text-[#6B7280]">Dosage</th>
                        <th className="px-3 py-2 text-left font-semibold text-[#6B7280]">Frequency</th>
                        <th className="px-3 py-2 text-center font-semibold text-[#6B7280]">Critical</th>
                        <th className="px-3 py-2 text-center font-semibold text-[#6B7280]">Today</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F3F4F6]">
                      {adherence.medications.map((m, i) => {
                        const todayStr = new Date().toISOString().split("T")[0]
                        const dayLog   = adherence.daily_summary_7d.find(d => d.date === todayStr)
                        const ok       = dayLog ? dayLog.pct >= 0.9 : true
                        return (
                          <tr key={i} className="hover:bg-[#F9FAFB]">
                            <td className="px-3 py-2.5 font-medium text-[#111827]">{m.med_name}</td>
                            <td className="px-3 py-2.5 text-[#6B7280]">{m.dosage}</td>
                            <td className="px-3 py-2.5 text-[#6B7280]">{m.frequency.replace("_", " ")}</td>
                            <td className="px-3 py-2.5 text-center">
                              {m.is_critical && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-700">CRITICAL</span>}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {ok
                                ? <CheckCircle2 className="mx-auto h-4 w-4 text-green-600" />
                                : <XCircle      className="mx-auto h-4 w-4 text-red-500" />
                              }
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Follow-up compliance */}
                {followup && (
                  <div className="rounded-[3px] border border-[#E5E7EB] overflow-hidden">
                    <div className="border-b border-[#F3F4F6] px-3 py-2 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-[#374151]">
                        <Calendar className="h-3.5 w-3.5 text-[#9CA3AF]" /> Follow-Up Compliance
                      </span>
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold",
                        followup.no_show_rate > 0.4 ? "bg-red-100 text-red-700" :
                        followup.no_show_rate > 0.2 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
                      )}>
                        {Math.round((1 - followup.no_show_rate) * 100)}% attendance
                      </span>
                    </div>
                    <div className="p-3 space-y-3">
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="rounded-[3px] bg-[#F9FAFB] p-2">
                          <p className="text-base font-bold tabular text-[#111827]">{followup.no_show_count}</p>
                          <p className="text-[10px] text-[#9CA3AF]">No-shows</p>
                        </div>
                        <div className="rounded-[3px] bg-[#F9FAFB] p-2">
                          <p className="text-base font-bold tabular text-[#111827]">{Math.round(followup.no_show_rate * 100)}%</p>
                          <p className="text-[10px] text-[#9CA3AF]">No-show rate</p>
                        </div>
                        <div className="rounded-[3px] bg-[#F9FAFB] p-2">
                          <p className={cn("text-base font-bold", followup.has_scheduled_within_7d ? "text-green-600" : "text-red-600")}>
                            {followup.has_scheduled_within_7d ? "Yes" : "No"}
                          </p>
                          <p className="text-[10px] text-[#9CA3AF]">Appt in 7d</p>
                        </div>
                      </div>
                      <table className="w-full text-xs">
                        <thead className="bg-[#F9FAFB]">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-[#6B7280]">Date</th>
                            <th className="px-3 py-2 text-left font-semibold text-[#6B7280]">Type</th>
                            <th className="px-3 py-2 text-left font-semibold text-[#6B7280]">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F3F4F6]">
                          {followup.appointments.slice(-5).reverse().map((a, i) => (
                            <tr key={i} className="hover:bg-[#F9FAFB]">
                              <td className="px-3 py-2 tabular text-[#374151]">{a.scheduled_date}</td>
                              <td className="px-3 py-2 text-[#6B7280]">{a.appointment_type}</td>
                              <td className="px-3 py-2">
                                <span className={cn(
                                  "rounded-full px-2 py-0.5 text-[9px] font-bold",
                                  a.status === "no_show"  ? "bg-red-100 text-red-700" :
                                  a.status === "attended" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                                )}>
                                  {a.status.replace("_", " ").toUpperCase()}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" className="h-7 rounded-[3px] bg-[#2563EB] text-xs text-white hover:bg-[#1D4ED8]">
                          Schedule Appointment
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 rounded-[3px] text-xs">
                          Send SMS Reminder
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-[3px] border border-[#E5E7EB] p-8 text-center text-sm text-[#9CA3AF]">
                No adherence data available for this patient.
              </div>
            )}
          </div>
        )}

        {/* ═══════════ SOCIAL RISK ═════════════════════════════════════════ */}
        {tab === "social" && (
          <div className="content-pad py-3 space-y-3 sm:py-5 w-full">
            {sdoh ? (
              <>
                {/* Score summary */}
                <div className="grid grid-cols-1 divide-y divide-[#E5E7EB] rounded-[3px] border border-[#E5E7EB] overflow-hidden sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                  {[
                    { label: "SDOH Risk Score",   value: String(Math.round(Number(sdoh.social_risk_score))), warn: Number(sdoh.social_risk_score) >= 50 },
                    { label: "Active barriers",   value: String(sdoh.social_risk_factors.length), warn: sdoh.social_risk_factors.length >= 3 },
                    { label: "Health literacy",   value: `${sdoh.health_literacy_score}/10`, warn: Number(sdoh.health_literacy_score) < 5 },
                  ].map(s => (
                    <div key={s.label} className={cn("p-3 text-center", s.warn ? "bg-amber-50" : "bg-white")}>
                      <p className={cn("tabular text-2xl font-bold", s.warn ? "text-amber-700" : "text-[#111827]")}>{s.value}</p>
                      <p className="text-[10px] text-[#9CA3AF] mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>

                {sdoh.social_risk_factors.length > 0 && (
                  <div className="rounded-[3px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                    <span className="font-semibold">{sdoh.social_risk_factors.length} social barrier{sdoh.social_risk_factors.length !== 1 ? "s" : ""} identified:</span>{" "}
                    {sdoh.social_risk_factors.join(", ")}.
                    {Number(sdoh.social_risk_score) >= 60 && " Consider social work referral."}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Transportation",   val: sdoh.has_transportation         ? "Available"     : "No transport",     icon: Car,           ok: sdoh.has_transportation          },
                    { label: "Living situation", val: sdoh.lives_alone                 ? "Lives alone"   : "Lives with family",icon: Home,          ok: !sdoh.lives_alone                },
                    { label: "Medication costs", val: sdoh.medication_cost_barrier     ? "Cost barrier"  : "No barrier",       icon: DollarSign,    ok: !sdoh.medication_cost_barrier    },
                    { label: "Health literacy",  val: `Score ${sdoh.health_literacy_score}/10`,          icon: BookOpen,      ok: Number(sdoh.health_literacy_score) >= 6 },
                    { label: "Food security",    val: sdoh.food_insecurity             ? "Insecure"      : "Secure",           icon: Utensils,      ok: !sdoh.food_insecurity            },
                    { label: "Smoke exposure",   val: sdoh.smoking_exposure_household  ? "Household smoke":"No exposure",      icon: AlertTriangle, ok: !sdoh.smoking_exposure_household },
                  ].map((f, i) => (
                    <div key={i} className={cn(
                      "flex items-center gap-3 rounded-[3px] border p-3",
                      !f.ok ? "border-amber-200 bg-amber-50" : "border-[#E5E7EB] bg-white"
                    )}>
                      <div className={cn(
                        "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full",
                        !f.ok ? "bg-amber-100" : "bg-[#F3F4F6]"
                      )}>
                        <f.icon className={cn("h-4 w-4", !f.ok ? "text-amber-600" : "text-[#6B7280]")} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[#374151]">{f.label}</p>
                        <p className={cn("text-xs", !f.ok ? "text-amber-700 font-medium" : "text-[#6B7280]")}>{f.val}</p>
                      </div>
                      {f.ok
                        ? <CheckCircle2 className="ml-auto h-4 w-4 text-green-500 flex-shrink-0" />
                        : <XCircle      className="ml-auto h-4 w-4 text-amber-500 flex-shrink-0" />
                      }
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-[3px] border border-[#E5E7EB] p-8 text-center text-sm text-[#9CA3AF]">
                No SDOH profile available for this patient.
              </div>
            )}
          </div>
        )}

        {/* ═══════════ CARE NOTES ══════════════════════════════════════════ */}
        {tab === "notes" && (
          <div className="content-pad py-3 space-y-3 sm:py-5 w-full">
            <div className="rounded-[3px] border border-[#E5E7EB] overflow-hidden">
              <div className="flex items-center gap-1.5 border-b border-[#F3F4F6] px-3 py-2">
                <FileText className="h-3.5 w-3.5 text-[#9CA3AF]" />
                <span className="text-xs font-semibold text-[#374151]">Care Coordinator Notes</span>
              </div>
              <div className="p-3">
                <Textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Enter call outcomes, interventions, patient concerns, next steps…"
                  className="min-h-[clamp(8rem,25vh,10rem)] w-full rounded-[3px] border-[#E5E7EB] font-mono text-xs resize-y focus:ring-1 focus:ring-[#2563EB]"
                />
                <div className="mt-2 flex gap-2">
                  <Button size="sm" className="h-7 rounded-[3px] bg-[#2563EB] text-xs text-white hover:bg-[#1D4ED8]">
                    Save Notes
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 rounded-[3px] text-xs">
                    Add to Escalation Log
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-[3px] border border-[#E5E7EB] overflow-hidden">
              <div className="border-b border-[#F3F4F6] px-3 py-2 text-xs font-semibold text-[#374151]">
                Intervention History
              </div>
              <div className="divide-y divide-[#F9FAFB]">
                {[
                  { ts: "2026-06-28T09:00:00Z", action: "Called patient — medication reminder. Patient confirmed taking diuretic.", who: "Dr. Patel" },
                  { ts: "2026-06-26T14:30:00Z", action: "Scheduled follow-up appointment for Jul 5.", who: "Coord. Singh" },
                  { ts: "2026-06-25T11:00:00Z", action: "Alert acknowledged — SpO2 drop. Patient contacted, symptoms mild.", who: "Dr. Patel" },
                ].map((entry, i) => (
                  <div key={i} className="flex items-start gap-3 px-3 py-3">
                    <Clock className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-[#9CA3AF]" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[#374151] leading-relaxed">{entry.action}</p>
                      <p className="mt-0.5 text-[10px] text-[#9CA3AF]">
                        {formatDateTime(entry.ts)} · {entry.who}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
