"use client"
import {
  PieChart, Pie, Cell, LineChart, Line, BarChart, Bar,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useStats, usePatients } from "@/lib/use-patient-data"
import { MOCK_DAILY_RISK, SHAP_FEATURES } from "@/lib/mock-data"
import { BarChart3, TrendingDown, Brain, Users } from "lucide-react"

const TIER_COLORS = {
  CRITICAL: "#DC2626",
  HIGH:     "#EA580C",
  MEDIUM:   "#CA8A04",
  LOW:      "#16A34A",
}

const ALERT_REASONS = [
  { reason: "Low HRV SDNN", count: 8 },
  { reason: "SpO2 < 92%", count: 7 },
  { reason: "Fluid retention (BioZ)", count: 6 },
  { reason: "AFib episodes", count: 5 },
  { reason: "Elevated cough rate", count: 4 },
  { reason: "High respiratory rate", count: 4 },
  { reason: "Early post-discharge (<7d)", count: 3 },
]

export default function AnalyticsPage() {
  const stats = useStats()
  const { patients } = usePatients()

  const donutData = [
    { name: "CRITICAL", value: stats.criticalCount },
    { name: "HIGH",     value: stats.highCount },
    { name: "MEDIUM",   value: stats.mediumCount },
    { name: "LOW",      value: stats.lowCount },
  ]

  const scatterData = patients.map(p => ({
    x: p.daysSinceDischarge,
    y: p.riskScore,
    tier: p.riskTier,
    name: p.name,
  }))

  const statCards = [
    {
      label: "30-day Readmission Rate",
      value: "4.2%",
      sub: "vs 8.5% national avg",
      icon: TrendingDown,
      color: "text-green-600 bg-green-50",
      trend: "down",
    },
    {
      label: "Model AUC-ROC",
      value: "0.8079",
      sub: "Trained on 50,000 windows",
      icon: Brain,
      color: "text-purple-600 bg-purple-50",
    },
    {
      label: "Model Sensitivity",
      value: "82.7%",
      sub: "Clinical target: >80%",
      icon: BarChart3,
      color: "text-[#0F4C81] bg-blue-50",
    },
    {
      label: "Patients Monitored",
      value: String(stats.totalPatients),
      sub: "Active this month",
      icon: Users,
      color: "text-[#00B4A6] bg-teal-50",
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Population Analytics</h1>
        <p className="text-sm text-gray-500 mt-0.5">Aggregated insights across all monitored patients</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map(c => (
          <Card key={c.label}>
            <CardContent className="flex items-start gap-3 p-5">
              <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${c.color}`}>
                <c.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{c.value}</p>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 leading-tight">{c.label}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{c.sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Donut */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Risk Distribution</CardTitle>
            <CardDescription className="text-xs">Current patient tiers</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, value }) => `${name} ${value}`}
                  labelLine={false}
                >
                  {donutData.map(entry => (
                    <Cell key={entry.name} fill={TIER_COLORS[entry.name as keyof typeof TIER_COLORS]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
              {donutData.map(d => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs">
                  <div className="h-2 w-2 rounded-full" style={{ background: TIER_COLORS[d.name as keyof typeof TIER_COLORS] }} />
                  <span className="text-gray-600">{d.name}: {d.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Avg daily risk line */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Average Daily Risk Score — Last 30 Days</CardTitle>
            <CardDescription className="text-xs">Population-level risk trend</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={MOCK_DAILY_RISK}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={4} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line
                  dataKey="avgRisk"
                  stroke="#0F4C81"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Alert reasons */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Top Alert Reasons</CardTitle>
            <CardDescription className="text-xs">Most common clinical triggers</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={ALERT_REASONS} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="reason" type="category" tick={{ fontSize: 10 }} width={130} />
                <Tooltip />
                <Bar dataKey="count" fill="#0F4C81" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Scatter: days vs risk */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Days Since Discharge vs Risk Score</CardTitle>
            <CardDescription className="text-xs">Risk trajectory post-discharge</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={230}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="x" type="number" name="Days Out" tick={{ fontSize: 10 }} label={{ value: "Days since discharge", position: "insideBottom", fontSize: 10, offset: -2 }} />
                <YAxis dataKey="y" type="number" name="Risk Score" tick={{ fontSize: 10 }} domain={[0, 100]} />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={({ payload }) => {
                    if (!payload?.length) return null
                    const d = payload[0].payload
                    return (
                      <div className="rounded-lg border border-gray-200 bg-white p-2 text-xs shadow">
                        <p className="font-semibold">{d.name}</p>
                        <p>Day {d.x} · Score {d.y.toFixed(0)}</p>
                      </div>
                    )
                  }}
                />
                {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map(tier => (
                  <Scatter
                    key={tier}
                    name={tier}
                    data={scatterData.filter(d => d.tier === tier)}
                    fill={TIER_COLORS[tier]}
                  />
                ))}
                <Legend />
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* SHAP importance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">SHAP Feature Importance — Trained Model</CardTitle>
          <CardDescription className="text-xs">
            Mean absolute SHAP values from XGBoost meta-classifier trained on 50,000 patient windows
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {SHAP_FEATURES.map((f, i) => (
              <div key={f.key} className="flex items-center gap-3">
                <span className="w-4 flex-shrink-0 text-xs font-bold text-gray-400">{i + 1}</span>
                <span className="w-44 flex-shrink-0 text-xs text-gray-700 dark:text-gray-300 font-medium">{f.feature}</span>
                <div className="flex flex-1 items-center gap-2">
                  <div className="flex-1 h-5 overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
                    <div
                      className="h-full rounded-md transition-all duration-700"
                      style={{
                        width: `${(f.importance / 0.89) * 100}%`,
                        background: i < 3 ? "#0F4C81" : i < 6 ? "#00B4A6" : "#94A3B8",
                      }}
                    />
                  </div>
                  <span className="w-10 text-right text-xs font-bold text-gray-600">{f.importance.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
