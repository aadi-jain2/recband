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
export const PATIENT_REGISTRY: Record<string, {
  id: string; name: string; age: number; diagnosis: string
  diagnosisCode: string; dischargeDate: string; daysSinceDischarge: number
  numMedications: number; numDiagnoses: number; numPriorAdmissions: number
  diabetesFlag: boolean; copdFlag: boolean; chfFlag: boolean
}> = {
  P001: { id:"P001", name:"Arjun Sharma",       age:72, diagnosis:"CHF",      diagnosisCode:"I50.0", dischargeDate:"2026-06-26", daysSinceDischarge:4,  numMedications:14, numDiagnoses:8, numPriorAdmissions:2, diabetesFlag:false, copdFlag:false, chfFlag:true  },
  P002: { id:"P002", name:"Kavitha Nair",        age:68, diagnosis:"COPD",     diagnosisCode:"J44.1", dischargeDate:"2026-06-24", daysSinceDischarge:6,  numMedications:11, numDiagnoses:7, numPriorAdmissions:1, diabetesFlag:false, copdFlag:true,  chfFlag:false },
  P003: { id:"P003", name:"Rajan Pillai",        age:77, diagnosis:"CHF",      diagnosisCode:"I50.0", dischargeDate:"2026-06-27", daysSinceDischarge:3,  numMedications:16, numDiagnoses:9, numPriorAdmissions:3, diabetesFlag:false, copdFlag:false, chfFlag:true  },
  P004: { id:"P004", name:"Sunita Rao",          age:64, diagnosis:"Diabetes", diagnosisCode:"E11.9", dischargeDate:"2026-06-21", daysSinceDischarge:9,  numMedications:10, numDiagnoses:5, numPriorAdmissions:1, diabetesFlag:true,  copdFlag:false, chfFlag:false },
  P005: { id:"P005", name:"Mohan Das",           age:71, diagnosis:"COPD",     diagnosisCode:"J44.1", dischargeDate:"2026-06-23", daysSinceDischarge:7,  numMedications:12, numDiagnoses:6, numPriorAdmissions:2, diabetesFlag:false, copdFlag:true,  chfFlag:false },
  P006: { id:"P006", name:"Priya Krishnan",      age:59, diagnosis:"CHF",      diagnosisCode:"I50.0", dischargeDate:"2026-06-18", daysSinceDischarge:12, numMedications:9,  numDiagnoses:7, numPriorAdmissions:1, diabetesFlag:false, copdFlag:false, chfFlag:true  },
  P007: { id:"P007", name:"Venkat Iyer",         age:66, diagnosis:"CHF",      diagnosisCode:"I50.0", dischargeDate:"2026-06-25", daysSinceDischarge:5,  numMedications:13, numDiagnoses:8, numPriorAdmissions:2, diabetesFlag:false, copdFlag:false, chfFlag:true  },
  P008: { id:"P008", name:"Lakshmi Devi",        age:74, diagnosis:"COPD",     diagnosisCode:"J44.1", dischargeDate:"2026-06-22", daysSinceDischarge:8,  numMedications:10, numDiagnoses:6, numPriorAdmissions:1, diabetesFlag:false, copdFlag:true,  chfFlag:false },
  P009: { id:"P009", name:"Ashok Patel",         age:58, diagnosis:"Diabetes", diagnosisCode:"E11.9", dischargeDate:"2026-06-16", daysSinceDischarge:14, numMedications:8,  numDiagnoses:4, numPriorAdmissions:0, diabetesFlag:true,  copdFlag:false, chfFlag:false },
  P010: { id:"P010", name:"Meena Agarwal",       age:62, diagnosis:"PostSurg", diagnosisCode:"Z96.9", dischargeDate:"2026-06-19", daysSinceDischarge:11, numMedications:7,  numDiagnoses:4, numPriorAdmissions:0, diabetesFlag:false, copdFlag:false, chfFlag:false },
  P011: { id:"P011", name:"Rajesh Kumar",        age:55, diagnosis:"COPD",     diagnosisCode:"J44.1", dischargeDate:"2026-06-14", daysSinceDischarge:16, numMedications:9,  numDiagnoses:5, numPriorAdmissions:1, diabetesFlag:false, copdFlag:true,  chfFlag:false },
  P012: { id:"P012", name:"Deepa Menon",         age:67, diagnosis:"CHF",      diagnosisCode:"I50.0", dischargeDate:"2026-06-11", daysSinceDischarge:19, numMedications:11, numDiagnoses:7, numPriorAdmissions:2, diabetesFlag:false, copdFlag:false, chfFlag:true  },
  P013: { id:"P013", name:"Suresh Nambiar",      age:70, diagnosis:"Diabetes", diagnosisCode:"E11.9", dischargeDate:"2026-06-17", daysSinceDischarge:13, numMedications:9,  numDiagnoses:5, numPriorAdmissions:1, diabetesFlag:true,  copdFlag:false, chfFlag:false },
  P014: { id:"P014", name:"Geetha Subramanian",  age:63, diagnosis:"PostSurg", diagnosisCode:"Z96.9", dischargeDate:"2026-06-12", daysSinceDischarge:18, numMedications:6,  numDiagnoses:4, numPriorAdmissions:0, diabetesFlag:false, copdFlag:false, chfFlag:false },
  P015: { id:"P015", name:"Harish Bose",         age:56, diagnosis:"COPD",     diagnosisCode:"J44.1", dischargeDate:"2026-06-09", daysSinceDischarge:21, numMedications:8,  numDiagnoses:5, numPriorAdmissions:0, diabetesFlag:false, copdFlag:true,  chfFlag:false },
  P016: { id:"P016", name:"Ananya Singh",        age:48, diagnosis:"Diabetes", diagnosisCode:"E11.9", dischargeDate:"2026-06-20", daysSinceDischarge:10, numMedications:7,  numDiagnoses:4, numPriorAdmissions:0, diabetesFlag:true,  copdFlag:false, chfFlag:false },
  P017: { id:"P017", name:"Prakash Reddy",       age:61, diagnosis:"CHF",      diagnosisCode:"I50.0", dischargeDate:"2026-06-08", daysSinceDischarge:22, numMedications:10, numDiagnoses:6, numPriorAdmissions:1, diabetesFlag:false, copdFlag:false, chfFlag:true  },
  P018: { id:"P018", name:"Usha Krishnamurthy",  age:69, diagnosis:"PostSurg", diagnosisCode:"Z96.9", dischargeDate:"2026-06-13", daysSinceDischarge:17, numMedications:8,  numDiagnoses:5, numPriorAdmissions:0, diabetesFlag:false, copdFlag:false, chfFlag:false },
  P019: { id:"P019", name:"Vijay Shankar",       age:52, diagnosis:"Diabetes", diagnosisCode:"E11.9", dischargeDate:"2026-06-06", daysSinceDischarge:24, numMedications:6,  numDiagnoses:3, numPriorAdmissions:0, diabetesFlag:true,  copdFlag:false, chfFlag:false },
  P020: { id:"P020", name:"Radha Balakrishnan",  age:57, diagnosis:"PostSurg", diagnosisCode:"Z96.9", dischargeDate:"2026-06-10", daysSinceDischarge:20, numMedications:5,  numDiagnoses:3, numPriorAdmissions:0, diabetesFlag:false, copdFlag:false, chfFlag:false },
  P021: { id:"P021", name:"Naresh Choudhary",    age:44, diagnosis:"Diabetes", diagnosisCode:"E11.9", dischargeDate:"2026-06-04", daysSinceDischarge:26, numMedications:7,  numDiagnoses:3, numPriorAdmissions:0, diabetesFlag:true,  copdFlag:false, chfFlag:false },
  P022: { id:"P022", name:"Sarala Iyer",         age:60, diagnosis:"COPD",     diagnosisCode:"J44.1", dischargeDate:"2026-06-07", daysSinceDischarge:23, numMedications:9,  numDiagnoses:5, numPriorAdmissions:1, diabetesFlag:false, copdFlag:true,  chfFlag:false },
  P023: { id:"P023", name:"Dinesh Nair",         age:49, diagnosis:"PostSurg", diagnosisCode:"Z96.9", dischargeDate:"2026-06-02", daysSinceDischarge:28, numMedications:6,  numDiagnoses:3, numPriorAdmissions:0, diabetesFlag:false, copdFlag:false, chfFlag:false },
  P024: { id:"P024", name:"Padma Venkatesh",     age:65, diagnosis:"CHF",      diagnosisCode:"I50.0", dischargeDate:"2026-06-05", daysSinceDischarge:25, numMedications:10, numDiagnoses:6, numPriorAdmissions:1, diabetesFlag:false, copdFlag:false, chfFlag:true  },
  P025: { id:"P025", name:"Ramesh Joshi",        age:53, diagnosis:"Diabetes", diagnosisCode:"E11.9", dischargeDate:"2026-06-03", daysSinceDischarge:27, numMedications:8,  numDiagnoses:4, numPriorAdmissions:0, diabetesFlag:true,  copdFlag:false, chfFlag:false },
}

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

