"use client"
import { useState, useMemo } from "react"
import Link from "next/link"
import {
  Search, ChevronUp, ChevronDown, ExternalLink,
  Heart, Pill, Home, AlertTriangle,
} from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { usePatients, useStats } from "@/lib/use-patient-data"
import { PatientTableSkeleton } from "@/components/dashboard/skeletons"
import { cn } from "@/lib/utils"
import { formatRelativeTime, formatClockTime } from "@/lib/time-utils"
import { useLiveMinute } from "@/lib/use-live-time"
import type { RiskTier } from "@/lib/types"
import { SDOH_PROFILES } from "@/lib/sdoh-types"
import { getAllAdherence } from "@/lib/adherence-simulator"
import { PATIENT_REGISTRY } from "@/lib/mock-data"

type SortKey = "riskScore" | "daysSinceDischarge" | "name" | "riskTier"
type SortDir  = "asc" | "desc"

const TIER_ORDER: Record<RiskTier, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
const ALL_ADHERENCE = getAllAdherence(PATIENT_REGISTRY)

function getRiskColor(tier: RiskTier) {
  switch (tier) {
    case "CRITICAL": return "text-red-600"
    case "HIGH":     return "text-orange-600"
    case "MEDIUM":   return "text-yellow-700"
    case "LOW":      return "text-green-700"
  }
}

