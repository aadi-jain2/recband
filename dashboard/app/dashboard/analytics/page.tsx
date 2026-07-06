"use client"
import {
  PieChart, Pie, Cell, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ScatterChart, Scatter, ReferenceLine,
} from "recharts"
import Link from "next/link"
import { TrendingDown, Users, AlertOctagon, Pill, Home, ChevronRight } from "lucide-react"
import { useStats, usePatients } from "@/lib/use-patient-data"
import { MOCK_DAILY_RISK, SHAP_FEATURES, PATIENT_REGISTRY } from "@/lib/mock-data"
import { getAllAdherence } from "@/lib/adherence-simulator"
import { SDOH_PROFILES } from "@/lib/sdoh-types"

const ALL_ADHERENCE = getAllAdherence(PATIENT_REGISTRY)

const TIER_COLORS = {
  CRITICAL: "#DC2626",
  HIGH:     "#D97706",
  MEDIUM:   "#CA8A04",
  LOW:      "#16A34A",
}

const ALERT_REASONS = [
  { reason: "Low HRV SDNN",         count: 8 },
  { reason: "SpO2 < 92%",           count: 7 },
  { reason: "Fluid retention (BioZ)",count: 6 },
  { reason: "AFib episodes",         count: 5 },
  { reason: "Elevated cough rate",   count: 4 },
  { reason: "High respiratory rate", count: 4 },
  { reason: "Post-discharge (<7d)",  count: 3 },
]

function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-bold text-[#111827]">{children}</h2>
      {sub && <p className="text-xs text-[#9CA3AF] mt-0.5">{sub}</p>}
    </div>
  )
}

