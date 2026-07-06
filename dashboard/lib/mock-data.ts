/**
 * RecoverPath — Static Patient Reference Data
 *
 * This file contains ONLY static demographics (name, age, diagnosis, etc.).
 * All live vitals, risk scores, alerts, and anomaly scores come from
 * Firebase Realtime Database (written by src/simulator.py).
 *
 * For local development when Firebase is unavailable, useFallbackData()
 * returns a minimal in-memory snapshot so the UI remains functional.
 */

import type { Patient, Alert, RiskTier } from "./types"

// ── Static patient demographics ───────────────────────────────────────────────
// These never change during a session. Simulator writes risk data separately.
/** Compute actual days since discharge from real wall-clock date */
function daysSince(dateStr: string): number {
  const d = new Date(dateStr)
  const now = new Date()
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86400000))
}

// Discharge dates are real historical dates — daysSinceDischarge is computed live.
// Patients discharged around Jun 26-28, 2026 will show increasing days as time passes.
const _RAW_REGISTRY = [
  { id:"P001", name:"Arjun Sharma",       age:72, diagnosis:"CHF",      diagnosisCode:"I50.0", dischargeDate:"2026-06-26", numMedications:14, numDiagnoses:8, numPriorAdmissions:2, diabetesFlag:false, copdFlag:false, chfFlag:true  },
  { id:"P002", name:"Kavitha Nair",        age:68, diagnosis:"COPD",     diagnosisCode:"J44.1", dischargeDate:"2026-06-24", numMedications:11, numDiagnoses:7, numPriorAdmissions:1, diabetesFlag:false, copdFlag:true,  chfFlag:false },
  { id:"P003", name:"Rajan Pillai",        age:77, diagnosis:"CHF",      diagnosisCode:"I50.0", dischargeDate:"2026-06-27", numMedications:16, numDiagnoses:9, numPriorAdmissions:3, diabetesFlag:false, copdFlag:false, chfFlag:true  },
  { id:"P004", name:"Sunita Rao",          age:64, diagnosis:"Diabetes", diagnosisCode:"E11.9", dischargeDate:"2026-06-21", numMedications:10, numDiagnoses:5, numPriorAdmissions:1, diabetesFlag:true,  copdFlag:false, chfFlag:false },
  { id:"P005", name:"Mohan Das",           age:71, diagnosis:"COPD",     diagnosisCode:"J44.1", dischargeDate:"2026-06-23", numMedications:12, numDiagnoses:6, numPriorAdmissions:2, diabetesFlag:false, copdFlag:true,  chfFlag:false },
  { id:"P006", name:"Priya Krishnan",      age:59, diagnosis:"CHF",      diagnosisCode:"I50.0", dischargeDate:"2026-06-18", numMedications:9,  numDiagnoses:7, numPriorAdmissions:1, diabetesFlag:false, copdFlag:false, chfFlag:true  },
  { id:"P007", name:"Venkat Iyer",         age:66, diagnosis:"CHF",      diagnosisCode:"I50.0", dischargeDate:"2026-06-25", numMedications:13, numDiagnoses:8, numPriorAdmissions:2, diabetesFlag:false, copdFlag:false, chfFlag:true  },
  { id:"P008", name:"Lakshmi Devi",        age:74, diagnosis:"COPD",     diagnosisCode:"J44.1", dischargeDate:"2026-06-22", numMedications:10, numDiagnoses:6, numPriorAdmissions:1, diabetesFlag:false, copdFlag:true,  chfFlag:false },
  { id:"P009", name:"Ashok Patel",         age:58, diagnosis:"Diabetes", diagnosisCode:"E11.9", dischargeDate:"2026-06-16", numMedications:8,  numDiagnoses:4, numPriorAdmissions:0, diabetesFlag:true,  copdFlag:false, chfFlag:false },
  { id:"P010", name:"Meena Agarwal",       age:62, diagnosis:"PostSurg", diagnosisCode:"Z96.9", dischargeDate:"2026-06-19", numMedications:7,  numDiagnoses:4, numPriorAdmissions:0, diabetesFlag:false, copdFlag:false, chfFlag:false },
  { id:"P011", name:"Rajesh Kumar",        age:55, diagnosis:"COPD",     diagnosisCode:"J44.1", dischargeDate:"2026-06-14", numMedications:9,  numDiagnoses:5, numPriorAdmissions:1, diabetesFlag:false, copdFlag:true,  chfFlag:false },
  { id:"P012", name:"Deepa Menon",         age:67, diagnosis:"CHF",      diagnosisCode:"I50.0", dischargeDate:"2026-06-11", numMedications:11, numDiagnoses:7, numPriorAdmissions:2, diabetesFlag:false, copdFlag:false, chfFlag:true  },
  { id:"P013", name:"Suresh Nambiar",      age:70, diagnosis:"Diabetes", diagnosisCode:"E11.9", dischargeDate:"2026-06-17", numMedications:9,  numDiagnoses:5, numPriorAdmissions:1, diabetesFlag:true,  copdFlag:false, chfFlag:false },
  { id:"P014", name:"Geetha Subramanian",  age:63, diagnosis:"PostSurg", diagnosisCode:"Z96.9", dischargeDate:"2026-06-12", numMedications:6,  numDiagnoses:4, numPriorAdmissions:0, diabetesFlag:false, copdFlag:false, chfFlag:false },
  { id:"P015", name:"Harish Bose",         age:56, diagnosis:"COPD",     diagnosisCode:"J44.1", dischargeDate:"2026-06-09", numMedications:8,  numDiagnoses:5, numPriorAdmissions:0, diabetesFlag:false, copdFlag:true,  chfFlag:false },
  { id:"P016", name:"Ananya Singh",        age:48, diagnosis:"Diabetes", diagnosisCode:"E11.9", dischargeDate:"2026-06-20", numMedications:7,  numDiagnoses:4, numPriorAdmissions:0, diabetesFlag:true,  copdFlag:false, chfFlag:false },
  { id:"P017", name:"Prakash Reddy",       age:61, diagnosis:"CHF",      diagnosisCode:"I50.0", dischargeDate:"2026-06-08", numMedications:10, numDiagnoses:6, numPriorAdmissions:1, diabetesFlag:false, copdFlag:false, chfFlag:true  },
  { id:"P018", name:"Usha Krishnamurthy",  age:69, diagnosis:"PostSurg", diagnosisCode:"Z96.9", dischargeDate:"2026-06-13", numMedications:8,  numDiagnoses:5, numPriorAdmissions:0, diabetesFlag:false, copdFlag:false, chfFlag:false },
  { id:"P019", name:"Vijay Shankar",       age:52, diagnosis:"Diabetes", diagnosisCode:"E11.9", dischargeDate:"2026-06-06", numMedications:6,  numDiagnoses:3, numPriorAdmissions:0, diabetesFlag:true,  copdFlag:false, chfFlag:false },
  { id:"P020", name:"Radha Balakrishnan",  age:57, diagnosis:"PostSurg", diagnosisCode:"Z96.9", dischargeDate:"2026-06-10", numMedications:5,  numDiagnoses:3, numPriorAdmissions:0, diabetesFlag:false, copdFlag:false, chfFlag:false },
  { id:"P021", name:"Naresh Choudhary",    age:44, diagnosis:"Diabetes", diagnosisCode:"E11.9", dischargeDate:"2026-06-04", numMedications:7,  numDiagnoses:3, numPriorAdmissions:0, diabetesFlag:true,  copdFlag:false, chfFlag:false },
  { id:"P022", name:"Sarala Iyer",         age:60, diagnosis:"COPD",     diagnosisCode:"J44.1", dischargeDate:"2026-06-07", numMedications:9,  numDiagnoses:5, numPriorAdmissions:1, diabetesFlag:false, copdFlag:true,  chfFlag:false },
  { id:"P023", name:"Dinesh Nair",         age:49, diagnosis:"PostSurg", diagnosisCode:"Z96.9", dischargeDate:"2026-06-02", numMedications:6,  numDiagnoses:3, numPriorAdmissions:0, diabetesFlag:false, copdFlag:false, chfFlag:false },
  { id:"P024", name:"Padma Venkatesh",     age:65, diagnosis:"CHF",      diagnosisCode:"I50.0", dischargeDate:"2026-06-05", numMedications:10, numDiagnoses:6, numPriorAdmissions:1, diabetesFlag:false, copdFlag:false, chfFlag:true  },
  { id:"P025", name:"Ramesh Joshi",        age:53, diagnosis:"Diabetes", diagnosisCode:"E11.9", dischargeDate:"2026-06-03", numMedications:8,  numDiagnoses:4, numPriorAdmissions:0, diabetesFlag:true,  copdFlag:false, chfFlag:false },
]