export default function PatientOverviewPage() {
  const { patients, loading } = usePatients()
  const stats = useStats()
  useLiveMinute()

  const [search,     setSearch]     = useState("")
  const [tierFilter, setTierFilter] = useState<RiskTier | "ALL">("ALL")
  const [sortKey,    setSortKey]    = useState<SortKey>("riskScore")
  const [sortDir,    setSortDir]    = useState<SortDir>("desc")
  const [nonClinical, setNonClinical] = useState(false)

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("desc") }
  }

  const filtered = useMemo(() => {
    let rows = [...patients]
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.diagnosis.toLowerCase().includes(q)
      )
    }
    if (tierFilter !== "ALL") rows = rows.filter(p => p.riskTier === tierFilter)
    if (nonClinical) rows = rows.filter(p => p.compositeRisk?.flagged_by_nonclinical)
    rows.sort((a, b) => {
      let av: number, bv: number
      switch (sortKey) {
        case "riskTier":           av = TIER_ORDER[a.riskTier]; bv = TIER_ORDER[b.riskTier]; break
        case "daysSinceDischarge": av = a.daysSinceDischarge;   bv = b.daysSinceDischarge;   break
        case "name":               return sortDir === "asc"
          ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
        default:                   av = a.riskScore; bv = b.riskScore
      }
      return sortDir === "asc" ? av - bv : bv - av
    })
    return rows
  }, [patients, search, tierFilter, nonClinical, sortKey, sortDir])

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey !== col
      ? <ChevronDown className="h-3 w-3 opacity-30 inline ml-0.5" />
      : sortDir === "desc"
        ? <ChevronDown className="h-3 w-3 inline ml-0.5" />
        : <ChevronUp   className="h-3 w-3 inline ml-0.5" />

  const nonClinCount = patients.filter(p => p.compositeRisk?.flagged_by_nonclinical).length

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="border-b border-[#E5E7EB] bg-white px-6 py-4">
        <h1 className="text-base font-semibold text-[#111827]">Patient Monitor</h1>
        <p className="text-xs text-[#6B7280] mt-0.5">
          {stats.totalPatients} patients · last updated {formatRelativeTime(new Date().toISOString())}
        </p>
      </div>

      {/* ── Stat bar ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-5 border-b border-[#E5E7EB] bg-[#F9FAFB]">
        {[
          { label: "TOTAL",        value: stats.totalPatients,  color: "text-[#111827]" },
          { label: "CRITICAL",     value: stats.criticalCount,  color: "text-red-600"   },
          { label: "HIGH",         value: stats.highCount,      color: "text-orange-600"},
          { label: "MEDIUM",       value: stats.mediumCount,    color: "text-yellow-700"},
          { label: "NON-CLIN ⚑",  value: nonClinCount,         color: "text-orange-600"},
        ].map(s => (
          <div key={s.label} className="border-r border-[#E5E7EB] px-4 py-3 last:border-r-0">
            <p className={cn("tabular text-xl font-bold", s.color)}>{loading ? "—" : s.value}</p>
            <p className="text-[10px] font-medium uppercase tracking-wider text-[#6B7280] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-[#E5E7EB] bg-white px-6 py-2">
        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6B7280]" />
          <input
            type="text"
            placeholder="Search name, ID, diagnosis …"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-7 w-52 rounded-[3px] border border-[#E5E7EB] bg-white pl-7 pr-3 text-xs text-[#111827] placeholder:text-[#9CA3AF] focus:border-[#2563EB] focus:outline-none"
          />
        </div>

        <div className="h-4 w-px bg-[#E5E7EB]" />

        {/* Tier filters */}
        {(["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTierFilter(t)}
            className={cn(
              "filter-btn",
              tierFilter === t && "active"
            )}
          >
            {t}
          </button>
        ))}

        <div className="h-4 w-px bg-[#E5E7EB]" />

        <button
          onClick={() => setNonClinical(p => !p)}
          className={cn("filter-btn gap-1.5", nonClinical && "active")}
        >
          <AlertTriangle className="h-3 w-3" />
          Non-clinical risk only
        </button>

        <span className="ml-auto text-xs text-[#6B7280] tabular">
          {filtered.length} of {patients.length}
        </span>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <table className="clinical-table">
          <thead>
            <tr>
              <th className="sortable w-8" onClick={() => handleSort("riskTier")}>
                #
              </th>
              <th className="sortable" onClick={() => handleSort("name")}>
                Patient <SortIcon col="name" />
              </th>
              <th>Diagnosis</th>
              <th className="sortable" onClick={() => handleSort("riskScore")}>
                Risk Score <SortIcon col="riskScore" />
              </th>
              <th>Risk Tier</th>
              <th>Drivers</th>
              <th className="sortable" onClick={() => handleSort("daysSinceDischarge")}>
                Day Out <SortIcon col="daysSinceDischarge" />
              </th>
              <th>Last Alert</th>
              <th>Updated</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? <PatientTableSkeleton rows={12} />
              : filtered.map((p, idx) => {
                  const cr    = p.compositeRisk
                  const nonCl = cr?.flagged_by_nonclinical ?? false
                  const cliEl = cr ? cr.clinical_score    > 50 : p.riskScore > 50
                  const behEl = cr ? cr.behavioral_score  > 35 : false
                  const socEl = cr ? cr.social_score      > 35 : false
                  const alert = p.triggeredAlerts?.[0] ?? "—"
                  const sdoh  = SDOH_PROFILES[p.id]

                  return (
                    <tr
                      key={p.id}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-[#F9FAFB]",
                        p.riskTier === "CRITICAL" ? "row-CRITICAL" :
                        nonCl ? "row-nonclinical" : ""
                      )}
                      onClick={() => window.location.href = `/dashboard/patient/${p.id}`}
                    >
                      {/* Row number */}
                      <td className="text-[#9CA3AF] text-xs">{idx + 1}</td>

                      {/* Patient */}
                      <td>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-[#111827]">{p.name}</span>
                          {(p.dataSource === "esp32_live" || p.dataSource === "hardware") && (
                            <span className="relative flex h-1.5 w-1.5 flex-shrink-0" title="Live Device">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-[#9CA3AF] tabular">{p.id} · {p.age}y</div>
                      </td>

                      {/* Diagnosis */}
                      <td className="text-[#6B7280]">{p.diagnosis}</td>

                      {/* Risk score */}
                      <td>
                        <div className="flex items-center gap-2">
                          <span className={cn("tabular text-sm font-semibold", getRiskColor(p.riskTier))}>
                            {Math.round(p.riskScore)}
                          </span>
                          <div className="risk-bar-track w-16">
                            <div
                              className="risk-bar-fill"
                              style={{
                                width: `${p.riskScore}%`,
                                background:
                                  p.riskTier === "CRITICAL" ? "#DC2626" :
                                  p.riskTier === "HIGH"     ? "#D97706" :
                                  p.riskTier === "MEDIUM"   ? "#CA8A04" :
                                  "#16A34A",
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Tier badge */}
                      <td>
                        <span className={cn("badge", `badge-${p.riskTier}`)}>
                          {p.riskTier}
                        </span>
                      </td>

                      {/* Risk drivers — text icons, no circles */}
                      <td>
                        <div className="flex items-center gap-1">
                          {cliEl && <span title="Clinical" className="text-blue-600"><Heart   className="h-3.5 w-3.5" /></span>}
                          {behEl && <span title="Behavioral" className="text-orange-600"><Pill className="h-3.5 w-3.5" /></span>}
                          {socEl && <span title="Social" className="text-purple-600"><Home   className="h-3.5 w-3.5" /></span>}
                          {!cliEl && !behEl && !socEl && <span className="text-[#9CA3AF] text-xs">—</span>}
                        </div>
                      </td>

                      {/* Days post-discharge */}
                      <td className="tabular text-xs text-[#6B7280]">D+{p.daysSinceDischarge}</td>

                      {/* Last alert */}
                      <td className="max-w-[200px]">
                        <p className="truncate text-xs text-[#6B7280]" title={alert}>
                          {alert.length > 55 ? alert.slice(0, 55) + "…" : alert}
                        </p>
                      </td>

                      {/* Updated */}
                      <td className="tabular text-xs text-[#9CA3AF]" title={p.lastUpdated}>
                        {formatClockTime(p.lastUpdated)}
                        <span className="block text-[10px]">{formatRelativeTime(p.lastUpdated)}</span>
                      </td>

                      {/* Link */}
                      <td onClick={e => e.stopPropagation()}>
                        <Link
                          href={`/dashboard/patient/${p.id}`}
                          className="text-[#2563EB] hover:underline"
                          onClick={e => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  )
                })
            }
          </tbody>
        </table>

        {!loading && filtered.length === 0 && (
          <div className="flex h-32 items-center justify-center text-sm text-[#9CA3AF]">
            No patients match the current filters.
          </div>
        )}
      </div>
    </div>
  )
}
