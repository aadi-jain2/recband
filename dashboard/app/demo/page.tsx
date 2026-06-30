"use client"
import { useState } from "react"
import Link from "next/link"
import {
  Activity, Heart, Wind, Droplets, AlertCircle,
  ArrowRight, Zap, Shield, TrendingUp, Cpu,
} from "lucide-react"
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { RiskBadge } from "@/components/dashboard/risk-badge"
import { RiskGauge } from "@/components/dashboard/risk-gauge"
import { buildFallbackPatients } from "@/lib/mock-data"

const criticalPatient = buildFallbackPatients().find(p => p.riskTier === "CRITICAL")!

function DemoBanner() {
  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full border border-yellow-300 bg-yellow-50 px-4 py-2 text-xs font-semibold text-yellow-700 shadow-lg backdrop-blur-sm">
        <Zap className="h-3.5 w-3.5" />
        DEMO MODE — Simulated Patient Data · Not for clinical use
      </div>
    </div>
  )
}

const chartData = criticalPatient.vitals
  .filter((_, i) => i % 4 === 0)
  .map(v => ({
    t: new Date(v.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    spo2: v.spo2,
    hrv: v.hrvSdnn,
    bioz: v.biozOhms,
    hr: v.hrEcg,
  }))

export default function DemoPage() {
  const [tab, setTab] = useState<"patient" | "overview">("patient")

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DemoBanner />

      {/* Top nav */}
      <header className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0F4C81]">
              <Activity className="h-4 w-4 text-white" />
            </div>
            <span className="text-base font-bold text-gray-900 dark:text-gray-100">RecoverPath</span>
            <span className="ml-1 rounded-full bg-[#00B4A6]/15 px-2 py-0.5 text-[10px] font-semibold text-[#00B4A6]">DEMO</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-full border border-gray-200 p-0.5">
              {(["patient", "overview"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                    tab === t ? "bg-[#0F4C81] text-white" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {t === "patient" ? "Patient Detail" : "Overview"}
                </button>
              ))}
            </div>
            <Link href="/login">
              <Button size="sm" className="gap-1.5">
                Enter Dashboard <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-6 pb-20">
        {tab === "patient" ? <PatientDemoView /> : <OverviewDemoView />}
      </div>
    </div>
  )
}

// ── Critical Patient View ─────────────────────────────────────────────────────

