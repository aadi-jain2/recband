"use client"
/**
 * RecoverPath — Firebase-first data hooks
 *
 * All risk scores, vitals, and alerts are read from Firebase Realtime DB
 * (written by src/simulator.py every 30s via the real ML model).
 *
 * Fallback: when Firebase is unavailable or unconfigured, the hooks
 * return a static in-memory snapshot built from PATIENT_REGISTRY so
 * the dashboard stays functional without Python/Firebase running.
 */

import { useState, useEffect, useCallback, useRef } from "react"
import type { Patient, Alert, VitalReading } from "./types"
import {
  PATIENT_REGISTRY,
  PATIENT_IDS,
  buildFallbackPatients,
  buildFallbackAlerts,
} from "./mock-data"

// ── Firebase availability check ───────────────────────────────────────────────
// Firebase is available when all env vars are set AND not just placeholders
const FIREBASE_URL   = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ?? ""
const FIREBASE_KEY   = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? ""
const FIREBASE_LIVE  =
  FIREBASE_URL.startsWith("https://") &&
  !FIREBASE_URL.includes("recoverpath-demo") &&
  FIREBASE_KEY !== "demo-key" &&
  FIREBASE_KEY.length > 10

// ── Firebase import (lazy, client-side only) ──────────────────────────────────
type DbRef  = import("firebase/database").DatabaseReference
type Unsubscribe = () => void

let _db: import("firebase/database").Database | null = null
async function getDb() {
  if (_db) return _db
  if (!FIREBASE_LIVE) return null
  try {
    const { getDatabase }   = await import("firebase/database")
    const { default: app }  = await import("./firebase")
    _db = getDatabase(app)
    return _db
  } catch {
    return null
  }
}

async function listenRef(
  path: string,
  cb: (val: unknown) => void,
): Promise<Unsubscribe> {
  const db = await getDb()
  if (!db) return () => {}
  const { ref, onValue } = await import("firebase/database")
  const r = ref(db, path)
  const unsub = onValue(r, snap => cb(snap.val()))
  return () => unsub()
}