export const PATIENT_REGISTRY: Record<string, {
  id: string; name: string; age: number; diagnosis: string
  diagnosisCode: string; dischargeDate: string; daysSinceDischarge: number
  numMedications: number; numDiagnoses: number; numPriorAdmissions: number
  diabetesFlag: boolean; copdFlag: boolean; chfFlag: boolean
}> = Object.fromEntries(
  _RAW_REGISTRY.map(r => [r.id, { ...r, daysSinceDischarge: daysSince(r.dischargeDate) }])
)

export const PATIENT_IDS = Object.keys(PATIENT_REGISTRY)

// ── SHAP feature importance (from trained model — never changes) ───────────────
export const SHAP_FEATURES = [
  { feature: "HRV SDNN",           key: "hrv_sdnn",               importance: 0.89 },
  { feature: "SpO2 Mean",          key: "spo2_mean",              importance: 0.74 },
  { feature: "BioZ Trend 24hr",    key: "bioz_ohms_trend_24hr",   importance: 0.68 },
  { feature: "SpO2 <92% Time",     key: "spo2_time_below_92_pct", importance: 0.61 },
  { feature: "AFib Days",          key: "afib_days_in_window",    importance: 0.54 },
  { feature: "AFib % Readings",    key: "afib_pct_readings",      importance: 0.48 },
  { feature: "Cough Sum 24hr",     key: "cough_sum_24hr",         importance: 0.43 },
  { feature: "Resp Rate (IMU)",    key: "rr_imu_mean",            importance: 0.38 },
  { feature: "Days Since Discharge", key: "days_since_discharge", importance: 0.34 },
  { feature: "Cough Trend 6hr",   key: "cough_trend_6hr",         importance: 0.29 },
]

