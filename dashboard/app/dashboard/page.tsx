"use client"
import { useState, useMemo } from "react"
import Link from "next/link"
import {
  Users, AlertTriangle, TrendingUp, Activity,
  Search, ChevronUp, ChevronDown, Flag, ExternalLink, RefreshCw,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { RiskBadge } from "@/components/dashboard/risk-badge"
import { usePatients, useStats } from "@/lib/use-patient-data"
import { formatRelativeTime } from "@/lib/utils"
import type { RiskTier } from "@/lib/types"

type SortKey = "riskScore" | "daysSinceDischarge" | "name" | "riskTier"
type SortDir = "asc" | "desc"

const TIER_ORDER: Record<RiskTier, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

export default function PatientOverviewPage() {
  const { patients, loading } = usePatients()
  const stats = useStats()

  const [search, setSearch] = useState("")
  const [tierFilter, setTierFilter] = useState<RiskTier | "ALL">("ALL")
  const [daysFilter, setDaysFilter] = useState<number | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>("riskScore")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [flagged, setFlagged] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    let list = [...patients]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
    }
    if (tierFilter !== "ALL") list = list.filter(p => p.riskTier === tierFilter)
    if (daysFilter !== null) list = list.filter(p => p.daysSinceDischarge <= daysFilter)
    list.sort((a, b) => {
      let cmp = 0
      if (sortKey === "riskScore")          cmp = a.riskScore - b.riskScore
      else if (sortKey === "daysSinceDischarge") cmp = a.daysSinceDischarge - b.daysSinceDischarge
      else if (sortKey === "name")          cmp = a.name.localeCompare(b.name)
      else if (sortKey === "riskTier")      cmp = TIER_ORDER[a.riskTier] - TIER_ORDER[b.riskTier]
      return sortDir === "asc" ? cmp : -cmp
    })
    return list
  }, [patients, search, tierFilter, daysFilter, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("desc") }
  }

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ChevronUp className="h-3 w-3 opacity-30" />
    return sortDir === "asc"
      ? <ChevronUp className="h-3 w-3 text-[#0F4C81]" />
      : <ChevronDown className="h-3 w-3 text-[#0F4C81]" />
  }

  const statCards = [
    { label: "Total Patients",    value: stats.totalPatients,  icon: Users,          color: "text-[#0F4C81] bg-blue-50" },
    { label: "CRITICAL",          value: stats.criticalCount,  icon: AlertTriangle,  color: "text-red-600 bg-red-50" },
    { label: "HIGH Risk",         value: stats.highCount,      icon: TrendingUp,     color: "text-orange-600 bg-orange-50" },
    { label: "Avg Risk Score",    value: stats.avgRiskScore,   icon: Activity,       color: "text-[#00B4A6] bg-teal-50" },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Patient Overview</h1>
          <p className="text-sm text-gray-500 mt-0.5">Live 24-hour monitoring — {patients.length} patients enrolled</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map(c => (
          <Card key={c.label}>
            <CardContent className="flex items-center gap-4 p-5">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${c.color}`}>
                <c.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{c.value}</p>
                <p className="text-xs text-gray-500">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by name or ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {(["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTierFilter(t)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                  tierFilter === t
                    ? "bg-[#0F4C81] text-white border-[#0F4C81]"
                    : "border-gray-300 text-gray-600 hover:border-gray-400"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <select
            value={daysFilter ?? ""}
            onChange={e => setDaysFilter(e.target.value ? Number(e.target.value) : null)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 focus:ring-2 focus:ring-[#0F4C81]"
          >
            <option value="">All discharge dates</option>
            <option value="7">Last 7 days</option>
            <option value="14">Last 14 days</option>
            <option value="21">Last 21 days</option>
          </select>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 dark:bg-gray-900">
              <tr>
                {[
                  { label: "Patient", key: "name" as SortKey },
                  { label: "Diagnosis", key: null },
                  { label: "Days Out", key: "daysSinceDischarge" as SortKey },
                  { label: "Risk Score", key: "riskScore" as SortKey },
                  { label: "Risk Tier", key: "riskTier" as SortKey },
                  { label: "Top Alert", key: null },
                  { label: "Updated", key: null },
                  { label: "Actions", key: null },
                ].map(({ label, key }) => (
                  <th
                    key={label}
                    onClick={() => key && toggleSort(key)}
                    className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 ${key ? "cursor-pointer select-none hover:text-gray-700" : ""}`}
                  >
                    <span className="flex items-center gap-1">
                      {label}
                      {key && <SortIcon k={key} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                : filtered.map(patient => (
                    <tr
                      key={patient.id}
                      className={`group cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-900 ${
                        patient.riskTier === "CRITICAL" ? "bg-red-50/40 dark:bg-red-950/20" : ""
                      }`}
                      onClick={() => window.location.href = `/dashboard/patient/${patient.id}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#0F4C81]/10 text-[11px] font-bold text-[#0F4C81]">
                            {patient.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">{patient.name}</p>
                            <p className="text-xs text-gray-400">{patient.id} · {patient.age}y</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                          {patient.diagnosis}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300 font-medium">
                        {patient.daysSinceDischarge}d
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-200">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${patient.riskScore}%`,
                                backgroundColor:
                                  patient.riskScore >= 75 ? "#DC2626" :
                                  patient.riskScore >= 50 ? "#EA580C" :
                                  patient.riskScore >= 25 ? "#CA8A04" : "#16A34A",
                              }}
                            />
                          </div>
                          <span className="font-bold text-gray-900 dark:text-gray-100 text-sm">
                            {patient.riskScore.toFixed(0)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <RiskBadge tier={patient.riskTier} pulse={patient.riskTier === "CRITICAL"} />
                      </td>
                      <td className="max-w-xs px-4 py-3">
                        <p className="truncate text-xs text-gray-600 dark:text-gray-400">{patient.triggeredAlerts[0]}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {formatRelativeTime(patient.lastUpdated)}
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <Link href={`/dashboard/patient/${patient.id}`}>
                            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs">
                              <ExternalLink className="h-3 w-3" /> View
                            </Button>
                          </Link>
                          <Button
                            size="sm"
                            variant={flagged.has(patient.id) ? "default" : "outline"}
                            className="h-7 gap-1 text-xs"
                            onClick={() => setFlagged(f => {
                              const n = new Set(f)
                              n.has(patient.id) ? n.delete(patient.id) : n.add(patient.id)
                              return n
                            })}
                          >
                            <Flag className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
          {!loading && filtered.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-400">
              No patients match current filters.
            </div>
          )}
        </div>
        <div className="border-t border-gray-100 px-4 py-3 text-xs text-gray-400">
          Showing {filtered.length} of {patients.length} patients · Auto-refreshes every 60s
        </div>
      </Card>
    </div>
  )
}