// ── Shape Firebase risk_assessment + latest_reading → Patient ─────────────────
function mergeFirebaseData(
  id: string,
  ra: Record<string, unknown> | null,
  lr: Record<string, unknown> | null,
  hist: Record<string, unknown> | null,
): Patient | null {
  const reg = PATIENT_REGISTRY[id]
  if (!reg || !ra) return null

  // Firebase stores readings as { "2026-06-30T22-03-00Z": {...}, ... }
  // Keys are chronologically sortable strings — sort by key, then parse real timestamp
  const vitals: VitalReading[] = hist
    ? Object.entries(hist)
        .sort(([a], [b]) => a.localeCompare(b))   // lexical sort = chronological for our key format
        .slice(-1440)                               // last 1440 points = 24h @ 1/min
        .map(([_key, entry], i) => {
          const e = entry as Record<string, unknown>
          // Real timestamp stored in object takes priority over key
          const rawTs = String(e.timestamp ?? _key.replace(/T(\d{2})-(\d{2})-(\d{2})Z/, "T$1:$2:$3Z"))
          return {
            timestamp:    rawTs,
            minuteOffset: i,
            spo2:         Number(e.spo2 ?? 95),
            hrEcg:        Number(e.hr_ecg ?? 80),
            hrPpg:        Number(e.hr_ecg ?? 80),
            hrvSdnn:      Number(e.hrv_sdnn ?? 35),
            biozOhms:     Number(e.bioz_ohms ?? 420),
            rrImu:        Number(e.rr_imu ?? 16),
            coughCount:   Number(e.cough_sum ?? 0),
            afibFlag:     Number(e.afib_pct ?? 0) > 0.1 ? 1 : 0,
          } satisfies VitalReading
        })
    : []

  const tier  = String(ra.risk_tier ?? "LOW") as Patient["riskTier"]
  const score = Number(ra.risk_score ?? 0)
  const alerts = Array.isArray(ra.triggered_alerts)
    ? (ra.triggered_alerts as string[])
    : ["All vitals within acceptable range"]

  return {
    id: reg.id,
    name: reg.name,
    age: reg.age,
    diagnosis: reg.diagnosis,
    diagnosisCode: reg.diagnosisCode,
    dischargeDate: reg.dischargeDate,
    daysSinceDischarge: Number(ra.days_since_discharge ?? reg.daysSinceDischarge),
    riskScore: score,
    riskTier: tier,
    riskProbability: Number(ra.risk_probability ?? score / 100),
    anomalyScores: {
      cardiac:     Number((ra.anomaly_scores as Record<string,unknown>)?.cardiac     ?? 0),
      respiratory: Number((ra.anomaly_scores as Record<string,unknown>)?.respiratory ?? 0),
      fluid:       Number((ra.anomaly_scores as Record<string,unknown>)?.fluid       ?? 0),
      activity:    Number((ra.anomaly_scores as Record<string,unknown>)?.activity    ?? 0),
    },
    triggeredAlerts:  alerts,
    recommendedAction: String(ra.recommended_action ?? "Continue routine monitoring"),
    topRiskFeatures:   Array.isArray(ra.top_risk_features) ? (ra.top_risk_features as string[]) : [],
    lastUpdated:      String(ra.timestamp ?? new Date().toISOString()),
    flaggedForFollowUp: tier === "CRITICAL",
    careCoordinatorNotes: "",
    vitals,
    age_num:             reg.age,
    numMedications:      reg.numMedications,
    numDiagnoses:        reg.numDiagnoses,
    diabetesFlag:        reg.diabetesFlag,
    copdFlag:            reg.copdFlag,
    chfFlag:             reg.chfFlag,
    numPriorAdmissions:  reg.numPriorAdmissions,
    // Data source from latest_reading — "esp32_live" or "simulator"
    dataSource: (String(lr?.source ?? "simulator")) as Patient["dataSource"],
    compositeRisk: ra.composite_risk_score != null ? {
      composite_score:       Number(ra.composite_risk_score),
      clinical_score:        Number(ra.clinical_score        ?? score),
      behavioral_score:      Number(ra.behavioral_score      ?? 0),
      social_score:          Number(ra.social_score          ?? 0),
      clinical_pct:          Number(ra.clinical_pct          ?? 0.55),
      behavioral_pct:        Number(ra.behavioral_pct        ?? 0.30),
      social_pct:            Number(ra.social_pct            ?? 0.15),
      explanation:           String(ra.explanation           ?? ""),
      flagged_by_nonclinical: Boolean(ra.flagged_by_nonclinical),
    } : undefined,
  }
}

// ── All patients ──────────────────────────────────────────────────────────────
export function usePatients() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading]   = useState(true)
  const [source, setSource]     = useState<"firebase" | "fallback">("fallback")
  const unsubsRef               = useRef<Unsubscribe[]>([])

  useEffect(() => {
    if (!FIREBASE_LIVE) {
      // Fallback: static snapshot
      const fallback = buildFallbackPatients()
      setPatients(fallback)
      setLoading(false)
      setSource("fallback")

      // Fallback: drift scores every 60s with real wall-clock timestamp
      const ticker = setInterval(() => {
        setPatients(prev =>
          prev.map(p => ({
            ...p,
            riskScore: Math.min(100, Math.max(0,
              p.riskScore + (Math.random() - 0.48) * 2
            )),
            lastUpdated: new Date().toISOString(),  // real wall-clock time
          })).sort((a, b) => b.riskScore - a.riskScore)
        )
      }, 60_000)
      return () => clearInterval(ticker)
    }

    // Firebase mode: listen to each patient's risk_assessment
    const patientMap = new Map<string, Patient>()
    let resolved = 0

    PATIENT_IDS.forEach(id => {
      listenRef(`patients/${id}/risk_assessment`, ra => {
        listenRef(`patients/${id}/latest_reading`, lr => {
          const patient = mergeFirebaseData(id, ra as Record<string, unknown>, lr as Record<string, unknown>, null)
          if (patient) {
            patientMap.set(id, patient)
            setPatients(Array.from(patientMap.values()).sort((a, b) => b.riskScore - a.riskScore))
          }
          resolved++
          if (resolved >= PATIENT_IDS.length) setLoading(false)
        }).then(u => unsubsRef.current.push(u))
      }).then(u => unsubsRef.current.push(u))
    })

    setSource("firebase")
    return () => {
      unsubsRef.current.forEach(u => u())
      unsubsRef.current = []
    }
  }, [])

  return { patients, loading, source }
}