// ── 30-day trend (historical — static for analytics chart) ────────────────────
export const MOCK_DAILY_RISK = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.now() - (29 - i) * 86400000)
  const base = 38
  const noise = Math.sin(i * 0.5) * 8 + (Math.random() - 0.5) * 6
  return {
    date: d.toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
    avgRisk: Math.round(Math.max(15, Math.min(75, base + noise)) * 10) / 10,
  }
})

// ── Fallback snapshot generator ───────────────────────────────────────────────
// Used when Firebase is unavailable (NEXT_PUBLIC_APP_ENV=development + no creds)
// Produces minimal Patient objects with plausible but static risk values.

let _rngSeed = 0xA1B2C3D4
function _rand(): number {
  _rngSeed ^= _rngSeed << 13; _rngSeed ^= _rngSeed >> 17; _rngSeed ^= _rngSeed << 5
  return (_rngSeed >>> 0) / 4294967296
}

function _fallbackVitals(diag: string, tier: RiskTier, n = 120) {
  // Clinically calibrated baselines per condition + tier
  const baseSpo2  = tier === "CRITICAL" ? 88.5 : tier === "HIGH" ? 92.5 : tier === "MEDIUM" ? 95.0 : 97.0
  const baseHrv   = tier === "CRITICAL" ? 13   : tier === "HIGH" ? 22   : tier === "MEDIUM" ? 32   : 45
  const baseHr    = diag === "CHF" ? 90  : diag === "COPD" ? 85  : 76
  const baseBioz  = diag === "CHF" ? 410 : 425
  const baseRr    = diag === "COPD" ? 22 : diag === "CHF" ? 18 : 15
  const baseCough = diag === "COPD" ? 3  : 0.3

  // Latest reading is at t=now; oldest is n*60s ago (1 reading per minute)
  const now = Date.now()
  return Array.from({ length: n }, (_, i) => ({
    // i=0 is oldest, i=n-1 is most recent (just now)
    timestamp: new Date(now - (n - 1 - i) * 60 * 1000).toISOString(),
    minuteOffset: i,
    spo2:      Math.min(100, Math.max(70, baseSpo2  + (_rand() - 0.5) * 1.8)),
    hrEcg:     Math.max(40,             baseHr     + (_rand() - 0.5) * 8),
    hrPpg:     Math.max(40,             baseHr     + (_rand() - 0.5) * 8),
    hrvSdnn:   Math.max(5,              baseHrv    + (_rand() - 0.5) * 6),
    // BioZ trends UP for CHF CRITICAL (fluid accumulation)
    biozOhms:  baseBioz + (_rand() - 0.5) * 6 + (tier === "CRITICAL" && diag === "CHF" ? i * 0.05 : 0),
    rrImu:     Math.max(8, Math.min(35, baseRr     + (_rand() - 0.5) * 2)),
    coughCount: Math.max(0, Math.round(baseCough * (_rand() * 2.5))),
    afibFlag:  tier === "CRITICAL" && _rand() < 0.25 ? 1 : 0,
  }))
}