function PatientDemoView() {
  return (
    <div className="space-y-5">
      {/* Hero */}
      <Card className="border-2 border-red-300 bg-red-50/30">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0F4C81] text-base font-bold text-white">
                {criticalPatient.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-gray-900">{criticalPatient.name}</h2>
                  <RiskBadge tier="CRITICAL" pulse />
                </div>
                <p className="text-sm text-gray-600">
                  {criticalPatient.age} years · {criticalPatient.diagnosis} · Discharged {criticalPatient.daysSinceDischarge} days ago
                </p>
                <p className="mt-1 text-xs text-red-600 font-semibold">
                  {criticalPatient.recommendedAction}
                </p>
              </div>
            </div>
            <RiskGauge score={criticalPatient.riskScore} tier="CRITICAL" size={130} />
          </div>

          {/* Anomaly bars */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Cardiac",     icon: Heart,    score: criticalPatient.anomalyScores.cardiac,     color: "#DC2626" },
              { label: "Respiratory", icon: Wind,     score: criticalPatient.anomalyScores.respiratory, color: "#0F4C81" },
              { label: "Fluid",       icon: Droplets, score: criticalPatient.anomalyScores.fluid,       color: "#00B4A6" },
              { label: "Activity",    icon: Activity, score: criticalPatient.anomalyScores.activity,    color: "#7C3AED" },
            ].map(a => (
              <div key={a.label} className="rounded-lg bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-600">{a.label}</span>
                  <span className="text-sm font-bold" style={{ color: a.color }}>{(a.score * 100).toFixed(0)}</span>
                </div>
                <Progress value={a.score * 100} indicatorColor={a.color} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ChartCard title="SpO2 (%)" color="#0F4C81" refY={92} refLabel="92%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#0F4C81" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#0F4C81" stopOpacity={0}   />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="t" tick={{ fontSize: 9 }} interval={8} />
            <YAxis domain={[80, 100]} tick={{ fontSize: 9 }} />
            <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`, "SpO2"]} />
            <ReferenceLine y={92} stroke="#DC2626" strokeDasharray="4 2" />
            <Area dataKey="spo2" stroke="#0F4C81" fill="url(#g1)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ChartCard>

        <ChartCard title="HRV SDNN (ms)" color="#7C3AED" refY={20} refLabel="20ms">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#7C3AED" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#7C3AED" stopOpacity={0}   />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="t" tick={{ fontSize: 9 }} interval={8} />
            <YAxis tick={{ fontSize: 9 }} />
            <Tooltip formatter={(v) => [`${Number(v).toFixed(0)} ms`, "HRV"]} />
            <ReferenceLine y={20} stroke="#DC2626" strokeDasharray="4 2" />
            <Area dataKey="hrv" stroke="#7C3AED" fill="url(#g2)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ChartCard>

        <ChartCard title="Bioimpedance (Ω)" color="#00B4A6">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="t" tick={{ fontSize: 9 }} interval={8} />
            <YAxis tick={{ fontSize: 9 }} />
            <Tooltip formatter={(v) => [`${Number(v).toFixed(1)} Ω`, "BioZ"]} />
            <Line dataKey="bioz" stroke="#00B4A6" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartCard>
      </div>

      {/* Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertCircle className="h-4 w-4 text-red-500" />
            Active Clinical Alerts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {criticalPatient.triggeredAlerts.map((a, i) => (
            <div key={i} className={`rounded-lg border px-3 py-2 text-xs ${
              i === 0 ? "border-red-200 bg-red-50 text-red-700 font-medium" : "border-gray-100 bg-gray-50 text-gray-600"
            }`}>
              {a}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Overview mini-view ────────────────────────────────────────────────────────

function OverviewDemoView() {
  const allPatients = buildFallbackPatients()
  const tiers = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
  allPatients.forEach(p => tiers[p.riskTier]++)

  const features = [
    { label: "5-sensor wearable", icon: Cpu,        desc: "ECG · PPG · BioZ · IMU · Mic" },
    { label: "ML Risk Scoring",   icon: Brain2,      desc: "AUC-ROC 0.81, Sensitivity 82.7%" },
    { label: "Real-time Firebase",icon: Zap,         desc: "60-second update intervals" },
    { label: "Edge AI on device", icon: Shield,      desc: "11.9KB TFLite cough classifier" },
    { label: "Clinical Dashboard",icon: TrendingUp,  desc: "Role-based, alert-driven" },
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(["CRITICAL","HIGH","MEDIUM","LOW"] as const).map(t => (
          <Card key={t} className={t === "CRITICAL" ? "border-red-300 bg-red-50" : ""}>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold" style={{ color: t === "CRITICAL" ? "#DC2626" : t === "HIGH" ? "#EA580C" : t === "MEDIUM" ? "#CA8A04" : "#16A34A" }}>
                {tiers[t]}
              </p>
              <p className="text-xs font-semibold text-gray-500 mt-1">{t}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {features.map(f => (
          <Card key={f.label}>
            <CardContent className="flex flex-col items-center p-4 text-center">
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F4C81]/10">
                <f.icon className="h-5 w-5 text-[#0F4C81]" />
              </div>
              <p className="text-xs font-semibold text-gray-800">{f.label}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{f.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-xl bg-gradient-to-r from-[#0F4C81] to-[#00B4A6] p-6 text-white">
        <p className="text-sm font-semibold mb-1 opacity-80">Next: See patient dashboard</p>
        <p className="text-xl font-bold mb-4">
          Predicting 30-day readmissions with 82.7% sensitivity
        </p>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.location.href = "/dashboard"}
          >
            Full Dashboard
          </Button>
          <Button
            className="bg-white/20 text-white hover:bg-white/30"
            size="sm"
            onClick={() => document.querySelector<HTMLButtonElement>("button")?.click()}
          >
            View Critical Patient
          </Button>
        </div>
      </div>
    </div>
  )
}

function ChartCard({ title, color, refY, refLabel, children }: {
  title: string; color: string; refY?: number; refLabel?: string; children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center gap-2 text-xs">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <ResponsiveContainer width="100%" height={150}>
          {children as React.ReactElement}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

// Inline icon component
function Brain2({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3l.34-.1A2.5 2.5 0 0 1 9.5 2Z"/>
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3l-.34-.1A2.5 2.5 0 0 0 14.5 2Z"/>
    </svg>
  )
}