// ── Single patient ────────────────────────────────────────────────────────────
export function usePatient(id: string) {
  const [patient, setPatient] = useState<Patient | null>(null)
  const [loading, setLoading] = useState(true)
  const unsubsRef             = useRef<Unsubscribe[]>([])

  useEffect(() => {
    setLoading(true)

    if (!FIREBASE_LIVE) {
      // Build initial snapshot
      const all     = buildFallbackPatients()
      const initial = all.find(x => x.id === id) ?? null
      setPatient(initial)
      setLoading(false)

      if (!initial) return

      // Every 60s: append a new drift-based reading (sliding 2h window).
      // This simulates a real sensor polling at 1-minute cadence.
      const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
      const ticker = setInterval(() => {
        setPatient(prev => {
          if (!prev) return prev
          const last = prev.vitals[prev.vitals.length - 1]
          if (!last) return prev

          // Tiny random walk — realistic sensor noise
          const newReading = {
            timestamp:   new Date().toISOString(),
            minuteOffset: last.minuteOffset + 1,
            spo2:       clamp(last.spo2      + (Math.random() - 0.5) * 0.6,  70, 100),
            hrEcg:      clamp(last.hrEcg     + (Math.random() - 0.5) * 2.5,  40, 200),
            hrPpg:      clamp(last.hrPpg     + (Math.random() - 0.5) * 2.5,  40, 200),
            hrvSdnn:    clamp(last.hrvSdnn   + (Math.random() - 0.5) * 1.5,   5, 100),
            biozOhms:   clamp(last.biozOhms  + (Math.random() - 0.5) * 2,   200, 600),
            rrImu:      clamp(last.rrImu     + (Math.random() - 0.5) * 0.8,   6,  40),
            coughCount: Math.max(0, Math.round(last.coughCount + (Math.random() - 0.75))),
            afibFlag:   Math.random() < 0.04 ? 1 : 0,
          }

          // Slide window: keep newest 120 readings
          const newVitals = [...prev.vitals.slice(-119), newReading]

          // Drift the composite score slightly
          const newRisk = clamp(prev.riskScore + (Math.random() - 0.5) * 1.2, 0, 100)

          return {
            ...prev,
            vitals:      newVitals,
            riskScore:   Math.round(newRisk * 10) / 10,
            lastUpdated: newReading.timestamp,
          }
        })
      }, 60_000)

      return () => clearInterval(ticker)
    }

    // Firebase: listen to all three sub-trees in parallel
    const parts: { ra: Record<string,unknown> | null; lr: Record<string,unknown> | null; hist: Record<string,unknown> | null } = {
      ra: null, lr: null, hist: null,
    }
    const merge = () => {
      const p = mergeFirebaseData(id, parts.ra, parts.lr, parts.hist)
      setPatient(p)
      if (p) setLoading(false)
    }

    listenRef(`patients/${id}/risk_assessment`, v => { parts.ra   = v as Record<string,unknown>; merge() }).then(u => unsubsRef.current.push(u))
    listenRef(`patients/${id}/latest_reading`,  v => { parts.lr   = v as Record<string,unknown>; merge() }).then(u => unsubsRef.current.push(u))
    listenRef(`patients/${id}/readings`,        v => { parts.hist = v as Record<string,unknown>; merge() }).then(u => unsubsRef.current.push(u))

    return () => {
      unsubsRef.current.forEach(u => u())
      unsubsRef.current = []
    }
  }, [id])

  return { patient, loading }
}