// Compact card used in the risk distribution row
function RiskCard({ tier, count, total }: { tier: string; count: number; total: number }) {
  const color = TIER_COLORS[tier as keyof typeof TIER_COLORS] ?? "#9CA3AF"
  const pct   = total ? ((count / total) * 100).toFixed(0) : "0"
  return (
    <div className="flex flex-col items-center rounded-[3px] border border-[#E5E7EB] bg-white p-4">
      <div className="tabular text-3xl font-bold" style={{ color }}>{count}</div>
      <div className="mt-0.5 text-[11px] font-semibold" style={{ color }}>{tier}</div>
      <div className="mt-2 w-full h-1 rounded-full bg-[#F3F4F6] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="mt-1 text-[10px] text-[#9CA3AF]">{pct}% of patients</div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function AnalyticsPage() {
  const stats = useStats()
  const { patients } = usePatients()

  const nonClinicalFlagged = patients.filter(p => p.compositeRisk?.flagged_by_nonclinical).length
  const adherenceAlerts    = patients.filter(p => ALL_ADHERENCE[p.id]?.critical_missed_streak >= 2).length
  const sdohHighRisk       = patients.filter(p => Number(SDOH_PROFILES[p.id]?.social_risk_score ?? 0) >= 50).length

  const compositionByTier = (["CRITICAL","HIGH","MEDIUM","LOW"] as const).map(tier => {
    const grp = patients.filter(p => p.riskTier === tier)
    const avg = (vals: number[]) => vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0
    return {
      tier,
      clinical:   Math.round(avg(grp.map(p => p.compositeRisk?.clinical_score   ?? p.riskScore))  * 0.55),
      behavioral: Math.round(avg(grp.map(p => p.compositeRisk?.behavioral_score ?? 0))            * 0.30),
      social:     Math.round(avg(grp.map(p => p.compositeRisk?.social_score     ?? (SDOH_PROFILES[p.id]?.social_risk_score ?? 0))) * 0.15),
      count: grp.length,
    }
  })

  const scatterData = patients.map(p => ({
    x: p.daysSinceDischarge, y: p.riskScore, tier: p.riskTier, name: p.name, id: p.id,
  }))

  // Top-10 highest risk patients for the sidebar list
  const topPatients = [...patients].sort((a,b) => b.riskScore - a.riskScore).slice(0, 10)

  return (
    <div className="flex h-full overflow-hidden bg-[#F9FAFB]">
      {/* ── Main column ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-5 space-y-6">

        {/* ── Page header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-base font-bold text-[#111827]">Population Analytics</h1>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              {stats.totalPatients} monitored patients · updated live
            </p>
          </div>
          {/* Model performance chips */}
          <div className="flex items-center gap-2">
            {[
              { label: "AUC-ROC",      value: "0.861" },
              { label: "Sensitivity",  value: "94.1%" },
              { label: "30d readmission", value: "4.2%" },
            ].map(m => (
              <div key={m.label} className="rounded-[3px] border border-[#E5E7EB] bg-white px-3 py-1.5 text-center">
                <p className="tabular text-sm font-bold text-[#111827]">{m.value}</p>
                <p className="text-[9px] text-[#9CA3AF]">{m.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Risk distribution — 4 big cards + donut ── */}
        <div>
          <SectionTitle sub="Current snapshot across all monitored patients">Risk Distribution</SectionTitle>
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr_200px] gap-3">
            <RiskCard tier="CRITICAL" count={stats.criticalCount} total={stats.totalPatients} />
            <RiskCard tier="HIGH"     count={stats.highCount}     total={stats.totalPatients} />
            <RiskCard tier="MEDIUM"   count={stats.mediumCount}   total={stats.totalPatients} />
            <RiskCard tier="LOW"      count={stats.lowCount}      total={stats.totalPatients} />
            {/* Donut */}
            <div className="rounded-[3px] border border-[#E5E7EB] bg-white p-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: "CRITICAL", value: stats.criticalCount },
                      { name: "HIGH",     value: stats.highCount     },
                      { name: "MEDIUM",   value: stats.mediumCount   },
                      { name: "LOW",      value: stats.lowCount      },
                    ]}
                    cx="50%" cy="50%"
                    innerRadius="45%" outerRadius="70%"
                    paddingAngle={2} dataKey="value"
                  >
                    {Object.keys(TIER_COLORS).map(t => (
                      <Cell key={t} fill={TIER_COLORS[t as keyof typeof TIER_COLORS]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 3, border: "1px solid #E5E7EB" }}
                    formatter={(v: unknown, name: unknown) => [`${v} patients`, String(name)]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ── Population risk trend + alert reasons ── */}
        <div className="grid grid-cols-2 gap-4">
          {/* 30-day trend */}
          <div className="rounded-[3px] border border-[#E5E7EB] bg-white p-4">
            <SectionTitle sub="Population-level composite risk — 30 days">
              Avg Risk Score Trend
            </SectionTitle>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={MOCK_DAILY_RISK} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="0" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#9CA3AF" }} tickLine={false} axisLine={false} interval={6} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
                <ReferenceLine y={75} stroke="#DC2626" strokeDasharray="3 2" strokeOpacity={0.3}
                  label={{ value: "High", fontSize: 9, fill: "#DC2626", position: "insideTopRight" }} />
                <ReferenceLine y={50} stroke="#D97706" strokeDasharray="3 2" strokeOpacity={0.3}
                  label={{ value: "Med",  fontSize: 9, fill: "#D97706", position: "insideTopRight" }} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 3, border: "1px solid #E5E7EB" }}
                  formatter={(v: unknown) => [`${Number(v).toFixed(1)}`, "Avg risk"]}
                />
                <Line dataKey="avgRisk" stroke="#2563EB" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Alert reasons */}
          <div className="rounded-[3px] border border-[#E5E7EB] bg-white p-4">
            <SectionTitle sub="Most common clinical triggers this week">
              Top Alert Triggers
            </SectionTitle>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={ALERT_REASONS} layout="vertical" margin={{ left: 0, right: 24, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="0" stroke="#F3F4F6" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
                <YAxis dataKey="reason" type="category" tick={{ fontSize: 10, fill: "#6B7280" }} tickLine={false} axisLine={false} width={130} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 3, border: "1px solid #E5E7EB" }} />
                <Bar dataKey="count" fill="#2563EB" radius={[0, 3, 3, 0]} label={{ position: "right", fontSize: 10, fill: "#9CA3AF" }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Composite breakdown ── */}
        <div className="rounded-[3px] border border-[#E5E7EB] bg-white p-4">
          <SectionTitle sub="Average clinical (55%), behavioral (30%), and social (15%) contribution per risk tier">
            Risk Composition by Tier
          </SectionTitle>
          <div className="grid grid-cols-[1fr_auto] gap-6">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={compositionByTier} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="0" stroke="#F3F4F6" vertical={false} />
                <XAxis
                  dataKey="tier"
                  tick={{ fontSize: 11, fill: "#6B7280" }}
                  tickLine={false} axisLine={false}
                  tickFormatter={t => `${t} (n=${compositionByTier.find(d=>d.tier===t)?.count ?? 0})`}
                />
                <YAxis tick={{ fontSize: 9, fill: "#9CA3AF" }} tickLine={false} axisLine={false} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 3, border: "1px solid #E5E7EB" }}
                  formatter={(v: unknown, name: unknown) => [`${Number(v)} pts`,
                    name === "clinical" ? "Clinical (55%)" : name === "behavioral" ? "Behavioral (30%)" : "Social (15%)"
                  ]}
                />
                <Legend
                  formatter={(n: string) => n === "clinical" ? "Clinical" : n === "behavioral" ? "Behavioral" : "Social"}
                  wrapperStyle={{ fontSize: 11 }}
                />
                <Bar dataKey="clinical"   stackId="a" fill="#2563EB" />
                <Bar dataKey="behavioral" stackId="a" fill="#D97706" />
                <Bar dataKey="social"     stackId="a" fill="#7C3AED" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>

            {/* 3 insight stats on the right */}
            <div className="flex flex-col gap-3 justify-center min-w-[180px]">
              {[
                { Icon: AlertOctagon, val: nonClinicalFlagged, label: "Non-clinical flags", sub: "Vitals normal; B/S elevated", color: "#D97706" },
                { Icon: Pill,         val: adherenceAlerts,    label: "Adherence alerts",   sub: "Missed critical med 2+d",    color: "#DC2626" },
                { Icon: Home,         val: sdohHighRisk,       label: "High social risk",   sub: "SDOH score ≥ 50",            color: "#7C3AED" },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-3 rounded-[3px] bg-[#F9FAFB] px-3 py-2.5">
                  <s.Icon className="h-5 w-5 flex-shrink-0" style={{ color: s.color }} />
                  <div>
                    <p className="tabular text-xl font-bold text-[#111827]">{s.val}</p>
                    <p className="text-[11px] font-medium text-[#374151]">{s.label}</p>
                    <p className="text-[10px] text-[#9CA3AF]">{s.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Scatter + SHAP row ── */}
        <div className="grid grid-cols-2 gap-4">
          {/* Scatter */}
          <div className="rounded-[3px] border border-[#E5E7EB] bg-white p-4">
            <SectionTitle sub="Each dot = one patient. Hover for name.">
              Days Post-Discharge vs Risk Score
            </SectionTitle>
            <ResponsiveContainer width="100%" height={220}>
              <ScatterChart margin={{ top: 4, right: 8, bottom: 16, left: -8 }}>
                <CartesianGrid strokeDasharray="0" stroke="#F3F4F6" />
                <XAxis
                  dataKey="x" type="number" name="Days Out"
                  tick={{ fontSize: 9, fill: "#9CA3AF" }} tickLine={false} axisLine={false}
                  label={{ value: "Days since discharge", position: "insideBottom", fontSize: 9, fill: "#9CA3AF", offset: -4 }}
                />
                <YAxis
                  dataKey="y" type="number" name="Risk"
                  tick={{ fontSize: 9, fill: "#9CA3AF" }} tickLine={false} axisLine={false} domain={[0, 100]}
                  label={{ value: "Risk", position: "insideLeft", fontSize: 9, fill: "#9CA3AF", angle: -90, offset: 8 }}
                />
                <ReferenceLine y={75} stroke="#DC2626" strokeDasharray="3 2" strokeOpacity={0.25} />
                <ReferenceLine y={50} stroke="#D97706" strokeDasharray="3 2" strokeOpacity={0.25} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 3, border: "1px solid #E5E7EB" }}
                  content={({ payload }) => {
                    if (!payload?.length) return null
                    const d = payload[0].payload
                    return (
                      <div className="rounded-[3px] border border-[#E5E7EB] bg-white p-2 text-xs shadow-sm">
                        <p className="font-semibold text-[#111827]">{d.name}</p>
                        <p className="text-[#6B7280]">Day {d.x} post-discharge</p>
                        <p className="font-medium" style={{ color: TIER_COLORS[d.tier as keyof typeof TIER_COLORS] }}>
                          Risk {Number(d.y).toFixed(0)} · {d.tier}
                        </p>
                      </div>
                    )
                  }}
                />
                {(["CRITICAL","HIGH","MEDIUM","LOW"] as const).map(tier => (
                  <Scatter
                    key={tier} name={tier}
                    data={scatterData.filter(d => d.tier === tier)}
                    fill={TIER_COLORS[tier]}
                    fillOpacity={0.8}
                  />
                ))}
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* SHAP */}
          <div className="rounded-[3px] border border-[#E5E7EB] bg-white p-4">
            <SectionTitle sub="Mean |SHAP| value — XGBoost trained on 60,000 windows">
              Feature Importance (SHAP)
            </SectionTitle>
            <div className="space-y-2">
              {SHAP_FEATURES.map((f, i) => (
                <div key={f.key} className="flex items-center gap-2 text-[11px]">
                  <span className="w-4 tabular text-right text-[#9CA3AF]">{i + 1}</span>
                  <span className="w-44 truncate text-[#6B7280]" title={f.feature}>{f.feature}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-[#F3F4F6] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(f.importance / 0.89) * 100}%`,
                        background: i < 3 ? "#2563EB" : i < 6 ? "#D97706" : "#D1D5DB",
                      }}
                    />
                  </div>
                  <span className="tabular w-8 text-right font-semibold text-[#111827]">{f.importance.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right sidebar: watchlist ─────────────────────────────────────────── */}
      <div className="w-64 flex-shrink-0 border-l border-[#E5E7EB] bg-white flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#E5E7EB] px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#374151]">
            <Users className="h-3.5 w-3.5 text-[#9CA3AF]" />
            Highest Risk Patients
          </div>
        </div>
        <div className="flex-1 overflow-auto divide-y divide-[#F3F4F6]">
          {topPatients.map((p, i) => {
            const color = TIER_COLORS[p.riskTier] ?? "#9CA3AF"
            return (
              <Link
                key={p.id}
                href={`/dashboard/patient/${p.id}`}
                className="group flex items-center gap-3 px-4 py-3 hover:bg-[#F9FAFB] transition-colors"
              >
                <span className="w-4 text-[10px] tabular text-[#9CA3AF] text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[#111827] truncate">{p.name}</p>
                  <p className="text-[10px] text-[#9CA3AF]">{p.diagnosis} · D+{p.daysSinceDischarge}</p>
                </div>
                <div className="flex-shrink-0 flex items-center gap-1.5">
                  <span className="tabular text-sm font-bold" style={{ color }}>{Math.round(p.riskScore)}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-[#D1D5DB] group-hover:text-[#9CA3AF]" />
                </div>
              </Link>
            )
          })}
        </div>
        {/* Population stat summary */}
        <div className="border-t border-[#E5E7EB] p-4 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-[#9CA3AF]">Avg risk score</span>
            <span className="tabular font-semibold text-[#111827]">{stats.avgRiskScore?.toFixed(1) ?? "—"}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-[#9CA3AF]">30d readmission</span>
            <span className="tabular font-semibold text-green-600">4.2% <TrendingDown className="inline h-3 w-3" /></span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-[#9CA3AF]">National avg</span>
            <span className="tabular font-semibold text-[#9CA3AF]">8.5%</span>
          </div>
        </div>
      </div>
    </div>
  )
}
