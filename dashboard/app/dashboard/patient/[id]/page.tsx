"use client"
import { useState } from "react"
import { use } from "react"
import Link from "next/link"
import {
  ArrowLeft, Heart, Wind, Droplets, Activity, Mic2,
  AlertCircle, BookOpen, Calendar, Phone, UserCheck, FileText,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react"
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { RiskBadge } from "@/components/dashboard/risk-badge"
import { RiskGauge } from "@/components/dashboard/risk-gauge"
import { usePatient } from "@/lib/use-patient-data"
import { formatRelativeTime, cn } from "@/lib/utils"
import type { VitalReading } from "@/lib/types"

interface PageProps { params: Promise<{ id: string }> }

const CHART_COLORS = {
  spo2:    "#0F4C81",
  hr:      "#DC2626",
  hrv:     "#7C3AED",
  bioz:    "#00B4A6",
  rr:      "#EA580C",
  cough:   "#CA8A04",
}

function trimVitals(vitals: VitalReading[], every = 3) {
  return vitals.filter((_, i) => i % every === 0).map(v => ({
    ...v,
    t: new Date(v.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
  }))
}

function AnomalyCard({
  label, icon: Icon, score, color, bgColor,
}: { label: string; icon: React.ElementType; score: number; color: string; bgColor: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${bgColor}`}>
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
          <span className={`text-lg font-bold ${color}`}>{(score * 100).toFixed(0)}</span>
        </div>
        <p className="mb-2 text-xs font-semibold text-gray-600 dark:text-gray-400">{label}</p>
        <Progress
          value={score * 100}
          indicatorColor={
            score > 0.7 ? "#DC2626" : score > 0.45 ? "#EA580C" : score > 0.25 ? "#CA8A04" : "#16A34A"
          }
        />
        <div className="mt-1.5 flex justify-between text-[10px] text-gray-400">
          <span>Normal</span>
          <span>Anomalous</span>
        </div>
      </CardContent>
    </Card>
  )
}

export default function PatientDetailPage({ params }: PageProps) {
  const { id } = use(params)
  const { patient, loading } = usePatient(id)
  const [notes, setNotes] = useState("")
  const [notesSaved, setNotesSaved] = useState(false)

  if (loading) return <PatientDetailSkeleton />
  if (!patient) return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
      <AlertCircle className="mb-3 h-10 w-10" />
      <p className="text-lg font-semibold">Patient not found</p>
      <Link href="/dashboard"><Button variant="outline" className="mt-4">Back to Overview</Button></Link>
    </div>
  )

  const chartData = trimVitals(patient.vitals)

  const saveNotes = () => {
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 3000)
  }

  const biozTrend = patient.vitals.length >= 2
    ? patient.vitals[patient.vitals.length - 1].biozOhms - patient.vitals[0].biozOhms
    : 0

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to Patient Overview
      </Link>

      {/* Hero card */}
      <Card className={cn(
        "border-2",
        patient.riskTier === "CRITICAL" ? "border-red-300 bg-red-50/30 dark:border-red-800 dark:bg-red-950/10" :
        patient.riskTier === "HIGH"     ? "border-orange-200 dark:border-orange-800" : "border-gray-200",
      )}>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            {/* Patient info */}
            <div className="flex items-start gap-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0F4C81] text-lg font-bold text-white">
                {patient.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{patient.name}</h1>
                  <RiskBadge tier={patient.riskTier} pulse={patient.riskTier === "CRITICAL"} />
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                  <span>{patient.age} years</span>
                  <span>·</span>
                  <span className="font-medium text-gray-700">{patient.diagnosis}</span>
                  <span className="text-gray-400 text-xs">{patient.diagnosisCode}</span>
                  <span>·</span>
                  <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Discharged {patient.dischargeDate}</span>
                  <span className="font-semibold text-orange-600">{patient.daysSinceDischarge} days ago</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 text-xs text-gray-400">
                  <span>{patient.numMedications} medications</span>
                  <span>·</span>
                  <span>{patient.numDiagnoses} diagnoses</span>
                  <span>·</span>
                  <span>{patient.numPriorAdmissions} prior admissions (90d)</span>
                </div>
              </div>
            </div>

            {/* Risk gauge */}
            <div className="flex flex-col items-center gap-2">
              <RiskGauge score={patient.riskScore} tier={patient.riskTier} />
              <p className="text-xs text-gray-500">30-day Readmission Risk</p>
            </div>
          </div>

          {/* Action box */}
          <div className={cn(
            "mt-4 rounded-xl border px-4 py-3",
            patient.riskTier === "CRITICAL" ? "border-red-300 bg-red-100 dark:border-red-700 dark:bg-red-950/30" :
            patient.riskTier === "HIGH"     ? "border-orange-200 bg-orange-50 dark:border-orange-700 dark:bg-orange-950/20" :
                                               "border-gray-200 bg-gray-50",
          )}>
            <div className="flex items-center gap-2">
              <AlertCircle className={cn(
                "h-4 w-4",
                patient.riskTier === "CRITICAL" ? "text-red-600" :
                patient.riskTier === "HIGH"     ? "text-orange-600" : "text-gray-400",
              )} />
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {patient.recommendedAction}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Anomaly scores */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <AnomalyCard label="Cardiac"     icon={Heart}    score={patient.anomalyScores.cardiac}     color="text-red-600"    bgColor="bg-red-50" />
        <AnomalyCard label="Respiratory" icon={Wind}     score={patient.anomalyScores.respiratory} color="text-blue-600"   bgColor="bg-blue-50" />
        <AnomalyCard label="Fluid"       icon={Droplets} score={patient.anomalyScores.fluid}       color="text-teal-600"   bgColor="bg-teal-50" />
        <AnomalyCard label="Activity"    icon={Activity} score={patient.anomalyScores.activity}    color="text-purple-600" bgColor="bg-purple-50" />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* SpO2 */}
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center gap-2 text-sm">
              <span className="h-3 w-3 rounded-full" style={{ background: CHART_COLORS.spo2 }} />
              SpO2 (%) — Last 24 Hours
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="spo2grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.spo2} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={CHART_COLORS.spo2} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="t" tick={{ fontSize: 10 }} interval={11} />
                <YAxis domain={[80, 100]} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`, "SpO2"]} />
                <ReferenceLine y={92} stroke="#DC2626" strokeDasharray="4 2" label={{ value: "92% threshold", fontSize: 9, fill: "#DC2626" }} />
                <Area dataKey="spo2" stroke={CHART_COLORS.spo2} fill="url(#spo2grad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Heart Rate */}
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center gap-2 text-sm">
              <span className="h-3 w-3 rounded-full" style={{ background: CHART_COLORS.hr }} />
              Heart Rate — ECG (bpm)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="t" tick={{ fontSize: 10 }} interval={11} />
                <YAxis domain={[40, 160]} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => [`${Number(v).toFixed(0)} bpm`, "HR ECG"]} />
                <ReferenceLine y={60}  stroke="#16A34A" strokeDasharray="3 2" />
                <ReferenceLine y={100} stroke="#EA580C" strokeDasharray="3 2" />
                <Line dataKey="hrEcg" stroke={CHART_COLORS.hr} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* HRV SDNN */}
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center gap-2 text-sm">
              <span className="h-3 w-3 rounded-full" style={{ background: CHART_COLORS.hrv }} />
              HRV SDNN (ms) — Cardiac Stress
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="hrvgrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.hrv} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={CHART_COLORS.hrv} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="t" tick={{ fontSize: 10 }} interval={11} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => [`${Number(v).toFixed(0)} ms`, "HRV SDNN"]} />
                <ReferenceLine y={20} stroke="#DC2626" strokeDasharray="4 2" label={{ value: "20ms warning", fontSize: 9, fill: "#DC2626" }} />
                <Area dataKey="hrvSdnn" stroke={CHART_COLORS.hrv} fill="url(#hrvgrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Bioimpedance */}
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center gap-2 text-sm">
              <span className="h-3 w-3 rounded-full" style={{ background: CHART_COLORS.bioz }} />
              Bioimpedance (ohms) — Fluid Retention
              {biozTrend > 3 ? (
                <span className="ml-auto flex items-center gap-1 text-xs font-normal text-red-500">
                  <TrendingDown className="h-3.5 w-3.5" /> +{biozTrend.toFixed(1)}Ω
                </span>
              ) : biozTrend < -3 ? (
                <span className="ml-auto flex items-center gap-1 text-xs font-normal text-green-500">
                  <TrendingUp className="h-3.5 w-3.5" /> {biozTrend.toFixed(1)}Ω
                </span>
              ) : (
                <span className="ml-auto flex items-center gap-1 text-xs font-normal text-gray-400">
                  <Minus className="h-3.5 w-3.5" /> stable
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="t" tick={{ fontSize: 10 }} interval={11} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => [`${Number(v).toFixed(1)} Ω`, "BioZ"]} />
                <Line dataKey="biozOhms" stroke={CHART_COLORS.bioz} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Respiratory Rate */}
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center gap-2 text-sm">
              <span className="h-3 w-3 rounded-full" style={{ background: CHART_COLORS.rr }} />
              Respiratory Rate — IMU (bpm)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="t" tick={{ fontSize: 10 }} interval={11} />
                <YAxis domain={[8, 35]} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => [`${Number(v).toFixed(0)} bpm`, "RR"]} />
                <ReferenceLine y={24} stroke="#DC2626" strokeDasharray="4 2" label={{ value: "24 bpm warning", fontSize: 9, fill: "#DC2626" }} />
                <Line dataKey="rrImu" stroke={CHART_COLORS.rr} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Cough count */}
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center gap-2 text-sm">
              <span className="h-3 w-3 rounded-full" style={{ background: CHART_COLORS.cough }} />
              <Mic2 className="h-3.5 w-3.5" /> Cough Count per Interval
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="t" tick={{ fontSize: 10 }} interval={11} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => [Number(v), "Coughs"]} />
                <Bar dataKey="coughCount" fill={CHART_COLORS.cough} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Alerts */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 text-red-500" />
              Active Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {patient.triggeredAlerts.map((alert, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs",
                  i === 0 && patient.riskTier === "CRITICAL"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-gray-100 bg-gray-50 text-gray-600",
                )}
              >
                {alert}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* SHAP features */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-purple-500" />
              Top Risk Drivers (SHAP)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {patient.topRiskFeatures.map((feat, i) => (
              <div key={feat} className="flex items-center gap-3">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 text-[10px] font-bold text-purple-700">
                  {i + 1}
                </span>
                <span className="flex-1 text-xs text-gray-700 dark:text-gray-300 font-mono">{feat}</span>
                <div
                  className="h-1.5 rounded-full bg-purple-400"
                  style={{ width: `${(1 - i * 0.18) * 60}px` }}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Notes + Actions */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <BookOpen className="h-4 w-4 text-[#0F4C81]" />
              Care Coordinator Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <Textarea
              placeholder="Add clinical notes, observations, or follow-up actions…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="min-h-20 text-xs"
            />
            <Button size="sm" onClick={saveNotes} className="w-full">
              {notesSaved ? <><UserCheck className="h-3.5 w-3.5" /> Saved!</> : "Save Notes"}
            </Button>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                <Phone className="h-3.5 w-3.5" /> Telemedicine
              </Button>
              <Button size="sm" variant="destructive" className="gap-1.5 text-xs">
                <AlertCircle className="h-3.5 w-3.5" /> Alert Physician
              </Button>
              <Button size="sm" variant="secondary" className="gap-1.5 text-xs">
                <UserCheck className="h-3.5 w-3.5" /> Mark Resolved
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                <FileText className="h-3.5 w-3.5" /> Export PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function PatientDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-40 w-full" />
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <div className="grid grid-cols-2 gap-5">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-56" />)}
      </div>
    </div>
  )
}
