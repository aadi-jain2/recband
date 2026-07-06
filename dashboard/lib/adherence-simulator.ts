/**
 * RecoverPath — Adherence Simulator
 * Generates realistic medication adherence state per patient.
 * HIGH tier: 90-95%, MEDIUM: 70-85%, LOW: 40-65%
 */

import type {
  AdherenceTier, MedicationSchedule, AdherenceLog,
  DailyAdherenceSummary, PatientAdherenceState,
} from "./adherence-types"

// ── Medication templates per diagnosis ───────────────────────────────────────
const MED_TEMPLATES: Record<string, MedicationSchedule[]> = {
  CHF: [
    { med_name: "Furosemide",    dosage: "40mg",  frequency: "once_daily",  times: ["08:00"],          is_critical: true,  category: "diuretic",    start_date: "" },
    { med_name: "Metoprolol",    dosage: "25mg",  frequency: "twice_daily", times: ["08:00","20:00"],   is_critical: true,  category: "beta_blocker",start_date: "" },
    { med_name: "Lisinopril",    dosage: "10mg",  frequency: "once_daily",  times: ["08:00"],          is_critical: false, category: "ace_inhibitor",start_date: "" },
    { med_name: "Spironolactone",dosage: "25mg",  frequency: "once_daily",  times: ["12:00"],          is_critical: false, category: "diuretic",    start_date: "" },
  ],
  COPD: [
    { med_name: "Tiotropium",    dosage: "18mcg", frequency: "once_daily",  times: ["08:00"],          is_critical: true,  category: "inhaler",     start_date: "" },
    { med_name: "Salbutamol",    dosage: "2puffs",frequency: "as_needed",   times: ["08:00","20:00"],   is_critical: true,  category: "inhaler",     start_date: "" },
    { med_name: "Prednisolone",  dosage: "5mg",   frequency: "once_daily",  times: ["08:00"],          is_critical: false, category: "other",       start_date: "" },
    { med_name: "Azithromycin",  dosage: "250mg", frequency: "once_daily",  times: ["12:00"],          is_critical: false, category: "other",       start_date: "" },
  ],
  Diabetes: [
    { med_name: "Metformin",     dosage: "500mg", frequency: "twice_daily", times: ["08:00","20:00"],   is_critical: false, category: "other",       start_date: "" },
    { med_name: "Glipizide",     dosage: "5mg",   frequency: "once_daily",  times: ["08:00"],          is_critical: true,  category: "other",       start_date: "" },
    { med_name: "Insulin Glargine",dosage:"10U",  frequency: "once_daily",  times: ["22:00"],          is_critical: true,  category: "other",       start_date: "" },
    { med_name: "Aspirin",       dosage: "75mg",  frequency: "once_daily",  times: ["08:00"],          is_critical: false, category: "other",       start_date: "" },
  ],
  PostSurg: [
    { med_name: "Warfarin",      dosage: "5mg",   frequency: "once_daily",  times: ["18:00"],          is_critical: true,  category: "anticoagulant",start_date: "" },
    { med_name: "Amoxicillin",   dosage: "500mg", frequency: "three_times_daily",times:["08:00","14:00","20:00"],is_critical:false,category:"other",start_date:"" },
    { med_name: "Paracetamol",   dosage: "500mg", frequency: "twice_daily", times: ["08:00","20:00"],   is_critical: false, category: "other",       start_date: "" },
    { med_name: "Omeprazole",    dosage: "20mg",  frequency: "once_daily",  times: ["08:00"],          is_critical: false, category: "other",       start_date: "" },
  ],
}

// Adherence tier assignment: matches social/risk profile
const ADHERENCE_TIERS: Record<string, AdherenceTier> = {
  P001:"MEDIUM", P002:"LOW",    P003:"MEDIUM", P004:"LOW",    P005:"MEDIUM",
  P006:"HIGH",   P007:"HIGH",   P008:"LOW",    P009:"HIGH",   P010:"HIGH",
  P011:"MEDIUM", P012:"MEDIUM", P013:"MEDIUM", P014:"HIGH",   P015:"MEDIUM",
  P016:"HIGH",   P017:"LOW",    P018:"HIGH",   P019:"HIGH",   P020:"HIGH",
  P021:"MEDIUM", P022:"MEDIUM", P023:"HIGH",   P024:"MEDIUM", P025:"HIGH",
}