export function buildFallbackPatients(): Patient[] {
  const tierAssign: Record<string, RiskTier> = {
    P001:"CRITICAL", P002:"CRITICAL", P003:"CRITICAL",
    P004:"HIGH",     P005:"HIGH",     P006:"HIGH",     P007:"HIGH",    P008:"HIGH",
    P009:"MEDIUM",   P010:"MEDIUM",   P011:"MEDIUM",   P012:"MEDIUM",  P013:"MEDIUM",
    P014:"MEDIUM",   P015:"MEDIUM",   P016:"MEDIUM",   P017:"MEDIUM",  P018:"MEDIUM",
    P019:"LOW",      P020:"LOW",      P021:"LOW",       P022:"LOW",     P023:"LOW",
    P024:"LOW",      P025:"LOW",
  }

  const actionMap: Record<RiskTier, string> = {
    CRITICAL: "Immediate intervention — contact patient now",
    HIGH:     "Contact patient and discharging physician today",
    MEDIUM:   "Schedule telemedicine check-in within 48hrs",
    LOW:      "Continue routine monitoring",
  }

  return Object.values(PATIENT_REGISTRY).map(reg => {
    const tier = tierAssign[reg.id] ?? "MEDIUM"
    const riskScore = tier === "CRITICAL" ? 75 + _rand() * 20
                    : tier === "HIGH"     ? 50 + _rand() * 24
                    : tier === "MEDIUM"   ? 25 + _rand() * 24
                    :                       5  + _rand() * 19
    const vitals = _fallbackVitals(reg.diagnosis, tier)
    const lastVital = vitals[vitals.length - 1]

    const alerts: string[] = []
    if (lastVital.spo2 < 92) alerts.push(`SpO2 ${lastVital.spo2.toFixed(1)}% — below threshold`)
    if (lastVital.hrvSdnn < 20) alerts.push(`HRV SDNN ${lastVital.hrvSdnn.toFixed(0)}ms — critically low`)
    if (alerts.length === 0) alerts.push("All vitals within acceptable range")

    return {
      id: reg.id,
      name: reg.name,
      age: reg.age,
      diagnosis: reg.diagnosis,
      diagnosisCode: reg.diagnosisCode,
      dischargeDate: reg.dischargeDate,
      daysSinceDischarge: reg.daysSinceDischarge,
      riskScore: Math.round(riskScore * 10) / 10,
      riskTier: tier,
      riskProbability: riskScore / 100,
      anomalyScores: {
        cardiac: tier === "CRITICAL" ? 0.7 + _rand() * 0.25 : 0.1 + _rand() * 0.4,
        respiratory: tier === "CRITICAL" ? 0.65 + _rand() * 0.3 : 0.1 + _rand() * 0.4,
        fluid: reg.chfFlag ? 0.5 + _rand() * 0.4 : 0.05 + _rand() * 0.3,
        activity: 0.1 + _rand() * 0.5,
      },
      triggeredAlerts: alerts,
      recommendedAction: actionMap[tier],
      topRiskFeatures: ["hrv_sdnn","spo2_mean","bioz_ohms_trend_24hr","afib_days_in_window","cough_sum_24hr"],
      // lastUpdated is real: within the last 2 minutes (simulating a recent update cycle)
      lastUpdated: new Date(Date.now() - Math.floor(_rand() * 120) * 1000).toISOString(),
      flaggedForFollowUp: tier === "CRITICAL",
      careCoordinatorNotes: "",
      vitals,
      age_num: reg.age,
      numMedications: reg.numMedications,
      numDiagnoses: reg.numDiagnoses,
      diabetesFlag: reg.diabetesFlag,
      copdFlag: reg.copdFlag,
      chfFlag: reg.chfFlag,
      numPriorAdmissions: reg.numPriorAdmissions,
    }
  }).sort((a, b) => b.riskScore - a.riskScore)
}

// ── Fallback alerts ───────────────────────────────────────────────────────────
export function buildFallbackAlerts(patients: Patient[]) {
  let seq = 0
  return patients
    .filter(p => p.riskTier === "CRITICAL" || p.riskTier === "HIGH")
    .flatMap(p =>
      p.triggeredAlerts.slice(0, 2).map((msg, i) => ({
        id: `ALT${String(++seq).padStart(4,"0")}`,
        patientId: p.id,
        patientName: p.name,
        riskTier: p.riskTier,
        message: msg,
        timestamp: new Date(Date.now() - (i + 1) * 8 * 60000).toISOString(),
        acknowledged: false,
      }))
    )
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}