// ── Alerts (derived from CRITICAL/HIGH patients) ──────────────────────────────
export function useAlerts() {
  const { patients } = usePatients()
  const [alerts, setAlerts]   = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const seenRef               = useRef<Set<string>>(new Set())

  const acknowledge = useCallback((alertId: string) => {
    setAlerts(prev =>
      prev.map(a => a.id === alertId
        ? { ...a, acknowledged: true, acknowledgedAt: new Date().toISOString() }
        : a
      )
    )
  }, [])

  useEffect(() => {
    if (patients.length === 0) return

    const highRisk = patients.filter(
      p => p.riskTier === "CRITICAL" || p.riskTier === "HIGH"
    )

    const generated: Alert[] = highRisk.flatMap(p =>
      p.triggeredAlerts.slice(0, 2).map((msg, i): Alert => {
        const alertId = `${p.id}-${i}`
        return {
          id: alertId,
          patientId: p.id,
          patientName: p.name,
          riskTier: p.riskTier,
          message: msg,
          timestamp: i === 0
            ? p.lastUpdated
            : new Date(new Date(p.lastUpdated).getTime() - 15 * 60000).toISOString(),
          acknowledged: seenRef.current.has(alertId) ? true : false,
        }
      })
    )

    // Preserve acknowledgements across re-renders
    setAlerts(prev => {
      const ackedIds = new Set(prev.filter(a => a.acknowledged).map(a => a.id))
      return generated
        .map(a => ({ ...a, acknowledged: ackedIds.has(a.id) || a.acknowledged }))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    })
    setLoading(false)
  }, [patients])

  const wrappedAcknowledge = useCallback((alertId: string) => {
    seenRef.current.add(alertId)
    acknowledge(alertId)

    // Write acknowledgement to Firebase if live
    if (FIREBASE_LIVE) {
      getDb().then(db => {
        if (!db) return
        import("firebase/database").then(({ ref, set }) => {
          set(ref(db, `alerts/${alertId}/acknowledged`), true)
          set(ref(db, `alerts/${alertId}/acknowledgedAt`), new Date().toISOString())
        })
      })
    }
  }, [acknowledge])

  return { alerts, loading, acknowledge: wrappedAcknowledge }
}

// ── Population stats (derived from patients list) ─────────────────────────────
export function useStats() {
  const { patients } = usePatients()

  if (patients.length === 0) {
    return {
      totalPatients: 25,
      criticalCount: 3,
      highCount: 5,
      mediumCount: 10,
      lowCount: 7,
      avgRiskScore: 42,
      unacknowledgedAlerts: 0,
    }
  }

  return {
    totalPatients: patients.length,
    criticalCount: patients.filter(p => p.riskTier === "CRITICAL").length,
    highCount:     patients.filter(p => p.riskTier === "HIGH").length,
    mediumCount:   patients.filter(p => p.riskTier === "MEDIUM").length,
    lowCount:      patients.filter(p => p.riskTier === "LOW").length,
    avgRiskScore:  Math.round(patients.reduce((s, p) => s + p.riskScore, 0) / patients.length * 10) / 10,
    unacknowledgedAlerts: patients.filter(p => p.riskTier === "CRITICAL" || p.riskTier === "HIGH").length,
  }
}

// ── Data source indicator (for UI banner) ─────────────────────────────────────
export function useDataSource(): "firebase" | "fallback" {
  return FIREBASE_LIVE ? "firebase" : "fallback"
}