const TIER_RATES: Record<AdherenceTier, [number, number]> = {
  HIGH:   [0.90, 0.96],
  MEDIUM: [0.70, 0.86],
  LOW:    [0.40, 0.66],
}

function seededRand(seed: number, i: number): number {
  let x = Math.sin(seed * 1000 + i) * 10000
  return x - Math.floor(x)
}

function getDates7d(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return d.toISOString().slice(0, 10)
  })
}

export function buildAdherenceState(
  patientId: string,
  diagnosis: string,
  dischargeDate: string,
): PatientAdherenceState {
  const tier = ADHERENCE_TIERS[patientId] ?? "MEDIUM"
  const [rLow, rHigh] = TIER_RATES[tier]
  const meds = (MED_TEMPLATES[diagnosis] ?? MED_TEMPLATES["PostSurg"]).map(m => ({
    ...m,
    start_date: dischargeDate,
  }))
  const dates = getDates7d()
  const seed = patientId.charCodeAt(1) * 31 + patientId.charCodeAt(3)

  const logs: AdherenceLog[] = []
  const dailySummaries: DailyAdherenceSummary[] = []
  let criticalMissedStreak = 0
  let lastCriticalMissed: string | null = null
  let streakRunning = false

  for (let di = 0; di < dates.length; di++) {
    const date = dates[di]
    let scheduled = 0, taken = 0, missed = 0
    const rate = rLow + seededRand(seed, di * 100) * (rHigh - rLow)

    for (const med of meds) {
      for (let ti = 0; ti < med.times.length; ti++) {
        scheduled++
        const roll = seededRand(seed, di * 200 + ti * 13 + med.med_name.length)
        const isTaken = roll < rate
        if (!isTaken) {
          missed++
          if (med.is_critical) {
            if (streakRunning) {
              criticalMissedStreak++
            } else {
              streakRunning = true
              criticalMissedStreak = 1
            }
            lastCriticalMissed = date
          }
        } else {
          taken++
          if (med.is_critical && isTaken) streakRunning = false
        }

        logs.push({
          patient_id: patientId,
          med_name: med.med_name,
          scheduled_time: `${date}T${med.times[ti]}:00`,
          taken: isTaken,
          taken_time: isTaken ? `${date}T${med.times[ti]}:${String(Math.floor(seededRand(seed, di + ti) * 20)).padStart(2,"0")}:00` : null,
          method: isTaken ? (roll > 0.9 ? "caregiver_report" : "app_confirm") : "missed",
          date,
        })
      }
    }
    dailySummaries.push({ date, scheduled, taken, missed, pct: scheduled > 0 ? taken / scheduled : 1 })
  }

  const totalScheduled = dailySummaries.reduce((s, d) => s + d.scheduled, 0)
  const totalTaken = dailySummaries.reduce((s, d) => s + d.taken, 0)

  // Today's summary (last date)
  const today = dailySummaries[dailySummaries.length - 1]
  const now = new Date()
  const currentHour = now.getHours()

  let pendingToday = 0
  let takenToday = 0
  let missedToday = 0
  const todayLogs = logs.filter(l => l.date === dates[dates.length - 1])
  for (const med of meds) {
    for (const t of med.times) {
      const [h] = t.split(":").map(Number)
      const log = todayLogs.find(l => l.med_name === med.med_name && l.scheduled_time.includes(t))
      if (h > currentHour) pendingToday++
      else if (log?.taken) takenToday++
      else missedToday++
    }
  }

  return {
    patient_id: patientId,
    adherence_tier: tier,
    medications: meds,
    logs_7d: logs,
    daily_summary_7d: dailySummaries,
    overall_pct_7d: totalScheduled > 0 ? totalTaken / totalScheduled : 1,
    critical_missed_streak: criticalMissedStreak,
    last_critical_missed: lastCriticalMissed,
    today_summary: { scheduled: today.scheduled, taken: takenToday, pending: pendingToday, missed: missedToday },
  }
}

// Build for all 25 patients — lazy singleton
let _cache: Record<string, PatientAdherenceState> | null = null

export function getAllAdherence(
  registry: Record<string, { id: string; diagnosis: string; dischargeDate: string }>
): Record<string, PatientAdherenceState> {
  if (_cache) return _cache
  _cache = {}
  for (const [id, reg] of Object.entries(registry)) {
    _cache[id] = buildAdherenceState(id, reg.diagnosis, reg.dischargeDate)
  }
  return _cache
}