function _fallbackVitals(diag: string, tier: RiskTier, n = 48) {
  const baseSpo2 = tier === "CRITICAL" ? 89 : tier === "HIGH" ? 93 : 96
  const baseHrv  = tier === "CRITICAL" ? 14 : tier === "HIGH" ? 24 : 38
  const baseHr   = diag === "CHF" ? 88 : 78
  const baseBioz = diag === "CHF" ? 405 : 420
  const baseRr   = diag === "COPD" ? 21 : 16
  const baseCough = diag === "COPD" ? 2 : 0.2

  return Array.from({ length: n }, (_, i) => ({
    timestamp: new Date(Date.now() - (n - i) * 30 * 60 * 1000).toISOString(),
    minuteOffset: i * 30,
    spo2: baseSpo2 + (_rand() - 0.5) * 2,
    hrEcg: baseHr + (_rand() - 0.5) * 6,
    hrPpg: baseHr + (_rand() - 0.5) * 6,
    hrvSdnn: Math.max(5, baseHrv + (_rand() - 0.5) * 5),
    biozOhms: baseBioz + (_rand() - 0.5) * 8 + i * (tier === "CRITICAL" ? 0.1 : 0),
    rrImu: baseRr + (_rand() - 0.5) * 2,
    coughCount: Math.max(0, Math.round(baseCough * (_rand() * 3))),
    afibFlag: tier === "CRITICAL" && _rand() < 0.2 ? 1 : 0,
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
      lastUpdated: new Date(Date.now() - Math.floor(_rand() * 10) * 60000).toISOString(),
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
